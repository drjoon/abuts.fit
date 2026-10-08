#!/usr/bin/env node
// related files:
// - web/backend/services/deliveryMonthlyCost.service.js
// - web/backend/utils/creditLock.util.js
// - web/backend/controllers/admin/admin.priceApproval.controller.js
// 2026-10-08: 딜러/영업팀 가격 정책 검증(테스트 DB). 임시로 바꾼 anchor는 finally에서 원복.
// 실행: ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true node scripts/db/verify-dealer-policy.js
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { checkCreditLock } from "../../utils/creditLock.util.js";
import { processDeliveryMonthlyCosts, isDeliveryMonthlyCostBillable } from "../../services/deliveryMonthlyCost.service.js";
import { resolveSelectableShippingMode } from "../../controllers/requests/expressSelectable.utils.js";

await connectDb();
console.log("dbName:", mongoose.connection.name);
if (mongoose.connection.name !== "abuts_fit_test") {
  console.error("테스트 DB가 아닙니다. 중단.");
  process.exit(1);
}
let touchedId = null;
try {
  console.log("billable 0/1/2/3:", [0, 1, 2, 3].map(isDeliveryMonthlyCostBillable));
  console.log("mode(normal→):", await resolveSelectableShippingMode({ shippingMode: "normal" }));
  console.log("dryRun:", await processDeliveryMonthlyCosts({ dryRun: true }));

  const anchor = await BusinessAnchor.findOne({ businessType: "requestor" }).select("_id").lean();
  if (!anchor) {
    console.log("requestor anchor 없음 — 승인 게이트 검증 생략");
  } else {
    touchedId = anchor._id;
    console.log("before:", await checkCreditLock(touchedId));
    await BusinessAnchor.updateOne(
      { _id: touchedId },
      { $set: { dealerPriceApproval: { status: "pending", requestedPrice: 13000, requestedAt: new Date() } } },
    );
    console.log("pending:", await checkCreditLock(touchedId));
  }
} finally {
  if (touchedId) {
    await BusinessAnchor.updateOne({ _id: touchedId }, { $unset: { dealerPriceApproval: 1 } });
    console.log("after restore:", await checkCreditLock(touchedId));
  }
  await disconnectDb();
}
