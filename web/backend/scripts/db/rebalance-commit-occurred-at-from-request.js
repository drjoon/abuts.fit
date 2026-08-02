// related files:
// - web/backend/rules.md
// - web/backend/scripts/db/_mongo.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/models/request.model.js
// - web/backend/models/shippingPackage.model.js
import { connectDb, disconnectDb } from "./_mongo.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import Request from "../../models/request.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";

const MIGRATION_SOURCES = [
  "legacy_creditledger_rewrite",
  "request_history_verification",
];

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  const out = {
    execute: args.includes("--yes"),
    fromYmd: "",
    toYmd: "",
    limit: 0,
  };

  const fromIdx = args.findIndex((a) => a === "--from");
  if (fromIdx >= 0 && args[fromIdx + 1]) {
    out.fromYmd = String(args[fromIdx + 1] || "").trim();
  }

  const toIdx = args.findIndex((a) => a === "--to");
  if (toIdx >= 0 && args[toIdx + 1]) {
    out.toYmd = String(args[toIdx + 1] || "").trim();
  }

  const limitIdx = args.findIndex((a) => a === "--limit");
  if (limitIdx >= 0 && args[limitIdx + 1]) {
    const n = Number(args[limitIdx + 1]);
    out.limit = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  return out;
}

function toDateRangeFromYmd(fromYmd, toYmd) {
  const matchYmd = /^\d{4}-\d{2}-\d{2}$/;
  const occurredAt = {};
  if (matchYmd.test(fromYmd)) {
    const from = new Date(`${fromYmd}T00:00:00.000+09:00`);
    if (!Number.isNaN(from.getTime())) occurredAt.$gte = from;
  }
  if (matchYmd.test(toYmd)) {
    const to = new Date(`${toYmd}T23:59:59.999+09:00`);
    if (!Number.isNaN(to.getTime())) occurredAt.$lte = to;
  }
  return Object.keys(occurredAt).length > 0 ? occurredAt : null;
}

function toIso(v) {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function pickRequestOccurredAt(req) {
  if (!req) return null;
  const ps = req.productionSchedule || {};
  const candidates = [
    ps.actualMachiningStart,
    ps.actualMachiningComplete,
    req.createdAt,
  ];
  for (const c of candidates) {
    if (!c) continue;
    const d = new Date(c);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function pickShippingOccurredAt(pkg, req) {
  const ps = req?.productionSchedule || {};
  const candidates = [
    pkg?.createdAt,
    ps.actualBatchProcessing,
    req?.createdAt,
  ];
  for (const c of candidates) {
    if (!c) continue;
    const d = new Date(c);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

async function run() {
  const cli = parseArgs(process.argv || []);
  console.log(
    `[rebalance-commit-occurred-at-from-request] mode=${cli.execute ? "APPLY" : "DRY_RUN"}`,
  );

  await connectDb();
  try {
    const occurredAtRange = toDateRangeFromYmd(cli.fromYmd, cli.toYmd);
    const query = {
      eventType: { $in: ["REQUEST_SPEND_COMMIT", "SHIPPING_SPEND_COMMIT"] },
      "meta.migration.source": { $in: MIGRATION_SOURCES },
      ...(occurredAtRange ? { occurredAt: occurredAtRange } : {}),
    };

    const cursor = LedgerJournal.find(query)
      .select({
        journalId: 1,
        eventType: 1,
        refType: 1,
        refId: 1,
        occurredAt: 1,
        meta: 1,
      })
      .sort({ occurredAt: 1, _id: 1 });
    if (cli.limit > 0) cursor.limit(cli.limit);

    const journals = await cursor.lean();

    const requestIdSet = new Set();
    const shippingPackageIdSet = new Set();
    for (const j of journals) {
      const refId = String(j?.refId || "").trim();
      if (!refId) continue;
      if (String(j?.eventType || "") === "REQUEST_SPEND_COMMIT") {
        requestIdSet.add(refId);
      } else if (String(j?.eventType || "") === "SHIPPING_SPEND_COMMIT") {
        shippingPackageIdSet.add(refId);
      }
    }

    const [requests, shippingPackages] = await Promise.all([
      requestIdSet.size
        ? Request.find({ _id: { $in: Array.from(requestIdSet) } })
            .select({
              _id: 1,
              requestId: 1,
              createdAt: 1,
              productionSchedule: 1,
            })
            .lean()
        : [],
      shippingPackageIdSet.size
        ? ShippingPackage.find({ _id: { $in: Array.from(shippingPackageIdSet) } })
            .select({ _id: 1, createdAt: 1, requestIds: 1 })
            .lean()
        : [],
    ]);

    const requestMap = new Map((requests || []).map((r) => [String(r._id), r]));
    const packageMap = new Map(
      (shippingPackages || []).map((p) => [String(p._id), p]),
    );

    const updates = [];
    let skippedNoSourceTime = 0;

    for (const j of journals) {
      const journalId = String(j?.journalId || "").trim();
      const eventType = String(j?.eventType || "").trim();
      const refId = String(j?.refId || "").trim();
      if (!journalId || !eventType || !refId) continue;

      let targetOccurredAt = null;
      let requestId = null;

      if (eventType === "REQUEST_SPEND_COMMIT") {
        const req = requestMap.get(refId) || null;
        requestId = req?.requestId || null;
        targetOccurredAt = pickRequestOccurredAt(req);
      } else if (eventType === "SHIPPING_SPEND_COMMIT") {
        const pkg = packageMap.get(refId) || null;
        const reqId = Array.isArray(pkg?.requestIds) && pkg.requestIds.length > 0
          ? String(pkg.requestIds[0])
          : "";
        const req = reqId ? requestMap.get(reqId) || null : null;
        requestId = req?.requestId || null;
        targetOccurredAt = pickShippingOccurredAt(pkg, req);
      }

      if (!targetOccurredAt) {
        skippedNoSourceTime += 1;
        continue;
      }

      const currentOccurredAt = new Date(j.occurredAt || 0);
      if (Number.isNaN(currentOccurredAt.getTime())) {
        skippedNoSourceTime += 1;
        continue;
      }

      if (currentOccurredAt.getTime() === targetOccurredAt.getTime()) {
        continue;
      }

      updates.push({
        journalId,
        eventType,
        refId,
        requestId,
        currentOccurredAt,
        targetOccurredAt,
      });
    }

    const sample = updates.slice(0, 20).map((u) => ({
      journalId: u.journalId,
      eventType: u.eventType,
      requestId: u.requestId,
      currentOccurredAt: toIso(u.currentOccurredAt),
      targetOccurredAt: toIso(u.targetOccurredAt),
    }));

    console.log(
      JSON.stringify(
        {
          scannedJournals: journals.length,
          candidateUpdates: updates.length,
          skippedNoSourceTime,
          sample,
        },
        null,
        2,
      ),
    );

    if (!cli.execute) {
      console.log(
        "[rebalance-commit-occurred-at-from-request] DRY_RUN complete. Add --yes to apply.",
      );
      return;
    }

    const BATCH_SIZE = 300;
    let applied = 0;

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      // 저널/라인의 occurredAt을 동기화
      // 단건 updateMany 루프를 사용해 변경 대상이 명확한 journalId만 갱신한다.
      for (const u of batch) {
        await LedgerJournal.updateOne(
          { journalId: u.journalId },
          { $set: { occurredAt: u.targetOccurredAt } },
        );
        await LedgerLine.updateMany(
          { journalId: u.journalId },
          { $set: { occurredAt: u.targetOccurredAt } },
        );
        applied += 1;
      }
      console.log(
        `[rebalance-commit-occurred-at-from-request] applied ${applied}/${updates.length}`,
      );
    }

    console.log(
      `[rebalance-commit-occurred-at-from-request] APPLY done. updated=${applied}`,
    );
  } finally {
    await disconnectDb();
  }
}

run().catch((error) => {
  console.error("[rebalance-commit-occurred-at-from-request] failed", error);
  process.exit(1);
});
