// related files:
// - web/backend/models/practiceTransfer.model.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/modules/devops/practiceTransferAutoMatch.routes.js
import { Types } from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import {
  canReceivePracticeTransfer,
  requestorKindCapableAnchorFilter,
  resolveRequestorProfile,
} from "./requestorCapabilities.js";

/**
 * @deprecated 자동매칭 3시간 강제 클레임 만료는 폐기.
 * 작업 기한은 치과가 지정한 도착일·소통으로 처리. 값은 레거시 문서 호환용.
 */
export const PRACTICE_TRANSFER_AUTO_MATCH_CLAIM_HOURS = 3;

export const AUTO_MATCH_LAB_DISPLAY_NAME = "자동 매칭";
export const AUTO_MATCH_PRACTICE_DISPLAY_NAME = "자동 매칭";

/** 자동매칭 의뢰의 기공소명·기공소 앵커는 치과/타 기공소에 비공개. */
export const redactAutoMatchLabIdentity = (
  matchingMode,
  { targetLabName = "", targetLabAnchorId = null } = {},
  { reveal = false } = {},
) => {
  if (reveal || !isAutoMatchMode({ matchingMode })) {
    return {
      targetLabName: String(targetLabName || "").trim(),
      targetLabAnchorId: targetLabAnchorId || null,
    };
  }
  return {
    targetLabName: AUTO_MATCH_LAB_DISPLAY_NAME,
    targetLabAnchorId: null,
  };
};

/** 자동매칭 의뢰의 치과명·담당자명은 기공소에 비공개. */
export const redactAutoMatchPracticeIdentity = (
  matchingMode,
  practice = {},
  { reveal = false } = {},
) => {
  if (reveal || !isAutoMatchMode({ matchingMode })) {
    return {
      businessName: String(practice?.businessName || "").trim(),
      userName: String(practice?.userName || "").trim(),
    };
  }
  return {
    businessName: AUTO_MATCH_PRACTICE_DISPLAY_NAME,
    userName: "",
  };
};

export const isPracticeTransferAutoMatchEnabled = (anchor) =>
  Boolean(anchor?.practiceTransferAutoMatchEnabled);

/**
 * 검증 기공소(수신 가능) Mongo 필터.
 * requestorKind=lab 또는 레거시 caps.lab( kind 미백필 ) 포함.
 */
export const verifiedLabCapableAnchorFilter = () => ({
  businessType: "requestor",
  status: "verified",
  ...requestorKindCapableAnchorFilter("lab"),
});

/**
 * 자동매칭 공개 풀 자격: lab+free + verified + 인증(ON)
 * (`practiceTransferAutoMatchEnabled` = 어벗츠 인증 기공소)
 */
export const isAutoMatchEligibleLabAnchor = (anchor) => {
  if (!anchor) return false;
  if (String(anchor.status || "").trim() !== "verified") return false;
  if (!isPracticeTransferAutoMatchEnabled(anchor)) return false;
  const profile = resolveRequestorProfile({
    anchorKind: anchor.requestorKind,
    anchorServices: anchor.requestorServices,
    anchorCaps: anchor.requestorCapabilities,
    businessVerified: true,
  });
  return canReceivePracticeTransfer(profile);
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

/** @deprecated 3시간 강제 마감 폐기. 호출부 호환용으로 null 반환. */
export const buildAutoMatchDeadlineAt = (
  _now = new Date(),
  _hours = PRACTICE_TRANSFER_AUTO_MATCH_CLAIM_HOURS,
) => null;

/**
 * 수신 목록: 내 지정 건 ∪ (eligible이면) 공개 풀 ∪ 내가 거부한 공개 풀 건
 */
export const buildReceivedScopeWithAutoMatch = ({
  labAnchorId,
  autoMatchEligible,
  now = new Date(),
}) => {
  const labId = String(labAnchorId || "").trim();
  if (!labId || !Types.ObjectId.isValid(labId)) return null;

  const labOid = new Types.ObjectId(labId);
  const mine = { targetLabAnchorId: labOid };

  if (!autoMatchEligible) {
    return mine;
  }

  // 공개 풀: 생성 시 스냅샷된 적격 목록에 내가 있어야 함.
  // eligibleLabAnchorIds 미존재 = 레거시(예산 도입 전) → 인증 기공소 전원.
  const openPoolEligibleToMe = {
    $or: [
      { "autoMatch.eligibleLabAnchorIds": labOid },
      { "autoMatch.eligibleLabAnchorIds": { $exists: false } },
    ],
  };

  const openPoolBase = {
    matchingMode: "auto",
    status: "active",
    $and: [
      openPoolEligibleToMe,
      {
        $or: [
          { "autoMatch.completedAt": null },
          { "autoMatch.completedAt": { $exists: false } },
        ],
      },
      {
        $or: [
          { targetLabAnchorId: null },
          { targetLabAnchorId: { $exists: false } },
        ],
      },
    ],
  };

  return {
    $or: [
      mine,
      // 아직 거부하지 않은 공개 풀
      {
        ...openPoolBase,
        $and: [...openPoolBase.$and, { "autoMatch.declinedLabAnchorIds": { $nin: [labOid] } }],
      },
      // 내가 거부한 공개 풀(희미한 카드·거부 뱃지용)
      {
        matchingMode: "auto",
        status: "active",
        "autoMatch.declinedLabAnchorIds": labOid,
      },
      // 지정 의뢰를 거부·취소한 건
      {
        labRejectedByLabAnchorId: labOid,
        labRejectedAt: { $ne: null },
      },
    ],
  };
};

/** 원자 클레임 조건: 공개 풀(미배정) + (있으면) 예산 적격 스냅샷 */
export const buildAutoMatchClaimableFilter = (
  _now = new Date(),
  { labAnchorId = null } = {},
) => {
  const labId = String(labAnchorId || "").trim();
  const eligibleClause =
    labId && Types.ObjectId.isValid(labId)
      ? {
          $or: [
            { "autoMatch.eligibleLabAnchorIds": new Types.ObjectId(labId) },
            { "autoMatch.eligibleLabAnchorIds": { $exists: false } },
          ],
        }
      : null;

  return {
    matchingMode: "auto",
    status: "active",
    $and: [
      ...(eligibleClause ? [eligibleClause] : []),
      ...(labId && Types.ObjectId.isValid(labId)
        ? [{ "autoMatch.declinedLabAnchorIds": { $nin: [new Types.ObjectId(labId)] } }]
        : []),
      {
        $or: [
          { "autoMatch.completedAt": null },
          { "autoMatch.completedAt": { $exists: false } },
        ],
      },
      {
        $or: [
          { targetLabAnchorId: null },
          { targetLabAnchorId: { $exists: false } },
        ],
      },
    ],
  };
};

export async function loadAutoMatchEligibleLabAnchors({
  select = { _id: 1, name: 1, primaryContactUserId: 1 },
} = {}) {
  const rows = await BusinessAnchor.find({
    ...verifiedLabCapableAnchorFilter(),
    practiceTransferAutoMatchEnabled: true,
  })
    .select(select)
    .lean();

  return rows.filter((row) => isAutoMatchEligibleLabAnchor(row));
}

export async function isLabAnchorAutoMatchEligible(labAnchorId) {
  const id = String(labAnchorId || "").trim();
  if (!id || !Types.ObjectId.isValid(id)) return false;
  const anchor = await BusinessAnchor.findById(id)
    .select({
      status: 1,
      businessType: 1,
      requestorKind: 1,
      requestorServices: 1,
      requestorCapabilities: 1,
      practiceTransferAutoMatchEnabled: 1,
    })
    .lean();
  return isAutoMatchEligibleLabAnchor(anchor);
}

export const toAutoMatchApiFields = (transfer, viewerLabAnchorId = null) => {
  const matchingMode = isAutoMatchMode(transfer) ? "auto" : "direct";
  const auto = transfer?.autoMatch && typeof transfer.autoMatch === "object"
    ? transfer.autoMatch
    : {};
  const now = Date.now();
  const completed = isAutoMatchCompleted(transfer);
  const claimActive = isAutoMatchClaimActive(transfer, now);
  const openPool = isAutoMatchOpenPool(transfer, now);
  const targetId = String(transfer?.targetLabAnchorId || "").trim();
  const viewerId = String(viewerLabAnchorId || "").trim();
  const mine =
    Boolean(claimActive && viewerId && targetId && viewerId === targetId);
  const declinedIds = Array.isArray(auto?.declinedLabAnchorIds)
    ? auto.declinedLabAnchorIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const declinedByMe = Boolean(viewerId && declinedIds.includes(viewerId));

  return {
    matchingMode,
    autoMatch: {
      claimedAt: auto?.claimedAt || null,
      deadlineAt: null,
      claimHours: null,
      completedAt: auto?.completedAt || null,
      completedBy: auto?.completedBy
        ? String(auto.completedBy)
        : null,
      releaseCount: Number(auto?.releaseCount || 0),
      openPool,
      claimActive,
      completed,
      mine,
      declinedByMe,
      remainingMs: null,
    },
  };
};
