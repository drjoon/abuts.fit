// 디자인 완료 후 5분 유예가 끝나면 제조사 준비로 올린다.
// 유예 중 취소는 확정·수가 경로를 비운다. 기공비는 기공소 경로(lab)로 맞춘 뒤의 취소다.
// related files:
// - web/backend/controllers/ai/customAbutmentDesignChat.controller.js
// - web/backend/jobs/abutmentDesignGraceWorker.js
// - web/backend/services/abutmentDesignRoute.js
import PracticeTransfer from "../models/practiceTransfer.model.js";
import { isAbutmentGraceOpen } from "./abutmentDesignRoute.js";
import { syncPracticeTransferAbutmentFeeRoute } from "./practiceTransferBilling.service.js";
import {
  promotePlatformAbutmentDesignsToManufacturerReady,
  publishPlatformAbutmentDesignFiles,
  scheduleAbutmentStageRealtimeForTransfer,
} from "./practiceTransferProduction.service.js";
import { postPracticeTransferSystemChatMessage } from "./chatSystemMessage.service.js";
import { scheduleRequestReadyBadgeEmit } from "./adminCommBadge.service.js";
import { emitAppEventToRoles } from "../socket.js";

const BATCH_LIMIT = 20;

export function abutmentGraceParty(user, doc) {
  const role = String(user?.role || "").trim();
  if (role === "admin") return true;
  const own = String(user?.businessAnchorId || "").trim();
  const userId = String(user?._id || "").trim();
  const practiceId = String(doc?.practiceBusinessAnchorId || "").trim();
  if (own && own === practiceId) return true;
  if (userId && userId === String(doc?.practiceUserId || "").trim()) return true;
  const labs = [doc?.targetLabAnchorId, doc?.assigneeLabAnchorId]
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  return Boolean(own) && labs.includes(own);
}

function openGraceFilter() {
  return {
    "production.abutmentGracePromoteAt": { $ne: null },
    $or: [
      { "production.labDesignConfirmedAt": null },
      { "production.labDesignConfirmedAt": { $exists: false } },
    ],
  };
}

export function countOpenAbutmentDesignGrace() {
  return PracticeTransfer.countDocuments(openGraceFilter());
}

export async function releaseAbutmentDesignGrace({ transfer, actorUserId = null } = {}) {
  if (!transfer?._id || !isAbutmentGraceOpen(transfer.production)) {
    return { released: false };
  }
  const now = new Date();
  const feeRevision =
    Math.max(0, Math.floor(Number(transfer.production?.abutmentFeeRouteRevision || 0))) + 1;
  const updated = await PracticeTransfer.updateOne(
    {
      _id: transfer._id,
      "production.abutmentGracePromoteAt": { $gt: now },
      $or: [
        { "production.labDesignConfirmedAt": null },
        { "production.labDesignConfirmedAt": { $exists: false } },
      ],
    },
    {
      $set: {
        "production.abutmentFeeRoute": "pending",
        "production.abutmentFeeRouteRevision": feeRevision,
      },
      $unset: {
        "production.abutmentGracePromoteAt": "",
        "production.abutmentCancelDeadlineAt": "",
        "production.practiceDesignConfirmedAt": "",
        "production.practiceDesignConfirmedBy": "",
        "production.customAbutmentPreview.confirmedAt": "",
        "production.customAbutmentPreview.confirmedBy": "",
      },
    },
  );
  if (!updated?.modifiedCount) return { released: false };
  if (!transfer.production || typeof transfer.production !== "object") {
    transfer.production = {};
  }
  transfer.production.abutmentFeeRoute = "pending";
  transfer.production.abutmentFeeRouteRevision = feeRevision;
  transfer.production.abutmentGracePromoteAt = null;
  transfer.production.abutmentCancelDeadlineAt = null;
  transfer.production.practiceDesignConfirmedAt = null;
  void syncPracticeTransferAbutmentFeeRoute({
    transfer,
    actorUserId,
  }).catch((err) => {
    console.warn("[abutment-grace] fee sync failed", err?.message || err);
  });
  scheduleAbutmentStageRealtimeForTransfer(transfer._id);
  return { released: true };
}

async function finishManufacturerEntry({ doc, rows, actorId }) {
  const promoted = Array.isArray(rows) ? rows : [];
  try {
    const { triggerRhinoProcessFileForRequest } = await import(
      "../controllers/rhino/rhino.controller.js"
    );
    for (const row of promoted) {
      const processFileName = String(row.processFileName || row.rhinoName || "").trim();
      if (!processFileName || !row.requestId) continue;
      triggerRhinoProcessFileForRequest({
        requestId: row.requestId,
        filePath: processFileName,
        fileName: processFileName,
      });
    }
  } catch (err) {
    console.warn("[abutment-grace] filled-STL trigger failed", err?.message || err);
  }
  if (promoted.length > 0) {
    try {
      scheduleRequestReadyBadgeEmit();
      emitAppEventToRoles(["manufacturer", "admin"], "worksheet:updated", {
        source: "abutment-design-grace",
        transferId: String(doc.transferId || "").trim(),
      });
    } catch (err) {
      console.warn("[abutment-grace] worksheet emit failed", err?.message || err);
    }
  }
  void postPracticeTransferSystemChatMessage({
    transferMongoId: doc._id,
    senderUserId: actorId,
    content: "커스텀어벗 디자인이 제조사 준비에 들어갔습니다.",
    systemEvent: "custom_abutment_grace_promoted",
  }).catch((err) => console.warn("[abutment-grace] chat failed", err?.message || err));
  scheduleAbutmentStageRealtimeForTransfer(doc._id);
}

export async function promoteDueAbutmentDesignGraceOnce(limit = BATCH_LIMIT) {
  const now = new Date();
  const cap = Math.max(1, Math.min(BATCH_LIMIT, Math.floor(Number(limit) || BATCH_LIMIT)));
  const due = await PracticeTransfer.find({
    "production.abutmentGracePromoteAt": { $lte: now },
    $or: [
      { "production.labDesignConfirmedAt": null },
      { "production.labDesignConfirmedAt": { $exists: false } },
    ],
  }).limit(cap);
  let promoted = 0;
  for (const doc of due) {
    const actorId = doc.production?.practiceDesignConfirmedBy || null;
    const claimed = await PracticeTransfer.updateOne(
      {
        _id: doc._id,
        "production.abutmentGracePromoteAt": { $lte: now },
        $or: [
          { "production.labDesignConfirmedAt": null },
          { "production.labDesignConfirmedAt": { $exists: false } },
        ],
      },
      {
        $set: {
          "production.labDesignConfirmedAt": now,
          ...(actorId ? { "production.labDesignConfirmedBy": actorId } : {}),
        },
        $unset: { "production.abutmentGracePromoteAt": "" },
      },
    );
    if (!claimed?.modifiedCount) continue;
    if (!doc.production || typeof doc.production !== "object") doc.production = {};
    doc.production.labDesignConfirmedAt = now;
    doc.production.abutmentGracePromoteAt = null;
    if (actorId) doc.production.labDesignConfirmedBy = actorId;
    try {
      const rows = await promotePlatformAbutmentDesignsToManufacturerReady({
        transferDoc: doc,
        actorUserId: actorId,
      });
      await publishPlatformAbutmentDesignFiles(doc);
      await finishManufacturerEntry({ doc, rows, actorId });
      promoted += 1;
    } catch (err) {
      console.error(
        "[abutment-grace] promote failed",
        String(doc.transferId || doc._id || ""),
        err?.message || err,
      );
    }
  }
  const pending = await countOpenAbutmentDesignGrace();
  return { promoted, pending };
}
