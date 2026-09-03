// related files:
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/jobs/practiceTransferArrivalAutoCompleteWorker.js
// - web/backend/utils/practiceTransferArrivalDates.js
// change-log:
// - 2026-09-02: 작업완료 수동 CTA 폐지. 치과도착일 경과(당일 제외) 시 자동 완료. CA 미업로드는 기한만료.
import { Types } from "mongoose";
import PracticeTransfer from "../models/practiceTransfer.model.js";
import User from "../models/user.model.js";
import { emitAppEventToUser } from "../socket.js";
import {
  releasePracticeTransferLabShare,
  chargePracticeTransferLabShipping,
} from "./practiceTransferBilling.service.js";
import {
  hasCustomAbutmentToothWorks,
  normalizeResultFiles,
  practiceTransferNeedsMoreAbutmentDesigns,
} from "./practiceTransferProduction.service.js";
import { postPracticeTransferSystemChatMessage } from "./chatSystemMessage.service.js";
import { emitCreditBalanceUpdatedToBusiness } from "../utils/creditRealtime.js";
import {
  isAutoMatchCompleted,
  isAutoMatchMode,
  toAutoMatchApiFields,
} from "../utils/practiceTransferAutoMatch.js";
import {
  isPracticeTransferDeletedStatus,
  practiceTransferNotDeletedMongoFilter,
} from "../utils/practiceTransferStage.js";
import {
  isPracticeTransferDueForArrivalAutoComplete,
  isPracticeTransferDueForArrivalDeadlineExpire,
} from "../utils/practiceTransferArrivalAutoComplete.js";
import { expirePracticeTransfersPastArrivalDeadline } from "./practiceTransferArrivalExpire.service.js";
import { getTodayYmdInKst } from "../utils/krBusinessDays.js";

export {
  isPracticeArrivalDatePast,
  isPracticeTransferDueForArrivalAutoComplete,
  resolvePracticeTransferCurrentArrivalYmd,
} from "../utils/practiceTransferArrivalAutoComplete.js";

function toProductionApiFields(production) {
  const p = production && typeof production === "object" ? production : {};
  const designFiles = normalizeResultFiles(p.designFiles);
  return {
    shippingMode:
      p.shippingMode === "express"
        ? "express"
        : p.shippingMode === "normal"
          ? "normal"
          : null,
    rushProcessing: Boolean(p.rushProcessing),
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
    abutmentPastReady: Boolean(p.abutmentProductionStartedAt),
    confirmedAt: p.confirmedAt || null,
    relatedRequestIds: Array.isArray(p.relatedRequestIds)
      ? p.relatedRequestIds.map((id) => String(id))
      : [],
  };
}

async function resolveLabReceiverUserIds(anchorId) {
  const raw = String(anchorId || "").trim();
  if (!raw || !Types.ObjectId.isValid(raw)) return [];
  const users = await User.find({
    businessAnchorId: new Types.ObjectId(raw),
    role: { $in: ["requestor", "internalLab"] },
    active: true,
  })
    .select({ _id: 1 })
    .lean();
  return users.map((u) => String(u?._id || "").trim()).filter(Boolean);
}

async function resolvePracticeSenderUserIds(anchorId) {
  const raw = String(anchorId || "").trim();
  if (!raw || !Types.ObjectId.isValid(raw)) return [];
  const users = await User.find({
    businessAnchorId: new Types.ObjectId(raw),
    role: { $in: ["practice", "requestor"] },
    active: true,
  })
    .select({ _id: 1 })
    .lean();
  return users.map((u) => String(u?._id || "").trim()).filter(Boolean);
}

/**
 * 기공의뢰 작업완료(수동 API·도착일 자동 공통).
 * @returns {Promise<{
 *   ok: true,
 *   alreadyCompleted?: boolean,
 *   manufacturerStage: string,
 *   releaseResult: object|null,
 *   hasCustomAbutment: boolean,
 *   resultFiles: object[],
 * } | { ok: false, statusCode: number, message: string, payload?: object }>}
 */
export async function completePracticeTransferWork({
  doc,
  actorUserId = null,
  resultFiles: rawResultFiles = null,
  reason = "manual",
  now = new Date(),
  emitRealtime = true,
} = {}) {
  if (!doc) {
    return {
      ok: false,
      statusCode: 404,
      message: "전송 내역을 찾을 수 없습니다.",
    };
  }
  if (isPracticeTransferDeletedStatus(doc.status)) {
    return {
      ok: false,
      statusCode: 409,
      message: "삭제된 기공의뢰는 완료할 수 없습니다.",
    };
  }
  if (isAutoMatchCompleted(doc)) {
    return {
      ok: true,
      alreadyCompleted: true,
      manufacturerStage: "작업완료",
      releaseResult: null,
      hasCustomAbutment: hasCustomAbutmentToothWorks(doc.toothWorks),
      resultFiles: normalizeResultFiles(doc.resultFiles),
    };
  }
  if (!doc.requestorDownloadedAt) {
    return {
      ok: false,
      statusCode: 409,
      message: "의뢰수락된 건만 작업 완료할 수 있습니다.",
    };
  }

  const todayYmd = getTodayYmdInKst(now);
  if (
    todayYmd &&
    practiceTransferNeedsMoreAbutmentDesigns(doc) &&
    isPracticeTransferDueForArrivalDeadlineExpire(doc, todayYmd)
  ) {
    return {
      ok: false,
      statusCode: 409,
      message:
        "치과도착일이 지났으나 어벗 디자인 STL이 업로드되지 않아 작업 완료할 수 없습니다.",
      code: "arrival_deadline_expired",
    };
  }

  const resultFiles =
    rawResultFiles == null
      ? normalizeResultFiles(doc.resultFiles)
      : normalizeResultFiles(rawResultFiles);

  // CA Request는 어벗 STL handoff에서만 생성(complete에서 빈 준비 건 보정 금지).

  const skipDesignConfirm = doc.production?.skipDesignConfirm !== false;
  let releaseResult = null;
  if (doc.billing?.labSettledAt) {
    releaseResult = { released: false, reason: "already_settled" };
  } else {
    try {
      releaseResult = await releasePracticeTransferLabShare({
        transfer: doc,
        toothWorks: Array.isArray(doc.toothWorks) ? doc.toothWorks : [],
        actorUserId,
      });
      if (
        releaseResult?.reason === "no_hold" &&
        Number(doc.billing?.heldLabTotal || doc.billing?.heldTotal || 0) > 0 &&
        !doc.billing?.labSettledAt &&
        !doc.billing?.settledAt
      ) {
        return {
          ok: false,
          statusCode: 409,
          message: "에스크로 보류 내역이 없어 기공크레딧을 지급할 수 없습니다.",
        };
      }
    } catch (releaseErr) {
      const status = Number(releaseErr?.statusCode || 500);
      return {
        ok: false,
        statusCode: status >= 400 && status < 600 ? status : 500,
        message:
          releaseErr?.message || "작업완료 기공크레딧 지급에 실패했습니다.",
        payload: releaseErr?.payload || undefined,
      };
    }
  }

  try {
    await chargePracticeTransferLabShipping({
      transfer: doc,
      toothWorks: Array.isArray(doc.toothWorks) ? doc.toothWorks : [],
      actorUserId,
    });
  } catch (shipErr) {
    const status = Number(shipErr?.statusCode || 500);
    return {
      ok: false,
      statusCode: status >= 400 && status < 600 ? status : 500,
      message: shipErr?.message || "기공소 배송비 차감에 실패했습니다.",
      payload: shipErr?.payload || undefined,
    };
  }

  let confirmedAt = null;
  const manufacturerStage = "작업완료";
  if (skipDesignConfirm) {
    confirmedAt = now;
  }

  const relatedAfterEnsure = Array.isArray(doc.production?.relatedRequestIds)
    ? doc.production.relatedRequestIds
    : existingRelated;

  if (
    releaseResult?.released ||
    releaseResult?.reason === "already_released" ||
    releaseResult?.reason === "zero_lab_fee"
  ) {
    const labSettledAt = new Date(now);
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
            abutmentSettledAt: doc.billing?.abutmentSettledAt || labSettledAt,
            settledAt: labSettledAt,
          }
        : {}),
    };
  }

  doc.resultFiles = resultFiles;
  doc.autoMatch = {
    ...(doc.autoMatch && typeof doc.autoMatch === "object" ? doc.autoMatch : {}),
    completedAt: now,
    completedBy: actorUserId || null,
  };
  doc.production = {
    ...(doc.production && typeof doc.production === "object"
      ? doc.production
      : {}),
    skipDesignConfirm,
    confirmedAt,
    confirmedBy: confirmedAt ? doc.practiceUserId || null : null,
    relatedRequestIds: relatedAfterEnsure,
  };
  await doc.save();

  const labAnchorId = String(doc.targetLabAnchorId || "").trim();
  const isAuto = isAutoMatchMode(doc);
  const realtimePayload = {
    action: "completed",
    transferId: String(doc.transferId || "").trim(),
    transferMongoId: String(doc._id || "").trim(),
    targetLabAnchorId: labAnchorId || null,
    matchingMode: isAuto ? "auto" : "direct",
    practiceUserId: String(doc.practiceUserId || "").trim() || null,
    status: String(doc.status || "active").trim(),
    manufacturerStage,
    updatedAt: doc.updatedAt || now,
    resultFileCount: resultFiles.length,
    hasCustomAbutment,
    production: toProductionApiFields(doc.production),
    completionReason: reason,
    ...toAutoMatchApiFields(doc, labAnchorId),
  };

  if (emitRealtime) {
    const emitJobs = [];
    try {
      const labUserIds = await resolveLabReceiverUserIds(labAnchorId);
      for (const userId of labUserIds) {
        emitAppEventToUser(userId, "practice:transfer-updated", realtimePayload);
      }
    } catch {
      // best-effort
    }
    try {
      const practiceIds = new Set(
        await resolvePracticeSenderUserIds(doc.practiceBusinessAnchorId),
      );
      const extra = String(doc.practiceUserId || "").trim();
      if (extra) practiceIds.add(extra);
      for (const userId of practiceIds) {
        emitAppEventToUser(userId, "practice:transfer-updated", realtimePayload);
      }
    } catch {
      // best-effort
    }

    if (!confirmedAt) {
      emitJobs.push(
        postPracticeTransferSystemChatMessage({
          transferMongoId: doc._id,
          senderUserId: actorUserId,
          content:
            reason === "arrival_auto"
              ? "치과도착일이 지나 작업이 자동 완료되었습니다. 결과 파일을 확인한 뒤 「생산 진행」해 주세요."
              : "작업이 완료되었습니다. 결과 파일을 확인한 뒤 「생산 진행」해 주세요.",
          systemEvent: "awaiting_production_confirm",
        }),
      );
    } else if (reason === "arrival_auto") {
      emitJobs.push(
        postPracticeTransferSystemChatMessage({
          transferMongoId: doc._id,
          senderUserId: actorUserId,
          content: "치과도착일이 지나 작업이 자동 완료되었습니다.",
          systemEvent: "arrival_auto_completed",
        }),
      );
    }

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
    if (emitJobs.length) {
      await Promise.all(emitJobs);
    }
  }

  return {
    ok: true,
    alreadyCompleted: false,
    manufacturerStage,
    releaseResult,
    hasCustomAbutment,
    resultFiles,
    realtimePayload,
  };
}

/**
 * 치과도착일이 지난 수락·미완료 건 처리.
 * - CA 어벗 STL 미업로드 → 기한만료
 * - 그 외 → 작업완료
 * 당일·그 전에 도착일을 재지정하면 대상에서 빠져 기한이 연장된다.
 */
export async function autoCompletePracticeTransfersPastArrival({
  now = new Date(),
  limit = 200,
} = {}) {
  const expireResult = await expirePracticeTransfersPastArrivalDeadline({
    now,
    limit,
  });

  const todayYmd = getTodayYmdInKst(now);
  if (!todayYmd) {
    return {
      scanned: expireResult.scanned,
      completed: 0,
      failed: expireResult.failed,
      expired: expireResult.expired,
      todayYmd: null,
    };
  }

  const candidates = await PracticeTransfer.find({
    ...practiceTransferNotDeletedMongoFilter(),
    requestorDownloadedAt: { $ne: null },
    arrivalDeadlineExpiredAt: null,
    $and: [
      {
        $or: [
          { "autoMatch.completedAt": null },
          { "autoMatch.completedAt": { $exists: false } },
        ],
      },
      {
        $or: [
          {
            $expr: {
              $and: [
                {
                  $gt: [{ $size: { $ifNull: ["$arrivalDates", []] } }, 0],
                },
                {
                  $lt: [
                    { $arrayElemAt: ["$arrivalDates", -1] },
                    todayYmd,
                  ],
                },
              ],
            },
          },
          // 레거시: arrivalDates 비어 있고 메모에만 도착일
          {
            $and: [
              {
                $or: [
                  { arrivalDates: { $exists: false } },
                  { arrivalDates: { $size: 0 } },
                  { arrivalDates: null },
                ],
              },
              {
                transferMemo: {
                  $regex: /\[\s*(?:치과도착일|도착일)\s*:\s*\d{4}-\d{2}-\d{2}\s*\]/i,
                },
              },
            ],
          },
        ],
      },
    ],
  })
    .sort({ updatedAt: 1 })
    .limit(Math.max(1, Number(limit) || 200));

  let scanned = 0;
  let completed = 0;
  let failed = 0;

  for (const doc of candidates) {
    scanned += 1;
    if (!isPracticeTransferDueForArrivalAutoComplete(doc, todayYmd)) {
      continue;
    }
    try {
      const result = await completePracticeTransferWork({
        doc,
        actorUserId: null,
        resultFiles: null,
        reason: "arrival_auto",
        now,
        emitRealtime: true,
      });
      if (result.ok && !result.alreadyCompleted) completed += 1;
      else if (!result.ok) failed += 1;
    } catch (err) {
      failed += 1;
      console.error(
        "[practiceTransferArrivalAutoComplete] complete failed",
        String(doc?._id || ""),
        err?.message || err,
      );
    }
  }

  return {
    scanned: scanned + expireResult.scanned,
    completed,
    failed: failed + expireResult.failed,
    expired: expireResult.expired,
    todayYmd,
  };
}
