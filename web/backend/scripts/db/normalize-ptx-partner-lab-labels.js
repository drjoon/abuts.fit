/**
 * PTX targetLabName / assigneeLabName 에 남은 「어벗츠 협력 ·」접두 제거.
 *
 * Usage:
 *   cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
 *     node scripts/db/normalize-ptx-partner-lab-labels.js [--dry-run]
 */
import { connectDb, disconnectDb } from "./_mongo.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";

const dryRun = process.argv.includes("--dry-run");

const stripPrefixes = (raw) => {
  let name = String(raw || "").trim();
  name = name.replace(/\s·\s인증 협력 기공소에서 처리$/, "").trim();
  for (let i = 0; i < 6; i += 1) {
    const next = name
      .replace(/^어벗츠\s*협력\s*기공소\s*·\s*/, "")
      .replace(/^어벗츠\s*협력\s*·\s*/, "")
      .replace(/^어벗츠\s*·\s*/, "")
      .replace(/^어벗츠기공소\s*·\s*/, "")
      .trim();
    if (next === name) break;
    name = next;
  }
  return name;
};

const shouldNormalizeStoredLabName = (raw) => {
  const s = String(raw || "").trim();
  if (!s) return false;
  return (
    s.startsWith("어벗츠 협력") ||
    s.startsWith("어벗츠 ·") ||
    s.includes("인증 협력 기공소에서 처리")
  );
};

await connectDb();

const rows = await PracticeTransfer.find({
  $or: [
    { assigneeLabName: /어벗츠/ },
    { targetLabName: /어벗츠 협력|어벗츠 ·/ },
  ],
})
  .select({ targetLabName: 1, assigneeLabName: 1, assigneeKind: 1 })
  .lean();

let updated = 0;
for (const doc of rows) {
  const next = {};
  if (shouldNormalizeStoredLabName(doc.assigneeLabName)) {
    const core = stripPrefixes(doc.assigneeLabName);
    if (core && core !== doc.assigneeLabName) next.assigneeLabName = core;
  }
  // 레거시 target 에 「어벗츠 협력 · X」만 정리(원청 어벗츠기공소는 유지)
  if (shouldNormalizeStoredLabName(doc.targetLabName)) {
    const core = stripPrefixes(doc.targetLabName);
    if (core && core !== "어벗츠기공소" && core !== doc.targetLabName) {
      next.targetLabName = core;
    }
  }
  if (!Object.keys(next).length) continue;
  updated += 1;
  if (dryRun) {
    console.log("[dry-run]", String(doc._id), {
      from: {
        target: doc.targetLabName,
        assignee: doc.assigneeLabName,
      },
      to: next,
    });
    continue;
  }
  await PracticeTransfer.updateOne({ _id: doc._id }, { $set: next });
}

console.log(JSON.stringify({ dryRun, scanned: rows.length, updated }, null, 2));
await disconnectDb();
