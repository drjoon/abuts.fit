import { clearAllCollections, connectDb, disconnectDb } from "./_mongo.js";
import Connection from "../../models/connection.model.js";
import FilenameRule from "../../models/filenameRule.model.js";
import SystemSettings from "../../models/systemSettings.model.js";
import User from "../../models/user.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import ImplantPreset from "../../models/implantPreset.model.js";
import ClinicImplantPreset from "../../models/clinicImplantPreset.model.js";
import { CONNECTIONS_SEED } from "./data/connections.seed.js";
import { FILENAME_RULES_SEED } from "./data/filenameRules.seed.js";

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

  await Connection.bulkWrite(
    CONNECTIONS_SEED.map((c) => ({
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
    FILENAME_RULES_SEED.map((r) => ({
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

async function seedExtraRequestorsAndSalesmen() {
  const NOW = new Date();

  // 짧고 로그인 친화적인 비밀번호 (정책 충족: 10자, 특수문자 포함)
  const REQUESTOR_PW = "Rq!1111111"; // length 10
  const SALESMAN_PW = "Sa!1111111"; // length 10

  const requestors = [];
  const salesmen = [];

  // 의뢰자: 5개 조직(owner+staff) = 10명
  for (let i = 1; i <= 5; i += 1) {
    const orgName = `demo-org-${i}`;
    const ownerEmail = `req${i}.owner@demo.abuts.fit`;
    const staffEmail = `req${i}.staff@demo.abuts.fit`;
    const ownerReferral = `RQ${i}AA`;
    const staffReferral = `RQ${i}BB`;

    const owner = await User.create({
      name: `데모 의뢰자${i} 대표`,
      email: ownerEmail,
      password: REQUESTOR_PW,
      role: "requestor",
      requestorRole: "owner",
      organization: orgName,
      referralCode: ownerReferral,
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

    const staff = await User.create({
      name: `데모 의뢰자${i} 직원`,
      email: staffEmail,
      password: REQUESTOR_PW,
      role: "requestor",
      requestorRole: "staff",
      organization: orgName,
      organizationId: org._id,
      referralCode: staffReferral,
      referredByUserId: owner._id,
      referralGroupLeaderId: owner._id,
      approvedAt: NOW,
      active: true,
    });

    await RequestorOrganization.updateOne(
      { _id: org._id },
      { $addToSet: { members: { $each: [owner._id, staff._id] } } },
    );

    requestors.push({
      ownerEmail,
      staffEmail,
      password: REQUESTOR_PW,
      ownerReferral,
      staffReferral,
      orgId: String(org._id),
    });
  }

  // 영업자: 10명, 체인형 추천 관계 (1번이 2번 추천, 2번이 3번 추천 ...)
  let prevSalesman = null;
  for (let i = 1; i <= 10; i += 1) {
    const email = `sales${i}@demo.abuts.fit`;
    const referralCode = `SA${String(i).padStart(2, "0")}`; // 4자리 base36-ish (SA00..)

    const salesman = await User.create({
      name: `데모 영업자${i}`,
      email,
      password: SALESMAN_PW,
      role: "salesman",
      referralCode,
      referredByUserId: prevSalesman?._id || null,
      referralGroupLeaderId: prevSalesman?._id || null,
      approvedAt: NOW,
      active: true,
    });

    salesmen.push({
      email,
      password: SALESMAN_PW,
      referralCode,
      referredBy: prevSalesman ? String(prevSalesman._id) : null,
    });

    prevSalesman = salesman;
  }

  return { requestors, salesmen };
}

async function seedMorePatterns() {
  const NOW = new Date();

  const REQUESTOR_PW = "Rq!1111111"; // 10자, 특수문자 포함
  const SALESMAN_PW = "Sa!1111111"; // 10자, 특수문자 포함

  const requestors = [];
  const salesmen = [];

  // 새 의뢰자 20명: 10개 조직(owner+staff).
  // 패턴: 짝수 org owner는 직전 org owner가 추천, 홀수 org owner는 영업자 체인 첫 번째(sales1) 추천.
  for (let i = 6; i <= 15; i += 1) {
    const orgName = `demo-org-${i}`;
    const ownerEmail = `req${i}.owner@demo.abuts.fit`;
    const staffEmail = `req${i}.staff@demo.abuts.fit`;
    const ownerReferral = `RQ${i}CC`; // 5자리 base36
    const staffReferral = `RQ${i}DD`;

    // 추천인 결정
    let referredByUserId = null;
    if (i % 2 === 0) {
      // 직전 org owner
      const prevOwner = await User.findOne({
        email: `req${i - 1}.owner@demo.abuts.fit`,
      })
        .select({ _id: 1 })
        .lean();
      referredByUserId = prevOwner?._id || null;
    } else {
      const sales1 = await User.findOne({ email: "sales1@demo.abuts.fit" })
        .select({ _id: 1 })
        .lean();
      referredByUserId = sales1?._id || null;
    }

    const owner = await User.create({
      name: `추가 의뢰자${i} 대표`,
      email: ownerEmail,
      password: REQUESTOR_PW,
      role: "requestor",
      requestorRole: "owner",
      organization: orgName,
      referralCode: ownerReferral,
      referredByUserId,
      referralGroupLeaderId: referredByUserId,
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

    const staff = await User.create({
      name: `추가 의뢰자${i} 직원`,
      email: staffEmail,
      password: REQUESTOR_PW,
      role: "requestor",
      requestorRole: "staff",
      organization: orgName,
      organizationId: org._id,
      referralCode: staffReferral,
      referredByUserId: owner._id,
      referralGroupLeaderId: owner._id,
      approvedAt: NOW,
      active: true,
    });

    await RequestorOrganization.updateOne(
      { _id: org._id },
      { $addToSet: { members: { $each: [owner._id, staff._id] } } },
    );

    requestors.push({
      ownerEmail,
      staffEmail,
      password: REQUESTOR_PW,
      ownerReferral,
      staffReferral,
      orgId: String(org._id),
      referredByUserId: referredByUserId ? String(referredByUserId) : null,
    });
  }

  // 추가 영업자 20명: emails sales11~sales30
  // 패턴 1: sales11~sales15는 sales1이 추천 (팬아웃)
  for (let i = 11; i <= 15; i += 1) {
    const email = `sales${i}@demo.abuts.fit`;
    const referralCode = `SB${String(i).padStart(2, "0")}`;
    const parent = await User.findOne({ email: "sales1@demo.abuts.fit" })
      .select({ _id: 1 })
      .lean();
    const salesman = await User.create({
      name: `추가 영업자${i}`,
      email,
      password: SALESMAN_PW,
      role: "salesman",
      referralCode,
      referredByUserId: parent?._id || null,
      referralGroupLeaderId: parent?._id || null,
      approvedAt: NOW,
      active: true,
    });
    salesmen.push({
      email,
      password: SALESMAN_PW,
      referralCode,
      referredBy: parent ? String(parent._id) : null,
    });
  }

  // 패턴 2: sales16~sales20는 직렬 체인 (sales11 -> 12 -> ... -> 20)
  let prev = await User.findOne({ email: "sales11@demo.abuts.fit" })
    .select({ _id: 1 })
    .lean();
  for (let i = 16; i <= 20; i += 1) {
    const email = `sales${i}@demo.abuts.fit`;
    const referralCode = `SB${String(i).padStart(2, "0")}`;
    const salesman = await User.create({
      name: `추가 영업자${i}`,
      email,
      password: SALESMAN_PW,
      role: "salesman",
      referralCode,
      referredByUserId: prev?._id || null,
      referralGroupLeaderId: prev?._id || null,
      approvedAt: NOW,
      active: true,
    });
    salesmen.push({
      email,
      password: SALESMAN_PW,
      referralCode,
      referredBy: prev ? String(prev._id) : null,
    });
    prev = salesman;
  }

  // 패턴 3: sales21~sales30는 requestor 소유 조직과 교차(의뢰자 대표가 추천인 역할)
  for (let i = 21; i <= 30; i += 1) {
    const email = `sales${i}@demo.abuts.fit`;
    const referralCode = `SB${String(i).padStart(2, "0")}`;
    // 추천인은 demo-org-(i-15) 의 대표를 사용 (6~15 범위)
    const refOrgIdx = i - 15;
    const ref = await User.findOne({
      email: `req${refOrgIdx}.owner@demo.abuts.fit`,
    })
      .select({ _id: 1 })
      .lean();
    const salesman = await User.create({
      name: `추가 영업자${i}`,
      email,
      password: SALESMAN_PW,
      role: "salesman",
      referralCode,
      referredByUserId: ref?._id || null,
      referralGroupLeaderId: ref?._id || null,
      approvedAt: NOW,
      active: true,
    });
    salesmen.push({
      email,
      password: SALESMAN_PW,
      referralCode,
      referredBy: ref ? String(ref._id) : null,
    });
  }

  return { requestors, salesmen };
}

async function run() {
  try {
    await connectDb();
    await clearAllCollections();
    await seedCore();
    const seeded = await seedDev();
    const extra = await seedExtraRequestorsAndSalesmen();
    const extra2 = await seedMorePatterns();

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
      requestorExtras: extra.requestors,
      salesmanExtras: extra.salesmen,
      requestorExtras2: extra2.requestors,
      salesmanExtras2: extra2.salesmen,
    });
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error("[db] reset+seed failed", err);
  process.exit(1);
});
