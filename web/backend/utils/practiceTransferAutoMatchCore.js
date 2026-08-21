// related files:
// - web/backend/utils/practiceTransferAutoMatch.js
// - web/backend/tests/unit/practiceTransferAutoMatchPriority.test.js
//
// 자동매칭 우선창·필터 순수 헬퍼 (Mongo 모델 import 없음).
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
/** 하청 수행 시 치과에 보이는 처리처 라벨(협력 기공소 실명 비공개) */
export const CERTIFIED_PARTNER_LAB_DISPLAY_NAME = "인증 협력 기공소";
/** 하청 풀·하청 수행 시 협력 기공소에 노출하는 치과 표시명 */
export const SUBCONTRACT_PRACTICE_DISPLAY_NAME = "비공개";

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

/** 수행 기공소가 배정·미완료면 활성. 원청만 있고 미클레임이면 공개 풀. */
export const isAutoMatchClaimActive = (transfer, _now = Date.now()) => {
  if (!isAutoMatchMode(transfer)) return false;
  if (isAutoMatchCompleted(transfer)) return false;
  if (getAssigneeLabAnchorId(transfer)) return true;
  return Boolean(transfer?.autoMatch?.claimedAt);
};

export const isAutoMatchOpenPool = (transfer, now = Date.now()) => {
  if (!isAutoMatchMode(transfer)) return false;
  if (String(transfer?.status || "").trim() === "canceled") return false;
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
  if (String(transfer?.status || "").trim() === "canceled") return false;
  if (isAutoMatchCompleted(transfer)) return false;
  if (getAssigneeLabAnchorId(transfer)) return false;
  return Boolean(transfer?.autoMatch?.subcontractPoolOpen);
};

/** 하청 풀·하청 수행 청구는 원청(어벗츠) 수가표를 쓴다. */
export const isSubcontractFeeScheduleContext = (transfer) =>
  isPracticeTransferSubcontracted(transfer) ||
  isSubcontractPoolOpen(transfer);

export const resolveFeeScheduleLabAnchorId = (transfer) => {
  if (isSubcontractFeeScheduleContext(transfer)) {
    return (
      getPrimeLabAnchorId(transfer) || resolvePerformingLabAnchorId(transfer)
    );
  }
  return resolvePerformingLabAnchorId(transfer);
};

/** 어벗츠 원청 팀만 하청 상대(치과·수행 기공소) 식별 정보를 본다. */
export const isSubcontractIdentityHiddenFromViewer = (
  transfer,
  viewerLabAnchorId = null,
) => {
  if (!isSubcontractPoolOpen(transfer) && !isPracticeTransferSubcontracted(transfer)) {
    return false;
  }
  const viewerId = String(viewerLabAnchorId || "").trim();
  const primeId = getPrimeLabAnchorId(transfer);
  return !(viewerId && primeId && viewerId === primeId);
};

export const SUBCONTRACT_DIRECT_BLOCKED_REASON = "subcontract_direct_blocked";
export const SUBCONTRACT_DIRECT_BLOCKED_MESSAGE =
  "어벗츠기공소를 선택해 주세요.";

/** 하청 수행(assignee ≠ 원청) 이력이 있는 기공소 ID. 해당 치과는 지정 의뢰 불가. */
export const collectSubcontractDirectBlockedLabIds = (docs = []) => {
  const blocked = new Set();
  const list = Array.isArray(docs) ? docs : [];
  for (const doc of list) {
    const assignee = String(doc?.assigneeLabAnchorId || "").trim();
    const prime = String(doc?.targetLabAnchorId || "").trim();
    if (assignee && prime && assignee !== prime) blocked.add(assignee);
  }
  return [...blocked];
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

/** 원청이 어벗츠기공소(기공사업부)인지. 하청 전환은 이 원청만. */
export const isAbutsPrimePracticeTransfer = (transfer) => {
  const name = String(transfer?.targetLabName || "").trim();
  if (name === ABUTS_LAB_DISPLAY_NAME) return true;
  // 레거시 matchingMode=auto — 원청은 항상 어벗츠
  return isAutoMatchMode(transfer);
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
  if (String(transfer?.status || "").trim() === "canceled") return false;
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
      subcontracted: isPracticeTransferSubcontracted(transfer),
    },
  };
};
