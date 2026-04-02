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

async function fixMissingBusinessAnchorId() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("MongoDB 연결 성공");

    const Request = mongoose.model(
      "Request",
      new mongoose.Schema({}, { strict: false }),
    );
    const User = mongoose.model(
      "User",
      new mongoose.Schema({}, { strict: false }),
    );

    // businessAnchorId가 null인 의뢰 조회
    const requestsWithoutAnchor = await Request.find({
      businessAnchorId: null,
    })
      .populate("requestor", "businessAnchorId")
      .lean();

    console.log(
      `businessAnchorId가 null인 의뢰: ${requestsWithoutAnchor.length}건`,
    );

    let updatedCount = 0;
    let skippedCount = 0;

    for (const req of requestsWithoutAnchor) {
      const requestorBusinessAnchorId = req.requestor?.businessAnchorId;

      if (requestorBusinessAnchorId) {
        await Request.updateOne(
          { _id: req._id },
          { $set: { businessAnchorId: requestorBusinessAnchorId } },
        );
        console.log(
          `✓ ${req.requestId}: businessAnchorId 설정 완료 (${requestorBusinessAnchorId})`,
        );
        updatedCount++;
      } else {
        console.log(
          `✗ ${req.requestId}: requestor의 businessAnchorId도 없음 (건너뜀)`,
        );
        skippedCount++;
      }
    }

    console.log("\n=== 수정 완료 ===");
    console.log(`업데이트: ${updatedCount}건`);
    console.log(`건너뜀: ${skippedCount}건`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("오류 발생:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

fixMissingBusinessAnchorId();
