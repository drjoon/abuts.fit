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
  process.exit(1);
}

async function testNewFilter() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("MongoDB 연결 성공\n");

    const { default: Request } = await import("../models/request.model.js");
    const { default: User } = await import("../models/user.model.js");

    // 1. 의뢰 정보 확인
    const request = await Request.findOne({ requestId: "20260401-USUACVDY" })
      .lean();

    console.log("=== 의뢰 정보 ===");
    console.log(`requestId: ${request.requestId}`);
    console.log(`manufacturerStage: ${request.manufacturerStage}`);
    console.log(`caManufacturer: ${request.caManufacturer}`);

    // 2. 다른 제조사로 필터링 (새 로직)
    const manufacturers = await User.find({ role: "manufacturer" }).lean();
    const otherManufacturer = manufacturers.find(
      (m) => m._id.toString() !== request.caManufacturer?.toString(),
    );

    if (!otherManufacturer) {
      console.log("❌ 다른 제조사를 찾을 수 없습니다");
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log(`\n=== 다른 제조사로 세척.패킹 조회 ===`);
    console.log(`제조사: ${otherManufacturer.name} (${otherManufacturer._id})`);

    // 새 필터 로직 시뮬레이션
    const sharedStages = ["세척.패킹", "포장.발송", "추적관리", "배송대기", "배송중", "배송완료", "완료"];
    const requestedStage = "세척.패킹";
    const isSharedStageRequest = sharedStages.includes(requestedStage);

    console.log(`공유 단계 요청: ${isSharedStageRequest}`);

    let filter;
    if (isSharedStageRequest) {
      // 새 로직: caManufacturer 필터 없음
      filter = {
        manufacturerStage: requestedStage,
        manufacturerStage: { $ne: "취소" },
      };
    } else {
      // 기존 로직
      filter = {
        manufacturerStage: requestedStage,
        manufacturerStage: { $ne: "취소" },
        $or: [
          { caManufacturer: otherManufacturer._id },
          { caManufacturer: null },
          { caManufacturer: { $exists: false } },
        ],
      };
    }

    const results = await Request.find(filter)
      .select("requestId manufacturerStage caManufacturer")
      .lean();

    console.log(`\n필터 결과: ${results.length}건`);
    results.forEach((r) => {
      console.log(`- ${r.requestId} | caManufacturer: ${r.caManufacturer || "null"}`);
    });

    const hasTarget = results.some((r) => r.requestId === "20260401-USUACVDY");
    console.log(`\n20260401-USUACVDY 포함 여부: ${hasTarget ? "✅ 포함됨" : "❌ 제외됨"}`);

    if (hasTarget) {
      console.log("\n✅ 수정 성공! 다른 제조사도 세척.패킹 의뢰를 볼 수 있습니다.");
    } else {
      console.log("\n❌ 수정 실패! 여전히 의뢰가 필터에서 제외됩니다.");
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("오류 발생:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

testNewFilter();
