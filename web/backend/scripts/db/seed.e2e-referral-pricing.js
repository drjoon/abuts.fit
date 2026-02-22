import "../../bootstrap/env.js";
import { connectDb, disconnectDb } from "./_mongo.js";
import mongoose from "mongoose";
import crypto from "crypto";
import User from "../../models/user.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import Request from "../../models/request.model.js";

const PREFIX = (
  String(process.env.E2E_RP_PREFIX || "").trim() || "e2e.rp"
).toLowerCase();
const DOMAIN = String(process.env.E2E_RP_DOMAIN || "demo.abuts.fit").trim();
const PASSWORD = String(
  process.env.E2E_RP_PASSWORD || "E2E_password123!",
).trim();

const now = new Date();
const joinedAt = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

const USERS = [
  { key: "a", name: "E2E RP A", parent: null },
  { key: "b", name: "E2E RP B", parent: "a" },
  { key: "c", name: "E2E RP C", parent: "a" },
  { key: "d", name: "E2E RP D", parent: "b" },
  { key: "e", name: "E2E RP E", parent: "b" },
  { key: "f", name: "E2E RP F", parent: "b" },
];

function emailOf(key) {
  return `${PREFIX}.${key}@${DOMAIN}`.toLowerCase();
}

function makeBusinessNumberForUser(userId) {
  // RequestorOrganization.extracted.businessNumber has unique+sparse index.
  // Seed에서 안정적으로 재현 가능하면서도 유니크하도록 userId 기반으로 10자리 숫자를 만듭니다.
  const raw = String(userId || "");
  const hex = crypto.createHash("sha256").update(raw).digest("hex");
  const digits = hex
    .replace(/[^0-9]/g, "")
    .padEnd(10, "0")
    .slice(0, 10);
  // 0으로 시작하면 안 좋아서 첫 자리는 9로 고정
  return `9${digits.slice(1)}`;
}

async function upsertUser({ key, name, referredByUserId }) {
  const email = emailOf(key);
  let user = await User.findOne({ email }).select("+password");

  if (!user) {
    user = new User({
      name,
      email,
      password: PASSWORD,
      role: "requestor",
      phoneNumber: "01099998888",
      phoneVerifiedAt: joinedAt,
      active: true,
      referredByUserId: referredByUserId || null,
      approvedAt: joinedAt,
    });
  } else {
    user.name = name;
    user.role = "requestor";
    user.active = true;
    user.phoneNumber = "01099998888";
    user.phoneVerifiedAt = joinedAt;
    user.referredByUserId = referredByUserId || null;
    user.approvedAt = joinedAt;
    if (PASSWORD) {
      user.password = PASSWORD;
    }
  }

  await user.save();

  await User.collection.updateOne(
    { _id: user._id },
    {
      $set: {
        approvedAt: joinedAt,
        createdAt: joinedAt,
        updatedAt: joinedAt,
        phoneVerifiedAt: joinedAt,
      },
    },
  );

  return await User.findById(user._id).select("-password").lean();
}

async function ensureOrganization({ user, key }) {
  const orgName = `E2E RP Org ${String(key).toUpperCase()}`;

  const businessNumber = makeBusinessNumberForUser(user._id);
  const buildUpsert = ({ withBusinessNumber }) => {
    const extracted = {
      companyName: orgName,
      ...(withBusinessNumber ? { businessNumber } : {}),
      representativeName: user.name,
      address: "E2E",
      phoneNumber: "01099998888",
      email: user.email,
      businessType: "E2E",
      businessItem: "E2E",
    };

    return RequestorOrganization.findOneAndUpdate(
      { owner: user._id, name: orgName },
      {
        $setOnInsert: {
          name: orgName,
          owner: user._id,
          owners: [],
          joinRequests: [],
          extracted,
        },
        $addToSet: { members: user._id },
        $set: {
          "verification.verified": true,
          "verification.provider": "E2E",
          "verification.checkedAt": joinedAt,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
  };

  let org;
  try {
    org = await buildUpsert({ withBusinessNumber: true });
  } catch (err) {
    const msg = String(err?.message || "");
    const code = err?.code;
    const isDup = code === 11000 || msg.includes("E11000");
    if (!isDup) throw err;
    // businessNumber unique 충돌이면 businessNumber 저장만 건너뛰고 진행
    org = await buildUpsert({ withBusinessNumber: false });
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        organizationId: org._id,
        organization: org.name,
      },
    },
  );

  return org;
}

async function upsertLedger({
  organizationId,
  userId,
  type,
  amount,
  uniqueKey,
  createdAt,
}) {
  // NOTE: CreditLedger는 timestamps가 켜져 있어 Mongoose updateOne 사용 시 updatedAt을 자동 갱신합니다.
  // 우리가 $setOnInsert.updatedAt까지 같이 넣으면 Mongo에서 "Updating the path 'updatedAt' would create a conflict"가 발생할 수 있어
  // native collection을 사용합니다.
  await CreditLedger.collection.updateOne(
    { uniqueKey },
    {
      $setOnInsert: {
        organizationId,
        userId: userId || null,
        type,
        amount,
        refType: "E2E_RP",
        refId: null,
        uniqueKey,
        createdAt: createdAt || now,
        updatedAt: createdAt || now,
      },
    },
    { upsert: true },
  );
}

function makeCaseInfos({ clinicName, patientName, tooth, idx }) {
  return {
    clinicName,
    patientName,
    tooth,
    implantManufacturer: "OSSTEM",
    implantSystem: `Regular${idx % 3}`,
    implantType: `Hex${idx % 2}`,
    workType: "abutment",
  };
}

function makeSeedRequestId({ prefix, key, idx }) {
  // NOTE: requestId는 unique index가 있어 null이면 중복 에러가 납니다.
  // seed는 Mongoose pre('save') 훅을 우회할 수 있으니 여기서 직접 생성합니다.
  const base = `E2E-RP-${String(prefix || "e2e.rp")}-${String(key)}-${String(
    idx,
  )}`;
  const rand = crypto.randomBytes(4).toString("hex");
  return `${base}-${rand}`;
}

async function seedCompletedRequests({ key, userId, orgId, count, baseDate }) {
  if (count <= 0) return;
  for (let i = 0; i < count; i += 1) {
    const createdAt = new Date(baseDate.getTime() + i * 60 * 60 * 1000);
    const clinicName = `E2E RP Clinic ${String(key).toUpperCase()}`;
    const patientName = `P${String(key).toUpperCase()}_${i}`;
    const tooth = String(11 + (i % 8));

    const requestId = makeSeedRequestId({ prefix: PREFIX, key, idx: i });
    const doc = {
      requestId,
      requestor: new mongoose.Types.ObjectId(String(userId)),
      requestorOrganizationId: new mongoose.Types.ObjectId(String(orgId)),
      caseInfos: {
        ...makeCaseInfos({ clinicName, patientName, tooth, idx: i }),
        reviewByStage: {
          shipping: {
            status: "APPROVED",
            updatedAt: createdAt,
            updatedBy: null,
            reason: "",
          },
        },
      },
      manufacturerStage: "추적관리",
      price: {
        amount: 15000,
        baseAmount: 15000,
        discountAmount: 0,
        currency: "KRW",
        rule: "volume_discount_last30days",
        quotedAt: createdAt,
      },
      createdAt,
      updatedAt: createdAt,
    };

    // insertMany 대신 upsert: seed 재실행 시에도 안정적으로 동작하도록
    await Request.collection.updateOne(
      { requestId },
      { $setOnInsert: doc },
      { upsert: true },
    );
  }
}

async function main() {
  await connectDb();
  try {
    const userByKey = new Map();

    for (const u of USERS) {
      userByKey.set(u.key, null);
    }

    // 1) 유저 생성/업데이트 (parent 없이)
    for (const u of USERS) {
      if (u.parent) continue;
      const user = await upsertUser({
        key: u.key,
        name: u.name,
        referredByUserId: null,
      });
      userByKey.set(u.key, user);
    }

    // 2) 추천 관계 반영
    for (const u of USERS) {
      if (!u.parent) continue;
      const parent = userByKey.get(u.parent);
      const user = await upsertUser({
        key: u.key,
        name: u.name,
        referredByUserId: parent?._id
          ? new mongoose.Types.ObjectId(String(parent._id))
          : null,
      });
      userByKey.set(u.key, user);
    }

    // 3) 조직 생성 + 크레딧 원장
    const orgByKey = new Map();
    for (const u of USERS) {
      const user = userByKey.get(u.key);
      const org = await ensureOrganization({ user, key: u.key });
      orgByKey.set(u.key, org);

      await upsertLedger({
        organizationId: org._id,
        userId: user._id,
        type: "CHARGE",
        amount: 3000000,
        uniqueKey: `e2e:rp:${PREFIX}:charge:${u.key}`,
        createdAt: joinedAt,
      });

      if (u.key === "a") {
        await upsertLedger({
          organizationId: org._id,
          userId: user._id,
          type: "SPEND",
          amount: -2900000,
          uniqueKey: `e2e:rp:${PREFIX}:spend:${u.key}:partial`,
          createdAt: new Date(joinedAt.getTime() + 20 * 24 * 60 * 60 * 1000),
        });
      } else if (u.key === "c") {
        await upsertLedger({
          organizationId: org._id,
          userId: user._id,
          type: "SPEND",
          amount: -500000,
          uniqueKey: `e2e:rp:${PREFIX}:spend:${u.key}:500k`,
          createdAt: new Date(joinedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
        });
        await upsertLedger({
          organizationId: org._id,
          userId: user._id,
          type: "ADJUST",
          amount: -2500000,
          uniqueKey: `e2e:rp:${PREFIX}:refund_to_zero:${u.key}`,
          createdAt: new Date(joinedAt.getTime() + 31 * 24 * 60 * 60 * 1000),
        });
      } else {
        await upsertLedger({
          organizationId: org._id,
          userId: user._id,
          type: "SPEND",
          amount: -3000000,
          uniqueKey: `e2e:rp:${PREFIX}:spend:${u.key}:full`,
          createdAt: new Date(joinedAt.getTime() + 40 * 24 * 60 * 60 * 1000),
        });
      }
    }

    // 4) 최근 30일 완료 의뢰(가격/리퍼럴 통계용)
    const baseDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const counts = {
      a: 30,
      b: 10,
      c: 10,
      d: 5,
      e: 5,
      f: 5,
    };

    for (const key of Object.keys(counts)) {
      const user = userByKey.get(key);
      const org = orgByKey.get(key);
      await seedCompletedRequests({
        key,
        userId: user._id,
        orgId: org._id,
        count: counts[key],
        baseDate,
      });
    }

    console.log("[db] e2e referral-pricing seed done", {
      prefix: PREFIX,
      password: PASSWORD,
      joinedAt,
      users: USERS.map((u) => ({
        key: u.key,
        email: emailOf(u.key),
        userId: String(userByKey.get(u.key)?._id || ""),
        organizationId: String(orgByKey.get(u.key)?._id || ""),
        referredBy: u.parent,
      })),
    });
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error("[db] e2e referral-pricing seed failed", err);
  process.exit(1);
});
