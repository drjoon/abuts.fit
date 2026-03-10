import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import CreditLedger from "../../../models/creditLedger.model.js";
import User from "../../../models/user.model.js";
import {
  NOW,
  attachUserToOrganization,
  findOrCreateOrganization,
  findOrCreateUser,
  pick,
  randomReferralCode,
} from "./utils.js";

async function grantRequestorSeedCredit({
  businessId,
  userId,
  uniqueKey,
  amount = 500000,
}) {
  const ledgerKey = `seed:requestor-credit:${uniqueKey}`;
  const existing = await CreditLedger.findOne({ uniqueKey: ledgerKey })
    .select({ _id: 1 })
    .lean();
  if (existing) return false;

  await CreditLedger.create({
    businessId,
    userId,
    type: "CHARGE",
    amount,
    refType: "SEED_REQUESTOR_CHARGE",
    refId: null,
    uniqueKey: ledgerKey,
  });

  return true;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@#$%^&*()-_=+";
const ESSENTIAL_ACCOUNTS_CONFIG_PATH = path.join(
  __dirname,
  ".essential-accounts.config.json",
);
const BULK_ACCOUNTS_CONFIG_PATH = path.join(
  __dirname,
  ".bulk-accounts.config.json",
);

function generateSecurePassword(length = 18) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  }
  return out;
}

async function readJsonConfig(filePath, label) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `[seed] ${label} 파일(${filePath})을 읽을 수 없습니다: ${err.message}`,
    );
  }
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function pickRandom(items) {
  return items.length ? pick(items) : null;
}

async function ensureBusinessFromSpec(spec, ownerId) {
  if (!spec) return null;
  const business = await findOrCreateOrganization({
    organizationType: spec.type,
    name: spec.name,
    ownerId,
    memberIds: [],
    extracted: spec.extracted || {},
  });
  return business;
}

export async function seedEssentialAccounts() {
  const config = await readJsonConfig(
    ESSENTIAL_ACCOUNTS_CONFIG_PATH,
    "필수 계정 설정",
  );
  const specs = ensureArray(config.accounts);
  const createdUsers = [];

  for (const spec of specs) {
    const password = generateSecurePassword();
    const user = await findOrCreateUser({
      name: spec.name,
      email: spec.email,
      password,
      role: spec.role,
      phoneNumber: spec.phoneNumber,
      approvedAt: NOW,
      active: true,
      ...(spec.roleSpecific || {}),
    });

    const business = await ensureBusinessFromSpec(spec.organization, user._id);
    if (business) {
      await attachUserToOrganization(user._id, business);
    }

    createdUsers.push({
      label: spec.label,
      name: spec.name,
      email: spec.email,
      phoneNumber: spec.phoneNumber,
      role: spec.role,
      business: spec.organization?.name,
      password,
    });
  }

  return { users: createdUsers };
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
    business: "데모기공소",
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
    business: "데모기공소",
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
  await grantRequestorSeedCredit({
    businessId: requestorOrg._id,
    userId: requestorOwner._id,
    uniqueKey: `org:${String(requestorOrg._id)}`,
  });

  const manufacturerOwner = await findOrCreateUser({
    name: "데모 제조사 대표",
    email: "manufacturer.owner@demo.abuts.fit",
    password: passwords.manufacturerOwner,
    role: "manufacturer",
    manufacturerRole: "owner",
    phoneNumber: "01000000003",
    business: "애크로덴트",
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
    business: "애크로덴트",
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
    business: "어벗츠핏",
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
    business: "어벗츠핏",
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
    business: "데모영업팀",
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
    business: "데모영업팀",
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

export async function seedBulkAccounts() {
  const config = await readJsonConfig(
    BULK_ACCOUNTS_CONFIG_PATH,
    "벌크 계정 설정",
  );
  const requestorSpecs = ensureArray(config.requestors);
  const salesmanSpecs = ensureArray(config.salesmen);

  const createdSalesmen = [];
  const salesmanOwners = [];
  const businessMap = new Map();

  for (const spec of salesmanSpecs) {
    const password = generateSecurePassword();
    const isOwner = spec.salesmanRole === "owner";
    const leaderCandidate = isOwner
      ? null
      : pickRandom(salesmanOwners.length ? salesmanOwners : createdSalesmen);
    const parentCandidate = isOwner ? null : pickRandom(createdSalesmen);

    const referredByUserId = parentCandidate?.id || leaderCandidate?.id || null;
    const referralGroupLeaderId = isOwner
      ? null
      : leaderCandidate?.leaderId ||
        leaderCandidate?.id ||
        referredByUserId ||
        null;

    const user = await findOrCreateUser({
      name: spec.name,
      email: spec.email,
      password,
      role: "salesman",
      salesmanRole: spec.salesmanRole,
      phoneNumber: spec.phoneNumber,
      referralCode: randomReferralCode(4),
      referredByUserId,
      referralGroupLeaderId,
      approvedAt: NOW,
      active: true,
    });

    if (isOwner) {
      await User.updateOne(
        { _id: user._id },
        { $set: { referralGroupLeaderId: user._id } },
      );
    }

    const business = await ensureBusinessFromSpec(spec.organization, user._id);
    if (business) {
      await attachUserToOrganization(user._id, business);
      if (spec.organizationKey) {
        businessMap.set(spec.organizationKey, {
          business,
          ownerId: user._id,
        });
      }
    }

    const effectiveLeaderId = isOwner
      ? user._id
      : referralGroupLeaderId || referredByUserId || user._id;

    const saved = {
      id: user._id,
      email: spec.email,
      name: spec.name,
      salesmanRole: spec.salesmanRole,
      label: spec.label,
      password,
      leaderId: effectiveLeaderId,
    };
    createdSalesmen.push(saved);
    if (isOwner) salesmanOwners.push(saved);
  }

  const createdRequestors = [];
  for (const spec of requestorSpecs) {
    const password = generateSecurePassword();
    const isOwner = spec.requestorRole === "owner";
    let referredByUserId = null;
    let referralGroupLeaderId = null;

    if (isOwner) {
      const sponsor = pickRandom(
        salesmanOwners.length ? salesmanOwners : createdSalesmen,
      );
      referredByUserId = sponsor?.id || null;
      referralGroupLeaderId = sponsor?.leaderId || sponsor?.id || null;
    } else if (spec.organizationKey) {
      const ownerEntry = createdRequestors.find(
        (entry) =>
          entry.organizationKey === spec.organizationKey &&
          entry.requestorRole === "owner",
      );
      if (ownerEntry) {
        referredByUserId = ownerEntry.id;
        referralGroupLeaderId = ownerEntry.leaderId || ownerEntry.id;
      }
    }

    const user = await findOrCreateUser({
      name: spec.name,
      email: spec.email,
      password,
      role: "requestor",
      requestorRole: spec.requestorRole,
      phoneNumber: spec.phoneNumber,
      business: spec.organization?.name,
      referralCode: randomReferralCode(),
      referredByUserId,
      referralGroupLeaderId,
      approvedAt: NOW,
      active: true,
    });

    let business = null;
    if (isOwner) {
      business = await ensureBusinessFromSpec(spec.organization, user._id);
      if (!business) {
        throw new Error(
          `[seed] requestor owner ${spec.email} 에 대한 사업자 정보가 필요합니다`,
        );
      }
      await attachUserToOrganization(user._id, business);
      if (spec.organizationKey) {
        businessMap.set(spec.organizationKey, {
          business,
          ownerId: user._id,
        });
      }

      await grantRequestorSeedCredit({
        businessId: business._id,
        userId: user._id,
        uniqueKey: `org:${String(business._id)}`,
      });
    } else if (spec.organizationKey && businessMap.has(spec.organizationKey)) {
      business = businessMap.get(spec.organizationKey).business;
      await attachUserToOrganization(user._id, business);
    }

    const effectiveLeaderId =
      referralGroupLeaderId ||
      referredByUserId ||
      user.referralGroupLeaderId ||
      user._id;

    createdRequestors.push({
      id: user._id,
      email: spec.email,
      name: spec.name,
      label: spec.label,
      requestorRole: spec.requestorRole,
      password,
      organizationKey: spec.organizationKey,
      leaderId: effectiveLeaderId,
    });
  }

  return {
    requestors: createdRequestors,
    salesmen: createdSalesmen,
  };
}
