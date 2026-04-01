import mongoose from "mongoose";
import CreditLedger from "../models/creditLedger.model.js";
import Request from "../models/request.model.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../local.env") });

const businessAnchorId = "69cb428b62191de7d4f75ca1"; // 향기로운치과

async function fixFragrantDentalCredit() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected");

    // 존재하지 않는 의뢰에 대한 SPEND 항목 찾기
    const spendLedgers = await CreditLedger.find({
      businessAnchorId: new mongoose.Types.ObjectId(businessAnchorId),
      type: "SPEND",
    }).lean();

    console.log(`\n총 ${spendLedgers.length}개의 SPEND 항목 발견\n`);

    const invalidLedgers = [];

    for (const ledger of spendLedgers) {
      const match = String(ledger.uniqueKey || "").match(/^request:([^:]+):/);
      if (match) {
        const requestObjId = match[1];
        const request = await Request.findById(requestObjId).lean();

        if (!request) {
          console.log(`⚠️ 존재하지 않는 의뢰에 대한 SPEND 항목 발견:`);
          console.log(`  Ledger ID: ${ledger._id}`);
          console.log(`  UniqueKey: ${ledger.uniqueKey}`);
          console.log(`  Amount: ${ledger.amount}`);
          console.log(`  생성일: ${ledger.createdAt.toISOString()}`);
          invalidLedgers.push(ledger);
        }
      }
    }

    if (invalidLedgers.length === 0) {
      console.log("삭제할 잘못된 SPEND 항목이 없습니다.");
      await mongoose.disconnect();
      return;
    }

    console.log(`\n총 ${invalidLedgers.length}개의 잘못된 SPEND 항목을 삭제합니다.`);
    console.log("계속하려면 Ctrl+C를 누르지 마세요...");

    // 3초 대기
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const ledgerIds = invalidLedgers.map((l) => l._id);
    const result = await CreditLedger.deleteMany({
      _id: { $in: ledgerIds },
    });

    console.log(`\n✅ ${result.deletedCount}개의 SPEND 항목이 삭제되었습니다.`);

    // 삭제 후 크레딧 잔액 확인
    const remainingLedgers = await CreditLedger.find({
      businessAnchorId: new mongoose.Types.ObjectId(businessAnchorId),
    })
      .sort({ createdAt: 1 })
      .lean();

    console.log(`\n=== 삭제 후 CreditLedger (${remainingLedgers.length}개) ===`);
    let totalBonus = 0;
    let totalSpent = 0;

    remainingLedgers.forEach((ledger, index) => {
      console.log(`[${index + 1}] ${ledger.type} ${ledger.amount}원`);
      if (ledger.type === "BONUS") {
        totalBonus += Number(ledger.amount || 0);
      } else if (ledger.type === "SPEND") {
        totalSpent += Math.abs(Number(ledger.amount || 0));
      }
    });

    console.log(`\n총 무료 크레딧: ${totalBonus}원`);
    console.log(`총 사용액: ${totalSpent}원`);
    console.log(`잔액: ${totalBonus - totalSpent}원`);

    await mongoose.disconnect();
    console.log("\nMongoDB disconnected");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

fixFragrantDentalCredit();
