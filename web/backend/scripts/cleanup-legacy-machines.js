import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// local.env 파일 로드
dotenv.config({ path: join(__dirname, "../local.env") });

const MONGODB_URI = process.env.MONGODB_URI_TEST;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI_TEST가 설정되지 않았습니다.");
  process.exit(1);
}

async function cleanupLegacyMachines() {
  try {
    console.log("🔌 MongoDB 연결 중...");
    await mongoose.connect(MONGODB_URI);
    console.log("✅ MongoDB 연결 성공");

    const legacyMachineIds = ["M104", "M105"];

    // 1. Machine 컬렉션에서 삭제
    console.log("\n📋 Machine 컬렉션 정리 중...");
    const machineResult = await mongoose.connection.db
      .collection("machines")
      .deleteMany({ uid: { $in: legacyMachineIds } });
    console.log(`   삭제된 Machine 문서: ${machineResult.deletedCount}개`);

    // 2. CncMachine 컬렉션에서 삭제
    console.log("\n📋 CncMachine 컬렉션 정리 중...");
    const cncMachineResult = await mongoose.connection.db
      .collection("cncmachines")
      .deleteMany({ machineId: { $in: legacyMachineIds } });
    console.log(`   삭제된 CncMachine 문서: ${cncMachineResult.deletedCount}개`);

    // 3. 남아있는 장비 목록 확인
    console.log("\n📋 현재 등록된 장비 목록:");
    const machines = await mongoose.connection.db
      .collection("machines")
      .find({})
      .project({ uid: 1, name: 1, ip: 1, port: 1 })
      .toArray();

    if (machines.length === 0) {
      console.log("   등록된 장비가 없습니다.");
    } else {
      machines.forEach((m) => {
        console.log(
          `   - ${m.uid}: ${m.name || "이름없음"} (${m.ip}:${m.port})`,
        );
      });
    }

    console.log("\n✅ 레거시 장비 정리 완료");
  } catch (error) {
    console.error("❌ 오류 발생:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 MongoDB 연결 종료");
  }
}

cleanupLegacyMachines();
