#!/usr/bin/env node
/**
 * 스크린샷 3 화면값과 DB 집계 차이 분석
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, "../local.env");
dotenv.config({ path: envPath });

const TARGET_BUSINESS_NAME = "우리치과기공소";

async function connectDb() {
  const uri = process.env.MONGODB_URI || process.env.DB_URI;
  if (!uri) {
    console.error("MONGODB_URI 환경변수가 설정되지 않았습니다.");
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log("DB 연결 완료\n");
}

async function analyzeDiscrepancy() {
  const CreditLedger = (await import("../models/creditLedger.model.js")).default;
  const BusinessAnchor = (await import("../models/businessAnchor.model.js")).default;

  const anchor = await BusinessAnchor.findOne({ name: TARGET_BUSINESS_NAME }).lean();
  if (!anchor) {
    console.error(`❌ 사업자를 찾을 수 없습니다: ${TARGET_BUSINESS_NAME}`);
    return;
  }
  console.log(`📌 사업자: ${anchor.name} (${anchor._id})\n`);

  // 스크린샷 3 기준값
  const screenshotValues = {
    bonusRequestSpent: 840000,
    bonusShippingSpent: 45500,
    totalBonusSpent: 885500,
  };

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🖥️ 스크린샷 3 표시값 (기대값)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`무료-의뢰 사용: ${screenshotValues.bonusRequestSpent.toLocaleString()}원`);
  console.log(`무료-배송 사용: ${screenshotValues.bonusShippingSpent.toLocaleString()}원`);
  console.log(`총 무료 사용: ${screenshotValues.totalBonusSpent.toLocaleString()}원`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // 1. 직접 집계 (잔액 계산 방식)
  const allRows = await CreditLedger.find({
    businessAnchorId: anchor._id,
  }).sort({ createdAt: 1, _id: 1 }).lean();

  let bonusRequest = 0;
  let bonusShipping = 0;

  // 충전 집계
  for (const row of allRows) {
    const type = String(row?.type || "");
    const amount = Number(row?.amount || 0);
    const refType = String(row?.refType || "");

    if (type === "BONUS") {
      if (refType === "FREE_SHIPPING_CREDIT") {
        bonusShipping += Math.abs(amount);
      } else {
        bonusRequest += Math.abs(amount);
      }
    }
  }

  const initialBonusRequest = bonusRequest;
  const initialBonusShipping = bonusShipping;

  // 소비 집계 (무료 우선 사용)
  let spentFromBonusRequest = 0;
  let spentFromBonusShipping = 0;

  for (const row of allRows) {
    const type = String(row?.type || "");
    if (type !== "SPEND") continue;

    const amount = Math.abs(Number(row?.amount || 0));
    const refType = String(row?.refType || "");
    const hasFreeRequest = row?.hasFreeRequest !== false;

    let spend = amount;

    if (refType === "SHIPPING_PACKAGE" || refType === "SHIPPING_FEE") {
      if (hasFreeRequest) {
        const fromBonusShipping = Math.min(bonusShipping, spend);
        bonusShipping -= fromBonusShipping;
        spentFromBonusShipping += fromBonusShipping;
        spend -= fromBonusShipping;
      }
      // 남은 spend는 유료에서 차감 (무료 부족 시)
    } else {
      const fromBonusRequest = Math.min(bonusRequest, spend);
      bonusRequest -= fromBonusRequest;
      spentFromBonusRequest += fromBonusRequest;
      spend -= fromBonusRequest;
      // 남은 spend는 유료에서 차감
    }
  }

  const totalSpentFromBonus = spentFromBonusRequest + spentFromBonusShipping;

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 DB 직접 집계값 (잔액 계산 방식)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`충전-의뢰: ${initialBonusRequest.toLocaleString()}원`);
  console.log(`충전-배송: ${initialBonusShipping.toLocaleString()}원`);
  console.log(`사용-의뢰: ${spentFromBonusRequest.toLocaleString()}원`);
  console.log(`사용-배송: ${spentFromBonusShipping.toLocaleString()}원`);
  console.log(`총 사용: ${totalSpentFromBonus.toLocaleString()}원`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // 차이 계산
  const diffRequest = spentFromBonusRequest - screenshotValues.bonusRequestSpent;
  const diffShipping = spentFromBonusShipping - screenshotValues.bonusShippingSpent;
  const diffTotal = totalSpentFromBonus - screenshotValues.totalBonusSpent;

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("⚠️ 차이 분석");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`의뢰 차이: ${diffRequest >= 0 ? "+" : ""}${diffRequest.toLocaleString()}원`);
  console.log(`배송 차이: ${diffShipping >= 0 ? "+" : ""}${diffShipping.toLocaleString()}원`);
  console.log(`총 차이: ${diffTotal >= 0 ? "+" : ""}${diffTotal.toLocaleString()}원`);

  if (Math.abs(diffShipping) === 21000) {
    console.log(`\n✅ 배송 차이 21,000원 = 방금 삭제한 6건 배송비와 일치`);
  }

  if (diffRequest !== 0) {
    console.log(`\n❓ 의뢰 차이 ${Math.abs(diffRequest).toLocaleString()}원 원인 분석 필요`);

    // 의뢰 소비 내역 상세 확인
    const requestSpends = allRows.filter(r =>
      r.type === "SPEND" &&
      r.refType !== "SHIPPING_PACKAGE" &&
      r.refType !== "SHIPPING_FEE"
    );

    console.log(`\n📋 의뢰 소비 내역 (${requestSpends.length}건):`);
    let totalRequestAmount = 0;
    for (const row of requestSpends) {
      const amount = Math.abs(row.amount || 0);
      totalRequestAmount += amount;
      const bonusAmount = row.spentBonusAmount || 0;
      const paidAmount = row.spentPaidAmount || 0;
      console.log(`  - ${row._id}: ${amount.toLocaleString()}원 | spentBonus: ${bonusAmount.toLocaleString()} | spentPaid: ${paidAmount.toLocaleString()} | uniqueKey: ${row.uniqueKey}`);
    }
    console.log(`  총액: ${totalRequestAmount.toLocaleString()}원`);
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // 2. Aggregation 집계 (현재 adminCredit 사용 방식)
  const aggResult = await CreditLedger.aggregate([
    { $match: { businessAnchorId: anchor._id, type: "SPEND" } },
    {
      $group: {
        _id: null,
        totalSpent: { $sum: { $abs: "$amount" } },
        totalBonusSpent: { $sum: { $ifNull: ["$spentBonusAmount", 0] } },
        requestBonusSpent: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $eq: [{ $ifNull: ["$refType", "REQUEST"] }, "REQUEST"] },
                  { $eq: ["$refType", null] },
                  { $eq: ["$refType", ""] },
                ],
              },
              { $ifNull: ["$spentBonusAmount", 0] },
              0,
            ],
          },
        },
        shippingBonusSpent: {
          $sum: {
            $cond: [
              { $in: ["$refType", ["SHIPPING_PACKAGE", "SHIPPING_FEE"]] },
              { $ifNull: ["$spentBonusAmount", 0] },
              0,
            ],
          },
        },
      },
    },
  ]);

  if (aggResult.length > 0) {
    const agg = aggResult[0];
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔍 Aggregation 집계값 (현재 adminCredit 방식)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`의뢰 사용: ${agg.requestBonusSpent.toLocaleString()}원`);
    console.log(`배송 사용: ${agg.shippingBonusSpent.toLocaleString()}원`);
    console.log(`총 사용: ${agg.totalBonusSpent.toLocaleString()}원`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    if (agg.totalBonusSpent === 0) {
      console.log("⚠️ Aggregation 결과가 0입니다!");
      console.log("   → spentBonusAmount 필드가 없는 레거시 데이터 때문");
      console.log("   → 집계 로직이 잔액 기반으로 동작해야 함\n");
    }
  }
}

async function main() {
  await connectDb();
  try {
    await analyzeDiscrepancy();
  } finally {
    await mongoose.disconnect();
    console.log("DB 연결 종료");
  }
}

main().catch((e) => {
  console.error("에러:", e);
  process.exit(1);
});
