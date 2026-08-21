// related files:
// - web/backend/models/practiceTransfer.model.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/modules/devops/practiceTransferAutoMatch.routes.js
// - web/backend/utils/practiceTransferAutoMatchRealtime.js
// - web/backend/utils/practiceTransferAutoMatchCore.js
import { Types } from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import PracticeTransfer from "../models/practiceTransfer.model.js";
import { isLabFeeScheduleConfigured } from "./labFeeSchedule.js";
import {
  canReceivePracticeTransfer,
  requestorKindCapableAnchorFilter,
  resolveRequestorProfile,
} from "./requestorCapabilities.js";
import {
  ABUTS_LAB_DISPLAY_NAME,
  AUTO_MATCH_LAB_DISPLAY_NAME,
  AUTO_MATCH_PRACTICE_DISPLAY_NAME,
  CERTIFIED_PARTNER_LAB_DISPLAY_NAME,
  PRACTICE_TRANSFER_AUTO_MATCH_CLAIM_HOURS,
  PRACTICE_TRANSFER_AUTO_MATCH_PRIORITY_MS,
  buildAutoMatchPriorityAccessClause,
  buildAutoMatchPriorityFieldsCore,
  buildAutoMatchPriorityUntil,
  canAccessAutoMatchOpenPool,
  canOpenPracticeTransferSubcontract,
  collectSubcontractDirectBlockedLabIds,
  getAssigneeLabAnchorId,
  getAutoMatchPriorityLabAnchorIds,
  isAbutsPrimePracticeTransfer,
  getPrimeLabAnchorId,
  isLabIdBlockedAsDirectPracticeTarget,
  isPracticeTransferSubcontracted,
  isSubcontractFeeScheduleContext,
  isSubcontractIdentityHiddenFromViewer,
  isSubcontractPoolOpen,
  resolveFeeScheduleLabAnchorId,
  resolvePerformingLabAnchorId,
  SUBCONTRACT_DIRECT_BLOCKED_MESSAGE,
  SUBCONTRACT_DIRECT_BLOCKED_REASON,
  SUBCONTRACT_PRACTICE_DISPLAY_NAME,
  isAutoMatchClaimActive,
  isAutoMatchCompleted,
  isAutoMatchMode,
  isAutoMatchOpenPool,
  isAutoMatchPriorityActive,
  isAutoMatchPriorityLabAnchorId,
  isInternalLabBusinessType,
  isPracticeTransferLabReceiverRole,
  isValidLabAnchorIdString,
  normalizeLabAnchorIdList,
  toAutoMatchApiFieldsCore,
} from "./practiceTransferAutoMatchCore.js";
import { filterLabAnchorIdsByStarBand } from "./practiceLabRating.js";

export {
  AUTO_MATCH_LAB_DISPLAY_NAME,
  AUTO_MATCH_PRACTICE_DISPLAY_NAME,
  ABUTS_LAB_DISPLAY_NAME,
  CERTIFIED_PARTNER_LAB_DISPLAY_NAME,
  PRACTICE_TRANSFER_AUTO_MATCH_CLAIM_HOURS,
  PRACTICE_TRANSFER_AUTO_MATCH_PRIORITY_MS,
  buildAutoMatchPriorityAccessClause,
  buildAutoMatchPriorityUntil,
  canAccessAutoMatchOpenPool,
  canOpenPracticeTransferSubcontract,
  getAssigneeLabAnchorId,
  getAutoMatchPriorityLabAnchorIds,
  getPrimeLabAnchorId,
  isAbutsPrimePracticeTransfer,
  isAutoMatchClaimActive,
  isAutoMatchCompleted,
  isAutoMatchMode,
  isAutoMatchOpenPool,
  isAutoMatchPriorityActive,
  isAutoMatchPriorityLabAnchorId,
  isInternalLabBusinessType,
  isPracticeTransferLabReceiverRole,
  isPracticeTransferSubcontracted,
  isSubcontractFeeScheduleContext,
  isSubcontractIdentityHiddenFromViewer,
  isSubcontractPoolOpen,
  isLabIdBlockedAsDirectPracticeTarget,
  normalizeLabAnchorIdList,
  resolveFeeScheduleLabAnchorId,
  resolvePerformingLabAnchorId,
  SUBCONTRACT_DIRECT_BLOCKED_MESSAGE,
  SUBCONTRACT_DIRECT_BLOCKED_REASON,
  SUBCONTRACT_PRACTICE_DISPLAY_NAME,
  collectSubcontractDirectBlockedLabIds,
};

export async function loadSubcontractDirectBlockedLabAnchorIds(
  practiceAnchorId,
) {
  const practiceId = String(practiceAnchorId || "").trim();
  if (!practiceId || !Types.ObjectId.isValid(practiceId)) return [];
  const docs = await PracticeTransfer.find({
    practiceBusinessAnchorId: new Types.ObjectId(practiceId),
    assigneeLabAnchorId: { $exists: true, $ne: null },
  })
    .select({ assigneeLabAnchorId: 1, targetLabAnchorId: 1 })
    .lean();
  return collectSubcontractDirectBlockedLabIds(docs);
}

export async function assertLabAllowedAsDirectPracticeTarget({
  practiceAnchorId,
  labAnchorId,
} = {}) {
  const labId = String(labAnchorId || "").trim();
  if (!labId || !Types.ObjectId.isValid(labId)) return;
  const blocked = await loadSubcontractDirectBlockedLabAnchorIds(
    practiceAnchorId,
  );
  if (!isLabIdBlockedAsDirectPracticeTarget(labId, blocked)) return;
  const err = new Error(SUBCONTRACT_DIRECT_BLOCKED_MESSAGE);
  err.statusCode = 409;
  err.code = SUBCONTRACT_DIRECT_BLOCKED_REASON;
  throw err;
}

/** 치과에는 원청(어벗츠기공소)만 보이고, 하청 기공소는 숨긴다. */
export const redactAutoMatchLabIdentity = (
  matchingMode,
  { targetLabName = "", targetLabAnchorId = null } = {},
  { reveal = false, transfer = null } = {},
) => {
  const hideSubcontractAssignee =
    Boolean(transfer) &&
    isPracticeTransferSubcontracted(transfer) &&
    !reveal;
  if (
    reveal ||
    (!isAutoMatchMode({ matchingMode }) && !hideSubcontractAssignee)
  ) {
    return {
      targetLabName: String(targetLabName || "").trim(),
      targetLabAnchorId: targetLabAnchorId || null,
    };
  }
  const name = String(targetLabName || "").trim();
  const isLegacyAutoLabel =
    name === AUTO_MATCH_LAB_DISPLAY_NAME || name === "자동매칭";
  return {
    targetLabName:
      hideSubcontractAssignee || isLegacyAutoLabel || !name
        ? ABUTS_LAB_DISPLAY_NAME
        : name,
    targetLabAnchorId: hideSubcontractAssignee
      ? transfer?.targetLabAnchorId || targetLabAnchorId || null
      : targetLabAnchorId || null,
  };
};

/** 자동매칭·하청 풀 의뢰의 치과명·담당자명은 협력 기공소에 비공개. */
export const redactAutoMatchPracticeIdentity = (
  matchingMode,
  practice = {},
  { reveal = false, transfer = null, viewerLabAnchorId = null } = {},
) => {
  const hideForSubcontract =
    transfer &&
    isSubcontractIdentityHiddenFromViewer(transfer, viewerLabAnchorId);
  if (reveal || (!isAutoMatchMode({ matchingMode }) && !hideForSubcontract)) {
    return {
      businessName: String(practice?.businessName || "").trim(),
      userName: String(practice?.userName || "").trim(),
    };
  }
  return {
    businessName: hideForSubcontract
      ? SUBCONTRACT_PRACTICE_DISPLAY_NAME
      : AUTO_MATCH_PRACTICE_DISPLAY_NAME,
    userName: "",
  };
};

export const isPracticeTransferAutoMatchEnabled = (anchor) =>
  Boolean(anchor?.practiceTransferAutoMatchEnabled);

/**
 * 검증 기공소(수신 가능) Mongo 필터.
 * - requestor lab (kind=lab 또는 레거시 caps.lab)
 * - internalLab(어벗츠기공소)
 */
export const verifiedLabCapableAnchorFilter = () => ({
  status: "verified",
  $or: [
    {
      businessType: "requestor",
      ...requestorKindCapableAnchorFilter("lab"),
    },
    { businessType: "internalLab" },
  ],
});

/**
 * 자동매칭 공개 풀 자격: verified + 인증(ON) + (requestor lab 수신 가능 | internalLab)
 * (`practiceTransferAutoMatchEnabled` = 어벗츠 인증 기공소)
 */
export const isAutoMatchEligibleLabAnchor = (anchor) => {
  if (!anchor) return false;
  if (String(anchor.status || "").trim() !== "verified") return false;
  if (!isPracticeTransferAutoMatchEnabled(anchor)) return false;
  if (isInternalLabBusinessType(anchor)) return true;
  if (String(anchor.businessType || "").trim() !== "requestor") return false;
  const profile = resolveRequestorProfile({
    anchorKind: anchor.requestorKind,
    anchorServices: anchor.requestorServices,
    anchorCaps: anchor.requestorCapabilities,
    businessVerified: true,
  });
  return canReceivePracticeTransfer(profile);
};

/**
 * 적격 스냅샷 중 internalLab → priority 필드.
 * 없으면 우선창 없음(전원 즉시 노출).
 */
export const buildAutoMatchPriorityFields = ({
  eligibleLabAnchorIds = [],
  priorityLabAnchorIds = [],
  now = new Date(),
} = {}) => {
  const core = buildAutoMatchPriorityFieldsCore({
    eligibleLabAnchorIds,
    priorityLabAnchorIds,
    now,
  });
  if (!core.priorityLabAnchorIds?.length) {
    return {
      priorityUntil: null,
      priorityLabAnchorIds: undefined,
    };
  }
  return {
    priorityUntil: core.priorityUntil,
    priorityLabAnchorIds: core.priorityLabAnchorIds.map(
      (id) => new Types.ObjectId(id),
    ),
  };
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
  const mine = {
    $or: [
      { targetLabAnchorId: labOid },
      { assigneeLabAnchorId: labOid },
    ],
  };

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

  const unassignedIncomplete = [
    openPoolEligibleToMe,
    {
      $or: [
        { "autoMatch.completedAt": null },
        { "autoMatch.completedAt": { $exists: false } },
      ],
    },
    {
      $or: [
        { assigneeLabAnchorId: null },
        { assigneeLabAnchorId: { $exists: false } },
      ],
    },
  ];

  const openPoolBase = {
    matchingMode: "auto",
    status: "active",
    $and: [
      ...unassignedIncomplete,
      {
        $or: [
          { "autoMatch.claimedAt": null },
          { "autoMatch.claimedAt": { $exists: false } },
        ],
      },
      buildAutoMatchPriorityAccessClause(labOid, now),
    ],
  };

  const subcontractPoolBase = {
    matchingMode: "direct",
    status: "active",
    "autoMatch.subcontractPoolOpen": true,
    $and: unassignedIncomplete,
  };

  return {
    $or: [
      mine,
      // 아직 거부하지 않은 공개 풀
      {
        ...openPoolBase,
        $and: [
          ...openPoolBase.$and,
          { "autoMatch.declinedLabAnchorIds": { $nin: [labOid] } },
        ],
      },
      {
        ...subcontractPoolBase,
        $and: [
          ...subcontractPoolBase.$and,
          { "autoMatch.declinedLabAnchorIds": { $nin: [labOid] } },
        ],
      },
      // 내가 거부한 공개 풀(희미한 카드·거부 뱃지용)
      {
        matchingMode: "auto",
        status: "active",
        "autoMatch.declinedLabAnchorIds": labOid,
      },
      {
        matchingMode: "direct",
        status: "active",
        "autoMatch.subcontractPoolOpen": true,
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

/** 원자 클레임 조건: 공개 풀(미배정) + (있으면) 예산 적격 스냅샷 + 우선창 */
export const buildAutoMatchClaimableFilter = (
  now = new Date(),
  { labAnchorId = null } = {},
) => {
  const labId = String(labAnchorId || "").trim();
  const labOid =
    labId && Types.ObjectId.isValid(labId) ? new Types.ObjectId(labId) : null;
  const eligibleClause = labOid
    ? {
        $or: [
          { "autoMatch.eligibleLabAnchorIds": labOid },
          { "autoMatch.eligibleLabAnchorIds": { $exists: false } },
        ],
      }
    : null;

  return {
    status: "active",
    $and: [
      ...(eligibleClause ? [eligibleClause] : []),
      ...(labOid
        ? [{ "autoMatch.declinedLabAnchorIds": { $nin: [labOid] } }]
        : []),
      {
        $or: [
          { "autoMatch.completedAt": null },
          { "autoMatch.completedAt": { $exists: false } },
        ],
      },
      {
        $or: [
          { assigneeLabAnchorId: null },
          { assigneeLabAnchorId: { $exists: false } },
        ],
      },
      {
        $or: [
          {
            matchingMode: "auto",
            $and: [
              {
                $or: [
                  { "autoMatch.claimedAt": null },
                  { "autoMatch.claimedAt": { $exists: false } },
                ],
              },
              ...(labOid
                ? [buildAutoMatchPriorityAccessClause(labOid, now)]
                : []),
            ],
          },
          {
            matchingMode: "direct",
            "autoMatch.subcontractPoolOpen": true,
          },
        ],
      },
    ],
  };
};

/** 어벗츠 하청 풀: 인증·수가설정 기공소(원청 internalLab 제외). 치과 별점 구간 안만. */
export async function loadCertifiedSubcontractLabAnchorIds({
  excludeLabAnchorId = null,
  minStars,
  maxStars,
} = {}) {
  const exclude = String(excludeLabAnchorId || "").trim();
  const labs = await loadAutoMatchEligibleLabAnchors({
    select: { _id: 1, businessType: 1, labFeeSchedule: 1 },
  });
  const ids = [];
  for (const lab of labs) {
    if (isInternalLabBusinessType(lab)) continue;
    if (exclude && String(lab._id) === exclude) continue;
    if (!isLabFeeScheduleConfigured(lab.labFeeSchedule)) continue;
    ids.push(lab._id);
  }
  return filterLabAnchorIdsByStarBand({
    labAnchorIds: ids,
    minStars,
    maxStars,
  });
}

/** 지정·픽커 게이트: 검증 기공소(어벗츠 포함) 중 별점 구간 안. 인증 ON 불필요. */
export async function loadStarBandEligibleLabAnchorIds({
  minStars,
  maxStars,
} = {}) {
  const labs = await BusinessAnchor.find(verifiedLabCapableAnchorFilter())
    .select({ _id: 1 })
    .lean();
  return filterLabAnchorIdsByStarBand({
    labAnchorIds: labs.map((lab) => lab._id),
    minStars,
    maxStars,
  });
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
  if (!id || !isValidLabAnchorIdString(id)) return false;
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

export const toAutoMatchApiFields = (transfer, viewerLabAnchorId = null) =>
  toAutoMatchApiFieldsCore(transfer, viewerLabAnchorId);

/** 어벗츠기공소(internalLab) 원청 앵커. */
export async function resolveInternalLabAnchor() {
  const row = await BusinessAnchor.findOne({ businessType: "internalLab" })
    .select({ _id: 1, name: 1, businessType: 1, status: 1 })
    .sort({ createdAt: 1 })
    .lean();
  return row || null;
}

/** 치과가 어벗츠기공소(또는 레거시 자동매칭)를 고른 경로 B. */
export const wantsAbutsPrimePool = ({
  matchingModeRaw = "",
  autoMatchFlag = false,
  rawAnchorId = "",
  targetLabName = "",
} = {}) => {
  const mode = String(matchingModeRaw || "").trim().toLowerCase();
  const name = String(targetLabName || "").trim();
  const id = String(rawAnchorId || "").trim();
  return (
    mode === "auto" ||
    autoMatchFlag === true ||
    id === "__auto_match__" ||
    name === AUTO_MATCH_LAB_DISPLAY_NAME ||
    name === "자동매칭" ||
    name === ABUTS_LAB_DISPLAY_NAME
  );
};

/**
 * 경로 B 원청 필드. 실패 시 { error }.
 * 지정 기공소(direct)면 호출측에서 기존 앵커를 쓴다.
 */
export async function resolveAbutsPrimeLabFields() {
  const internal = await resolveInternalLabAnchor();
  if (!internal?._id) {
    return {
      error: {
        status: 409,
        message: "어벗츠기공소를 찾을 수 없습니다.",
      },
    };
  }
  return {
    matchingMode: "direct",
    targetLabAnchorId: internal._id,
    targetLabName: ABUTS_LAB_DISPLAY_NAME,
  };
}
