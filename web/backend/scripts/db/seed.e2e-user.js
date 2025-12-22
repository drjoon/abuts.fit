import "../../bootstrap/env.js";
import { connectDb, disconnectDb } from "./_mongo.js";
import User from "../../models/user.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import GuideProgress from "../../models/guideProgress.model.js";

const COMPLETE_EMAIL =
  String(process.env.E2E_SEED_EMAIL || "")
    .trim()
    .toLowerCase() || "e2e.requestor@demo.abuts.fit";
const COMPLETE_PASSWORD =
  String(process.env.E2E_SEED_PASSWORD || "").trim() || "E2E_password123!";
const COMPLETE_NAME =
  String(process.env.E2E_SEED_NAME || "").trim() || "E2E 자동화 사용자";
const COMPLETE_ORG =
  String(process.env.E2E_SEED_ORG || "").trim() || "E2E 테스트 기공소";

const INCOMPLETE_EMAIL =
  String(process.env.E2E_SEED_INCOMPLETE_EMAIL || "")
    .trim()
    .toLowerCase() || "e2e.requestor2@demo.abuts.fit";
const INCOMPLETE_PASSWORD =
  String(process.env.E2E_SEED_INCOMPLETE_PASSWORD || "").trim() ||
  "E2E_password123!";
const INCOMPLETE_NAME =
  String(process.env.E2E_SEED_INCOMPLETE_NAME || "").trim() ||
  "E2E 미완료 사용자";
const INCOMPLETE_ORG =
  String(process.env.E2E_SEED_INCOMPLETE_ORG || "").trim() ||
  "E2E 미완료 기공소";

const now = new Date();

async function upsertUser({ email, password, name, org }) {
  let user = await User.findOne({ email }).select("+password");
  if (!user) {
    user = new User({
      name,
      email,
      password,
      role: "requestor",
      phoneNumber: "01099998888",
      organization: org,
      approvedAt: now,
      active: true,
    });
  } else {
    user.name = name;
    user.role = "requestor";
    user.organization = org;
    user.approvedAt = now;
    user.active = true;
    if (password) {
      user.password = password;
    }
  }
  await user.save();
  return await User.findOne({ email }).select("-password");
}

async function ensureOrganization(user, orgName) {
  let org = await RequestorOrganization.findOne({
    owner: user._id,
    name: orgName,
  });
  if (!org) {
    org = await RequestorOrganization.create({
      name: orgName,
      owner: user._id,
      owners: [],
      members: [user._id],
      joinRequests: [],
    });
  } else {
    await RequestorOrganization.updateOne(
      { _id: org._id },
      { $addToSet: { members: user._id } }
    );
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        organizationId: org._id,
        organization: org.name,
      },
    }
  );

  return org;
}

async function hydrateGuideProgress(user, mode) {
  for (const tourId of ["requestor-onboarding", "requestor-new-request"]) {
    const doc = await GuideProgress.ensureForUser(user._id, tourId);
    doc.steps = GuideProgress.getDefaultSteps(tourId);
    if (mode === "incomplete" && tourId === "requestor-onboarding") {
      const completedIds = new Set([
        "requestor.account.profileImage",
        "requestor.phone.number",
        "requestor.phone.code",
      ]);
      doc.steps = doc.steps.map((step) => {
        if (completedIds.has(step.stepId)) {
          return { ...step, status: "done", doneAt: step.doneAt || now };
        }
        return { ...step, status: "pending", doneAt: null };
      });
      doc.finishedAt = null;
    } else {
      doc.steps = doc.steps.map((step) => ({
        ...step,
        status: "pending",
        doneAt: null,
      }));
      doc.finishedAt = null;
    }
    await doc.save();
  }
}

async function main() {
  await connectDb();
  try {
    const completeUser = await upsertUser({
      email: COMPLETE_EMAIL,
      password: COMPLETE_PASSWORD,
      name: COMPLETE_NAME,
      org: COMPLETE_ORG,
    });
    const completeOrg = await ensureOrganization(completeUser, COMPLETE_ORG);
    await hydrateGuideProgress(completeUser, "fresh");

    const incompleteUser = await upsertUser({
      email: INCOMPLETE_EMAIL,
      password: INCOMPLETE_PASSWORD,
      name: INCOMPLETE_NAME,
      org: INCOMPLETE_ORG,
    });
    const incompleteOrg = await ensureOrganization(
      incompleteUser,
      INCOMPLETE_ORG
    );
    await hydrateGuideProgress(incompleteUser, "incomplete");

    console.log("[db] e2e user ready", {
      freshUser: {
        email: COMPLETE_EMAIL,
        password: COMPLETE_PASSWORD,
        userId: String(completeUser._id),
        organizationId: String(completeOrg._id),
      },
      incompleteUser: {
        email: INCOMPLETE_EMAIL,
        password: INCOMPLETE_PASSWORD,
        userId: String(incompleteUser._id),
        organizationId: String(incompleteOrg._id),
      },
    });
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error("[db] e2e user seed failed", err);
  process.exit(1);
});
