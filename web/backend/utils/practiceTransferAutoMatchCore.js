// related files:
// - web/backend/utils/practiceTransferAutoMatch.js
// - web/backend/tests/unit/practiceTransferAutoMatchPriority.test.js
//
// 자동매칭 우선창·필터 순수 헬퍼 (Mongo 모델 import 없음).
// - 2026-09-24: 할증 labFeeMultiplier — 협력=수행 기공소, 하청·어벗츠 자체=원청(어벗츠).
// - 2026-09-24: 수가표 — 협력=수행 기공소, 하청·어벗츠 자체=원청. 정산만 어벗츠 경유.
// - 2026-09-23: 치과 직접 지정=협력(assigneeKind=cooperation, 0%). 어벗츠 지정 후 풀/클레임=하청(subcontract, 5%).
// - 2026-09-23: 신규 PTX 계약 상대=어벗츠기공소(원청). 픽커 파트너=assignee.
// - 2026-08-21: 하청 전환은 어벗츠기공소(원청)만 — 타 기공소 지정 의뢰는 canOpenSubcontract=false.

/** 어벗츠기공소(internalLab) 원청 우선 수락 창. 하청 전환 시 즉시 종료. */
export const PRACTICE_TRANSFER_AUTO_MATCH_PRIORITY_MS = 30 * 60 * 1000;

/**
 * @deprecated 자동매칭 3시간 강제 클레임 만료는 폐기.
 * 작업 기한은 치과가 지정한 도착일·소통으로 처리. 값은 레거시 문서 호환용.
 */
export const PRACTICE_TRANSFER_AUTO_MATCH_CLAIM_HOURS = 3;

/** @deprecated 치과 표시는 어벗츠기공소. 레거시 matchingMode=auto 문서 호환. */
export const AUTO_MATCH_LAB_DISPLAY_NAME = "자동 매칭";
export const AUTO_MATCH_PRACTICE_DISPLAY_NAME = "자동 매칭";
export const ABUTS_LAB_DISPLAY_NAME = "어벗츠기공소";
/** 하청 수행 시 치과에 보이는 처리처 라벨(하청 기공소 실명 비공개) */
export const CERTIFIED_PARTNER_LAB_DISPLAY_NAME = "인증 협력 기공소";
/** 하청 풀·하청 수행 시 협력 기공소에 노출하는 치과 표시명 */
export const SUBCONTRACT_PRACTICE_DISPLAY_NAME = "비공개";

/** 치과 픽커 직접 지정 → 협력(수수료 0%). */
export const ASSIGNEE_KIND_COOPERATION = "cooperation";
/** 어벗츠기공사업부 지정 후 하청 풀/클레임 → 하청(수수료 subcontractFeeRate). */
export const ASSIGNEE_KIND_SUBCONTRACT = "subcontract";
/** 치과 UI: 「어벗츠 · {파트너}」 */
export const ABUTS_COOPERATION_LABEL_PREFIX = "어벗츠";

const stripPartnerLabDisplayPrefixes = (raw) => {
  let name = String(raw || "").trim();
  name = name.replace(/\s·\s인증 협력 기공소에서 처리$/, "").trim();
  for (let i = 0; i < 6; i += 1) {
    const next = name
      .replace(/^어벗츠\s*협력\s*기공소\s*·\s*/, "")
      .replace(/^어벗츠\s*협력\s*·\s*/, "")
      .replace(/^어벗츠\s*·\s*/, "")
      .replace(/^어벗츠기공소\s*·\s*/, "")
      .trim();
    if (next === name) break;
    name = next;
  }
  return name;
};

export const formatAbutsCooperationLabLabel = (partnerName) => {
  const partner = stripPartnerLabDisplayPrefixes(partnerName);
  if (
    !partner ||
    partner === ABUTS_LAB_DISPLAY_NAME ||
    partner === "어벗츠 기공소"
  ) {
    return ABUTS_LAB_DISPLAY_NAME;
  }
  return `${ABUTS_COOPERATION_LABEL_PREFIX} · ${partner}`;
};

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

const toMs = (value) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
};

export const isValidLabAnchorIdString = (id) =>
  OBJECT_ID_RE.test(String(id || "").trim());

export const normalizeLabAnchorIdList = (raw) => {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const id = String(item || "").trim();
    if (!id || !isValidLabAnchorIdString(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
};

/** 기공의뢰 수신 API 허용 role (requestor lab + 어벗츠기공소). */
export const isPracticeTransferLabReceiverRole = (role) => {
  const r = String(role || "").trim();
  return r === "requestor" || r === "internalLab" || r === "admin";
};

export const isInternalLabBusinessType = (anchorOrType) => {
  const type =
    typeof anchorOrType === "string"
      ? anchorOrType
      : anchorOrType?.businessType;
  return String(type || "").trim() === "internalLab";
};

export const isAutoMatchMode = (transfer) =>
  String(transfer?.matchingMode || "").trim() === "auto";

export const isAutoMatchCompleted = (transfer) =>
  Boolean(transfer?.autoMatch?.completedAt);

export const getAssigneeLabAnchorId = (transfer) =>
  String(transfer?.assigneeLabAnchorId || "").trim();

export const getPrimeLabAnchorId = (transfer) =>
  String(transfer?.targetLabAnchorId || "").trim();

/** 수행 기공소. 하청이 있으면 assignee, 없으면 원청(또는 레거시 클레임 target). */
export const resolvePerformingLabAnchorId = (transfer) =>
  getAssigneeLabAnchorId(transfer) || getPrimeLabAnchorId(transfer);

export const isPracticeTransferSubcontracted = (transfer) => {
  const prime = getPrimeLabAnchorId(transfer);
  const assignee = getAssigneeLabAnchorId(transfer);
  return Boolean(prime && assignee && prime !== assignee);
};

/**
 * 수행 종류. assignee 없으면 null.
 * 레거시(assigneeKind 없음): autoMatch.claimedAt 있으면 하청, 없으면 협력(치과 사전 지정).
 */
export const resolveAssigneeKind = (transfer) => {
  if (!isPracticeTransferSubcontracted(transfer)) return null;
  const raw = String(transfer?.assigneeKind || "").trim();
  if (
    raw === ASSIGNEE_KIND_COOPERATION ||
    raw === ASSIGNEE_KIND_SUBCONTRACT
  ) {
    return raw;
  }
  if (transfer?.autoMatch?.claimedAt) return ASSIGNEE_KIND_SUBCONTRACT;
  return ASSIGNEE_KIND_COOPERATION;
};

export const isCooperationAssignee = (transfer) =>
  resolveAssigneeKind(transfer) === ASSIGNEE_KIND_COOPERATION;

export const isSubcontractAssignee = (transfer) =>
  resolveAssigneeKind(transfer) === ASSIGNEE_KIND_SUBCONTRACT;

/** 하청 수수료(5%) 적용 대상. 협력(0%)·자체 수행은 false. */
export const isSubcontractFeeApplicable = (transfer) =>
  isSubcontractAssignee(transfer);

/** 치과에 수행 기공소 실명을 가릴지(하청 풀·하청만). 협력은 공개. */
export const shouldHideAssigneeFromPractice = (transfer) =>
  isSubcontractPoolOpen(transfer) || isSubcontractAssignee(transfer);

/** 수행 기공소가 배정·미완료면 활성. 원청만 있고 미클레임이면 공개 풀. */
export const isAutoMatchClaimActive = (transfer, _now = Date.now()) => {
  if (!isAutoMatchMode(transfer)) return false;
  if (isAutoMatchCompleted(transfer)) return false;
  if (getAssigneeLabAnchorId(transfer)) return true;
  return Boolean(transfer?.autoMatch?.claimedAt);
};

export const isAutoMatchOpenPool = (transfer, now = Date.now()) => {
  if (!isAutoMatchMode(transfer)) return false;
  // deleted|레거시 canceled = 치과 의뢰 삭제
  const status = String(transfer?.status || "").trim().toLowerCase();
  if (status === "deleted" || status === "canceled" || status === "cancelled") {
    return false;
  }
  if (isAutoMatchCompleted(transfer)) return false;
  if (!isAutoMatchClaimActive(transfer, now)) return true;
  return false;
};

export const getAutoMatchPriorityLabAnchorIds = (transfer) =>
  normalizeLabAnchorIdList(transfer?.autoMatch?.priorityLabAnchorIds);

export const isAutoMatchPriorityLabAnchorId = (transfer, labAnchorId) => {
  const labId = String(labAnchorId || "").trim();
  if (!labId) return false;
  return getAutoMatchPriorityLabAnchorIds(transfer).includes(labId);
};

/**
 * 어벗츠 우선창 활성: open pool + priorityUntil > now + priority labs 존재.
 */
export const isAutoMatchPriorityActive = (transfer, now = Date.now()) => {
  if (!isAutoMatchOpenPool(transfer, now)) return false;
  const priorityIds = getAutoMatchPriorityLabAnchorIds(transfer);
  if (!priorityIds.length) return false;
  const untilMs = toMs(transfer?.autoMatch?.priorityUntil);
  if (!Number.isFinite(untilMs)) return false;
  const nowMs = toMs(now);
  if (!Number.isFinite(nowMs)) return false;
  return untilMs > nowMs;
};

/** 어벗츠 원청이 연 인증 기공소 하청 풀(지정 의뢰). */
export const isSubcontractPoolOpen = (transfer) => {
  const status = String(transfer?.status || "").trim().toLowerCase();
  if (status === "deleted" || status === "canceled" || status === "cancelled") {
    return false;
  }
  if (isAutoMatchCompleted(transfer)) return false;
  if (getAssigneeLabAnchorId(transfer)) return false;
  return Boolean(transfer?.autoMatch?.subcontractPoolOpen);
};

/** 하청 풀·하청 수행 청구는 원청(어벗츠) 수가표를 쓴다. */
export const isSubcontractFeeScheduleContext = (transfer) =>
  isPracticeTransferSubcontracted(transfer) ||
  isSubcontractPoolOpen(transfer);

/** 원청이 어벗츠기공소(기공사업부)인지. 하청 전환·신규 정산 SSOT는 이 원청만. */
export const isAbutsPrimePracticeTransfer = (transfer) => {
  const name = String(transfer?.targetLabName || "").trim();
  if (name === ABUTS_LAB_DISPLAY_NAME) return true;
  // 레거시 matchingMode=auto — 원청은 항상 어벗츠
  return isAutoMatchMode(transfer);
};

/**
 * 수가표 앵커.
 * 협력: 수행 기공소(치과↔지정 기공소와 동일). 정산만 어벗츠 경유.
 * 하청·하청풀·어벗츠 자체: 원청(어벗츠).
 * 레거시 외부 직접 지정: 수행 기공소.
 * SSOT: `.cursor/rules/ptx-cooperation-fee-ssot.mdc` · 루트 `rules.md` §2.
 * 주의: `isPracticeTransferSubcontracted`(prime≠assignee)만으로 협력에 원청 수가를 쓰지 말 것.
 */
export const resolveFeeScheduleLabAnchorId = (transfer) => {
  if (isCooperationAssignee(transfer)) {
    return (
      getAssigneeLabAnchorId(transfer) || resolvePerformingLabAnchorId(transfer)
    );
  }
  if (
    isAbutsPrimePracticeTransfer(transfer) ||
    isSubcontractFeeScheduleContext(transfer)
  ) {
    return (
      getPrimeLabAnchorId(transfer) || resolvePerformingLabAnchorId(transfer)
    );
  }
  return resolvePerformingLabAnchorId(transfer);
};

/**
 * 기공수가 할증(labFeeMultiplier) 앵커.
 * 협력(assigneeKind=cooperation): 수행 기공소(assignee).
 * 하청·어벗츠 자체 수행·하청풀: 원청(어벗츠).
 * 레거시 외부 직접 지정: 수행 기공소.
 * SSOT: `.cursor/rules/ptx-cooperation-fee-ssot.mdc` (수가표 앵커와 동일 분기).
 */
export const resolveLabFeeMultiplierLabAnchorId = (transfer) => {
  if (isCooperationAssignee(transfer)) {
    return (
      getAssigneeLabAnchorId(transfer) || resolvePerformingLabAnchorId(transfer)
    );
  }
  if (
    isAbutsPrimePracticeTransfer(transfer) ||
    isSubcontractAssignee(transfer) ||
    isSubcontractFeeScheduleContext(transfer)
  ) {
    return (
      getPrimeLabAnchorId(transfer) || resolvePerformingLabAnchorId(transfer)
    );
  }
  return resolvePerformingLabAnchorId(transfer);
};

/**
 * 정산 당사자.
 * 어벗츠 원청: gross→prime, 하청 매입→assignee.
 * 레거시 외부 직접 지정: gross→performing(target), 매입 없음.
 */
export const resolvePracticeTransferSettlementParties = (transfer) => {
  const primeId = getPrimeLabAnchorId(transfer);
  const assigneeId = getAssigneeLabAnchorId(transfer);
  const performingId = resolvePerformingLabAnchorId(transfer);
  const abutsPrime = isAbutsPrimePracticeTransfer(transfer);
  const subcontracted = isPracticeTransferSubcontracted(transfer);
  const grossOwnerId = abutsPrime
    ? primeId || performingId
    : performingId || primeId;
  const purchasePayeeId =
    abutsPrime &&
    subcontracted &&
    assigneeId &&
    assigneeId !== String(primeId || "").trim()
      ? assigneeId
      : null;
  return {
    primeId,
    assigneeId,
    performingId,
    abutsPrime,
    subcontracted: Boolean(purchasePayeeId),
    grossOwnerId: String(grossOwnerId || "").trim() || null,
    purchasePayeeId,
  };
};

/** 작업완료·거부 등: 수행 기공소(assignee 우선)만. 원청 팀은 prime도 허용할 때 별도 검사. */
export const isLabPerformingOnTransfer = (transfer, labAnchorId) => {
  const labId = String(labAnchorId || "").trim();
  if (!labId) return false;
  return resolvePerformingLabAnchorId(transfer) === labId;
};

/** 어벗츠 원청 팀만 하청 상대(치과·수행 기공소) 식별 정보를 본다. 협력은 공개. */
export const isSubcontractIdentityHiddenFromViewer = (
  transfer,
  viewerLabAnchorId = null,
) => {
  if (!isSubcontractPoolOpen(transfer) && !isSubcontractAssignee(transfer)) {
    return false;
  }
  const viewerId = String(viewerLabAnchorId || "").trim();
  const primeId = getPrimeLabAnchorId(transfer);
  // 원청(어벗츠)만 양쪽 실명 확인. 하청 수행 기공소·그 외는 비공개.
  if (viewerId && primeId && viewerId === primeId) return false;
  return true;
};

export const SUBCONTRACT_DIRECT_BLOCKED_REASON = "subcontract_direct_blocked";
/** @deprecated 신규는 계약 상대=어벗츠 고정·파트너=assignee. 레거시 API 호환용. */
export const SUBCONTRACT_DIRECT_BLOCKED_MESSAGE =
  "계약·결제는 어벗츠기공소입니다. 협력 기공소를 다시 선택해 주세요.";

/**
 * 하청 수행(assignee ≠ 원청) 이력이 있는 기공소 ID. 해당 치과는 지정 의뢰 불가.
 * 단, 과거 direct 지정 이력이 있는 기공소(기존 거래처)는 제외.
 */
export const collectSubcontractDirectBlockedLabIds = (
  docs = [],
  { directTargetDocs = [] } = {},
) => {
  const subcontractAssignees = new Set();
  const list = Array.isArray(docs) ? docs : [];
  for (const doc of list) {
    const assignee = String(doc?.assigneeLabAnchorId || "").trim();
    const prime = String(doc?.targetLabAnchorId || "").trim();
    if (!assignee || !prime || assignee === prime) continue;
    subcontractAssignees.add(assignee);
  }

  const priorDirectLabs = new Set();
  const directList = Array.isArray(directTargetDocs) ? directTargetDocs : [];
  for (const doc of directList) {
    if (String(doc?.matchingMode || "").trim() !== "direct") continue;
    const labId = String(doc?.targetLabAnchorId || "").trim();
    if (labId) priorDirectLabs.add(labId);
  }

  return [...subcontractAssignees].filter((id) => !priorDirectLabs.has(id));
};

export const isLabIdBlockedAsDirectPracticeTarget = (
  labAnchorId,
  blockedIds = [],
) => {
  const labId = String(labAnchorId || "").trim();
  if (!labId) return false;
  return (Array.isArray(blockedIds) ? blockedIds : []).some(
    (id) => String(id || "").trim() === labId,
  );
};

/** 어벗츠 원청 팀원이 아직 하청을 안 연 지정 의뢰를 하청 풀로 열 수 있는지. */
export const canOpenPracticeTransferSubcontract = (
  transfer,
  viewerLabAnchorId,
  _now = Date.now(),
) => {
  const viewerId = String(viewerLabAnchorId || "").trim();
  const primeId = getPrimeLabAnchorId(transfer);
  if (!viewerId || !primeId || viewerId !== primeId) return false;
  if (!isAbutsPrimePracticeTransfer(transfer)) return false;
  const status = String(transfer?.status || "").trim().toLowerCase();
  if (status === "deleted" || status === "canceled" || status === "cancelled") {
    return false;
  }
  if (getAssigneeLabAnchorId(transfer)) return false;
  if (isPracticeTransferSubcontracted(transfer)) return false;
  if (isSubcontractPoolOpen(transfer)) return false;
  return true;
};

/** 우선창 중이면 priority lab만 공개 풀 노출·클레임 가능. */
export const canAccessAutoMatchOpenPool = (
  transfer,
  labAnchorId,
  now = Date.now(),
) => {
  if (!isAutoMatchPriorityActive(transfer, now)) return true;
  return isAutoMatchPriorityLabAnchorId(transfer, labAnchorId);
};

export const buildAutoMatchPriorityUntil = (
  now = new Date(),
  ms = PRACTICE_TRANSFER_AUTO_MATCH_PRIORITY_MS,
) => {
  const base = now instanceof Date ? now : new Date(now);
  const baseMs = base.getTime();
  if (!Number.isFinite(baseMs)) return null;
  const duration = Number(ms);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return new Date(baseMs + duration);
};

/**
 * 적격 스냅샷 중 internalLab → priority 필드.
 * 없으면 우선창 없음(전원 즉시 노출).
 * priorityLabAnchorIds는 string[] 반환(호출부에서 ObjectId 변환).
 */
export const buildAutoMatchPriorityFieldsCore = ({
  eligibleLabAnchorIds = [],
  priorityLabAnchorIds = [],
  now = new Date(),
} = {}) => {
  const eligible = new Set(normalizeLabAnchorIdList(eligibleLabAnchorIds));
  const priority = normalizeLabAnchorIdList(priorityLabAnchorIds).filter((id) =>
    eligible.has(id),
  );
  if (!priority.length) {
    return {
      priorityUntil: null,
      priorityLabAnchorIds: undefined,
    };
  }
  return {
    priorityUntil: buildAutoMatchPriorityUntil(now),
    priorityLabAnchorIds: priority,
  };
};

/** Mongo $and 절: 우선창이 끝났거나 내가 priority lab. labOid는 ObjectId 또는 string. */
export const buildAutoMatchPriorityAccessClause = (labOid, now = new Date()) => {
  const nowDate = now instanceof Date ? now : new Date(now);
  return {
    $or: [
      { "autoMatch.priorityUntil": null },
      { "autoMatch.priorityUntil": { $exists: false } },
      { "autoMatch.priorityUntil": { $lte: nowDate } },
      { "autoMatch.priorityLabAnchorIds": labOid },
      { "autoMatch.priorityLabAnchorIds": { $exists: false } },
      { "autoMatch.priorityLabAnchorIds": { $size: 0 } },
    ],
  };
};

export const toAutoMatchApiFieldsCore = (transfer, viewerLabAnchorId = null) => {
  const matchingMode = isAutoMatchMode(transfer) ? "auto" : "direct";
  const auto =
    transfer?.autoMatch && typeof transfer.autoMatch === "object"
      ? transfer.autoMatch
      : {};
  const now = Date.now();
  const completed = isAutoMatchCompleted(transfer);
  const claimActive = isAutoMatchClaimActive(transfer, now);
  const openPool =
    isAutoMatchOpenPool(transfer, now) || isSubcontractPoolOpen(transfer);
  const priorityActive = isAutoMatchPriorityActive(transfer, now);
  const priorityUntil = auto?.priorityUntil
    ? new Date(auto.priorityUntil).toISOString()
    : null;
  const targetId = String(transfer?.targetLabAnchorId || "").trim();
  const assigneeId = getAssigneeLabAnchorId(transfer);
  const viewerId = String(viewerLabAnchorId || "").trim();
  const mine = Boolean(
    viewerId &&
      ((assigneeId && viewerId === assigneeId) ||
        (targetId && viewerId === targetId)),
  );
  const declinedIds = Array.isArray(auto?.declinedLabAnchorIds)
    ? auto.declinedLabAnchorIds
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    : [];
  const declinedByMe = Boolean(viewerId && declinedIds.includes(viewerId));
  const priorityLabForMe = Boolean(
    viewerId && isAutoMatchPriorityLabAnchorId(transfer, viewerId),
  );
  const canOpenSubcontract = canOpenPracticeTransferSubcontract(
    transfer,
    viewerId,
    now,
  );
  const revealAssignee =
    Boolean(viewerId) &&
    !isSubcontractIdentityHiddenFromViewer(transfer, viewerId);

  return {
    matchingMode,
    ...(revealAssignee
      ? {
          assigneeLabAnchorId: assigneeId || null,
          assigneeLabName: String(transfer?.assigneeLabName || "").trim(),
        }
      : {}),
    autoMatch: {
      claimedAt: auto?.claimedAt || null,
      deadlineAt: null,
      claimHours: null,
      completedAt: auto?.completedAt || null,
      completedBy: auto?.completedBy ? String(auto.completedBy) : null,
      releaseCount: Number(auto?.releaseCount || 0),
      openPool,
      claimActive,
      completed,
      mine,
      declinedByMe,
      remainingMs: null,
      priorityUntil,
      priorityActive,
      priorityLabForMe,
      canOpenSubcontract,
      subcontracted: isSubcontractAssignee(transfer),
      assigneeKind: resolveAssigneeKind(transfer),
    },
  };
};
