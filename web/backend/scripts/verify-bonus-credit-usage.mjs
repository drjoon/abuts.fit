#!/usr/bin/env node
/**
 * 무료 크레딧 사용액 검증 스크립트
 *
 * 특정 사업자의 무료 크레딧 사용액을 DB에서 직접 집계하여 검증합니다.
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

async function verifyBonusCreditUsage() {
  const CreditLedger = (await import("../models/creditLedger.model.js"))
    .default;
  const BusinessAnchor = (await import("../models/businessAnchor.model.js"))
    .default;

  const anchor = await BusinessAnchor.findOne({
    name: TARGET_BUSINESS_NAME,
  }).lean();
  if (!anchor) {
    console.error(`❌ 사업자를 찾을 수 없습니다: ${TARGET_BUSINESS_NAME}`);
    return;
  }
  console.log(`📌 사업자: ${anchor.name} (${anchor._id})\n`);

  // 1. 전체 ledger 내역 조회 (시간순)
  const allRows = await CreditLedger.find({
    businessAnchorId: anchor._id,
  })
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  console.log(`📊 총 ledger 내역: ${allRows.length}건\n`);

  // 2. 잔액 계산 로직으로 직접 집계 (getBusinessCreditBalance와 동일한 로직)
  let paid = 0;
  let bonusRequest = 0;
  let bonusShipping = 0;

  // 충전/환불 집계
  for (const row of allRows) {
    const type = String(row?.type || "");
    const amount = Number(row?.amount || 0);
    const refType = String(row?.refType || "");

    if (type === "CHARGE") {
      paid += Math.abs(amount);
    } else if (type === "BONUS") {
      if (refType === "FREE_SHIPPING_CREDIT") {
        bonusShipping += Math.abs(amount);
      } else {
        bonusRequest += Math.abs(amount);
      }
    } else if (type === "REFUND") {
      paid += Math.abs(amount);
    } else if (type === "ADJUST") {
      paid += amount;
    }
  }

  const initialPaid = paid;
  const initialBonusRequest = bonusRequest;
  const initialBonusShipping = bonusShipping;

  // 소비 집계 (무료 크레딧 우선 사용)
  let totalSpentFromPaid = 0;
  let totalSpentFromBonusRequest = 0;
  let totalSpentFromBonusShipping = 0;

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
        totalSpentFromBonusShipping += fromBonusShipping;
        spend -= fromBonusShipping;
      }
      paid -= spend;
      totalSpentFromPaid += spend;
    } else {
      const fromBonusRequest = Math.min(bonusRequest, spend);
      bonusRequest -= fromBonusRequest;
      totalSpentFromBonusRequest += fromBonusRequest;
      spend -= fromBonusRequest;
      paid -= spend;
      totalSpentFromPaid += spend;
    }
  }

  const totalBonusSpent =
    totalSpentFromBonusRequest + totalSpentFromBonusShipping;
  const totalPaidSpent = totalSpentFromPaid;

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("💰 충전 내역 (초기 잔액)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`유료 크레딧 충전: ${initialPaid.toLocaleString()}원`);
  console.log(
    `무료 의뢰 크레딧 충전: ${initialBonusRequest.toLocaleString()}원`,
  );
  console.log(
    `무료 배송비 크레딧 충전: ${initialBonusShipping.toLocaleString()}원`,
  );
  console.log(
    `총 무료 크레딧 충전: ${(initialBonusRequest + initialBonusShipping).toLocaleString()}원`,
  );
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("💸 사용 내역 (잔액 계산 기반)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`유료 크레딧 사용: ${totalPaidSpent.toLocaleString()}원`);
  console.log(
    `무료 의뢰 크레딧 사용: ${totalSpentFromBonusRequest.toLocaleString()}원`,
  );
  console.log(
    `무료 배송비 크레딧 사용: ${totalSpentFromBonusShipping.toLocaleString()}원`,
  );
  console.log(`총 무료 크레딧 사용: ${totalBonusSpent.toLocaleString()}원`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("� 현재 잔액");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(
    `유료 크레딧 잔액: ${Math.max(0, Math.round(paid)).toLocaleString()}원`,
  );
  console.log(
    `무료 의뢰 크레딧 잔액: ${Math.max(0, Math.round(bonusRequest)).toLocaleString()}원`,
  );
  console.log(
    `무료 배송비 크레딧 잔액: ${Math.max(0, Math.round(bonusShipping)).toLocaleString()}원`,
  );
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // 84만원 검증
  const expectedBonus = 840000;
  const diff = totalBonusSpent - expectedBonus;

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ 84만원 검증 결과");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`기대값: ${expectedBonus.toLocaleString()}원`);
  console.log(`실제값: ${totalBonusSpent.toLocaleString()}원`);
  console.log(`차이: ${diff >= 0 ? "+" : ""}${diff.toLocaleString()}원`);
  if (Math.abs(diff) < 1000) {
    console.log("✅ 84만원과 일치 (오차 1,000원 미만)");
  } else {
    console.log(`⚠️ 84만원과 ${Math.abs(diff).toLocaleString()}원 차이 발생`);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

async function main() {
  await connectDb();
  try {
    await verifyBonusCreditUsage();
  } finally {
    await mongoose.disconnect();
    console.log("\nDB 연결 종료");
  }
}

main().catch((e) => {
  console.error("에러:", e);
  process.exit(1);
});
