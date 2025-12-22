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
  const principalEmail = "requestor.principal@demo.abuts.fit";
  const principal = await User.create({
    name: "데모 주대표",
    email: principalEmail,
    password: "password123",
    role: "requestor",
    phoneNumber: "01000000001",
    organization: "데모기공소",
    referralCode: "seed_requestor_principal",
    approvedAt: NOW,
    active: true,
  });

  const org = await RequestorOrganization.create({
    name: "데모기공소",
    owner: principal._id,
    owners: [],
    members: [principal._id],
    joinRequests: [],
  });

  await User.updateOne(
    { _id: principal._id },
    { $set: { organizationId: org._id, organization: org.name } }
  );

  const staff = await User.create({
    name: "데모 직원",
    email: "requestor.staff@demo.abuts.fit",
    password: "password123",
    role: "requestor",
    phoneNumber: "01000000002",
    organization: "",
    referralCode: "seed_requestor_staff",
    approvedAt: NOW,
    active: true,
    organizationId: org._id,
  });

  await RequestorOrganization.updateOne(
    { _id: org._id },
    { $addToSet: { members: { $each: [principal._id, staff._id] } } }
  );

  const manufacturer = await User.create({
    name: "데모 제조사",
    email: "manufacturer.master@demo.abuts.fit",
    password: "password123",
    role: "manufacturer",
    phoneNumber: "01000000003",
    organization: "애크로덴트",
    referralCode: "seed_manufacturer_master",
    approvedAt: NOW,
    active: true,
  });

  const admin = await User.create({
    name: "데모 관리자",
    email: "admin.master@demo.abuts.fit",
    password: "password123",
    role: "admin",
    phoneNumber: "01000000004",
    organization: "어벗츠핏",
    referralCode: "seed_admin_master",
    approvedAt: NOW,
    active: true,
  });

  await CreditLedger.create({
    organizationId: org._id,
    userId: principal._id,
    type: "CHARGE",
    amount: 500000,
    refType: "SEED_DEV",
    refId: null,
    uniqueKey: "seed:dev:credit:initial",
  });

  await ImplantPreset.findOneAndUpdate(
    {
      requestor: principal._id,
      clinicName: "데모치과",
      patientName: "홍길동",
      tooth: "11",
    },
    {
      $set: {
        requestor: principal._id,
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
      requestor: principal._id,
      clinicName: "데모치과",
      manufacturer: "OSSTEM",
      system: "Regular",
      type: "Hex",
    },
    {
      $setOnInsert: {
        requestor: principal._id,
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

  return { org, principal, staff, manufacturer, admin };
}

async function run() {
  try {
    await connectDb();
    await clearAllCollections();
    await seedCore();
    const seeded = await seedDev();

    console.log("[db] reset + seed done", {
      requestorPrincipal: {
        email: "requestor.principal@demo.abuts.fit",
        password: "password123",
        userId: String(seeded.principal._id),
        organizationId: String(seeded.org._id),
      },
      requestorStaff: {
        email: "requestor.staff@demo.abuts.fit",
        password: "password123",
        userId: String(seeded.staff._id),
        organizationId: String(seeded.org._id),
      },
      manufacturer: {
        email: "manufacturer.master@demo.abuts.fit",
        password: "password123",
        userId: String(seeded.manufacturer._id),
      },
      admin: {
        email: "admin.master@demo.abuts.fit",
        password: "password123",
        userId: String(seeded.admin._id),
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
