const UNKNOWN_ANCHOR_KEY = "__UNKNOWN_BUSINESS_ANCHOR__";
const ACTIVE_MAILBOX_OCCUPY_STAGES = ["세척.패킹", "포장.발송"];
const TRACKING_ACTIVE_EXCLUDED_CODES = ["picked_up", "completed", "canceled"];

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
  const requestorOrgIdStr = String(requestorOrgId || "").trim();
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

export async function allocateVirtualMailboxAddress(
  requestorOrgId,
  options = {},
) {
  const { default: Request } = await import("../../models/request.model.js");

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

  const excludeRequestMongoId = String(
    options?.excludeRequestMongoId || "",
  ).trim();
  const session = options?.session || null;
  const scopeFilter = normalizeScopeFilter(options?.scopeFilter);

  // 현재 점유(active)는 세척.패킹/포장.발송 + 집하 전 추적관리만 포함한다.
  // - 집하 이후(picked_up/completed/canceled, trackingStatusCode>=11)는 점유에서 제외
  // - 제조사 조직 스코프를 받은 경우 해당 범위 내에서만 점유를 계산
  let activeRequestsQuery = Request.find(
    buildActiveMailboxOccupancyFilter({
      requestCategory: REQUEST_CATEGORY.ORDER,
      scopeFilter,
    }),
  )
    .select(
      // manufacturerStage 필수: isMailboxOccupancyCandidate가 stage로 점유 여부를 판정한다.
      // select 누락 시 점유가 전부 제외되어 서로 다른 업체가 A1A1 등 동일 우편함에 섞인다.
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

  const activeRequests = (excludeRequestMongoId
    ? activeRequestsRaw.filter(
        (row) => String(row?._id || "").trim() !== excludeRequestMongoId,
      )
    : activeRequestsRaw
  ).filter((row) => isMailboxOccupancyCandidate(row));

  // 같은 의뢰자가 이미 할당받은 우편함이 있는지 확인
  // 단, "다른 의뢰자와 섞인 우편함"은 재사용하지 않는다.
  const reusableAddress = findReusableMailboxAddressForBusiness({
    activeRequests,
    requestorOrgId,
  });
  if (reusableAddress) {
    return reusableAddress;
  }

  // 사용 중인 우편함 주소 목록
  const usedAddresses = new Set(
    Array.from(buildMailboxOccupancyByAddress(activeRequests).keys()).filter(Boolean),
  );

  // 사용 중이지 않은 첫 번째 주소 찾기
  const availableAddress = allAddresses.find(
    (addr) => !usedAddresses.has(addr),
  );

  if (!availableAddress) {
    throw new Error("할당 가능한 빈 우편함이 없습니다.");
  }

  return availableAddress;
}

export async function ensureMailboxAddressForBusiness({
  requestMongoId,
  requestorOrgId,
  currentMailboxAddress,
  session = null,
  scopeFilter = {},
}) {
  const { default: Request } = await import("../../models/request.model.js");

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

  let activeRequestsQuery = Request.find(
    buildActiveMailboxOccupancyFilter({
      requestCategory: REQUEST_CATEGORY.ORDER,
      scopeFilter: normalizedScopeFilter,
      excludeRequestMongoId: requestMongoId
        ? String(requestMongoId || "").trim()
        : "",
    }),
  )
    .select(
      // manufacturerStage 필수: isMailboxOccupancyCandidate가 stage로 점유 여부를 판정한다.
      // select 누락 시 점유가 전부 제외되어 서로 다른 업체가 A1A1 등 동일 우편함에 섞인다.
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
  const activeRequests = activeRequestsRaw.filter((row) =>
    isMailboxOccupancyCandidate(row),
  );

  const reusableAddress = findReusableMailboxAddressForBusiness({
    activeRequests,
    requestorOrgId: requestorOrgIdStr,
  });

  // 핵심 정책: 같은 businessAnchor의 활성 의뢰가 이미 쓰는 우편함이 있으면
  // 현재 의뢰의 mailboxAddress가 달라도 그 주소로 수렴시킨다.
  // (세척.패킹 -> 포장.발송 전환 중 기존 서로 다른 주소를 유지해 박스가 분할되는 현상 방지)
  if (reusableAddress) {
    return reusableAddress;
  }

  // 중요: 현재 의뢰에 남아 있는 mailboxAddress는 재사용 근거가 아니다.
  // - 롤백/재승인 시 과거 주소가 남아 있으면 빈칸 우선 원칙(첫 번째 빈칸)을 위반하게 된다.
  // - 동일 businessAnchor의 다른 활성 점유가 있을 때만 reusableAddress로 수렴한다.
  // 따라서 reusableAddress가 없으면 현재값 존재 여부와 무관하게 첫 번째 빈칸을 새로 할당한다.
  return allocateVirtualMailboxAddress(requestorOrgIdStr, {
    excludeRequestMongoId: requestMongoId,
    session,
    scopeFilter: normalizedScopeFilter,
  });
}
