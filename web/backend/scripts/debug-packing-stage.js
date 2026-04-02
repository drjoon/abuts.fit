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

async function debugPackingStage() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("MongoDB 연결 성공\n");

    const { default: Request } = await import("../models/request.model.js");
    const { default: User } = await import("../models/user.model.js");

    // 1. 20260401-USUACVDY 의뢰 상세 조회
    console.log("=== 1. 의뢰 20260401-USUACVDY 상세 정보 ===");
    const request = await Request.findOne({ requestId: "20260401-USUACVDY" })
      .populate("requestor", "name businessAnchorId role")
      .populate("caManufacturer", "name role")
      .lean();

    if (!request) {
      console.log("❌ 의뢰를 찾을 수 없습니다");
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log(`requestId: ${request.requestId}`);
    console.log(`manufacturerStage: "${request.manufacturerStage}"`);
    console.log(`businessAnchorId: ${request.businessAnchorId}`);
    console.log(`mailboxAddress: ${request.mailboxAddress}`);
    console.log(`caManufacturer: ${request.caManufacturer?._id || "null"}`);
    console.log(
      `requestor.businessAnchorId: ${request.requestor?.businessAnchorId}`,
    );
    console.log(`requestor.role: ${request.requestor?.role}`);
    console.log(
      `actualMachiningComplete: ${request.productionSchedule?.actualMachiningComplete}`,
    );

    // 2. 세척.패킹 단계 의뢰 조회 (제조사 필터 없이)
    console.log("\n=== 2. 세척.패킹 단계 의뢰 (필터 없음) ===");
    const packingAll = await Request.find({
      manufacturerStage: "세척.패킹",
    })
      .select("requestId manufacturerStage caManufacturer")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    console.log(`총 ${packingAll.length}건`);
    packingAll.forEach((r) => {
      console.log(
        `- ${r.requestId} | caManufacturer: ${r.caManufacturer || "null"}`,
      );
    });

    // 3. 세척.패킹 단계 의뢰 조회 (제조사 필터 적용)
    console.log("\n=== 3. 세척.패킹 단계 의뢰 (제조사 필터 적용) ===");
    const packingFiltered = await Request.find({
      manufacturerStage: "세척.패킹",
      $or: [
        { caManufacturer: request.caManufacturer?._id },
        { caManufacturer: null },
        { caManufacturer: { $exists: false } },
      ],
    })
      .select("requestId manufacturerStage caManufacturer")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    console.log(`총 ${packingFiltered.length}건`);
    packingFiltered.forEach((r) => {
      console.log(
        `- ${r.requestId} | caManufacturer: ${r.caManufacturer || "null"}`,
      );
    });

    // 4. 해당 의뢰가 제조사 필터에 걸리는지 확인
    console.log("\n=== 4. 필터 조건 검증 ===");
    const isInFilter = packingFiltered.some(
      (r) => r.requestId === "20260401-USUACVDY",
    );
    console.log(`20260401-USUACVDY가 필터에 포함됨: ${isInFilter}`);

    if (!isInFilter) {
      console.log("\n❌ 문제 발견: 의뢰가 제조사 필터에 걸리지 않음");
      console.log("원인 분석:");
      console.log(
        `- 의뢰의 caManufacturer: ${request.caManufacturer?._id || "null"}`,
      );
      console.log(
        `- 필터 조건: caManufacturer가 ${request.caManufacturer?._id} 또는 null`,
      );
    }

    // 5. 취소되지 않은 세척.패킹 의뢰 조회
    console.log("\n=== 5. 취소되지 않은 세척.패킹 의뢰 ===");
    const packingNotCanceled = await Request.find({
      manufacturerStage: "세척.패킹",
      manufacturerStage: { $ne: "취소" },
    })
      .select("requestId manufacturerStage")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    console.log(`총 ${packingNotCanceled.length}건`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("오류 발생:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

debugPackingStage();
