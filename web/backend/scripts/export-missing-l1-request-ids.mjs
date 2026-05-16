#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { connectDb, disconnectDb } from "./db/_mongo.js";
import Request from "../models/request.model.js";

function parseArgs(argv) {
  const args = {
    out: "./tmp/recalc-l1/requestIds.txt",
    includeCanceled: false,
    limit: 0,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--out") {
      args.out = argv[++i];
      continue;
    }
    if (a === "--include-canceled") {
      args.includeCanceled = true;
      continue;
    }
    if (a === "--limit") {
      args.limit = Number(argv[++i] || 0) || 0;
      continue;
    }
    if (a === "-h" || a === "--help") {
      console.log(`Usage: node export-missing-l1-request-ids.mjs [options]\n\nOptions:\n  --out <path>             output txt path (default: ./tmp/recalc-l1/requestIds.txt)\n  --include-canceled       include canceled requests\n  --limit <n>              limit count (0 = no limit)\n`);
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${a}`);
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const outPath = path.resolve(process.cwd(), args.out);
  const outDir = path.dirname(outPath);

  await connectDb();
  try {
    const query = {
      $or: [{ "caseInfos.l1": { $exists: false } }, { "caseInfos.l1": null }],
    };
    if (!args.includeCanceled) {
      query.manufacturerStage = { $ne: "취소" };
    }

    let q = Request.find(query)
      .select({ _id: 0, requestId: 1 })
      .sort({ createdAt: 1 })
      .lean();

    if (args.limit > 0) q = q.limit(args.limit);

    const rows = await q;
    const ids = rows
      .map((r) => String(r?.requestId || "").trim())
      .filter(Boolean);

    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(outPath, ids.join("\n") + (ids.length ? "\n" : ""), "utf8");

    console.log(JSON.stringify({ ok: true, outPath, count: ids.length }, null, 2));
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }));
  process.exit(1);
});
