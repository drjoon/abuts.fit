// related files:
// - web/backend/models/request.model.js
// - web/backend/models/systemSettings.model.js
// - web/backend/controllers/requests/designClaim.controller.js
// - web/backend/controllers/devops/designDeadline.controller.js
// - web/backend/rules.md
import { Types } from "mongoose";

/** 클레임 후 타 디자이너에게 "작업중" 표시하는 시간 */
export const DESIGN_CLAIM_ANNOUNCE_MS = 60 * 1000;

/** 마감 임박 경고 (남은 시간 ≤ 이 값) */
export const DESIGN_CLAIM_WARN_MS = 30 * 60 * 1000;

export const DESIGN_CLAIM_HOURS_DEFAULT = 3;
export const DESIGN_CLAIM_HOURS_MIN = 1;
export const DESIGN_CLAIM_HOURS_MAX = 24;

export const clampDesignClaimHours = (raw) => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DESIGN_CLAIM_HOURS_DEFAULT;
  return Math.min(
    DESIGN_CLAIM_HOURS_MAX,
    Math.max(DESIGN_CLAIM_HOURS_MIN, Math.round(n)),
  );
};

export const isDesignClaimActive = (designClaim, now = Date.now()) => {
  if (!designClaim?.claimedBy) return false;
  const deadlineMs = designClaim?.deadlineAt
    ? new Date(designClaim.deadlineAt).getTime()
    : NaN;
  if (!Number.isFinite(deadlineMs)) return false;
  return deadlineMs > now;
};

export const isDesignClaimAnnounceWindow = (designClaim, now = Date.now()) => {
  if (!isDesignClaimActive(designClaim, now)) return false;
  const claimedMs = designClaim?.claimedAt
    ? new Date(designClaim.claimedAt).getTime()
    : NaN;
  if (!Number.isFinite(claimedMs)) return false;
  return now < claimedMs + DESIGN_CLAIM_ANNOUNCE_MS;
};

export const enrichDesignClaimForViewer = (designClaim, viewerUserId, now = Date.now()) => {
  const viewerId = String(viewerUserId || "").trim();
  const claimerId = designClaim?.claimedBy
    ? String(
        typeof designClaim.claimedBy === "object" && designClaim.claimedBy._id
          ? designClaim.claimedBy._id
          : designClaim.claimedBy,
      ).trim()
    : "";
  const active = isDesignClaimActive(designClaim, now);
  const mine = Boolean(active && viewerId && claimerId === viewerId);
  const peerBusy = Boolean(
    active &&
      viewerId &&
      claimerId &&
      claimerId !== viewerId &&
      isDesignClaimAnnounceWindow(designClaim, now),
  );
  const deadlineMs = designClaim?.deadlineAt
    ? new Date(designClaim.deadlineAt).getTime()
    : NaN;
  const remainingMs =
    mine && Number.isFinite(deadlineMs) ? Math.max(0, deadlineMs - now) : null;

  return {
    active,
    mine,
    peerBusy,
    claimable: !active,
    remainingMs,
    warn: mine && remainingMs != null && remainingMs <= DESIGN_CLAIM_WARN_MS,
  };
};

/**
 * 디자인 파트너 목록: 미클레임/만료 · 본인 활성 · 타인 발표 구간만 노출.
 */
export const buildDesignClaimListVisibilityFilter = (viewerUserId, now = new Date()) => {
  const userIdRaw = String(viewerUserId || "").trim();
  const announceCutoff = new Date(now.getTime() - DESIGN_CLAIM_ANNOUNCE_MS);
  const userId =
    userIdRaw && Types?.ObjectId?.isValid?.(userIdRaw)
      ? new Types.ObjectId(userIdRaw)
      : userIdRaw;

  const inactiveOrMissing = {
    $or: [
      { "designClaim.claimedBy": null },
      { "designClaim.claimedBy": { $exists: false } },
      { "designClaim.deadlineAt": null },
      { "designClaim.deadlineAt": { $exists: false } },
      { "designClaim.deadlineAt": { $lte: now } },
    ],
  };

  if (!userIdRaw) return inactiveOrMissing;

  return {
    $or: [
      inactiveOrMissing,
      {
        "designClaim.claimedBy": userId,
        "designClaim.deadlineAt": { $gt: now },
      },
      {
        "designClaim.claimedBy": { $ne: userId },
        "designClaim.deadlineAt": { $gt: now },
        "designClaim.claimedAt": { $gt: announceCutoff },
      },
    ],
  };
};
