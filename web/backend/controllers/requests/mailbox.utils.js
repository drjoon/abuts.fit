const UNKNOWN_ANCHOR_KEY = "__UNKNOWN_BUSINESS_ANCHOR__";

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
  const direct = String(requestDocLike?.businessAnchorId || "").trim();
  if (direct) return direct;

  const fromRequestor = String(
    requestDocLike?.requestor?.businessAnchorId || "",
  ).trim();
  if (fromRequestor) return fromRequestor;

  return UNKNOWN_ANCHOR_KEY;
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

  // 현재 '세척.패킹' 및 '포장.발송' 단계에 있는 의뢰들의 할당된 우편함 조회
  const activeRequestsRaw = await Request.find({
    manufacturerStage: { $in: ["세척.패킹", "포장.발송"] },
    mailboxAddress: { $ne: null },
  })
    .select("_id mailboxAddress businessAnchorId requestor")
    .populate("requestor", "businessAnchorId")
    .lean();

  const activeRequests = excludeRequestMongoId
    ? activeRequestsRaw.filter(
        (row) => String(row?._id || "").trim() !== excludeRequestMongoId,
      )
    : activeRequestsRaw;

  // 같은 의뢰자가 이미 할당받은 우편함이 있는지 확인
  // 단, "다른 의뢰자와 섞인 우편함"은 재사용하지 않는다.
  if (requestorOrgId) {
    const requestorOrgIdStr = requestorOrgId.toString();

    const orgSetByAddress = new Map();
    for (const r of activeRequests) {
      const address = String(r?.mailboxAddress || "").trim();
      if (!address) continue;
      const orgKey = resolveOccupantAnchorKey(r);
      if (!orgSetByAddress.has(address)) {
        orgSetByAddress.set(address, new Set());
      }
      orgSetByAddress.get(address).add(orgKey);
    }

    const reusableAddress = Array.from(orgSetByAddress.entries())
      .filter(
        ([_, orgSet]) => orgSet.size === 1 && orgSet.has(requestorOrgIdStr),
      )
      .map(([address]) => address)
      .sort()[0];

    if (reusableAddress) {
      return reusableAddress;
    }
  }

  // 사용 중인 우편함 주소 목록
  const usedAddresses = new Set(activeRequests.map((r) => r.mailboxAddress));

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
}) {
  const { default: Request } = await import("../../models/request.model.js");

  const requestorOrgIdStr = String(requestorOrgId || "").trim();
  const currentMailboxAddressStr = String(currentMailboxAddress || "").trim();

  if (!requestorOrgIdStr) {
    return currentMailboxAddressStr || null;
  }

  if (!currentMailboxAddressStr) {
    return allocateVirtualMailboxAddress(requestorOrgIdStr, {
      excludeRequestMongoId: requestMongoId,
    });
  }

  const mailboxOccupants = await Request.find({
    manufacturerStage: { $in: ["세척.패킹", "포장.발송"] },
    mailboxAddress: currentMailboxAddressStr,
    ...(requestMongoId ? { _id: { $ne: requestMongoId } } : {}),
  })
    .select("requestId businessAnchorId requestor manufacturerStage")
    .populate("requestor", "businessAnchorId")
    .lean();

  const hasDifferentBusinessOccupant = mailboxOccupants.some((row) => {
    const occupantBusinessAnchorKey = resolveOccupantAnchorKey(row);
    return occupantBusinessAnchorKey !== requestorOrgIdStr;
  });

  if (!hasDifferentBusinessOccupant) {
    return currentMailboxAddressStr;
  }

  return allocateVirtualMailboxAddress(requestorOrgIdStr, {
    excludeRequestMongoId: requestMongoId,
  });
}
