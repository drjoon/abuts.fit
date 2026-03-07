import mongoose from "mongoose";
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

const REQUEST_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const REQUEST_ID_SUFFIX_LEN = 8;
const REQUEST_ID_MAX_TRIES = 8;

function generateRequestId(createdAt, reserved = new Set()) {
  const baseDate = createdAt instanceof Date ? createdAt : new Date();
  const kst = new Date(baseDate.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  const prefix = `${year}${month}${day}`;

  const makeSuffix = () => {
    const bytes = crypto.randomBytes(REQUEST_ID_SUFFIX_LEN);
    let out = "";
    for (let i = 0; i < REQUEST_ID_SUFFIX_LEN; i += 1) {
      out += REQUEST_ID_ALPHABET[bytes[i] % REQUEST_ID_ALPHABET.length];
    }
    return out;
  };

  for (let attempt = 0; attempt < REQUEST_ID_MAX_TRIES; attempt += 1) {
    const candidate = `${prefix}-${makeSuffix()}`;
    if (reserved.has(candidate)) continue;
    reserved.add(candidate);
    return candidate;
  }

  throw new Error("requestId 생성에 실패했습니다 (seed)");
}

export async function seedAccountsDev() {
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
    { $set: { organizationId: adminOrg._id, organization: adminOrg.name } },
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
        brand: "TS",
        family: "Regular",
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
      brand: "TS",
      family: "Regular",
      type: "Hex",
    },
    {
      $setOnInsert: {
        requestor: requestorOwner._id,
        clinicName: "데모치과",
        manufacturer: "OSSTEM",
        brand: "TS",
        family: "Regular",
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

async function createSalesmen({
  count = 10,
  rootCount = 3,
  password = "Abc!1234",
  now = new Date(),
  allowUnreferred = true,
} = {}) {
  const salesmen = [];
  const salesmanRoots = [];

  for (let i = 1; i <= count; i += 1) {
    const email = `s${String(i).padStart(3, "0")}@gmail.com`;
    const referralCode = randomReferralCode(4);
    let referredByUserId = null;
    let referralGroupLeaderId = null;
    const isRoot = i <= rootCount;
    const isUnreferred =
      allowUnreferred && !isRoot && i !== 4 && Math.random() < 0.2;

    if (!isRoot && !isUnreferred) {
      const root = salesmanRoots.length ? pick(salesmanRoots) : null;
      const candidates = salesmen.filter(
        (s) => String(s.leaderId) === String(root?.id),
      );
      const pool = candidates.length ? candidates : salesmen;
      const parent = pool.length ? pick(pool) : null;
      referredByUserId = parent?.id || null;
      referralGroupLeaderId =
        root?.id || parent?.leaderId || parent?.id || null;
    }

    const salesman = await User.create({
      name: `데모 영업자${i}`,
      email,
      password,
      role: "salesman",
      referralCode,
      referredByUserId,
      referralGroupLeaderId,
      approvedAt: now,
      active: true,
    });

    const leaderId = referralGroupLeaderId || salesman._id;
    const saved = {
      id: salesman._id,
      email,
      leaderId,
      parentId: referredByUserId,
    };
    salesmen.push(saved);
    if (isRoot) salesmanRoots.push({ id: salesman._id, email });
  }

  return { salesmen, salesmanRoots };
}

export async function seedSalesmenOnly(options = {}) {
  return createSalesmen(options);
}

export async function seedBulkUsersAndData() {
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

  const ROOT_COUNT = 3;
  const requestors = [];
  const { salesmen, salesmanRoots } = await createSalesmen({
    count: 10,
    rootCount: ROOT_COUNT,
    password: SALESMAN_PW,
    now: BULK_NOW,
  });

  const creditLedgerDocs = [];
  const requestDocs = [];
  const shippingPackageDocs = [];
  const salesmanLedgerDocs = [];
  const salesmanEarnTotals = new Map();
  const generatedRequestIds = new Set();

  for (let i = 1; i <= REQUESTOR_COUNT; i += 1) {
    const email = `r${String(i).padStart(3, "0")}@gmail.com`;
    const orgName = `org-${String(i).padStart(3, "0")}`;
    const referralCode = randomReferralCode();

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
    });

    let remainingPaid = pick([500000, 1000000, 2000000, 3000000]);
    let remainingBonus = 30000;

    creditLedgerDocs.push({
      organizationId: org._id,
      userId: owner._id,
      type: "CHARGE",
      amount: remainingPaid,
      refType: "SEED_DEPOSIT",
      refId: null,
      uniqueKey: `seed:charge:${email}`,
    });

    creditLedgerDocs.push({
      organizationId: org._id,
      userId: owner._id,
      type: "BONUS",
      amount: 30000,
      refType: "SEED_BONUS",
      refId: null,
      uniqueKey: `seed:bonus:${email}`,
    });

    const requestCount = randInt(
      REQUEST_COUNT_RANGE.min,
      REQUEST_COUNT_RANGE.max,
    );
    const completedRequests = [];
    let freeExpressAdded = false;
    for (let k = 0; k < requestCount; k += 1) {
      const daysAgo = randInt(0, LAST_N_DAYS);
      const createdAt = new Date(BULK_NOW);
      createdAt.setDate(createdAt.getDate() - daysAgo);

    const isNewUser =
      owner.approvedAt &&
      createdAt <
        new Date(
          new Date(owner.approvedAt).getTime() + 90 * 24 * 60 * 60 * 1000,
        );
        baseAmount: isNewUser ? 10_000 : 15_000,
        discountAmount: 0,
        rule: isNewUser ? "new_user_90days_fixed_10000" : "base_price",
      };
      const isCompleted = Math.random() < 0.8;

      const status = isCompleted
        ? "완료"
        : pick(["의뢰", "CAM", "가공", "세척.패킹", "포장.발송"]);

      const manufacturerStage = (() => {
        if (isCompleted) return "추적관리";
        if (status === "의뢰") return "의뢰";
        if (status === "CAM") return "CAM";
        if (status === "가공") return "가공";
        if (status === "세척.패킹") return "세척.패킹";
        if (status === "포장.발송") return "포장.발송";
        return "의뢰";
      })();

      const fromBonus = Math.min(Math.max(0, remainingBonus), price);
      const paidAmount = price - fromBonus;
      const bonusAmount = fromBonus;

      const isFreeExpress = i === 1 && isCompleted && !freeExpressAdded;
      if (isFreeExpress) freeExpressAdded = true;
      const actualPaidAmount = isFreeExpress ? 0 : paidAmount;
      const actualBonusAmount = isFreeExpress ? price : bonusAmount;

      const reqId = new mongoose.Types.ObjectId();
      const requestId = generateRequestId(createdAt, generatedRequestIds);
      const reqDoc = {
        _id: reqId,
        requestId,
        requestorOrganizationId: org._id,
        requestor: owner._id,
        manufacturer: null,
        caseInfos: {
          clinicName: "seed 치과",
          patientName: `환자${i}-${k}`,
          tooth: "11",
          implantManufacturer: "OSSTEM",
          implantBrand: "TS",
          implantFamily: "Regular",
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
      };
      requestDocs.push(reqDoc);

      if (isCompleted) {
        completedRequests.push(reqDoc);
        if (isFreeExpress) {
          remainingBonus -= price;
          creditLedgerDocs.push({
            organizationId: org._id,
            userId: owner._id,
            type: "SPEND",
            amount: -price,
            spentPaidAmount: 0,
            spentBonusAmount: price,
            refType: "SEED_REQUEST",
            refId: reqId,
            uniqueKey: `seed:spend:${email}:${String(reqId)}`,
          });
        } else if (remainingBonus + remainingPaid >= price) {
          const spendBonus = Math.min(Math.max(0, remainingBonus), price);
          const spendPaid = price - spendBonus;
          remainingBonus -= spendBonus;
          remainingPaid -= spendPaid;
          creditLedgerDocs.push({
            organizationId: org._id,
            userId: owner._id,
            type: "SPEND",
            amount: -price,
            spentPaidAmount: spendPaid,
            spentBonusAmount: spendBonus,
            refType: "SEED_REQUEST",
            refId: reqId,
            uniqueKey: `seed:spend:${email}:${String(reqId)}`,
          });
        }
      }

      if (isCompleted && parentId && actualPaidAmount > 0) {
        const parentUser = salesmen.find(
          (s) => String(s.id) === String(parentId),
        );
        if (parentUser) {
          const earnAmount = Math.round(actualPaidAmount * 0.05);
          if (earnAmount > 0) {
            salesmanLedgerDocs.push({
              salesmanId: parentId,
              type: "EARN",
              amount: earnAmount,
              refType: "SEED_REQUEST",
              refId: reqId,
              uniqueKey: `seed:salesman:earn:direct:${String(parentId)}:${String(reqId)}`,
            });
            const parentKey = String(parentId);
            salesmanEarnTotals.set(
              parentKey,
              (salesmanEarnTotals.get(parentKey) || 0) + earnAmount,
            );
          }

          const grandparentUser = parentUser.parentId
            ? salesmen.find((s) => String(s.id) === String(parentUser.parentId))
            : null;
          if (grandparentUser) {
            const level1EarnAmount = Math.round(actualPaidAmount * 0.025);
            if (level1EarnAmount > 0) {
              salesmanLedgerDocs.push({
                salesmanId: grandparentUser.id,
                type: "EARN",
                amount: level1EarnAmount,
                refType: "SEED_REQUEST_LEVEL1",
                refId: reqId,
                uniqueKey: `seed:salesman:earn:level1:${String(grandparentUser.id)}:${String(reqId)}`,
              });
              const gpKey = String(grandparentUser.id);
              salesmanEarnTotals.set(
                gpKey,
                (salesmanEarnTotals.get(gpKey) || 0) + level1EarnAmount,
              );
            }
          }
        }
      }
    }

    if (completedRequests.length > 0) {
      const sortedDocs = [...completedRequests];
      let cursor = 0;
      let pkgIdx = 0;
      while (cursor < sortedDocs.length) {
        const remaining = sortedDocs.length - cursor;
        const chunkSize = Math.min(randInt(3, 20), Math.max(1, remaining));
        const chunk = sortedDocs.slice(cursor, cursor + chunkSize);
        cursor += chunkSize;
        pkgIdx += 1;

        const shipDate = new Date(BULK_NOW);
        const shipOffset = Math.min(LAST_N_DAYS, pkgIdx + randInt(0, 3));
        shipDate.setDate(shipDate.getDate() - shipOffset);
        const shipDateYmd = `${toKstYmd(shipDate)}-p${pkgIdx}`;
        const pkgId = new mongoose.Types.ObjectId();
        const requestIds = chunk.map((doc) => doc._id);

        shippingPackageDocs.push({
          _id: pkgId,
          organizationId: org._id,
          shipDateYmd,
          requestIds,
          shippingFeeSupply: 3500,
          shippingFeeVat: 0,
          createdBy: owner._id,
          createdAt: shipDate,
          updatedAt: shipDate,
        });

        chunk.forEach((doc) => {
          doc.shippingPackageId = pkgId;
        });

        if (remainingPaid >= 3500) {
          const fromPaid = 3500;
          remainingPaid -= fromPaid;
          creditLedgerDocs.push({
            organizationId: org._id,
            userId: owner._id,
            type: "SPEND",
            amount: -3500,
            spentPaidAmount: fromPaid,
            spentBonusAmount: 0,
            refType: "SHIPPING_FEE",
            refId: pkgId,
            uniqueKey: `seed:shipping-fee:${email}:${String(pkgId)}`,
          });
        }
      }
    }
  }

  for (const s of salesmen) {
    if (Math.random() < 0.35) {
      const totalEarned = salesmanEarnTotals.get(String(s.id)) || 0;
      if (totalEarned > 0) {
        const payoutRaw = Math.round(totalEarned * (0.3 + Math.random() * 0.4));
        const payout = Math.floor(Math.max(0, payoutRaw) / 10000) * 10000;
        if (payout > 0) {
          salesmanLedgerDocs.push({
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

  if (requestDocs.length) {
    await Request.insertMany(requestDocs, { ordered: false });
  }
  if (shippingPackageDocs.length) {
    await ShippingPackage.insertMany(shippingPackageDocs, { ordered: false });
  }
  if (creditLedgerDocs.length) {
    await CreditLedger.insertMany(creditLedgerDocs, { ordered: false });
  }
  if (salesmanLedgerDocs.length) {
    await SalesmanLedger.insertMany(salesmanLedgerDocs, { ordered: false });
  }

  return { requestors, salesmen };
}

async function findOrCreateUser(doc) {
  const existing = await User.findOne({ email: doc.email });
  if (existing) return existing;
  return User.create(doc);
}

async function findOrCreateOrganization({
  organizationType,
  name,
  ownerId,
  memberIds = [],
  extracted = {},
}) {
  let organization = await RequestorOrganization.findOne({
    organizationType,
    name,
  });

  if (!organization) {
    organization = await RequestorOrganization.create({
      organizationType,
      name,
      owner: ownerId,
      owners: [],
      members: [ownerId, ...memberIds],
      joinRequests: [],
      extracted,
    });
  } else {
    const nextMembers = [ownerId, ...memberIds].filter(Boolean);
    await RequestorOrganization.updateOne(
      { _id: organization._id },
      {
        $set: {
          owner: ownerId,
          extracted: {
            ...(organization.extracted || {}),
            ...extracted,
          },
        },
        $addToSet: { members: { $each: nextMembers } },
      },
    );
    organization = await RequestorOrganization.findById(organization._id);
  }

  return organization;
}

async function attachUserToOrganization(userId, organization) {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        organizationId: organization._id,
        organization: organization.name,
      },
    },
  );
}

export async function seedDefaultAccounts() {
  const passwords = {
    requestorOwner: "Rq!8zY#4fQ@7nC5$",
    requestorStaff: "Rs!9xT#5gA@6mD4$",
    manufacturerOwner: "Mo!7vL#6pR@3sB8$",
    manufacturerStaff: "Ms!5kP#8wQ@2nZ7$",
    adminOwner: "Ao!6fN#9rV@4cH2$",
    adminStaff: "As!4mJ#7tK@9pW3$",
    salesmanOwner: "So!8qL#3mV@6pK2$",
    salesmanStaff: "Ss!7wN#4cX@5rT1$",
  };

  const requestorOwner = await findOrCreateUser({
    name: "데모 의뢰자 대표",
    email: "requestor.owner@demo.abuts.fit",
    password: passwords.requestorOwner,
    role: "requestor",
    requestorRole: "owner",
    phoneNumber: "01000000001",
    organization: "데모기공소",
    referralCode: "seed_requestor_owner",
    approvedAt: NOW,
    active: true,
  });

  const requestorStaff = await findOrCreateUser({
    name: "데모 의뢰자 직원",
    email: "requestor.staff@demo.abuts.fit",
    password: passwords.requestorStaff,
    role: "requestor",
    requestorRole: "staff",
    phoneNumber: "01000000002",
    organization: "데모기공소",
    referralCode: "seed_requestor_staff",
    approvedAt: NOW,
    active: true,
    referredByUserId: requestorOwner._id,
    referralGroupLeaderId: requestorOwner._id,
  });

  const requestorOrg = await findOrCreateOrganization({
    organizationType: "requestor",
    name: "데모기공소",
    ownerId: requestorOwner._id,
    memberIds: [requestorStaff._id],
    extracted: {
      companyName: "데모기공소",
      representativeName: "데모 의뢰자 대표",
      businessNumber: "111-11-11111",
      phoneNumber: "02-0000-0001",
      email: "requestor.owner@demo.abuts.fit",
      address: "서울특별시 중구 세종대로 1",
    },
  });
  await attachUserToOrganization(requestorOwner._id, requestorOrg);
  await attachUserToOrganization(requestorStaff._id, requestorOrg);

  const manufacturerOwner = await findOrCreateUser({
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

  const manufacturerStaff = await findOrCreateUser({
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

  const manufacturerOrg = await findOrCreateOrganization({
    organizationType: "manufacturer",
    name: "애크로덴트",
    ownerId: manufacturerOwner._id,
    memberIds: [manufacturerStaff._id],
    extracted: {
      companyName: "애크로덴트",
      representativeName: "데모 제조사 대표",
      businessNumber: "222-22-22222",
      phoneNumber: "031-000-0003",
      email: "manufacturer.owner@demo.abuts.fit",
      address: "경기도 성남시 분당구 판교역로 1",
    },
  });
  await attachUserToOrganization(manufacturerOwner._id, manufacturerOrg);
  await attachUserToOrganization(manufacturerStaff._id, manufacturerOrg);

  const adminOwner = await findOrCreateUser({
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

  const adminStaff = await findOrCreateUser({
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

  const adminOrg = await findOrCreateOrganization({
    organizationType: "requestor",
    name: "어벗츠핏",
    ownerId: adminOwner._id,
    memberIds: [adminStaff._id],
    extracted: {
      companyName: "어벗츠핏",
      representativeName: "데모 관리자 대표",
      businessNumber: "333-33-33333",
      phoneNumber: "02-0000-0004",
      email: "admin.owner@demo.abuts.fit",
      address: "서울특별시 강남구 테헤란로 1",
    },
  });
  await attachUserToOrganization(adminOwner._id, adminOrg);
  await attachUserToOrganization(adminStaff._id, adminOrg);

  const salesmanOwner = await findOrCreateUser({
    name: "데모 영업자 대표",
    email: "salesman.owner@demo.abuts.fit",
    password: passwords.salesmanOwner,
    role: "salesman",
    phoneNumber: "01000000007",
    organization: "데모영업팀",
    referralCode: "seed_salesman_owner",
    approvedAt: NOW,
    active: true,
  });

  const salesmanStaff = await findOrCreateUser({
    name: "데모 영업자 직원",
    email: "salesman.staff@demo.abuts.fit",
    password: passwords.salesmanStaff,
    role: "salesman",
    phoneNumber: "01000000008",
    organization: "데모영업팀",
    referralCode: "seed_salesman_staff",
    approvedAt: NOW,
    active: true,
    referredByUserId: salesmanOwner._id,
    referralGroupLeaderId: salesmanOwner._id,
  });

  const salesmanOrg = await findOrCreateOrganization({
    organizationType: "salesman",
    name: "데모영업팀",
    ownerId: salesmanOwner._id,
    memberIds: [salesmanStaff._id],
    extracted: {
      companyName: "데모영업팀",
      representativeName: "데모 영업자 대표",
      businessNumber: "444-44-44444",
      phoneNumber: "02-0000-0007",
      email: "salesman.owner@demo.abuts.fit",
      address: "서울특별시 영등포구 여의대로 1",
    },
  });
  await attachUserToOrganization(salesmanOwner._id, salesmanOrg);
  await attachUserToOrganization(salesmanStaff._id, salesmanOrg);

  return {
    passwords,
    users: {
      requestorOwner,
      requestorStaff,
      manufacturerOwner,
      manufacturerStaff,
      adminOwner,
      adminStaff,
      salesmanOwner,
      salesmanStaff,
    },
  };
}

export async function seedBulkAccounts({
  requestorCount = 0,
  salesmanCount = 0,
  password = "Abc!1234",
} = {}) {
  const createdSalesmen = [];
  const salesmanRoots = [];
  const rootCount = Math.min(3, salesmanCount);

  for (let i = 1; i <= salesmanCount; i += 1) {
    const email = `s${String(i).padStart(3, "0")}@gmail.com`;
    const existing = await User.findOne({ email });
    if (existing) {
      const savedExisting = {
        id: existing._id,
        email,
        leaderId: existing.referralGroupLeaderId || existing._id,
        parentId: existing.referredByUserId || null,
      };
      createdSalesmen.push(savedExisting);
      if (i <= rootCount) salesmanRoots.push({ id: existing._id, email });
      continue;
    }

    let referredByUserId = null;
    let referralGroupLeaderId = null;
    const isRoot = i <= rootCount;
    const isUnreferred = !isRoot && i !== 4 && Math.random() < 0.2;

    if (!isRoot && !isUnreferred) {
      const root = salesmanRoots.length ? pick(salesmanRoots) : null;
      const candidates = createdSalesmen.filter(
        (s) => String(s.leaderId) === String(root?.id),
      );
      const pool = candidates.length ? candidates : createdSalesmen;
      const parent = pool.length ? pick(pool) : null;
      referredByUserId = parent?.id || null;
      referralGroupLeaderId =
        root?.id || parent?.leaderId || parent?.id || null;
    }

    const salesman = await User.create({
      name: `데모 영업자${i}`,
      email,
      password,
      role: "salesman",
      referralCode: randomReferralCode(4),
      referredByUserId,
      referralGroupLeaderId,
      approvedAt: NOW,
      active: true,
    });

    const leaderId = referralGroupLeaderId || salesman._id;
    const saved = {
      id: salesman._id,
      email,
      leaderId,
      parentId: referredByUserId,
    };
    createdSalesmen.push(saved);
    if (i <= rootCount) salesmanRoots.push({ id: salesman._id, email });
  }

  const salesIntroParents = [
    "s001@gmail.com",
    "s001@gmail.com",
    "s004@gmail.com",
    "s004@gmail.com",
    "s006@gmail.com",
    "s006@gmail.com",
    "s009@gmail.com",
    "s009@gmail.com",
  ];
  const requestorIntroParents = [
    "r001@gmail.com",
    "r002@gmail.com",
    "r003@gmail.com",
    "r004@gmail.com",
    "r001@gmail.com",
    "r002@gmail.com",
    "r003@gmail.com",
    "r004@gmail.com",
  ];
  const createdRequestors = [];

  for (let i = 1; i <= requestorCount; i += 1) {
    const email = `r${String(i).padStart(3, "0")}@gmail.com`;
    const orgName = `org-${String(i).padStart(3, "0")}`;
    const existing = await User.findOne({ email });
    if (existing) {
      createdRequestors.push({
        id: existing._id,
        email,
        orgId: existing.organizationId,
        leaderId: existing.referralGroupLeaderId || existing._id,
      });
      continue;
    }

    let parentId = null;
    let referralGroupLeaderId = null;
    if (i <= salesIntroParents.length) {
      const parentEmail = salesIntroParents[i - 1];
      const parentSalesman = createdSalesmen.find(
        (s) => s.email === parentEmail,
      );
      if (parentSalesman) {
        parentId = parentSalesman.id;
        referralGroupLeaderId = parentSalesman.leaderId || parentSalesman.id;
      }
    } else if (i <= salesIntroParents.length + requestorIntroParents.length) {
      const parentEmail =
        requestorIntroParents[i - salesIntroParents.length - 1];
      const parentRequestor = createdRequestors.find(
        (r) => r.email === parentEmail,
      );
      if (parentRequestor) {
        parentId = parentRequestor.id;
        referralGroupLeaderId = parentRequestor.leaderId || parentRequestor.id;
      }
    }

    const approvedAt = new Date(NOW);
    approvedAt.setDate(approvedAt.getDate() - randInt(0, 20));

    const owner = await User.create({
      name: `의뢰자 ${i}`,
      email,
      password,
      role: "requestor",
      requestorRole: "owner",
      organization: orgName,
      referralCode: randomReferralCode(),
      referredByUserId: parentId,
      referralGroupLeaderId,
      approvedAt,
      active: true,
    });

    const org = await findOrCreateOrganization({
      organizationType: "requestor",
      name: orgName,
      ownerId: owner._id,
      extracted: {
        companyName: orgName,
        representativeName: `의뢰자 ${i}`,
        email,
      },
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

    createdRequestors.push({
      id: owner._id,
      email,
      orgId: org._id,
      leaderId: effectiveLeaderId,
    });
  }

  return {
    requestors: createdRequestors,
    salesmen: createdSalesmen,
  };
}

async function ensureFundingForOrganization({
  organizationId,
  userId,
  uniqueKey,
}) {
  const chargeKey = `seed:charge:${uniqueKey}`;
  const bonusKey = `seed:bonus:${uniqueKey}`;

  const existingCharge = await CreditLedger.findOne({ uniqueKey: chargeKey });
  if (!existingCharge) {
    await CreditLedger.create({
      organizationId,
      userId,
      type: "CHARGE",
      amount: 3000000,
      refType: "SEED_DEPOSIT",
      refId: null,
      uniqueKey: chargeKey,
    });
  }

  const existingBonus = await CreditLedger.findOne({ uniqueKey: bonusKey });
  if (!existingBonus) {
    await CreditLedger.create({
      organizationId,
      userId,
      type: "BONUS",
      amount: 30000,
      refType: "SEED_BONUS",
      refId: null,
      uniqueKey: bonusKey,
    });
  }
}

export async function seedRequestData({ count = 50 } = {}) {
  const requestorUsers = await User.find({
    role: "requestor",
    active: true,
    organizationId: { $ne: null },
  })
    .sort({ email: 1 })
    .lean();

  const requestors = requestorUsers.filter(
    (user) => user.requestorRole === "owner" || !user.requestorRole,
  );
  const requestorPool = requestors.length ? requestors : requestorUsers;
  if (!requestorPool.length) {
    throw new Error(
      "seed-data를 실행하려면 먼저 requestor 계정을 생성해야 합니다.",
    );
  }

  const salesmen = await User.find({ role: "salesman", active: true }).lean();
  const salesmenById = new Map(
    salesmen.map((user) => [String(user._id), user]),
  );
  const lastNDays = 20;
  const generatedRequestIds = new Set();
  const requestDocs = [];
  const creditLedgerDocs = [];
  const salesmanLedgerDocs = [];
  const shippingPackageDocs = [];
  const completedByOrg = new Map();
  const orgFunding = new Map();

  for (const requestor of requestorPool) {
    await ensureFundingForOrganization({
      organizationId: requestor.organizationId,
      userId: requestor._id,
      uniqueKey: requestor.email,
    });
    orgFunding.set(String(requestor.organizationId), {
      remainingPaid: 3000000,
      remainingBonus: 30000,
    });
  }

  for (let index = 0; index < count; index += 1) {
    const owner = pick(requestorPool);
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - randInt(0, lastNDays));

    const isNewUser =
      owner.approvedAt &&
      createdAt <
        new Date(
          new Date(owner.approvedAt).getTime() + 90 * 24 * 60 * 60 * 1000,
        );
    const amount = isNewUser ? 10000 : 15000;
    const isCompleted = Math.random() < 0.8;
    const status = isCompleted
      ? "완료"
      : pick(["의뢰", "CAM", "가공", "세척.패킹", "포장.발송"]);
    const manufacturerStage = (() => {
      if (isCompleted) return "추적관리";
      if (status === "의뢰") return "의뢰";
      if (status === "CAM") return "CAM";
      if (status === "가공") return "가공";
      if (status === "세척.패킹") return "세척.패킹";
      if (status === "포장.발송") return "포장.발송";
      return "의뢰";
    })();

    const orgKey = String(owner.organizationId);
    const funding = orgFunding.get(orgKey) || {
      remainingPaid: 3000000,
      remainingBonus: 30000,
    };
    const fromBonus = Math.min(Math.max(0, funding.remainingBonus), amount);
    const paidAmount = amount - fromBonus;
    const bonusAmount = fromBonus;

    const requestObjectId = new mongoose.Types.ObjectId();
    const requestId = generateRequestId(createdAt, generatedRequestIds);
    const requestDoc = {
      _id: requestObjectId,
      requestId,
      requestorOrganizationId: owner.organizationId,
      requestor: owner._id,
      manufacturer: null,
      caseInfos: {
        clinicName: `seed 치과 ${randInt(1, 20)}`,
        patientName: `환자${index + 1}`,
        tooth: pick(["11", "12", "21", "22", "31", "41"]),
        implantManufacturer: pick(["OSSTEM", "STRAUMANN", "DIO"]),
        implantBrand: pick(["TS", "BLT", "UFII"]),
        implantFamily: pick(["Regular", "Mini"]),
        implantType: pick(["Hex", "Non-Hex"]),
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
      createdAt,
      updatedAt: createdAt,
    };

    if (isCompleted) {
      requestDoc.price = {
        amount,
        baseAmount: amount,
        discountAmount: 0,
        currency: "KRW",
        rule: isNewUser ? "new_user_90days_fixed_10000" : "base_price",
        paidAmount,
        bonusAmount,
      };

      funding.remainingBonus -= bonusAmount;
      funding.remainingPaid -= paidAmount;
      creditLedgerDocs.push({
        organizationId: owner.organizationId,
        userId: owner._id,
        type: "SPEND",
        amount: -amount,
        spentPaidAmount: paidAmount,
        spentBonusAmount: bonusAmount,
        refType: "SEED_REQUEST",
        refId: requestObjectId,
        uniqueKey: `seed:spend:${owner.email}:${String(requestObjectId)}`,
      });

      const bucket = completedByOrg.get(orgKey) || [];
      bucket.push(requestDoc);
      completedByOrg.set(orgKey, bucket);

      const directSalesman = owner.referredByUserId
        ? salesmenById.get(String(owner.referredByUserId))
        : null;
      if (directSalesman && paidAmount > 0) {
        const earnAmount = Math.round(paidAmount * 0.05);
        if (earnAmount > 0) {
          salesmanLedgerDocs.push({
            salesmanId: directSalesman._id,
            type: "EARN",
            amount: earnAmount,
            refType: "SEED_REQUEST",
            refId: requestObjectId,
            uniqueKey: `seed:salesman:earn:direct:${String(directSalesman._id)}:${String(requestObjectId)}`,
          });
        }

        const indirectSalesman = directSalesman.referredByUserId
          ? salesmenById.get(String(directSalesman.referredByUserId))
          : null;
        if (indirectSalesman) {
          const level1Amount = Math.round(paidAmount * 0.025);
          if (level1Amount > 0) {
            salesmanLedgerDocs.push({
              salesmanId: indirectSalesman._id,
              type: "EARN",
              amount: level1Amount,
              refType: "SEED_REQUEST_LEVEL1",
              refId: requestObjectId,
              uniqueKey: `seed:salesman:earn:level1:${String(indirectSalesman._id)}:${String(requestObjectId)}`,
            });
          }
        }
      }
    }

    orgFunding.set(orgKey, funding);
    requestDocs.push(requestDoc);
  }

  for (const [orgKey, docs] of completedByOrg.entries()) {
    const organizationRequests = [...docs];
    let cursor = 0;
    let pkgIndex = 0;
    while (cursor < organizationRequests.length) {
      const remaining = organizationRequests.length - cursor;
      const chunkSize = Math.min(randInt(3, 20), Math.max(1, remaining));
      const chunk = organizationRequests.slice(cursor, cursor + chunkSize);
      cursor += chunkSize;
      pkgIndex += 1;

      const shipDate = new Date();
      shipDate.setDate(
        shipDate.getDate() - Math.min(lastNDays, pkgIndex + randInt(0, 3)),
      );
      const packageId = new mongoose.Types.ObjectId();
      const organizationId = chunk[0]?.requestorOrganizationId || orgKey;
      const userId = chunk[0]?.requestor;
      shippingPackageDocs.push({
        _id: packageId,
        organizationId,
        shipDateYmd: `${toKstYmd(shipDate)}-p${pkgIndex}`,
        requestIds: chunk.map((doc) => doc._id),
        shippingFeeSupply: 3500,
        shippingFeeVat: 0,
        createdBy: userId,
        createdAt: shipDate,
        updatedAt: shipDate,
      });

      chunk.forEach((doc) => {
        doc.shippingPackageId = packageId;
      });

      creditLedgerDocs.push({
        organizationId,
        userId,
        type: "SPEND",
        amount: -3500,
        spentPaidAmount: 3500,
        spentBonusAmount: 0,
        refType: "SHIPPING_FEE",
        refId: packageId,
        uniqueKey: `seed:shipping-fee:${String(organizationId)}:${String(packageId)}`,
      });
    }
  }

  if (requestDocs.length) {
    await Request.insertMany(requestDocs, { ordered: false });
  }
  if (shippingPackageDocs.length) {
    await ShippingPackage.insertMany(shippingPackageDocs, { ordered: false });
  }
  if (creditLedgerDocs.length) {
    await CreditLedger.insertMany(creditLedgerDocs, { ordered: false });
  }
  if (salesmanLedgerDocs.length) {
    await SalesmanLedger.insertMany(salesmanLedgerDocs, { ordered: false });
  }

  return {
    requestCount: requestDocs.length,
    shippingPackageCount: shippingPackageDocs.length,
    creditLedgerCount: creditLedgerDocs.length,
    salesmanLedgerCount: salesmanLedgerDocs.length,
    requestorCount: requestorPool.length,
  };
}
