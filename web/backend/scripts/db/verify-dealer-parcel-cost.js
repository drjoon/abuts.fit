#!/usr/bin/env node
// related files:
// - web/backend/controllers/requests/common.review.helpers.js
// 2026-10-13: 딜러 택배비 차감 저널 검증(테스트 DB). 만든 저널은 마지막에 지운다.
// 실행: ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true node scripts/db/verify-dealer-parcel-cost.js
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import Request from "../../models/request.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import { postDealerParcelShippingDeduction } from "../../controllers/requests/common.review.helpers.js";
import { deleteGeneralLedgerCommitJournal } from "../../services/generalLedger.service.js";

await connectDb();
console.log("dbName:", mongoose.connection.name);
if (mongoose.connection.name !== "abuts_fit_test") process.exit(1);
let journalId = null;
try {
  const dealers = await BusinessAnchor.find({ businessType: "salesman" }).select({ _id: 1 }).lean();
  const customer = await BusinessAnchor.findOne({
    businessType: "requestor",
    referredByAnchorId: { $in: dealers.map((d) => d._id) },
  }).select({ _id: 1, name: 1, referredByAnchorId: 1 }).lean();
  if (!customer) { console.log("딜러 소개 거래처 없음 — 검증 생략"); process.exit(0); }
  const base = await Request.findOne({ businessAnchorId: customer._id }).lean();
  const fake = base
    ? { ...base, createdAt: new Date(), shippingMode: "normal", finalShipping: { mode: "normal" }, partnerBilling: undefined, caseInfos: { ...(base.caseInfos || {}) } }
    : null;
  console.log("customer:", customer.name, "hasRequest:", Boolean(base));
  if (!fake) { console.log("거래처 의뢰 없음 — 검증 생략"); process.exit(0); }
  const pkg = { _id: new mongoose.Types.ObjectId() };
  const run = (req) => postDealerParcelShippingDeduction({ pkg, requests: [req], payerAnchorId: customer._id });

  console.log("express:", await run({ ...fake, shippingMode: "express", finalShipping: { mode: "express" } }));
  console.log("old(created<10/13):", await run({ ...fake, createdAt: new Date("2026-10-01T00:00:00+09:00") }));
  const res = await run(fake);
  console.log("normal:", { posted: res?.posted, journalId: res?.journalId, reason: res?.reason });
  journalId = res?.journalId || res?.journal?.journalId || null;
  const dup = await run(fake);
  console.log("dup:", { posted: dup?.posted, reason: dup?.reason });
  if (journalId) {
    const lines = await LedgerLine.find({ journalId }).select({ accountCode: 1, amount: 1, amountExcludingVat: 1, vatAmount: 1, ownerRole: 1 }).lean();
    console.log("lines:", lines);
  }
} finally {
  if (journalId) {
    console.log("cleanup:", await deleteGeneralLedgerCommitJournal({ journalId, expectedEventTypes: ["DEALER_PARCEL_SHIPPING_COST"] }));
  }
  await disconnectDb();
}
