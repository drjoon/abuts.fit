// related files:
// - web/backend/services/practiceTransferBilling.service.js (releasePracticeTransferLabShare)
// - web/backend/services/practiceTransferComplete.service.js
// - 2026-09-28: 운영자 수동 완료·정산. STL·보철 업로드 게이트를 건너뛰고 billing.manualSettlement에 사유를 남긴다.
//
// MODE=legacy_manual_abutment
//   초창기 기공소가 「기공의뢰-어벗츠에」로 어벗 STL을 따로 올려 PTX 자동 플로우 밖에서 끝난 건.
//   기공비 보류를 기공소에 정산하고 작업완료로 둔다. 연결 Request 디자인비는 지급하지 않는다.
// MODE=zero_hold
//   보류 0원인데 settledAt이 비어 결제 보류로 남은 완료 건. 금액 이동 없이 정산 완료만 찍는다.
// MODE=cancel_linked_abutment
//   legacy_manual_abutment로 정산한 건에 남은 준비 단계 자동 CA Request를 작업취소 SSOT
//   (clearRelatedAbutmentProductionOnRelease)로 취소한다. 보류 해제·디자인비 회수 포함.
//
// Usage (기본 dry-run):
//   cd web/backend && \
//   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//   MODE=legacy_manual_abutment TRANSFER_IDS=PTX-...,PTX-... \
//   node scripts/db/settle-ptx-manual-legacy.js
//   APPLY=true 로 실제 반영.

import { connectDb, disconnectDb } from "./_mongo.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import Request from "../../models/request.model.js";
import { releasePracticeTransferLabShare } from "../../services/practiceTransferBilling.service.js";
import { clearRelatedAbutmentProductionOnRelease } from "../../services/practiceTransferProduction.service.js";

const MODES = {
  legacy_manual_abutment: {
    note:
      "초창기 기공소가 「기공의뢰-어벗츠에」로 어벗 STL을 수동 업로드해 기공의뢰 자동 플로우 밖에서 STL·보철이 완료됨. STL 재업로드 없이 운영자가 수동 완료·정산.",
  },
  zero_hold: {
    note: "보류 0원 완료 건. HOLD 저널이 없어 settledAt이 비어 있던 것을 정산 완료로 정리.",
  },
  cancel_linked_abutment: {
    note: "실제 생산은 수동 「기공의뢰-어벗츠에」 의뢰로 끝나 준비 단계 자동 CA 의뢰를 취소.",
  },
};

async function cancelLinkedAbutmentRequests(doc, { apply }) {
  const tag = `[manual-settle] ${doc.transferId}`;
  if (doc.billing?.manualSettlement?.reason !== "legacy_manual_abutment") {
    console.log(`${tag} skip: not a legacy_manual_abutment settlement`);
    return;
  }
  const ids = (doc.production?.relatedRequestIds || []).map(String);
  const linked = await Request.find({
    $or: [
      { _id: { $in: ids } },
      { "partnerBilling.relatedPracticeTransferId": doc._id },
    ],
    manufacturerStage: { $ne: "취소" },
  })
    .select({ requestId: 1, manufacturerStage: 1 })
    .lean();
  const summary = linked.map((r) => `${r.requestId}/${r.manufacturerStage}`);
  console.log(`${tag} linked active=${JSON.stringify(summary)}`);
  if (!apply || linked.length === 0) return;
  const result = await clearRelatedAbutmentProductionOnRelease(doc);
  if (result.blockedPastReady) {
    console.warn(`${tag} skip: linked request past 준비`);
    return;
  }
  await PracticeTransfer.updateOne(
    { _id: doc._id },
    {
      $set: {
        "billing.manualSettlement.canceledLinkedRequests": linked.map((r) =>
          String(r.requestId || ""),
        ),
        "billing.manualSettlement.canceledLinkedAt": new Date(),
        "billing.manualSettlement.canceledLinkedNote": MODES.cancel_linked_abutment.note,
      },
    },
  );
  console.log(`${tag} canceled=${result.canceledRequestCount}`);
}

const SETTLED_REASONS = new Set([
  "already_released",
  "zero_lab_fee",
  "legacy_already_settled",
]);

function patientOf(doc) {
  const memo = String(doc?.transferMemo || "");
  return (
    memo.match(/\[\s*환자명\s*:\s*([^\]]*)\]/)?.[1]?.trim() ||
    (Array.isArray(doc?.files) ? doc.files : [])
      .map((f) => String(f?.patientName || "").trim())
      .find(Boolean) ||
    ""
  );
}

async function findManualAbutmentRequests(doc) {
  const patientName = patientOf(doc);
  const labId = doc.assigneeLabAnchorId || doc.targetLabAnchorId;
  if (!patientName || !labId) return [];
  const since = new Date(new Date(doc.createdAt).getTime() - 24 * 3600 * 1000);
  const rows = await Request.find({
    businessAnchorId: labId,
    "caseInfos.patientName": patientName,
    createdAt: { $gte: since },
    manufacturerStage: { $ne: "취소" },
    $or: [
      { "partnerBilling.relatedPracticeTransferId": null },
      { "partnerBilling.relatedPracticeTransferId": { $exists: false } },
    ],
  })
    .select({ requestId: 1, manufacturerStage: 1 })
    .lean();
  return rows.map((r) => ({
    requestId: String(r.requestId || ""),
    manufacturerStage: String(r.manufacturerStage || ""),
  }));
}

async function main() {
  const mode = String(process.env.MODE || "").trim();
  const spec = MODES[mode];
  if (!spec) throw new Error(`MODE must be one of ${Object.keys(MODES).join(", ")}`);
  const ids = String(process.env.TRANSFER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!ids.length) throw new Error("TRANSFER_IDS is required");
  const apply = String(process.env.APPLY || "").trim() === "true";

  await connectDb();
  const docs = await PracticeTransfer.find({ transferId: { $in: ids } });
  const missing = ids.filter((id) => !docs.some((d) => d.transferId === id));
  if (missing.length) console.warn("[manual-settle] not found", missing);

  const labsTouched = new Set();
  for (const doc of docs) {
    if (mode === "cancel_linked_abutment") {
      await cancelLinkedAbutmentRequests(doc, { apply });
      continue;
    }
    const tag = `[manual-settle] ${doc.transferId}`;
    const b = doc.billing || {};
    if (b.settledAt) {
      console.log(`${tag} skip: already settled`);
      continue;
    }
    if (!b.heldAt || !doc.requestorDownloadedAt) {
      console.log(`${tag} skip: not held or not started`);
      continue;
    }
    if (doc.workCanceledAt || doc.status !== "active") {
      console.log(`${tag} skip: canceled/deleted`);
      continue;
    }
    if (Math.round(Number(b.heldAbutmentTotal || 0)) > 0 && !b.abutmentSettledAt) {
      console.log(`${tag} skip: abutment share still held`);
      continue;
    }
    const heldLab = Math.round(Number(b.heldLabTotal || 0));
    if (mode === "zero_hold" && heldLab > 0) {
      console.log(`${tag} skip: heldLab=${heldLab} (not zero)`);
      continue;
    }
    const evidence =
      mode === "legacy_manual_abutment" ? await findManualAbutmentRequests(doc) : [];
    console.log(
      `${tag} heldLab=${heldLab} labSettled=${Boolean(b.labSettledAt)} evidence=${JSON.stringify(evidence)}`,
    );
    if (!apply) continue;

    let releaseResult = { released: false, reason: "already_settled" };
    if (!b.labSettledAt) {
      releaseResult = await releasePracticeTransferLabShare({
        transfer: doc,
        toothWorks: Array.isArray(doc.toothWorks) ? doc.toothWorks : [],
        actorUserId: null,
        skipSettlementGate: true,
      });
      if (!releaseResult?.released && !SETTLED_REASONS.has(releaseResult?.reason)) {
        console.warn(`${tag} release failed: ${releaseResult?.reason}`);
        continue;
      }
    }

    const now = new Date();
    const $set = {
      "billing.abutmentSettledAt": b.abutmentSettledAt || now,
      "billing.settledAt": now,
      "billing.manualSettlement": {
        at: now,
        reason: mode,
        note: spec.note,
        ...(evidence.length ? { manualRequests: evidence } : {}),
      },
    };
    if (!b.labSettledAt) {
      $set["billing.labSettledAt"] = now;
      if (releaseResult?.fees) {
        $set["billing.labFeeTotal"] =
          releaseResult.fees.labFeeTotal ?? releaseResult.labFeeTotal ?? b.labFeeTotal;
        $set["billing.total"] = releaseResult.fees.total ?? b.total;
      }
      if (releaseResult?.released) {
        $set["billing.labSettlementAmount"] = releaseResult.labSettlementAmount;
        $set["billing.abutsRevenueAmount"] = releaseResult.abutsRevenueAmount;
      }
    }
    if (!doc.autoMatch?.completedAt) {
      $set["autoMatch.completedAt"] = now;
      $set["autoMatch.completedBy"] = null;
      $set["production.confirmedAt"] = now;
    }
    await PracticeTransfer.updateOne({ _id: doc._id }, { $set });
    console.log(
      `${tag} settled release=${releaseResult?.released ? "released" : releaseResult?.reason} net=${releaseResult?.labSettlementAmount ?? 0}`,
    );
    if (releaseResult?.released) {
      const labId = String(doc.assigneeLabAnchorId || doc.targetLabAnchorId || "");
      if (labId) labsTouched.add(labId);
    }
  }

  console.log(`[manual-settle] done apply=${apply} labs=${labsTouched.size}`);
  await disconnectDb();
}

main().catch(async (err) => {
  console.error("[manual-settle] FAILED", err?.message || err);
  try {
    await disconnectDb();
  } catch {
    // ignore
  }
  process.exit(1);
});
