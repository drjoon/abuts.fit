import "../bootstrap/env.js";
import mongoose, { Types } from "mongoose";
import Request from "../models/request.model.js";
import { allocateVirtualMailboxAddress } from "../controllers/requests/mailbox.utils.js";

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  const requests = await Request.find({
    manufacturerStage: { $in: ["세척.패킹", "포장.발송"] },
    $or: [{ mailboxAddress: null }, { mailboxAddress: { $exists: false } }],
  })
    .populate("requestor", "organization organizationId")
    .select("requestId manufacturerStage mailboxAddress requestorOrganizationId requestor")
    .exec();

  console.log(`Found ${requests.length} requests without mailboxAddress.`);

  let updatedCount = 0;

  for (const request of requests) {
    const direct = request.requestorOrganizationId;
    const fallbackId =
      request.requestor?.organizationId ||
      request.requestor?.organization?._id ||
      request.requestor?.organization ||
      null;

    const resolvedRequestorOrgId = (() => {
      if (direct) return direct;
      if (!fallbackId) return null;
      const fallbackStr = String(fallbackId);
      if (!Types.ObjectId.isValid(fallbackStr)) return null;
      return typeof fallbackId === "string"
        ? new Types.ObjectId(fallbackStr)
        : fallbackId;
    })();

    try {
      request.mailboxAddress = await allocateVirtualMailboxAddress(
        resolvedRequestorOrgId,
      );
      await request.save();
      updatedCount += 1;
      console.log(
        `[MAILBOX_BACKFILL] ${request.requestId} -> ${request.mailboxAddress}`,
      );
    } catch (error) {
      console.error("[MAILBOX_BACKFILL_ERROR]", {
        requestId: request.requestId,
        error: error?.message || String(error),
      });
    }
  }

  console.log(`Backfill completed. Updated ${updatedCount} requests.`);
  await mongoose.disconnect();
}

run().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
