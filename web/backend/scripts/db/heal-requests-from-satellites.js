// related files:
// - web/backend/rules.md
// - web/backend/tests/setup.js
// - web/backend/scripts/db/restore-requests-from-snapshots.js
// - web/backend/models/request.model.js
//
// Context:
// Jest setup afterEach/afterAll clearCollections() + export MONGODB_URI_TEST(Atlas)
// + distribution.coverRank.test importing Request → requests 컬렉션만 deleteMany.
// ledger/machining/delivery/shippingpackages 등은 남았다.
//
// 스냅샷 복구본은 stage 등 상태값이 과거 스냅샷 시점이라 틀린 경우가 많다.
// 살아남은 satellite 컬렉션을 SSOT로 manufacturerStage/링크 필드를 교정한다.
//
// Usage:
//   ENV_FILE=local.env ABUTS_DB_FORCE=true node scripts/db/heal-requests-from-satellites.js
//   ENV_FILE=local.env ABUTS_DB_FORCE=true node scripts/db/heal-requests-from-satellites.js --yes
import mongoose from "mongoose";
import { connectDb, disconnectDb, getDbNameFromMongoUri } from "./_mongo.js";

const yes = process.argv.includes("--yes");
const onlyRestored = !process.argv.includes("--all");

const STAGE_RANK = {
  취소: 0,
  의뢰: 1,
  준비: 2,
  CAM: 3,
  가공: 4,
  "세척.패킹": 5,
  "포장.발송": 6,
  추적관리: 7,
};

function rank(stage) {
  return Number(STAGE_RANK[String(stage || "").trim()] || 0);
}

function pickHigherStage(current, candidate) {
  return rank(candidate) > rank(current) ? candidate : current;
}

async function run() {
  const { mongoUri } = await connectDb();
  const dbName = getDbNameFromMongoUri(mongoUri);
  const db = mongoose.connection.db;
  console.log(
    `[heal-requests] db=${dbName} mode=${yes ? "APPLY" : "DRY-RUN"} scope=${onlyRestored ? "restored-only" : "all"}`,
  );

  const mrByRid = new Map();
  for (const m of await db
    .collection("machiningrecords")
    .find({})
    .project({
      requestId: 1,
      status: 1,
      completedAt: 1,
      startedAt: 1,
      machineId: 1,
    })
    .toArray()) {
    if (!m.requestId) continue;
    const prev = mrByRid.get(m.requestId);
    if (!prev) {
      mrByRid.set(m.requestId, m);
      continue;
    }
    const statusScore = (s) => {
      const u = String(s || "").toUpperCase();
      if (u === "COMPLETED") return 3;
      if (u === "RUNNING" || u === "PAUSED" || u === "QUEUED") return 2;
      if (u === "FAILED" || u === "ERROR") return 1;
      return 0;
    };
    const ps = statusScore(prev.status);
    const cs = statusScore(m.status);
    if (cs > ps) {
      mrByRid.set(m.requestId, m);
      continue;
    }
    if (cs < ps) continue;
    const t = new Date(m.completedAt || m.startedAt || 0).getTime();
    const pt = new Date(prev.completedAt || prev.startedAt || 0).getTime();
    if (t >= pt) mrByRid.set(m.requestId, m);
  }

  const delByReq = new Map();
  for (const d of await db
    .collection("deliveryinfos")
    .find({})
    .project({
      request: 1,
      shippedAt: 1,
      deliveredAt: 1,
      trackingNumber: 1,
      carrier: 1,
    })
    .toArray()) {
    if (!d.request) continue;
    delByReq.set(String(d.request), d);
  }

  const pkgByReq = new Map();
  for (const p of await db
    .collection("shippingpackages")
    .find({})
    .project({
      requestIds: 1,
      mailboxAddress: 1,
      shipDateYmd: 1,
      businessAnchorId: 1,
    })
    .toArray()) {
    for (const id of Array.isArray(p.requestIds) ? p.requestIds : []) {
      pkgByReq.set(String(id), p);
    }
  }

  const filter = onlyRestored ? { __restoredFrom: { $exists: true } } : {};
  const requests = await db.collection("requests").find(filter).toArray();

  const changes = [];
  for (const req of requests) {
    const id = String(req._id);
    const mr = mrByRid.get(req.requestId) || null;
    const del = delByReq.get(id) || null;
    const pkg = pkgByReq.get(id) || null;

    let stage = String(req.manufacturerStage || "").trim() || "의뢰";
    if (mr) {
      const st = String(mr.status || "").toUpperCase();
      if (["RUNNING", "PAUSED", "ERROR", "FAILED", "QUEUED", "IDLE"].includes(st)) {
        stage = pickHigherStage(stage, "가공");
      }
      if (st === "COMPLETED") {
        stage = pickHigherStage(stage, "세척.패킹");
      }
    }
    if (pkg) stage = pickHigherStage(stage, "포장.발송");
    if (del?.shippedAt || del?.deliveredAt) {
      stage = pickHigherStage(stage, "추적관리");
    }

    const set = {};
    const unset = {};

    if (stage && stage !== req.manufacturerStage) {
      set.manufacturerStage = stage;
    }

    if (mr?._id) {
      const curMr = req.productionSchedule?.machiningRecord;
      if (String(curMr || "") !== String(mr._id)) {
        set["productionSchedule.machiningRecord"] = mr._id;
      }
      if (mr.machineId && req.assignedMachine !== mr.machineId) {
        set.assignedMachine = mr.machineId;
      }
      if (
        mr.machineId &&
        req.productionSchedule?.assignedMachine !== mr.machineId
      ) {
        set["productionSchedule.assignedMachine"] = mr.machineId;
      }
    }

    if (pkg?.mailboxAddress && req.mailboxAddress !== pkg.mailboxAddress) {
      set.mailboxAddress = pkg.mailboxAddress;
    }
    if (pkg?._id && String(req.shippingPackageId || "") !== String(pkg._id)) {
      set.shippingPackageId = pkg._id;
    }

    if (del?._id && String(req.deliveryInfoRef || "") !== String(del._id)) {
      set.deliveryInfoRef = del._id;
    }

    if (stage === "추적관리") {
      const completedAt =
        del?.deliveredAt ||
        del?.shippedAt ||
        req.shippingWorkflow?.completedAt ||
        mr?.completedAt ||
        req.updatedAt ||
        req.createdAt ||
        new Date();
      if (
        !req.shippingWorkflow?.completedAt ||
        new Date(req.shippingWorkflow.completedAt).getTime() !==
          new Date(completedAt).getTime()
      ) {
        set["shippingWorkflow.completedAt"] = new Date(completedAt);
      }
      if (del?.trackingNumber && !req.shippingWorkflow?.trackingNumber) {
        set["shippingWorkflow.trackingNumber"] = del.trackingNumber;
      }
      if (del?.carrier && !req.shippingWorkflow?.carrier) {
        set["shippingWorkflow.carrier"] = del.carrier;
      }
    }

    if (!Object.keys(set).length) continue;

    set.__healedFromSatellitesAt = new Date();
    set.__healedFromSatellites = {
      stageFrom: req.manufacturerStage || null,
      stageTo: set.manufacturerStage || req.manufacturerStage || null,
      hasMachining: Boolean(mr),
      hasPackage: Boolean(pkg),
      hasDelivery: Boolean(del),
    };

    changes.push({
      _id: req._id,
      requestId: req.requestId,
      set,
      unset,
      summary: {
        from: req.manufacturerStage,
        to: set.manufacturerStage || req.manufacturerStage,
        mr: mr?.status || null,
        pkg: Boolean(pkg),
        delivered: Boolean(del?.deliveredAt || del?.shippedAt),
      },
    });
  }

  const byTransition = {};
  for (const c of changes) {
    const k = `${c.summary.from || "-"}→${c.summary.to || "-"}`;
    byTransition[k] = (byTransition[k] || 0) + 1;
  }
  console.log(
    JSON.stringify(
      {
        scanned: requests.length,
        toHeal: changes.length,
        byTransition,
        samples: changes.slice(0, 10).map((c) => ({
          requestId: c.requestId,
          ...c.summary,
        })),
      },
      null,
      2,
    ),
  );

  if (!yes) {
    console.log("[heal-requests] dry-run only. Re-run with --yes to apply.");
    await disconnectDb();
    return;
  }

  let modified = 0;
  for (const c of changes) {
    const res = await db.collection("requests").updateOne(
      { _id: c._id },
      { $set: c.set },
    );
    modified += res.modifiedCount || 0;
  }
  console.log(JSON.stringify({ modified, attempted: changes.length }, null, 2));
  await disconnectDb();
}

run().catch(async (err) => {
  console.error("[heal-requests] failed", err?.message || err);
  try {
    await disconnectDb();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
