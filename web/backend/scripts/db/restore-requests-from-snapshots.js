// related files:
// - web/backend/rules.md
// - web/backend/tests/setup.js
// - web/backend/models/request.model.js
// - web/backend/controllers/admin/happyCallReasons.js
//
// Usage:
//   ENV_FILE=local.env ABUTS_DB_FORCE=true node scripts/db/restore-requests-from-snapshots.js
//   ENV_FILE=local.env ABUTS_DB_FORCE=true node scripts/db/restore-requests-from-snapshots.js --yes
//
// Jest wipe로 requests가 비었을 때, requestordashboardsummarysnapshots.recentRequests
// (+ ReviewApprovalQueue.payload)로 최소 복구한다. Atlas PITR이 있으면 그쪽이 우선.
import mongoose from "mongoose";
import { connectDb, disconnectDb, getDbNameFromMongoUri } from "./_mongo.js";

const yes = process.argv.includes("--yes");

function asObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  const s = String(value).trim();
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

function mergeRequestDocs(base, extra) {
  if (!extra || typeof extra !== "object") return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    if (v == null) continue;
    if (k === "_id" || k === "__v") continue;
    if (k === "caseInfos" && v && typeof v === "object") {
      out.caseInfos = { ...(out.caseInfos || {}), ...v };
      continue;
    }
    if (k === "productionSchedule" && v && typeof v === "object") {
      out.productionSchedule = { ...(out.productionSchedule || {}), ...v };
      continue;
    }
    if (k === "price" && v && typeof v === "object") {
      out.price = { ...(out.price || {}), ...v };
      continue;
    }
    if (k === "timeline" && v && typeof v === "object") {
      out.timeline = { ...(out.timeline || {}), ...v };
      continue;
    }
    if (k === "lotNumber" && v && typeof v === "object") {
      out.lotNumber = { ...(out.lotNumber || {}), ...v };
      continue;
    }
    if (out[k] == null || out[k] === "") {
      out[k] = v;
    }
  }
  return out;
}

function normalizeRestoredDoc({ snapDoc, businessAnchorId, raqPayload, requestIdFromRaq }) {
  const _id = asObjectId(snapDoc?._id);
  if (!_id) return null;

  let doc = {
    ...snapDoc,
    _id,
    businessAnchorId: asObjectId(businessAnchorId) || asObjectId(snapDoc?.businessAnchorId),
  };

  if (raqPayload) {
    doc = mergeRequestDocs(doc, raqPayload);
  }
  if (!doc.requestId && requestIdFromRaq) {
    doc.requestId = String(requestIdFromRaq).trim();
  }

  // Happy-call / dashboard filters require implantBrand on real requests.
  if (!doc.caseInfos) doc.caseInfos = {};
  if (!doc.caseInfos.implantBrand && doc.caseInfos.implantManufacturer) {
    // keep empty brand as-is; brand is preferred for filters
  }

  // Completion signal used by happy-call aggregates.
  const stage = String(doc.manufacturerStage || "").trim();
  if (stage === "추적관리") {
    doc.shippingWorkflow = {
      ...(doc.shippingWorkflow || {}),
      completedAt:
        doc.shippingWorkflow?.completedAt ||
        doc.updatedAt ||
        doc.createdAt ||
        new Date(),
    };
  }

  // Timeline helpers from snapshot flat fields
  if (!doc.timeline) doc.timeline = {};
  if (doc.estimatedShipYmd && !doc.timeline.estimatedShipYmd) {
    doc.timeline.estimatedShipYmd = doc.estimatedShipYmd;
  }
  if (doc.originalEstimatedShipYmd && !doc.timeline.originalEstimatedShipYmd) {
    doc.timeline.originalEstimatedShipYmd = doc.originalEstimatedShipYmd;
  }
  if (doc.nextEstimatedShipYmd && !doc.timeline.nextEstimatedShipYmd) {
    doc.timeline.nextEstimatedShipYmd = doc.nextEstimatedShipYmd;
  }

  if (!doc.createdAt && doc.date) {
    const d = new Date(`${doc.date}T12:00:00+09:00`);
    if (!Number.isNaN(d.getTime())) doc.createdAt = d;
  }
  if (!doc.updatedAt) doc.updatedAt = doc.createdAt || new Date();

  // Mark restore provenance (non-blocking meta)
  doc.__restoredFrom = "snapshots+raq";
  doc.__restoredAt = new Date();

  return doc;
}

async function buildAnchorRequestorMap(db) {
  const map = new Map(); // anchorId -> user ObjectId

  const anchors = await db
    .collection("businessanchors")
    .find(
      { businessType: "requestor" },
      { projection: { primaryContactUserId: 1, owners: 1 } },
    )
    .toArray();
  for (const a of anchors) {
    const id = String(a?._id || "").trim();
    if (!id) continue;
    const primary = asObjectId(a?.primaryContactUserId);
    if (primary) {
      map.set(id, primary);
      continue;
    }
    const owner0 = asObjectId(Array.isArray(a?.owners) ? a.owners[0] : null);
    if (owner0) map.set(id, owner0);
  }

  const users = await db
    .collection("users")
    .find(
      { role: "requestor", businessAnchorId: { $ne: null } },
      { projection: { businessAnchorId: 1 } },
    )
    .toArray();
  for (const u of users) {
    const anchorId = String(u?.businessAnchorId || "").trim();
    if (!anchorId || map.has(anchorId)) continue;
    const uid = asObjectId(u?._id);
    if (uid) map.set(anchorId, uid);
  }

  return map;
}

async function buildCandidates(db) {
  const byId = new Map();
  const anchorRequestorMap = await buildAnchorRequestorMap(db);

  const cursor = db.collection("requestordashboardsummarysnapshots").find(
    { "recentRequests.0": { $exists: true } },
    { projection: { businessAnchorId: 1, computedAt: 1, recentRequests: 1 } },
  );

  while (await cursor.hasNext()) {
    const snap = await cursor.next();
    const anchorId = snap?.businessAnchorId;
    const computedAt = snap?.computedAt ? new Date(snap.computedAt).getTime() : 0;
    for (const recent of Array.isArray(snap?.recentRequests) ? snap.recentRequests : []) {
      const id = String(recent?._id || "").trim();
      if (!id) continue;
      const keyCount = recent && typeof recent === "object" ? Object.keys(recent).length : 0;
      const prev = byId.get(id);
      if (
        !prev ||
        keyCount > prev.keyCount ||
        (keyCount === prev.keyCount && computedAt > prev.computedAt)
      ) {
        byId.set(id, {
          snapDoc: recent,
          businessAnchorId: anchorId,
          keyCount,
          computedAt,
        });
      }
    }
  }

  const raqByMongoId = new Map();
  const raqCursor = db
    .collection("ReviewApprovalQueue")
    .find(
      { requestMongoId: { $ne: null } },
      { projection: { requestMongoId: 1, requestId: 1, payload: 1, updatedAt: 1 } },
    )
    .sort({ updatedAt: -1 });
  while (await raqCursor.hasNext()) {
    const row = await raqCursor.next();
    const id = String(row?.requestMongoId || "").trim();
    if (!id || raqByMongoId.has(id)) continue;
    raqByMongoId.set(id, row);
  }

  const docs = [];
  const skipped = { noId: 0, noRequestor: 0, noRequestId: 0, noAnchor: 0 };

  for (const [id, row] of byId.entries()) {
    const raq = raqByMongoId.get(id);
    const doc = normalizeRestoredDoc({
      snapDoc: row.snapDoc,
      businessAnchorId: row.businessAnchorId,
      raqPayload: raq?.payload || null,
      requestIdFromRaq: raq?.requestId || null,
    });
    if (!doc) {
      skipped.noId += 1;
      continue;
    }
    if (!doc.requestId) {
      skipped.noRequestId += 1;
      continue;
    }
    if (!doc.businessAnchorId) {
      skipped.noAnchor += 1;
      continue;
    }
    if (!doc.requestor) {
      const fallback = anchorRequestorMap.get(String(doc.businessAnchorId));
      if (fallback) doc.requestor = fallback;
    }
    if (!doc.requestor) {
      skipped.noRequestor += 1;
      continue;
    }
    docs.push(doc);
  }

  // Also create stubs from RAQ-only ids not in snapshots (minimal)
  for (const [id, raq] of raqByMongoId.entries()) {
    if (byId.has(id)) continue;
    const mongoId = asObjectId(id);
    if (!mongoId || !raq?.requestId) continue;
    const payload = raq.payload && typeof raq.payload === "object" ? raq.payload : {};
    const anchorId =
      asObjectId(payload.businessAnchorId) ||
      null;
    // RAQ payload usually lacks anchor/requestor; skip unless resolvable.
    if (!anchorId) {
      skipped.noAnchor += 1;
      continue;
    }
    const requestor =
      asObjectId(payload.requestor) ||
      anchorRequestorMap.get(String(anchorId)) ||
      null;
    if (!requestor) {
      skipped.noRequestor += 1;
      continue;
    }
    const doc = normalizeRestoredDoc({
      snapDoc: {
        _id: mongoId,
        requestId: raq.requestId,
        requestor,
        businessAnchorId: anchorId,
        ...payload,
      },
      businessAnchorId: anchorId,
      raqPayload: null,
      requestIdFromRaq: null,
    });
    if (doc) docs.push(doc);
  }

  return { docs, skipped, snapshotUnique: byId.size, raqUnique: raqByMongoId.size };
}

async function run() {
  const { mongoUri } = await connectDb();
  const dbName = getDbNameFromMongoUri(mongoUri);
  const db = mongoose.connection.db;

  const existing = await db.collection("requests").estimatedDocumentCount();
  console.log(`[restore-requests] db=${dbName} existingRequests=${existing} mode=${yes ? "APPLY" : "DRY-RUN"}`);

  const { docs, skipped, snapshotUnique, raqUnique } = await buildCandidates(db);
  const withBrand = docs.filter((d) => d?.caseInfos?.implantBrand).length;
  const completedish = docs.filter(
    (d) =>
      d?.manufacturerStage === "추적관리" ||
      d?.shippingWorkflow?.completedAt,
  ).length;

  console.log(
    JSON.stringify(
      {
        snapshotUnique,
        raqUnique,
        restoreCandidates: docs.length,
        withBrand,
        completedish,
        skipped,
      },
      null,
      2,
    ),
  );

  if (!yes) {
    console.log("[restore-requests] dry-run only. Re-run with --yes to insert.");
    await disconnectDb();
    return;
  }

  if (existing > 0) {
    console.error(
      `[restore-requests] refusing to insert while requests already has ${existing} docs. Abort.`,
    );
    await disconnectDb();
    process.exitCode = 2;
    return;
  }

  // Insert in chunks; ordered:false so one bad doc doesn't stop the batch.
  const chunkSize = 50;
  let inserted = 0;
  let errors = 0;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const chunk = docs.slice(i, i + chunkSize);
    try {
      const result = await db.collection("requests").insertMany(chunk, {
        ordered: false,
      });
      inserted += result.insertedCount || Object.keys(result.insertedIds || {}).length;
    } catch (e) {
      const n =
        e?.result?.nInserted ||
        e?.insertedCount ||
        Object.keys(e?.result?.insertedIds || {}).length ||
        0;
      inserted += n;
      errors += 1;
      console.warn(
        `[restore-requests] chunk ${i}-${i + chunk.length} partial error:`,
        e?.message || e,
      );
    }
  }

  const after = await db.collection("requests").estimatedDocumentCount();
  console.log(
    JSON.stringify(
      { insertedAttempted: docs.length, inserted, errors, requestsAfter: after },
      null,
      2,
    ),
  );

  await disconnectDb();
}

run().catch(async (err) => {
  console.error("[restore-requests] failed", err?.message || err);
  try {
    await disconnectDb();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
