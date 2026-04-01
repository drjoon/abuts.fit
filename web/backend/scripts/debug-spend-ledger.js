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

async function debugSpendLedger() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected");

    const spendLedgers = await CreditLedger.find({
      businessAnchorId: new mongoose.Types.ObjectId(businessAnchorId),
      type: "SPEND",
    })
      .sort({ createdAt: 1 })
      .lean();

    console.log(`\n총 ${spendLedgers.length}개의 SPEND 항목 발견\n`);

    for (const ledger of spendLedgers) {
      console.log(`=== SPEND Ledger ===`);
      console.log(`생성일: ${ledger.createdAt.toISOString()}`);
      console.log(`Amount: ${ledger.amount}`);
      console.log(`RefType: ${ledger.refType}`);
      console.log(`UniqueKey: ${ledger.uniqueKey}`);
      console.log(`SpentPaidAmount: ${ledger.spentPaidAmount || 0}`);
      console.log(`SpentBonusAmount: ${ledger.spentBonusAmount || 0}`);

      // UniqueKey에서 requestId 추출
      const match = String(ledger.uniqueKey || "").match(
        /^request:([^:]+):/,
      );
      if (match) {
        const requestObjId = match[1];
        console.log(`Request ObjectId: ${requestObjId}`);

        const request = await Request.findById(requestObjId)
          .select({
            requestId: 1,
            manufacturerStage: 1,
            canceledAt: 1,
            createdAt: 1,
            caseInfos: 1,
          })
          .lean();

        if (request) {
          console.log(`\n관련 의뢰:`);
          console.log(`  RequestId: ${request.requestId}`);
          console.log(`  생성일: ${request.createdAt.toISOString()}`);
          console.log(`  단계: ${request.manufacturerStage || "N/A"}`);
          console.log(
            `  취소일: ${request.canceledAt ? request.canceledAt.toISOString() : "N/A"}`,
          );
          console.log(`  환자명: ${request.caseInfos?.patientName || "N/A"}`);
        } else {
          console.log(`\n관련 의뢰를 찾을 수 없습니다.`);
        }
      }

      console.log("");
    }

    await mongoose.disconnect();
    console.log("\nMongoDB disconnected");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

debugSpendLedger();
