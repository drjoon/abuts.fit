import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/user.model.js";
import CreditLedger from "../models/creditLedger.model.js";
import RequestorOrganization from "../models/requestorOrganization.model.js";

dotenv.config();

async function fixTestAccounts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB 연결 성공\n");

    // 1. 모든 의뢰자 계정의 approvedAt 업데이트
    console.log("=== 1단계: 의뢰자 계정 approvedAt 업데이트 ===");
    const requestors = await User.find({
      role: "requestor",
      active: true,
      $or: [{ approvedAt: null }, { approvedAt: { $exists: false } }],
    }).select("email name position");

    if (requestors.length === 0) {
      console.log("업데이트가 필요한 의뢰자 계정이 없습니다.\n");
    } else {
      console.log(`${requestors.length}개의 의뢰자 계정을 업데이트합니다:`);
      for (const user of requestors) {
        console.log(
          `  - ${user.email} (${user.name}, ${user.position || "staff"})`
        );
      }

      const updateResult = await User.updateMany(
        {
          role: "requestor",
          active: true,
          $or: [{ approvedAt: null }, { approvedAt: { $exists: false } }],
        },
        { $set: { approvedAt: new Date() } }
      );

      console.log(
        `✅ ${updateResult.modifiedCount}개 계정의 approvedAt을 업데이트했습니다.\n`
      );
    }

    // 2. 주대표 계정 찾기 및 크레딧 추가
    console.log("=== 2단계: 주대표 계정에 유료 크레딧 추가 ===");
    const principals = await User.find({
      role: "requestor",
      position: "principal",
      active: true,
    })
      .select("email name organization")
      .lean();

    if (principals.length === 0) {
      console.log("주대표 계정이 없습니다.");
      await mongoose.connection.close();
      return;
    }

    console.log(`\n${principals.length}개의 주대표 계정을 찾았습니다:`);
    principals.forEach((p, idx) => {
      console.log(
        `${idx + 1}. ${p.email} - ${p.name} (${p.organization || "조직 없음"})`
      );
    });

    // 첫 번째 주대표 계정에 크레딧 추가
    const targetUser = principals[0];
    console.log(`\n첫 번째 계정에 크레딧을 추가합니다: ${targetUser.email}`);

    // 기존 크레딧 확인
    const existingCredits = await CreditLedger.find({
      userId: targetUser._id,
    })
      .select("type amount createdAt")
      .lean();

    const totalBalance = existingCredits.reduce(
      (sum, c) => sum + (c.amount || 0),
      0
    );
    console.log(`현재 잔액: ${totalBalance.toLocaleString()}원`);

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
      `✅ ${targetUser.email} 계정에 500,000원 크레딧이 추가되었습니다.`
    );
    console.log(`새로운 잔액: ${(totalBalance + 500000).toLocaleString()}원`);
    console.log(`사용자 ID: ${targetUser._id}\n`);

    await mongoose.connection.close();
    console.log("MongoDB 연결 종료");
  } catch (error) {
    console.error("오류 발생:", error);
    process.exit(1);
  }
}

fixTestAccounts();
