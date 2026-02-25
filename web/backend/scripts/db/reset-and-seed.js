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

  const requestorOrg = await RequestorOrganization.create({
    organizationType: "requestor",
    name: "데모기공소",
    owner: requestorOwner._id,
    owners: [],
    members: [requestorOwner._id],
    joinRequests: [],
    extracted: {
      companyName: "데모기공소",
      representativeName: "데모 의뢰자 대표",
      businessNumber: "111-11-11111",
      phoneNumber: "02-0000-0001",
      email: requestorOwnerEmail,
      address: "서울특별시 중구 세종대로 1",
    },
  });

  await User.updateOne(
    { _id: requestorOwner._id },
    {
      $set: {
        organizationId: requestorOrg._id,
        organization: requestorOrg.name,
      },
    },
  );

  const requestorStaff = await User.create({
    name: "데모 의뢰자 직원",
    email: "requestor.staff@demo.abuts.fit",
    password: passwords.requestorStaff,
    role: "requestor",
    requestorRole: "staff",
    phoneNumber: "01000000002",
    organization: requestorOrg.name,
    referralCode: "seed_requestor_staff",
    approvedAt: NOW,
    active: true,
    organizationId: requestorOrg._id,
    referredByUserId: requestorOwner._id,
    referralGroupLeaderId: requestorOwner._id,
  });

  await RequestorOrganization.updateOne(
    { _id: requestorOrg._id },
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

  const manufacturerOrg = await RequestorOrganization.create({
    organizationType: "manufacturer",
    name: "애크로덴트",
    owner: manufacturerOwner._id,
    owners: [],
    members: [manufacturerOwner._id],
    joinRequests: [],
    extracted: {
      companyName: "애크로덴트",
      representativeName: "데모 제조사 대표",
      businessNumber: "222-22-22222",
      phoneNumber: "031-000-0003",
      email: "manufacturer.owner@demo.abuts.fit",
      address: "경기도 성남시 분당구 판교역로 1",
    },
  });

  await User.updateOne(
    { _id: manufacturerOwner._id },
    {
      $set: {
        organizationId: manufacturerOrg._id,
        organization: manufacturerOrg.name,
      },
    },
  );

  const manufacturerStaff = await User.create({
    name: "데모 제조사 직원",
    email: "manufacturer.staff@demo.abuts.fit",
    password: passwords.manufacturerStaff,
    role: "manufacturer",
    manufacturerRole: "staff",
    phoneNumber: "01000000005",
    organization: manufacturerOrg.name,
    referralCode: "seed_manufacturer_staff",
    approvedAt: NOW,
    active: true,
    organizationId: manufacturerOrg._id,
  });

  await RequestorOrganization.updateOne(
    { _id: manufacturerOrg._id },
    { $addToSet: { members: manufacturerStaff._id } },
  );

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

  const adminOrg = await RequestorOrganization.create({
    organizationType: "requestor",
    name: "어벗츠핏",
    owner: adminOwner._id,
    owners: [],
    members: [adminOwner._id],
    joinRequests: [],
    extracted: {
      companyName: "어벗츠핏",
      representativeName: "데모 관리자 대표",
      businessNumber: "333-33-33333",
      phoneNumber: "02-0000-0004",
      email: "admin.owner@demo.abuts.fit",
      address: "서울특별시 강남구 테헤란로 1",
    },
  });

  await User.updateOne(
    { _id: adminOwner._id },
    {
      $set: { organizationId: adminOrg._id, organization: adminOrg.name },
    },
  );

  const adminStaff = await User.create({
    name: "데모 관리자 직원",
    email: "admin.staff@demo.abuts.fit",
    password: passwords.adminStaff,
    role: "admin",
    adminRole: "staff",
    phoneNumber: "01000000006",
    organization: adminOrg.name,
    referralCode: "seed_admin_staff",
    approvedAt: NOW,
    active: true,
    organizationId: adminOrg._id,
  });

  await RequestorOrganization.updateOne(
    { _id: adminOrg._id },
    { $addToSet: { members: adminStaff._id } },
  );

  await CreditLedger.create({
    organizationId: requestorOrg._id,
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
    org: requestorOrg,
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
  const BULK_NOW = new Date();
  const REQUESTOR_PW = "Abc!1234";
  const SALESMAN_PW = "Abc!1234";
  const LAST_N_DAYS = 20;
  const REQUEST_COUNT_RANGE = { min: 20, max: 50 };
  const REQUESTOR_COUNT = 20;
  const SALES_INTRO_PARENTS = [
    "s001@gmail.com",
    "s001@gmail.com",
    "s004@gmail.com",
    "s004@gmail.com",
    "s006@gmail.com",
    "s006@gmail.com",
    "s009@gmail.com",
    "s009@gmail.com",
  ];
  const REQUESTOR_INTRO_PARENTS = [
    "r001@gmail.com",
    "r002@gmail.com",
    "r003@gmail.com",
    "r004@gmail.com",
    "r001@gmail.com",
    "r002@gmail.com",
    "r003@gmail.com",
    "r004@gmail.com",
  ];

  const requestors = []; // owner만 (추천인 후보)
  const salesmen = [];
  const salesmanRoots = [];
  const ROOT_COUNT = 3;

  // 영업자 10명 s001~s010 (리퍼럴 코드 4자리, 의뢰자보다 먼저 생성해 추천 관계 성립)
  const SALESMAN_COUNT = 10;
  for (let i = 1; i <= SALESMAN_COUNT; i += 1) {
    const email = `s${String(i).padStart(3, "0")}@gmail.com`;
    const referralCode = randomReferralCode(4);
    let referredByUserId = null;
    let referralGroupLeaderId = null;
    const isRoot = i <= ROOT_COUNT;
    // root(1~3)은 미소개. 나머지는 기본적으로 소개 관계를 만들되, 일부만 미소개로 남김
    const isUnreferred = !isRoot && i !== 4 && Math.random() < 0.2;
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
      approvedAt: BULK_NOW,
      active: true,
    });
    const leaderId = referralGroupLeaderId || salesman._id;
    salesmen.push({
      id: salesman._id,
      email,
      leaderId,
      parentId: referredByUserId,
    });
    if (isRoot) salesmanRoots.push({ id: salesman._id, email });
  }

  // 의뢰자 20계정 r001~r020, 계정당 1조직(staff 없음), 의뢰 20~50건, 최근 20일 내 생성
  for (let i = 1; i <= REQUESTOR_COUNT; i += 1) {
    const email = `r${String(i).padStart(3, "0")}@gmail.com`;
    const orgName = `org-${String(i).padStart(3, "0")}`;
    const referralCode = randomReferralCode();

    // 소개 관계: 고정 배정 (간접 수수료 / requestor-to-requestor 리퍼럴 검증)
    let parentId = null;
    let referralGroupLeaderId = null;
    if (i <= SALES_INTRO_PARENTS.length) {
      const parentEmail = SALES_INTRO_PARENTS[i - 1];
      const parentSalesman = salesmen.find((s) => s.email === parentEmail);
      if (parentSalesman) {
        parentId = parentSalesman.id;
        referralGroupLeaderId = parentSalesman.leaderId || parentSalesman.id;
      }
    } else if (
      i <=
      SALES_INTRO_PARENTS.length + REQUESTOR_INTRO_PARENTS.length
    ) {
      const parentEmail =
        REQUESTOR_INTRO_PARENTS[i - SALES_INTRO_PARENTS.length - 1];
      const parentRequestor = requestors.find((r) => r.email === parentEmail);
      if (parentRequestor) {
        parentId = parentRequestor.id;
        referralGroupLeaderId = parentRequestor.leaderId || parentRequestor.id;
      }
    }

    const approvedDaysAgo = randInt(0, LAST_N_DAYS);
    const approvedAt = new Date(BULK_NOW);
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
      referralGroupLeaderId,
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

    const effectiveLeaderId = referralGroupLeaderId || parentId || owner._id;
    await User.updateOne(
      { _id: owner._id },
      {
        $set: {
          organizationId: org._id,
          organization: org.name,
          referralGroupLeaderId: effectiveLeaderId,
        },
      },
    );

    requestors.push({
      id: owner._id,
      email,
      orgId: org._id,
      leaderId: effectiveLeaderId,
    }); // owner만 추천인 후보

    // 입금: 50만/100만/200만/300만원 4종 중 랜덤
    let remainingPaid = pick([500000, 1000000, 2000000, 3000000]);
    let remainingBonus = 30000;

    await CreditLedger.create({
      organizationId: org._id,
      userId: owner._id,
      type: "CHARGE",
      amount: remainingPaid,
      refType: "SEED_DEPOSIT",
      refId: null,
      uniqueKey: `seed:charge:${email}`,
    });

    await CreditLedger.create({
      organizationId: org._id,
      userId: owner._id,
      type: "BONUS",
      amount: 30000,
      refType: "SEED_BONUS",
      refId: null,
      uniqueKey: `seed:bonus:${email}`,
    });

    // 의뢰자 1명당 주문 20~100건, 그 중 80% 완료(APPROVED), 최근 20일 내 생성
    const requestCount = randInt(
      REQUEST_COUNT_RANGE.min,
      REQUEST_COUNT_RANGE.max,
    );
    const completedRequestIds = [];
    // 첫 의뢰자(i===1)에서 무료 1건 신속배송 처리
    let freeExpressAdded = false;
    for (let k = 0; k < requestCount; k += 1) {
      const daysAgo = randInt(0, LAST_N_DAYS);
      const createdAt = new Date(BULK_NOW);
      createdAt.setDate(createdAt.getDate() - daysAgo);

      // 조직 당일 단가 적용: 신규 90일 = 10,000원, 이후 = 15,000원
      const isNewUser =
        approvedAt &&
        createdAt < new Date(approvedAt.getTime() + 90 * 24 * 60 * 60 * 1000);
      const price = isNewUser ? 10_000 : 15_000;
      const computedPrice = {
        amount: price,
        baseAmount: isNewUser ? 10_000 : 15_000,
        discountAmount: 0,
        rule: isNewUser ? "new_user_90days_fixed_10000" : "base_price",
      };
      const isCompleted = Math.random() < 0.8;

      const status = isCompleted
        ? "완료"
        : pick(["의뢰", "CAM", "가공", "세척.포장", "발송"]);

      const manufacturerStage = (() => {
        if (isCompleted) return "추적관리";
        if (status === "의뢰") return "의뢰";
        if (status === "CAM") return "CAM";
        if (status === "가공") return "가공";
        if (status === "세척.포장") return "세척.포장";
        if (status === "발송") return "발송";
        return "의뢰";
      })();

      const paidAmount = (() => {
        const fromBonus = Math.min(Math.max(0, remainingBonus), price);
        return price - fromBonus;
      })();
      const bonusAmount = (() => {
        return Math.min(Math.max(0, remainingBonus), price);
      })();

      // 첫 의뢰자(i===1)에서 첫 번째 완료 건을 무료 신속배송으로 처리
      const isFreeExpress = i === 1 && isCompleted && !freeExpressAdded;
      if (isFreeExpress) freeExpressAdded = true;
      const actualPaidAmount = isFreeExpress ? 0 : paidAmount;
      const actualBonusAmount = isFreeExpress ? price : bonusAmount;

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
          reviewByStage: {
            shipping: {
              status: isCompleted ? "APPROVED" : "PENDING",
              updatedAt: createdAt,
              updatedBy: owner._id,
              reason: "",
            },
          },
        },
        status,
        manufacturerStage,
        ...(isCompleted
          ? {
              price: {
                amount: computedPrice.amount,
                baseAmount: computedPrice.baseAmount,
                discountAmount: computedPrice.discountAmount,
                currency: "KRW",
                rule: isFreeExpress ? "free_express" : computedPrice.rule,
                paidAmount: actualPaidAmount,
                bonusAmount: actualBonusAmount,
              },
            }
          : {}),
        createdAt,
        updatedAt: createdAt,
      });

      if (isCompleted) {
        if (isFreeExpress) {
          // 무료 신속배송: 보너스에서만 차감
          remainingBonus -= price;
          await CreditLedger.create({
            organizationId: org._id,
            userId: owner._id,
            type: "SPEND",
            amount: -price,
            spentPaidAmount: 0,
            spentBonusAmount: price,
            refType: "SEED_REQUEST",
            refId: reqDoc._id,
            uniqueKey: `seed:spend:${email}:${String(reqDoc._id)}`,
          });
          completedRequestIds.push(reqDoc._id);
        } else if (remainingBonus + remainingPaid >= price) {
          const fromBonus = Math.min(Math.max(0, remainingBonus), price);
          const fromPaid = price - fromBonus;
          remainingBonus -= fromBonus;
          remainingPaid -= fromPaid;
          await CreditLedger.create({
            organizationId: org._id,
            userId: owner._id,
            type: "SPEND",
            amount: -price,
            spentPaidAmount: fromPaid,
            spentBonusAmount: fromBonus,
            refType: "SEED_REQUEST",
            refId: reqDoc._id,
            uniqueKey: `seed:spend:${email}:${String(reqDoc._id)}`,
          });
          completedRequestIds.push(reqDoc._id);
        }
      }

      if (isCompleted && parentId && actualPaidAmount > 0) {
        const parentUser = salesmen.find(
          (s) => String(s.id) === String(parentId),
        );
        if (parentUser) {
          const earnAmount = Math.round(actualPaidAmount * 0.05);
          if (earnAmount > 0) {
            await SalesmanLedger.create({
              salesmanId: parentId,
              type: "EARN",
              amount: earnAmount,
              refType: "SEED_REQUEST",
              refId: reqDoc._id,
              uniqueKey: `seed:salesman:earn:direct:${String(parentId)}:${String(reqDoc._id)}`,
            });
          }

          // level1: 직계 영업자의 부모 영업자에게 2.5% 적립
          const grandparentUser = parentUser.parentId
            ? salesmen.find((s) => String(s.id) === String(parentUser.parentId))
            : null;
          if (grandparentUser) {
            const level1EarnAmount = Math.round(actualPaidAmount * 0.025);
            if (level1EarnAmount > 0) {
              await SalesmanLedger.create({
                salesmanId: grandparentUser.id,
                type: "EARN",
                amount: level1EarnAmount,
                refType: "SEED_REQUEST_LEVEL1",
                refId: reqDoc._id,
                uniqueKey: `seed:salesman:earn:level1:${String(grandparentUser.id)}:${String(reqDoc._id)}`,
              });
            }
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

        const shipDate = new Date(BULK_NOW);
        // 패키지마다 다른 날짜 보장: pkgIdx 기반 offset + 랜덤, 단 최근 30일 내 유지
        const shipOffset = Math.min(LAST_N_DAYS, pkgIdx + randInt(0, 3));
        shipDate.setDate(shipDate.getDate() - shipOffset);
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

        // 배송비는 유료 크레딧에서만 차감 (발송 1회당 3,500원)
        if (remainingPaid >= 3500) {
          const fromBonus = 0;
          const fromPaid = 3500;
          remainingPaid -= fromPaid;
          await CreditLedger.create({
            organizationId: org._id,
            userId: owner._id,
            type: "SPEND",
            amount: -3500,
            spentPaidAmount: fromPaid,
            spentBonusAmount: fromBonus,
            refType: "SHIPPING_FEE",
            refId: pkg._id,
            uniqueKey: `seed:shipping-fee:${email}:${String(pkg._id)}`,
          });
        }

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
        const payoutRaw = Math.round(totalEarned * (0.3 + Math.random() * 0.4));
        const payout = Math.floor(Math.max(0, payoutRaw) / 10000) * 10000;
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
    });
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error("[db] reset+seed failed", err);
  process.exit(1);
});
