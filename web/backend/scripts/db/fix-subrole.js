import { connectDb, disconnectDb } from "./_mongo.js";
import User from "../../models/user.model.js";

async function fixSubRole() {
  try {
    await connectDb();
    console.log("MongoDB 연결 성공");

    // businessAnchorId가 있지만 subRole이 null인 사용자 찾기
    const usersWithoutSubRole = await User.find({
      businessAnchorId: { $ne: null },
      subRole: null,
    }).select({ _id: 1, email: 1, role: 1, businessAnchorId: 1, subRole: 1 });

    console.log(`\nsubRole이 null인 사용자: ${usersWithoutSubRole.length}명`);

    if (usersWithoutSubRole.length > 0) {
      console.log("\n수정할 사용자 목록:");
      usersWithoutSubRole.forEach((user) => {
        console.log(`- ${user.email} (${user.role})`);
      });

      // subRole을 'owner'로 업데이트
      const result = await User.updateMany(
        {
          businessAnchorId: { $ne: null },
          subRole: null,
        },
        {
          $set: { subRole: "owner" },
        },
      );

      console.log(
        `\n✅ ${result.modifiedCount}명의 사용자 subRole을 'owner'로 업데이트했습니다.`,
      );
    } else {
      console.log("\n모든 사용자의 subRole이 정상적으로 설정되어 있습니다.");
    }

    await disconnectDb();
    console.log("\nMongoDB 연결 종료");
  } catch (error) {
    console.error("오류 발생:", error);
    process.exit(1);
  }
}

fixSubRole();
