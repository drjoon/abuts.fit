#!/usr/bin/env node
// related files:
// - web/backend/controllers/requests/common.review.helpers.js
// 2026-10-13: 포장.발송 진입(enterManufacturerShippingStage) 실제 경로로 딜러 택배비 차감 검증(테스트 DB). 만든 박스·저널은 지우고 의뢰 shippingPackageId는 원복한다.
// 실행: ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true node scripts/db/verify-dealer-parcel-cost-path.js
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import Request from "../../models/request.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import { enterManufacturerShippingStage, commitShippingFeeForPackage } from "../../controllers/requests/common.review.helpers.js";
import { deleteGeneralLedgerCommitJournal } from "../../services/generalLedger.service.js";

await connectDb();
console.log("dbName:", mongoose.connection.name);
if (mongoose.connection.name !== "abuts_fit_test") process.exit(1);
let request = null;
let before = null;
let pkgId = null;
try {
  const dealers = await BusinessAnchor.find({ businessType: "salesman" }).select({ _id: 1 }).lean();
  const customers = await BusinessAnchor.find({
    businessType: "requestor",
    referredByAnchorId: { $in: dealers.map((d) => d._id) },
  }).select({ _id: 1, name: 1 }).lean();
  request = await Request.findOne({
    businessAnchorId: { $in: customers.map((c) => c._id) },
    mailboxAddress: { $nin: [null, ""] },
  }).sort({ createdAt: -1 });
  if (!request) { console.log("대상 의뢰 없음(우편함 있는 딜러 거래처 의뢰)"); process.exit(0); }
  before = { shippingPackageId: request.shippingPackageId || null };
  console.log("request:", request.requestId, "stage:", request.manufacturerStage, "mode:", request.shippingMode);
  request.createdAt = new Date(); // 메모리에서만(저장 안 함) — 2026-10-13 이후 유료 의뢰로 취급
  request.shippingMode = "normal";
  request.finalShipping = { ...(request.finalShipping?.toObject?.() || {}), mode: "normal" };
  const out = await enterManufacturerShippingStage({
    request,
    requestorOrgId: String(request.businessAnchorId),
    source: "verify-script",
    throwOnInsufficient: false,
  });
  console.log("enter:", out);
  pkgId = request.shippingPackageId || null;
  await new Promise((r) => setTimeout(r, 1500)); // 후행(fire-and-forget) 대기
  const j = pkgId
    ? await LedgerJournal.findOne({ idempotencyKey: `gl:shippingPackage:${pkgId}:dealer_parcel_cost` }).lean()
    : null;
  console.log("journal:", j ? { eventType: j.eventType, journalId: j.journalId } : null);
  if (j) {
    console.log("lines:", (await LedgerLine.find({ journalId: j.journalId }).select({ accountCode: 1, amount: 1 }).lean()).map((l) => `${l.accountCode}:${l.amount}`));
    console.log("cleanup journal:", await deleteGeneralLedgerCommitJournal({ journalId: j.journalId, expectedEventTypes: ["DEALER_PARCEL_SHIPPING_COST"] }));
  }
} finally {
  if (request) {
    await Request.updateOne({ _id: request._id }, { $set: { shippingPackageId: before?.shippingPackageId ?? null } });
  }
  if (pkgId && String(pkgId) !== String(before?.shippingPackageId || "")) {
    console.log("cleanup package:", (await ShippingPackage.deleteOne({ _id: pkgId })).deletedCount);
  }
  await disconnectDb();
}
