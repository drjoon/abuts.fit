import { Types } from "mongoose";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import PracticeTransferDraft from "../../models/practiceTransferDraft.model.js";
import File from "../../models/file.model.js";
import User from "../../models/user.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { emitAppEventToUser } from "../../socket.js";
import {
  getRequestPerfCacheValue,
  setRequestPerfCacheValue,
  deleteRequestPerfCacheValue,
  invalidateAdminDashboardCaches,
  withRequestPerfInFlight,
} from "../../services/requestDashboardCache.service.js";
import {
  assertPracticeTransferPaidCreditSufficient,
  adjustPracticeTransferHold,
  buildFeeQuotesForTransferDocs,
  buildPracticeTransferQuote,
  feeQuoteFromBillingDoc,
  holdPracticeTransferCredits,
  loadPracticeTransferQuoteContext,
  releasePracticeTransferLabShare,
  releasePracticeTransferAbutmentShare,
  chargePracticeTransferLabShipping,
  rollbackPracticeTransferBilling,
  toBillingPreviewFields,
  toFeeQuoteApi,
  toRemakeApiFields,
} from "../../services/practiceTransferBilling.service.js";
import { emitCreditBalanceUpdatedToBusiness } from "../../utils/creditRealtime.js";
import {
  ABUTS_LAB_DISPLAY_NAME,
  AUTO_MATCH_LAB_DISPLAY_NAME,
  buildAutoMatchClaimableFilter,
  buildAutoMatchPriorityFields,
  buildReceivedScopeWithAutoMatch,
  canOpenPracticeTransferSubcontract,
  getAssigneeLabAnchorId,
  getPrimeLabAnchorId,
  isAutoMatchClaimActive,
  isAutoMatchCompleted,
  isAutoMatchMode,
  isAutoMatchOpenPool,
  isSubcontractPoolOpen,
  isAutoMatchPriorityActive,
  isAutoMatchPriorityLabAnchorId,
  isInternalLabBusinessType,
  isPracticeTransferLabReceiverRole,
  isLabAnchorAutoMatchEligible,
  loadAutoMatchEligibleLabAnchors,
  loadCertifiedSubcontractLabAnchorIds,
  redactAutoMatchLabIdentity,
  redactAutoMatchPracticeIdentity,
  resolveAbutsPrimeLabFields,
  resolvePerformingLabAnchorId,
  assertLabAllowedAsDirectPracticeTarget,
  loadSubcontractDirectBlockedLabAnchorIds,
  SUBCONTRACT_DIRECT_BLOCKED_MESSAGE,
  SUBCONTRACT_DIRECT_BLOCKED_REASON,
  toAutoMatchApiFields,
  wantsAbutsPrimePool,
} from "../../utils/practiceTransferAutoMatch.js";
import {
  clearAutoMatchPriorityTimers,
  notifyAutoMatchPoolCreatedWithPriority,
  notifyAutoMatchPriorityOpenedEarly,
} from "../../utils/practiceTransferAutoMatchRealtime.js";
import {
  loadAutoMatchBudgetCatalog,
} from "../../utils/practiceTransferAutoMatchBudget.js";
import { resolveLabPracticeFeeMultiplier, isLabFeeScheduleConfigured, isLabFeeScheduleReadyToCharge, missingLabFeeItemNames, labFeeItemNamesNeededForToothWorks, toothWorksNeedLabFee } from "../../utils/labFeeSchedule.js";
import {
  normalizeRushFeeMultiplier,
  resolvePracticeTransferArrivalPolicy,
} from "../../utils/practiceTransferRush.js";
import {
  findPracticeLabRating,
  loadGlobalLabRatingAggregates,
  normalizePracticeLabStars,
  normalizePracticeLabRatingMemo,
  PRACTICE_LAB_RATING_MAX,
  PRACTICE_LAB_RATING_MIN,
  toLabRatingSummaryApi,
  toPracticeLabRatingPublicApi,
  upsertPracticeLabRatingList,
  resolveAutoMatchEligibleStarBand,
  assertLabWithinPracticeStarBand,
  LAB_OUTSIDE_STAR_BAND_MESSAGE,
  LAB_OUTSIDE_STAR_BAND_REASON,
} from "../../utils/practiceLabRating.js";
import ChatRoom from "../../models/chatRoom.model.js";
import { postPracticeTransferSystemChatMessage } from "../../services/chatSystemMessage.service.js";
import {
  assertOralScanFilesForCreate,
  canStartAbutmentProduction,
  clearRelatedAbutmentProductionOnRelease,
  ensureAbutmentRequestsOnAccept,
  hasCustomAbutmentToothWorks,
  hasRelatedAbutmentPastReady,
  isAbutmentDesignReady,
  mapAbutmentPastReadyByTransferDocs,
  normalizeResultFiles,
  resolveOralScanFilesForAccept,
  shouldLockLabOralScanDownload,
  tryStartAbutmentProduction,
} from "../../services/practiceTransferProduction.service.js";
import { assertAbutmentPresetsComplete } from "../../utils/practiceTransferAbutmentPresets.js";
import {
  canEditPracticeTransferContent,
  resolvePracticeTransferManufacturerStage,
} from "../../utils/practiceTransferStage.js";
import { resolvePracticeTransferSkipJig } from "../../utils/practiceTransferLabShipping.js";
// related files:
// - web/frontend/src/pages/practice/hooks/usePracticeTransferStep1.ts
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/backend/models/practiceTransfer.model.js
// - web/backend/models/practiceTransferDraft.model.js
// - web/backend/models/file.model.js
// - web/backend/models/user.model.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/socket.js
// - web/backend/services/requestDashboardCache.service.js
// - web/backend/utils/practiceTransferAbutmentPresets.js
// - web/backend/utils/practiceLabRating.js
// - web/backend/utils/practiceTransferStage.js
// - 2026-08-17: mark-complete는 기공소→치과 배송비만. 어벗츠→제조사 배송은 CA 집하.
// - 2026-08-16: pastReady — 라이브 stage 우선(sticky startedAt OR 제거 시 목록 인자 우선).
// - 2026-08-17: trash/empty — 하드삭제 의뢰 채팅방 archive(치과 사이드바 유령 unread 방지).
// - 2026-08-17: trash/empty — 하드삭제 전 rollbackPracticeTransferBilling(배송·디자인비 포함).
// - 2026-08-16: 어벗 가공(준비 아님)이면 mark-release 거부·목록 abutmentPastReady.
// - 2026-08-19: 생성 시 구강스캔은 선택(어벗츠기공소/자동매칭 포함).
// - 2026-08-15: 구강스캔 — 자동매칭 CA는 치과 필수, 지정은 수락 시 기공소 업로드 허용.
// - 2026-08-19: 경로 B — 어벗츠 원청 고정·하청 assignee·30분 우선창·하청 전환.
// - 2026-08-15: 자동매칭 어벗츠(internalLab) 30분 우선창 — 목록·클레임 게이트, 거부 시 조기 공개.
// - 2026-08-15: practiceTransferManufacturerStage SSOT를 utils/practiceTransferStage로 분리.
// - 2026-08-13: 어벗 치아에 임플란트·스캔바디 프리셋이 없으면 전송 거절.
// - 2026-08-14: GET /my 목록 — countDocuments 제거·레거시 $or 축소·동료/견적 조회 캐시.
// - 2026-08-14: GET /my $or 분리 병렬 조회. drafts?trashed=all 1쿼리. GET에서 syncIndexes 제거.
// - 2026-08-14: 치과→기공소 labRating(1~5)·메모. 자동매칭 최소 별 필터.
// - 2026-08-16: mark-complete — ensure skip·persist 1회·emit parallel (4~5s 완화).
// - 2026-08-16: 자동매칭 적격 — 주문 치과 1점 기공소 제외.
// - 2026-08-16: 1점도 참여 가능. 기공비 ×0.8. 우리치과 1점 하드 차단 제거.
// - 2026-08-14: 자동매칭도 practiceBusinessAnchorId 전달(표시명 비공개·기공수가 할증 키).
// - 2026-08-16: 자동매칭 청구는 플랫폼 고정수가(별점 배수 없음). 적격은 인증·수가·별점 게이트.
// - 2026-08-19: 기공비 할증은 기공소 치과별 labFeeMultiplier만(별점 할인/할증 폐지).
// - 2026-08-15: 적격 스냅샷에서 practice 할증 제외. 카탈로그·practice 병렬 로드.
// - 2026-08-14: 자동매칭 3시간 강제 클레임 만료 폐기(작업완료/취소까지 유지·도착일은 소통 기한).
// - 2026-08-14: mark-accepted — autoMatch pool emit N+1 제거·사이드이펙트 병렬. FE 수락 busy에서 chat resolve 분리.
// - 2026-08-15: mark-release — 연동 CA Request/디자인 미러 정리(재수락 소유 어긋남 방지).
// - 2026-08-14: mark-accepted — 과금 직후 응답, billing $set, 사이드이펙트 비동기.
// - 2026-08-15: mark-accepted — billing+accept $set 병합, 과금 저널/수수료 조회 병렬.
// - 2026-08-14: mark-release — updateOne + 사이드이펙트 비동기(채팅/emit은 응답 후).
// - 2026-08-14: 수락도 작업취소와 같이 채팅 시스템 메시지(work_accept) 남김.
// - 2026-08-14: mark-accepted — 치과 practice:transfer-updated에 확정 feeQuote 포함.
// - 2026-08-16: mark-reject 지정=작업취소(치과 취소·휴지통 아님). mark-release auto=자동매칭 재공개.
// - 2026-08-16: 수신 목록 — 별점 다운그레이드(유효별>의뢰별 수가) 페이로드.
// - 2026-08-16: mark-release clearAutoMatchClaim — autoMatchBudget(선택 별점) 유지. 누락 시 평균가(3점) 폴백·다운그레이드 소실.
// - 2026-08-16: mark-release 이미 해제면 200 멱등. 수신 목록 manufacturerStage는 stage SSOT.
// - 2026-08-18: 수락 전 의뢰 내용 수정 POST /:transferId/update-content.
// - 2026-08-19: mark-accepted — 기공비 미설정(마스터 Off·항목 Off·해당 보철 0원)이면 409 lab_fee_unconfigured.
const PRACTICE_TAGS = ["practice_dropzone", "practice_file_transfer"];
const PRACTICE_ALLOWED_MODEL_EXTENSIONS = new Set([".stl", ".ply", ".obj"]);
const PRACTICE_ALLOWED_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".bmp",
  ".gif",
]);
const PRACTICE_ALLOWED_EXTENSIONS = new Set([
  ...PRACTICE_ALLOWED_MODEL_EXTENSIONS,
  ...PRACTICE_ALLOWED_IMAGE_EXTENSIONS,
]);

const LAB_FEE_UNCONFIGURED_REASON = "lab_fee_unconfigured";
const LAB_FEE_UNCONFIGURED_ACCEPT_MESSAGE =
  "기공비를 먼저 설정한 뒤 수락해주세요.";

function rejectLabFeeUnconfigured(res, err) {
  const status = Number(err?.statusCode || 409);
  const missingFeeNames = Array.isArray(err?.missingFeeNames)
    ? err.missingFeeNames.map((name) => String(name || "").trim()).filter(Boolean)
    : [];
  return res.status(status >= 400 && status < 600 ? status : 409).json({
    success: false,
    message:
      String(err?.message || "").trim() || LAB_FEE_UNCONFIGURED_ACCEPT_MESSAGE,
    reason: err?.code || LAB_FEE_UNCONFIGURED_REASON,
    ...(missingFeeNames.length ? { missingFeeNames } : {}),
  });
}

async function assertReceiverLabFeeConfigured(labAnchorId, toothWorks) {
  const lab = await BusinessAnchor.findById(labAnchorId)
    .select({ labFeeSchedule: 1 })
    .lean();
  const missing = missingLabFeeItemNames(lab?.labFeeSchedule, toothWorks);
  if (isLabFeeScheduleConfigured(lab?.labFeeSchedule) && missing.length === 0) {
    return;
  }
  const err = new Error(LAB_FEE_UNCONFIGURED_ACCEPT_MESSAGE);
  err.statusCode = 409;
  err.code = LAB_FEE_UNCONFIGURED_REASON;
  err.missingFeeNames =
    missing.length > 0
      ? missing
      : labFeeItemNamesNeededForToothWorks(toothWorks);
  throw err;
}

const fingerprintToothWorks = (rows) => {
  try {
    const list = Array.isArray(rows) ? rows : [];
    const parts = list.map((row) => {
      const src =
        row && typeof row === "object" && typeof row.toObject === "function"
          ? row.toObject()
          : row && typeof row === "object"
            ? row
            : {};
      return [
        String(src.toothNumber || src.tooth || "").trim(),
        String(src.prosthesisType || src.type || "").trim(),
        src.hasCustomAbutment || src.customAbutment ? "1" : "0",
        String(src.abutmentProductMode || src.productMode || "").trim(),
        String(src.implantManufacturer || src.manufacturer || "").trim(),
        String(src.implantBrand || src.brand || "").trim(),
        String(src.implantFamily || src.family || "").trim(),
        String(src.implantType || "").trim(),
        src.roundBar ? "1" : "0",
        String(src.roundBarRequestId || "").trim(),
        src.roundBarAdopted === true || src.adopted === true ? "1" : "0",
      ].join("\t");
    });
    parts.sort();
    return parts.join("\n");
  } catch {
    return "";
  }
};

const unreadCountCacheKey = (scopeOrLabId) => {
  if (typeof scopeOrLabId === "string") {
    return `practice-unread:${scopeOrLabId || "all"}`;
  }
  if (!scopeOrLabId || typeof scopeOrLabId !== "object") {
    return "practice-unread:admin";
  }
  const labId = scopeOrLabId.targetLabAnchorId
    ? String(scopeOrLabId.targetLabAnchorId)
    : "all";
  return `practice-unread:${labId}`;
};

const invalidateUnreadCountCache = (scopeOrLabId) => {
  deleteRequestPerfCacheValue(unreadCountCacheKey(scopeOrLabId));
};

/**
 * 기공소 의뢰수락 시 치과↔기공소 채팅방을 즉시 만든다.
 * transfer-room 해석 실패를 줄이고, 치과 상세 모달에서 바로 소통 가능하게 한다.
 */
const ensurePracticeTransferChatRoomOnAccept = async ({
  transferDoc,
  labUserId,
}) => {
  try {
    const practiceUserId = String(transferDoc?.practiceUserId || "").trim();
    const labId = String(labUserId || "").trim();
    const transferMongoId = transferDoc?._id;
    if (
      !transferMongoId ||
      !practiceUserId ||
      !Types.ObjectId.isValid(practiceUserId) ||
      !labId ||
      !Types.ObjectId.isValid(labId)
    ) {
      return null;
    }

    const participantIds = [practiceUserId, labId].filter(
      (id, idx, arr) => arr.indexOf(id) === idx,
    );

    let room = await ChatRoom.findOne({
      relatedPracticeTransferId: transferMongoId,
      isArchived: false,
    })
      .select({ _id: 1 })
      .lean();

    if (!room?._id) {
      const created = await ChatRoom.create({
        participants: participantIds.map((id) => new Types.ObjectId(id)),
        roomType: "direct",
        title: `전송 ${String(transferDoc.transferId || "")} 소통`,
        relatedPracticeTransferId: transferMongoId,
        status: "active",
      });
      return created?._id || null;
    }

    await ChatRoom.updateOne(
      { _id: room._id },
      {
        $addToSet: {
          participants: {
            $each: participantIds.map((id) => new Types.ObjectId(id)),
          },
        },
      },
    );
    return room._id;
  } catch {
    return null;
  }
};

const clearAutoMatchClaimFields = (doc, { bumpRelease = true } = {}) => {
  if (!doc) return;
  const prev =
    doc.autoMatch && typeof doc.autoMatch === "object"
      ? doc.autoMatch
      : {};
  const prevBilling =
    doc.billing && typeof doc.billing === "object" ? doc.billing : {};
  const releaseCount = Number(prev.releaseCount || 0);
  // 생성 시 스냅샷 — 클레임 해제·재공개 후에도 선택 별점/고정수가 유지(미보존 시 3점 평균가 폴백).
  const preservedAutoMatchBudget =
    prevBilling.autoMatchBudget != null &&
    typeof prevBilling.autoMatchBudget === "object"
      ? prevBilling.autoMatchBudget
      : undefined;
  const keepPrime =
    Boolean(doc.assigneeLabAnchorId) ||
    String(doc.targetLabName || "").trim() === ABUTS_LAB_DISPLAY_NAME;
  if (keepPrime) {
    doc.assigneeLabAnchorId = null;
    doc.assigneeLabName = "";
  } else {
    doc.targetLabAnchorId = null;
    doc.targetLabName = AUTO_MATCH_LAB_DISPLAY_NAME;
    doc.assigneeLabAnchorId = null;
    doc.assigneeLabName = "";
  }
  doc.requestorReadAt = null;
  doc.requestorReadBy = null;
  doc.requestorDownloadedAt = null;
  doc.requestorDownloadedBy = null;
  doc.billing = {
    labFeeTotal: 0,
    abutmentRetailTotal: 0,
    abutmentQty: 0,
    total: 0,
    isTradingPartner: false,
    relationshipKind: "none",
    feeRateApplied: 0,
    // 생성 시 할증 스냅샷 유지(클레임 해제 후에도 소급 적용 금지).
    labFeeMultiplier: Number(prevBilling.labFeeMultiplier || 1),
    labTradingPartnerId: null,
    labSettlementAmount: 0,
    abutsRevenueAmount: 0,
    billedAt: null,
    heldAt: null,
    heldTotal: 0,
    heldLabTotal: 0,
    heldAbutmentTotal: 0,
    holdFromPaid: 0,
    holdFromFreeRequest: 0,
    holdFromFreeShipping: 0,
    settledAt: null,
    labSettledAt: null,
    abutmentSettledAt: null,
    ...(preservedAutoMatchBudget
      ? { autoMatchBudget: preservedAutoMatchBudget }
      : {}),
  };
  doc.autoMatch = {
    claimedAt: null,
    deadlineAt: null,
    claimHours: null,
    completedAt: null,
    completedBy: null,
    releaseCount: bumpRelease ? releaseCount + 1 : releaseCount,
    eligibleLabAnchorIds: prev.eligibleLabAnchorIds,
    declinedLabAnchorIds: prev.declinedLabAnchorIds,
    priorityLabAnchorIds: prev.priorityLabAnchorIds,
    // 작업취소 재공개 시 우선창 종료 → 타 기공소 즉시 노출
    priorityUntil: bumpRelease ? new Date() : prev.priorityUntil ?? null,
  };
};

const normalizeEligibleLabAnchorIds = (raw) =>
  (Array.isArray(raw) ? raw : [])
    .map((id) => String(id || "").trim())
    .filter((id) => Types.ObjectId.isValid(id));

/** 치과 픽커: 어벗츠/레거시 자동매칭 → 어벗츠기공소 지정(direct). 공개 풀 없음. */
const resolveCreateMatchingTarget = async ({
  matchingModeRaw,
  autoMatchFlag,
  rawAnchorId,
  targetLabName,
}) => {
  const wantsAbuts = wantsAbutsPrimePool({
    matchingModeRaw,
    autoMatchFlag,
    rawAnchorId,
    targetLabName,
  });

  if (!wantsAbuts && Types.ObjectId.isValid(rawAnchorId)) {
    const picked = await BusinessAnchor.findById(rawAnchorId)
      .select({ businessType: 1, name: 1 })
      .lean();
    if (isInternalLabBusinessType(picked)) {
      const prime = await resolveAbutsPrimeLabFields();
      if (prime.error) return prime;
      return prime;
    }
    return {
      matchingMode: "direct",
      targetLabAnchorId: new Types.ObjectId(rawAnchorId),
      targetLabName:
        String(targetLabName || "").trim() ||
        String(picked?.name || "").trim(),
    };
  }

  if (wantsAbuts) {
    const prime = await resolveAbutsPrimeLabFields();
    if (prime.error) return prime;
    return prime;
  }

  return {
    matchingMode: "direct",
    targetLabAnchorId: Types.ObjectId.isValid(rawAnchorId)
      ? new Types.ObjectId(rawAnchorId)
      : null,
    targetLabName: String(targetLabName || "").trim(),
  };
};

const rejectIfSubcontractDirectBlocked = async (
  res,
  { practiceAnchorId, matchingMode, labAnchorId },
) => {
  if (String(matchingMode || "").trim() !== "direct") return false;
  try {
    await assertLabAllowedAsDirectPracticeTarget({
      practiceAnchorId,
      labAnchorId,
    });
    return false;
  } catch (err) {
    const status = Number(err?.statusCode || 409);
    res.status(status >= 400 && status < 600 ? status : 409).json({
      success: false,
      message:
        err?.message || SUBCONTRACT_DIRECT_BLOCKED_MESSAGE,
      reason: err?.code || SUBCONTRACT_DIRECT_BLOCKED_REASON,
    });
    return true;
  }
};

/**
 * 자동매칭 풀 변경을 적격 기공소 requestor에게 fan-out.
 * 기공소별 User.find 직렬(N+1) 대신 1회 $in 조회로 수락/생성 지연을 줄인다.
 */
const emitAutoMatchPoolCreated = async (
  realtimePayload,
  { eligibleLabAnchorIds = undefined } = {},
) => {
  try {
    let labIds = normalizeEligibleLabAnchorIds(eligibleLabAnchorIds);
    if (!Array.isArray(eligibleLabAnchorIds)) {
      // 레거시(스냅샷 없음): 인증 자동매칭 기공소 전원
      const labs = await loadAutoMatchEligibleLabAnchors({
        select: { _id: 1 },
      });
      labIds = labs
        .map((lab) => String(lab?._id || "").trim())
        .filter((id) => Types.ObjectId.isValid(id));
    }
    if (!labIds.length) return;

    for (const labId of labIds) {
      invalidateUnreadCountCache(labId);
    }

    const users = await User.find({
      businessAnchorId: {
        $in: labIds.map((id) => new Types.ObjectId(id)),
      },
      role: { $in: ["requestor", "internalLab"] },
      active: true,
    })
      .select({ _id: 1 })
      .lean();

    const payload = {
      ...realtimePayload,
      matchingMode: "auto",
      targetLabAnchorId: null,
    };
    for (const user of users) {
      const userId = String(user?._id || "").trim();
      if (!userId) continue;
      emitAppEventToUser(userId, "practice:transfer-created", payload);
    }
  } catch (err) {
    console.warn(
      "[practiceTransfer] autoMatch pool emit failed",
      err?.message || err,
    );
  }
};

const getLowerExt = (filename) => {
  const raw = String(filename || "").trim().toLowerCase();
  const idx = raw.lastIndexOf(".");
  if (idx < 0) return "";
  return raw.slice(idx);
};

const isAllowedPracticeFile = (filename) =>
  PRACTICE_ALLOWED_EXTENSIONS.has(getLowerExt(filename));

const mapPracticeTransferFilesFromCaseInfos = (caseInfos) =>
  (Array.isArray(caseInfos) ? caseInfos : [])
    .map((ci) => {
      const file = ci?.file || {};
      const originalName = String(file?.originalName || file?.name || "").trim();
      const s3Key = String(file?.s3Key || file?.key || "").trim();
      if (!originalName || !s3Key) return null;
      if (!isAllowedPracticeFile(originalName)) return null;

      return {
        patientName: String(ci?.patientName || "").trim(),
        tooth: String(ci?.tooth || "").trim(),
        file: {
          originalName,
          mimetype: String(file?.mimetype || "application/octet-stream").trim(),
          size: Number(file?.size || 0),
          s3Key,
        },
      };
    })
    .filter(Boolean);

const extractTransferIdFromMessage = (message) => {
  const raw = String(message || "").trim();
  const matched = raw.match(/\[\s*전송ID\s*:\s*([^\]]+)\]/i);
  return String(matched?.[1] || "").trim();
};

const extractLabNameFromMessage = (message) => {
  const raw = String(message || "").trim();
  const matched = raw.match(/\[\s*기공소\s*:\s*([^\]]+)\]/i);
  return String(matched?.[1] || "").trim();
};

const extractTransferMemoFromMessage = (message) => {
  const raw = String(message || "").trim();
  if (!raw) return "";
  return raw
    .split(/\r?\n/)
    .map((line) =>
      String(line || "")
        .replace(/\[\s*기공소\s*:[^\]]*\]/gi, "")
        .replace(/\[\s*전송ID\s*:[^\]]*\]/gi, "")
        .trim(),
    )
    .filter(Boolean)
    .join("\n")
    .trim();
};

const toProductionApiFields = (production, { abutmentPastReady } = {}) => {
  const p = production && typeof production === "object" ? production : {};
  const designFiles = normalizeResultFiles(p.designFiles);
  // 목록 등에서 라이브 pastReady를 넘기면 sticky startedAt보다 우선(가공→준비 복귀).
  const pastReady =
    abutmentPastReady !== undefined
      ? Boolean(abutmentPastReady)
      : Boolean(p.abutmentProductionStartedAt);
  return {
    shippingMode:
      p.shippingMode === "express"
        ? "express"
        : p.shippingMode === "normal"
          ? "normal"
          : null,
    rushProcessing: Boolean(p.rushProcessing),
    // 미설정·레거시 null은 생략(true)로 취급
    skipDesignConfirm: p.skipDesignConfirm !== false,
    skipJig: Boolean(p.skipJig),
    designReadyAt: p.designReadyAt || null,
    designFileCount: designFiles.length,
    designFiles: designFiles.map((item, idx) => ({
      id: `design::${idx + 1}`,
      patientName: String(item?.patientName || "").trim(),
      tooth: String(item?.tooth || "").trim(),
      originalName: String(item?.file?.originalName || "").trim(),
      mimetype: String(item?.file?.mimetype || "application/octet-stream").trim(),
      size: Number(item?.file?.size || 0),
      s3Key: String(item?.file?.s3Key || "").trim(),
    })),
    labDesignConfirmedAt: p.labDesignConfirmedAt || null,
    practiceDesignConfirmedAt: p.practiceDesignConfirmedAt || null,
    abutmentProductionStartedAt: p.abutmentProductionStartedAt || null,
    /** 연동 CA Request가 준비 단계를 지남 → 생산/수락 취소 불가 */
    abutmentPastReady: pastReady,
    confirmedAt: p.confirmedAt || null,
    relatedRequestIds: Array.isArray(p.relatedRequestIds)
      ? p.relatedRequestIds.map((id) => String(id))
      : [],
  };
};

const toTransferFilesApiFields = (transferDoc) => {
  const files = normalizeResultFiles(transferDoc?.files);
  const transferMongoId = String(transferDoc?._id || "").trim();
  return {
    fileCount: files.length,
    files: files.map((item, idx) => ({
      id: `${transferMongoId}::${idx + 1}`,
      patientName: String(item?.patientName || "").trim(),
      tooth: String(item?.tooth || "").trim(),
      originalName: String(item?.file?.originalName || "").trim(),
      mimetype: String(item?.file?.mimetype || "application/octet-stream").trim(),
      size: Number(item?.file?.size || 0),
      s3Key: String(item?.file?.s3Key || "").trim(),
    })),
    oralScanDownloadLocked: shouldLockLabOralScanDownload(transferDoc),
  };
};

/** body/routing에서 skipDesignConfirm 파싱. 명시 false만 미생략, 그 외 기본 true */
const parseSkipDesignConfirmInput = (body, practiceRouting) => {
  const raw =
    body?.skipDesignConfirm !== undefined
      ? body.skipDesignConfirm
      : practiceRouting?.skipDesignConfirm;
  if (raw === false || raw === "false" || raw === 0 || raw === "0") return false;
  if (raw === true || raw === "true" || raw === 1 || raw === "1") return true;
  return true;
};

/** body/routing에서 skipJig 파싱. 명시 false만 지그 필요, 그 외 기본 true(불필요) */
const parseSkipJigInput = (body, practiceRouting) => {
  const raw =
    body?.skipJig !== undefined ? body.skipJig : practiceRouting?.skipJig;
  if (raw === false || raw === "false" || raw === 0 || raw === "0" || raw === "N") {
    return false;
  }
  if (raw === true || raw === "true" || raw === 1 || raw === "1" || raw === "Y") {
    return true;
  }
  return true;
};

/** body에서 rushProcessing 파싱. 명시 true만 신속처리 */
const parseRushProcessingInput = (body, practiceRouting) => {
  const raw =
    body?.rushProcessing !== undefined
      ? body.rushProcessing
      : practiceRouting?.rushProcessing;
  if (raw === true || raw === "true" || raw === 1 || raw === "1" || raw === "Y") {
    return true;
  }
  return false;
};

/** 의뢰수락 이전 공정만 치과 cancel-batch(휴지통) 허용 */
const canCancelPracticeTransferByManufacturerStage = (stage) => {
  const s = String(stage || "").trim();
  return (
    s === "발송완료" ||
    s === "수신완료" ||
    s === "자동매칭" ||
    s === "하청대기" ||
    s === "작업취소"
  );
};

const toVirtualRequestRows = (transferDoc) => {
  const transferId = String(transferDoc?.transferId || "").trim();
  const matchingMode = isAutoMatchMode(transferDoc) ? "auto" : "direct";
  const labIdentity = redactAutoMatchLabIdentity(matchingMode, {
    targetLabName: String(transferDoc?.targetLabName || "").trim(),
    targetLabAnchorId: transferDoc?.targetLabAnchorId || null,
  });
  const targetLabName = labIdentity.targetLabName;
  const transferMemo = String(transferDoc?.transferMemo || "").trim();
  const message = `[기공소: ${targetLabName}] ${transferMemo}\n[전송ID: ${transferId}]`;
  const files = Array.isArray(transferDoc?.files) ? transferDoc.files : [];
  const autoFields = toAutoMatchApiFields(transferDoc);

  const production =
    transferDoc?.production && typeof transferDoc.production === "object"
      ? transferDoc.production
      : {};
  const resultFiles = Array.isArray(transferDoc?.resultFiles)
    ? transferDoc.resultFiles
    : [];
  const toothWorks = Array.isArray(transferDoc?.toothWorks)
    ? transferDoc.toothWorks
    : [];

  const manufacturerStage = resolvePracticeTransferManufacturerStage(transferDoc);
  const remakeFields = toRemakeApiFields(transferDoc);

  // 첨부 파일 없는 전송도 최근 의뢰 목록에 보이도록 placeholder row 1건 생성
  const memoPatientMatch = transferMemo.match(/\[\s*환자명\s*:\s*([^\]]+)\]/);
  const memoPatientName = String(memoPatientMatch?.[1] || "").trim();
  const sourceRows = files.length > 0 ? files : [null];

  return sourceRows.map((item, idx) => ({
    _id: `${String(transferDoc._id)}:${idx + 1}`,
    requestId: `${transferId}-${idx + 1}`,
    transferId,
    manufacturerStage,
    ...remakeFields,
    createdAt: transferDoc?.createdAt,
    practiceTransferId: String(transferDoc?._id || ""),
    matchingMode,
    autoMatch: autoFields.autoMatch,
    toothWorks,
    hasCustomAbutment: hasCustomAbutmentToothWorks(toothWorks),
    resultFiles: resultFiles.map((rf, rfIdx) => ({
      id: `${String(transferDoc._id)}::result::${rfIdx + 1}`,
      patientName: String(rf?.patientName || "").trim(),
      tooth: String(rf?.tooth || "").trim(),
      originalName: String(rf?.file?.originalName || "").trim(),
      mimetype: String(rf?.file?.mimetype || "application/octet-stream").trim(),
      size: Number(rf?.file?.size || 0),
      s3Key: String(rf?.file?.s3Key || "").trim(),
    })),
    production: toProductionApiFields(production),
    canRateLab: Boolean(String(transferDoc?.targetLabAnchorId || "").trim()),
    labRating: null,
    caseInfos: {
      clinicName: "",
      patientName: String(item?.patientName || memoPatientName || "").trim(),
      tooth: String(item?.tooth || "").trim(),
      file: {
        originalName: String(item?.file?.originalName || "").trim(),
        name: String(item?.file?.originalName || "").trim(),
        s3Key: String(item?.file?.s3Key || "").trim(),
        size: Number(item?.file?.size || 0),
        mimetype: String(item?.file?.mimetype || "application/octet-stream").trim(),
      },
      newSystemRequest: {
        tag: String(transferDoc?.tag || "practice_file_transfer").trim(),
        message,
      },
      practiceRouting: {
        targetLabAnchorId: labIdentity.targetLabAnchorId,
        targetLabName,
        matchingMode,
      },
    },
  }));
};

const buildReceivedScope = async (req) => {
  const role = String(req.user?.role || "").trim();
  if (role === "admin") {
    return { role, scope: {}, labAnchorId: null, autoMatchEligible: false };
  }

  const targetLabAnchorId = String(req.user?.businessAnchorId || "").trim();
  if (!targetLabAnchorId || !Types.ObjectId.isValid(targetLabAnchorId)) {
    return { role, scope: null, labAnchorId: null, autoMatchEligible: false };
  }

  const eligibleCacheKey = `auto-match-eligible-lab:${targetLabAnchorId}`;
  const cachedEligible = getRequestPerfCacheValue(eligibleCacheKey);
  const autoMatchEligible =
    typeof cachedEligible === "boolean"
      ? cachedEligible
      : await (async () => {
          const eligible = await isLabAnchorAutoMatchEligible(targetLabAnchorId);
          setRequestPerfCacheValue(eligibleCacheKey, eligible, 60 * 1000);
          return eligible;
        })();
  const scope = buildReceivedScopeWithAutoMatch({
    labAnchorId: targetLabAnchorId,
    autoMatchEligible,
  });

  return {
    role,
    scope,
    labAnchorId: targetLabAnchorId,
    autoMatchEligible,
  };
};

const resolveUnreadCountForAccept = (labAnchorId, { wasUnread }) => {
  const cached = getRequestPerfCacheValue(unreadCountCacheKey(labAnchorId));
  const cachedCount = Number(cached?.unreadCount);
  if (Number.isFinite(cachedCount)) {
    const next = Math.max(0, cachedCount - (wasUnread ? 1 : 0));
    setRequestPerfCacheValue(
      unreadCountCacheKey(labAnchorId),
      { unreadCount: next },
      10 * 1000,
    );
    return next;
  }
  return null;
};

const buildAcceptedBillingFields = (doc, billingResult) => {
  if (!billingResult?.billed && !billingResult?.fees) return null;
  const now = new Date();
  return {
    ...(doc.billing && typeof doc.billing === "object" ? doc.billing : {}),
    labFeeTotal: billingResult.fees?.labFeeTotal || 0,
    abutmentRetailTotal: billingResult.fees?.abutmentRetailTotal || 0,
    abutmentQty: billingResult.fees?.abutmentQty || 0,
    total: billingResult.fees?.total || 0,
    isTradingPartner: Boolean(billingResult.isPartner),
    relationshipKind: billingResult.relationshipKind || "none",
    feeRateApplied: Number(billingResult.feeRateApplied || 0),
    labFeeMultiplier: Number(billingResult.labFeeMultiplier || 1),
    labTradingPartnerId: billingResult.labTradingPartnerId || null,
    labSettlementAmount: billingResult.labSettlementAmount || 0,
    abutsRevenueAmount: billingResult.abutsRevenueAmount || 0,
    billedAt: now,
    heldAt: doc.billing?.heldAt || now,
    heldTotal:
      billingResult.heldTotal != null
        ? Number(billingResult.heldTotal)
        : Number(billingResult.fees?.total || doc.billing?.heldTotal || 0),
    heldLabTotal:
      billingResult.heldLabTotal != null
        ? Number(billingResult.heldLabTotal)
        : Number(
            billingResult.fees?.labFeeTotal || doc.billing?.heldLabTotal || 0,
          ),
    heldAbutmentTotal:
      billingResult.heldAbutmentTotal != null
        ? Number(billingResult.heldAbutmentTotal)
        : Number(
            billingResult.fees?.abutmentRetailTotal ||
              doc.billing?.heldAbutmentTotal ||
              0,
          ),
    heldShippingLabTotal:
      billingResult.heldShippingLabTotal != null
        ? Number(billingResult.heldShippingLabTotal)
        : Number(doc.billing?.heldShippingLabTotal || 0),
    heldShippingAbutsTotal:
      billingResult.heldShippingAbutsTotal != null
        ? Number(billingResult.heldShippingAbutsTotal)
        : Number(doc.billing?.heldShippingAbutsTotal || 0),
    holdFromPaid:
      billingResult.fromPaid != null
        ? Number(billingResult.fromPaid)
        : Number(doc.billing?.holdFromPaid || 0),
    holdFromFreeRequest:
      billingResult.fromFreeRequest != null
        ? Number(billingResult.fromFreeRequest)
        : Number(doc.billing?.holdFromFreeRequest || 0),
    holdFromFreeShipping:
      billingResult.fromFreeShipping != null
        ? Number(billingResult.fromFreeShipping)
        : Number(doc.billing?.holdFromFreeShipping || 0),
    isRemake: toRemakeApiFields(doc).isRemake,
  };
};

const persistAcceptedBillingFields = async (doc, billingResult) => {
  if (!doc?._id) return doc?.billing || null;
  const billing = buildAcceptedBillingFields(doc, billingResult);
  if (!billing) return doc?.billing || null;
  // 전체 doc.save()는 toothWorks 등 대량 필드를 다시 써 Atlas RTT를 키운다.
  await PracticeTransfer.updateOne({ _id: doc._id }, { $set: { billing } });
  doc.billing = billing;
  return billing;
};

/** 수락 직후 치과/기공소 실시간 페이로드용 확정 기공비 견적 */
const buildAcceptedFeeQuotePayload = (billingResult, doc) => {
  if (billingResult?.fees && (billingResult?.billed || billingResult?.adjusted !== undefined)) {
    return toFeeQuoteApi({
      fees: billingResult.fees,
      relationshipKind: billingResult.relationshipKind || "none",
      feeRateApplied: billingResult.feeRateApplied,
      labFeeMultiplier: billingResult.labFeeMultiplier,
      labSettlementAmount: billingResult.labSettlementAmount,
      abutsRevenueAmount: billingResult.abutsRevenueAmount,
      labTradingPartnerId: billingResult.labTradingPartnerId
        ? String(billingResult.labTradingPartnerId)
        : null,
      billed: true,
      usedDefaultSchedule: false,
      isRemake: toRemakeApiFields(doc).isRemake,
      // 확정 후에는 예산 구간 대신 확정 금액 표시
      autoMatchBudget: null,
    });
  }
  if (doc?.billing?.billedAt) {
    return feeQuoteFromBillingDoc(doc.billing, { billed: true });
  }
  return null;
};

const scheduleAcceptSideEffects = ({
  doc,
  labAnchorId,
  labOid,
  scope,
  labUserId,
  billingResult,
  realtimePayload,
  practiceRealtimePayload = null,
  poolPayload = null,
  systemChatContent = "",
}) => {
  void (async () => {
    try {
      // 시스템 메시지는 채팅방이 있어야 하므로 먼저 확보한다.
      await ensurePracticeTransferChatRoomOnAccept({
        transferDoc: doc,
        labUserId,
      });
      const jobs = [
        PracticeTransfer.countDocuments({
          ...scope,
          status: { $ne: "canceled" },
          requestorReadAt: null,
        }).then((unreadCount) => {
          if (labAnchorId) {
            setRequestPerfCacheValue(
              unreadCountCacheKey(labAnchorId),
              { unreadCount },
              10 * 1000,
            );
          }
        }),
      ];
      const chatText = String(systemChatContent || "").trim();
      if (chatText) {
        jobs.push(
          postPracticeTransferSystemChatMessage({
            transferMongoId: doc._id,
            senderUserId: labUserId,
            content: chatText,
            systemEvent: "work_accept",
          }),
        );
      }
      if (billingResult?.billed) {
        // 에스크로: 생성 시 이미 보류됨. 수락은 조정분만 알림(또는 silent refetch).
        const adjustDelta =
          billingResult.heldTotal != null && doc.billing?.heldTotal != null
            ? Number(billingResult.heldTotal) - Number(doc.billing.heldTotal)
            : 0;
        if (doc.practiceBusinessAnchorId) {
          jobs.push(
            emitCreditBalanceUpdatedToBusiness({
              businessAnchorId: doc.practiceBusinessAnchorId,
              balanceDelta: Number.isFinite(adjustDelta) ? -adjustDelta : 0,
              reason: "practice_transfer_hold_adjust",
              refId: doc._id,
              forceEmit: true,
            }),
          );
        }
        // 기공크레딧 지급은 작업완료(release) 시점
      }
      if (practiceRealtimePayload) {
        jobs.push(
          emitPracticeTransferEventToPracticeUsers({
            practiceBusinessAnchorId: doc.practiceBusinessAnchorId,
            type: "practice:transfer-updated",
            payload: practiceRealtimePayload,
            extraUserIds: [doc.practiceUserId],
          }),
        );
      }
      if (realtimePayload && labOid) {
        jobs.push(
          emitPracticeTransferEventToRequestorUsers({
            targetLabAnchorId: labOid,
            type: "practice:transfer-updated",
            payload: realtimePayload,
          }),
        );
      }
      if (poolPayload) {
        jobs.push(
          emitAutoMatchPoolCreated(poolPayload, {
            eligibleLabAnchorIds: doc.autoMatch?.eligibleLabAnchorIds,
          }),
        );
      }
      await Promise.all(jobs);
    } catch (err) {
      console.warn(
        "[practiceTransfer] accept side-effects failed",
        err?.message || err,
      );
    }
  })();
};

const toDraftResponse = (doc, ownerMeta = null) => {
  if (!doc) return null;
  const files = Array.isArray(doc.files) ? doc.files : [];
  const practiceUserId = String(doc.practiceUserId || "").trim() || null;
  const staffName = String(
    ownerMeta?.practiceProfile?.staffName ||
      ownerMeta?.name ||
      ownerMeta?.email ||
      "",
  ).trim();

  return {
    _id: String(doc._id || ""),
    practiceUserId,
    practiceUserLabel: staffName || practiceUserId || "",
    targetLabAnchorId: String(doc.targetLabAnchorId || "").trim() || null,
    targetLabName: String(doc.targetLabName || "").trim(),
    transferMemo: String(doc.transferMemo || "").trim(),
    files: files
      .map((row) => ({
        fileId: String(row?.fileId || "").trim(),
        originalName: String(row?.originalName || "").trim(),
        mimetype: String(row?.mimetype || "application/octet-stream").trim(),
        size: Number(row?.size || 0),
        s3Key: String(row?.s3Key || "").trim(),
        location: String(row?.location || "").trim(),
      }))
      .filter((row) => row.fileId && row.originalName && row.s3Key),
    deletedAt: doc.deletedAt || null,
    updatedAt: doc.updatedAt || null,
    createdAt: doc.createdAt || null,
  };
};

/** draft-upserted 실시간 이벤트에 폼 스냅샷을 실어 수신측 GET RTT를 제거한다. */
const toDraftUpsertedRealtimePayload = ({
  source,
  draftPayload,
  practiceUserId,
  editorUserId,
  practiceBusinessAnchorId,
  forceResync = false,
}) => ({
  source: String(source || "").trim(),
  action: "draft-upserted",
  draftId: draftPayload?._id || null,
  practiceUserId: String(practiceUserId || "").trim(),
  editorUserId: String(editorUserId || "").trim() || null,
  practiceUserLabel: draftPayload?.practiceUserLabel || "",
  practiceBusinessAnchorId:
    String(practiceBusinessAnchorId || "").trim() || null,
  targetLabAnchorId: draftPayload?.targetLabAnchorId || null,
  targetLabName: draftPayload?.targetLabName || "",
  transferMemo: String(draftPayload?.transferMemo || ""),
  files: Array.isArray(draftPayload?.files) ? draftPayload.files : [],
  fileCount: Array.isArray(draftPayload?.files) ? draftPayload.files.length : 0,
  updatedAt: draftPayload?.updatedAt || null,
  createdAt: draftPayload?.createdAt || null,
  forceResync: Boolean(forceResync),
});

let draftIndexEnsurePromise = null;
const ensurePracticeTransferDraftIndexes = async () => {
  if (draftIndexEnsurePromise) return draftIndexEnsurePromise;
  draftIndexEnsurePromise = (async () => {
    // 레거시 unique(사용자당 활성 1건) 제거 — 다중 활성 draft 허용
    for (const name of ["practiceUserId_1", "practiceUserId_active_unique"]) {
      try {
        await PracticeTransferDraft.collection.dropIndex(name);
      } catch {
        // ignore (없거나 이름 다름)
      }
    }
    try {
      await PracticeTransferDraft.syncIndexes();
    } catch (error) {
      console.warn("[practice-transfer-draft] syncIndexes failed:", error?.message || error);
    }
  })();
  return draftIndexEnsurePromise;
};

const loadDraftOwnerMetaByIds = async (userIds) => {
  const ids = [
    ...new Set(
      (Array.isArray(userIds) ? userIds : [])
        .map((id) => String(id || "").trim())
        .filter((id) => Types.ObjectId.isValid(id)),
    ),
  ];
  if (ids.length === 0) return new Map();

  const users = await User.find({
    _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
  })
    .select({
      _id: 1,
      name: 1,
      email: 1,
      "practiceProfile.staffName": 1,
    })
    .lean();

  return new Map(users.map((u) => [String(u?._id || "").trim(), u]));
};

const resolveRequestorUserIdsByAnchor = async (anchorId) => {
  const raw = String(anchorId || "").trim();
  if (!raw || !Types.ObjectId.isValid(raw)) return [];

  const users = await User.find({
    businessAnchorId: new Types.ObjectId(raw),
    role: { $in: ["requestor", "internalLab"] },
    active: true,
  })
    .select({ _id: 1 })
    .lean();

  return users
    .map((u) => String(u?._id || "").trim())
    .filter(Boolean);
};

const PRACTICE_PEER_USER_CACHE_TTL_MS = 30 * 1000;

const resolvePracticeUserIdsByAnchor = async (anchorId) => {
  const raw = String(anchorId || "").trim();
  if (!raw || !Types.ObjectId.isValid(raw)) return [];

  const cacheKey = `practice-peer-users:${raw}`;
  const cached = getRequestPerfCacheValue(cacheKey);
  if (Array.isArray(cached)) return cached;

  return withRequestPerfInFlight(cacheKey, async () => {
    // 레거시 practice + 신규 requestor(practice 발신) 동료를 함께 포함한다.
    const users = await User.find({
      businessAnchorId: new Types.ObjectId(raw),
      role: { $in: ["practice", "requestor"] },
      active: true,
    })
      .select({ _id: 1 })
      .lean();

    const ids = users
      .map((u) => String(u?._id || "").trim())
      .filter(Boolean);
    setRequestPerfCacheValue(cacheKey, ids, PRACTICE_PEER_USER_CACHE_TTL_MS);
    return ids;
  });
};

/** 발신 API 역할 allowlist. 세부 capability는 authorizePracticeTransferSend가 검증한다. */
const isPracticeTransferSenderRole = (role) => {
  const r = String(role || "").trim();
  return r === "practice" || r === "requestor" || r === "admin";
};

/**
 * practice 전송 목록/취소/복구/임시저장 권한 범위.
 * 동일 치과(businessAnchor) 구성원은 동료 전송·임시저장을 공유한다.
 * - 문서의 practiceBusinessAnchorId 일치
 * - 또는 동일 치과 practice 멤버가 업로드한 레거시(앵커 미기입) 문서
 * 앵커가 없는 계정은 업로더 본인만 포함한다.
 */
const buildPracticeOwnedScope = async (req) => {
  const role = String(req.user?.role || "").trim();
  if (role === "admin") {
    return {
      role,
      scope: {},
      practiceUserObjectIds: req.user?._id ? [req.user._id] : [],
    };
  }

  const practiceUserId = req.user?._id || null;
  const practiceBusinessAnchorId = String(req.user?.businessAnchorId || "").trim();
  if (
    practiceBusinessAnchorId &&
    Types.ObjectId.isValid(practiceBusinessAnchorId)
  ) {
    const peerUserIds = await resolvePracticeUserIdsByAnchor(
      practiceBusinessAnchorId,
    );
    const practiceUserObjectIds = Array.from(
      new Set(
        [String(practiceUserId || "").trim(), ...peerUserIds].filter(Boolean),
      ),
    )
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    return {
      role,
      scope: {
        $or: [
          {
            practiceBusinessAnchorId: new Types.ObjectId(
              practiceBusinessAnchorId,
            ),
          },
          {
            practiceBusinessAnchorId: null,
            practiceUserId: {
              $in: practiceUserObjectIds.length
                ? practiceUserObjectIds
                : practiceUserId
                  ? [practiceUserId]
                  : [],
            },
          },
        ],
      },
      practiceUserObjectIds,
    };
  }

  return {
    role,
    scope: { practiceUserId },
    practiceUserObjectIds: practiceUserId ? [practiceUserId] : [],
  };
};

const transferCreatedAtMs = (doc) => {
  const ts = new Date(doc?.createdAt || 0).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

const mergeNewestTransferDocs = (left, right, limit) => {
  const a = Array.isArray(left) ? left : [];
  const b = Array.isArray(right) ? right : [];
  const seen = new Set();
  const out = [];
  let i = 0;
  let j = 0;
  while (out.length < limit && (i < a.length || j < b.length)) {
    const da = i < a.length ? a[i] : null;
    const db = j < b.length ? b[j] : null;
    let pick = null;
    if (!da) {
      pick = db;
      j += 1;
    } else if (!db) {
      pick = da;
      i += 1;
    } else {
      const ta = transferCreatedAtMs(da);
      const tb = transferCreatedAtMs(db);
      if (ta > tb || (ta === tb && String(da?._id || "") > String(db?._id || ""))) {
        pick = da;
        i += 1;
      } else {
        pick = db;
        j += 1;
      }
    }
    const id = String(pick?._id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(pick);
  }
  return out;
};

const fetchOwnedPracticeTransfersPage = async ({
  scope,
  practiceBusinessAnchorId,
  practiceUserObjectIds,
  skip,
  limit,
}) => {
  const pageSize = Math.max(1, Number(limit) || 1);
  const offset = Math.max(0, Number(skip) || 0);
  const take = pageSize + 1;
  const sort = { createdAt: -1, _id: -1 };
  const anchorId = String(practiceBusinessAnchorId || "").trim();
  const canSplit =
    Boolean(anchorId) &&
    Types.ObjectId.isValid(anchorId) &&
    scope &&
    typeof scope === "object" &&
    Array.isArray(scope.$or);

  if (canSplit) {
    const ownerIds = Array.isArray(practiceUserObjectIds)
      ? practiceUserObjectIds
      : [];
    const fetchLimit = offset + take;
    const [byAnchor, byLegacy] = await Promise.all([
      PracticeTransfer.find({
        practiceBusinessAnchorId: new Types.ObjectId(anchorId),
      })
        .sort(sort)
        .limit(fetchLimit)
        .lean(),
      ownerIds.length
        ? PracticeTransfer.find({
            practiceBusinessAnchorId: null,
            practiceUserId: { $in: ownerIds },
          })
            .sort(sort)
            .limit(fetchLimit)
            .lean()
        : Promise.resolve([]),
    ]);
    return mergeNewestTransferDocs(byAnchor, byLegacy, fetchLimit).slice(offset);
  }

  return PracticeTransfer.find(scope)
    .sort(sort)
    .skip(offset)
    .limit(take)
    .lean();
};

const buildTransferIdFilter = (rawTransferId) => {
  const value = String(rawTransferId || "").trim();
  if (!value) return null;
  if (Types.ObjectId.isValid(value)) {
    return {
      $or: [{ transferId: value }, { _id: new Types.ObjectId(value) }],
    };
  }
  return { transferId: value };
};

const emitPracticeTransferEventToRequestorUsers = async ({
  targetLabAnchorId,
  type,
  payload,
}) => {
  try {
    const eventType = String(type || "").trim();
    if (!eventType) return;

    const userIds = await resolveRequestorUserIdsByAnchor(targetLabAnchorId);
    if (!userIds.length) return;

    userIds.forEach((userId) => {
      emitAppEventToUser(userId, eventType, payload);
    });
  } catch {
    // 실시간 이벤트 실패가 본 API 성공/실패를 좌우하지 않도록 무시
  }
};

const emitPracticeTransferEventToPracticeUsers = async ({
  practiceBusinessAnchorId,
  type,
  payload,
  extraUserIds = [],
}) => {
  try {
    const eventType = String(type || "").trim();
    if (!eventType) return;

    const userIdSet = new Set([
      ...(await resolvePracticeUserIdsByAnchor(practiceBusinessAnchorId)),
      ...extraUserIds
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ]);
    if (!userIdSet.size) return;

    userIdSet.forEach((userId) => {
      emitAppEventToUser(userId, eventType, payload);
    });
  } catch {
    // 실시간 이벤트 실패가 본 API 성공/실패를 좌우하지 않도록 무시
  }
};

export async function getMyPracticeTransferDraft(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferSenderRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const rawDraftId = String(req.query?.draftId || "").trim();
    let doc = null;
    let ownerMeta = req.user;

    if (rawDraftId && Types.ObjectId.isValid(rawDraftId)) {
      // 같은 케이스(불러온 임시저장) 조회: 동일 치과 범위 draft (휴지통 제외)
      const { scope } = await buildPracticeOwnedScope(req);
      doc = await PracticeTransferDraft.findOne({
        _id: new Types.ObjectId(rawDraftId),
        deletedAt: null,
        ...scope,
      }).lean();
      if (doc?.practiceUserId) {
        const ownerMap = await loadDraftOwnerMetaByIds([doc.practiceUserId]);
        ownerMeta =
          ownerMap.get(String(doc.practiceUserId || "").trim()) || req.user;
      }
    } else {
      // 기본: 본인이 만든 활성 draft 중 가장 최근 건
      doc = await PracticeTransferDraft.findOne({
        practiceUserId: req.user?._id,
        deletedAt: null,
      })
        .sort({ updatedAt: -1 })
        .lean();
    }

    return res.status(200).json({
      success: true,
      data: toDraftResponse(doc, ownerMeta),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "practice 전송 임시저장 조회 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function listPracticeTransferDrafts(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferSenderRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const trashedRaw = String(req.query?.trashed || "").trim().toLowerCase();
    const includeBoth = trashedRaw === "all" || trashedRaw === "both";
    const trashedOnly = trashedRaw === "1" || trashedRaw === "true";

    const { scope } = await buildPracticeOwnedScope(req);
    const docs = await PracticeTransferDraft.find({
      ...scope,
      ...(includeBoth
        ? {}
        : trashedOnly
          ? { deletedAt: { $ne: null } }
          : { deletedAt: null }),
    })
      .sort({ updatedAt: -1, _id: -1 })
      .lean();

    const ownerMap = await loadDraftOwnerMetaByIds(
      docs.map((doc) => doc?.practiceUserId),
    );
    const toRow = (doc) =>
      toDraftResponse(
        doc,
        ownerMap.get(String(doc?.practiceUserId || "").trim()) || null,
      );

    if (includeBoth) {
      const drafts = [];
      const trashed = [];
      for (const doc of docs) {
        const row = toRow(doc);
        if (!row) continue;
        if (doc?.deletedAt) trashed.push(row);
        else drafts.push(row);
      }
      return res.status(200).json({
        success: true,
        data: { drafts, trashed },
      });
    }

    return res.status(200).json({
      success: true,
      data: docs.map(toRow).filter(Boolean),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "practice 전송 임시저장 목록 조회 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function upsertPracticeTransferDraft(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferSenderRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const targetLabName = String(req.body?.targetLabName || "").trim();
    const transferMemo = String(req.body?.transferMemo || "").trim();
    const rawAnchorId = String(req.body?.targetLabAnchorId || "").trim();
    const targetLabAnchorId = Types.ObjectId.isValid(rawAnchorId)
      ? new Types.ObjectId(rawAnchorId)
      : null;

    const incomingFiles = Array.isArray(req.body?.files) ? req.body.files : [];
    // transferMemo는 날짜 메타만으로도 비어있지 않을 수 있어, 실질 내용 여부를 본다.
    const memoText = String(transferMemo || "");
    const patientNameMatch = memoText.match(/\[\s*환자명\s*:\s*([^\]]*)\]/);
    const hasPatientNameInMemo = Boolean(
      String(patientNameMatch?.[1] || "").trim(),
    );
    const hasLab = Boolean(targetLabName) || Boolean(targetLabAnchorId);
    // 임시저장/동기화: 기공소·환자명 둘 다 필수(치아·메모·파일만으로는 목록 누적 방지).
    const hasLabAndPatient = hasPatientNameInMemo && hasLab;

    if (
      await rejectIfSubcontractDirectBlocked(res, {
        practiceAnchorId: req.user?.businessAnchorId,
        matchingMode: "direct",
        labAnchorId: targetLabAnchorId,
      })
    ) {
      return;
    }

    let normalizedDraftFiles = [];

    if (!hasLabAndPatient) {
      return res.status(400).json({
        success: false,
        message: "기공소와 환자명을 모두 입력한 뒤 임시저장할 수 있습니다.",
      });
    }

    if (incomingFiles.length > 0) {
      const uniqueFileIds = [
        ...new Set(
          incomingFiles
            .map((row) => String(row?.fileId || row?._id || "").trim())
            .filter((id) => Types.ObjectId.isValid(id)),
        ),
      ];

      if (uniqueFileIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "유효한 임시 파일 ID가 없습니다.",
        });
      }

      const { practiceUserObjectIds } = await buildPracticeOwnedScope(req);
      const ownerIds = (practiceUserObjectIds || [])
        .map((id) => String(id || "").trim())
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));
      if (req.user?._id && Types.ObjectId.isValid(String(req.user._id))) {
        const selfId = String(req.user._id);
        if (!ownerIds.some((id) => String(id) === selfId)) {
          ownerIds.push(new Types.ObjectId(selfId));
        }
      }

      const ownedFiles = await File.find({
        _id: { $in: uniqueFileIds.map((id) => new Types.ObjectId(id)) },
        ...(ownerIds.length ? { uploadedBy: { $in: ownerIds } } : { uploadedBy: req.user?._id }),
      })
        .select({
          _id: 1,
          originalName: 1,
          mimetype: 1,
          size: 1,
          key: 1,
          location: 1,
        })
        .lean();

      const ownedById = new Map(
        ownedFiles.map((row) => [String(row?._id || "").trim(), row]),
      );

      normalizedDraftFiles = uniqueFileIds
        .map((id) => {
          const row = ownedById.get(id);
          if (!row) return null;
          return {
            fileId: row._id,
            originalName: String(row.originalName || "").trim(),
            mimetype: String(row.mimetype || "application/octet-stream").trim(),
            size: Number(row.size || 0),
            s3Key: String(row.key || "").trim(),
            location: String(row.location || "").trim(),
          };
        })
        .filter((row) => Boolean(row?.originalName) && Boolean(row?.s3Key));

      if (normalizedDraftFiles.length === 0) {
        return res.status(400).json({
          success: false,
          message: "사용 가능한 임시 파일을 찾지 못했습니다.",
        });
      }
    }

    const rawDraftId = String(req.body?.draftId || "").trim();
    let doc = null;

    await ensurePracticeTransferDraftIndexes();

    if (rawDraftId && Types.ObjectId.isValid(rawDraftId)) {
      // 불러온 임시저장(같은 케이스)에 join: 소유자는 유지하고 내용만 갱신
      const { scope } = await buildPracticeOwnedScope(req);
      const existing = await PracticeTransferDraft.findOne({
        _id: new Types.ObjectId(rawDraftId),
        deletedAt: null,
        ...scope,
      })
        .select({ _id: 1, practiceUserId: 1 })
        .lean();

      if (existing?._id) {
        doc = await PracticeTransferDraft.findOneAndUpdate(
          { _id: existing._id, deletedAt: null },
          {
            $set: {
              practiceBusinessAnchorId: req.user?.businessAnchorId || null,
              targetLabAnchorId,
              targetLabName,
              transferMemo,
              files: normalizedDraftFiles,
            },
          },
          { new: true },
        ).lean();
      }
      // 휴지통/삭제된 draftId(또는 권한 밖)면 아래에서 새 draft 생성
    }

    if (!doc) {
      // 새 케이스 · stale draftId 폴백: 항상 새 draft 생성
      // 기공소·환자명 게이트는 위에서 이미 통과했다.
      const created = await PracticeTransferDraft.create({
        practiceUserId: req.user?._id,
        practiceBusinessAnchorId: req.user?.businessAnchorId || null,
        targetLabAnchorId,
        targetLabName,
        transferMemo,
        files: normalizedDraftFiles,
        deletedAt: null,
      });
      doc = await PracticeTransferDraft.findById(created._id).lean();
    }

    const ownerMap = await loadDraftOwnerMetaByIds([doc?.practiceUserId]);
    const ownerMeta =
      ownerMap.get(String(doc?.practiceUserId || "").trim()) || req.user;
    const draftPayload = toDraftResponse(doc, ownerMeta);
    const forceResync = Boolean(req.body?.forceResync);
    await emitPracticeTransferEventToPracticeUsers({
      practiceBusinessAnchorId: req.user?.businessAnchorId,
      type: "practice:transfer-updated",
      payload: toDraftUpsertedRealtimePayload({
        source: "upsertPracticeTransferDraft",
        draftPayload,
        practiceUserId: doc?.practiceUserId || req.user?._id,
        editorUserId: req.user?._id,
        practiceBusinessAnchorId: req.user?.businessAnchorId,
        forceResync,
      }),
      extraUserIds: [req.user?._id],
    });

    return res.status(200).json({
      success: true,
      message: "practice 전송 임시저장을 갱신했습니다.",
      data: {
        ...draftPayload,
        forceResync,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "practice 전송 임시저장 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function clearMyPracticeTransferDraft(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferSenderRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    await ensurePracticeTransferDraftIndexes();

    // 소프트 삭제(휴지통). draftId가 오면 동일 치과 범위의 해당 draft.
    const rawDraftId = String(req.body?.draftId || req.query?.draftId || "").trim();
    const now = new Date();
    let clearedDoc = null;

    if (rawDraftId && Types.ObjectId.isValid(rawDraftId)) {
      const { scope } = await buildPracticeOwnedScope(req);
      clearedDoc = await PracticeTransferDraft.findOneAndUpdate(
        {
          _id: new Types.ObjectId(rawDraftId),
          deletedAt: null,
          ...scope,
        },
        { $set: { deletedAt: now } },
        { new: true },
      )
        .select({ _id: 1, practiceUserId: 1, deletedAt: 1 })
        .lean();
    } else {
      // draftId 없으면 본인 최신 활성 1건만 휴지통으로 (다중 활성)
      clearedDoc = await PracticeTransferDraft.findOneAndUpdate(
        { practiceUserId: req.user?._id, deletedAt: null },
        { $set: { deletedAt: now } },
        { new: true, sort: { updatedAt: -1 } },
      )
        .select({ _id: 1, practiceUserId: 1, deletedAt: 1 })
        .lean();
    }

    const clearedDraftId = clearedDoc?._id ? String(clearedDoc._id) : null;
    if (clearedDraftId) {
      await emitPracticeTransferEventToPracticeUsers({
        practiceBusinessAnchorId: req.user?.businessAnchorId,
        type: "practice:transfer-updated",
        payload: {
          source: "clearMyPracticeTransferDraft",
          action: "draft-cleared",
          draftId: clearedDraftId,
          practiceUserId: String(
            clearedDoc?.practiceUserId || req.user?._id || "",
          ),
          practiceBusinessAnchorId:
            String(req.user?.businessAnchorId || "").trim() || null,
        },
        extraUserIds: [req.user?._id],
      });
    }

    return res.status(200).json({
      success: true,
      message: "practice 전송 임시저장을 휴지통으로 옮겼습니다.",
      data: clearedDoc ? toDraftResponse(clearedDoc, req.user) : null,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "practice 전송 임시저장 삭제 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function clearAllPracticeTransferDrafts(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferSenderRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    await ensurePracticeTransferDraftIndexes();

    const { scope } = await buildPracticeOwnedScope(req);
    const docs = await PracticeTransferDraft.find({
      ...scope,
      deletedAt: null,
    })
      .select({ _id: 1, practiceUserId: 1 })
      .lean();

    const draftIds = docs
      .map((doc) => String(doc?._id || "").trim())
      .filter((id) => Types.ObjectId.isValid(id));
    const now = new Date();

    if (draftIds.length > 0) {
      await PracticeTransferDraft.updateMany(
        {
          _id: { $in: draftIds.map((id) => new Types.ObjectId(id)) },
          deletedAt: null,
        },
        { $set: { deletedAt: now } },
      );
    }

    await emitPracticeTransferEventToPracticeUsers({
      practiceBusinessAnchorId: req.user?.businessAnchorId,
      type: "practice:transfer-updated",
      payload: {
        source: "clearAllPracticeTransferDrafts",
        action: "drafts-cleared",
        draftIds,
        draftClearedCount: draftIds.length,
        practiceBusinessAnchorId:
          String(req.user?.businessAnchorId || "").trim() || null,
        updatedAt: now,
      },
      extraUserIds: [req.user?._id],
    });

    return res.status(200).json({
      success: true,
      message: "임시저장을 모두 휴지통으로 옮겼습니다.",
      data: {
        draftClearedCount: draftIds.length,
        draftIds,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "임시저장 전체삭제 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function restorePracticeTransferDraft(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferSenderRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    await ensurePracticeTransferDraftIndexes();

    const rawDraftId = String(req.body?.draftId || req.query?.draftId || "").trim();
    if (!rawDraftId || !Types.ObjectId.isValid(rawDraftId)) {
      return res.status(400).json({ success: false, message: "draftId가 필요합니다." });
    }

    const { scope } = await buildPracticeOwnedScope(req);
    const trashed = await PracticeTransferDraft.findOne({
      _id: new Types.ObjectId(rawDraftId),
      deletedAt: { $ne: null },
      ...scope,
    }).lean();

    if (!trashed?._id) {
      return res.status(404).json({
        success: false,
        message: "휴지통에서 임시저장을 찾지 못했습니다.",
      });
    }

    // 다중 활성 draft 허용: 복구 시 다른 활성 건을 휴지통으로 보내지 않는다.
    const restored = await PracticeTransferDraft.findOneAndUpdate(
      { _id: trashed._id },
      { $set: { deletedAt: null } },
      { new: true },
    ).lean();

    const ownerMap = await loadDraftOwnerMetaByIds([restored?.practiceUserId]);
    const ownerMeta =
      ownerMap.get(String(restored?.practiceUserId || "").trim()) || req.user;
    const draftPayload = toDraftResponse(restored, ownerMeta);

    await emitPracticeTransferEventToPracticeUsers({
      practiceBusinessAnchorId: req.user?.businessAnchorId,
      type: "practice:transfer-updated",
      payload: toDraftUpsertedRealtimePayload({
        source: "restorePracticeTransferDraft",
        draftPayload,
        practiceUserId: restored?.practiceUserId || req.user?._id,
        editorUserId: req.user?._id,
        practiceBusinessAnchorId: req.user?.businessAnchorId,
      }),
      extraUserIds: [req.user?._id],
    });

    return res.status(200).json({
      success: true,
      message: "임시저장을 복구했습니다.",
      data: draftPayload,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "practice 전송 임시저장 복구 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function emptyPracticeTransferTrash(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferSenderRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    await ensurePracticeTransferDraftIndexes();

    const { scope: baseScope } = await buildPracticeOwnedScope(req);

    const [trashedDrafts, canceledTransfers] = await Promise.all([
      PracticeTransferDraft.find({
        ...baseScope,
        deletedAt: { $ne: null },
      })
        .select({ _id: 1, practiceUserId: 1 })
        .lean(),
      PracticeTransfer.find({
        $and: [baseScope, { status: "canceled" }],
      })
        .select({
          _id: 1,
          transferId: 1,
          practiceUserId: 1,
          practiceBusinessAnchorId: 1,
          targetLabAnchorId: 1,
        })
        .lean(),
    ]);

    const draftIds = trashedDrafts
      .map((doc) => String(doc?._id || "").trim())
      .filter(Boolean);
    const transferMongoIds = canceledTransfers
      .map((doc) => String(doc?._id || "").trim())
      .filter(Boolean);

    if (draftIds.length > 0) {
      await PracticeTransferDraft.deleteMany({
        _id: {
          $in: draftIds
            .filter((id) => Types.ObjectId.isValid(id))
            .map((id) => new Types.ObjectId(id)),
        },
      });
    }

    if (transferMongoIds.length > 0) {
      for (const transferMongoId of transferMongoIds) {
        try {
          await rollbackPracticeTransferBilling({
            transferId: transferMongoId,
            emitRealtime: true,
          });
        } catch (rollbackErr) {
          console.warn(
            "[practiceTransfer] trash-empty billing rollback failed",
            transferMongoId,
            rollbackErr?.message || rollbackErr,
          );
        }
      }
      const deletedOids = transferMongoIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));
      await PracticeTransfer.deleteMany({
        _id: { $in: deletedOids },
      });
      // 하드삭제된 의뢰 채팅방은 archive — 치과 사이드바 유령 unread 방지.
      if (deletedOids.length > 0) {
        try {
          await ChatRoom.updateMany(
            { relatedPracticeTransferId: { $in: deletedOids } },
            { $set: { isArchived: true } },
          );
        } catch (archiveErr) {
          console.warn(
            "[practiceTransfer] trash-empty chat room archive failed",
            archiveErr?.message || archiveErr,
          );
        }
      }
    }

    const affectedByAnchor = new Map();
    for (const doc of canceledTransfers) {
      const targetLabAnchorId = String(doc?.targetLabAnchorId || "").trim();
      const transferId = String(doc?.transferId || "").trim();
      const transferMongoId = String(doc?._id || "").trim();
      if (!targetLabAnchorId) continue;
      const prev = affectedByAnchor.get(targetLabAnchorId) || [];
      prev.push({ transferId, transferMongoId });
      affectedByAnchor.set(targetLabAnchorId, prev);
    }

    for (const [targetLabAnchorId, affected] of affectedByAnchor.entries()) {
      const scope = {
        targetLabAnchorId: new Types.ObjectId(targetLabAnchorId),
      };
      invalidateUnreadCountCache(scope);
      const unreadCount = await PracticeTransfer.countDocuments({
        ...scope,
        status: { $ne: "canceled" },
        requestorReadAt: null,
      });
      setRequestPerfCacheValue(
        unreadCountCacheKey(scope),
        { unreadCount },
        10 * 1000,
      );

      await emitPracticeTransferEventToRequestorUsers({
        targetLabAnchorId,
        type: "practice:transfer-updated",
        payload: {
          action: "purged",
          targetLabAnchorId,
          affectedTransfers: affected,
          unreadCount,
          status: "deleted",
          updatedAt: new Date(),
        },
      });
    }

    await emitPracticeTransferEventToPracticeUsers({
      practiceBusinessAnchorId: req.user?.businessAnchorId,
      type: "practice:transfer-updated",
      payload: {
        source: "emptyPracticeTransferTrash",
        action: "trash-emptied",
        draftIds,
        transferMongoIds,
        draftDeletedCount: draftIds.length,
        transferDeletedCount: transferMongoIds.length,
        practiceBusinessAnchorId:
          String(req.user?.businessAnchorId || "").trim() || null,
        updatedAt: new Date(),
      },
      extraUserIds: [req.user?._id],
    });

    invalidateAdminDashboardCaches();

    return res.status(200).json({
      success: true,
      message: "휴지통을 비웠습니다.",
      data: {
        draftDeletedCount: draftIds.length,
        transferDeletedCount: transferMongoIds.length,
        draftIds,
        transferMongoIds,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "휴지통 비우기 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function createPracticeTransfer(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferSenderRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const caseInfos = Array.isArray(req.body?.caseInfos) ? req.body.caseInfos : [];
    if (caseInfos.length === 0) {
      return res.status(400).json({ success: false, message: "caseInfos가 필요합니다." });
    }

    const first = caseInfos[0] || {};
    const nsr = first?.newSystemRequest || {};
    const practiceRouting = first?.practiceRouting || {};
    const message = String(nsr?.message || "").trim();
    const tag = String(nsr?.tag || "practice_file_transfer").trim();

    if (!PRACTICE_TAGS.includes(tag)) {
      return res.status(400).json({
        success: false,
        message: "practice 전송 태그가 아닙니다.",
      });
    }

    const transferId =
      String(req.body?.transferId || "").trim() ||
      extractTransferIdFromMessage(message) ||
      `PTX-${Date.now().toString(36).toUpperCase()}`;

    let targetLabName =
      String(req.body?.targetLabName || "").trim() ||
      String(practiceRouting?.targetLabName || "").trim() ||
      extractLabNameFromMessage(message);

    const rawAnchorId =
      String(req.body?.targetLabAnchorId || "").trim() ||
      String(practiceRouting?.targetLabAnchorId || "").trim();

    const matchingModeRaw = String(
      req.body?.matchingMode ||
        practiceRouting?.matchingMode ||
        "",
    )
      .trim()
      .toLowerCase();
    const resolvedTarget = await resolveCreateMatchingTarget({
      matchingModeRaw,
      autoMatchFlag:
        req.body?.autoMatch === true || practiceRouting?.autoMatch === true,
      rawAnchorId,
      targetLabName,
    });
    if (resolvedTarget.error) {
      return res.status(resolvedTarget.error.status).json({
        success: false,
        message: resolvedTarget.error.message,
      });
    }
    const matchingMode = resolvedTarget.matchingMode;
    const targetLabAnchorId = resolvedTarget.targetLabAnchorId;
    targetLabName = resolvedTarget.targetLabName;

    if (matchingMode === "direct" && !targetLabName && targetLabAnchorId) {
      const anchor = await BusinessAnchor.findById(targetLabAnchorId)
        .select({ name: 1 })
        .lean();
      targetLabName = String(anchor?.name || "").trim();
    }

    const transferMemo =
      String(req.body?.transferMemo || "").trim() || extractTransferMemoFromMessage(message);

    const files = mapPracticeTransferFilesFromCaseInfos(caseInfos);

    const toothWorksRaw =
      (Array.isArray(req.body?.toothWorks) && req.body.toothWorks) ||
      (Array.isArray(first?.toothWorks) && first.toothWorks) ||
      (Array.isArray(nsr?.toothWorks) && nsr.toothWorks) ||
      [];

    const practiceAnchorId = req.user?.businessAnchorId || null;
    if (!practiceAnchorId) {
      return res.status(400).json({
        success: false,
        message: "치과 사업자 정보가 필요합니다. 사업자 등록 후 다시 시도해주세요.",
      });
    }
    if (matchingMode === "direct" && !targetLabAnchorId) {
      return res.status(400).json({
        success: false,
        message: "대상 기공소를 선택해주세요.",
      });
    }
    if (
      await rejectIfSubcontractDirectBlocked(res, {
        practiceAnchorId,
        matchingMode,
        labAnchorId: targetLabAnchorId,
      })
    ) {
      return;
    }

    const skipDesignConfirm = parseSkipDesignConfirmInput(req.body, practiceRouting);
    const skipJig = resolvePracticeTransferSkipJig(
      toothWorksRaw,
      parseSkipJigInput(req.body, practiceRouting),
    );
    const rushProcessing = parseRushProcessingInput(req.body, practiceRouting);

    const arrivalPolicy = await resolvePracticeTransferArrivalPolicy({
      transferMemo,
      rushProcessing,
    });
    if (!arrivalPolicy.ok) {
      return res.status(arrivalPolicy.statusCode || 400).json({
        success: false,
        message: arrivalPolicy.message,
        reason: arrivalPolicy.reason,
        orderYmd: arrivalPolicy.orderYmd,
        arrivalYmd: arrivalPolicy.arrivalYmd,
        workPlusShipDays: arrivalPolicy.workPlusShipDays,
      });
    }
    const transferMemoResolved = arrivalPolicy.transferMemo;
    const rushFeeMultiplier = normalizeRushFeeMultiplier(
      arrivalPolicy.rushFeeMultiplier,
    );

    try {
      assertAbutmentPresetsComplete(toothWorksRaw);
    } catch (presetErr) {
      return res.status(400).json({
        success: false,
        message:
          presetErr?.message ||
          "어벗 프리셋(임플란트·스캔바디)을 선택해주세요.",
      });
    }

    try {
      assertOralScanFilesForCreate({
        matchingMode,
        toothWorks: toothWorksRaw,
        files,
      });
    } catch (scanErr) {
      const status = Number(scanErr?.statusCode || 400);
      return res.status(status >= 400 && status < 600 ? status : 400).json({
        success: false,
        message:
          scanErr?.message ||
          "자동매칭 의뢰는 구강스캔 파일이 필요합니다.",
        reason: scanErr?.code || "oral_scan_required_for_auto_match",
      });
    }

    // 잔액 검사 후 생성. 크레딧은 생성 시 에스크로 보류(기공 적립은 작업완료).
    const autoMatchBudget = null;
    const autoMatchEligibleLabAnchorIds = undefined;
    const autoMatchPriorityLabAnchorIds = [];
    const autoMatchCatalog = null;

    try {
      await assertPracticeTransferPaidCreditSufficient({
        practiceAnchorId,
        labAnchorId: targetLabAnchorId,
        toothWorks: toothWorksRaw,
        autoMatchBudget,
        catalog: autoMatchCatalog,
        rushFeeMultiplier,
        skipJig,
      });
    } catch (creditErr) {
      const status = Number(creditErr?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        success: false,
        message:
          creditErr?.message || "기공의뢰 전송 전 유료크레딧 확인에 실패했습니다.",
        ...(creditErr?.payload || {}),
      });
    }

    const feeQuote = await buildPracticeTransferQuote({
      practiceAnchorId,
      labAnchorId: targetLabAnchorId,
      toothWorks: toothWorksRaw,
      matchingMode,
      autoMatchBudget,
      catalog: autoMatchCatalog,
      rushFeeMultiplier,
    });

    const billingPreview = {
      ...toBillingPreviewFields(feeQuote),
      rushFeeMultiplier,
    };
    // feeQuote.autoMatchBudget에 합산 minLabFee/maxLabFee가 포함된다.

    const autoMatchPriorityFields =
      matchingMode === "auto"
        ? buildAutoMatchPriorityFields({
            eligibleLabAnchorIds: autoMatchEligibleLabAnchorIds || [],
            priorityLabAnchorIds: autoMatchPriorityLabAnchorIds || [],
          })
        : null;

    const transferDoc = await PracticeTransfer.create({
      transferId,
      practiceUserId: req.user?._id,
      practiceBusinessAnchorId: practiceAnchorId,
      targetLabAnchorId,
      targetLabName,
      assigneeLabAnchorId: matchingMode === "auto" ? null : undefined,
      assigneeLabName: matchingMode === "auto" ? "" : undefined,
      matchingMode,
      autoMatch:
        matchingMode === "auto"
          ? {
              claimedAt: null,
              deadlineAt: null,
              claimHours: null,
              completedAt: null,
              completedBy: null,
              releaseCount: 0,
              eligibleLabAnchorIds: autoMatchEligibleLabAnchorIds || [],
              priorityUntil: autoMatchPriorityFields?.priorityUntil ?? null,
              ...(autoMatchPriorityFields?.priorityLabAnchorIds
                ? {
                    priorityLabAnchorIds:
                      autoMatchPriorityFields.priorityLabAnchorIds,
                  }
                : {}),
            }
          : undefined,
      transferMemo: transferMemoResolved,
      tag,
      status: "active",
      files,
      toothWorks: toothWorksRaw,
      billing: billingPreview,
      production: {
        skipDesignConfirm,
        skipJig,
        rushProcessing,
        shippingMode: null,
        confirmedAt: null,
        confirmedBy: null,
        relatedRequestIds: [],
        designFiles: [],
        designReadyAt: null,
        labDesignConfirmedAt: null,
        practiceDesignConfirmedAt: null,
        abutmentProductionStartedAt: null,
      },
    });

    try {
      const holdResult = await holdPracticeTransferCredits({
        transfer: transferDoc,
        toothWorks: toothWorksRaw,
        holdAmount: Number(billingPreview?.total || feeQuote?.fees?.total || 0),
        holdLabAmount: Number(billingPreview?.labFeeTotal || 0),
        holdAbutmentAmount: Number(billingPreview?.abutmentRetailTotal || 0),
        actorUserId: req.user?._id,
      });
      if (holdResult?.held || holdResult?.reason === "already_held") {
        const heldAt = new Date();
        const heldBilling = {
          ...(transferDoc.billing && typeof transferDoc.billing === "object"
            ? transferDoc.billing
            : billingPreview),
          heldAt,
          heldTotal: Number(holdResult.heldTotal || billingPreview?.total || 0),
          heldLabTotal: Number(
            holdResult.heldLabTotal ?? billingPreview?.labFeeTotal ?? 0,
          ),
          heldAbutmentTotal: Number(
            holdResult.heldAbutmentTotal ??
              billingPreview?.abutmentRetailTotal ??
              0,
          ),
          heldDesignFeeTotal: Number(holdResult.heldDesignFeeTotal || 0),
          heldShippingLabTotal: Number(holdResult.heldShippingLabTotal || 0),
          heldShippingAbutsTotal: Number(
            holdResult.heldShippingAbutsTotal || 0,
          ),
          holdFromPaid: Number(holdResult.fromPaid || 0),
          holdFromFreeRequest: Number(holdResult.fromFreeRequest || 0),
          holdFromFreeShipping: Number(holdResult.fromFreeShipping || 0),
        };
        transferDoc.billing = heldBilling;
        await PracticeTransfer.updateOne(
          { _id: transferDoc._id },
          { $set: { billing: heldBilling } },
        );
        if (Number(holdResult.heldTotal || 0) > 0) {
          await emitCreditBalanceUpdatedToBusiness({
            businessAnchorId: practiceAnchorId,
            balanceDelta: -Number(holdResult.heldTotal || 0),
            reason: "practice_transfer_hold",
            refId: transferDoc._id,
          });
        }
      } else if (holdResult?.reason && holdResult.reason !== "zero_fee") {
        try {
          await rollbackPracticeTransferBilling({ transferId: transferDoc._id });
        } catch {
          // ignore
        }
        try {
          await PracticeTransfer.deleteOne({ _id: transferDoc._id });
        } catch {
          // ignore
        }
        return res.status(500).json({
          success: false,
          message: "기공의뢰 크레딧 보류에 실패했습니다.",
          reason: holdResult.reason,
        });
      }
    } catch (holdErr) {
      try {
        await rollbackPracticeTransferBilling({ transferId: transferDoc._id });
      } catch {
        // ignore
      }
      try {
        await PracticeTransfer.deleteOne({ _id: transferDoc._id });
      } catch {
        // ignore
      }
      const status = Number(holdErr?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        success: false,
        message: holdErr?.message || "기공의뢰 크레딧 보류에 실패했습니다.",
        ...(holdErr?.payload || {}),
      });
    }

    // 전송 성공 시 해당 임시저장은 완전 삭제(휴지통 아님). 최근 전송 내역만 남긴다.
    const rawDraftId = String(req.body?.draftId || "").trim();
    let clearedDraftId = null;
    try {
      let clearedDoc = null;
      if (rawDraftId && Types.ObjectId.isValid(rawDraftId)) {
        const { scope } = await buildPracticeOwnedScope(req);
        clearedDoc = await PracticeTransferDraft.findOneAndDelete({
          _id: new Types.ObjectId(rawDraftId),
          ...scope,
        })
          .select({ _id: 1, practiceUserId: 1 })
          .lean();
      }
      // draftId 없이 임의 활성 draft를 지우지 않는다(다중 활성 허용).
      clearedDraftId = clearedDoc?._id ? String(clearedDoc._id) : null;
    } catch {
      // 전송 자체는 성공 유지. draft 정리는 프론트에서 재시도할 수 있음.
    }

    const targetLabAnchorIdText = String(targetLabAnchorId || "").trim();
    if (targetLabAnchorIdText) {
      invalidateUnreadCountCache(targetLabAnchorIdText);
    }
    const unreadCountForRequestor = targetLabAnchorIdText
      ? await PracticeTransfer.countDocuments({
          targetLabAnchorId: new Types.ObjectId(targetLabAnchorIdText),
          status: { $ne: "canceled" },
          requestorReadAt: null,
        })
      : 0;
    if (targetLabAnchorIdText) {
      setRequestPerfCacheValue(
        unreadCountCacheKey(targetLabAnchorIdText),
        { unreadCount: unreadCountForRequestor },
        10 * 1000,
      );
    }

    const realtimePayload = {
      source: "createPracticeTransfer",
      transferId,
      transferMongoId: String(transferDoc?._id || ""),
      targetLabAnchorId: targetLabAnchorIdText || null,
      matchingMode,
      practiceUserId: String(req.user?._id || ""),
      clearedDraftId,
      status: "active",
      count: files.length,
      unreadCount: unreadCountForRequestor,
      createdAt: transferDoc?.createdAt || new Date(),
      ...toAutoMatchApiFields(transferDoc),
    };

    await emitPracticeTransferEventToPracticeUsers({
      practiceBusinessAnchorId: req.user?.businessAnchorId,
      type: "practice:transfer-created",
      payload: realtimePayload,
      extraUserIds: [req.user?._id],
    });

    if (clearedDraftId) {
      await emitPracticeTransferEventToPracticeUsers({
        practiceBusinessAnchorId: req.user?.businessAnchorId,
        type: "practice:transfer-updated",
        payload: {
          source: "createPracticeTransfer",
          action: "draft-cleared",
          draftId: clearedDraftId,
          practiceUserId: String(req.user?._id || ""),
          practiceBusinessAnchorId:
            String(req.user?.businessAnchorId || "").trim() || null,
        },
        extraUserIds: [req.user?._id],
      });
    }

    if (matchingMode === "auto") {
      await notifyAutoMatchPoolCreatedWithPriority({
        transfer: transferDoc,
        realtimePayload,
        eligibleLabAnchorIds: autoMatchEligibleLabAnchorIds,
        emitPoolCreated: emitAutoMatchPoolCreated,
      });
    } else {
      await emitPracticeTransferEventToRequestorUsers({
        targetLabAnchorId,
        type: "practice:transfer-created",
        payload: realtimePayload,
      });
    }

    return res.status(201).json({
      success: true,
      message:
        matchingMode === "auto"
          ? "자동매칭 기공의뢰가 공개 풀에 등록되었습니다."
          : "practice 전송이 접수되었습니다.",
      data: {
        _id: String(transferDoc?._id || ""),
        transferId,
        matchingMode,
        count: files.length,
        clearedDraftId,
        billing: transferDoc?.billing || null,
        ...toAutoMatchApiFields(transferDoc),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "practice 전송 생성 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

/**
 * 수락 전(의뢰 단계) 내용 수정. transferId·채팅방은 유지하고 파일·치식·메모·기공소·보류액을 갱신.
 */
export async function updatePracticeTransferContent(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferSenderRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const transferIdFilter = buildTransferIdFilter(req.params?.transferId);
    if (!transferIdFilter) {
      return res.status(400).json({
        success: false,
        message: "transferId가 필요합니다.",
      });
    }

    const { scope } = await buildPracticeOwnedScope(req);
    const doc = await PracticeTransfer.findOne({
      ...scope,
      ...transferIdFilter,
    });
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: "전송 내역을 찾을 수 없습니다.",
      });
    }

    if (!canEditPracticeTransferContent(doc)) {
      return res.status(409).json({
        success: false,
        message:
          "기공소가 수락하기 전(의뢰 단계)에만 내용을 수정할 수 있습니다.",
        reason: "not_pending_accept",
        manufacturerStage: resolvePracticeTransferManufacturerStage(doc),
      });
    }

    const caseInfos = Array.isArray(req.body?.caseInfos) ? req.body.caseInfos : [];
    const first = caseInfos[0] || {};
    const nsr = first?.newSystemRequest || {};
    const practiceRouting = first?.practiceRouting || {};
    const message = String(nsr?.message || "").trim();
    const tag = String(nsr?.tag || doc.tag || "practice_file_transfer").trim();
    if (tag && !PRACTICE_TAGS.includes(tag)) {
      return res.status(400).json({
        success: false,
        message: "practice 전송 태그가 아닙니다.",
      });
    }

    let targetLabName =
      String(req.body?.targetLabName || "").trim() ||
      String(practiceRouting?.targetLabName || "").trim() ||
      extractLabNameFromMessage(message) ||
      String(doc.targetLabName || "").trim();

    const rawAnchorId =
      String(req.body?.targetLabAnchorId || "").trim() ||
      String(practiceRouting?.targetLabAnchorId || "").trim();

    const matchingModeRaw = String(
      req.body?.matchingMode || practiceRouting?.matchingMode || "",
    )
      .trim()
      .toLowerCase();
    const resolvedTarget = await resolveCreateMatchingTarget({
      matchingModeRaw,
      autoMatchFlag:
        req.body?.autoMatch === true || practiceRouting?.autoMatch === true,
      rawAnchorId,
      targetLabName,
    });
    if (resolvedTarget.error) {
      return res.status(resolvedTarget.error.status).json({
        success: false,
        message: resolvedTarget.error.message,
      });
    }
    const matchingMode = resolvedTarget.matchingMode;
    const targetLabAnchorId =
      resolvedTarget.targetLabAnchorId ||
      (matchingMode === "direct" ? doc.targetLabAnchorId || null : null);
    targetLabName = resolvedTarget.targetLabName;

    if (matchingMode === "direct" && !targetLabName && targetLabAnchorId) {
      const anchor = await BusinessAnchor.findById(targetLabAnchorId)
        .select({ name: 1 })
        .lean();
      targetLabName = String(anchor?.name || "").trim();
    }

    const transferMemo =
      String(req.body?.transferMemo || "").trim() ||
      extractTransferMemoFromMessage(message);
    const files = mapPracticeTransferFilesFromCaseInfos(caseInfos);
    const toothWorksRaw =
      (Array.isArray(req.body?.toothWorks) && req.body.toothWorks) ||
      (Array.isArray(first?.toothWorks) && first.toothWorks) ||
      (Array.isArray(nsr?.toothWorks) && nsr.toothWorks) ||
      [];

    const practiceAnchorId = req.user?.businessAnchorId || null;
    if (!practiceAnchorId) {
      return res.status(400).json({
        success: false,
        message: "치과 사업자 정보가 필요합니다. 사업자 등록 후 다시 시도해주세요.",
      });
    }
    if (matchingMode === "direct" && !targetLabAnchorId) {
      return res.status(400).json({
        success: false,
        message: "대상 기공소를 선택해주세요.",
      });
    }
    if (
      await rejectIfSubcontractDirectBlocked(res, {
        practiceAnchorId,
        matchingMode,
        labAnchorId: targetLabAnchorId,
      })
    ) {
      return;
    }

    const skipDesignConfirm = parseSkipDesignConfirmInput(req.body, practiceRouting);
    const skipJig = resolvePracticeTransferSkipJig(
      toothWorksRaw,
      parseSkipJigInput(req.body, practiceRouting),
    );
    const rushProcessing = parseRushProcessingInput(req.body, practiceRouting);

    const arrivalPolicy = await resolvePracticeTransferArrivalPolicy({
      transferMemo,
      rushProcessing,
    });
    if (!arrivalPolicy.ok) {
      return res.status(arrivalPolicy.statusCode || 400).json({
        success: false,
        message: arrivalPolicy.message,
        reason: arrivalPolicy.reason,
        orderYmd: arrivalPolicy.orderYmd,
        arrivalYmd: arrivalPolicy.arrivalYmd,
        workPlusShipDays: arrivalPolicy.workPlusShipDays,
      });
    }
    const transferMemoResolved = arrivalPolicy.transferMemo;
    const rushFeeMultiplier = normalizeRushFeeMultiplier(
      arrivalPolicy.rushFeeMultiplier,
    );

    try {
      assertAbutmentPresetsComplete(toothWorksRaw);
    } catch (presetErr) {
      return res.status(400).json({
        success: false,
        message:
          presetErr?.message ||
          "어벗 프리셋(임플란트·스캔바디)을 선택해주세요.",
      });
    }

    try {
      assertOralScanFilesForCreate({
        matchingMode,
        toothWorks: toothWorksRaw,
        files,
      });
    } catch (scanErr) {
      const status = Number(scanErr?.statusCode || 400);
      return res.status(status >= 400 && status < 600 ? status : 400).json({
        success: false,
        message:
          scanErr?.message ||
          "자동매칭 의뢰는 구강스캔 파일이 필요합니다.",
        reason: scanErr?.code || "oral_scan_required_for_auto_match",
      });
    }

    const previousLabAnchorIdRaw = String(doc.targetLabAnchorId || "").trim();
    const previousLabAnchorId = previousLabAnchorIdRaw || null;
    const previousMatchingMode =
      String(doc.matchingMode || "").trim() === "auto" ? "auto" : "direct";
    const previousAutoMatch =
      doc.autoMatch && typeof doc.autoMatch === "object" ? { ...doc.autoMatch } : {};
    const previousBilling =
      doc.billing && typeof doc.billing === "object" ? { ...doc.billing } : {};
    const previousFiles = Array.isArray(doc.files) ? doc.files : [];
    const previousToothWorks = Array.isArray(doc.toothWorks) ? doc.toothWorks : [];
    const previousMemo = String(doc.transferMemo || "");
    const previousTargetLabName = String(doc.targetLabName || "").trim();
    const previousProduction =
      doc.production && typeof doc.production === "object" ? { ...doc.production } : {};
    const nextLabAnchorIdText = String(targetLabAnchorId || "").trim();
    const labChanged =
      previousMatchingMode !== matchingMode ||
      previousLabAnchorIdRaw !== nextLabAnchorIdText;
    const toothWorksChanged =
      fingerprintToothWorks(toothWorksRaw) !==
      fingerprintToothWorks(previousToothWorks);
    const previousSkipJig = resolvePracticeTransferSkipJig(
      previousToothWorks,
      previousProduction.skipJig,
    );
    const skipJigChanged = Boolean(skipJig) !== Boolean(previousSkipJig);
    const rushMultiplierChanged =
      Number(rushFeeMultiplier || 1) !==
      Number(previousBilling.rushFeeMultiplier || 1);
    const billingInputsChanged =
      labChanged || toothWorksChanged || skipJigChanged || rushMultiplierChanged;
    const previousBudget =
      previousBilling.autoMatchBudget &&
      typeof previousBilling.autoMatchBudget === "object"
        ? previousBilling.autoMatchBudget
        : null;

    let autoMatchBudget = matchingMode === "auto" ? previousBudget : null;
    let autoMatchEligibleLabAnchorIds =
      matchingMode === "auto"
        ? previousAutoMatch.eligibleLabAnchorIds
        : undefined;
    let autoMatchPriorityLabAnchorIds =
      matchingMode === "auto"
        ? previousAutoMatch.priorityLabAnchorIds || []
        : [];
    let autoMatchCatalog = null;
    if (matchingMode === "auto" && billingInputsChanged) {
      autoMatchCatalog = await loadAutoMatchBudgetCatalog();
    }

    let feeQuote = null;
    let billingPreview = previousBilling;
    if (billingInputsChanged) {
      try {
        await rollbackPracticeTransferBilling({ transferId: doc._id });
      } catch (rollbackErr) {
        console.warn(
          "[practiceTransfer] update-content billing rollback failed",
          String(doc?._id || ""),
          rollbackErr?.message || rollbackErr,
        );
      }

      try {
        await assertPracticeTransferPaidCreditSufficient({
          practiceAnchorId,
          labAnchorId: targetLabAnchorId,
          toothWorks: toothWorksRaw,
          autoMatchBudget,
          catalog: autoMatchCatalog,
          rushFeeMultiplier,
          skipJig,
        });
      } catch (creditErr) {
        try {
          await holdPracticeTransferCredits({
            transfer: doc,
            toothWorks: previousToothWorks,
            holdAmount: Number(previousBilling?.total || 0),
            holdLabAmount: Number(previousBilling?.labFeeTotal || 0),
            holdAbutmentAmount: Number(previousBilling?.abutmentRetailTotal || 0),
            actorUserId: req.user?._id,
          });
        } catch {
          // ignore restore failure
        }
        const status = Number(creditErr?.statusCode || 500);
        return res.status(status >= 400 && status < 600 ? status : 500).json({
          success: false,
          message:
            creditErr?.message || "기공의뢰 수정 전 유료크레딧 확인에 실패했습니다.",
          ...(creditErr?.payload || {}),
        });
      }

      feeQuote = await buildPracticeTransferQuote({
        practiceAnchorId,
        labAnchorId: targetLabAnchorId,
        toothWorks: toothWorksRaw,
        matchingMode,
        autoMatchBudget,
        catalog: autoMatchCatalog,
        rushFeeMultiplier,
      });
      billingPreview = {
        ...toBillingPreviewFields(feeQuote),
        rushFeeMultiplier,
      };
    }

    const prevAuto =
      doc.autoMatch && typeof doc.autoMatch === "object" ? doc.autoMatch : {};
    const autoMatchPriorityFields =
      matchingMode === "auto"
        ? buildAutoMatchPriorityFields({
            eligibleLabAnchorIds: autoMatchEligibleLabAnchorIds || [],
            priorityLabAnchorIds: autoMatchPriorityLabAnchorIds || [],
          })
        : null;
    const keepPriorityUntil =
      matchingMode === "auto" &&
      previousMatchingMode === "auto" &&
      prevAuto.priorityUntil &&
      new Date(prevAuto.priorityUntil).getTime() > Date.now();
    const nextAutoMatch =
      matchingMode === "auto"
        ? {
            claimedAt: null,
            deadlineAt: null,
            claimHours: null,
            completedAt: null,
            completedBy: null,
            releaseCount: Number(prevAuto.releaseCount || 0),
            eligibleLabAnchorIds: autoMatchEligibleLabAnchorIds || [],
            declinedLabAnchorIds:
              previousMatchingMode === "auto" &&
              Array.isArray(prevAuto.declinedLabAnchorIds)
                ? prevAuto.declinedLabAnchorIds
                : [],
            priorityUntil: keepPriorityUntil
              ? prevAuto.priorityUntil
              : autoMatchPriorityFields?.priorityUntil ?? null,
            ...(autoMatchPriorityFields?.priorityLabAnchorIds
              ? {
                  priorityLabAnchorIds:
                    autoMatchPriorityFields.priorityLabAnchorIds,
                }
              : { priorityLabAnchorIds: [] }),
          }
        : {
            claimedAt: null,
            deadlineAt: null,
            claimHours: null,
            completedAt: null,
            completedBy: null,
            releaseCount: Number(prevAuto.releaseCount || 0),
            eligibleLabAnchorIds: [],
            declinedLabAnchorIds: [],
            priorityUntil: null,
            priorityLabAnchorIds: [],
          };

    const nextProduction = {
      ...previousProduction,
      skipDesignConfirm,
      skipJig,
      rushProcessing,
    };

    const now = new Date();
    const pendingFilter = {
      _id: doc._id,
      status: { $ne: "canceled" },
      requestorDownloadedAt: null,
    };
    const nextSet = {
      targetLabAnchorId,
      targetLabName,
      assigneeLabAnchorId: null,
      assigneeLabName: "",
      matchingMode,
      autoMatch: nextAutoMatch,
      transferMemo: transferMemoResolved,
      tag: tag || doc.tag,
      files,
      toothWorks: toothWorksRaw,
      production: nextProduction,
      requestorReadAt: null,
      requestorReadBy: null,
    };
    if (billingInputsChanged) {
      nextSet.billing = billingPreview;
    }
    const updated = await PracticeTransfer.findOneAndUpdate(
      pendingFilter,
      { $set: nextSet },
      { new: true },
    );

    if (!updated) {
      if (billingInputsChanged) {
        try {
          await holdPracticeTransferCredits({
            transfer: doc,
            toothWorks: previousToothWorks,
            holdAmount: Number(previousBilling?.total || 0),
            holdLabAmount: Number(previousBilling?.labFeeTotal || 0),
            holdAbutmentAmount: Number(previousBilling?.abutmentRetailTotal || 0),
            actorUserId: req.user?._id,
          });
        } catch {
          // ignore
        }
      }
      return res.status(409).json({
        success: false,
        message:
          "기공소가 이미 수락했거나 의뢰 단계가 아니어서 수정할 수 없습니다.",
        reason: "not_pending_accept",
      });
    }

    if (billingInputsChanged) {
      updated.billing = billingPreview;
    try {
      const holdResult = await holdPracticeTransferCredits({
        transfer: updated,
        toothWorks: toothWorksRaw,
        holdAmount: Number(billingPreview?.total || feeQuote?.fees?.total || 0),
        holdLabAmount: Number(billingPreview?.labFeeTotal || 0),
        holdAbutmentAmount: Number(billingPreview?.abutmentRetailTotal || 0),
        actorUserId: req.user?._id,
      });
      if (holdResult?.held || holdResult?.reason === "already_held") {
        const heldBilling = {
          ...(updated.billing && typeof updated.billing === "object"
            ? updated.billing
            : billingPreview),
          heldAt: now,
          heldTotal: Number(holdResult.heldTotal || billingPreview?.total || 0),
          heldLabTotal: Number(
            holdResult.heldLabTotal ?? billingPreview?.labFeeTotal ?? 0,
          ),
          heldAbutmentTotal: Number(
            holdResult.heldAbutmentTotal ??
              billingPreview?.abutmentRetailTotal ??
              0,
          ),
          heldDesignFeeTotal: Number(holdResult.heldDesignFeeTotal || 0),
          heldShippingLabTotal: Number(holdResult.heldShippingLabTotal || 0),
          heldShippingAbutsTotal: Number(holdResult.heldShippingAbutsTotal || 0),
          holdFromPaid: Number(holdResult.fromPaid || 0),
          holdFromFreeRequest: Number(holdResult.fromFreeRequest || 0),
          holdFromFreeShipping: Number(holdResult.fromFreeShipping || 0),
        };
        updated.billing = heldBilling;
        await PracticeTransfer.updateOne(
          { _id: updated._id },
          { $set: { billing: heldBilling } },
        );
        if (Number(holdResult.heldTotal || 0) > 0) {
          await emitCreditBalanceUpdatedToBusiness({
            businessAnchorId: practiceAnchorId,
            balanceDelta: -Number(holdResult.heldTotal || 0),
            reason: "practice_transfer_update_hold",
            refId: updated._id,
          });
        }
      } else if (holdResult?.reason && holdResult.reason !== "zero_fee") {
        await PracticeTransfer.updateOne(
          { _id: updated._id },
          {
            $set: {
              targetLabAnchorId: previousLabAnchorId
                ? new Types.ObjectId(previousLabAnchorId)
                : null,
              targetLabName: previousTargetLabName,
              matchingMode: previousMatchingMode,
              autoMatch: previousAutoMatch,
              transferMemo: previousMemo,
              files: previousFiles,
              toothWorks: previousToothWorks,
              billing: previousBilling,
              production: previousProduction,
            },
          },
        );
        return res.status(500).json({
          success: false,
          message: "기공의뢰 수정 크레딧 보류에 실패했습니다.",
          reason: holdResult.reason,
        });
      }
    } catch (holdErr) {
      try {
        await PracticeTransfer.updateOne(
          { _id: updated._id },
          {
            $set: {
              targetLabAnchorId: previousLabAnchorId
                ? new Types.ObjectId(previousLabAnchorId)
                : null,
              targetLabName: previousTargetLabName,
              matchingMode: previousMatchingMode,
              autoMatch: previousAutoMatch,
              transferMemo: previousMemo,
              files: previousFiles,
              toothWorks: previousToothWorks,
              billing: previousBilling,
              production: previousProduction,
            },
          },
        );
      } catch {
        // ignore
      }
      const status = Number(holdErr?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        success: false,
        message: holdErr?.message || "기공의뢰 수정 크레딧 보류에 실패했습니다.",
        ...(holdErr?.payload || {}),
      });
    }
    }

    if (previousLabAnchorId) invalidateUnreadCountCache(previousLabAnchorId);
    if (nextLabAnchorIdText) invalidateUnreadCountCache(nextLabAnchorIdText);

    const manufacturerStage = resolvePracticeTransferManufacturerStage(updated);
    const transferId = String(updated.transferId || doc.transferId || "").trim();
    const realtimePayload = {
      source: "updatePracticeTransferContent",
      action: "content-updated",
      transferId,
      transferMongoId: String(updated._id || ""),
      targetLabAnchorId: nextLabAnchorIdText || null,
      previousLabAnchorId,
      matchingMode,
      practiceUserId: String(req.user?._id || ""),
      status: "active",
      manufacturerStage,
      requestorReadAt: null,
      count: files.length,
      updatedAt: now,
      ...toAutoMatchApiFields(updated),
    };

    const systemChatContent = labChanged
      ? "치과가 의뢰 내용·대상 기공소를 수정했습니다."
      : "치과가 의뢰 내용을 수정했습니다.";

    void (async () => {
      try {
        const jobs = [
          emitPracticeTransferEventToPracticeUsers({
            practiceBusinessAnchorId: updated.practiceBusinessAnchorId,
            type: "practice:transfer-updated",
            payload: realtimePayload,
            extraUserIds: [updated.practiceUserId, req.user?._id],
          }),
          postPracticeTransferSystemChatMessage({
            transferMongoId: updated._id,
            senderUserId: req.user?._id,
            content: systemChatContent,
            systemEvent: "content_updated",
          }),
        ];
        if (previousLabAnchorId && previousLabAnchorId !== nextLabAnchorIdText) {
          jobs.push(
            emitPracticeTransferEventToRequestorUsers({
              targetLabAnchorId: previousLabAnchorId,
              type: "practice:transfer-updated",
              payload: {
                ...realtimePayload,
                action: "content-updated",
                retargetedAway: true,
              },
            }),
          );
        }
        if (matchingMode === "auto") {
          jobs.push(
            notifyAutoMatchPoolCreatedWithPriority({
              transfer: updated,
              realtimePayload: {
                ...realtimePayload,
                typeHint: "practice:transfer-updated",
              },
              eligibleLabAnchorIds: autoMatchEligibleLabAnchorIds,
              emitPoolCreated: emitAutoMatchPoolCreated,
            }),
          );
        } else if (targetLabAnchorId) {
          jobs.push(
            emitPracticeTransferEventToRequestorUsers({
              targetLabAnchorId,
              type: "practice:transfer-updated",
              payload: realtimePayload,
            }),
          );
        }
        await Promise.all(jobs);
      } catch (sideErr) {
        console.warn(
          "[practiceTransfer] update-content side effects failed",
          String(updated?._id || ""),
          sideErr?.message || sideErr,
        );
      }
    })();

    return res.status(200).json({
      success: true,
      message: "의뢰 내용이 수정되었습니다.",
      data: {
        _id: String(updated._id || ""),
        transferId,
        matchingMode,
        count: files.length,
        billing: updated.billing || billingPreview,
        manufacturerStage,
        ...toAutoMatchApiFields(updated),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "기공의뢰 수정 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function remakePracticeTransfers(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferSenderRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const practiceAnchorId = req.user?.businessAnchorId || null;
    if (!practiceAnchorId) {
      return res.status(400).json({
        success: false,
        message: "치과 사업자 정보가 필요합니다. 사업자 등록 후 다시 시도해주세요.",
      });
    }

    const rawIds = Array.isArray(req.body?.transferMongoIds)
      ? req.body.transferMongoIds
      : Array.isArray(req.body?.ids)
        ? req.body.ids
        : [];
    const objectIds = rawIds
      .map((id) => String(id || "").trim())
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    if (objectIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "리메이크할 발송 건을 선택해주세요.",
      });
    }

    const { scope } = await buildPracticeOwnedScope(req);
    const sources = await PracticeTransfer.find({
      ...scope,
      _id: { $in: objectIds },
      status: { $ne: "canceled" },
    });

    const created = [];
    const failed = [];
    const seen = new Set();

    for (const source of sources) {
      const sourceMongoId = String(source?._id || "").trim();
      const sourceTransferId = String(source?.transferId || "").trim();
      seen.add(sourceMongoId);
      const stage = resolvePracticeTransferManufacturerStage(source);
      if (stage !== "생산진행") {
        failed.push({
          transferId: sourceTransferId || sourceMongoId,
          message: "발송된 의뢰만 리메이크할 수 있습니다.",
        });
        continue;
      }

      const targetLabAnchorId = source.targetLabAnchorId || null;
      if (!targetLabAnchorId) {
        failed.push({
          transferId: sourceTransferId || sourceMongoId,
          message: "기공소가 지정되지 않은 의뢰는 리메이크할 수 없습니다.",
        });
        continue;
      }

      const toothWorks = Array.isArray(source.toothWorks) ? source.toothWorks : [];
      const files = Array.isArray(source.files)
        ? source.files
            .map((item) => ({
              patientName: String(item?.patientName || "").trim(),
              tooth: String(item?.tooth || "").trim(),
              file: {
                originalName: String(item?.file?.originalName || "").trim(),
                mimetype: String(
                  item?.file?.mimetype || "application/octet-stream",
                ).trim(),
                size: Number(item?.file?.size || 0),
                s3Key: String(item?.file?.s3Key || "").trim(),
              },
            }))
            .filter((item) => item.file.originalName && item.file.s3Key)
        : [];

      try {
        await assertPracticeTransferPaidCreditSufficient({
          practiceAnchorId,
          labAnchorId: targetLabAnchorId,
          toothWorks,
          remake: true,
        });
      } catch (creditErr) {
        const status = Number(creditErr?.statusCode || 500);
        if (created.length === 0 && failed.length === 0 && sources.length === 1) {
          return res.status(status >= 400 && status < 600 ? status : 500).json({
            success: false,
            message:
              creditErr?.message || "리메이크 전송 전 유료크레딧 확인에 실패했습니다.",
            ...(creditErr?.payload || {}),
          });
        }
        failed.push({
          transferId: sourceTransferId || sourceMongoId,
          message:
            creditErr?.message || "리메이크 전송 전 유료크레딧이 부족합니다.",
        });
        continue;
      }

      const feeQuote = await buildPracticeTransferQuote({
        practiceAnchorId,
        labAnchorId: targetLabAnchorId,
        toothWorks,
        remake: true,
        matchingMode: "direct",
      });

      const transferId = `PTX-${Date.now().toString(36).toUpperCase()}${created.length
        ? String(created.length)
        : ""}`;
      const production =
        source.production && typeof source.production === "object"
          ? source.production
          : {};

      const transferDoc = await PracticeTransfer.create({
        transferId,
        practiceUserId: req.user?._id,
        practiceBusinessAnchorId: practiceAnchorId,
        targetLabAnchorId,
        targetLabName: String(source.targetLabName || "").trim(),
        matchingMode: "direct",
        transferMemo: String(source.transferMemo || "").trim(),
        tag: String(source.tag || "practice_file_transfer").trim(),
        status: "active",
        files,
        toothWorks,
        billing: toBillingPreviewFields(feeQuote),
        remake: {
          sourceTransferId,
          sourceTransferMongoId: source._id,
          requestedAt: new Date(),
          requestedBy: req.user?._id || null,
        },
        production: {
          skipDesignConfirm: production?.skipDesignConfirm !== false,
          skipJig: Boolean(production?.skipJig),
          rushProcessing: false,
          shippingMode: null,
          confirmedAt: null,
          confirmedBy: null,
          relatedRequestIds: [],
          designFiles: [],
          designReadyAt: null,
          labDesignConfirmedAt: null,
          practiceDesignConfirmedAt: null,
          abutmentProductionStartedAt: null,
        },
      });

      const targetLabAnchorIdText = String(targetLabAnchorId || "").trim();
      if (targetLabAnchorIdText) {
        invalidateUnreadCountCache(targetLabAnchorIdText);
      }
      const unreadCountForRequestor = targetLabAnchorIdText
        ? await PracticeTransfer.countDocuments({
            targetLabAnchorId: new Types.ObjectId(targetLabAnchorIdText),
            status: { $ne: "canceled" },
            requestorReadAt: null,
          })
        : 0;

      const realtimePayload = {
        source: "remakePracticeTransfers",
        transferId,
        transferMongoId: String(transferDoc?._id || ""),
        targetLabAnchorId: targetLabAnchorIdText || null,
        matchingMode: "direct",
        practiceUserId: String(req.user?._id || ""),
        status: "active",
        count: files.length,
        unreadCount: unreadCountForRequestor,
        createdAt: transferDoc?.createdAt || new Date(),
        isRemake: true,
        remake: {
          sourceTransferId,
          sourceTransferMongoId: sourceMongoId,
        },
      };

      await emitPracticeTransferEventToPracticeUsers({
        practiceBusinessAnchorId: req.user?.businessAnchorId,
        type: "practice:transfer-created",
        payload: realtimePayload,
        extraUserIds: [req.user?._id],
      });
      await emitPracticeTransferEventToRequestorUsers({
        targetLabAnchorId,
        type: "practice:transfer-created",
        payload: realtimePayload,
      });

      created.push({
        _id: String(transferDoc?._id || ""),
        transferId,
        sourceTransferId,
        sourceTransferMongoId: sourceMongoId,
        billing: transferDoc?.billing || null,
      });
    }

    for (const rawId of objectIds) {
      const id = String(rawId);
      if (seen.has(id)) continue;
      failed.push({
        transferId: id,
        message: "의뢰를 찾지 못했습니다.",
      });
    }

    if (created.length === 0) {
      return res.status(400).json({
        success: false,
        message: failed[0]?.message || "리메이크 의뢰를 생성하지 못했습니다.",
        data: { created, failed },
      });
    }

    return res.status(201).json({
      success: true,
      message:
        created.length === 1
          ? "리메이크 의뢰를 전송했습니다."
          : `리메이크 의뢰 ${created.length}건을 전송했습니다.`,
      data: { created, failed },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "리메이크 의뢰 생성 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function getMyPracticeTransfers(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferSenderRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const page = Math.max(1, Number(req.query?.page || 1));
    const limit = Math.min(200, Math.max(1, Number(req.query?.limit || 100)));
    const skip = (page - 1) * limit;

    const {
      scope: baseFilter,
      practiceUserObjectIds,
    } = await buildPracticeOwnedScope(req);
    const practiceBusinessAnchorId = String(
      req.user?.businessAnchorId || "",
    ).trim();

    const fetched = await fetchOwnedPracticeTransfersPage({
      scope: baseFilter,
      practiceBusinessAnchorId:
        String(req.user?.role || "").trim() === "admin"
          ? null
          : practiceBusinessAnchorId,
      practiceUserObjectIds,
      skip,
      limit,
    });
    const hasMore = fetched.length > limit;
    const docs = hasMore ? fetched.slice(0, limit) : fetched;

    const quotesById = await buildFeeQuotesForTransferDocs({ docs });

    let practiceRatings = [];
    const practiceAnchorForRatings = String(
      req.user?.businessAnchorId || "",
    ).trim();
    if (practiceAnchorForRatings && Types.ObjectId.isValid(practiceAnchorForRatings)) {
      const practiceDoc = await BusinessAnchor.findById(practiceAnchorForRatings)
        .select({ practiceLabRatings: 1 })
        .lean();
      practiceRatings = Array.isArray(practiceDoc?.practiceLabRatings)
        ? practiceDoc.practiceLabRatings
        : [];
    } else if (role === "admin") {
      // 관리자: 목록의 치과 앵커별 rating을 모아 조회(기공소에는 노출하지 않음)
      const practiceIds = [
        ...new Set(
          docs
            .map((doc) => String(doc?.practiceBusinessAnchorId || "").trim())
            .filter((id) => id && Types.ObjectId.isValid(id)),
        ),
      ];
      if (practiceIds.length) {
        const anchors = await BusinessAnchor.find({
          _id: { $in: practiceIds.map((id) => new Types.ObjectId(id)) },
        })
          .select({ practiceLabRatings: 1 })
          .lean();
        const byPractice = new Map(
          anchors.map((a) => [String(a._id), a.practiceLabRatings || []]),
        );
        const requests = docs.flatMap((doc) => {
          const feeQuote = quotesById.get(String(doc?._id || "")) || null;
          const ratings =
            byPractice.get(String(doc?.practiceBusinessAnchorId || "")) || [];
          const labId = String(doc?.targetLabAnchorId || "").trim();
          const labRating = toPracticeLabRatingPublicApi(
            findPracticeLabRating(ratings, labId),
          );
          return toVirtualRequestRows(doc).map((row) => ({
            ...row,
            feeQuote,
            labRating,
          }));
        });
        return res.status(200).json({
          success: true,
          data: {
            requests,
            pagination: {
              page,
              limit,
              count: requests.length,
              total: skip + docs.length + (hasMore ? 1 : 0),
              hasMore,
            },
          },
        });
      }
    }

    const requests = docs.flatMap((doc) => {
      const feeQuote = quotesById.get(String(doc?._id || "")) || null;
      const labId = String(doc?.targetLabAnchorId || "").trim();
      const labRating = toPracticeLabRatingPublicApi(
        findPracticeLabRating(practiceRatings, labId),
      );
      return toVirtualRequestRows(doc).map((row) => ({
        ...row,
        feeQuote,
        labRating,
      }));
    });

    return res.status(200).json({
      success: true,
      data: {
        requests,
        pagination: {
          page,
          limit,
          count: requests.length,
          total: skip + docs.length + (hasMore ? 1 : 0),
          hasMore,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "practice 전송 내역 조회 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function listSubcontractDirectBlockedLabs(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferSenderRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }
    const practiceAnchorId = String(req.user?.businessAnchorId || "").trim();
    const labAnchorIds = await loadSubcontractDirectBlockedLabAnchorIds(
      practiceAnchorId,
    );
    return res.status(200).json({
      success: true,
      data: { labAnchorIds },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "하청 지정 제한 기공소 조회 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

const AUTO_MATCH_LAB_SENTINEL = "__auto_match__";

/**
 * 치과→기공소 rating 저장.
 * body: { stars: 1~5, memo?: string }
 * 별점은 기공소에 공개, 치과·메모는 비공개.
 * 신규 의뢰 배정·지정 수가에는 쓰지 않음. 별점은 평가·매칭 게이트만.
 * 치과·기공소 쌍당 1건. 재평가 시 이전 별점·메모를 덮어씀.
 */
export async function upsertPracticeTransferLabRating(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferSenderRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const transferIdParam = String(req.params?.transferId || "").trim();
    if (!transferIdParam || !Types.ObjectId.isValid(transferIdParam)) {
      return res.status(400).json({
        success: false,
        message: "의뢰 ID가 필요합니다.",
      });
    }

    const stars = normalizePracticeLabStars(req.body?.stars);
    if (stars == null) {
      return res.status(400).json({
        success: false,
        message: `별점은 ${PRACTICE_LAB_RATING_MIN}~${PRACTICE_LAB_RATING_MAX} 사이여야 합니다.`,
      });
    }
    const memo = normalizePracticeLabRatingMemo(req.body?.memo);

    const doc = await PracticeTransfer.findById(transferIdParam)
      .select({
        practiceBusinessAnchorId: 1,
        practiceUserId: 1,
        targetLabAnchorId: 1,
        matchingMode: 1,
      })
      .lean();
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    const labAnchorId = String(doc.targetLabAnchorId || "").trim();
    if (!labAnchorId || !Types.ObjectId.isValid(labAnchorId)) {
      return res.status(409).json({
        success: false,
        message: "아직 기공소가 배정되지 않아 rating을 남길 수 없습니다.",
        reason: "lab_not_assigned",
      });
    }

    if (role !== "admin") {
      const { scope } = await buildPracticeOwnedScope(req);
      const owned = await PracticeTransfer.findOne({
        _id: doc._id,
        ...scope,
      })
        .select({ _id: 1 })
        .lean();
      if (!owned) {
        return res.status(403).json({
          success: false,
          message: "이 의뢰에 rating을 남길 권한이 없습니다.",
        });
      }
    }

    const practiceAnchorId = String(doc.practiceBusinessAnchorId || "").trim();
    if (!practiceAnchorId || !Types.ObjectId.isValid(practiceAnchorId)) {
      return res.status(400).json({
        success: false,
        message: "치과 사업자 정보가 필요합니다.",
      });
    }

    const practice = await BusinessAnchor.findById(practiceAnchorId)
      .select({ practiceLabRatings: 1 })
      .lean();
    if (!practice) {
      return res.status(404).json({
        success: false,
        message: "치과 사업자를 찾을 수 없습니다.",
      });
    }

    const nextList = upsertPracticeLabRatingList(
      practice.practiceLabRatings,
      labAnchorId,
      stars,
      memo,
    ).map((row) => ({
      labAnchorId: new Types.ObjectId(String(row.labAnchorId)),
      stars: row.stars,
      memo: row.memo,
      ratingCount: row.ratingCount,
      updatedAt: row.updatedAt || new Date(),
    }));

    await BusinessAnchor.findByIdAndUpdate(practiceAnchorId, {
      $set: { practiceLabRatings: nextList },
    });

    const saved = toPracticeLabRatingPublicApi(
      findPracticeLabRating(nextList, labAnchorId),
    );

    return res.status(200).json({
      success: true,
      message: "기공소 rating을 저장했습니다.",
      data: {
        transferId: transferIdParam,
        labRating: saved,
      },
    });
  } catch (error) {
    console.error("[practiceTransfers] upsertPracticeTransferLabRating", error);
    return res.status(500).json({
      success: false,
      message: "기공소 rating 저장 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function getPracticeTransferQuoteContext(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferSenderRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const rawLabId = String(req.query?.labAnchorId || "").trim();
    const labAnchorId =
      !rawLabId ||
      rawLabId === AUTO_MATCH_LAB_SENTINEL ||
      !Types.ObjectId.isValid(rawLabId)
        ? null
        : rawLabId;
    const practiceAnchorId =
      String(req.user?.businessAnchorId || "").trim() || null;

    const context = await loadPracticeTransferQuoteContext({
      labAnchorId,
      practiceAnchorId,
    });
    return res.status(200).json({ success: true, data: context });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "기공의뢰 견적 기준을 불러오지 못했습니다.",
      error: error?.message,
    });
  }
}

export async function getReceivedPracticeTransfers(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferLabReceiverRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const page = Math.max(1, Number(req.query?.page || 1));
    const limit = Math.min(200, Math.max(1, Number(req.query?.limit || 10)));
    const skip = (page - 1) * limit;

    const { scope, labAnchorId } = await buildReceivedScope(req);
    if (scope === null) {
      return res.status(200).json({
        success: true,
        data: {
          transfers: [],
          unreadCount: 0,
          pagination: {
            page,
            limit,
            count: 0,
            total: 0,
            hasMore: false,
          },
        },
      });
    }

    // 레거시: 3시간 deadline 만료 재공개는 폐기(수락은 작업완료/취소까지 유지).

    const [docs, totalCount, unreadCount] = await Promise.all([
      PracticeTransfer.find(scope)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate("practiceBusinessAnchorId", "name")
        .populate(
          "practiceUserId",
          "name practiceProfile.clinicName practiceProfile.staffName",
        )
        .lean(),
      PracticeTransfer.countDocuments(scope),
      PracticeTransfer.countDocuments({
        ...scope,
        status: { $ne: "canceled" },
        requestorReadAt: null,
        ...(labAnchorId && Types.ObjectId.isValid(labAnchorId)
          ? {
              $and: [
                {
                  $or: [
                    { labRejectedAt: null },
                    { labRejectedAt: { $exists: false } },
                  ],
                },
                {
                  "autoMatch.declinedLabAnchorIds": {
                    $nin: [new Types.ObjectId(labAnchorId)],
                  },
                },
              ],
            }
          : {}),
      }),
    ]);

    if (labAnchorId) {
      setRequestPerfCacheValue(
        unreadCountCacheKey(labAnchorId),
        { unreadCount },
        10 * 1000,
      );
    }

    const quotesById = await buildFeeQuotesForTransferDocs({
      docs,
      viewingLabAnchorId: labAnchorId,
    });

    const [labMultiplierDoc, labRatingAggMap, abutmentPastReadyById] =
      await Promise.all([
      labAnchorId && Types.ObjectId.isValid(labAnchorId)
        ? BusinessAnchor.findById(labAnchorId)
            .select({ labPracticeFeeMultipliers: 1 })
            .lean()
        : null,
      labAnchorId && Types.ObjectId.isValid(labAnchorId)
        ? loadGlobalLabRatingAggregates({ labAnchorIds: [labAnchorId] })
        : Promise.resolve(new Map()),
      mapAbutmentPastReadyByTransferDocs(docs),
    ]);
    const labRatingSummary = toLabRatingSummaryApi(
      labAnchorId ? labRatingAggMap.get(String(labAnchorId)) : null,
    );

    const transfers = docs.map((doc) => {
      const practiceBusiness =
        doc?.practiceBusinessAnchorId &&
        typeof doc.practiceBusinessAnchorId === "object"
          ? doc.practiceBusinessAnchorId
          : null;
      const practiceUser =
        doc?.practiceUserId && typeof doc.practiceUserId === "object"
          ? doc.practiceUserId
          : null;
      const practiceProfile =
        practiceUser?.practiceProfile &&
        typeof practiceUser.practiceProfile === "object"
          ? practiceUser.practiceProfile
          : null;
      const files = Array.isArray(doc?.files) ? doc.files : [];
      const resultFiles = Array.isArray(doc?.resultFiles) ? doc.resultFiles : [];
      const toothWorks = Array.isArray(doc?.toothWorks) ? doc.toothWorks : [];
      const production =
        doc?.production && typeof doc.production === "object" ? doc.production : {};
      const autoFields = toAutoMatchApiFields(doc, labAnchorId);
      const openPool = Boolean(autoFields.autoMatch?.openPool);
      const matchingMode = autoFields.matchingMode;
      const revealIdentities =
        role === "admin" || role === "internalLab";
      const practiceIdentity = redactAutoMatchPracticeIdentity(
        matchingMode,
        {
          businessName: String(
            practiceBusiness?.name || practiceProfile?.clinicName || "",
          ).trim(),
          userName: String(
            practiceProfile?.staffName || practiceUser?.name || "",
          ).trim(),
        },
        {
          reveal: revealIdentities,
          transfer: doc,
          viewerLabAnchorId: labAnchorId,
        },
      );
      // 자동매칭도 치과 표시명은 비공개지만, 기공수가 할증 키용 practiceAnchorId는 내부 전달.
      const practiceAnchorIdForSurcharge = practiceBusiness
        ? String(practiceBusiness._id || "")
        : String(doc?.practiceBusinessAnchorId || "").trim() || null;
      const isAccepted =
        Boolean(doc?.requestorDownloadedAt) && !openPool;
      const declinedByMe = Boolean(autoFields.autoMatch?.declinedByMe);
      const labRejectedByAnchor =
        String(doc?.labRejectedByLabAnchorId || "").trim() ===
        String(labAnchorId || "").trim();
      const labRejected =
        declinedByMe ||
        (labRejectedByAnchor && Boolean(doc?.labRejectedAt));
      // openPool 재공개는 작업취소보다 우선(자동매칭). 인라인 workCanceledAt 우선은 수락 취소 후 뱃지 어긋남.
      const manufacturerStage = resolvePracticeTransferManufacturerStage(doc, {
        viewerLabAnchorId: labAnchorId,
      });
      const oralScanDownloadLocked = shouldLockLabOralScanDownload(doc);
      const feeQuote = quotesById.get(String(doc?._id || "")) || null;

      return {
        _id: String(doc?._id || ""),
        transferId: String(doc?.transferId || "").trim(),
        targetLabAnchorId: String(doc?.targetLabAnchorId || "").trim() || null,
        targetLabName: String(doc?.targetLabName || "").trim(),
        transferMemo: String(doc?.transferMemo || "").trim(),
        status: String(doc?.status || "").trim() || "active",
        manufacturerStage,
        labRejected,
        labRejectedAt: doc?.labRejectedAt || null,
        createdAt: doc?.createdAt || null,
        updatedAt: doc?.updatedAt || null,
        isRead: Boolean(doc?.requestorReadAt) && !openPool,
        requestorReadAt: openPool ? null : doc?.requestorReadAt || null,
        isDownloaded: isAccepted,
        isAccepted,
        requestorDownloadedAt: openPool ? null : doc?.requestorDownloadedAt || null,
        requestorAcceptedAt: openPool ? null : doc?.requestorDownloadedAt || null,
        workCanceledAt: doc?.workCanceledAt || null,
        matchingMode: autoFields.matchingMode,
        autoMatch: autoFields.autoMatch,
        toothWorks,
        hasCustomAbutment: hasCustomAbutmentToothWorks(toothWorks),
        production: toProductionApiFields(production, {
          abutmentPastReady: Boolean(
            abutmentPastReadyById.get(String(doc?._id || "")),
          ),
        }),
        practice: practiceIdentity,
        practiceBusinessAnchorId: practiceAnchorIdForSurcharge,
        labFeeMultiplier: practiceAnchorIdForSurcharge
          ? resolveLabPracticeFeeMultiplier(
              labMultiplierDoc,
              practiceAnchorIdForSurcharge,
            )
          : 1,
        fileCount: files.length,
        files: files.map((item, idx) => ({
          id: `${String(doc?._id || "")}::${idx + 1}`,
          patientName: String(item?.patientName || "").trim(),
          tooth: String(item?.tooth || "").trim(),
          originalName: String(item?.file?.originalName || "").trim(),
          mimetype: String(item?.file?.mimetype || "application/octet-stream").trim(),
          size: Number(item?.file?.size || 0),
          s3Key: String(item?.file?.s3Key || "").trim(),
        })),
        oralScanDownloadLocked,
        resultFileCount: resultFiles.length,
        resultFiles: resultFiles.map((item, idx) => ({
          id: `${String(doc?._id || "")}::result::${idx + 1}`,
          patientName: String(item?.patientName || "").trim(),
          tooth: String(item?.tooth || "").trim(),
          originalName: String(item?.file?.originalName || "").trim(),
          mimetype: String(item?.file?.mimetype || "application/octet-stream").trim(),
          size: Number(item?.file?.size || 0),
          s3Key: String(item?.file?.s3Key || "").trim(),
        })),
        feeQuote,
        labRatingSummary,
        ...toRemakeApiFields(doc),
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        transfers,
        unreadCount,
        pagination: {
          page,
          limit,
          count: transfers.length,
          total: totalCount,
          hasMore: skip + transfers.length < totalCount,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "치과 전송 수신 내역 조회 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function getReceivedPracticeTransferUnreadCount(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferLabReceiverRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    // 배지 초기/보정용. lab 게이트(BusinessAnchor)는 받지 않는다 —
    // 캐시 히트 경로를 가볍게 유지하고, practice-only는 scope 카운트 0으로 동일 결과.
    const { scope, labAnchorId } = await buildReceivedScope(req);
    if (scope === null) {
      return res.status(200).json({
        success: true,
        data: { unreadCount: 0 },
      });
    }

    const cacheKey = unreadCountCacheKey(labAnchorId || "admin");
    const cached = getRequestPerfCacheValue(cacheKey);
    if (cached && typeof cached.unreadCount === "number") {
      return res.status(200).json({
        success: true,
        data: { unreadCount: cached.unreadCount },
      });
    }

    const unreadCount = await withRequestPerfInFlight(cacheKey, async () => {
      const count = await PracticeTransfer.countDocuments({
        ...scope,
        status: { $ne: "canceled" },
        requestorReadAt: null,
        ...(labAnchorId && Types.ObjectId.isValid(labAnchorId)
          ? {
              $and: [
                {
                  $or: [
                    { labRejectedAt: null },
                    { labRejectedAt: { $exists: false } },
                  ],
                },
                {
                  "autoMatch.declinedLabAnchorIds": {
                    $nin: [new Types.ObjectId(labAnchorId)],
                  },
                },
              ],
            }
          : {}),
      });
      setRequestPerfCacheValue(cacheKey, { unreadCount: count }, 10 * 1000);
      return count;
    });

    return res.status(200).json({
      success: true,
      data: { unreadCount },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "치과 전송 미확인 건수 조회 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function markReceivedPracticeTransferRead(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferLabReceiverRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const transferIdFilter = buildTransferIdFilter(req.params?.transferId);
    if (!transferIdFilter) {
      return res.status(400).json({
        success: false,
        message: "transferId가 필요합니다.",
      });
    }

    const { scope, labAnchorId } = await buildReceivedScope(req);
    if (scope === null) {
      return res.status(404).json({ success: false, message: "전송 내역을 찾을 수 없습니다." });
    }

    const doc = await PracticeTransfer.findOne({
      ...scope,
      ...transferIdFilter,
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: "전송 내역을 찾을 수 없습니다." });
    }

    // 자동매칭 공개 풀(미클레임)은 특정 기공소 read로 잠그지 않는다.
    // requestorReadAt을 세우면 전 기공소 공통 읽음이 되므로 no-op.
    // unreadCount는 반환해 클라이언트가 배지를 0으로 잘못 덮지 않게 한다.
    if (
      (isAutoMatchMode(doc) && isAutoMatchOpenPool(doc)) ||
      isSubcontractPoolOpen(doc)
    ) {
      const unreadCount = await PracticeTransfer.countDocuments({
        ...scope,
        status: { $ne: "canceled" },
        requestorReadAt: null,
      });
      if (labAnchorId) {
        setRequestPerfCacheValue(
          unreadCountCacheKey(labAnchorId),
          { unreadCount },
          10 * 1000,
        );
      }
      return res.status(200).json({
        success: true,
        data: {
          transferId: String(doc.transferId || "").trim(),
          requestorReadAt: null,
          requestorDownloadedAt: null,
          matchingMode: "auto",
          unreadCount,
          readApplied: false,
          ...toAutoMatchApiFields(doc, labAnchorId),
        },
      });
    }

    if (!doc.requestorReadAt) {
      doc.requestorReadAt = new Date();
      doc.requestorReadBy = req.user?._id || null;
      await doc.save();
      if (labAnchorId) invalidateUnreadCountCache(labAnchorId);
    }

    const unreadCount = await PracticeTransfer.countDocuments({
      ...scope,
      status: { $ne: "canceled" },
      requestorReadAt: null,
    });
    if (labAnchorId) {
      setRequestPerfCacheValue(
        unreadCountCacheKey(labAnchorId),
        { unreadCount },
        10 * 1000,
      );
    }

    const realtimePayload = {
      action: "read",
      transferId: String(doc.transferId || "").trim(),
      transferMongoId: String(doc._id || "").trim(),
      targetLabAnchorId: String(doc.targetLabAnchorId || "").trim() || null,
      matchingMode: isAutoMatchMode(doc) ? "auto" : "direct",
      practiceUserId: String(doc.practiceUserId || "").trim() || null,
      requestorReadAt: doc.requestorReadAt,
      unreadCount,
      status: String(doc.status || "active").trim(),
      updatedAt: doc.updatedAt || new Date(),
      ...toAutoMatchApiFields(doc, labAnchorId),
    };

    emitAppEventToUser(req.user?._id, "practice:transfer-updated", realtimePayload);

    await emitPracticeTransferEventToPracticeUsers({
      practiceBusinessAnchorId: doc.practiceBusinessAnchorId,
      type: "practice:transfer-updated",
      payload: realtimePayload,
      extraUserIds: [doc.practiceUserId],
    });

    await emitPracticeTransferEventToRequestorUsers({
      targetLabAnchorId: doc.targetLabAnchorId,
      type: "practice:transfer-updated",
      payload: realtimePayload,
    });

    return res.status(200).json({
      success: true,
      data: {
        transferId: String(doc.transferId || "").trim(),
        requestorReadAt: doc.requestorReadAt,
        requestorDownloadedAt: doc.requestorDownloadedAt || null,
        unreadCount,
        ...toAutoMatchApiFields(doc, labAnchorId),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "치과 전송 확인 처리 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function markReceivedPracticeTransferAccepted(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferLabReceiverRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const transferIdFilter = buildTransferIdFilter(req.params?.transferId);
    if (!transferIdFilter) {
      return res.status(400).json({
        success: false,
        message: "transferId가 필요합니다.",
      });
    }

    const { scope, labAnchorId, autoMatchEligible } = await buildReceivedScope(req);
    if (scope === null || !labAnchorId) {
      return res.status(404).json({ success: false, message: "전송 내역을 찾을 수 없습니다." });
    }

    const labOid = new Types.ObjectId(labAnchorId);
    const now = new Date();

    let doc = await PracticeTransfer.findOne({
      ...scope,
      ...transferIdFilter,
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: "전송 내역을 찾을 수 없습니다." });
    }

    if (String(doc.status || "").trim() === "canceled") {
      return res.status(409).json({
        success: false,
        message: "취소된 기공의뢰는 수락할 수 없습니다.",
      });
    }

    const isAuto = isAutoMatchMode(doc);
    const subcontractClaim =
      isSubcontractPoolOpen(doc) &&
      String(labAnchorId) !== getPrimeLabAnchorId(doc);
    const alreadyAcceptedDirect = Boolean(doc.requestorDownloadedAt);
    if (!isAuto && !subcontractClaim && !alreadyAcceptedDirect) {
      try {
        await assertReceiverLabFeeConfigured(labAnchorId, doc.toothWorks);
      } catch (feeErr) {
        return rejectLabFeeUnconfigured(res, feeErr);
      }
    }

    // 커스텀어벗: 구강스캔 확보(자동=치과만, 지정=기공소 body.files 허용)
    try {
      const resolvedScan = resolveOralScanFilesForAccept({
        transferDoc: doc,
        incomingFiles: req.body?.files,
      });
      if (resolvedScan.attachedByLab) {
        doc.files = resolvedScan.files;
        await PracticeTransfer.updateOne(
          { _id: doc._id },
          { $set: { files: resolvedScan.files } },
        );
      }
    } catch (scanErr) {
      const status = Number(scanErr?.statusCode || 409);
      return res.status(status >= 400 && status < 600 ? status : 409).json({
        success: false,
        message:
          String(scanErr?.message || "").trim() ||
          "구강스캔 파일이 없어 의뢰를 수락할 수 없습니다.",
        reason: scanErr?.code || "oral_scan_required",
      });
    }

    if (isAuto || subcontractClaim) {
      if (!autoMatchEligible && role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "인증 기공소가 아닙니다.",
        });
      }
      if (isAutoMatchCompleted(doc)) {
        return res.status(409).json({
          success: false,
          message: "이미 작업 완료된 의뢰입니다.",
        });
      }

      // 내 활성 claim이면 idempotent 성공
      const assigneeId = getAssigneeLabAnchorId(doc);
      const performingId = resolvePerformingLabAnchorId(doc);
      const claimIsMine =
        assigneeId === labAnchorId ||
        (!assigneeId &&
          Boolean(doc.autoMatch?.claimedAt) &&
          performingId === labAnchorId);
      if (isAutoMatchClaimActive(doc, now.getTime()) && claimIsMine) {
        try {
          await ensureAbutmentRequestsOnAccept({
            transferDoc: doc,
            actorUserId: req.user?._id || null,
          });
        } catch {
          // idempotent path — 생성 실패는 다음 진입에서 재시도
        }
        await ensurePracticeTransferChatRoomOnAccept({
          transferDoc: doc,
          labUserId: req.user?._id,
        });
        return res.status(200).json({
          success: true,
          data: {
            transferId: String(doc.transferId || "").trim(),
            requestorReadAt: doc.requestorReadAt,
            requestorDownloadedAt: doc.requestorDownloadedAt,
            requestorAcceptedAt: doc.requestorDownloadedAt,
            isAccepted: true,
            billing: doc.billing || null,
            production: toProductionApiFields(doc.production),
            alreadyAccepted: true,
            ...toTransferFilesApiFields(doc),
            ...toAutoMatchApiFields(doc, labAnchorId),
          },
        });
      }

      // 타인 활성 claim
      if (isAutoMatchClaimActive(doc, now.getTime()) && !claimIsMine) {
        return res.status(409).json({
          success: false,
          message: "다른 기공소가 이미 수락했습니다.",
          data: toAutoMatchApiFields(doc, labAnchorId),
        });
      }

      const claimingLab = await BusinessAnchor.findById(labOid)
        .select({ name: 1, labFeeSchedule: 1 })
        .lean();
      if (!isLabFeeScheduleReadyToCharge(claimingLab?.labFeeSchedule)) {
        const missing = missingLabFeeItemNames(
          claimingLab?.labFeeSchedule,
          doc.toothWorks,
        );
        return rejectLabFeeUnconfigured(res, {
          statusCode: 409,
          message: LAB_FEE_UNCONFIGURED_ACCEPT_MESSAGE,
          code: LAB_FEE_UNCONFIGURED_REASON,
          missingFeeNames:
            missing.length > 0
              ? missing
              : labFeeItemNamesNeededForToothWorks(doc.toothWorks),
        });
      }
      const assigneeLabName =
        String(claimingLab?.name || "").trim() || ABUTS_LAB_DISPLAY_NAME;
      const wasUnread = !doc.requestorReadAt;

      const claimed = await PracticeTransfer.findOneAndUpdate(
        {
          _id: doc._id,
          ...buildAutoMatchClaimableFilter(now, { labAnchorId }),
        },
        {
          $set: {
            assigneeLabAnchorId: labOid,
            assigneeLabName,
            requestorReadAt: now,
            requestorReadBy: req.user?._id || null,
            requestorDownloadedAt: now,
            requestorDownloadedBy: req.user?._id || null,
            workCanceledAt: null,
            workCanceledBy: null,
            "autoMatch.claimedAt": now,
            "autoMatch.subcontractPoolOpen": false,
            // 3시간 강제 클레임 만료 폐기 — 작업완료/취소까지 유지
            "autoMatch.deadlineAt": null,
            "autoMatch.claimHours": null,
            "autoMatch.completedAt": null,
            "autoMatch.completedBy": null,
          },
        },
        { new: true },
      );

      if (!claimed) {
        const latest = await PracticeTransfer.findById(doc._id).lean();
        return res.status(409).json({
          success: false,
          message: "다른 기공소가 이미 수락했습니다.",
          data: latest ? toAutoMatchApiFields(latest, labAnchorId) : null,
        });
      }

      doc = claimed;
      clearAutoMatchPriorityTimers(doc._id);

      let billingResult = null;
      try {
        billingResult = await adjustPracticeTransferHold({
          transfer: doc,
          toothWorks: Array.isArray(doc.toothWorks) ? doc.toothWorks : [],
          actorUserId: req.user?._id,
        });
        if (billingResult?.reason === "legacy_already_committed") {
          billingResult = {
            ...billingResult,
            billed: true,
            fees: billingResult.fees || {
              labFeeTotal: Number(doc.billing?.labFeeTotal || 0),
              abutmentRetailTotal: Number(doc.billing?.abutmentRetailTotal || 0),
              abutmentQty: Number(doc.billing?.abutmentQty || 0),
              total: Number(doc.billing?.total || 0),
            },
            labSettlementAmount: Number(doc.billing?.labSettlementAmount || 0),
            abutsRevenueAmount: Number(doc.billing?.abutsRevenueAmount || 0),
            isPartner: Boolean(doc.billing?.isTradingPartner),
            relationshipKind: doc.billing?.relationshipKind || "none",
            feeRateApplied: Number(doc.billing?.feeRateApplied || 0),
            labFeeMultiplier: Number(doc.billing?.labFeeMultiplier || 1),
          };
        } else {
          await persistAcceptedBillingFields(doc, billingResult);
        }
      } catch (billingErr) {
        // 과금 실패 시 claim 해제 (다른 기공소가 재시도 가능)
        try {
          await rollbackPracticeTransferBilling({ transferId: doc._id });
        } catch {
          // ignore
        }
        clearAutoMatchClaimFields(doc, { bumpRelease: false });
        await doc.save();
        const status = Number(billingErr?.statusCode || 500);
        return res.status(status).json({
          success: false,
          message: billingErr?.message || "기공의뢰 수락 과금에 실패했습니다.",
          ...(billingErr?.payload || {}),
        });
      }

      let abutmentEnsure = { requestIds: [], shippingMode: null };
      try {
        abutmentEnsure = await ensureAbutmentRequestsOnAccept({
          transferDoc: doc,
          actorUserId: req.user?._id || null,
        });
      } catch (abutErr) {
        try {
          await rollbackPracticeTransferBilling({ transferId: doc._id });
        } catch {
          // ignore
        }
        clearAutoMatchClaimFields(doc, { bumpRelease: false });
        await doc.save();
        return res.status(409).json({
          success: false,
          message:
            String(abutErr?.message || "").trim() ||
            "커스텀어벗 어벗츠 의뢰 생성에 실패했습니다.",
        });
      }

      const unreadCount =
        resolveUnreadCountForAccept(labAnchorId, { wasUnread }) ?? 0;

      const realtimePayload = {
        action: "accepted",
        transferId: String(doc.transferId || "").trim(),
        transferMongoId: String(doc._id || "").trim(),
        targetLabAnchorId: labAnchorId,
        targetLabName: labName,
        matchingMode: "auto",
        practiceUserId: String(doc.practiceUserId || "").trim() || null,
        requestorReadAt: doc.requestorReadAt,
        requestorDownloadedAt: doc.requestorDownloadedAt,
        requestorAcceptedAt: doc.requestorDownloadedAt,
        unreadCount,
        status: String(doc.status || "active").trim(),
        manufacturerStage: "의뢰수락",
        billing: doc.billing || null,
        feeQuote: buildAcceptedFeeQuotePayload(billingResult, doc),
        production: toProductionApiFields(doc.production),
        updatedAt: doc.updatedAt || new Date(),
        ...toAutoMatchApiFields(doc, labAnchorId),
      };
      const practiceRealtimePayload = {
        ...realtimePayload,
        ...redactAutoMatchLabIdentity("auto", {
          targetLabName: labName,
          targetLabAnchorId: labAnchorId,
        }),
      };

      emitAppEventToUser(req.user?._id, "practice:transfer-updated", realtimePayload);
      scheduleAcceptSideEffects({
        doc,
        labAnchorId,
        labOid,
        scope,
        labUserId: req.user?._id,
        billingResult,
        realtimePayload,
        practiceRealtimePayload,
        poolPayload: {
          ...realtimePayload,
          action: "auto-match-claimed",
          source: "autoMatchClaim",
        },
        systemChatContent: "의뢰를 수락했습니다.",
      });

      return res.status(200).json({
        success: true,
        data: {
          transferId: String(doc.transferId || "").trim(),
          requestorReadAt: doc.requestorReadAt,
          requestorDownloadedAt: doc.requestorDownloadedAt,
          requestorAcceptedAt: doc.requestorDownloadedAt,
          isAccepted: true,
          billing: doc.billing || null,
          production: toProductionApiFields(doc.production),
          unreadCount,
          abutmentRequestIds: abutmentEnsure.requestIds || [],
          ...toTransferFilesApiFields(doc),
          ...toAutoMatchApiFields(doc, labAnchorId),
        },
      });
    }

    // —— direct (지정 기공소) 기존 로직 ——
    const alreadyAccepted = Boolean(doc.requestorDownloadedAt);
    const wasUnread = !doc.requestorReadAt;
    let billingResult = null;

    if (!alreadyAccepted) {
      try {
        billingResult = await adjustPracticeTransferHold({
          transfer: doc,
          toothWorks: Array.isArray(doc.toothWorks) ? doc.toothWorks : [],
          actorUserId: req.user?._id,
        });
        if (billingResult?.reason === "legacy_already_committed") {
          billingResult = {
            ...billingResult,
            billed: true,
            fees: billingResult.fees || {
              labFeeTotal: Number(doc.billing?.labFeeTotal || 0),
              abutmentRetailTotal: Number(doc.billing?.abutmentRetailTotal || 0),
              abutmentQty: Number(doc.billing?.abutmentQty || 0),
              total: Number(doc.billing?.total || 0),
            },
            labSettlementAmount: Number(doc.billing?.labSettlementAmount || 0),
            abutsRevenueAmount: Number(doc.billing?.abutsRevenueAmount || 0),
            isPartner: Boolean(doc.billing?.isTradingPartner),
            relationshipKind: doc.billing?.relationshipKind || "none",
            feeRateApplied: Number(doc.billing?.feeRateApplied || 0),
            labFeeMultiplier: Number(doc.billing?.labFeeMultiplier || 1),
          };
        }
      } catch (billingErr) {
        const status = Number(billingErr?.statusCode || 500);
        return res.status(status).json({
          success: false,
          message: billingErr?.message || "기공의뢰 수락 과금에 실패했습니다.",
          ...(billingErr?.payload || {}),
        });
      }
    }

    if (!alreadyAccepted) {
      const remake = toRemakeApiFields(doc).isRemake;
      const labFeeTotal = Math.max(
        0,
        Math.round(Number(billingResult?.fees?.labFeeTotal || 0)),
      );
      if (
        !remake &&
        toothWorksNeedLabFee(doc.toothWorks) &&
        labFeeTotal <= 0
      ) {
        return rejectLabFeeUnconfigured(res, {
          statusCode: 409,
          message: LAB_FEE_UNCONFIGURED_ACCEPT_MESSAGE,
          code: LAB_FEE_UNCONFIGURED_REASON,
          missingFeeNames: labFeeItemNamesNeededForToothWorks(doc.toothWorks),
        });
      }
    }

    const acceptSet = {};
    if (!doc.requestorReadAt) {
      doc.requestorReadAt = now;
      doc.requestorReadBy = req.user?._id || null;
      acceptSet.requestorReadAt = now;
      acceptSet.requestorReadBy = req.user?._id || null;
    }
    if (!doc.requestorDownloadedAt) {
      doc.requestorDownloadedAt = now;
      doc.requestorDownloadedBy = req.user?._id || null;
      doc.workCanceledAt = null;
      doc.workCanceledBy = null;
      acceptSet.requestorDownloadedAt = now;
      acceptSet.requestorDownloadedBy = req.user?._id || null;
      acceptSet.workCanceledAt = null;
      acceptSet.workCanceledBy = null;
      if (isSubcontractPoolOpen(doc)) {
        acceptSet["autoMatch.subcontractPoolOpen"] = false;
        acceptSet["autoMatch.claimedAt"] = now;
        if (!doc.autoMatch || typeof doc.autoMatch !== "object") {
          doc.autoMatch = {};
        }
        doc.autoMatch.subcontractPoolOpen = false;
        doc.autoMatch.claimedAt = now;
      }
    } else if (doc.workCanceledAt) {
      doc.workCanceledAt = null;
      doc.workCanceledBy = null;
      acceptSet.workCanceledAt = null;
      acceptSet.workCanceledBy = null;
    }

    if (billingResult?.billed || billingResult?.fees) {
      const billing = buildAcceptedBillingFields(doc, billingResult);
      if (billing) {
        doc.billing = billing;
        acceptSet.billing = billing;
      }
    }
    if (Object.keys(acceptSet).length > 0) {
      await PracticeTransfer.updateOne({ _id: doc._id }, { $set: acceptSet });
    }

    let abutmentEnsure = { requestIds: [] };
    if (!alreadyAccepted || hasCustomAbutmentToothWorks(doc.toothWorks)) {
      try {
        abutmentEnsure = await ensureAbutmentRequestsOnAccept({
          transferDoc: doc,
          actorUserId: req.user?._id || null,
        });
      } catch (abutErr) {
        if (!alreadyAccepted) {
          return res.status(409).json({
            success: false,
            message:
              String(abutErr?.message || "").trim() ||
              "커스텀어벗 어벗츠 의뢰 생성에 실패했습니다.",
          });
        }
      }
    }

    const unreadCount =
      resolveUnreadCountForAccept(labAnchorId, { wasUnread }) ?? 0;

    const realtimePayload = {
      action: "accepted",
      transferId: String(doc.transferId || "").trim(),
      transferMongoId: String(doc._id || "").trim(),
      targetLabAnchorId: String(doc.targetLabAnchorId || "").trim() || null,
      targetLabName: String(doc.targetLabName || "").trim(),
      matchingMode: "direct",
      practiceUserId: String(doc.practiceUserId || "").trim() || null,
      requestorReadAt: doc.requestorReadAt,
      requestorDownloadedAt: doc.requestorDownloadedAt,
      requestorAcceptedAt: doc.requestorDownloadedAt,
      unreadCount,
      status: String(doc.status || "active").trim(),
      manufacturerStage: "의뢰수락",
      billing: doc.billing || null,
      feeQuote: buildAcceptedFeeQuotePayload(billingResult, doc),
      production: toProductionApiFields(doc.production),
      updatedAt: doc.updatedAt || new Date(),
    };

    emitAppEventToUser(req.user?._id, "practice:transfer-updated", realtimePayload);
    const labLabelForChat =
      String(doc.targetLabName || "").trim() &&
      String(doc.targetLabName || "").trim() !== AUTO_MATCH_LAB_DISPLAY_NAME
        ? String(doc.targetLabName || "").trim()
        : "기공소";
    scheduleAcceptSideEffects({
      doc,
      labAnchorId,
      labOid: doc.targetLabAnchorId,
      scope,
      labUserId: req.user?._id,
      billingResult,
      realtimePayload,
      practiceRealtimePayload: realtimePayload,
      // 이미 수락된 건 재진입 시 시스템 메시지 중복 방지
      systemChatContent: alreadyAccepted
        ? ""
        : `기공소「${labLabelForChat}」이(가) 의뢰를 수락했습니다.`,
    });

    return res.status(200).json({
      success: true,
      data: {
        transferId: String(doc.transferId || "").trim(),
        requestorReadAt: doc.requestorReadAt,
        requestorDownloadedAt: doc.requestorDownloadedAt,
        requestorAcceptedAt: doc.requestorDownloadedAt,
        isAccepted: true,
        billing: doc.billing || null,
        production: toProductionApiFields(doc.production),
        abutmentRequestIds: abutmentEnsure.requestIds || [],
        unreadCount,
        ...toTransferFilesApiFields(doc),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "기공의뢰 수락 처리 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

/** @deprecated 의뢰수락 SSOT — markReceivedPracticeTransferAccepted 사용 */
export const markReceivedPracticeTransferDownloaded =
  markReceivedPracticeTransferAccepted;

export async function markReceivedPracticeTransferComplete(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferLabReceiverRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const transferIdFilter = buildTransferIdFilter(req.params?.transferId);
    if (!transferIdFilter) {
      return res.status(400).json({
        success: false,
        message: "transferId가 필요합니다.",
      });
    }

    const { scope, labAnchorId } = await buildReceivedScope(req);
    if (scope === null || !labAnchorId) {
      return res.status(404).json({ success: false, message: "전송 내역을 찾을 수 없습니다." });
    }

    const doc = await PracticeTransfer.findOne({
      ...scope,
      ...transferIdFilter,
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: "전송 내역을 찾을 수 없습니다." });
    }

    if (String(doc.status || "").trim() === "canceled") {
      return res.status(409).json({
        success: false,
        message: "취소된 기공의뢰는 완료할 수 없습니다.",
      });
    }

    if (isAutoMatchCompleted(doc)) {
      return res.status(200).json({
        success: true,
        data: {
          transferId: String(doc.transferId || "").trim(),
          alreadyCompleted: true,
          ...toAutoMatchApiFields(doc, labAnchorId),
        },
      });
    }

    const isAuto = isAutoMatchMode(doc);
    const accepted = Boolean(doc.requestorDownloadedAt);
    if (!accepted) {
      return res.status(409).json({
        success: false,
        message: "의뢰수락된 건만 작업 완료할 수 있습니다.",
      });
    }

    if (String(doc.targetLabAnchorId || "").trim() !== labAnchorId) {
      return res.status(403).json({
        success: false,
        message: "수락한 기공소만 작업 완료할 수 있습니다.",
      });
    }

    if (isAuto && !isAutoMatchClaimActive(doc)) {
      return res.status(409).json({
        success: false,
        message: "수락되지 않은 의뢰입니다.",
        data: toAutoMatchApiFields(doc, labAnchorId),
      });
    }

    const resultFiles = normalizeResultFiles(req.body?.resultFiles);
    if (resultFiles.length === 0) {
      return res.status(400).json({
        success: false,
        message: "작업 완료하려면 결과 파일을 1개 이상 업로드해주세요.",
      });
    }

    const hasCustomAbutment = hasCustomAbutmentToothWorks(doc.toothWorks);
    const existingRelated = Array.isArray(doc.production?.relatedRequestIds)
      ? doc.production.relatedRequestIds
      : [];
    // 레거시: 수락 시 Request 미생성 건만 보정(이미 있으면 skip)
    if (hasCustomAbutment && existingRelated.length === 0) {
      try {
        await ensureAbutmentRequestsOnAccept({
          transferDoc: doc,
          actorUserId: req.user?._id || null,
        });
      } catch {
        // complete는 크라운 업로드가 주 목적 — 보정 실패는 디자인 컨펌 경로에서 재시도
      }
    }

    const now = new Date();
    const skipDesignConfirm = doc.production?.skipDesignConfirm !== false;

    let releaseResult = null;
    try {
      releaseResult = await releasePracticeTransferLabShare({
        transfer: doc,
        toothWorks: Array.isArray(doc.toothWorks) ? doc.toothWorks : [],
        actorUserId: req.user?._id,
      });
      if (
        releaseResult?.reason === "no_hold" &&
        !doc.billing?.labSettledAt &&
        !doc.billing?.settledAt &&
        !doc.billing?.billedAt
      ) {
        // 보류 없는 레거시·0원 건은 통과
      } else if (
        releaseResult?.reason === "zero_lab_fee"
      ) {
        // 기공비 0(어벗만 등) — 기공소몫 해제 불필요
      } else if (
        releaseResult?.reason === "no_hold" &&
        Number(doc.billing?.heldLabTotal || doc.billing?.heldTotal || 0) > 0 &&
        !doc.billing?.labSettledAt &&
        !doc.billing?.settledAt
      ) {
        return res.status(409).json({
          success: false,
          message: "에스크로 보류 내역이 없어 기공크레딧을 지급할 수 없습니다.",
        });
      }
    } catch (releaseErr) {
      const status = Number(releaseErr?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        success: false,
        message:
          releaseErr?.message || "작업완료 기공크레딧 지급에 실패했습니다.",
        ...(releaseErr?.payload || {}),
      });
    }

    try {
      await chargePracticeTransferLabShipping({
        transfer: doc,
        toothWorks: Array.isArray(doc.toothWorks) ? doc.toothWorks : [],
        actorUserId: req.user?._id,
      });
    } catch (shipErr) {
      const status = Number(shipErr?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        success: false,
        message:
          shipErr?.message || "기공소 배송비 차감에 실패했습니다.",
        ...(shipErr?.payload || {}),
      });
    }

    let confirmedAt = null;
    let manufacturerStage = "작업완료";

    // skipDesignConfirm: 크라운 완료 후 치과 컨펌 없이 생산진행
    if (skipDesignConfirm) {
      confirmedAt = now;
      manufacturerStage = "생산진행";
    }

    const relatedAfterEnsure = Array.isArray(doc.production?.relatedRequestIds)
      ? doc.production.relatedRequestIds
      : existingRelated;

    if (
      releaseResult?.released ||
      releaseResult?.reason === "already_released" ||
      releaseResult?.reason === "zero_lab_fee"
    ) {
      const labSettledAt = new Date();
      const heldAbutment = Math.max(
        0,
        Math.round(
          Number(
            releaseResult.fees?.abutmentRetailTotal ??
              doc.billing?.heldAbutmentTotal ??
              doc.billing?.abutmentRetailTotal ??
              0,
          ),
        ),
      );
      const abutmentAlreadySettled = Boolean(
        doc.billing?.abutmentSettledAt || heldAbutment <= 0,
      );
      doc.billing = {
        ...(doc.billing && typeof doc.billing === "object" ? doc.billing : {}),
        labFeeTotal:
          releaseResult.fees?.labFeeTotal ??
          releaseResult.labFeeTotal ??
          Number(doc.billing?.labFeeTotal || 0),
        abutmentRetailTotal:
          releaseResult.fees?.abutmentRetailTotal ??
          Number(doc.billing?.abutmentRetailTotal || 0),
        abutmentQty:
          releaseResult.fees?.abutmentQty ?? Number(doc.billing?.abutmentQty || 0),
        total: releaseResult.fees?.total ?? Number(doc.billing?.total || 0),
        labSettlementAmount:
          releaseResult.labSettlementAmount ??
          Number(doc.billing?.labSettlementAmount || 0),
        abutsRevenueAmount:
          releaseResult.abutsRevenueAmount ??
          Number(doc.billing?.abutsRevenueAmount || 0),
        labSettledAt,
        ...(abutmentAlreadySettled
          ? {
              abutmentSettledAt:
                doc.billing?.abutmentSettledAt || labSettledAt,
              settledAt: labSettledAt,
            }
          : {}),
      };
    }

    doc.resultFiles = resultFiles;
    doc.autoMatch = {
      ...(doc.autoMatch && typeof doc.autoMatch === "object" ? doc.autoMatch : {}),
      completedAt: now,
      completedBy: req.user?._id || null,
    };
    doc.production = {
      ...(doc.production && typeof doc.production === "object" ? doc.production : {}),
      skipDesignConfirm,
      confirmedAt,
      confirmedBy: confirmedAt ? doc.practiceUserId || null : null,
      relatedRequestIds: relatedAfterEnsure,
    };
    await doc.save();

    const realtimePayload = {
      action: confirmedAt ? "production-confirmed" : "completed",
      transferId: String(doc.transferId || "").trim(),
      transferMongoId: String(doc._id || "").trim(),
      targetLabAnchorId: labAnchorId,
      matchingMode: isAuto ? "auto" : "direct",
      practiceUserId: String(doc.practiceUserId || "").trim() || null,
      status: String(doc.status || "active").trim(),
      manufacturerStage,
      updatedAt: doc.updatedAt || now,
      resultFileCount: resultFiles.length,
      hasCustomAbutment,
      production: toProductionApiFields(doc.production),
      ...toAutoMatchApiFields(doc, labAnchorId),
    };

    emitAppEventToUser(req.user?._id, "practice:transfer-updated", realtimePayload);
    const emitJobs = [
      emitPracticeTransferEventToPracticeUsers({
        practiceBusinessAnchorId: doc.practiceBusinessAnchorId,
        type: "practice:transfer-updated",
        payload: realtimePayload,
        extraUserIds: [doc.practiceUserId],
      }),
      emitPracticeTransferEventToRequestorUsers({
        targetLabAnchorId: labAnchorId,
        type: "practice:transfer-updated",
        payload: realtimePayload,
      }),
    ];
    if (releaseResult?.released) {
      const settlement = Number(releaseResult.labSettlementAmount || 0);
      if (settlement !== 0 && doc.targetLabAnchorId) {
        emitJobs.push(
          emitCreditBalanceUpdatedToBusiness({
            businessAnchorId: doc.targetLabAnchorId,
            balanceDelta: settlement,
            reason: "practice_transfer_lab_settlement",
            refId: doc._id,
            forceEmit: true,
          }),
        );
      }
    }
    await Promise.all(emitJobs);

    return res.status(200).json({
      success: true,
      data: {
        transferId: String(doc.transferId || "").trim(),
        resultFileCount: resultFiles.length,
        resultFiles: resultFiles.map((item, idx) => ({
          id: `${String(doc._id)}::result::${idx + 1}`,
          patientName: item.patientName,
          tooth: item.tooth,
          originalName: item.file.originalName,
          mimetype: item.file.mimetype,
          size: item.file.size,
          s3Key: item.file.s3Key,
        })),
        manufacturerStage,
        production: toProductionApiFields(doc.production),
        hasCustomAbutment,
        ...toAutoMatchApiFields(doc, labAnchorId),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "기공의뢰 작업 완료 처리 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

/**
 * 기공소 보철 결과파일 분할 저장 — 작업완료(에스크로 지급) 없이 resultFiles만 append.
 * related: POST /api/practice/transfers/:transferId/result-files
 */
export async function appendReceivedPracticeTransferResultFiles(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferLabReceiverRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const transferIdFilter = buildTransferIdFilter(req.params?.transferId);
    if (!transferIdFilter) {
      return res.status(400).json({
        success: false,
        message: "transferId가 필요합니다.",
      });
    }

    const { scope, labAnchorId } = await buildReceivedScope(req);
    if (scope === null || !labAnchorId) {
      return res.status(404).json({ success: false, message: "전송 내역을 찾을 수 없습니다." });
    }

    const doc = await PracticeTransfer.findOne({
      ...scope,
      ...transferIdFilter,
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: "전송 내역을 찾을 수 없습니다." });
    }

    if (String(doc.status || "").trim() === "canceled") {
      return res.status(409).json({
        success: false,
        message: "취소된 기공의뢰에는 결과 파일을 추가할 수 없습니다.",
      });
    }

    if (isAutoMatchCompleted(doc)) {
      return res.status(409).json({
        success: false,
        message: "이미 작업완료된 의뢰입니다. 분할 저장 대신 완료 상태를 확인해주세요.",
      });
    }

    const isAuto = isAutoMatchMode(doc);
    const accepted = Boolean(doc.requestorDownloadedAt);
    if (!accepted) {
      return res.status(409).json({
        success: false,
        message: "의뢰수락된 건만 결과 파일을 올릴 수 있습니다.",
      });
    }

    if (String(doc.targetLabAnchorId || "").trim() !== labAnchorId) {
      return res.status(403).json({
        success: false,
        message: "수락한 기공소만 결과 파일을 올릴 수 있습니다.",
      });
    }

    if (isAuto && !isAutoMatchClaimActive(doc)) {
      return res.status(409).json({
        success: false,
        message: "수락되지 않은 의뢰입니다.",
        data: toAutoMatchApiFields(doc, labAnchorId),
      });
    }

    const incoming = normalizeResultFiles(req.body?.resultFiles);
    if (incoming.length === 0) {
      return res.status(400).json({
        success: false,
        message: "결과 파일을 1개 이상 업로드해주세요.",
      });
    }

    const existing = normalizeResultFiles(doc.resultFiles);
    const byKey = new Map(
      existing.map((row) => [String(row.file?.s3Key || "").trim(), row]),
    );
    for (const row of incoming) {
      const key = String(row.file?.s3Key || "").trim();
      if (!key) continue;
      byKey.set(key, row);
    }
    const merged = [...byKey.values()];
    doc.resultFiles = merged;
    await doc.save();

    const hasCustomAbutment = hasCustomAbutmentToothWorks(doc.toothWorks);
    const now = new Date();
    const realtimePayload = {
      action: "result-files-appended",
      transferId: String(doc.transferId || "").trim(),
      transferMongoId: String(doc._id || "").trim(),
      targetLabAnchorId: labAnchorId,
      matchingMode: isAuto ? "auto" : "direct",
      practiceUserId: String(doc.practiceUserId || "").trim() || null,
      status: String(doc.status || "active").trim(),
      manufacturerStage: String(doc.manufacturerStage || "").trim() || null,
      updatedAt: doc.updatedAt || now,
      resultFileCount: merged.length,
      hasCustomAbutment,
      production: toProductionApiFields(doc.production),
      ...toAutoMatchApiFields(doc, labAnchorId),
    };

    emitAppEventToUser(req.user?._id, "practice:transfer-updated", realtimePayload);
    await Promise.all([
      emitPracticeTransferEventToPracticeUsers({
        practiceBusinessAnchorId: doc.practiceBusinessAnchorId,
        type: "practice:transfer-updated",
        payload: realtimePayload,
        extraUserIds: [doc.practiceUserId],
      }),
      emitPracticeTransferEventToRequestorUsers({
        targetLabAnchorId: labAnchorId,
        type: "practice:transfer-updated",
        payload: realtimePayload,
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        transferId: String(doc.transferId || "").trim(),
        resultFileCount: merged.length,
        resultFiles: merged.map((item, idx) => ({
          id: `${String(doc._id)}::result::${idx + 1}`,
          patientName: item.patientName,
          tooth: item.tooth,
          originalName: item.file.originalName,
          mimetype: item.file.mimetype,
          size: item.file.size,
          s3Key: item.file.s3Key,
        })),
        production: toProductionApiFields(doc.production),
        hasCustomAbutment,
        ...toAutoMatchApiFields(doc, labAnchorId),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "보철 결과 파일 저장 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

/**
 * 기공소 「어벗 디자인 확인」— Abuts 디자인 수락 후 생산 게이트.
 */
export async function confirmPracticeTransferAbutmentDesign(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferLabReceiverRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const transferIdFilter = buildTransferIdFilter(req.params?.transferId);
    if (!transferIdFilter) {
      return res.status(400).json({
        success: false,
        message: "transferId가 필요합니다.",
      });
    }

    const { scope, labAnchorId } = await buildReceivedScope(req);
    if (scope === null || !labAnchorId) {
      return res.status(404).json({ success: false, message: "전송 내역을 찾을 수 없습니다." });
    }

    const doc = await PracticeTransfer.findOne({
      ...scope,
      ...transferIdFilter,
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: "전송 내역을 찾을 수 없습니다." });
    }

    if (String(doc.status || "").trim() === "canceled") {
      return res.status(409).json({
        success: false,
        message: "취소된 기공의뢰는 디자인 컨펌할 수 없습니다.",
      });
    }

    if (!hasCustomAbutmentToothWorks(doc.toothWorks)) {
      return res.status(400).json({
        success: false,
        message: "커스텀 어벗먼트가 없는 의뢰입니다.",
      });
    }

    if (String(doc.targetLabAnchorId || "").trim() !== labAnchorId && role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "수락한 기공소만 어벗 디자인을 확인할 수 있습니다.",
      });
    }

    if (!isAbutmentDesignReady(doc)) {
      return res.status(409).json({
        success: false,
        message: "어벗츠 디자인 파일이 아직 준비되지 않았습니다.",
      });
    }

    const now = new Date();
    if (!doc.production?.labDesignConfirmedAt) {
      doc.production = {
        ...(doc.production && typeof doc.production === "object" ? doc.production : {}),
        labDesignConfirmedAt: now,
        labDesignConfirmedBy: req.user?._id || null,
      };
      await PracticeTransfer.updateOne(
        { _id: doc._id },
        {
          $set: {
            "production.labDesignConfirmedAt": now,
            "production.labDesignConfirmedBy": req.user?._id || null,
          },
        },
      );
    }

    let startResult = { started: false };
    try {
      startResult = await tryStartAbutmentProduction({
        transferDoc: doc,
        actorUserId: req.user?._id || null,
      });
    } catch (startErr) {
      return res.status(409).json({
        success: false,
        message:
          String(startErr?.message || "").trim() ||
          "어벗 생산 시작에 실패했습니다.",
      });
    }

    const fresh = await PracticeTransfer.findById(doc._id);
    const realtimePayload = {
      action: "abutment-design-confirmed",
      transferId: String(doc.transferId || "").trim(),
      transferMongoId: String(doc._id || "").trim(),
      targetLabAnchorId: labAnchorId,
      practiceUserId: String(doc.practiceUserId || "").trim() || null,
      production: toProductionApiFields(fresh?.production || doc.production),
      abutmentProductionStarted: Boolean(startResult?.started),
      updatedAt: fresh?.updatedAt || now,
    };

    emitAppEventToUser(req.user?._id, "practice:transfer-updated", realtimePayload);
    await emitPracticeTransferEventToPracticeUsers({
      practiceBusinessAnchorId: doc.practiceBusinessAnchorId,
      type: "practice:transfer-updated",
      payload: realtimePayload,
      extraUserIds: [doc.practiceUserId],
    });
    await emitPracticeTransferEventToRequestorUsers({
      targetLabAnchorId: labAnchorId,
      type: "practice:transfer-updated",
      payload: realtimePayload,
    });

    return res.status(200).json({
      success: true,
      data: {
        transferId: String(doc.transferId || "").trim(),
        production: toProductionApiFields(fresh?.production || doc.production),
        abutmentProductionStarted: Boolean(startResult?.started),
        awaitingPracticeDesignConfirm:
          fresh?.production?.skipDesignConfirm === false &&
          !fresh?.production?.practiceDesignConfirmedAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "어벗 디자인 확인 처리 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

/**
 * 치과 「생산 진행」/디자인 컨펌.
 * - 크라운 작업완료 전 + CA + skipDesignConfirm=false: 어벗 디자인 생산 게이트
 * - 크라운 작업완료 후: 작업완료 → 생산진행 (Request 생성 없음)
 */
export async function confirmPracticeTransferProduction(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferSenderRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const transferIdFilter = buildTransferIdFilter(req.params?.transferId);
    if (!transferIdFilter) {
      return res.status(400).json({
        success: false,
        message: "transferId가 필요합니다.",
      });
    }

    const { scope } = await buildPracticeOwnedScope(req);
    const doc = await PracticeTransfer.findOne({
      ...scope,
      ...transferIdFilter,
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: "전송 내역을 찾을 수 없습니다." });
    }

    if (String(doc.status || "").trim() === "canceled") {
      return res.status(409).json({
        success: false,
        message: "취소된 기공의뢰는 생산 진행할 수 없습니다.",
      });
    }

    const crownCompleted = isAutoMatchCompleted(doc);
    const hasCustomAbutment = hasCustomAbutmentToothWorks(doc.toothWorks);
    const now = new Date();

    // —— (a) 어벗 디자인 생산 게이트 (크라운 완료 전) ——
    if (!crownCompleted && hasCustomAbutment) {
      if (doc.production?.skipDesignConfirm !== false) {
        return res.status(409).json({
          success: false,
          message: "디자인 컨펌 생략 의뢰는 치과 디자인 컨펌이 필요하지 않습니다.",
        });
      }
      if (!isAbutmentDesignReady(doc)) {
        return res.status(409).json({
          success: false,
          message: "어벗츠 디자인 파일이 아직 준비되지 않았습니다.",
        });
      }

      if (!doc.production?.practiceDesignConfirmedAt) {
        doc.production = {
          ...(doc.production && typeof doc.production === "object" ? doc.production : {}),
          practiceDesignConfirmedAt: now,
          practiceDesignConfirmedBy: req.user?._id || null,
        };
        await PracticeTransfer.updateOne(
          { _id: doc._id },
          {
            $set: {
              "production.practiceDesignConfirmedAt": now,
              "production.practiceDesignConfirmedBy": req.user?._id || null,
            },
          },
        );
      }

      let startResult = { started: false };
      try {
        startResult = await tryStartAbutmentProduction({
          transferDoc: doc,
          actorUserId: req.user?._id || null,
        });
      } catch (startErr) {
        return res.status(409).json({
          success: false,
          message:
            String(startErr?.message || "").trim() ||
            "어벗 생산 시작에 실패했습니다.",
        });
      }

      const fresh = await PracticeTransfer.findById(doc._id);
      const realtimePayload = {
        action: "practice-design-confirmed",
        transferId: String(doc.transferId || "").trim(),
        transferMongoId: String(doc._id || "").trim(),
        targetLabAnchorId: String(doc.targetLabAnchorId || "").trim() || null,
        practiceUserId: String(doc.practiceUserId || "").trim() || null,
        production: toProductionApiFields(fresh?.production || doc.production),
        abutmentProductionStarted: Boolean(startResult?.started),
        awaitingLabDesignConfirm: !fresh?.production?.labDesignConfirmedAt,
        updatedAt: fresh?.updatedAt || now,
      };

      await emitPracticeTransferEventToPracticeUsers({
        practiceBusinessAnchorId: doc.practiceBusinessAnchorId,
        type: "practice:transfer-updated",
        payload: realtimePayload,
        extraUserIds: [doc.practiceUserId, req.user?._id],
      });
      if (doc.targetLabAnchorId) {
        await emitPracticeTransferEventToRequestorUsers({
          targetLabAnchorId: String(doc.targetLabAnchorId),
          type: "practice:transfer-updated",
          payload: realtimePayload,
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          transferId: String(doc.transferId || "").trim(),
          mode: "abutment-design-gate",
          production: toProductionApiFields(fresh?.production || doc.production),
          abutmentProductionStarted: Boolean(startResult?.started),
          canStart: canStartAbutmentProduction(fresh || doc),
        },
      });
    }

    // —— (b) 크라운 작업완료 후 생산진행 ——
    if (!crownCompleted) {
      return res.status(409).json({
        success: false,
        message: "기공소 작업완료 후 생산 진행할 수 있습니다.",
      });
    }

    const resultFiles = normalizeResultFiles(doc.resultFiles);
    if (resultFiles.length === 0) {
      return res.status(409).json({
        success: false,
        message: "작업 결과 파일이 없어 생산 진행할 수 없습니다.",
      });
    }

    if (doc.production?.confirmedAt) {
      return res.status(200).json({
        success: true,
        data: {
          transferId: String(doc.transferId || "").trim(),
          alreadyConfirmed: true,
          manufacturerStage: "생산진행",
          production: toProductionApiFields(doc.production),
        },
      });
    }

    // 레거시 CA: Request 없으면 스캔 기반 생성
    if (hasCustomAbutment) {
      try {
        await ensureAbutmentRequestsOnAccept({
          transferDoc: doc,
          actorUserId: doc.autoMatch?.completedBy || null,
        });
      } catch (createErr) {
        return res.status(409).json({
          success: false,
          message:
            String(createErr?.message || "").trim() ||
            "어벗츠 의뢰 보정 생성에 실패했습니다.",
        });
      }
    }

    doc.production = {
      ...(doc.production && typeof doc.production === "object" ? doc.production : {}),
      confirmedAt: now,
      confirmedBy: req.user?._id || null,
    };
    await doc.save();

    const labAnchorId = String(doc.targetLabAnchorId || "").trim() || null;
    const realtimePayload = {
      action: "production-confirmed",
      transferId: String(doc.transferId || "").trim(),
      transferMongoId: String(doc._id || "").trim(),
      targetLabAnchorId: labAnchorId,
      matchingMode: isAutoMatchMode(doc) ? "auto" : "direct",
      practiceUserId: String(doc.practiceUserId || "").trim() || null,
      status: String(doc.status || "active").trim(),
      manufacturerStage: "생산진행",
      updatedAt: doc.updatedAt || now,
      production: toProductionApiFields(doc.production),
      hasCustomAbutment,
      ...toAutoMatchApiFields(doc, labAnchorId),
    };

    await emitPracticeTransferEventToPracticeUsers({
      practiceBusinessAnchorId: doc.practiceBusinessAnchorId,
      type: "practice:transfer-updated",
      payload: realtimePayload,
      extraUserIds: [doc.practiceUserId, req.user?._id],
    });
    if (labAnchorId) {
      await emitPracticeTransferEventToRequestorUsers({
        targetLabAnchorId: labAnchorId,
        type: "practice:transfer-updated",
        payload: realtimePayload,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        transferId: String(doc.transferId || "").trim(),
        mode: "crown-complete-gate",
        manufacturerStage: "생산진행",
        production: toProductionApiFields(doc.production),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "생산 진행 처리 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

/**
 * 기공소 작업취소: 수락(클레임)을 되돌린다.
 * - auto: 과금 롤백 후 공개 풀 재공개
 * - direct: 과금 롤백 후 의뢰수락 해제(지정 기공소는 유지)
 */
export async function markReceivedPracticeTransferRelease(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferLabReceiverRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const transferIdFilter = buildTransferIdFilter(req.params?.transferId);
    if (!transferIdFilter) {
      return res.status(400).json({
        success: false,
        message: "transferId가 필요합니다.",
      });
    }

    const { scope, labAnchorId } = await buildReceivedScope(req);
    if (scope === null || !labAnchorId) {
      return res.status(404).json({ success: false, message: "전송 내역을 찾을 수 없습니다." });
    }

    const doc = await PracticeTransfer.findOne({
      ...scope,
      ...transferIdFilter,
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: "전송 내역을 찾을 수 없습니다." });
    }

    if (String(doc.status || "").trim() === "canceled") {
      return res.status(409).json({
        success: false,
        message: "이미 취소된 기공의뢰입니다.",
      });
    }

    if (isAutoMatchCompleted(doc)) {
      return res.status(409).json({
        success: false,
        message: "작업 완료된 의뢰는 취소할 수 없습니다.",
      });
    }

    const isAutoEarly = isAutoMatchMode(doc);
    // 이미 수락 해제된 재요청(더블클릭·지연 응답) — 409 대신 멱등 성공으로 UI를 맞춘다.
    if (!doc.requestorDownloadedAt) {
      const alreadyOpenPool = isAutoEarly && isAutoMatchOpenPool(doc);
      const alreadyWorkCanceled = Boolean(doc.workCanceledAt);
      if (alreadyOpenPool || alreadyWorkCanceled) {
        return res.status(200).json({
          success: true,
          data: {
            transferId: String(doc.transferId || "").trim(),
            released: true,
            alreadyReleased: true,
            matchingMode: isAutoEarly ? "auto" : "direct",
            workCanceledAt: doc.workCanceledAt || null,
            manufacturerStage: resolvePracticeTransferManufacturerStage(doc, {
              viewerLabAnchorId: labAnchorId,
            }),
            ...toAutoMatchApiFields(doc, labAnchorId),
          },
        });
      }
      return res.status(409).json({
        success: false,
        message: "의뢰수락된 건만 작업 취소할 수 있습니다.",
      });
    }

    if (String(doc.targetLabAnchorId || "").trim() !== labAnchorId) {
      return res.status(403).json({
        success: false,
        message: "수락한 기공소만 작업 취소할 수 있습니다.",
      });
    }

    if (await hasRelatedAbutmentPastReady(doc)) {
      return res.status(409).json({
        success: false,
        message:
          "어벗 가공이 시작된 의뢰는 수락 취소할 수 없습니다. 제조사가 준비 단계일 때만 가능합니다.",
        code: "abutment_machining_started",
      });
    }

    const isAuto = isAutoMatchMode(doc);
    const previousLabAnchorId = String(doc.targetLabAnchorId || "").trim() || null;
    const previousLabName = String(doc.targetLabName || "").trim();
    const now = new Date();
    const prevBilling =
      doc.billing && typeof doc.billing === "object" ? doc.billing : {};
    const spendTotal = Number(prevBilling.total || 0);
    const settlementAmount = Number(prevBilling.labSettlementAmount || 0);

    try {
      await rollbackPracticeTransferBilling({ transferId: doc._id });
    } catch (rollbackErr) {
      console.warn(
        "[practiceTransfer] work-cancel billing rollback failed",
        String(doc?._id || ""),
        rollbackErr?.message || rollbackErr,
      );
    }

    try {
      const clearResult = await clearRelatedAbutmentProductionOnRelease(doc);
      if (clearResult?.blockedPastReady) {
        return res.status(409).json({
          success: false,
          message:
            "어벗 가공이 시작된 의뢰는 수락 취소할 수 없습니다. 제조사가 준비 단계일 때만 가능합니다.",
          code: "abutment_machining_started",
        });
      }
    } catch (clearErr) {
      console.warn(
        "[practiceTransfer] work-cancel abutment production clear failed",
        String(doc?._id || ""),
        clearErr?.message || clearErr,
      );
    }

    if (isAuto) {
      clearAutoMatchClaimFields(doc, { bumpRelease: true });
      doc.workCanceledAt = now;
      doc.workCanceledBy = req.user?._id || null;
      await PracticeTransfer.updateOne(
        { _id: doc._id },
        {
          $set: {
            targetLabAnchorId: doc.targetLabAnchorId,
            targetLabName: doc.targetLabName,
            requestorReadAt: doc.requestorReadAt,
            requestorReadBy: doc.requestorReadBy,
            requestorDownloadedAt: doc.requestorDownloadedAt,
            requestorDownloadedBy: doc.requestorDownloadedBy,
            billing: doc.billing,
            autoMatch: doc.autoMatch,
            workCanceledAt: doc.workCanceledAt,
            workCanceledBy: doc.workCanceledBy,
          },
        },
      );
    } else {
      const billingReset = {
        labFeeTotal: 0,
        abutmentRetailTotal: 0,
        abutmentQty: 0,
        total: 0,
        isTradingPartner: false,
        relationshipKind: "none",
        feeRateApplied: 0,
        labFeeMultiplier: Number(prevBilling.labFeeMultiplier || 1),
        labTradingPartnerId: null,
        labSettlementAmount: 0,
        abutsRevenueAmount: 0,
        billedAt: null,
        heldAt: null,
        heldTotal: 0,
        heldLabTotal: 0,
        heldAbutmentTotal: 0,
        holdFromPaid: 0,
        holdFromFreeRequest: 0,
        holdFromFreeShipping: 0,
        settledAt: null,
        labSettledAt: null,
        abutmentSettledAt: null,
      };
      doc.requestorDownloadedAt = null;
      doc.requestorDownloadedBy = null;
      doc.workCanceledAt = now;
      doc.workCanceledBy = req.user?._id || null;
      doc.billing = billingReset;
      if (doc.autoMatch && typeof doc.autoMatch === "object") {
        doc.autoMatch.completedAt = null;
        doc.autoMatch.completedBy = null;
      }
      await PracticeTransfer.updateOne(
        { _id: doc._id },
        {
          $set: {
            requestorDownloadedAt: null,
            requestorDownloadedBy: null,
            workCanceledAt: now,
            workCanceledBy: req.user?._id || null,
            billing: billingReset,
            "autoMatch.completedAt": null,
            "autoMatch.completedBy": null,
          },
        },
      );
    }

    invalidateUnreadCountCache(labAnchorId);

    const labLabel =
      previousLabName && previousLabName !== AUTO_MATCH_LAB_DISPLAY_NAME
        ? previousLabName
        : "기공소";
    const systemChatContent = isAuto
      ? "작업을 취소했습니다. 자동 매칭으로 다른 기공소에 다시 공개됩니다."
      : `기공소「${labLabel}」이(가) 작업을 취소했습니다. 다른 기공소를 지정하거나 휴지통으로 옮길 수 있습니다.`;

    const realtimePayload = {
      action: isAuto ? "auto-match-released" : "accept-released",
      transferId: String(doc.transferId || "").trim(),
      transferMongoId: String(doc._id || "").trim(),
      targetLabAnchorId: isAuto ? null : previousLabAnchorId,
      previousLabAnchorId,
      previousLabName: previousLabName || null,
      targetLabName: String(doc.targetLabName || "").trim(),
      matchingMode: isAuto ? "auto" : "direct",
      practiceUserId: String(doc.practiceUserId || "").trim() || null,
      requestorReadAt: doc.requestorReadAt,
      requestorDownloadedAt: doc.requestorDownloadedAt,
      requestorAcceptedAt: doc.requestorDownloadedAt,
      status: String(doc.status || "active").trim(),
      manufacturerStage: isAuto ? "자동매칭" : "작업취소",
      workCanceledAt: doc.workCanceledAt || now,
      updatedAt: now,
      source: "workCancelRelease",
      ...toAutoMatchApiFields(doc, labAnchorId),
    };

    emitAppEventToUser(req.user?._id, "practice:transfer-updated", realtimePayload);

    void (async () => {
      try {
        const jobs = [
          postPracticeTransferSystemChatMessage({
            transferMongoId: doc._id,
            senderUserId: req.user?._id,
            content: systemChatContent,
            systemEvent: "work_cancel",
          }),
          emitPracticeTransferEventToPracticeUsers({
            practiceBusinessAnchorId: doc.practiceBusinessAnchorId,
            type: "practice:transfer-updated",
            payload: isAuto
              ? {
                  ...realtimePayload,
                  ...redactAutoMatchLabIdentity("auto", {
                    targetLabName: realtimePayload.targetLabName,
                    targetLabAnchorId: realtimePayload.targetLabAnchorId,
                  }),
                  previousLabAnchorId: null,
                  previousLabName: AUTO_MATCH_LAB_DISPLAY_NAME,
                }
              : realtimePayload,
            extraUserIds: [doc.practiceUserId],
          }),
        ];
        if (previousLabAnchorId) {
          jobs.push(
            emitPracticeTransferEventToRequestorUsers({
              targetLabAnchorId: previousLabAnchorId,
              type: "practice:transfer-updated",
              payload: realtimePayload,
            }),
          );
        }
        if (isAuto) {
          jobs.push(
            notifyAutoMatchPriorityOpenedEarly({
              transfer: doc,
              realtimePayload: {
                ...realtimePayload,
                action: "auto-match-released",
                source: "workCancelRelease",
                targetLabAnchorId: null,
                manufacturerStage: "자동매칭",
              },
              excludeLabAnchorIds: previousLabAnchorId
                ? [previousLabAnchorId]
                : [],
              emitPoolCreated: emitAutoMatchPoolCreated,
            }),
          );
        }
        if (spendTotal > 0 && doc.practiceBusinessAnchorId) {
          jobs.push(
            emitCreditBalanceUpdatedToBusiness({
              businessAnchorId: doc.practiceBusinessAnchorId,
              balanceDelta: spendTotal,
              reason: "practice_transfer_release",
              refId: doc._id,
            }),
          );
        }
        if (settlementAmount > 0 && previousLabAnchorId) {
          jobs.push(
            emitCreditBalanceUpdatedToBusiness({
              businessAnchorId: previousLabAnchorId,
              balanceDelta: -settlementAmount,
              reason: "practice_transfer_lab_settlement_rollback",
              refId: doc._id,
            }),
          );
        }
        await Promise.all(jobs);
      } catch (err) {
        console.warn(
          "[practiceTransfer] work-cancel side-effects failed",
          String(doc?._id || ""),
          err?.message || err,
        );
      }
    })();

    return res.status(200).json({
      success: true,
      data: {
        transferId: String(doc.transferId || "").trim(),
        released: true,
        matchingMode: isAuto ? "auto" : "direct",
        workCanceledAt: doc.workCanceledAt || now,
        manufacturerStage: isAuto ? "자동매칭" : "작업취소",
        ...toAutoMatchApiFields(doc, labAnchorId),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "기공의뢰 작업 취소 처리 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

/**
 * 어벗츠 기공사업부: 지정 의뢰를 인증 기공소 하청 풀로 연다.
 * 거부하지 않는다. 어벗츠 자체 수행도 계속 가능.
 */
export async function openSubcontractPracticeTransfer(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (role !== "internalLab" && role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "어벗츠 기공사업부만 하청으로 전환할 수 있습니다.",
      });
    }
    if (!isPracticeTransferLabReceiverRole(role) && role !== "admin") {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const transferIdFilter = buildTransferIdFilter(req.params?.transferId);
    if (!transferIdFilter) {
      return res.status(400).json({
        success: false,
        message: "transferId가 필요합니다.",
      });
    }

    const { scope, labAnchorId } = await buildReceivedScope(req);
    if (scope === null || !labAnchorId) {
      return res.status(404).json({
        success: false,
        message: "전송 내역을 찾을 수 없습니다.",
      });
    }

    const now = new Date();
    const doc = await PracticeTransfer.findOne({
      ...scope,
      ...transferIdFilter,
    });

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: "전송 내역을 찾을 수 없습니다.",
      });
    }

    if (String(doc.status || "").trim() === "canceled") {
      return res.status(409).json({
        success: false,
        message: "이미 취소된 기공의뢰입니다.",
      });
    }

    if (!canOpenPracticeTransferSubcontract(doc, labAnchorId, now)) {
      return res.status(409).json({
        success: false,
        message: "하청 전환 권한이 없거나 이미 하청이 진행 중입니다.",
      });
    }

    const eligibleIds = await loadCertifiedSubcontractLabAnchorIds({
      excludeLabAnchorId: labAnchorId,
    });
    if (!eligibleIds.length) {
      return res.status(409).json({
        success: false,
        message:
          "수가가 설정된 인증 기공소가 없어 하청 풀을 열 수 없습니다.",
      });
    }

    const eligibleOids = eligibleIds.map((id) => new Types.ObjectId(String(id)));
    await PracticeTransfer.updateOne(
      { _id: doc._id },
      {
        $set: {
          "autoMatch.subcontractPoolOpen": true,
          "autoMatch.eligibleLabAnchorIds": eligibleOids,
          "autoMatch.priorityUntil": now,
          "autoMatch.claimedAt": null,
        },
      },
    );
    if (!doc.autoMatch || typeof doc.autoMatch !== "object") {
      doc.autoMatch = {};
    }
    doc.autoMatch.subcontractPoolOpen = true;
    doc.autoMatch.eligibleLabAnchorIds = eligibleOids;
    doc.autoMatch.priorityUntil = now;
    doc.autoMatch.claimedAt = null;
    clearAutoMatchPriorityTimers(doc._id);

    const realtimePayload = {
      action: "subcontract-pool-opened",
      transferId: String(doc.transferId || "").trim(),
      transferMongoId: String(doc._id || "").trim(),
      targetLabAnchorId: String(doc.targetLabAnchorId || "").trim() || null,
      matchingMode: "direct",
      practiceUserId: String(doc.practiceUserId || "").trim() || null,
      status: String(doc.status || "active").trim(),
      manufacturerStage: "하청대기",
      updatedAt: now,
      source: "openSubcontract",
      ...toAutoMatchApiFields(doc, labAnchorId),
    };

    emitAppEventToUser(req.user?._id, "practice:transfer-updated", realtimePayload);

    void notifyAutoMatchPriorityOpenedEarly({
      transfer: doc,
      realtimePayload: {
        ...realtimePayload,
        manufacturerStage: "하청대기",
        ...toAutoMatchApiFields(doc, null),
      },
      excludeLabAnchorIds: [labAnchorId],
      emitPoolCreated: emitAutoMatchPoolCreated,
    }).catch((err) => {
      console.warn(
        "[practiceTransfer] open-subcontract emit failed",
        String(doc?._id || ""),
        err?.message || err,
      );
    });

    return res.status(200).json({
      success: true,
      message: "하청 기공소에 공개했습니다.",
      data: {
        transferId: String(doc.transferId || "").trim(),
        matchingMode: "direct",
        manufacturerStage: "하청대기",
        ...toAutoMatchApiFields(doc, labAnchorId),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "하청 전환 처리 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

/**
 * 기공소 수락 전 「거부」.
 * - 자동매칭 공개 풀: 이 기공소만 declinedLabAnchorIds에 넣고 목록에서 제외(의뢰는 타 기공소에 유지).
 * - 지정 기공소: canceled(휴지통)로 보내지 않고 작업취소로 둔다. 치과 「취소」·기공소 「거부」.
 */
export async function markReceivedPracticeTransferReject(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferLabReceiverRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const transferIdFilter = buildTransferIdFilter(req.params?.transferId);
    if (!transferIdFilter) {
      return res.status(400).json({
        success: false,
        message: "transferId가 필요합니다.",
      });
    }

    const { scope, labAnchorId } = await buildReceivedScope(req);
    if (scope === null || !labAnchorId) {
      return res.status(404).json({ success: false, message: "전송 내역을 찾을 수 없습니다." });
    }

    const labOid = new Types.ObjectId(labAnchorId);
    const doc = await PracticeTransfer.findOne({
      ...scope,
      ...transferIdFilter,
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: "전송 내역을 찾을 수 없습니다." });
    }

    if (String(doc.status || "").trim() === "canceled") {
      return res.status(409).json({
        success: false,
        message: "이미 취소된 기공의뢰입니다.",
      });
    }

    if (doc.requestorDownloadedAt) {
      return res.status(409).json({
        success: false,
        message: "이미 수락한 의뢰는 거부할 수 없습니다. 작업취소를 이용해주세요.",
      });
    }

    if (isAutoMatchCompleted(doc)) {
      return res.status(409).json({
        success: false,
        message: "작업 완료된 의뢰는 거부할 수 없습니다.",
      });
    }

    const isAuto = isAutoMatchMode(doc);
    const openPool = isAutoMatchOpenPool(doc);
    const subcontractPoolForOthers =
      isSubcontractPoolOpen(doc) &&
      String(labAnchorId) !== getPrimeLabAnchorId(doc);
    const now = new Date();

    if ((isAuto && openPool) || subcontractPoolForOthers) {
      const declined = Array.isArray(doc.autoMatch?.declinedLabAnchorIds)
        ? doc.autoMatch.declinedLabAnchorIds.map((id) => String(id || "").trim())
        : [];
      const priorityWasActive = isAutoMatchPriorityActive(doc, now);
      const wasPriorityLab = isAutoMatchPriorityLabAnchorId(doc, labAnchorId);
      const shouldOpenPriorityEarly = priorityWasActive && wasPriorityLab;

      if (!declined.includes(labAnchorId) || shouldOpenPriorityEarly) {
        if (!doc.autoMatch || typeof doc.autoMatch !== "object") {
          doc.autoMatch = {};
        }
        const $set = {
          labRejectedAt: now,
          labRejectedByLabAnchorId: labOid,
        };
        if (shouldOpenPriorityEarly) {
          $set["autoMatch.priorityUntil"] = now;
        }
        await PracticeTransfer.updateOne(
          { _id: doc._id },
          {
            ...(declined.includes(labAnchorId)
              ? {}
              : { $addToSet: { "autoMatch.declinedLabAnchorIds": labOid } }),
            $set,
          },
        );
      }

      const nextDeclined = declined.includes(labAnchorId)
        ? declined
        : [...declined, labAnchorId];
      if (!doc.autoMatch || typeof doc.autoMatch !== "object") {
        doc.autoMatch = {};
      }
      doc.autoMatch.declinedLabAnchorIds = nextDeclined;
      if (shouldOpenPriorityEarly) {
        doc.autoMatch.priorityUntil = now;
      }

      const realtimePayload = {
        action: "rejected",
        transferId: String(doc.transferId || "").trim(),
        transferMongoId: String(doc._id || "").trim(),
        targetLabAnchorId: labAnchorId,
        matchingMode: "auto",
        practiceUserId: String(doc.practiceUserId || "").trim() || null,
        status: String(doc.status || "active").trim(),
        manufacturerStage: "거부",
        labRejected: true,
        labRejectedAt: now,
        updatedAt: now,
        source: "labReject",
      };

      emitAppEventToUser(req.user?._id, "practice:transfer-updated", realtimePayload);

      if (shouldOpenPriorityEarly) {
        void notifyAutoMatchPriorityOpenedEarly({
          transfer: doc,
          realtimePayload: {
            ...realtimePayload,
            action: "auto-match-priority-opened",
            source: "labRejectPriorityOpen",
            manufacturerStage: "자동매칭",
            labRejected: false,
            targetLabAnchorId: null,
            ...toAutoMatchApiFields(doc, null),
          },
          excludeLabAnchorIds: [labAnchorId],
          emitPoolCreated: emitAutoMatchPoolCreated,
        }).catch((err) => {
          console.warn(
            "[practiceTransfer] priority early open emit failed",
            String(doc?._id || ""),
            err?.message || err,
          );
        });
      }

      return res.status(200).json({
        success: true,
        message: shouldOpenPriorityEarly
          ? "의뢰를 거부했습니다. 다른 기공소에 공개됩니다."
          : "의뢰를 거부했습니다. 다른 기공소에 계속 공개됩니다.",
        data: {
          transferId: String(doc.transferId || "").trim(),
          rejected: true,
          matchingMode: "auto",
          canceled: false,
          labRejected: true,
          labRejectedAt: now,
          manufacturerStage: "거부",
          priorityOpenedEarly: shouldOpenPriorityEarly,
        },
      });
    }

    // 지정 기공소: 활성 유지 + 작업취소(치과 「취소」). 기공소 뷰는 labRejected로 「거부」.
    const targetId = String(doc.targetLabAnchorId || "").trim();
    if (targetId && targetId !== labAnchorId && role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "지정된 기공소만 거부할 수 있습니다.",
      });
    }

    try {
      await rollbackPracticeTransferBilling({ transferId: doc._id });
    } catch (rollbackErr) {
      console.warn(
        "[practiceTransfer] lab-reject billing rollback failed",
        String(doc?._id || ""),
        rollbackErr?.message || rollbackErr,
      );
    }

    const prevBilling =
      doc.billing && typeof doc.billing === "object" ? doc.billing : {};
    const billingReset = {
      labFeeTotal: 0,
      abutmentRetailTotal: 0,
      abutmentQty: 0,
      total: 0,
      isTradingPartner: false,
      relationshipKind: "none",
      feeRateApplied: 0,
      labFeeMultiplier: Number(prevBilling.labFeeMultiplier || 1),
      labTradingPartnerId: null,
      labSettlementAmount: 0,
      abutsRevenueAmount: 0,
      billedAt: null,
      heldAt: null,
      heldTotal: 0,
      heldLabTotal: 0,
      heldAbutmentTotal: 0,
      holdFromPaid: 0,
      holdFromFreeRequest: 0,
      holdFromFreeShipping: 0,
      settledAt: null,
      labSettledAt: null,
      abutmentSettledAt: null,
    };

    doc.requestorDownloadedAt = null;
    doc.requestorDownloadedBy = null;
    doc.workCanceledAt = now;
    doc.workCanceledBy = req.user?._id || null;
    doc.labRejectedAt = now;
    doc.labRejectedByLabAnchorId = labOid;
    doc.billing = billingReset;

    await PracticeTransfer.updateOne(
      { _id: doc._id },
      {
        $set: {
          requestorDownloadedAt: null,
          requestorDownloadedBy: null,
          workCanceledAt: now,
          workCanceledBy: req.user?._id || null,
          labRejectedAt: now,
          labRejectedByLabAnchorId: labOid,
          billing: billingReset,
        },
      },
    );

    const transferId = String(doc.transferId || "").trim();
    const transferMongoId = String(doc._id || "").trim();
    const labLabel =
      String(doc.targetLabName || "").trim() &&
      String(doc.targetLabName || "").trim() !== AUTO_MATCH_LAB_DISPLAY_NAME
        ? String(doc.targetLabName || "").trim()
        : "기공소";
    const realtimePayload = {
      action: "lab-rejected",
      transferId,
      transferMongoId,
      targetLabAnchorId: labAnchorId,
      targetLabName: String(doc.targetLabName || "").trim(),
      matchingMode: isAuto ? "auto" : "direct",
      practiceUserId: String(doc.practiceUserId || "").trim() || null,
      unreadCount: null,
      status: String(doc.status || "active").trim(),
      manufacturerStage: "작업취소",
      labRejected: true,
      labRejectedAt: now,
      workCanceledAt: now,
      updatedAt: now,
      source: "labReject",
    };

    emitAppEventToUser(req.user?._id, "practice:transfer-updated", {
      ...realtimePayload,
      manufacturerStage: "거부",
    });

    void (async () => {
      try {
        await Promise.all([
          postPracticeTransferSystemChatMessage({
            transferMongoId: doc._id,
            senderUserId: req.user?._id,
            content: `기공소「${labLabel}」이(가) 의뢰를 거부했습니다. 다른 기공소를 지정하거나 휴지통으로 옮길 수 있습니다.`,
            systemEvent: "work_reject",
          }),
          emitPracticeTransferEventToPracticeUsers({
            practiceBusinessAnchorId: doc.practiceBusinessAnchorId,
            type: "practice:transfer-updated",
            payload: realtimePayload,
            extraUserIds: [doc.practiceUserId],
          }),
          emitPracticeTransferEventToRequestorUsers({
            targetLabAnchorId: labAnchorId,
            type: "practice:transfer-updated",
            payload: {
              ...realtimePayload,
              manufacturerStage: "거부",
            },
          }),
        ]);
      } catch (err) {
        console.warn(
          "[practiceTransfer] lab-reject side-effects failed",
          String(doc?._id || ""),
          err?.message || err,
        );
      }
    })();

    return res.status(200).json({
      success: true,
      message: "의뢰를 거부했습니다.",
      data: {
        transferId,
        rejected: true,
        matchingMode: isAuto ? "auto" : "direct",
        canceled: false,
        labRejected: true,
        labRejectedAt: now,
        workCanceledAt: now,
        manufacturerStage: "거부",
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "기공의뢰 거부 처리 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

/**
 * 치과: 기공소 거부·작업취소 건의 기공소를 바꿔 다시 공개/지정 전송.
 * - 기존 transferId 유지. workCanceled/labRejected 해제 후 새 기공소(또는 자동매칭)로 보류 재설정.
 */
export async function retargetPracticeTransferLab(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferSenderRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const transferIdFilter = buildTransferIdFilter(req.params?.transferId);
    if (!transferIdFilter) {
      return res.status(400).json({
        success: false,
        message: "transferId가 필요합니다.",
      });
    }

    const { scope } = await buildPracticeOwnedScope(req);
    const doc = await PracticeTransfer.findOne({
      ...scope,
      ...transferIdFilter,
    });

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: "전송 내역을 찾을 수 없습니다.",
      });
    }

    if (String(doc.status || "").trim() === "canceled") {
      return res.status(409).json({
        success: false,
        message: "휴지통의 의뢰는 기공소를 변경할 수 없습니다. 먼저 복구해 주세요.",
      });
    }

    const stage = resolvePracticeTransferManufacturerStage(doc);
    if (stage !== "작업취소") {
      return res.status(409).json({
        success: false,
        message: "기공소가 취소·거부한 의뢰만 기공소를 바꿔 다시 전송할 수 있습니다.",
      });
    }

    const practiceAnchorId = req.user?.businessAnchorId || null;
    if (!practiceAnchorId) {
      return res.status(400).json({
        success: false,
        message: "치과 사업자 정보가 필요합니다. 사업자 등록 후 다시 시도해주세요.",
      });
    }

    const matchingModeRaw = String(req.body?.matchingMode || "")
      .trim()
      .toLowerCase();
    const rawAnchorId = String(req.body?.targetLabAnchorId || "").trim();
    const rawLabName = String(req.body?.targetLabName || "").trim();
    const resolvedTarget = await resolveCreateMatchingTarget({
      matchingModeRaw,
      autoMatchFlag: req.body?.autoMatch === true,
      rawAnchorId,
      targetLabName: rawLabName,
    });
    if (resolvedTarget.error) {
      return res.status(resolvedTarget.error.status).json({
        success: false,
        message: resolvedTarget.error.message,
      });
    }
    const matchingMode = resolvedTarget.matchingMode;
    let targetLabAnchorId = resolvedTarget.targetLabAnchorId;
    let targetLabName = resolvedTarget.targetLabName;
    if (matchingMode === "direct") {
      if (!Types.ObjectId.isValid(rawAnchorId) && !targetLabAnchorId) {
        return res.status(400).json({
          success: false,
          message: "대상 기공소를 선택해주세요.",
        });
      }
      if (!targetLabAnchorId) {
        targetLabAnchorId = new Types.ObjectId(rawAnchorId);
      }
      if (!targetLabName) {
        const anchor = await BusinessAnchor.findById(targetLabAnchorId)
          .select({ name: 1 })
          .lean();
        targetLabName = String(anchor?.name || "").trim();
      }
      if (!targetLabName) {
        return res.status(400).json({
          success: false,
          message: "대상 기공소를 선택해주세요.",
        });
      }
    }

    const toothWorks = Array.isArray(doc.toothWorks) ? doc.toothWorks : [];
    const previousLabAnchorId = String(doc.targetLabAnchorId || "").trim() || null;
    const previousLabName = String(doc.targetLabName || "").trim();
    const previousMatchingMode =
      String(doc.matchingMode || "").trim() === "auto" ? "auto" : "direct";
    const previousAutoMatch =
      doc.autoMatch && typeof doc.autoMatch === "object"
        ? { ...doc.autoMatch }
        : {};
    const previousWorkCanceledAt = doc.workCanceledAt || null;
    const previousWorkCanceledBy = doc.workCanceledBy || null;
    const previousLabRejectedAt = doc.labRejectedAt || null;
    const previousLabRejectedByLabAnchorId =
      doc.labRejectedByLabAnchorId || null;
    const previousBilling =
      doc.billing && typeof doc.billing === "object" ? { ...doc.billing } : {};
    const now = new Date();

    if (
      await rejectIfSubcontractDirectBlocked(res, {
        practiceAnchorId,
        matchingMode,
        labAnchorId: targetLabAnchorId,
      })
    ) {
      return;
    }

    let autoMatchBudget = null;
    let autoMatchEligibleLabAnchorIds = undefined;
    let autoMatchPriorityLabAnchorIds = [];
    let autoMatchCatalog = null;

    try {
      await assertPracticeTransferPaidCreditSufficient({
        practiceAnchorId,
        labAnchorId: targetLabAnchorId,
        toothWorks,
        autoMatchBudget,
        catalog: autoMatchCatalog,
        skipJig: Boolean(doc?.production?.skipJig),
      });
    } catch (creditErr) {
      const status = Number(creditErr?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        success: false,
        message:
          creditErr?.message || "기공소 변경 전송 전 유료크레딧 확인에 실패했습니다.",
        ...(creditErr?.payload || {}),
      });
    }

    try {
      await rollbackPracticeTransferBilling({ transferId: doc._id });
    } catch (rollbackErr) {
      console.warn(
        "[practiceTransfer] retarget billing rollback failed",
        String(doc?._id || ""),
        rollbackErr?.message || rollbackErr,
      );
    }

    const feeQuote = await buildPracticeTransferQuote({
      practiceAnchorId,
      labAnchorId: targetLabAnchorId,
      toothWorks,
      matchingMode,
      autoMatchBudget,
      catalog: autoMatchCatalog,
    });
    const billingPreview = toBillingPreviewFields(feeQuote);
    const autoMatchPriorityFields =
      matchingMode === "auto"
        ? buildAutoMatchPriorityFields({
            eligibleLabAnchorIds: autoMatchEligibleLabAnchorIds || [],
            priorityLabAnchorIds: autoMatchPriorityLabAnchorIds || [],
          })
        : null;

    const prevAuto =
      doc.autoMatch && typeof doc.autoMatch === "object" ? doc.autoMatch : {};
    const nextAutoMatch =
      matchingMode === "auto"
        ? {
            claimedAt: null,
            deadlineAt: null,
            claimHours: null,
            completedAt: null,
            completedBy: null,
            releaseCount: Number(prevAuto.releaseCount || 0),
            eligibleLabAnchorIds: autoMatchEligibleLabAnchorIds || [],
            declinedLabAnchorIds: Array.isArray(prevAuto.declinedLabAnchorIds)
              ? prevAuto.declinedLabAnchorIds
              : [],
            priorityUntil: autoMatchPriorityFields?.priorityUntil ?? null,
            ...(autoMatchPriorityFields?.priorityLabAnchorIds
              ? {
                  priorityLabAnchorIds:
                    autoMatchPriorityFields.priorityLabAnchorIds,
                }
              : { priorityLabAnchorIds: [] }),
          }
        : {
            claimedAt: null,
            deadlineAt: null,
            claimHours: null,
            completedAt: null,
            completedBy: null,
            releaseCount: Number(prevAuto.releaseCount || 0),
            eligibleLabAnchorIds: [],
            declinedLabAnchorIds: [],
            priorityUntil: null,
            priorityLabAnchorIds: [],
          };

    doc.targetLabAnchorId = targetLabAnchorId;
    doc.targetLabName = targetLabName;
    doc.assigneeLabAnchorId = null;
    doc.assigneeLabName = "";
    doc.matchingMode = matchingMode;
    doc.autoMatch = nextAutoMatch;
    doc.workCanceledAt = null;
    doc.workCanceledBy = null;
    doc.labRejectedAt = null;
    doc.labRejectedByLabAnchorId = null;
    doc.requestorDownloadedAt = null;
    doc.requestorDownloadedBy = null;
    doc.requestorReadAt = null;
    doc.requestorReadBy = null;
    doc.billing = billingPreview;
    doc.status = "active";

    await PracticeTransfer.updateOne(
      { _id: doc._id },
      {
        $set: {
          targetLabAnchorId,
          targetLabName,
          assigneeLabAnchorId: null,
          assigneeLabName: "",
          matchingMode,
          autoMatch: nextAutoMatch,
          workCanceledAt: null,
          workCanceledBy: null,
          labRejectedAt: null,
          labRejectedByLabAnchorId: null,
          requestorDownloadedAt: null,
          requestorDownloadedBy: null,
          requestorReadAt: null,
          requestorReadBy: null,
          billing: billingPreview,
          status: "active",
        },
      },
    );

    try {
      const holdResult = await holdPracticeTransferCredits({
        transfer: doc,
        toothWorks,
        holdAmount: Number(billingPreview?.total || feeQuote?.fees?.total || 0),
        holdLabAmount: Number(billingPreview?.labFeeTotal || 0),
        holdAbutmentAmount: Number(billingPreview?.abutmentRetailTotal || 0),
        actorUserId: req.user?._id,
      });
      if (holdResult?.held || holdResult?.reason === "already_held") {
        const heldBilling = {
          ...(doc.billing && typeof doc.billing === "object"
            ? doc.billing
            : billingPreview),
          heldAt: now,
          heldTotal: Number(holdResult.heldTotal || billingPreview?.total || 0),
          heldLabTotal: Number(
            holdResult.heldLabTotal ?? billingPreview?.labFeeTotal ?? 0,
          ),
          heldAbutmentTotal: Number(
            holdResult.heldAbutmentTotal ??
              billingPreview?.abutmentRetailTotal ??
              0,
          ),
          heldDesignFeeTotal: Number(holdResult.heldDesignFeeTotal || 0),
          heldShippingLabTotal: Number(holdResult.heldShippingLabTotal || 0),
          heldShippingAbutsTotal: Number(
            holdResult.heldShippingAbutsTotal || 0,
          ),
          holdFromPaid: Number(holdResult.fromPaid || 0),
          holdFromFreeRequest: Number(holdResult.fromFreeRequest || 0),
          holdFromFreeShipping: Number(holdResult.fromFreeShipping || 0),
        };
        doc.billing = heldBilling;
        await PracticeTransfer.updateOne(
          { _id: doc._id },
          { $set: { billing: heldBilling } },
        );
        if (Number(holdResult.heldTotal || 0) > 0) {
          await emitCreditBalanceUpdatedToBusiness({
            businessAnchorId: practiceAnchorId,
            balanceDelta: -Number(holdResult.heldTotal || 0),
            reason: "practice_transfer_retarget_hold",
            refId: doc._id,
          });
        }
      } else if (holdResult?.reason && holdResult.reason !== "zero_fee") {
        throw Object.assign(
          new Error("기공소 변경 전송 과금 보류에 실패했습니다."),
          { statusCode: 500, reason: holdResult.reason },
        );
      }
    } catch (holdErr) {
      console.warn(
        "[practiceTransfer] retarget hold failed",
        String(doc?._id || ""),
        holdErr?.message || holdErr,
      );
      try {
        await PracticeTransfer.updateOne(
          { _id: doc._id },
          {
            $set: {
              targetLabAnchorId: previousLabAnchorId
                ? new Types.ObjectId(previousLabAnchorId)
                : null,
              targetLabName: previousLabName,
              matchingMode: previousMatchingMode,
              autoMatch: previousAutoMatch,
              workCanceledAt: previousWorkCanceledAt,
              workCanceledBy: previousWorkCanceledBy,
              labRejectedAt: previousLabRejectedAt,
              labRejectedByLabAnchorId: previousLabRejectedByLabAnchorId,
              billing: previousBilling,
              status: "active",
            },
          },
        );
      } catch (revertErr) {
        console.warn(
          "[practiceTransfer] retarget hold-fail revert failed",
          String(doc?._id || ""),
          revertErr?.message || revertErr,
        );
      }
      return res.status(500).json({
        success: false,
        message: holdErr?.message || "기공소 변경 전송 과금 보류에 실패했습니다.",
      });
    }

    const transferId = String(doc.transferId || "").trim();
    const transferMongoId = String(doc._id || "").trim();
    const manufacturerStage = resolvePracticeTransferManufacturerStage(doc);
    const realtimePayload = {
      action: "lab-retargeted",
      transferId,
      transferMongoId,
      targetLabAnchorId: targetLabAnchorId ? String(targetLabAnchorId) : null,
      targetLabName,
      previousLabAnchorId,
      matchingMode,
      practiceUserId: String(doc.practiceUserId || "").trim() || null,
      status: "active",
      manufacturerStage,
      workCanceledAt: null,
      labRejected: false,
      updatedAt: now,
      source: "practiceLabRetarget",
      feeQuote: toFeeQuoteApi(feeQuote),
      ...toAutoMatchApiFields(doc, null),
    };

    void (async () => {
      try {
        const jobs = [
          postPracticeTransferSystemChatMessage({
            transferMongoId: doc._id,
            senderUserId: req.user?._id,
            content:
              matchingMode === "auto"
                ? "기공소를 자동 매칭으로 바꿔 다시 전송했습니다."
                : `기공소를「${targetLabName}」으로 바꿔 다시 전송했습니다.`,
            systemEvent: "lab_retarget",
          }),
          emitPracticeTransferEventToPracticeUsers({
            practiceBusinessAnchorId: doc.practiceBusinessAnchorId,
            type: "practice:transfer-updated",
            payload:
              matchingMode === "auto"
                ? {
                    ...realtimePayload,
                    ...redactAutoMatchLabIdentity("auto", {
                      targetLabName,
                      targetLabAnchorId: null,
                    }),
                  }
                : realtimePayload,
            extraUserIds: [doc.practiceUserId],
          }),
        ];
        if (previousLabAnchorId) {
          jobs.push(
            emitPracticeTransferEventToRequestorUsers({
              targetLabAnchorId: previousLabAnchorId,
              type: "practice:transfer-updated",
              payload: {
                ...realtimePayload,
                action: "lab-retargeted-away",
                manufacturerStage: "거부",
              },
            }),
          );
        }
        if (matchingMode === "direct" && targetLabAnchorId) {
          jobs.push(
            emitPracticeTransferEventToRequestorUsers({
              targetLabAnchorId: String(targetLabAnchorId),
              type: "practice:transfer-updated",
              payload: realtimePayload,
            }),
          );
        }
        if (matchingMode === "auto") {
          jobs.push(
            notifyAutoMatchPoolCreatedWithPriority({
              transfer: doc,
              realtimePayload: {
                ...realtimePayload,
                action: "auto-match-pool-created",
                source: "practiceLabRetarget",
              },
              eligibleLabAnchorIds: autoMatchEligibleLabAnchorIds,
              emitPoolCreated: emitAutoMatchPoolCreated,
            }),
          );
        }
        await Promise.all(jobs);
      } catch (err) {
        console.warn(
          "[practiceTransfer] retarget side-effects failed",
          String(doc?._id || ""),
          err?.message || err,
        );
      }
    })();

    return res.status(200).json({
      success: true,
      message: "기공소를 변경해 다시 전송했습니다.",
      data: {
        transferId,
        transferMongoId,
        matchingMode,
        targetLabAnchorId: targetLabAnchorId ? String(targetLabAnchorId) : null,
        targetLabName,
        manufacturerStage,
        feeQuote: toFeeQuoteApi(feeQuote),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "기공소 변경 전송 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function cancelPracticeTransfersBatch(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferSenderRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const transferIds = Array.isArray(req.body?.transferIds)
      ? req.body.transferIds.map((v) => String(v || "").trim()).filter(Boolean)
      : [];
    const transferMongoIds = Array.isArray(req.body?.transferMongoIds)
      ? req.body.transferMongoIds.map((v) => String(v || "").trim()).filter(Boolean)
      : [];

    if (transferIds.length === 0 && transferMongoIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "transferIds 또는 transferMongoIds가 필요합니다.",
      });
    }

    const filterOr = [];
    if (transferIds.length > 0) {
      filterOr.push({ transferId: { $in: transferIds } });
    }
    const validMongoIds = transferMongoIds.filter((id) => Types.ObjectId.isValid(id));
    if (validMongoIds.length > 0) {
      filterOr.push({ _id: { $in: validMongoIds.map((id) => new Types.ObjectId(id)) } });
    }

    // 모든 식별자가 무효하면 빈 $or 쿼리를 만들지 말고 요청 자체를 거절한다.
    if (filterOr.length === 0) {
      return res.status(400).json({
        success: false,
        message: "유효한 transferIds 또는 transferMongoIds가 필요합니다.",
      });
    }

    const { scope: baseScope } = await buildPracticeOwnedScope(req);

    // canceled 포함 조회 — 이미 휴지통인 건은 idempotent 성공 처리
    const docs = await PracticeTransfer.find({
      $and: [baseScope, { $or: filterOr }],
    });

    let successCount = 0;
    const failedIds = [];
    const affectedByAnchor = new Map();

    // 요청했지만 scope에서 찾지 못한 ID는 실패 목록에 반환한다.
    const foundTransferIdSet = new Set(
      docs.map((doc) => String(doc?.transferId || "").trim()).filter(Boolean),
    );
    const foundTransferMongoIdSet = new Set(
      docs.map((doc) => String(doc?._id || "").trim()).filter(Boolean),
    );
    for (const transferId of transferIds) {
      if (!foundTransferIdSet.has(transferId)) {
        failedIds.push(transferId);
      }
    }
    for (const transferMongoId of transferMongoIds) {
      if (!Types.ObjectId.isValid(transferMongoId)) {
        failedIds.push(transferMongoId);
        continue;
      }
      if (!foundTransferMongoIdSet.has(transferMongoId)) {
        failedIds.push(transferMongoId);
      }
    }

    for (const doc of docs) {
      try {
        if (String(doc?.status || "").trim() === "canceled") {
          successCount += 1;
          continue;
        }
        // UI와 동일: 의뢰수락 이후 공정은 치과 cancel-batch 불가
        const manufacturerStage = resolvePracticeTransferManufacturerStage(doc);
        if (!canCancelPracticeTransferByManufacturerStage(manufacturerStage)) {
          failedIds.push(String(doc?.transferId || doc?._id || ""));
          continue;
        }
        try {
          await rollbackPracticeTransferBilling({ transferId: doc._id });
        } catch (rollbackErr) {
          console.warn(
            "[practiceTransfer] billing rollback failed",
            String(doc?._id || ""),
            rollbackErr?.message || rollbackErr,
          );
        }
        doc.status = "canceled";
        doc.canceledAt = new Date();
        doc.canceledBy = req.user?._id || null;
        await doc.save();
        successCount += 1;

        const targetLabAnchorId = String(doc.targetLabAnchorId || "").trim();
        const transferId = String(doc.transferId || "").trim();
        const transferMongoId = String(doc._id || "").trim();

        if (targetLabAnchorId) {
          const prev = affectedByAnchor.get(targetLabAnchorId) || [];
          prev.push({ transferId, transferMongoId });
          affectedByAnchor.set(targetLabAnchorId, prev);
        }

        const realtimePayload = {
          action: "canceled",
          transferId,
          transferMongoId,
          targetLabAnchorId: targetLabAnchorId || null,
          practiceUserId: String(doc.practiceUserId || "").trim() || null,
          unreadCount: null,
          status: "canceled",
          updatedAt: doc.updatedAt || new Date(),
        };

        await emitPracticeTransferEventToPracticeUsers({
          practiceBusinessAnchorId: doc.practiceBusinessAnchorId,
          type: "practice:transfer-updated",
          payload: realtimePayload,
          extraUserIds: [doc.practiceUserId],
        });
      } catch {
        failedIds.push(String(doc?.transferId || doc?._id || ""));
      }
    }

    for (const [targetLabAnchorId, affected] of affectedByAnchor.entries()) {
      const scope = {
        targetLabAnchorId: new Types.ObjectId(targetLabAnchorId),
      };
      invalidateUnreadCountCache(scope);
      const unreadCount = await PracticeTransfer.countDocuments({
        ...scope,
        status: { $ne: "canceled" },
        requestorReadAt: null,
      });
      setRequestPerfCacheValue(
        unreadCountCacheKey(scope),
        { unreadCount },
        10 * 1000,
      );

      await emitPracticeTransferEventToRequestorUsers({
        targetLabAnchorId,
        type: "practice:transfer-updated",
        payload: {
          action: "canceled",
          targetLabAnchorId,
          affectedTransfers: affected,
          unreadCount,
          status: "canceled",
          updatedAt: new Date(),
        },
      });
    }

    invalidateAdminDashboardCaches();

    return res.status(200).json({
      success: true,
      data: {
        successCount,
        failedIds: Array.from(new Set(failedIds.filter(Boolean))),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "practice 전송 취소 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function restorePracticeTransfersBatch(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferSenderRole(role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const transferIds = Array.isArray(req.body?.transferIds)
      ? req.body.transferIds.map((v) => String(v || "").trim()).filter(Boolean)
      : [];
    const transferMongoIds = Array.isArray(req.body?.transferMongoIds)
      ? req.body.transferMongoIds.map((v) => String(v || "").trim()).filter(Boolean)
      : [];

    if (transferIds.length === 0 && transferMongoIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "transferIds 또는 transferMongoIds가 필요합니다.",
      });
    }

    const filterOr = [];
    if (transferIds.length > 0) {
      filterOr.push({ transferId: { $in: transferIds } });
    }
    const validMongoIds = transferMongoIds.filter((id) => Types.ObjectId.isValid(id));
    if (validMongoIds.length > 0) {
      filterOr.push({ _id: { $in: validMongoIds.map((id) => new Types.ObjectId(id)) } });
    }

    if (filterOr.length === 0) {
      return res.status(400).json({
        success: false,
        message: "유효한 transferIds 또는 transferMongoIds가 필요합니다.",
      });
    }

    const { scope: baseScope } = await buildPracticeOwnedScope(req);

    const docs = await PracticeTransfer.find({
      $and: [baseScope, { $or: filterOr }, { status: "canceled" }],
    });

    let successCount = 0;
    const failedIds = [];
    const affectedByAnchor = new Map();

    const foundTransferIdSet = new Set(
      docs.map((doc) => String(doc?.transferId || "").trim()).filter(Boolean),
    );
    const foundTransferMongoIdSet = new Set(
      docs.map((doc) => String(doc?._id || "").trim()).filter(Boolean),
    );
    for (const transferId of transferIds) {
      if (!foundTransferIdSet.has(transferId)) {
        failedIds.push(transferId);
      }
    }
    for (const transferMongoId of transferMongoIds) {
      if (!Types.ObjectId.isValid(transferMongoId)) {
        failedIds.push(transferMongoId);
        continue;
      }
      if (!foundTransferMongoIdSet.has(transferMongoId)) {
        failedIds.push(transferMongoId);
      }
    }

    for (const doc of docs) {
      try {
        doc.status = "active";
        doc.canceledAt = null;
        doc.canceledBy = null;
        await doc.save();
        successCount += 1;

        const targetLabAnchorId = String(doc.targetLabAnchorId || "").trim();
        const transferId = String(doc.transferId || "").trim();
        const transferMongoId = String(doc._id || "").trim();

        if (targetLabAnchorId) {
          const prev = affectedByAnchor.get(targetLabAnchorId) || [];
          prev.push({ transferId, transferMongoId });
          affectedByAnchor.set(targetLabAnchorId, prev);
        }

        const realtimePayload = {
          action: "restored",
          transferId,
          transferMongoId,
          targetLabAnchorId: targetLabAnchorId || null,
          practiceUserId: String(doc.practiceUserId || "").trim() || null,
          unreadCount: null,
          status: "active",
          updatedAt: doc.updatedAt || new Date(),
        };

        await emitPracticeTransferEventToPracticeUsers({
          practiceBusinessAnchorId: doc.practiceBusinessAnchorId,
          type: "practice:transfer-updated",
          payload: realtimePayload,
          extraUserIds: [doc.practiceUserId],
        });
      } catch {
        failedIds.push(String(doc?.transferId || doc?._id || ""));
      }
    }

    for (const [targetLabAnchorId, affected] of affectedByAnchor.entries()) {
      const scope = {
        targetLabAnchorId: new Types.ObjectId(targetLabAnchorId),
      };
      invalidateUnreadCountCache(scope);
      const unreadCount = await PracticeTransfer.countDocuments({
        ...scope,
        status: { $ne: "canceled" },
        requestorReadAt: null,
      });
      setRequestPerfCacheValue(
        unreadCountCacheKey(scope),
        { unreadCount },
        10 * 1000,
      );

      await emitPracticeTransferEventToRequestorUsers({
        targetLabAnchorId,
        type: "practice:transfer-updated",
        payload: {
          action: "restored",
          targetLabAnchorId,
          affectedTransfers: affected,
          unreadCount,
          status: "active",
          updatedAt: new Date(),
        },
      });
    }

    invalidateAdminDashboardCaches();

    return res.status(200).json({
      success: true,
      data: {
        successCount,
        failedIds: Array.from(new Set(failedIds.filter(Boolean))),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "practice 전송 복구 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}
