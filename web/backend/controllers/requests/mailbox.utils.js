const UNKNOWN_ANCHOR_KEY = "__UNKNOWN_BUSINESS_ANCHOR__";
const ACTIVE_MAILBOX_OCCUPY_STAGES = ["세척.패킹", "포장.발송"];
const TRACKING_ACTIVE_EXCLUDED_CODES = ["picked_up", "completed", "canceled"];
const MAILBOX_ALLOC_LOCK_LEASE_MS = 15_000;
const MAILBOX_ALLOC_LOCK_HEARTBEAT_MS = 5_000;
const MAILBOX_ALLOC_LOCK_MAX_ATTEMPTS = 40;
const MAILBOX_ALLOC_LOCK_RETRY_MS = 50;
// 미커밋 동시 할당 손잡이. TTL 슬롯보다 짧게 잡아 재승인 시 첫 빈칸 정책을 지킨다.
const MAILBOX_SLOT_HANDOFF_MAX_AGE_MS = 60_000;

// related files (request category SSOT):
// - web/backend/models/request.model.js
// - web/backend/controllers/requests/common.requests.controller.js
const REQUEST_CATEGORY = {
  ORDER: "order",
  RND_SAMPLE: "rnd_sample",
  COPIED_SAMPLE: "copied_sample",
};

const normalizeMailboxAddress = (raw) =>
  String(raw || "")
    .trim()
    .toUpperCase();



const normalizeBusinessAnchorId = (raw, depth = 0) => {
  if (raw == null) return "";
  if (depth > 2) return "";

  if (typeof raw === "string" || typeof raw === "number") {
    return String(raw).trim();
  }

  if (typeof raw === "object") {
    const stringified = String(raw || "").trim();
    if (stringified && stringified !== "[object Object]") {
      return stringified;
    }

    const nestedCandidates = [raw?._id, raw?.id, raw?.businessAnchorId];
    for (const candidate of nestedCandidates) {
      const normalized = normalizeBusinessAnchorId(candidate, depth + 1);
      if (normalized) return normalized;
    }
  }

  return "";
};

export const isManufacturerSampleRequest = (requestLike) => {
  if (!requestLike || typeof requestLike !== "object") return false;
  const category = String(requestLike?.requestCategory || "").trim();
  return (
    category === REQUEST_CATEGORY.RND_SAMPLE ||
    category === REQUEST_CATEGORY.COPIED_SAMPLE
  );
};

/**
 * 우편함 점유 의뢰에서 사업자 anchor를 추출한다.
 *
 * SSOT 우선순위:
 * 1) request.businessAnchorId
 * 2) request.requestor.businessAnchorId (populate 되었을 때)
 *
 * 둘 다 없으면 UNKNOWN 키를 반환한다.
 * - UNKNOWN을 명시적으로 세트에 넣어야,
 *   "실제 점유자는 있는데 anchor만 비어있는" 우편함을 재사용하는 사고를 막을 수 있다.
 */
const resolveOccupantAnchorKey = (requestDocLike) => {
  const direct = normalizeBusinessAnchorId(requestDocLike?.businessAnchorId);
  if (direct) return direct;

  const fromRequestor = normalizeBusinessAnchorId(
    requestDocLike?.requestor?.businessAnchorId,
  );
  if (fromRequestor) return fromRequestor;

  return UNKNOWN_ANCHOR_KEY;
};

// related files:
// - web/backend/controllers/cnc/machiningBridge.js
// - web/backend/controllers/ai/lotCapture.controller.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/requests/shipping.controller.js
// - web/backend/jobs/stageProgressionWorker.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/shipping/components/MailboxGrid.tsx
const buildMailboxOccupancyByAddress = (activeRequests = []) => {
  const occupancyByAddress = new Map();

  for (const r of activeRequests) {
    const address = normalizeMailboxAddress(r?.mailboxAddress);
    if (!address) continue;

    if (!occupancyByAddress.has(address)) {
      occupancyByAddress.set(address, {
        concreteOrgKeys: new Set(),
        unknownCount: 0,
      });
    }

    const row = occupancyByAddress.get(address);
    const orgKey = resolveOccupantAnchorKey(r);
    if (orgKey && orgKey !== UNKNOWN_ANCHOR_KEY) {
      row.concreteOrgKeys.add(orgKey);
    } else {
      row.unknownCount += 1;
    }
  }

  return occupancyByAddress;
};

const findReusableMailboxAddressForBusiness = ({
  activeRequests = [],
  requestorOrgId,
}) => {
  const requestorOrgIdStr = normalizeBusinessAnchorId(requestorOrgId);
  if (!requestorOrgIdStr) return "";

  const occupancyByAddress = buildMailboxOccupancyByAddress(activeRequests);

  return (
    Array.from(occupancyByAddress.entries())
      // UNKNOWN 점유는 혼입 판정에서 제외한다.
      // (같은 업체 박스에 anchor 누락 레코드가 섞여 있어도 재사용이 가능해야
      //  가공→세척.패킹 전환 시 불필요한 신규 박스 생성을 막을 수 있다.)
      .filter(([_, row]) =>
        row.concreteOrgKeys.size === 1 && row.concreteOrgKeys.has(requestorOrgIdStr),
      )
      .map(([address]) => address)
      .sort()[0] || ""
  );
};

const normalizeScopeFilter = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw;
};

const getTrackingStatusCode = (requestDocLike) => {
  const fromWorkflow = String(
    requestDocLike?.shippingWorkflow?.trackingStatusCode || "",
  ).trim();
  if (fromWorkflow) return fromWorkflow;
  return String(
    requestDocLike?.deliveryInfoRef?.tracking?.lastStatusCode || "",
  ).trim();
};

const isTrackingMailboxOccupyingRequest = (requestDocLike) => {
  const workflowCode = String(requestDocLike?.shippingWorkflow?.code || "")
    .trim()
    .toLowerCase();
  if (TRACKING_ACTIVE_EXCLUDED_CODES.includes(workflowCode)) return false;

  const deliveryInfo =
    requestDocLike?.deliveryInfoRef &&
    typeof requestDocLike.deliveryInfoRef === "object"
      ? requestDocLike.deliveryInfoRef
      : null;
  if (!deliveryInfo) return false;

  const trackingStatusCode = Number(getTrackingStatusCode(requestDocLike));
  const isCanceled =
    String(deliveryInfo?.tracking?.lastStatusText || "").trim() === "예약취소";
  const hasPickupReservation = Boolean(
    deliveryInfo?.trackingNumber ||
      deliveryInfo?.shippedAt ||
      deliveryInfo?.tracking?.lastStatusText,
  );

  return (
    hasPickupReservation &&
    !deliveryInfo?.deliveredAt &&
    !isCanceled &&
    (!Number.isFinite(trackingStatusCode) || trackingStatusCode < 11)
  );
};

const isMailboxOccupancyCandidate = (requestDocLike) => {
  const stage = String(requestDocLike?.manufacturerStage || "").trim();
  if (ACTIVE_MAILBOX_OCCUPY_STAGES.includes(stage)) return true;
  if (stage !== "추적관리") return false;
  return isTrackingMailboxOccupyingRequest(requestDocLike);
};

const buildActiveMailboxOccupancyFilter = ({
  requestCategory,
  scopeFilter = {},
  excludeRequestMongoId = "",
}) => {
  const base = {
    ...normalizeScopeFilter(scopeFilter),
    mailboxAddress: { $ne: null },
    requestCategory,
    manufacturerStage: {
      $in: [...ACTIVE_MAILBOX_OCCUPY_STAGES, "추적관리"],
    },
  };

  if (excludeRequestMongoId) {
    return {
      ...base,
      _id: { $ne: excludeRequestMongoId },
    };
  }

  return base;
};

const buildAllMailboxAddresses = () => {
  // 선반(Shelf)은 실제 운용 중인 A부터 I까지 9개를 사용한다.
  const shelfNames = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  // 선반 내 수직 위치(Row)는 1, 2, 3, 4 (위에서부터 1번. 사진의 2번째 줄이 1번, 맨 아랫줄이 4번)
  const shelfRows = ["1", "2", "3", "4"];
  // 플라스틱 박스(Bin) 내 열(Col)은 3개 (A, B, C)
  const binCols = ["A", "B", "C"];
  // 플라스틱 박스(Bin) 내 행(Row)은 4개 (1, 2, 3, 4)
  const binRows = ["1", "2", "3", "4"];

  const allAddresses = [];
  for (const shelf of shelfNames) {
    for (const sRow of shelfRows) {
      for (const bCol of binCols) {
        for (const bRow of binRows) {
          allAddresses.push(`${shelf}${sRow}${bCol}${bRow}`);
        }
      }
    }
  }
  return allAddresses;
};

const ALL_MAILBOX_ADDRESSES = buildAllMailboxAddresses();

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isAddressFreeOrOwnedByBusiness = ({
  address,
  occupancyByAddress,
  requestorOrgIdStr,
}) => {
  const normalized = normalizeMailboxAddress(address);
  if (!normalized) return false;
  const row = occupancyByAddress.get(normalized);
  if (!row) return true;
  if (row.concreteOrgKeys.size === 0) return true;
  return (
    row.concreteOrgKeys.size === 1 &&
    row.concreteOrgKeys.has(requestorOrgIdStr)
  );
};

async function loadActiveMailboxOccupancy({
  Request,
  scopeFilter = {},
  excludeRequestMongoId = "",
  session = null,
}) {
  let activeRequestsQuery = Request.find(
    buildActiveMailboxOccupancyFilter({
      requestCategory: REQUEST_CATEGORY.ORDER,
      scopeFilter,
      excludeRequestMongoId,
    }),
  )
    .select(
      // manufacturerStage 필수: isMailboxOccupancyCandidate가 stage로 점유 여부를 판정한다.
      // select 누락 시 점유가 가짜로 제외되어 서로 다른 업체가 A1A1 등 동일 우편함에 섞인다.
      "_id mailboxAddress businessAnchorId requestor manufacturerStage deliveryInfoRef shippingWorkflow.code shippingWorkflow.trackingStatusCode",
    )
    .populate("requestor", "businessAnchorId")
    .populate(
      "deliveryInfoRef",
      "trackingNumber shippedAt deliveredAt tracking.lastStatusCode tracking.lastStatusText",
    )
    .lean();

  if (session) {
    activeRequestsQuery = activeRequestsQuery.session(session);
  }

  const activeRequestsRaw = await activeRequestsQuery;
  return activeRequestsRaw.filter((row) => isMailboxOccupancyCandidate(row));
}

async function syncMailboxAnchorSlot({
  MailboxAnchorSlot,
  requestorOrgIdStr,
  mailboxAddress,
}) {
  const address = normalizeMailboxAddress(mailboxAddress);
  if (!requestorOrgIdStr || !address) return;

  await MailboxAnchorSlot.findOneAndUpdate(
    { businessAnchorId: requestorOrgIdStr },
    {
      $set: {
        mailboxAddress: address,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        businessAnchorId: requestorOrgIdStr,
      },
    },
    { upsert: true, new: true },
  );
}

async function readMailboxAnchorSlot({
  MailboxAnchorSlot,
  requestorOrgIdStr,
}) {
  if (!requestorOrgIdStr) return null;
  const slot = await MailboxAnchorSlot.findOne({
    businessAnchorId: requestorOrgIdStr,
  }).lean();
  if (!slot) return null;
  const address = normalizeMailboxAddress(slot.mailboxAddress);
  if (!address) return null;
  return { ...slot, mailboxAddress: address };
}

async function withMailboxAllocationLock(requestorOrgIdStr, task) {
  const { runWithJobLock } = await import("../../utils/distributedJobLock.js");
  const lockName = `mailbox-alloc:${requestorOrgIdStr}`;
  const ownerId = `mailbox-${process.pid}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  for (let attempt = 0; attempt < MAILBOX_ALLOC_LOCK_MAX_ATTEMPTS; attempt += 1) {
    const locked = await runWithJobLock({
      name: lockName,
      ownerId,
      leaseMs: MAILBOX_ALLOC_LOCK_LEASE_MS,
      heartbeatMs: MAILBOX_ALLOC_LOCK_HEARTBEAT_MS,
      task,
    });
    if (locked?.acquired) {
      return locked.result;
    }
    await sleep(MAILBOX_ALLOC_LOCK_RETRY_MS + Math.floor(Math.random() * 40));
  }

  throw new Error("우편함 할당 잠금을 획득하지 못했습니다. 잠시 후 다시 시도해주세요.");
}

async function resolveMailboxAddressUnderLock({
  Request,
  MailboxAnchorSlot,
  requestorOrgIdStr,
  excludeRequestMongoId = "",
  session = null,
  scopeFilter = {},
}) {
  // 커밋된 점유 뷰를 우선 읽는다.
  // (review-status 트랜잭션 스냅샷만 보면, 직전 병렬 배정이 아직 안 보여
  //  같은 업체에 빈 우편함을 중복 할당하는 레이스가 난다.)
  const committedActiveRequests = await loadActiveMailboxOccupancy({
    Request,
    scopeFilter,
    excludeRequestMongoId,
    session: null,
  });

  let activeRequests = committedActiveRequests;

  // 같은 트랜잭션 안에서 직전에 배정한 주소도 재사용할 수 있도록 session 뷰를 병합한다.
  if (session) {
    const sessionActiveRequests = await loadActiveMailboxOccupancy({
      Request,
      scopeFilter,
      excludeRequestMongoId,
      session,
    });
    const byId = new Map();
    for (const row of committedActiveRequests) {
      byId.set(String(row?._id || ""), row);
    }
    for (const row of sessionActiveRequests) {
      byId.set(String(row?._id || ""), row);
    }
    activeRequests = Array.from(byId.values());
  }

  const reusableAddress = findReusableMailboxAddressForBusiness({
    activeRequests,
    requestorOrgId: requestorOrgIdStr,
  });
  if (reusableAddress) {
    await syncMailboxAnchorSlot({
      MailboxAnchorSlot,
      requestorOrgIdStr,
      mailboxAddress: reusableAddress,
    });
    return reusableAddress;
  }

  const occupancyByAddress = buildMailboxOccupancyByAddress(activeRequests);

  // 아직 request 문서에 커밋되기 전인 동시 할당 손잡이(짧은 TTL 슬롯)
  const slot = await readMailboxAnchorSlot({
    MailboxAnchorSlot,
    requestorOrgIdStr,
  });
  const slotAgeMs = slot?.updatedAt
    ? Date.now() - new Date(slot.updatedAt).getTime()
    : Number.POSITIVE_INFINITY;
  if (
    slot?.mailboxAddress &&
    Number.isFinite(slotAgeMs) &&
    slotAgeMs >= 0 &&
    slotAgeMs <= MAILBOX_SLOT_HANDOFF_MAX_AGE_MS &&
    isAddressFreeOrOwnedByBusiness({
      address: slot.mailboxAddress,
      occupancyByAddress,
      requestorOrgIdStr,
    })
  ) {
    await syncMailboxAnchorSlot({
      MailboxAnchorSlot,
      requestorOrgIdStr,
      mailboxAddress: slot.mailboxAddress,
    });
    return slot.mailboxAddress;
  }

  const usedAddresses = new Set(
    Array.from(occupancyByAddress.keys()).filter(Boolean),
  );
  // 다른 업체의 미커밋 슬롯도 사용 중으로 본다.
  const foreignSlots = await MailboxAnchorSlot.find({
    businessAnchorId: { $ne: requestorOrgIdStr },
  })
    .select("mailboxAddress")
    .lean();
  for (const foreign of foreignSlots) {
    const address = normalizeMailboxAddress(foreign?.mailboxAddress);
    if (address) usedAddresses.add(address);
  }

  const availableAddress = ALL_MAILBOX_ADDRESSES.find(
    (addr) => !usedAddresses.has(addr),
  );

  if (!availableAddress) {
    throw new Error("할당 가능한 빈 우편함이 없습니다.");
  }

  await syncMailboxAnchorSlot({
    MailboxAnchorSlot,
    requestorOrgIdStr,
    mailboxAddress: availableAddress,
  });
  return availableAddress;
}

export async function allocateVirtualMailboxAddress(
  requestorOrgId,
  options = {},
) {
  const requestorOrgIdStr = normalizeBusinessAnchorId(requestorOrgId);
  if (!requestorOrgIdStr) {
    throw new Error("우편함 할당에 businessAnchorId가 필요합니다.");
  }

  const { default: Request } = await import("../../models/request.model.js");
  const { default: MailboxAnchorSlot } = await import(
    "../../models/mailboxAnchorSlot.model.js"
  );

  const excludeRequestMongoId = String(
    options?.excludeRequestMongoId || "",
  ).trim();
  const session = options?.session || null;
  const scopeFilter = normalizeScopeFilter(options?.scopeFilter);

  return withMailboxAllocationLock(requestorOrgIdStr, async () =>
    resolveMailboxAddressUnderLock({
      Request,
      MailboxAnchorSlot,
      requestorOrgIdStr,
      excludeRequestMongoId,
      session,
      scopeFilter,
    }),
  );
}

/**
 * 세척.패킹 진입 시 우편함 배정.
 * - 동일 businessAnchor의 활성 점유(세척.패킹/포장.발송/추적관리)가 있으면 그 주소를 재사용
 * - 없으면 첫 빈칸 할당
 * - 기존 request.mailboxAddress는 재사용 근거로 쓰지 않는다
 */
export async function assignMailboxForCleaningPackingEnter({
  request,
  requestorOrgId,
  session = null,
  scopeFilter = {},
}) {
  if (!request) return null;

  if (isManufacturerSampleRequest(request)) {
    request.mailboxAddress = null;
    return null;
  }

  request.mailboxAddress = null;
  try {
    const nextMailboxAddress = await ensureMailboxAddressForBusiness({
      requestMongoId: request._id,
      requestorOrgId,
      currentMailboxAddress: null,
      session,
      scopeFilter,
    });
    if (nextMailboxAddress) {
      request.mailboxAddress = nextMailboxAddress;
    }
    return nextMailboxAddress || null;
  } catch (err) {
    console.error("[MAILBOX_ALLOCATION_ERROR] cleaning-packing-enter", {
      requestId: request?.requestId || null,
      message: err?.message || String(err),
    });
    return null;
  }
}

export async function ensureMailboxAddressForBusiness({
  requestMongoId,
  requestorOrgId,
  currentMailboxAddress,
  session = null,
  scopeFilter = {},
}) {
  const { default: Request } = await import("../../models/request.model.js");
  const { default: MailboxAnchorSlot } = await import(
    "../../models/mailboxAnchorSlot.model.js"
  );

  let requestorOrgIdStr = normalizeBusinessAnchorId(requestorOrgId);
  const currentMailboxAddressStr = normalizeMailboxAddress(
    currentMailboxAddress,
  );

  if (!requestorOrgIdStr && requestMongoId) {
    let requestRowQuery = Request.findById(requestMongoId)
      .select("businessAnchorId requestor")
      .populate("requestor", "businessAnchorId")
      .lean();

    if (session) {
      requestRowQuery = requestRowQuery.session(session);
    }

    const requestRow = await requestRowQuery;

    const directAnchorId = normalizeBusinessAnchorId(requestRow?.businessAnchorId);
    const requestorAnchorId = normalizeBusinessAnchorId(
      requestRow?.requestor?.businessAnchorId,
    );

    requestorOrgIdStr = directAnchorId || requestorAnchorId;
  }

  if (!requestorOrgIdStr) {
    return currentMailboxAddressStr || null;
  }

  const normalizedScopeFilter = normalizeScopeFilter(scopeFilter);

  return withMailboxAllocationLock(requestorOrgIdStr, async () =>
    resolveMailboxAddressUnderLock({
      Request,
      MailboxAnchorSlot,
      requestorOrgIdStr,
      excludeRequestMongoId: requestMongoId
        ? String(requestMongoId || "").trim()
        : "",
      session,
      scopeFilter: normalizedScopeFilter,
    }),
  );
}
