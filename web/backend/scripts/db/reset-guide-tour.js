// related files:
// - web/backend/models/user.model.js
// - web/backend/utils/guideTour.util.js
//
// 테스트치과·테스트기공소 소속 유저의 가이드투어를 미수료로 리셋.
//
// Usage:
//   cd web/backend && \
//     ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/db/reset-guide-tour.js
import mongoose from "mongoose";
import { assertSafeToMutateDb, getMongoUri } from "./_mongo.js";

const APPLY = process.argv.includes("--apply");

const TARGET_NAMES = ["테스트치과", "테스트기공소"];

async function main() {
  const uri = getMongoUri();
  assertSafeToMutateDb(uri);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  const db = mongoose.connection.db;
  const anchors = db.collection("businessanchors");
  const users = db.collection("users");

  const found = await anchors
    .find({
      $or: [
        { name: { $in: TARGET_NAMES } },
        { "profile.companyName": { $in: TARGET_NAMES } },
      ],
    })
    .project({ _id: 1, name: 1, "profile.companyName": 1, requestorKind: 1 })
    .toArray();

  console.log(
    "anchors",
    found.map((a) => ({
      id: String(a._id),
      name: a.name,
      companyName: a.profile?.companyName,
      kind: a.requestorKind,
    })),
  );

  if (found.length === 0) {
    // fallback: regex
    const fuzzy = await anchors
      .find({
        $or: [
          { name: /테스트(치과|기공소)/ },
          { "profile.companyName": /테스트(치과|기공소)/ },
        ],
      })
      .project({ _id: 1, name: 1, "profile.companyName": 1, requestorKind: 1 })
      .toArray();
    console.log(
      "fuzzy anchors",
      fuzzy.map((a) => ({
        id: String(a._id),
        name: a.name,
        companyName: a.profile?.companyName,
        kind: a.requestorKind,
      })),
    );
    found.push(...fuzzy);
  }

  const ids = found.map((a) => a._id);
  if (ids.length === 0) {
    console.log("No matching anchors. Nothing to do.");
    await mongoose.disconnect();
    process.exit(1);
  }

  const filter = {
    $or: [
      { businessAnchorId: { $in: ids } },
      { orgBusinessAnchorId: { $in: ids } },
    ],
  };
  const matchedUsers = await users
    .find(filter)
    .project({ _id: 1, email: 1, name: 1, guideTour: 1, businessAnchorId: 1 })
    .toArray();
  console.log(
    "users",
    matchedUsers.map((u) => ({
      id: String(u._id),
      email: u.email,
      name: u.name,
      guideTour: u.guideTour,
    })),
  );

  if (!APPLY) {
    console.log("Dry-run only. Re-run with --apply to mutate.");
    await mongoose.disconnect();
    return;
  }

  const result = await users.updateMany(filter, {
    $set: {
      "guideTour.completed": false,
      "guideTour.resumeStepId": null,
    },
  });
  console.log("updated", {
    matched: result.matchedCount,
    modified: result.modifiedCount,
  });
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
