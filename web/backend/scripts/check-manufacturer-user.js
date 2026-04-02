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

async function checkManufacturerUser() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("MongoDB 연결 성공\n");

    const { default: User } = await import("../models/user.model.js");
    const { default: Request } = await import("../models/request.model.js");

    // 1. 제조사 사용자 조회
    console.log("=== 1. 제조사 사용자 목록 ===");
    const manufacturers = await User.find({ role: "manufacturer" })
      .select("_id name email business")
      .lean();

    console.log(`총 ${manufacturers.length}명`);
    manufacturers.forEach((m) => {
      console.log(`- ${m._id} | ${m.name} | ${m.email}`);
    });

    // 2. 의뢰의 caManufacturer 확인
    console.log("\n=== 2. 의뢰 20260401-USUACVDY의 caManufacturer ===");
    const request = await Request.findOne({ requestId: "20260401-USUACVDY" })
      .populate("caManufacturer", "name email")
      .lean();

    if (request) {
      console.log(`caManufacturer: ${request.caManufacturer?._id || "null"}`);
      console.log(`name: ${request.caManufacturer?.name || "N/A"}`);
      console.log(`email: ${request.caManufacturer?.email || "N/A"}`);
    }

    // 3. 해당 제조사로 로그인했을 때 필터 시뮬레이션
    if (request?.caManufacturer?._id) {
      const manufacturerId = request.caManufacturer._id;
      console.log(
        `\n=== 3. 제조사 ${manufacturerId}로 필터링 시뮬레이션 ===`,
      );

      const filtered = await Request.find({
        manufacturerStage: "세척.패킹",
        manufacturerStage: { $ne: "취소" },
        $or: [
          { caManufacturer: manufacturerId },
          { caManufacturer: null },
          { caManufacturer: { $exists: false } },
        ],
      })
        .select("requestId caManufacturer")
        .lean();

      console.log(`필터 결과: ${filtered.length}건`);
      filtered.forEach((r) => {
        console.log(`- ${r.requestId}`);
      });
    }

    // 4. 다른 제조사로 로그인했을 때
    const otherManufacturer = manufacturers.find(
      (m) => m._id.toString() !== request?.caManufacturer?._id?.toString(),
    );

    if (otherManufacturer) {
      console.log(
        `\n=== 4. 다른 제조사 ${otherManufacturer._id}로 필터링 시뮬레이션 ===`,
      );

      const filtered2 = await Request.find({
        manufacturerStage: "세척.패킹",
        manufacturerStage: { $ne: "취소" },
        $or: [
          { caManufacturer: otherManufacturer._id },
          { caManufacturer: null },
          { caManufacturer: { $exists: false } },
        ],
      })
        .select("requestId caManufacturer")
        .lean();

      console.log(`필터 결과: ${filtered2.length}건`);
      filtered2.forEach((r) => {
        console.log(`- ${r.requestId}`);
      });

      const hasTarget = filtered2.some(
        (r) => r.requestId === "20260401-USUACVDY",
      );
      console.log(
        `\n20260401-USUACVDY 포함 여부: ${hasTarget ? "✅ 포함됨" : "❌ 제외됨"}`,
      );
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("오류 발생:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

checkManufacturerUser();
