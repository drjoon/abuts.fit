/**
 * 기존 PTX assigneeKind 백필.
 * - assignee 있고 claimedAt 없음 → cooperation
 * - assignee 있고 claimedAt 있음 → subcontract
 *
 * Usage:
 *   cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
 *     node scripts/db/backfill-ptx-assignee-kind.js [--dry-run]
 */
import { connectDb, disconnectDb } from "./_mongo.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";

const dryRun = process.argv.includes("--dry-run");

await connectDb();

const cursor = PracticeTransfer.find({
  assigneeLabAnchorId: { $type: "objectId" },
  $or: [{ assigneeKind: null }, { assigneeKind: { $exists: false } }],
})
  .select({
    assigneeLabAnchorId: 1,
    targetLabAnchorId: 1,
    assigneeKind: 1,
    "autoMatch.claimedAt": 1,
  })
  .cursor();

let scanned = 0;
let updated = 0;
for await (const doc of cursor) {
  scanned += 1;
  const prime = String(doc.targetLabAnchorId || "").trim();
  const assignee = String(doc.assigneeLabAnchorId || "").trim();
  if (!prime || !assignee || prime === assignee) continue;
  const kind = doc.autoMatch?.claimedAt ? "subcontract" : "cooperation";
  if (dryRun) {
    console.log("[dry-run]", String(doc._id), kind);
    updated += 1;
    continue;
  }
  await PracticeTransfer.updateOne(
    { _id: doc._id },
    { $set: { assigneeKind: kind } },
  );
  updated += 1;
}

console.log(
  JSON.stringify({ dryRun, scanned, updated }, null, 2),
);
await disconnectDb();
