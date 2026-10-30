// related files:
// - web/backend/utils/internalDepartments.util.js
// - web/backend/scripts/db/_mongo.js
import BusinessAnchor from "../../models/businessAnchor.model.js";
import {
  ensureDefaultDepartments,
  getDefaultDepartmentNames,
  usesPairedDefaultDepartments,
} from "../../utils/internalDepartments.util.js";
import { connectDb, disconnectDb, getDbNameFromMongoUri, getMongoUri } from "./_mongo.js";

async function main() {
  const { mongoUri } = await connectDb();
  const dbName = getDbNameFromMongoUri(mongoUri);
  if (dbName !== "abuts_fit_test") {
    throw new Error(`expected abuts_fit_test, got ${dbName}`);
  }

  const anchors = await BusinessAnchor.find({
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
  }).select({
    name: 1,
    businessType: 1,
    requestorKind: 1,
    internalDepartments: 1,
    primaryContactUserId: 1,
    owners: 1,
  });

  const summary = [];
  for (const anchor of anchors) {
    if (!usesPairedDefaultDepartments(anchor)) continue;
    const before = (anchor.internalDepartments || []).map((row) => row.name);
    await ensureDefaultDepartments(anchor);
    const after = (anchor.internalDepartments || []).map((row) => row.name);
    summary.push({
      name: anchor.name,
      businessType: anchor.businessType,
      requestorKind: anchor.requestorKind || "",
      before,
      after,
      expected: getDefaultDepartmentNames(anchor),
    });
  }

  console.log(JSON.stringify({ count: summary.length, summary }, null, 2));
  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDb().catch(() => {});
  process.exit(1);
});
