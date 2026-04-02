import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../local.env") });

const MONGODB_URI = process.env.MONGODB_URI_TEST;
if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI 환경변수가 설정되지 않았습니다.");
  process.exit(1);
}

async function fixCaManufacturerField() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ MongoDB 연결 성공");

    const db = mongoose.connection.db;
    const requestsCollection = db.collection("requests");
    const usersCollection = db.collection("users");

    // 1. 애크로덴트 제조사 사용자 찾기
    const acroDentManufacturer = await usersCollection.findOne({
      role: "manufacturer",
      email: { $regex: /acrodent/i },
    });

    if (!acroDentManufacturer) {
      console.error("❌ 애크로덴트 제조사 사용자를 찾을 수 없습니다.");
      process.exit(1);
    }

    console.log("✅ 애크로덴트 제조사 사용자:", {
      _id: acroDentManufacturer._id,
      email: acroDentManufacturer.email,
      name: acroDentManufacturer.name,
    });

    // 2. caManufacturer가 ObjectId가 아니거나 잘못된 값인 의뢰 찾기
    const invalidRequests = await requestsCollection
      .find({
        caManufacturer: { $exists: true, $ne: null },
      })
      .toArray();

    console.log(
      `\n📊 총 ${invalidRequests.length}개의 의뢰 중 caManufacturer 확인 중...`,
    );

    let fixedCount = 0;
    let alreadyCorrectCount = 0;

    for (const request of invalidRequests) {
      const caManufacturerId = request.caManufacturer;

      console.log(`\n📋 ${request.requestId}`);
      console.log(`   caManufacturer: ${caManufacturerId}`);
      console.log(`   애크로덴트 ID: ${acroDentManufacturer._id}`);
      console.log(
        `   일치 여부: ${caManufacturerId.toString() === acroDentManufacturer._id.toString()}`,
      );

      // ObjectId가 아닌 경우 또는 다른 제조사인 경우
      if (
        !mongoose.Types.ObjectId.isValid(caManufacturerId) ||
        caManufacturerId.toString() !== acroDentManufacturer._id.toString()
      ) {
        console.log(`   ⚠️  수정 필요!`);

        await requestsCollection.updateOne(
          { _id: request._id },
          { $set: { caManufacturer: acroDentManufacturer._id } },
        );
        fixedCount++;
      } else {
        console.log(`   ✅ 이미 올바름`);
        alreadyCorrectCount++;
      }
    }

    console.log(`\n✅ 완료!`);
    console.log(`   - 수정된 의뢰: ${fixedCount}개`);
    console.log(`   - 이미 올바른 의뢰: ${alreadyCorrectCount}개`);

    await mongoose.disconnect();
    console.log("\n✅ MongoDB 연결 종료");
  } catch (error) {
    console.error("❌ 오류 발생:", error);
    process.exit(1);
  }
}

fixCaManufacturerField();
