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

async function testCompletedFilter() {
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

    // 2. 다른 제조사 찾기
    const manufacturers = await User.find({ role: "manufacturer" }).lean();
    const otherManufacturer = manufacturers.find(
      (m) => m._id.toString() !== request.caManufacturer?.toString(),
    );

    if (!otherManufacturer) {
      console.log("❌ 다른 제조사를 찾을 수 없습니다");
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log(`\n=== 다른 제조사로 테스트 ===`);
    console.log(`제조사: ${otherManufacturer.name} (${otherManufacturer._id})`);

    // 3. "완료포함" 시나리오 시뮬레이션
    // 의뢰 단계에서 "완료포함" 체크 시: ["의뢰", "CAM", "가공", "세척.패킹", "포장.발송", "추적관리"]
    const sharedStages = ["세척.패킹", "포장.발송", "추적관리", "배송대기", "배송중", "배송완료", "완료"];
    const requestedStages = ["의뢰", "CAM", "가공", "세척.패킹", "포장.발송", "추적관리"];

    const privateStages = requestedStages.filter(
      (s) => !sharedStages.includes(s),
    );
    const publicStages = requestedStages.filter((s) =>
      sharedStages.includes(s),
    );

    console.log(`\n전용 단계 (caManufacturer 필터 적용): ${privateStages.join(", ")}`);
    console.log(`공유 단계 (모든 제조사): ${publicStages.join(", ")}`);

    // 4. 새 필터 로직 시뮬레이션
    const filter = {
      $and: [
        { manufacturerStage: { $ne: "취소" } },
        {
          $or: [
            // 공유 단계: 모든 제조사가 볼 수 있음
            { manufacturerStage: { $in: publicStages } },
            // 전용 단계: 본인에게 배정되었거나 미배정된 의뢰만
            {
              $and: [
                { manufacturerStage: { $in: privateStages } },
                {
                  $or: [
                    { caManufacturer: otherManufacturer._id },
                    { caManufacturer: null },
                    { caManufacturer: { $exists: false } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const results = await Request.find(filter)
      .select("requestId manufacturerStage caManufacturer")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    console.log(`\n=== 필터 결과: ${results.length}건 ===`);
    results.forEach((r) => {
      const isAssignedToOther = r.caManufacturer?.toString() === otherManufacturer._id.toString();
      const isAssignedToTarget = r.caManufacturer?.toString() === request.caManufacturer?.toString();
      const assignedTo = isAssignedToOther 
        ? "현재 제조사" 
        : isAssignedToTarget 
        ? "다른 제조사" 
        : "미배정";
      
      console.log(
        `- ${r.requestId} | ${r.manufacturerStage} | ${assignedTo}`,
      );
    });

    const hasTarget = results.some((r) => r.requestId === "20260401-USUACVDY");
    console.log(`\n20260401-USUACVDY 포함 여부: ${hasTarget ? "✅ 포함됨" : "❌ 제외됨"}`);

    if (hasTarget) {
      console.log("\n✅ 수정 성공! 완료포함 시 세척.패킹 단계의 의뢰가 보입니다.");
    } else {
      console.log("\n❌ 수정 실패! 여전히 의뢰가 필터에서 제외됩니다.");
    }

    // 5. CAM 단계에서 "완료포함" 시나리오
    console.log("\n\n=== CAM 단계에서 완료포함 시나리오 ===");
    const camRequestedStages = ["CAM", "가공", "세척.패킹", "포장.발송", "추적관리"];
    const camPrivateStages = camRequestedStages.filter(
      (s) => !sharedStages.includes(s),
    );
    const camPublicStages = camRequestedStages.filter((s) =>
      sharedStages.includes(s),
    );

    console.log(`전용 단계: ${camPrivateStages.join(", ")}`);
    console.log(`공유 단계: ${camPublicStages.join(", ")}`);

    const camFilter = {
      $and: [
        { manufacturerStage: { $ne: "취소" } },
        {
          $or: [
            { manufacturerStage: { $in: camPublicStages } },
            {
              $and: [
                { manufacturerStage: { $in: camPrivateStages } },
                {
                  $or: [
                    { caManufacturer: otherManufacturer._id },
                    { caManufacturer: null },
                    { caManufacturer: { $exists: false } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const camResults = await Request.find(camFilter)
      .select("requestId manufacturerStage")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    console.log(`\n필터 결과: ${camResults.length}건`);
    const camHasTarget = camResults.some((r) => r.requestId === "20260401-USUACVDY");
    console.log(`20260401-USUACVDY 포함 여부: ${camHasTarget ? "✅ 포함됨" : "❌ 제외됨"}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("오류 발생:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

testCompletedFilter();
