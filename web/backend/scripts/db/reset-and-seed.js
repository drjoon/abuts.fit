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
import ShippingPackage from "../../models/shippingPackage.model.js";
import SalesmanLedger from "../../models/salesmanLedger.model.js";
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
    referredByUserId: requestorOwner._id,
    referralGroupLeaderId: requestorOwner._id,
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

function toKstYmd(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const kst = new Date(dt.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function seedBulkUsersAndData() {
  const NOW = new Date();
  const REQUESTOR_PW = "Abc!1234";
  const SALESMAN_PW = "Abc!1234";

  const requestors = [];
  const salesmen = [];

  const salesmanRoots = [];

  // 영업자 20명 s001~s020 (리퍼럴 코드 4자리)
  // - 루트(미소개) 여러 명 생성해서 영업자 그룹이 여러 개 나오도록 구성
  // - 일부는 다른 영업자가 소개
  const ROOT_COUNT = 5;
  for (let i = 1; i <= 20; i += 1) {
    const email = `s${String(i).padStart(3, "0")}@gmail.com`;
    const referralCode = randomReferralCode(4);

    let referredByUserId = null;
    let referralGroupLeaderId = null;

    const isRoot = i <= ROOT_COUNT;
    const isUnreferred = !isRoot && Math.random() < 0.1;
    if (!isRoot && !isUnreferred) {
      const root = salesmanRoots.length ? pick(salesmanRoots) : null;
      const candidates = salesmen.filter(
        (s) => String(s.leaderId) === String(root?.id),
      );
      const parent = candidates.length ? pick(candidates) : pick(salesmen);
      referredByUserId = parent?.id || null;
      referralGroupLeaderId =
        root?.id || parent?.leaderId || parent?.id || null;
    }

    const salesman = await User.create({
      name: `데모 영업자${i}`,
      email,
      password: SALESMAN_PW,
      role: "salesman",
      referralCode,
      referredByUserId,
      referralGroupLeaderId,
      approvedAt: NOW,
      active: true,
    });

    const leaderId = referralGroupLeaderId || salesman._id;
    const row = { id: salesman._id, email, leaderId };
    salesmen.push(row);
    if (isRoot) salesmanRoots.push({ id: salesman._id, email });
  }

  // 의뢰자 100명 r001~r100, 조직 100개(owner만)
  // 크레딧 사용(의뢰 완료 + SPEND)이 충분히 발생하도록 충전액 상향
  for (let i = 1; i <= 100; i += 1) {
    const email = `r${String(i).padStart(3, "0")}@gmail.com`;
    const orgName = `org-${String(i).padStart(3, "0")}`;
    const referralCode = randomReferralCode();

    // 소개 관계 다양화
    // - 20%: 미소개
    // - 50%: 영업자 소개
    // - 30%: 의뢰자 소개
    let parentId = null;
    const roll = Math.random();
    if (roll < 0.1) {
      parentId = null;
    } else if (roll < 0.6) {
      parentId = salesmen.length ? pick(salesmen).id : null;
    } else {
      parentId = requestors.length ? pick(requestors).id : null;
    }

    const approvedDaysAgo = randInt(0, 180);
    const approvedAt = new Date(NOW);
    approvedAt.setDate(approvedAt.getDate() - approvedDaysAgo);

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
      approvedAt,
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
    const depositAmount = randInt(1, 10) * 500_000;
    await CreditLedger.create({
      organizationId: org._id,
      userId: owner._id,
      type: "CHARGE",
      amount: depositAmount,
      refType: "SEED_DEPOSIT",
      refId: null,
      uniqueKey: `seed:charge:${email}`,
    });

    await CreditLedger.create({
      organizationId: org._id,
      userId: owner._id,
      type: "BONUS",
      amount: 50_000,
      refType: "SEED_BONUS",
      refId: null,
      uniqueKey: `seed:bonus:${email}`,
    });

    // 의뢰자 1명당 주문 5~20건, 그 중 80% 완료
    let remainingCredit = depositAmount;

    const requestCount = randInt(5, 20);
    const completedRequestIds = [];
    for (let k = 0; k < requestCount; k += 1) {
      const daysAgo = randInt(0, 180);
      const createdAt = new Date(NOW);
      createdAt.setDate(createdAt.getDate() - daysAgo);

      const fixedUntil = new Date(approvedAt);
      fixedUntil.setDate(fixedUntil.getDate() + 90);

      // 가입 이벤트(90일) 구간은 10,000원 고정
      const price = createdAt < fixedUntil ? 10000 : randInt(10000, 11000);
      const isCompleted = Math.random() < 0.8;
      const status = isCompleted
        ? "완료"
        : pick(["의뢰", "CAM", "가공", "세척.포장", "발송", "추적관리"]);
      const reqDoc = await Request.create({
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
        status,
        ...(isCompleted
          ? {
              price: {
                amount: price,
                baseAmount: price,
                discountAmount: 0,
                currency: "KRW",
                rule: "seed",
              },
            }
          : {}),
        createdAt,
        updatedAt: createdAt,
      });

      if (isCompleted && remainingCredit >= price) {
        remainingCredit -= price;
        await CreditLedger.create({
          organizationId: org._id,
          userId: owner._id,
          type: "SPEND",
          amount: -price,
          refType: "SEED_REQUEST",
          refId: reqDoc._id,
          uniqueKey: `seed:spend:${email}:${String(reqDoc._id)}`,
        });
        completedRequestIds.push(reqDoc._id);
      }

      if (isCompleted && parentId) {
        const parentUser = salesmen.find(
          (s) => String(s.id) === String(parentId),
        );
        if (parentUser) {
          const earnAmount = Math.round(price * 0.05);
          if (earnAmount > 0) {
            await SalesmanLedger.create({
              salesmanId: parentId,
              type: "EARN",
              amount: earnAmount,
              refType: "SEED_REQUEST",
              refId: reqDoc._id,
              uniqueKey: `seed:salesman:earn:${String(parentId)}:${String(reqDoc._id)}`,
            });
          }
        }
      }
    }

    // 배송 패키지: 완료 주문들을 3~20개씩 묶어서 생성(패키지 1개당 배송비 3500)
    if (completedRequestIds.length > 0) {
      const sortedIds = [...completedRequestIds];
      let cursor = 0;
      let pkgIdx = 0;
      while (cursor < sortedIds.length) {
        const chunkSize = Math.min(
          randInt(3, 20),
          Math.max(1, sortedIds.length - cursor),
        );
        const chunk = sortedIds.slice(cursor, cursor + chunkSize);
        cursor += chunkSize;
        pkgIdx += 1;

        const shipDate = new Date(NOW);
        // 패키지마다 다른 날짜 보장: pkgIdx 기반 offset + 랜덤
        shipDate.setDate(shipDate.getDate() - pkgIdx - randInt(0, 5));
        // unique key: YMD + 패키지 인덱스 (index 충돌 방지)
        const shipDateYmd = `${toKstYmd(shipDate)}-p${pkgIdx}`;

        const pkg = await ShippingPackage.create({
          organizationId: org._id,
          shipDateYmd,
          requestIds: chunk,
          shippingFeeSupply: 3500,
          shippingFeeVat: 0,
          createdBy: owner._id,
          createdAt: shipDate,
          updatedAt: shipDate,
        });

        await Request.updateMany(
          { _id: { $in: chunk } },
          { $set: { shippingPackageId: pkg._id } },
        );
      }
    }
  }

  // 일부 영업자 랜덤 정산(PAYOUT)
  for (const s of salesmen) {
    if (Math.random() < 0.35) {
      const earned = await SalesmanLedger.aggregate([
        { $match: { salesmanId: s.id, type: "EARN" } },
        { $group: { _id: "$salesmanId", total: { $sum: "$amount" } } },
      ]);
      const totalEarned = Number(earned?.[0]?.total || 0);
      if (totalEarned > 0) {
        const payout = Math.round(totalEarned * (0.3 + Math.random() * 0.4));
        if (payout > 0) {
          await SalesmanLedger.create({
            salesmanId: s.id,
            type: "PAYOUT",
            amount: payout,
            refType: "SEED_PAYOUT",
            refId: null,
            uniqueKey: `seed:salesman:payout:${String(s.id)}`,
          });
        }
      }
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
