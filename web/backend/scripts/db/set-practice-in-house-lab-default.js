// related files:
// - web/backend/scripts/db/_mongo.js
// - web/backend/utils/requestorCapabilities.js
// 치과 기공실 유무 기본값. 이름에 「평온치과」가 있으면 있음(true), 그 외 치과는 없음(false).
// 기공소는 필드를 지운다. 기본은 dry-run, --apply 로 반영.
// 실행: cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//   node scripts/db/set-practice-in-house-lab-default.js [--apply]
import mongoose from "mongoose";
import { assertSafeToMutateDb, getMongoUri } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import { isPracticeRequestorAnchor } from "../../controllers/businesses/business.demoMode.util.js";

const WITH_LAB_NAME = "평온치과";

async function main() {
  const apply = process.argv.includes("--apply");
  const uri = getMongoUri();
  assertSafeToMutateDb(uri);
  await mongoose.connect(uri);

  const anchors = await BusinessAnchor.find({ businessType: "requestor" })
    .select({
      name: 1,
      requestorKind: 1,
      requestorCapabilities: 1,
      practiceHasInHouseLab: 1,
      members: 1,
      owners: 1,
      primaryContactUserId: 1,
    })
    .lean();

  let withLab = 0;
  let withoutLab = 0;
  let labCleared = 0;
  for (const a of anchors) {
    if (!isPracticeRequestorAnchor(a)) {
      if (a.requestorKind === "lab" && a.practiceHasInHouseLab != null) {
        labCleared += 1;
        if (apply) {
          await BusinessAnchor.updateOne(
            { _id: a._id },
            { $unset: { practiceHasInHouseLab: 1 } },
          );
        }
      }
      continue;
    }
    const value = String(a.name || "").includes(WITH_LAB_NAME);
    if (value) withLab += 1;
    else withoutLab += 1;
    console.log(value ? "with   " : "without", a.name);
    if (!apply) continue;
    await BusinessAnchor.updateOne(
      { _id: a._id },
      { $set: { practiceHasInHouseLab: value, requestorKind: "practice" } },
    );
    await User.updateMany(
      { businessAnchorId: a._id },
      { $set: { practiceHasInHouseLab: value } },
    );
  }

  console.log({ apply, withLab, withoutLab, labCleared });
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
