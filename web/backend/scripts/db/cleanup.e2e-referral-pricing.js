import "../../bootstrap/env.js";
import { connectDb, disconnectDb } from "./_mongo.js";
import User from "../../models/user.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import Request from "../../models/request.model.js";

const PREFIX = (
  String(process.env.E2E_RP_PREFIX || "").trim() || "e2e.rp"
).toLowerCase();
const DOMAIN = String(process.env.E2E_RP_DOMAIN || "demo.abuts.fit").trim();

function emailOf(key) {
  return `${PREFIX}.${key}@${DOMAIN}`.toLowerCase();
}

const KEYS = ["a", "b", "c", "d", "e", "f"];

async function main() {
  await connectDb();
  try {
    const emails = KEYS.map((k) => emailOf(k));
    const users = await User.find({ email: { $in: emails } })
      .select({ _id: 1, email: 1, organizationId: 1 })
      .lean();

    const userIds = users.map((u) => u._id);
    const orgIds = users.map((u) => u.organizationId).filter(Boolean);

    if (orgIds.length) {
      await CreditLedger.deleteMany({
        $or: [
          { organizationId: { $in: orgIds } },
          { uniqueKey: new RegExp(`^e2e:rp:${PREFIX}:`, "i") },
        ],
      });

      await Request.deleteMany({
        $or: [
          { requestorOrganizationId: { $in: orgIds } },
          { requestor: { $in: userIds } },
        ],
      });

      await RequestorOrganization.deleteMany({
        $or: [
          { _id: { $in: orgIds } },
          { name: new RegExp(`^E2E RP Org`, "i") },
        ],
      });
    }

    if (userIds.length) {
      await User.deleteMany({ _id: { $in: userIds } });
    }

    console.log("[db] e2e referral-pricing cleanup done", {
      prefix: PREFIX,
      removedUsers: users.length,
      removedOrganizations: orgIds.length,
    });
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error("[db] e2e referral-pricing cleanup failed", err);
  process.exit(1);
});
