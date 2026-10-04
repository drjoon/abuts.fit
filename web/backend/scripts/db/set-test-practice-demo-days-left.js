// related files:
// - web/backend/controllers/businesses/business.demoMode.util.js
// - web/backend/scripts/db/_mongo.js
// 테스트 치과의 데모 남은 일수를 맞춘다(기본 1일). 전환 요청 상태·종료 이력은 초기화.
// 실행: cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//   node scripts/db/set-test-practice-demo-days-left.js [이름검색어=테스트치과] [남은일수=1]
import mongoose from "mongoose";
import { assertSafeToMutateDb, getMongoUri } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import ConversionInvoice from "../../models/conversionInvoice.model.js";
import {
  DEMO_MODE_DURATION_DAYS,
  isPracticeRequestorAnchor,
} from "../../controllers/businesses/business.demoMode.util.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

async function main() {
  const uri = getMongoUri();
  assertSafeToMutateDb(uri);
  await mongoose.connect(uri);

  const nameHint = String(process.argv[2] || "테스트치과").trim();
  const daysLeft = Math.max(0, Number(process.argv[3] || 1));
  const escaped = nameHint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const anchors = await BusinessAnchor.find({
    businessType: "requestor",
    name: new RegExp(escaped),
  })
    .select({ name: 1, requestorKind: 1, requestorCapabilities: 1 })
    .lean();
  const targets = anchors.filter((a) => isPracticeRequestorAnchor(a));
  if (!targets.length) {
    console.log("대상 치과 없음", { nameHint, found: anchors.length });
    await mongoose.disconnect();
    return;
  }

  const startedAt = new Date(
    Date.now() - (DEMO_MODE_DURATION_DAYS - daysLeft) * MS_PER_DAY,
  );
  for (const t of targets) {
    await BusinessAnchor.updateOne(
      { _id: t._id },
      {
        $set: {
          demoMode: true,
          demoModeStartedAt: startedAt,
          demoModeExitedAt: null,
          conversionPendingAt: null,
          conversionPendingReason: "",
        },
      },
    );
    await ConversionInvoice.updateMany(
      { businessAnchorId: t._id, status: "PENDING" },
      { $set: { status: "CANCELED" } },
    );
    console.log("set", {
      anchorId: String(t._id),
      name: t.name,
      daysLeft,
      startedAt,
    });
  }
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
