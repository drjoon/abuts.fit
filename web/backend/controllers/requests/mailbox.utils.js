const UNKNOWN_ANCHOR_KEY = "__UNKNOWN_BUSINESS_ANCHOR__";
const ACTIVE_MAILBOX_STAGES = ["세척.패킹", "포장.발송", "추적관리"];

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

  // 현재 '세척.패킹'/'포장.발송'/'추적관리' 단계 중
  // 실제 포장.발송 대상(=R&D 샘플 제외) 의뢰의 우편함만 점유로 본다.
  // SSOT: source/price.rule 이 manufacturer_sample 이면 배송 비대상.
  let activeRequestsQuery = Request.find({
    manufacturerStage: { $in: ACTIVE_MAILBOX_STAGES },
    mailboxAddress: { $ne: null },
    requestCategory: REQUEST_CATEGORY.ORDER,
  })
    .select("_id mailboxAddress businessAnchorId requestor")
    .populate("requestor", "businessAnchorId")
    .lean();

  if (session) {
    activeRequestsQuery = activeRequestsQuery.session(session);
  }

  const activeRequestsRaw = await activeRequestsQuery;

  const activeRequests = excludeRequestMongoId
    ? activeRequestsRaw.filter(
        (row) => String(row?._id || "").trim() !== excludeRequestMongoId,
      )
    : activeRequestsRaw;

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

  let activeRequestsQuery = Request.find({
    manufacturerStage: { $in: ACTIVE_MAILBOX_STAGES },
    mailboxAddress: { $ne: null },
    requestCategory: REQUEST_CATEGORY.ORDER,
    ...(requestMongoId ? { _id: { $ne: requestMongoId } } : {}),
  })
    .select("_id mailboxAddress businessAnchorId requestor")
    .populate("requestor", "businessAnchorId")
    .lean();

  if (session) {
    activeRequestsQuery = activeRequestsQuery.session(session);
  }

  const activeRequests = await activeRequestsQuery;

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

  if (!currentMailboxAddressStr) {
    return allocateVirtualMailboxAddress(requestorOrgIdStr, {
      excludeRequestMongoId: requestMongoId,
      session,
    });
  }

  let mailboxOccupantsQuery = Request.find({
    manufacturerStage: { $in: ACTIVE_MAILBOX_STAGES },
    requestCategory: REQUEST_CATEGORY.ORDER,
    $expr: {
      $eq: [
        {
          $toUpper: {
            $trim: {
              input: { $ifNull: ["$mailboxAddress", ""] },
            },
          },
        },
        currentMailboxAddressStr,
      ],
    },
    ...(requestMongoId ? { _id: { $ne: requestMongoId } } : {}),
  })
    .select("requestId businessAnchorId requestor manufacturerStage")
    .populate("requestor", "businessAnchorId")
    .lean();

  if (session) {
    mailboxOccupantsQuery = mailboxOccupantsQuery.session(session);
  }

  const mailboxOccupants = await mailboxOccupantsQuery;

  const hasDifferentBusinessOccupant = mailboxOccupants.some((row) => {
    const occupantBusinessAnchorKey = resolveOccupantAnchorKey(row);
    if (!occupantBusinessAnchorKey) return false;
    if (occupantBusinessAnchorKey === UNKNOWN_ANCHOR_KEY) return false;
    return occupantBusinessAnchorKey !== requestorOrgIdStr;
  });

  if (!hasDifferentBusinessOccupant) {
    return currentMailboxAddressStr;
  }

  return allocateVirtualMailboxAddress(requestorOrgIdStr, {
    excludeRequestMongoId: requestMongoId,
    session,
  });
}
