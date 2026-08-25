// related files:
// - web/backend/models/machiningRecord.model.js
// - web/backend/controllers/cnc/machiningBridge.js
// - web/backend/controllers/requests/common.requests.controller.js
/**
 * Orphan MachiningRecord backfill:
 * - requestId set but Request missing → requestDeletedAt
 * - bridgePath/originalFileName 에서 clinic/patient/tooth 파싱 가능하면 스냅샷 채움
 *
 * Usage:
 *   cd web/backend && ENV_FILE=local.env NODE_ENV=test node scripts/db/backfill-orphan-machining-labels.js
 *   ... ABUTS_DB_FORCE=true ... --apply
 *
 * Dry-run (default). Pass --apply to mutate.
 */
import { connectDb, disconnectDb } from "./_mongo.js";
import mongoose from "mongoose";

const APPLY = process.argv.includes("--apply");

/** NC basename: `{requestId}-{clinic}-{patient}-{tooth}.nc` */
function parseLabelFromNcPath(raw) {
  const path = String(raw || "").trim();
  if (!path) return null;
  const base = path.split(/[/\\]/).pop() || "";
  const m = base.match(
    /^(\d{8}-[A-Za-z0-9]+)-(.+)-([^-]+)-(\d+)\.(?:nc|NC)$/,
  );
  if (!m) return null;
  const clinicName = String(m[2] || "").trim() || null;
  const patientName = String(m[3] || "").trim() || null;
  const tooth = String(m[4] || "").trim() || null;
  if (!clinicName && !patientName && !tooth) return null;
  const parts = [clinicName, patientName, tooth].filter(Boolean);
  return {
    clinicName,
    patientName,
    tooth,
    displayLabel: parts.length ? parts.join(" ") : null,
    requestCategory: "copied_sample",
  };
}

await connectDb();
const db = mongoose.connection.db;

const candidates = await db
  .collection("machiningrecords")
  .find({
    status: "COMPLETED",
    requestId: { $nin: [null, ""] },
  })
  .project({
    requestId: 1,
    completedAt: 1,
    bridgePath: 1,
    originalFileName: 1,
    fileName: 1,
    clinicName: 1,
    patientName: 1,
    tooth: 1,
    requestDeletedAt: 1,
    displayLabel: 1,
    requestCategory: 1,
  })
  .toArray();

const requestIds = [
  ...new Set(
    candidates.map((r) => String(r.requestId || "").trim()).filter(Boolean),
  ),
];
const existing = new Set(
  (
    await db
      .collection("requests")
      .find({ requestId: { $in: requestIds } })
      .project({ requestId: 1 })
      .toArray()
  ).map((r) => String(r.requestId)),
);

const orphans = candidates.filter(
  (r) => !existing.has(String(r.requestId || "").trim()),
);

console.log("[backfill-orphan-machining-labels]", {
  apply: APPLY,
  completedWithRequestId: candidates.length,
  orphanCount: orphans.length,
});

let updated = 0;
for (const rec of orphans) {
  const parsed =
    parseLabelFromNcPath(rec.bridgePath) ||
    parseLabelFromNcPath(rec.originalFileName) ||
    parseLabelFromNcPath(rec.fileName);

  const $set = {
    requestDeletedAt: rec.requestDeletedAt || rec.completedAt || new Date(),
  };
  if (parsed) {
    if (!rec.clinicName && parsed.clinicName) $set.clinicName = parsed.clinicName;
    if (!rec.patientName && parsed.patientName)
      $set.patientName = parsed.patientName;
    if (!rec.tooth && parsed.tooth) $set.tooth = parsed.tooth;
    if (!rec.displayLabel && parsed.displayLabel)
      $set.displayLabel = parsed.displayLabel;
    if (!rec.requestCategory && parsed.requestCategory)
      $set.requestCategory = parsed.requestCategory;
  }

  console.log(
    JSON.stringify({
      id: String(rec._id),
      requestId: rec.requestId,
      set: $set,
    }),
  );

  if (APPLY) {
    await db
      .collection("machiningrecords")
      .updateOne({ _id: rec._id }, { $set });
    updated += 1;
  }
}

console.log(
  APPLY
    ? `[done] updated=${updated}`
    : `[dry-run] would update=${orphans.length} (pass --apply)`,
);

await disconnectDb();
