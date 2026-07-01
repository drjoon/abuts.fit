import { connectDb, disconnectDb } from "./_mongo.js";
import Request from "../../models/request.model.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const idx = args.indexOf(name);
    if (idx < 0) return "";
    return String(args[idx + 1] || "").trim();
  };

  const requestIdsRaw = getArg("--requestIds");
  const trackingNumber = getArg("--trackingNumber");
  const statusText = getArg("--statusText") || "집하완료";
  const statusCode = getArg("--statusCode") || "11";
  const yes = args.includes("--yes");

  const requestIds = requestIdsRaw
    .split(",")
    .map((v) => String(v || "").trim())
    .filter(Boolean);

  return {
    requestIds,
    trackingNumber,
    statusText,
    statusCode,
    yes,
  };
}

async function resolveTrackingNumber(targetRequests, explicitTrackingNumber) {
  const tn = String(explicitTrackingNumber || "").trim();
  if (tn) return tn;

  for (const req of targetRequests) {
    const ref = req?.deliveryInfoRef;
    const refId = String(ref?._id || ref || "").trim();
    if (!refId) continue;
    const delivery =
      typeof ref === "object" && ref?.trackingNumber !== undefined
        ? ref
        : await DeliveryInfo.findById(refId).lean();
    const candidate = String(delivery?.trackingNumber || "").trim();
    if (candidate) return candidate;
  }

  throw new Error(
    "trackingNumber를 찾지 못했습니다. --trackingNumber를 명시해서 다시 실행하세요.",
  );
}

async function run() {
  const { requestIds, trackingNumber, statusCode, statusText, yes } = parseArgs();

  if (!requestIds.length) {
    throw new Error("--requestIds 가 필요합니다. (comma-separated)");
  }

  await connectDb();
  try {
    const targetRequests = await Request.find({ requestId: { $in: requestIds } })
      .select({ requestId: 1, manufacturerStage: 1, deliveryInfoRef: 1, mailboxAddress: 1 })
      .populate("deliveryInfoRef");

    const foundRequestIds = new Set(
      targetRequests.map((r) => String(r?.requestId || "").trim()).filter(Boolean),
    );
    const missingRequestIds = requestIds.filter((id) => !foundRequestIds.has(id));

    const resolvedTrackingNumber = await resolveTrackingNumber(
      targetRequests,
      trackingNumber,
    );

    console.log("[merge-tracking-number] preview", {
      requestIds,
      found: foundRequestIds.size,
      missingRequestIds,
      trackingNumber: resolvedTrackingNumber,
      dryRun: !yes,
    });

    for (const req of targetRequests) {
      const deliveryRef = req?.deliveryInfoRef;
      const deliveryId = String(deliveryRef?._id || deliveryRef || "").trim();
      const beforeTrackingNumber = String(
        (typeof deliveryRef === "object" ? deliveryRef?.trackingNumber : "") || "",
      ).trim();
      console.log(
        `[merge-tracking-number] request=${String(req?.requestId || "")} mailbox=${String(req?.mailboxAddress || "")} stage=${String(req?.manufacturerStage || "")} deliveryId=${deliveryId || "-"} beforeTracking=${beforeTrackingNumber || "-"}`,
      );
    }

    if (!yes) {
      console.log("[merge-tracking-number] dry-run 완료. 실제 반영하려면 --yes를 추가하세요.");
      return;
    }

    let updatedCount = 0;
    for (const req of targetRequests) {
      const deliveryRef = req?.deliveryInfoRef;
      const deliveryId = String(deliveryRef?._id || deliveryRef || "").trim();
      if (!deliveryId) continue;

      const delivery =
        typeof deliveryRef === "object" && deliveryRef?.save
          ? deliveryRef
          : await DeliveryInfo.findById(deliveryId);
      if (!delivery) continue;

      delivery.trackingNumber = resolvedTrackingNumber;
      delivery.tracking = delivery.tracking || {};
      if (statusCode) delivery.tracking.lastStatusCode = statusCode;
      if (statusText) delivery.tracking.lastStatusText = statusText;
      if (!delivery.tracking.lastEventAt) delivery.tracking.lastEventAt = new Date();
      delivery.tracking.lastSyncedAt = new Date();
      await delivery.save();
      updatedCount += 1;
    }

    console.log("[merge-tracking-number] done", {
      updatedCount,
      trackingNumber: resolvedTrackingNumber,
    });
  } finally {
    await disconnectDb();
  }
}

run().catch((error) => {
  console.error("[merge-tracking-number] failed", error);
  process.exit(1);
});
