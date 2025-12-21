import "../../bootstrap/env.js";
import { connectDb, disconnectDb } from "./_mongo.js";
import User from "../../models/user.model.js";
import GuideProgress from "../../models/guideProgress.model.js";

const DEMO_EMAILS = [
  "requestor.principal@demo.abuts.fit",
  "requestor.staff@demo.abuts.fit",
];

const TOUR_IDS = ["requestor-onboarding", "requestor-new-request"];

const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();

async function resetGuideForUser(user) {
  for (const tourId of TOUR_IDS) {
    const doc = await GuideProgress.ensureForUser(user._id, tourId);
    doc.steps = GuideProgress.getDefaultSteps(tourId);
    doc.finishedAt = null;
    await doc.save();
    console.log(
      `[guide-progress] reset ${tourId} for ${user.email} (${user._id})`
    );
  }
}

async function main() {
  await connectDb();

  for (const email of DEMO_EMAILS) {
    const user = await User.findOne({ email: normalizeEmail(email) }).select(
      "_id email"
    );
    if (!user) {
      console.warn(`[guide-progress] user not found: ${email}`);
      continue;
    }
    await resetGuideForUser(user);
  }

  await disconnectDb();
}

main().catch((err) => {
  console.error("[guide-progress] seed failed", err);
  process.exitCode = 1;
});
