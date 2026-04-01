import mongoose from "mongoose";
import CreditLedger from "../models/creditLedger.model.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../local.env") });

const businessAnchorId = "69cb428b62191de7d4f75ca1"; // 향기로운치과

async function debugCreditLedger() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected");

    const ledgers = await CreditLedger.find({
      businessAnchorId: new mongoose.Types.ObjectId(businessAnchorId),
    })
      .sort({ createdAt: 1 })
      .lean();

    console.log(`\n총 ${ledgers.length}개의 CreditLedger 항목 발견\n`);

    let totalCharged = 0;
    let totalBonus = 0;
    let totalSpent = 0;

    ledgers.forEach((ledger, index) => {
      const amount = Number(ledger.amount || 0);
      const type = String(ledger.type || "");
      const refType = String(ledger.refType || "");

      console.log(`[${index + 1}] ${ledger.createdAt.toISOString()}`);
      console.log(`  Type: ${type}`);
      console.log(`  RefType: ${refType}`);
      console.log(`  Amount: ${amount}`);
      console.log(`  SpentPaidAmount: ${ledger.spentPaidAmount || 0}`);
      console.log(`  SpentBonusAmount: ${ledger.spentBonusAmount || 0}`);
      console.log(`  UniqueKey: ${ledger.uniqueKey || ""}`);
      console.log(`  Description: ${ledger.description || ""}`);

      if (type === "CHARGE" || type === "REFUND") {
        totalCharged += Math.abs(amount);
      } else if (type === "BONUS") {
        totalBonus += amount;
        if (amount < 0) {
          console.log(`  ⚠️ WARNING: BONUS with negative amount!`);
        }
      } else if (type === "SPEND") {
        totalSpent += Math.abs(amount);
      }

      console.log("");
    });

    console.log("=== 요약 ===");
    console.log(`총 충전액 (CHARGE/REFUND): ${totalCharged}`);
    console.log(`총 무료 크레딧 (BONUS): ${totalBonus}`);
    console.log(`총 사용액 (SPEND): ${totalSpent}`);

    const bonusLedgers = ledgers.filter((l) => l.type === "BONUS");
    console.log(`\n=== BONUS 항목 상세 (${bonusLedgers.length}개) ===`);
    bonusLedgers.forEach((ledger, index) => {
      console.log(
        `[${index + 1}] Amount: ${ledger.amount}, RefType: ${ledger.refType || "N/A"}, UniqueKey: ${ledger.uniqueKey || "N/A"}`,
      );
    });

    await mongoose.disconnect();
    console.log("\nMongoDB disconnected");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

debugCreditLedger();
