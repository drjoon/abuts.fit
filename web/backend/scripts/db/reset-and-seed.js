import { clearAllCollections, connectDb, disconnectDb } from "./_mongo.js";
import Connection from "../../models/connection.model.js";
import FilenameRule from "../../models/filenameRule.model.js";
import { CONNECTIONS_SEED as CONNECTIONS_SEED_RAW } from "./data/connections.seed.js";
import { FILENAME_RULES_SEED as FILENAME_RULES_SEED_RAW } from "./data/filenameRules.seed.js";
import SystemSettings from "../../models/systemSettings.model.js";
import User from "../../models/user.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import ImplantPreset from "../../models/implantPreset.model.js";
import ClinicImplantPreset from "../../models/clinicImplantPreset.model.js";
import Request from "../../models/request.model.js";
import crypto from "crypto";

const NOW = new Date();

async function ensureSystemSettings() {
  await SystemSettings.findOneAndUpdate(
    { key: "global" },
    { $setOnInsert: { key: "global" } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
}

async function seedCore() {
  await ensureSystemSettings();

  const connectionsSeed = Array.isArray(CONNECTIONS_SEED_RAW)
    ? CONNECTIONS_SEED_RAW
    : [];
  const filenameRulesSeed = Array.isArray(FILENAME_RULES_SEED_RAW)
    ? FILENAME_RULES_SEED_RAW
    : [];

  await Connection.bulkWrite(
    connectionsSeed.map((c) => ({
      updateOne: {
        filter: {
          manufacturer: c.manufacturer,
          system: c.system,
          type: c.type,
          category: c.category,
        },
        update: c,
        upsert: true,
      },
    })),
    { ordered: false },
  );

  await FilenameRule.bulkWrite(
    filenameRulesSeed.map((r) => ({
      updateOne: {
        filter: { ruleId: r.ruleId },
        update: r,
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

async function seedDev() {
  const passwords = {
    requestorOwner: "Rq!8zY#4fQ@7nC5$",
    requestorStaff: "Rs!9xT#5gA@6mD4$",
    manufacturerOwner: "Mo!7vL#6pR@3sB8$",
    manufacturerStaff: "Ms!5kP#8wQ@2nZ7$",
    adminOwner: "Ao!6fN#9rV@4cH2$",
    adminStaff: "As!4mJ#7tK@9pW3$",
  };

  const requestorOwnerEmail = "requestor.owner@demo.abuts.fit";
  const requestorOwner = await User.create({
    name: "데모 의뢰자 대표",
    email: requestorOwnerEmail,
    password: passwords.requestorOwner,
    role: "requestor",
    requestorRole: "owner",
    phoneNumber: "01000000001",
    organization: "데모기공소",
    referralCode: "seed_requestor_owner",
    approvedAt: NOW,
    active: true,
  });

  const org = await RequestorOrganization.create({
    name: "데모기공소",
    owner: requestorOwner._id,
    owners: [],
    members: [requestorOwner._id],
    joinRequests: [],
  });

  await User.updateOne(
    { _id: requestorOwner._id },
    { $set: { organizationId: org._id, organization: org.name } },
  );

  const requestorStaff = await User.create({
    name: "데모 의뢰자 직원",
    email: "requestor.staff@demo.abuts.fit",
    password: passwords.requestorStaff,
    role: "requestor",
    requestorRole: "staff",
    phoneNumber: "01000000002",
    organization: "",
    referralCode: "seed_requestor_staff",
    approvedAt: NOW,
    active: true,
    organizationId: org._id,
  });

  await RequestorOrganization.updateOne(
    { _id: org._id },
    {
      $addToSet: {
        members: { $each: [requestorOwner._id, requestorStaff._id] },
      },
    },
  );

  const manufacturerOwner = await User.create({
    name: "데모 제조사 대표",
    email: "manufacturer.owner@demo.abuts.fit",
    password: passwords.manufacturerOwner,
    role: "manufacturer",
    manufacturerRole: "owner",
    phoneNumber: "01000000003",
    organization: "애크로덴트",
    referralCode: "seed_manufacturer_owner",
    approvedAt: NOW,
    active: true,
  });

  const manufacturerStaff = await User.create({
    name: "데모 제조사 직원",
    email: "manufacturer.staff@demo.abuts.fit",
    password: passwords.manufacturerStaff,
    role: "manufacturer",
    manufacturerRole: "staff",
    phoneNumber: "01000000005",
    organization: "애크로덴트",
    referralCode: "seed_manufacturer_staff",
    approvedAt: NOW,
    active: true,
  });

  const adminOwner = await User.create({
    name: "데모 관리자 대표",
    email: "admin.owner@demo.abuts.fit",
    password: passwords.adminOwner,
    role: "admin",
    adminRole: "owner",
    phoneNumber: "01000000004",
    organization: "어벗츠핏",
    referralCode: "seed_admin_owner",
    approvedAt: NOW,
    active: true,
  });

  const adminStaff = await User.create({
    name: "데모 관리자 직원",
    email: "admin.staff@demo.abuts.fit",
    password: passwords.adminStaff,
    role: "admin",
    adminRole: "staff",
    phoneNumber: "01000000006",
    organization: "어벗츠핏",
    referralCode: "seed_admin_staff",
    approvedAt: NOW,
    active: true,
  });

  await CreditLedger.create({
    organizationId: org._id,
    userId: requestorOwner._id,
    type: "CHARGE",
    amount: 500000,
    refType: "SEED_DEV",
    refId: null,
    uniqueKey: "seed:dev:credit:initial",
  });

  await ImplantPreset.findOneAndUpdate(
    {
      requestor: requestorOwner._id,
      clinicName: "데모치과",
      patientName: "홍길동",
      tooth: "11",
    },
    {
      $set: {
        requestor: requestorOwner._id,
        clinicName: "데모치과",
        patientName: "홍길동",
        tooth: "11",
        manufacturer: "OSSTEM",
        system: "Regular",
        type: "Hex",
        lastUsedAt: NOW,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await ClinicImplantPreset.findOneAndUpdate(
    {
      requestor: requestorOwner._id,
      clinicName: "데모치과",
      manufacturer: "OSSTEM",
      system: "Regular",
      type: "Hex",
    },
    {
      $setOnInsert: {
        requestor: requestorOwner._id,
        clinicName: "데모치과",
        manufacturer: "OSSTEM",
        system: "Regular",
        type: "Hex",
        useCount: 1,
      },
      $set: { lastUsedAt: NOW },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return {
    org,
    requestorOwner,
    requestorStaff,
    manufacturerOwner,
    manufacturerStaff,
    adminOwner,
    adminStaff,
    passwords,
  };
}
function randomReferralCode(len = 5) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seedBulkUsersAndData() {
  const NOW = new Date();
  const REQUESTOR_PW = "Abc!1234";
  const SALESMAN_PW = "Abc!1234";

  const requestors = [];
  const salesmen = [];

  // 영업자 20명 s001~s020 (리퍼럴 코드 4자리)
  for (let i = 1; i <= 20; i += 1) {
    const email = `s${String(i).padStart(3, "0")}@gmail.com`;
    const referralCode = randomReferralCode(4);
    const parentId = salesmen.length ? pick(salesmen).id : null;
    const leaderId = parentId;

    const salesman = await User.create({
      name: `데모 영업자${i}`,
      email,
      password: SALESMAN_PW,
      role: "salesman",
      referralCode,
      referredByUserId: parentId,
      referralGroupLeaderId: leaderId,
      approvedAt: NOW,
      active: true,
    });

    salesmen.push({ id: salesman._id, email });
  }

  // 의뢰자 100명 r001~r100, 조직 100개(owner만)
  const depositOptions = [500_000, 1_000_000, 2_000_000, 3_000_000];
  for (let i = 1; i <= 100; i += 1) {
    const email = `r${String(i).padStart(3, "0")}@gmail.com`;
    const orgName = `org-${String(i).padStart(3, "0")}`;
    const referralCode = randomReferralCode();
    const parent = pick([...salesmen, ...requestors].filter(Boolean)) || null;
    const parentId = parent ? parent.id : null;

    const owner = await User.create({
      name: `의뢰자 ${i}`,
      email,
      password: REQUESTOR_PW,
      role: "requestor",
      requestorRole: "owner",
      organization: orgName,
      referralCode,
      referredByUserId: parentId,
      referralGroupLeaderId: parentId,
      approvedAt: NOW,
      active: true,
    });

    const org = await RequestorOrganization.create({
      name: orgName,
      owner: owner._id,
      owners: [],
      members: [owner._id],
      joinRequests: [],
    });

    await User.updateOne(
      { _id: owner._id },
      { $set: { organizationId: org._id, organization: org.name } },
    );

    requestors.push({ id: owner._id, email, orgId: org._id });

    // 입금: 무작위 금액
    const amount = pick(depositOptions);
    await CreditLedger.create({
      organizationId: org._id,
      userId: owner._id,
      type: "CHARGE",
      amount,
      refType: "SEED_DEPOSIT",
      refId: null,
      uniqueKey: `seed:deposit:${email}:${amount}`,
    });

    // 지난 6개월 의뢰: 랜덤 건수/금액
    const requestCount = randInt(1, 8);
    for (let k = 0; k < requestCount; k += 1) {
      const monthsAgo = randInt(0, 5);
      const createdAt = new Date();
      createdAt.setMonth(createdAt.getMonth() - monthsAgo);
      const price = pick([120000, 150000, 180000, 200000, 250000]);

      await Request.create({
        requestorOrganizationId: org._id,
        requestor: owner._id,
        manufacturer: null,
        caseInfos: {
          clinicName: "seed 치과",
          patientName: `환자${i}-${k}`,
          tooth: "11",
          implantManufacturer: "OSSTEM",
          implantSystem: "Regular",
          implantType: "Hex",
        },
        status: "발송",
        price: {
          amount: price,
          baseAmount: price,
          discountAmount: 0,
          currency: "KRW",
          rule: "seed",
        },
        createdAt,
        updatedAt: createdAt,
      });
    }
  }

  return { requestors, salesmen };
}

async function run() {
  try {
    await connectDb();
    await clearAllCollections();
    await seedCore();
    const seeded = await seedDev();
    const bulk = await seedBulkUsersAndData();

    console.log("[db] reset + seed done", {
      requestorOwner: {
        email: "requestor.owner@demo.abuts.fit",
        password: seeded.passwords.requestorOwner,
        userId: String(seeded.requestorOwner._id),
        organizationId: String(seeded.org._id),
      },
      requestorStaff: {
        email: "requestor.staff@demo.abuts.fit",
        password: seeded.passwords.requestorStaff,
        userId: String(seeded.requestorStaff._id),
        organizationId: String(seeded.org._id),
      },
      manufacturerOwner: {
        email: "manufacturer.owner@demo.abuts.fit",
        password: seeded.passwords.manufacturerOwner,
        userId: String(seeded.manufacturerOwner._id),
      },
      manufacturerStaff: {
        email: "manufacturer.staff@demo.abuts.fit",
        password: seeded.passwords.manufacturerStaff,
        userId: String(seeded.manufacturerStaff._id),
      },
      adminOwner: {
        email: "admin.owner@demo.abuts.fit",
        password: seeded.passwords.adminOwner,
        userId: String(seeded.adminOwner._id),
      },
      adminStaff: {
        email: "admin.staff@demo.abuts.fit",
        password: seeded.passwords.adminStaff,
        userId: String(seeded.adminStaff._id),
      },
      requestorExtras: bulk.requestors,
      salesmanExtras: bulk.salesmen,
    });
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error("[db] reset+seed failed", err);
  process.exit(1);
});
