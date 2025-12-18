import mongoose from "mongoose";
import "../bootstrap/env.js";

const userSchema = new mongoose.Schema(
  {},
  { strict: false, collection: "users" }
);
const creditLedgerSchema = new mongoose.Schema(
  {},
  { strict: false, collection: "creditledgers" }
);

const requestorOrganizationSchema = new mongoose.Schema(
  {},
  { strict: false, collection: "requestororganizations" }
);

const User = mongoose.model("User", userSchema);
const CreditLedger = mongoose.model("CreditLedger", creditLedgerSchema);
const RequestorOrganization = mongoose.model(
  "RequestorOrganization",
  requestorOrganizationSchema
);

async function main() {
  try {
    console.log("MongoDB URI:", process.env.MONGODB_URI ? "설정됨" : "없음");

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB 연결 성공\n");

    // 1. approvedAt이 없는 의뢰자 계정 업데이트
    console.log("=== 의뢰자 계정 approvedAt 업데이트 ===");
    const updateResult = await User.updateMany(
      {
        role: "requestor",
        active: true,
        $or: [{ approvedAt: null }, { approvedAt: { $exists: false } }],
      },
      { $set: { approvedAt: new Date() } }
    );
    console.log(`✅ ${updateResult.modifiedCount}개 계정 업데이트 완료\n`);

    // 2. 주대표 계정 찾기
    console.log("=== 주대표 계정 조회 ===");
    const principals = await User.find({
      role: "requestor",
      position: "principal",
      active: true,
    }).limit(5);

    console.log(`주대표 계정 ${principals.length}개 발견:`);
    for (const p of principals) {
      console.log(`  - ${p.email} (${p.name})`);
    }

    if (principals.length === 0) {
      console.log("주대표 계정이 없습니다.");
      await mongoose.connection.close();
      return;
    }

    // 3. 첫 번째 주대표에 크레딧 추가
    const target = principals[0];
    console.log(`\n=== ${target.email}에 크레딧 추가 ===`);

    const existingCredits = await CreditLedger.find({ userId: target._id });
    const balance = existingCredits.reduce(
      (sum, c) => sum + (c.amount || 0),
      0
    );
    console.log(`현재 잔액: ${balance.toLocaleString()}원`);

    const org = await RequestorOrganization.findOne({
      $or: [{ owner: target._id }, { members: target._id }],
    }).lean();

    await CreditLedger.create({
      organizationId: org?._id || null,
      userId: target._id,
      type: "CHARGE",
      amount: 500000,
      uniqueKey: `test:credit:${Date.now()}`,
      refType: "TEST",
      createdAt: new Date(),
    });

    console.log(`✅ 500,000원 추가 완료`);
    console.log(`새 잔액: ${(balance + 500000).toLocaleString()}원\n`);

    await mongoose.connection.close();
    console.log("완료");
  } catch (error) {
    console.error("❌ 오류:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
