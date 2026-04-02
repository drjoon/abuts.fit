import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../local.env") });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI 환경변수가 설정되지 않았습니다.");
  console.error("local.env 파일에 MONGODB_URI를 설정해주세요.");
  process.exit(1);
}

async function checkRequestStatus() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("MongoDB 연결 성공\n");

    const { default: Request } = await import("../models/request.model.js");
    const { default: User } = await import("../models/user.model.js");

    // 20260401-USUACVDY 의뢰 조회
    const request = await Request.findOne({ requestId: "20260401-USUACVDY" })
      .populate("requestor", "name businessAnchorId")
      .lean();

    if (!request) {
      console.log("❌ 의뢰를 찾을 수 없습니다: 20260401-USUACVDY");
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log("=== 의뢰 정보 ===");
    console.log(`requestId: ${request.requestId}`);
    console.log(`manufacturerStage: ${request.manufacturerStage}`);
    console.log(`businessAnchorId: ${request.businessAnchorId}`);
    console.log(`mailboxAddress: ${request.mailboxAddress}`);
    console.log(
      `requestor.businessAnchorId: ${request.requestor?.businessAnchorId}`,
    );
    console.log(
      `actualMachiningComplete: ${request.productionSchedule?.actualMachiningComplete}`,
    );
    console.log(`createdAt: ${request.createdAt}`);

    // 세척.패킹 단계의 의뢰 조회
    console.log("\n=== 세척.패킹 단계 의뢰 목록 ===");
    const packingRequests = await Request.find({
      manufacturerStage: "세척.패킹",
    })
      .select("requestId manufacturerStage mailboxAddress createdAt")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    console.log(`총 ${packingRequests.length}건`);
    packingRequests.forEach((r) => {
      console.log(
        `- ${r.requestId} | ${r.manufacturerStage} | mailbox: ${r.mailboxAddress || "없음"}`,
      );
    });

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("오류 발생:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

checkRequestStatus();
