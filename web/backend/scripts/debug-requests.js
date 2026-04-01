import mongoose from "mongoose";
import Request from "../models/request.model.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../local.env") });

const businessAnchorId = "69cb428b62191de7d4f75ca1"; // 향기로운치과

async function debugRequests() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected");

    const requests = await Request.find({
      businessAnchorId: new mongoose.Types.ObjectId(businessAnchorId),
    })
      .select({
        requestId: 1,
        manufacturerStage: 1,
        canceledAt: 1,
        createdAt: 1,
        caseInfos: 1,
      })
      .sort({ createdAt: 1 })
      .lean();

    console.log(`\n총 ${requests.length}개의 의뢰 발견\n`);

    requests.forEach((req, index) => {
      console.log(`[${index + 1}] ${req.requestId}`);
      console.log(`  생성일: ${req.createdAt.toISOString()}`);
      console.log(`  단계: ${req.manufacturerStage || "N/A"}`);
      console.log(`  취소일: ${req.canceledAt ? req.canceledAt.toISOString() : "N/A"}`);
      console.log(`  환자명: ${req.caseInfos?.patientName || "N/A"}`);
      console.log("");
    });

    const canceledCount = requests.filter((r) => r.canceledAt).length;
    const activeCount = requests.filter((r) => !r.canceledAt).length;

    console.log("=== 요약 ===");
    console.log(`총 의뢰: ${requests.length}개`);
    console.log(`취소된 의뢰: ${canceledCount}개`);
    console.log(`활성 의뢰: ${activeCount}개`);

    await mongoose.disconnect();
    console.log("\nMongoDB disconnected");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

debugRequests();
