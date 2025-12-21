import "../../bootstrap/env.js";
import { connectDb, disconnectDb } from "./_mongo.js";
import User from "../../models/user.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import GuideProgress from "../../models/guideProgress.model.js";

const TARGET_EMAILS = [
  String(process.env.E2E_SEED_EMAIL || "")
    .trim()
    .toLowerCase() || "e2e.requestor@demo.abuts.fit",
  String(process.env.E2E_SEED_INCOMPLETE_EMAIL || "")
    .trim()
    .toLowerCase() || "e2e.requestor2@demo.abuts.fit",
];

async function main() {
  await connectDb();
  try {
    for (const email of TARGET_EMAILS.filter(Boolean)) {
      const user = await User.findOne({ email });
      if (!user) {
        console.log("[db] e2e cleanup: user not found", { email });
        continue;
      }

      await GuideProgress.deleteMany({ user: user._id });

      const orgs = await RequestorOrganization.find({
        owner: user._id,
        name: /^E2E /i,
      }).select("_id");

      if (orgs.length > 0) {
        const orgIds = orgs.map((o) => o._id);
        await RequestorOrganization.deleteMany({ _id: { $in: orgIds } });
      }

      await User.deleteMany({ _id: user._id });

      console.log("[db] e2e cleanup done", {
        email,
        removedOrganizations: orgs.length,
      });
    }
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error("[db] e2e cleanup failed", err);
  process.exit(1);
});
