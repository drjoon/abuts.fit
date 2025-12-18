import User from "../../models/user.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import ImplantPreset from "../../models/implantPreset.model.js";
import ClinicImplantPreset from "../../models/clinicImplantPreset.model.js";
import { connectDb, disconnectDb } from "./_mongo.js";

const NOW = new Date();

async function ensureUser({ email, createDoc, patchDoc }) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  const existing = await User.findOne({ email: normalizedEmail }).select({
    _id: 1,
  });

  if (!existing) {
    const created = new User({ ...createDoc, email: normalizedEmail });
    await created.save();
    return await User.findById(created._id).select("-password");
  }

  const doc = await User.findById(existing._id).select("+password");
  if (!doc) {
    return await User.findOne({ email: normalizedEmail }).select("-password");
  }

  const patch = patchDoc && typeof patchDoc === "object" ? patchDoc : {};
  Object.assign(doc, patch);

  if (
    createDoc &&
    typeof createDoc.password === "string" &&
    createDoc.password
  ) {
    doc.password = createDoc.password;
  }

  await doc.save();
  return await User.findById(existing._id).select("-password");
}

async function ensureRequestorOrg({ orgName, ownerId }) {
  let org = await RequestorOrganization.findOne({
    name: orgName,
    owner: ownerId,
  });

  if (!org) {
    org = await RequestorOrganization.create({
      name: orgName,
      owner: ownerId,
      coOwners: [],
      members: [ownerId],
      joinRequests: [],
    });
  } else {
    await RequestorOrganization.updateOne(
      { _id: org._id },
      { $addToSet: { members: ownerId } }
    );
  }

  return org;
}

async function ensureUserOrgLink({ userId, org }) {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        organizationId: org._id,
        organization: org.name,
      },
    }
  );
}

async function ensureCredit({ organizationId, userId, amount }) {
  const uniqueKey = "seed:dev:credit:initial";
  await CreditLedger.findOneAndUpdate(
    { uniqueKey },
    {
      $set: {
        organizationId,
        userId,
        type: "CHARGE",
        amount,
        refType: "SEED_DEV",
        refId: null,
        uniqueKey,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function ensureImplantPreset({ requestorId }) {
  const preset = {
    requestor: requestorId,
    clinicName: "데모치과",
    patientName: "홍길동",
    tooth: "11",
    manufacturer: "OSSTEM",
    system: "Regular",
    type: "Hex",
    lastUsedAt: NOW,
  };

  await ImplantPreset.findOneAndUpdate(
    {
      requestor: preset.requestor,
      clinicName: preset.clinicName,
      patientName: preset.patientName,
      tooth: preset.tooth,
    },
    { $set: preset },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await ClinicImplantPreset.findOneAndUpdate(
    {
      requestor: preset.requestor,
      clinicName: preset.clinicName,
      manufacturer: preset.manufacturer,
      system: preset.system,
      type: preset.type,
    },
    {
      $setOnInsert: {
        requestor: preset.requestor,
        clinicName: preset.clinicName,
        manufacturer: preset.manufacturer,
        system: preset.system,
        type: preset.type,
        useCount: 1,
      },
      $set: { lastUsedAt: NOW },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function run() {
  try {
    await connectDb();

    const requestorPrincipalEmail = "requestor.principal@demo.abuts.fit";
    const requestorStaffEmail = "requestor.staff@demo.abuts.fit";
    const manufacturerEmail = "manufacturer.master@demo.abuts.fit";
    const adminEmail = "admin.master@demo.abuts.fit";

    const principal = await ensureUser({
      email: requestorPrincipalEmail,
      createDoc: {
        name: "데모 주대표",
        password: "password123",
        role: "requestor",
        position: "principal",
        phoneNumber: "01000000001",
        organization: "데모기공소",
        referralCode: "seed_requestor_principal",
        approvedAt: NOW,
        active: true,
      },
      patchDoc: {
        name: "데모 주대표",
        role: "requestor",
        position: "principal",
        organization: "데모기공소",
        referralCode: "seed_requestor_principal",
        approvedAt: NOW,
        active: true,
      },
    });

    const org = await ensureRequestorOrg({
      orgName: "데모기공소",
      ownerId: principal._id,
    });
    await ensureUserOrgLink({ userId: principal._id, org });

    const staff = await ensureUser({
      email: requestorStaffEmail,
      createDoc: {
        name: "데모 직원",
        password: "password123",
        role: "requestor",
        position: "staff",
        phoneNumber: "01000000002",
        organization: "",
        referralCode: "seed_requestor_staff",
        approvedAt: NOW,
        active: true,
        organizationId: org._id,
      },
      patchDoc: {
        name: "데모 직원",
        role: "requestor",
        position: "staff",
        organizationId: org._id,
        referralCode: "seed_requestor_staff",
        approvedAt: NOW,
        active: true,
      },
    });

    await RequestorOrganization.updateOne(
      { _id: org._id },
      { $addToSet: { members: { $each: [principal._id, staff._id] } } }
    );

    const manufacturer = await ensureUser({
      email: manufacturerEmail,
      createDoc: {
        name: "데모 제조사",
        password: "password123",
        role: "manufacturer",
        position: "master",
        phoneNumber: "01000000003",
        organization: "애크로덴트",
        referralCode: "seed_manufacturer_master",
        approvedAt: NOW,
        active: true,
      },
      patchDoc: {
        name: "데모 제조사",
        role: "manufacturer",
        position: "master",
        organization: "애크로덴트",
        referralCode: "seed_manufacturer_master",
        approvedAt: NOW,
        active: true,
      },
    });

    const admin = await ensureUser({
      email: adminEmail,
      createDoc: {
        name: "데모 관리자",
        password: "password123",
        role: "admin",
        position: "master",
        phoneNumber: "01000000004",
        organization: "어벗츠핏",
        referralCode: "seed_admin_master",
        approvedAt: NOW,
        active: true,
      },
      patchDoc: {
        name: "데모 관리자",
        role: "admin",
        position: "master",
        organization: "어벗츠핏",
        referralCode: "seed_admin_master",
        approvedAt: NOW,
        active: true,
      },
    });

    await ensureCredit({
      organizationId: org._id,
      userId: principal._id,
      amount: 500000,
    });

    await ensureImplantPreset({ requestorId: principal._id });

    console.log("[db] seed dev done", {
      requestorPrincipal: {
        email: requestorPrincipalEmail,
        password: "password123",
        userId: String(principal._id),
        organizationId: String(org._id),
      },
      requestorStaff: {
        email: requestorStaffEmail,
        password: "password123",
        userId: String(staff._id),
        organizationId: String(org._id),
      },
      manufacturer: {
        email: manufacturerEmail,
        password: "password123",
        userId: String(manufacturer._id),
      },
      admin: {
        email: adminEmail,
        password: "password123",
        userId: String(admin._id),
      },
    });
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error("[db] seed dev failed", err);
  process.exit(1);
});
