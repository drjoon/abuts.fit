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
    { new: true, upsert: true, setDefaultsOnInsert: true }
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
    { ordered: false }
  );

  await FilenameRule.bulkWrite(
    FILENAME_RULES_SEED.map((r) => ({
      updateOne: {
        filter: { ruleId: r.ruleId },
        update: r,
        upsert: true,
      },
    })),
    { ordered: false }
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

  // 기존 샘플 계정/조직 정리
  const legacyEmails = [
    "requestor.principal@demo.abuts.fit",
    "requestor.staff@demo.abuts.fit",
    "requestor.owner@demo.abuts.fit",
    "requestor.staff@demo.abuts.fit",
    "manufacturer.master@demo.abuts.fit",
    "manufacturer.owner@demo.abuts.fit",
    "manufacturer.staff@demo.abuts.fit",
    "admin.master@demo.abuts.fit",
    "admin.owner@demo.abuts.fit",
    "admin.staff@demo.abuts.fit",
  ];
  await User.deleteMany({ email: { $in: legacyEmails } });
  await RequestorOrganization.deleteMany({ name: "데모기공소" });

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
    { $set: { organizationId: org._id, organization: org.name } }
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
    }
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
    { upsert: true, new: true, setDefaultsOnInsert: true }
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
    { upsert: true, new: true, setDefaultsOnInsert: true }
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
