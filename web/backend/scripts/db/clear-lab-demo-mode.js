// related files:
// - web/backend/controllers/businesses/business.demoMode.util.js
// - web/backend/scripts/db/_mongo.js
// 기공소(lab) 사업자의 데모 모드 잔여 플래그 해제. 데모는 치과 전용.
// 실행: cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true node scripts/db/clear-lab-demo-mode.js
import mongoose from "mongoose";
import { assertSafeToMutateDb, getMongoUri } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import ConversionInvoice from "../../models/conversionInvoice.model.js";
import { isPracticeRequestorAnchor } from "../../controllers/businesses/business.demoMode.util.js";

async function main() {
  const uri = getMongoUri();
  assertSafeToMutateDb(uri);
  await mongoose.connect(uri);

  const anchors = await BusinessAnchor.find({
    businessType: "requestor",
    demoMode: true,
  })
    .select({ name: 1, requestorKind: 1, requestorCapabilities: 1 })
    .lean();
  const labIds = anchors
    .filter((a) => !isPracticeRequestorAnchor(a))
    .map((a) => a._id);

  if (labIds.length) {
    const res = await BusinessAnchor.updateMany(
      { _id: { $in: labIds } },
      {
        $set: {
          demoMode: false,
          conversionPendingAt: null,
          conversionPendingReason: "",
        },
      },
    );
    await ConversionInvoice.updateMany(
      { businessAnchorId: { $in: labIds }, status: "PENDING" },
      { $set: { status: "CANCELED" } },
    );
    console.log("cleared lab demoMode", {
      matched: res.matchedCount,
      modified: res.modifiedCount,
    });
  } else {
    console.log("no lab demoMode anchors");
  }
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
