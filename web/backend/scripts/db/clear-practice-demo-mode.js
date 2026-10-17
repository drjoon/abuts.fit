// related files:
// - web/backend/controllers/businesses/business.demoMode.util.js
// - web/backend/scripts/db/_mongo.js
// 치과 데모 모드 폐지(후불 OB 자동정산 전환). 남은 demoMode 플래그·전환 대기·PENDING 전환 인보이스를 해제한다.
// 데모 중 쌓인 마이너스 잔액은 건드리지 않는다(정산은 별도 처리).
// 실행: cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true node scripts/db/clear-practice-demo-mode.js
import mongoose from "mongoose";
import { assertSafeToMutateDb, getMongoUri } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import ConversionInvoice from "../../models/conversionInvoice.model.js";

async function main() {
  const uri = getMongoUri();
  assertSafeToMutateDb(uri);
  await mongoose.connect(uri);
  console.log("db", mongoose.connection.name);

  const targets = await BusinessAnchor.find({
    businessType: "requestor",
    $or: [{ demoMode: true }, { conversionPendingAt: { $ne: null } }],
  })
    .select({ _id: 1 })
    .lean();
  const ids = targets.map((a) => a._id);
  if (!ids.length) {
    console.log("no demoMode anchors");
    await mongoose.disconnect();
    return;
  }

  const now = new Date();
  const res = await BusinessAnchor.updateMany(
    { _id: { $in: ids } },
    {
      $set: {
        demoMode: false,
        demoModeExitedAt: now,
        conversionPendingAt: null,
        conversionPendingReason: "",
      },
    },
  );
  const inv = await ConversionInvoice.updateMany(
    { businessAnchorId: { $in: ids }, status: "PENDING" },
    { $set: { status: "CANCELED" } },
  );
  console.log("cleared practice demoMode", {
    matched: res.matchedCount,
    modified: res.modifiedCount,
    canceledInvoices: inv.modifiedCount,
  });
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
