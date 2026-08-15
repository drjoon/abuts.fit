// related files:
// - web/backend/utils/practiceTransferAutoMatch.js
// - web/backend/tests/unit/practiceTransferAutoMatchPriority.test.js
//
// 자동매칭 우선창·필터 순수 헬퍼 (Mongo 모델 import 없음).

/** 어벗츠기공소(internalLab) 자동매칭 우선 노출 창. */
export const PRACTICE_TRANSFER_AUTO_MATCH_PRIORITY_MS = 5 * 60 * 1000;

/**
 * @deprecated 자동매칭 3시간 강제 클레임 만료는 폐기.
 * 작업 기한은 치과가 지정한 도착일·소통으로 처리. 값은 레거시 문서 호환용.
 */
export const PRACTICE_TRANSFER_AUTO_MATCH_CLAIM_HOURS = 3;

export const AUTO_MATCH_LAB_DISPLAY_NAME = "자동 매칭";
export const AUTO_MATCH_PRACTICE_DISPLAY_NAME = "자동 매칭";

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

/** 수락 기공소가 배정·미완료면 활성. 시간 만료로 재공개하지 않음. */
export const isAutoMatchClaimActive = (transfer, _now = Date.now()) => {
  if (!isAutoMatchMode(transfer)) return false;
  if (isAutoMatchCompleted(transfer)) return false;
  return Boolean(String(transfer?.targetLabAnchorId || "").trim());
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
  const openPool = isAutoMatchOpenPool(transfer, now);
  const priorityActive = isAutoMatchPriorityActive(transfer, now);
  const priorityUntil = auto?.priorityUntil
    ? new Date(auto.priorityUntil).toISOString()
    : null;
  const targetId = String(transfer?.targetLabAnchorId || "").trim();
  const viewerId = String(viewerLabAnchorId || "").trim();
  const mine = Boolean(
    claimActive && viewerId && targetId && viewerId === targetId,
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

  return {
    matchingMode,
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
    },
  };
};
