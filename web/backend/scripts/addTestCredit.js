import mongoose from "mongoose";
import "../bootstrap/env.js";
import User from "../models/user.model.js";
import CreditLedger from "../models/creditLedger.model.js";
import RequestorOrganization from "../models/requestorOrganization.model.js";

async function addTestCredit() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB 연결 성공");

    const testEmail = "requestor.principal@demo.abuts.fit";
    const user = await User.findOne({ email: testEmail, active: true });

    if (!user) {
      console.log(`테스트 주대표 계정을 찾을 수 없습니다: ${testEmail}`);
      console.log("사용 가능한 주대표 계정을 찾는 중...");

      const principals = await User.find({
        role: "requestor",
        position: "principal",
        active: true,
      })
        .select("email name organization")
        .limit(5)
        .lean();

      if (principals.length === 0) {
        console.log("주대표 계정이 없습니다.");
        process.exit(1);
      }

      console.log("\n사용 가능한 주대표 계정:");
      principals.forEach((p, idx) => {
        console.log(
          `${idx + 1}. ${p.email} - ${p.name} (${
            p.organization || "조직 없음"
          })`
        );
      });

      console.log("\n첫 번째 계정에 크레딧을 추가합니다...");
      const targetUser = principals[0];

      const org = await RequestorOrganization.findOne({
        $or: [{ owner: targetUser._id }, { members: targetUser._id }],
      }).lean();

      const uniqueKey = `test:credit:${Date.now()}`;
      await CreditLedger.create({
        organizationId: org?._id || null,
        userId: targetUser._id,
        type: "CHARGE",
        amount: 500000,
        uniqueKey,
        refType: "TEST",
        createdAt: new Date(),
      });

      console.log(
        `\n✅ ${targetUser.email} 계정에 500,000원 크레딧이 추가되었습니다.`
      );
      console.log(`사용자 ID: ${targetUser._id}`);
    } else {
      const org = await RequestorOrganization.findOne({
        $or: [{ owner: user._id }, { members: user._id }],
      }).lean();

      const uniqueKey = `test:credit:${Date.now()}`;
      await CreditLedger.create({
        organizationId: org?._id || null,
        userId: user._id,
        type: "CHARGE",
        amount: 500000,
        uniqueKey,
        refType: "TEST",
        createdAt: new Date(),
      });

      console.log(
        `\n✅ ${user.email} 계정에 500,000원 크레딧이 추가되었습니다.`
      );
      console.log(`사용자 ID: ${user._id}`);
    }

    await mongoose.connection.close();
    console.log("\nMongoDB 연결 종료");
  } catch (error) {
    console.error("오류 발생:", error);
    process.exit(1);
  }
}

addTestCredit();
