import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/user.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";

dotenv.config({ path: "./local.env" });

async function fixUserBusinessAnchor() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB 연결 성공");

    // 문제가 있는 사용자 찾기: businessAnchorId가 없지만 BusinessAnchor에 members로 등록된 경우
    const users = await User.find({
      $or: [
        { businessAnchorId: null },
        { businessAnchorId: { $exists: false } },
      ],
      role: "requestor",
    }).lean();

    console.log(`businessAnchorId가 없는 의뢰자 사용자: ${users.length}명`);

    for (const user of users) {
      const userId = String(user._id);

      // 이 사용자가 members나 primaryContactUserId로 등록된 BusinessAnchor 찾기
      const anchor = await BusinessAnchor.findOne({
        $or: [
          { primaryContactUserId: user._id },
          { members: user._id },
          { owners: user._id },
        ],
      }).lean();

      if (anchor) {
        console.log(`\n[FIX] 사용자 ${user.email} (${userId})`);
        console.log(`  - BusinessAnchor 발견: ${anchor.name} (${anchor._id})`);

        await User.updateOne(
          { _id: user._id },
          {
            $set: {
              businessAnchorId: anchor._id,
              business: anchor.name,
              subRole:
                String(anchor.primaryContactUserId) === userId
                  ? "owner"
                  : "staff",
            },
          },
        );

        console.log(`  ✅ User.businessAnchorId 업데이트 완료`);
      } else {
        console.log(`\n[SKIP] 사용자 ${user.email} (${userId})`);
        console.log(`  - 연결된 BusinessAnchor 없음`);
      }
    }

    console.log("\n✅ 수정 완료");
    process.exit(0);
  } catch (error) {
    console.error("에러 발생:", error);
    process.exit(1);
  }
}

fixUserBusinessAnchor();
