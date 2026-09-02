// related files:
// - web/backend/services/practiceTransferComplete.service.js
// - web/backend/jobs/practiceTransferArrivalAutoCompleteWorker.js
// change-log:
// - 2026-09-02: 치과도착일 경과 + CA 어벗 STL 미업로드 → 기한만료(자동완료 대신).
// - 2026-09-02: 과금 롤백·자동매칭 재공개 제거. 수락·업로드 유지, arrivalDeadlineExpiredAt만 기록.
import { Types } from "mongoose";
import User from "../models/user.model.js";
import { emitAppEventToUser } from "../socket.js";
import { postPracticeTransferSystemChatMessage } from "./chatSystemMessage.service.js";
import { toAutoMatchApiFields } from "../utils/practiceTransferAutoMatch.js";
import {
  isPracticeTransferDueForArrivalDeadlineExpire,
} from "../utils/practiceTransferArrivalAutoComplete.js";
import { resolvePracticeTransferManufacturerStage } from "../utils/practiceTransferStage.js";
import { getTodayYmdInKst } from "../utils/krBusinessDays.js";
import PracticeTransfer from "../models/practiceTransfer.model.js";
import { practiceTransferNotDeletedMongoFilter } from "../utils/practiceTransferStage.js";

export { isPracticeTransferDueForArrivalDeadlineExpire } from "../utils/practiceTransferArrivalAutoComplete.js";

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
 * 치과도착일 경과 + 어벗 디자인 STL 미업로드 → 기한만료 표시.
 * 수락·과금·업로드 경로는 유지한다(STL 업로드 가능).
 */
export async function expirePracticeTransferArrivalDeadline({
  doc,
  now = new Date(),
  emitRealtime = true,
} = {}) {
  if (!doc) {
    return { ok: false, statusCode: 404, message: "전송 내역을 찾을 수 없습니다." };
  }
  if (doc.arrivalDeadlineExpiredAt) {
    return {
      ok: true,
      alreadyExpired: true,
      manufacturerStage: resolvePracticeTransferManufacturerStage(doc),
    };
  }
  if (!doc.requestorDownloadedAt) {
    return {
      ok: false,
      statusCode: 409,
      message: "의뢰수락된 건만 기한 만료 처리할 수 있습니다.",
    };
  }

  const labAnchorId = String(doc.targetLabAnchorId || "").trim() || null;

  await PracticeTransfer.updateOne(
    { _id: doc._id },
    { $set: { arrivalDeadlineExpiredAt: now } },
  );
  doc.arrivalDeadlineExpiredAt = now;

  const manufacturerStage = resolvePracticeTransferManufacturerStage(doc, {
    viewerLabAnchorId: labAnchorId,
  });

  const realtimePayload = {
    action: "arrival-deadline-expired",
    transferId: String(doc.transferId || "").trim(),
    transferMongoId: String(doc._id || "").trim(),
    targetLabAnchorId: labAnchorId,
    matchingMode: String(doc.matchingMode || "direct").trim() || "direct",
    practiceUserId: String(doc.practiceUserId || "").trim() || null,
    requestorDownloadedAt: doc.requestorDownloadedAt,
    requestorAcceptedAt: doc.requestorDownloadedAt,
    status: String(doc.status || "active").trim(),
    manufacturerStage,
    arrivalDeadlineExpiredAt: now,
    updatedAt: now,
    source: "arrivalDeadlineExpire",
    ...toAutoMatchApiFields(doc, labAnchorId),
  };

  if (emitRealtime) {
    try {
      if (labAnchorId) {
        const labUserIds = await resolveLabReceiverUserIds(labAnchorId);
        for (const userId of labUserIds) {
          emitAppEventToUser(userId, "practice:transfer-updated", realtimePayload);
        }
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

    void postPracticeTransferSystemChatMessage({
      transferMongoId: doc._id,
      senderUserId: null,
      content:
        "치과도착일이 지났으나 어벗 디자인 STL이 업로드되지 않아 기한이 만료되었습니다. 빠른 업로드를 부탁드립니다.",
      systemEvent: "arrival_deadline_expired",
    }).catch((err) => {
      console.warn(
        "[practiceTransferArrivalExpire] chat message failed",
        String(doc?._id || ""),
        err?.message || err,
      );
    });
  }

  return {
    ok: true,
    alreadyExpired: false,
    manufacturerStage,
    realtimePayload,
  };
}

/**
 * 도착일 지난 CA 미업로드 건 기한만료 배치.
 */
export async function expirePracticeTransfersPastArrivalDeadline({
  now = new Date(),
  limit = 200,
} = {}) {
  const todayYmd = getTodayYmdInKst(now);
  if (!todayYmd) {
    return { scanned: 0, expired: 0, failed: 0, todayYmd: null };
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
  let expired = 0;
  let failed = 0;

  for (const doc of candidates) {
    scanned += 1;
    if (!isPracticeTransferDueForArrivalDeadlineExpire(doc, todayYmd)) {
      continue;
    }
    try {
      const result = await expirePracticeTransferArrivalDeadline({
        doc,
        now,
        emitRealtime: true,
      });
      if (result.ok && !result.alreadyExpired) expired += 1;
      else if (!result.ok) failed += 1;
    } catch (err) {
      failed += 1;
      console.error(
        "[practiceTransferArrivalExpire] expire failed",
        String(doc?._id || ""),
        err?.message || err,
      );
    }
  }

  return { scanned, expired, failed, todayYmd };
}
