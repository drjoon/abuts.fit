// related files:
// - web/backend/services/requestBackup.service.js
// - web/backend/jobs/hourlyRequestBackupWorker.js
// - web/backend/rules.md
//
// Usage:
//   ENV_FILE=local.env node scripts/db/run-request-backup-once.js
//   ENV_FILE=local.env node scripts/db/run-request-backup-once.js --full
//   ENV_FILE=local.env node scripts/db/run-request-backup-once.js --incremental
import "../../bootstrap/env.js";
import mongoose from "mongoose";
import { resolveMongoUri } from "../../utils/mongoUri.js";
import { runRequestBackupOnce } from "../../services/requestBackup.service.js";

function parseArgs(argv) {
  const forceFull = argv.includes("--full");
  const forceIncremental = argv.includes("--incremental");
  return { forceFull, forceIncremental };
}

async function main() {
  const { forceFull, forceIncremental } = parseArgs(process.argv.slice(2));
  const uri = resolveMongoUri();
  await mongoose.connect(uri);
  try {
    const result = await runRequestBackupOnce({
      kind: "manual",
      forceFull,
      mode: forceIncremental ? "incremental" : forceFull ? "full" : null,
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("[run-request-backup-once] failed", err?.message || err);
  process.exitCode = 1;
});
