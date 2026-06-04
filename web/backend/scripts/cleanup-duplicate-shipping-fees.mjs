#!/usr/bin/env node
/**
 * 2026-06-04 중복 배송비 결제 정리 스크립트
 *
 * 6월 4일 오후 6:35경 발생한 중복 배송비 소비 내역을 조회하고 삭제합니다.
 *
 * 사용법:
 *   ENV_FILE=local.env node web/backend/scripts/cleanup-duplicate-shipping-fees.mjs --dry-run
 *   ENV_FILE=local.env node web/backend/scripts/cleanup-duplicate-shipping-fees.mjs --execute
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// local.env 로드 (MONGODB_URI_TEST 사용)
const envPath = path.resolve(__dirname, "../local.env");
dotenv.config({ path: envPath });

const TARGET_DATE = "2026-06-04";
const TARGET_HOUR_START = 18; // 18:00
const TARGET_HOUR_END = 19; // 19:00 (19:00 미만)
const TARGET_BUSINESS_NAME = "우리치과기공소";

async function connectDb() {
  const uri = process.env.MONGODB_URI || process.env.DB_URI;
  if (!uri) {
    console.error("MONGODB_URI 환경변수가 설정되지 않았습니다.");
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log("DB 연결 완료");
}

function getTargetTimeRange() {
  // KST 기준 2026-06-04 18:00 ~ 19:00
  const start = new Date(`${TARGET_DATE}T18:00:00+09:00`);
  const end = new Date(`${TARGET_DATE}T19:00:00+09:00`);
  return { start, end };
}

async function findDuplicateShippingFees(dryRun = true) {
  const { start, end } = getTargetTimeRange();

  console.log(`\n📅 조회 기간: ${start.toISOString()} ~ ${end.toISOString()}`);
  console.log(`🏢 대상 사업자: ${TARGET_BUSINESS_NAME}`);

  // CreditLedger 모델 동적 로드
  const CreditLedger = (await import("../models/creditLedger.model.js"))
    .default;
  const BusinessAnchor = (await import("../models/businessAnchor.model.js"))
    .default;
  const ShippingPackage = (await import("../models/shippingPackage.model.js"))
    .default;

  // 대상 BusinessAnchor 조회
  const anchor = await BusinessAnchor.findOne({
    name: TARGET_BUSINESS_NAME,
  }).lean();
  if (!anchor) {
    console.error(`❌ 사업자를 찾을 수 없습니다: ${TARGET_BUSINESS_NAME}`);
    return [];
  }
  console.log(`✅ 사업자 확인: ${anchor._id} (${anchor.name})`);

  // 해당 시간대의 SHIPPING_PACKAGE SPEND 내역 조회
  const spends = await CreditLedger.find({
    businessAnchorId: anchor._id,
    type: "SPEND",
    refType: "SHIPPING_PACKAGE",
    createdAt: { $gte: start, $lt: end },
  })
    .sort({ createdAt: 1 })
    .lean();

  console.log(`\n🔍 총 ${spends.length}건의 배송비 소비 내역 발견`);

  if (spends.length === 0) {
    console.log("삭제할 내역이 없습니다.");
    return [];
  }

  // 패키지별로 그룹화하여 중복 확인
  const byPackage = new Map();
  for (const spend of spends) {
    const pkgId = String(spend.refId || "");
    if (!pkgId) continue;

    if (!byPackage.has(pkgId)) {
      byPackage.set(pkgId, []);
    }
    byPackage.get(pkgId).push(spend);
  }

  console.log(`\n📦 패키지별 내역:`);
  const toDelete = [];

  for (const [pkgId, items] of byPackage) {
    const pkg = await ShippingPackage.findById(pkgId).lean();
    console.log(`\n  Package ${pkgId}:`);
    console.log(
      `    - 우편함: ${pkg?.mailboxAddress || "N/A"}, 발송일: ${pkg?.shipDateYmd || "N/A"}`,
    );
    console.log(`    - 해당 내역: ${items.length}건`);

    // 동일 패키지에 여러 소비 내역이 있으면 중복
    if (items.length > 1) {
      console.log(`    ⚠️ 중복 발견! ${items.length - 1}건 삭제 대상`);
      // 첫 번째를 제외한 나머지는 삭제 대상
      const duplicates = items.slice(1);
      toDelete.push(...duplicates);
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const marker = i === 0 ? "✅ 보존" : "❌ 삭제예정";
      console.log(
        `      [${i + 1}] ${marker} ${item._id} | ${item.amount}원 | ${item.uniqueKey} | ${item.createdAt.toISOString()}`,
      );
    }
  }

  console.log(`\n🗑️ 삭제 예정 총 ${toDelete.length}건`);

  if (toDelete.length > 0) {
    console.log(`\n삭제 대상 상세:`);
    let totalRefund = 0;
    for (const item of toDelete) {
      const amount = Math.abs(item.amount || 0);
      totalRefund += amount;
      console.log(
        `  - ${item._id}: ${amount.toLocaleString()}원 (uniqueKey: ${item.uniqueKey})`,
      );
    }
    console.log(`\n💰 총 환불 예정 금액: ${totalRefund.toLocaleString()}원`);
  }

  return toDelete;
}

async function executeDelete(toDelete) {
  const CreditLedger = (await import("../models/creditLedger.model.js"))
    .default;

  console.log(`\n🚨 실제 삭제 실행...`);
  const ids = toDelete.map((d) => d._id);

  const result = await CreditLedger.deleteMany({
    _id: { $in: ids },
  });

  console.log(`✅ 삭제 완료: ${result.deletedCount}건`);

  // 실시간 이벤트 발송 (선택적)
  try {
    const { emitCreditBalanceUpdatedToBusiness } =
      await import("../utils/creditRealtime.js");
    if (toDelete.length > 0 && toDelete[0]?.businessAnchorId) {
      const totalRefund = toDelete.reduce(
        (sum, d) => sum + Math.abs(d.amount || 0),
        0,
      );
      await emitCreditBalanceUpdatedToBusiness({
        businessAnchorId: toDelete[0].businessAnchorId,
        balanceDelta: totalRefund,
        reason: "duplicate_shipping_fee_cleanup",
        refId: null,
      });
      console.log("📡 실시간 잔액 업데이트 이벤트 발송 완료");
    }
  } catch (e) {
    console.log("⚠️ 실시간 이벤트 발송 실패 (무시):", e.message);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--execute");

  console.log(
    dryRun
      ? "🔍 DRY RUN 모드 (삭제하지 않고 미리보기만)"
      : "🚨 EXECUTE 모드 (실제 삭제 실행)",
  );
  console.log(
    `대상: ${TARGET_BUSINESS_NAME}의 ${TARGET_DATE} ${TARGET_HOUR_START}:00~${TARGET_HOUR_END}:00 배송비 소비`,
  );

  await connectDb();

  try {
    const toDelete = await findDuplicateShippingFees(dryRun);

    if (!dryRun && toDelete.length > 0) {
      await executeDelete(toDelete);
    }

    console.log("\n✨ 완료");
  } finally {
    await mongoose.disconnect();
    console.log("DB 연결 종료");
  }
}

main().catch((e) => {
  console.error("에러:", e);
  process.exit(1);
});
