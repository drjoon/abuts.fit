// related files:
// - web/backend/services/requestBackup.service.js
// - web/backend/scripts/db/reset-requestor-credit-ledgers.js
// - web/backend/scripts/db/_mongo.js
/**
 * S3 critical 백업에서 크레딧 원장 컬렉션을 복구한다.
 * (충전·소비 내역 유지 + 마이너스 잔고 체제 적용 전제)
 *
 * 기본 복구 지점: 오늘 오전의 잔고 회수/원장 삭제 직전
 *   full 2026-09-04T23:40+09 + incremental 2026-09-05T00:40+09
 *   (08:40 incremental은 clawback/charge-delete 이후라 제외)
 *
 * Usage:
 *   cd web/backend && \
 *   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
 *   node scripts/db/restore-credit-ledgers-from-critical-backup.js
 *
 * Apply: APPLY=1 ...
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import readline from "readline";
import { createReadStream } from "fs";
import { execFileSync } from "child_process";
import mongoose from "mongoose";
import {
  assertSafeToMutateDb,
  getMongoUri,
} from "./_mongo.js";
import {
  normalizeRequestorKind,
  normalizeRequestorCapabilities,
} from "../../utils/requestorCapabilities.js";
import { upsertBusinessCreditBalanceFromLedger } from "../../services/creditBalance.service.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";

const BUCKET = process.env.AWS_S3_BUCKET_NAME || "abuts-fit";
const FULL_PREFIX =
  "db-backups/critical/full/2026-09-04/20260904T234032+09";
const INC_PREFIX =
  "db-backups/critical/incremental/2026-09-05/20260905T004032+09";

/** 컬렉션 전체 교체(삭제 후 insert) */
const REPLACE_COLLECTIONS = [
  "ledgerjournals",
  "ledgerlines",
  "bonusgrants",
  "businesscreditbalances",
];

/** _id upsert만(신규 PTX 보존) */
const UPSERT_COLLECTIONS = ["practicetransfers"];

const WORK_DIR = path.resolve(
  process.cwd(),
  "backups",
  "credit-restore-tmp",
);

function isPracticeAnchor(anchor) {
  const kind = normalizeRequestorKind(anchor?.requestorKind);
  const caps = normalizeRequestorCapabilities(anchor?.requestorCapabilities);
  if (kind === "lab") return false;
  if (kind === "practice") return true;
  return Boolean(caps.practice);
}

function reviveValue(value, key = "") {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((v) => reviveValue(v, key));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = reviveValue(v, k);
    }
    return out;
  }
  if (typeof value === "string") {
    if (
      (/Id$/i.test(key) || key === "_id") &&
      /^[a-f0-9]{24}$/i.test(value) &&
      mongoose.Types.ObjectId.isValid(value)
    ) {
      return new mongoose.Types.ObjectId(value);
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return value;
}

async function downloadKey(key, destPath) {
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  const uri = `s3://${BUCKET}/${key}`;
  try {
    execFileSync("aws", ["s3", "cp", uri, destPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    return destPath;
  } catch (e) {
    const msg = String(e?.stderr || e?.message || e);
    if (/404|Not Found|does not exist/i.test(msg)) {
      return null;
    }
    throw e;
  }
}

async function readNdjsonGz(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const docs = [];
  const stream = createReadStream(filePath).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const raw = String(line || "").trim();
    if (!raw) continue;
    docs.push(reviveValue(JSON.parse(raw)));
  }
  return docs;
}

async function loadMergedDocs(collectionName) {
  const fullLocal = path.join(WORK_DIR, "full", `${collectionName}.ndjson.gz`);
  const incLocal = path.join(WORK_DIR, "inc", `${collectionName}.ndjson.gz`);

  const fullKey = `${FULL_PREFIX}/${collectionName}.ndjson.gz`;
  const fullOk = await downloadKey(fullKey, fullLocal);
  if (!fullOk) {
    console.warn("full missing", collectionName);
  }

  const incKey = `${INC_PREFIX}/${collectionName}.ndjson.gz`;
  await downloadKey(incKey, incLocal);

  const byId = new Map();
  for (const doc of await readNdjsonGz(fullLocal)) {
    if (!doc?._id) continue;
    byId.set(String(doc._id), doc);
  }
  for (const doc of await readNdjsonGz(incLocal)) {
    if (!doc?._id) continue;
    byId.set(String(doc._id), doc);
  }
  return [...byId.values()];
}

async function replaceCollection(db, name, docs) {
  const coll = db.collection(name);
  const before = await coll.countDocuments({});
  if (!docs.length) {
    console.log("skip empty replace", name);
    return { before, after: before, inserted: 0 };
  }
  await coll.deleteMany({});
  const chunk = 500;
  let inserted = 0;
  for (let i = 0; i < docs.length; i += chunk) {
    const slice = docs.slice(i, i + chunk);
    const res = await coll.insertMany(slice, { ordered: false });
    inserted += Number(res?.insertedCount || slice.length);
  }
  const after = await coll.countDocuments({});
  return { before, after, inserted };
}

async function upsertCollection(db, name, docs) {
  const coll = db.collection(name);
  let upserted = 0;
  let modified = 0;
  const chunk = 200;
  for (let i = 0; i < docs.length; i += chunk) {
    const slice = docs.slice(i, i + chunk);
    const ops = slice.map((doc) => ({
      replaceOne: {
        filter: { _id: doc._id },
        replacement: doc,
        upsert: true,
      },
    }));
    const res = await coll.bulkWrite(ops, { ordered: false });
    upserted += Number(res?.upsertedCount || 0);
    modified += Number(res?.modifiedCount || 0);
  }
  return { upserted, modified, total: docs.length };
}

async function enableDemoForPractices() {
  const anchors = await BusinessAnchor.find({ businessType: "requestor" })
    .select({
      name: 1,
      requestorKind: 1,
      requestorCapabilities: 1,
      demoMode: 1,
      demoModeExitedAt: 1,
      demoModeStartedAt: 1,
      createdAt: 1,
    })
    .lean();

  let enabled = 0;
  for (const a of anchors) {
    if (!isPracticeAnchor(a)) continue;
    if (a.demoModeExitedAt) continue;
    if (a.demoMode) continue;
    await BusinessAnchor.updateOne(
      { _id: a._id },
      {
        $set: {
          demoMode: true,
          demoModeStartedAt: a.demoModeStartedAt || a.createdAt || new Date(),
        },
      },
    );
    enabled += 1;
    console.log("demoMode ON", a.name);
  }
  return enabled;
}

async function refreshBalances() {
  const anchors = await BusinessAnchor.find({ businessType: "requestor" })
    .select({ _id: 1, name: 1 })
    .lean();
  for (const a of anchors) {
    await upsertBusinessCreditBalanceFromLedger({ businessAnchorId: a._id });
  }
  return anchors.length;
}

async function main() {
  const apply = ["1", "true", "yes"].includes(
    String(process.env.APPLY || "")
      .trim()
      .toLowerCase(),
  );
  const uri = getMongoUri();
  assertSafeToMutateDb(uri);
  console.log("apply", apply);
  console.log("full", FULL_PREFIX);
  console.log("inc", INC_PREFIX, "(08:40 clawback 이후 백업 제외)");

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  for (const name of [...REPLACE_COLLECTIONS, ...UPSERT_COLLECTIONS]) {
    const docs = await loadMergedDocs(name);
    console.log("loaded", name, docs.length);
    if (!apply) continue;

    if (REPLACE_COLLECTIONS.includes(name)) {
      const res = await replaceCollection(db, name, docs);
      console.log("replaced", name, res);
    } else {
      const res = await upsertCollection(db, name, docs);
      console.log("upserted", name, res);
    }
  }

  if (apply) {
    const demoEnabled = await enableDemoForPractices();
    const refreshed = await refreshBalances();
    console.log("post", { demoEnabled, refreshed });
  }

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
