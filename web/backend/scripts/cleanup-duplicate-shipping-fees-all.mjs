#!/usr/bin/env node
/**
 * 2026-06-04 중복 배송비 결제 정리 스크립트 (전체 사업자 대상)
 * 
 * 6월 4일 오후 6:35경 발생한 중복 배송비 소비 내역을 모든 사업자에 대해 조회하고 삭제합니다.
 * 
 * 사용법:
 *   node web/backend/scripts/cleanup-duplicate-shipping-fees-all.mjs --dry-run    # 미리보기
 *   node web/backend/scripts/cleanup-duplicate-shipping-fees-all.mjs --execute    # 실제 삭제
 */

import mongoose from "mongoose";
import "dotenv/config";

const TARGET_DATE = "2026-06-04";
const TARGET_HOUR_START = 18; // 18:00
const TARGET_HOUR_END = 19;   // 19:00 (19:00 미만)

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

async function findAllDuplicateShippingFees(dryRun = true) {
  const { start, end } = getTargetTimeRange();
  
  console.log(`\n📅 조회 기간: ${start.toISOString()} ~ ${end.toISOString()}`);
  
  // CreditLedger 모델 동적 로드
  const CreditLedger = (await import("../models/creditLedger.model.js")).default;
  const BusinessAnchor = (await import("../models/businessAnchor.model.js")).default;
  const ShippingPackage = (await import("../models/shippingPackage.model.js")).default;
  
  // 해당 시간대의 모든 SHIPPING_PACKAGE SPEND 내역 조회
  const spends = await CreditLedger.find({
    type: "SPEND",
    refType: "SHIPPING_PACKAGE",
    createdAt: { $gte: start, $lt: end },
  }).sort({ businessAnchorId: 1, createdAt: 1 }).lean();
  
  console.log(`\n🔍 총 ${spends.length}건의 배송비 소비 내역 발견`);
  
  if (spends.length === 0) {
    console.log("삭제할 내역이 없습니다.");
    return [];
  }
  
  // 사업자별로 그룹화
  const byBusiness = new Map();
  for (const spend of spends) {
    const anchorId = String(spend.businessAnchorId || "");
    if (!anchorId) continue;
    
    if (!byBusiness.has(anchorId)) {
      byBusiness.set(anchorId, []);
    }
    byBusiness.get(anchorId).push(spend);
  }
  
  console.log(`\n🏢 사업자별 내역 (${byBusiness.size}개 사업자):`);
  
  const toDelete = [];
  const businessDetails = [];
  
  for (const [anchorId, items] of byBusiness) {
    const anchor = await BusinessAnchor.findById(anchorId).lean();
    const businessName = anchor?.name || "Unknown";
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📌 ${businessName} (${anchorId})`);
    console.log(`   총 ${items.length}건의 소비 내역`);
    
    // 패키지별로 그룹화
    const byPackage = new Map();
    for (const item of items) {
      const pkgId = String(item.refId || "");
      if (!pkgId) continue;
      
      if (!byPackage.has(pkgId)) {
        byPackage.set(pkgId, []);
      }
      byPackage.get(pkgId).push(item);
    }
    
    let businessDuplicates = 0;
    let businessRefund = 0;
    
    for (const [pkgId, pkgItems] of byPackage) {
      const pkg = await ShippingPackage.findById(pkgId).lean();
      
      if (pkgItems.length > 1) {
        console.log(`   ⚠️  Package ${pkg?.mailboxAddress || pkgId}: ${pkgItems.length}건 중복`);
        const duplicates = pkgItems.slice(1);
        toDelete.push(...duplicates);
        businessDuplicates += duplicates.length;
        
        for (let i = 0; i < pkgItems.length; i++) {
          const item = pkgItems[i];
          const amount = Math.abs(item.amount || 0);
          const marker = i === 0 ? "✅ 보존" : "❌ 삭제예정";
          console.log(`      [${i + 1}] ${marker} ${amount.toLocaleString()}원 | ${item.uniqueKey}`);
          
          if (i > 0) {
            businessRefund += amount;
          }
        }
      }
    }
    
    if (businessDuplicates > 0) {
      businessDetails.push({
        anchorId,
        businessName,
        duplicateCount: businessDuplicates,
        refundAmount: businessRefund,
      });
    }
  }
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n📊 종합 보고서:`);
  console.log(`   - 총 삭제 예정: ${toDelete.length}건`);
  console.log(`   - 총 환불 예정 금액: ${toDelete.reduce((sum, d) => sum + Math.abs(d.amount || 0), 0).toLocaleString()}원`);
  
  if (businessDetails.length > 0) {
    console.log(`\n   📋 사업자별 삭제 내역:`);
    for (const bd of businessDetails) {
      console.log(`      - ${bd.businessName}: ${bd.duplicateCount}건, ${bd.refundAmount.toLocaleString()}원`);
    }
  }
  
  return toDelete;
}

async function executeDelete(toDelete) {
  const CreditLedger = (await import("../models/creditLedger.model.js")).default;
  
  console.log(`\n🚨 실제 삭제 실행...`);
  
  // 사업자별로 그룹화하여 이벤트 발송
  const refundByBusiness = new Map();
  const ids = [];
  
  for (const item of toDelete) {
    ids.push(item._id);
    const anchorId = String(item.businessAnchorId || "");
    if (anchorId) {
      const current = refundByBusiness.get(anchorId) || 0;
      refundByBusiness.set(anchorId, current + Math.abs(item.amount || 0));
    }
  }
  
  const result = await CreditLedger.deleteMany({
    _id: { $in: ids },
  });
  
  console.log(`✅ 삭제 완료: ${result.deletedCount}건`);
  
  // 실시간 이벤트 발송
  try {
    const { emitCreditBalanceUpdatedToBusiness } = await import("../utils/creditRealtime.js");
    console.log(`📡 실시간 잔액 업데이트 이벤트 발송 중... (${refundByBusiness.size}개 사업자)`);
    
    for (const [anchorId, amount] of refundByBusiness) {
      try {
        await emitCreditBalanceUpdatedToBusiness({
          businessAnchorId: anchorId,
          balanceDelta: amount,
          reason: "duplicate_shipping_fee_cleanup",
          refId: null,
        });
        console.log(`   ✅ ${anchorId}: ${amount.toLocaleString()}원`);
      } catch (e) {
        console.log(`   ⚠️ ${anchorId}: 발송 실패 - ${e.message}`);
      }
    }
  } catch (e) {
    console.log("⚠️ 실시간 이벤트 발송 실패 (무시):", e.message);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--execute");
  
  console.log(dryRun ? "🔍 DRY RUN 모드 (삭제하지 않고 미리보기만)" : "🚨 EXECUTE 모드 (실제 삭제 실행)");
  console.log(`대상: 모든 사업자의 ${TARGET_DATE} ${TARGET_HOUR_START}:00~${TARGET_HOUR_END}:00 배송비 소비`);
  
  await connectDb();
  
  try {
    const toDelete = await findAllDuplicateShippingFees(dryRun);
    
    if (!dryRun && toDelete.length > 0) {
      await executeDelete(toDelete);
    }
    
    console.log("\n✨ 완료");
  } finally {
    await mongoose.disconnect();
    console.log("DB 연결 종료");
  }
}

main().catch(e => {
  console.error("에러:", e);
  process.exit(1);
});
