// related files:
// - web/backend/jobs/hourlyRequestBackupWorker.js
// - web/backend/models/requestBackupRun.model.js
// - web/backend/utils/s3.utils.js
// - web/backend/rules.md
import fs from "fs";
import path from "path";
import crypto from "crypto";
import zlib from "zlib";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import mongoose from "mongoose";
import Request from "../models/request.model.js";
import RequestBackupRun from "../models/requestBackupRun.model.js";
import { uploadFileToS3 } from "../utils/s3.utils.js";

const DEFAULT_LOCAL_DIR = path.resolve(
  process.cwd(),
  "backups",
  "critical-hourly",
);

const WEEKLY_FULL_INTERVAL_MS = Number(
  process.env.REQUEST_BACKUP_WEEKLY_FULL_MS || 7 * 24 * 60 * 60 * 1000,
);

/**
 * wipe/복구에 필요한 핵심 컬렉션.
 * requestbackupruns 자신은 제외(백업 메타 루프 방지).
 */
export const CRITICAL_BACKUP_COLLECTIONS = [
  "requests",
  "businessanchors",
  "users",
  "ledgerlines",
  "ledgerjournals",
  "machiningrecords",
  "deliveryinfos",
  "shippingpackages",
  "draftrequests",
  "files",
  "adminhappycallcompletions",
  "adminhappycallmemodrafts",
  "systemsettings",
  "connections",
  "cncmachines",
  "machines",
  "practicetransfers",
  "bonusgrants",
  "freecreditgrants",
  "businesscreditbalances",
  "creditbalanceguards",
  "chats",
  "chatrooms",
];

function uniqueCollections(list) {
  return [...new Set(list.map((n) => String(n || "").trim()).filter(Boolean))];
}

function resolveCollectionList() {
  const raw = String(process.env.REQUEST_BACKUP_COLLECTIONS || "").trim();
  if (!raw) return uniqueCollections(CRITICAL_BACKUP_COLLECTIONS);
  return uniqueCollections(raw.split(",").map((s) => s.trim()));
}

function toKstStamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || "00";
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    label: `${get("year")}${get("month")}${get("day")}T${get("hour")}${get("minute")}${get("second")}+09`,
  };
}

function toObjectIdOrNull(value) {
  const raw = String(value || "").trim();
  if (!raw || !mongoose.Types.ObjectId.isValid(raw)) return null;
  return new mongoose.Types.ObjectId(raw);
}

async function listExistingCollectionNames(db) {
  const rows = await db.listCollections({}, { nameOnly: true }).toArray();
  return new Set(rows.map((r) => String(r?.name || "")).filter(Boolean));
}

async function collectionFingerprintPart(db, name) {
  const coll = db.collection(name);
  // countDocuments: estimatedDocumentCount는 메타데이터 오차로 지문이 흔들릴 수 있음
  // maxId only: connections 등 heartbeat updatedAt 갱신은 의미 있는 변경이 아님
  const count = await coll.countDocuments({});
  let maxId = null;
  try {
    const latestId = await coll
      .find({}, { projection: { _id: 1 } })
      .sort({ _id: -1 })
      .limit(1)
      .toArray();
    maxId = latestId[0]?._id ? String(latestId[0]._id) : null;
  } catch {
    maxId = null;
  }
  return { count, maxId };
}

/**
 * 중요 데이터 지문:
 * - requests: manufacturerStage 분포 + 건수 (상태 변동)
 * - 기타 핵심 컬렉션: count + max(_id)
 *   (updatedAt 제외 — connections heartbeat 등으로 매시간 흔들림 방지)
 */
export async function computeCriticalDataFingerprint(
  collections = resolveCollectionList(),
) {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection is not ready");

  const existing = await listExistingCollectionNames(db);
  const targets = collections.filter((name) => existing.has(name));

  const stageRows = await Request.aggregate([
    {
      $group: {
        _id: { $ifNull: ["$manufacturerStage", ""] },
        n: { $sum: 1 },
      },
    },
  ]);
  const stageCounts = {};
  let requestCount = 0;
  for (const row of stageRows) {
    const stage = String(row?._id ?? "");
    const n = Number(row?.n || 0);
    stageCounts[stage] = n;
    requestCount += n;
  }

  const collectionParts = {};
  for (const name of targets) {
    collectionParts[name] = await collectionFingerprintPart(db, name);
  }

  const stable = {
    requestCount,
    stageCounts: Object.fromEntries(
      Object.keys(stageCounts)
        .sort()
        .map((k) => [k, stageCounts[k]]),
    ),
    collections: Object.fromEntries(
      Object.keys(collectionParts)
        .sort()
        .map((k) => [k, collectionParts[k]]),
    ),
  };

  const fingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify(stable))
    .digest("hex");

  const collectionCounts = Object.fromEntries(
    Object.entries(collectionParts).map(([k, v]) => [k, Number(v.count || 0)]),
  );

  return {
    fingerprint,
    requestCount,
    stageCounts: stable.stageCounts,
    collectionCounts,
    targets,
  };
}

// backward-compatible alias
export async function computeRequestStatusFingerprint() {
  return computeCriticalDataFingerprint();
}

async function getLatestCompletedRun() {
  return RequestBackupRun.findOne({ status: "completed" })
    .sort({ createdAt: -1 })
    .lean();
}

async function getLatestCompletedFullRun() {
  return RequestBackupRun.findOne({
    status: "completed",
    mode: "full",
  })
    .sort({ createdAt: -1 })
    .select({ createdAt: 1, finishedAt: 1, _id: 1 })
    .lean();
}

export async function shouldRunWeeklyFull(now = new Date()) {
  const lastFull = await getLatestCompletedFullRun();
  if (!lastFull) return true;
  const anchor = lastFull.finishedAt || lastFull.createdAt;
  if (!anchor) return true;
  return now.getTime() - new Date(anchor).getTime() >= WEEKLY_FULL_INTERVAL_MS;
}

/** updatedAt heartbeat만 잦은 컬렉션 — 증분은 _id(신규)만 추적 */
const INCREMENTAL_ID_ONLY_COLLECTIONS = new Set(["connections"]);

/**
 * 증분 쿼리:
 * - updatedAt > watermark.maxUpdatedAt (기존 문서 수정)
 * - _id > watermark.maxId (신규 insert)
 * watermark 없으면 전체(해당 컬렉션 first dump).
 */
function buildIncrementalFilter(watermark, collectionName = "") {
  if (!watermark || typeof watermark !== "object") return {};
  const clauses = [];
  const idOnly = INCREMENTAL_ID_ONLY_COLLECTIONS.has(collectionName);
  if (!idOnly && watermark.maxUpdatedAt) {
    const d = new Date(watermark.maxUpdatedAt);
    if (!Number.isNaN(d.getTime())) {
      clauses.push({ updatedAt: { $gt: d } });
    }
  }
  const oid = toObjectIdOrNull(watermark.maxId);
  if (oid) {
    clauses.push({ _id: { $gt: oid } });
  }
  if (clauses.length === 0) return {};
  if (clauses.length === 1) return clauses[0];
  return { $or: clauses };
}

function emptyWatermark() {
  return { maxId: null, maxUpdatedAt: null };
}

function mergeWatermark(prev, doc) {
  const next = {
    maxId: prev?.maxId || null,
    maxUpdatedAt: prev?.maxUpdatedAt || null,
  };
  if (doc?._id) {
    const idStr = String(doc._id);
    if (!next.maxId || idStr > next.maxId) next.maxId = idStr;
  }
  if (doc?.updatedAt) {
    const iso = new Date(doc.updatedAt).toISOString();
    if (!next.maxUpdatedAt || iso > next.maxUpdatedAt) {
      next.maxUpdatedAt = iso;
    }
  }
  return next;
}

async function computeCollectionWatermark(db, collectionName) {
  const coll = db.collection(collectionName);
  const wm = emptyWatermark();
  const latestId = await coll
    .find({}, { projection: { _id: 1 } })
    .sort({ _id: -1 })
    .limit(1)
    .toArray();
  if (latestId[0]?._id) wm.maxId = String(latestId[0]._id);
  try {
    const latestUpdated = await coll
      .find(
        { updatedAt: { $exists: true, $ne: null } },
        { projection: { updatedAt: 1 } },
      )
      .sort({ updatedAt: -1 })
      .limit(1)
      .toArray();
    if (latestUpdated[0]?.updatedAt) {
      wm.maxUpdatedAt = new Date(latestUpdated[0].updatedAt).toISOString();
    }
  } catch {
    // updatedAt 없는 컬렉션
  }
  return wm;
}

async function dumpCollectionNdjsonGz(db, collectionName, filePath, filter = {}) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const cursor = db.collection(collectionName).find(filter);
  const gzip = zlib.createGzip({ level: 6 });
  const out = createWriteStream(filePath);

  let count = 0;
  let watermark = emptyWatermark();
  const source = async function* () {
    for await (const doc of cursor) {
      count += 1;
      watermark = mergeWatermark(watermark, doc);
      yield `${JSON.stringify(doc)}\n`;
    }
  };

  await pipeline(source(), gzip, out);
  const stat = await fs.promises.stat(filePath);
  return { count, bytes: Number(stat.size || 0), watermark };
}

function resolveBackupDir(stamp, mode) {
  const prefix = String(
    process.env.REQUEST_BACKUP_S3_PREFIX || "db-backups/critical",
  ).replace(/\/+$/, "");
  const s3Dir = `${prefix}/${mode}/${stamp.ymd}/${stamp.label}`;
  const localRoot = String(
    process.env.REQUEST_BACKUP_DIR || DEFAULT_LOCAL_DIR,
  ).trim();
  const localDir = path.join(localRoot, mode, stamp.ymd, stamp.label);
  return { s3Dir, localDir };
}

async function persistBackupFile({ localPath, key, bytes }) {
  const preferS3 =
    String(process.env.REQUEST_BACKUP_STORAGE || "s3").trim().toLowerCase() !==
    "local";

  if (preferS3) {
    try {
      const buf = await fs.promises.readFile(localPath);
      const uploaded = await uploadFileToS3(buf, key, "application/gzip");
      return {
        type: "s3",
        bucket: process.env.AWS_S3_BUCKET_NAME || "abuts-fit",
        key: uploaded?.key || key,
        localPath,
        bytes,
      };
    } catch (err) {
      console.warn(
        "[critical-backup] S3 upload failed, keeping local file:",
        err?.message || err,
      );
    }
  }

  return {
    type: "local",
    bucket: "",
    key: "",
    localPath,
    bytes,
  };
}

function resolveModeAndKind({
  mode: requestedMode,
  kind: requestedKind,
  forceFull,
  weeklyDue,
}) {
  if (forceFull || requestedMode === "full") {
    return {
      mode: "full",
      kind: requestedKind === "manual" ? "manual" : "weekly",
    };
  }
  if (weeklyDue) {
    return { mode: "full", kind: "weekly" };
  }
  return {
    mode: "incremental",
    kind: requestedKind === "manual" ? "manual" : "hourly",
  };
}

/**
 * 1회 백업 실행.
 * - 기본: 증분(직전 watermark 이후 신규/수정 문서만)
 * - 주 1회(또는 forceFull): 전체 스냅샷
 * - 증분이고 지문 동일하면 skipped
 * - 과거 백업은 절대 삭제하지 않음
 */
export async function runRequestBackupOnce({
  kind = "hourly",
  mode: requestedMode = null,
  forceFull = false,
} = {}) {
  const startedAt = new Date();
  const {
    fingerprint,
    requestCount,
    stageCounts,
    collectionCounts,
    targets,
  } = await computeCriticalDataFingerprint();

  const weeklyDue = await shouldRunWeeklyFull(startedAt);
  let { mode, kind: resolvedKind } = resolveModeAndKind({
    mode: requestedMode,
    kind,
    forceFull,
    weeklyDue:
      requestedMode === "incremental" ||
      forceFull ||
      requestedMode === "full"
        ? false
        : weeklyDue,
  });

  const previous = await getLatestCompletedRun();
  const previousFingerprint = String(previous?.fingerprint || "").trim();
  const previousWatermarks =
    previous?.watermarks && typeof previous.watermarks === "object"
      ? previous.watermarks
      : {};

  // 워터마크 없는 이전 실행만 있으면 증분 불가 → full로 승격
  if (
    mode === "incremental" &&
    Object.keys(previousWatermarks).length === 0
  ) {
    mode = "full";
    resolvedKind = kind === "manual" ? "manual" : "weekly";
  }

  if (
    mode === "incremental" &&
    previousFingerprint &&
    previousFingerprint === fingerprint
  ) {
    const skipped = await RequestBackupRun.create({
      kind: resolvedKind,
      mode,
      status: "skipped",
      reason: "no_critical_data_change",
      fingerprint,
      previousFingerprint,
      requestCount,
      stageCounts,
      collectionCounts,
      watermarks: previousWatermarks,
      storage: { type: "none" },
      files: [],
      startedAt,
      finishedAt: new Date(),
    });
    return {
      status: "skipped",
      reason: "no_critical_data_change",
      mode,
      fingerprint,
      runId: String(skipped._id),
      collections: targets,
    };
  }

  const stamp = toKstStamp(startedAt);
  const { s3Dir, localDir } = resolveBackupDir(stamp, mode);
  const baseFull = await getLatestCompletedFullRun();
  const runDoc = await RequestBackupRun.create({
    kind: resolvedKind,
    mode,
    status: "failed",
    reason: "in_progress",
    fingerprint,
    previousFingerprint,
    requestCount,
    stageCounts,
    collectionCounts,
    watermarks: {},
    baseRunId: mode === "incremental" && baseFull?._id ? baseFull._id : null,
    storage: { type: "none" },
    files: [],
    startedAt,
  });

  const db = mongoose.connection.db;
  const files = [];
  const nextWatermarks = {};
  const deltaCounts = {};
  let totalBytes = 0;
  let totalDeltaDocs = 0;

  try {
    await fs.promises.mkdir(localDir, { recursive: true });

    for (const name of targets) {
      const filter =
        mode === "full"
          ? {}
          : buildIncrementalFilter(previousWatermarks[name], name);
      const fileName = `${name}.ndjson.gz`;
      const localPath = path.join(localDir, fileName);
      const key = `${s3Dir}/${fileName}`;
      const dumped = await dumpCollectionNdjsonGz(db, name, localPath, filter);

      // 증분 0건이면 빈 파일 남기지 않음(전체는 빈 컬렉션도 마커로 유지)
      if (mode === "incremental" && dumped.count === 0) {
        try {
          await fs.promises.unlink(localPath);
        } catch {
          // ignore
        }
        nextWatermarks[name] = previousWatermarks[name] || emptyWatermark();
        deltaCounts[name] = 0;
        continue;
      }

      const stored = await persistBackupFile({
        localPath,
        key,
        bytes: dumped.bytes,
      });
      totalBytes += Number(stored.bytes || 0);
      totalDeltaDocs += dumped.count;
      deltaCounts[name] = dumped.count;

      if (mode === "full") {
        nextWatermarks[name] = await computeCollectionWatermark(db, name);
      } else {
        const prevWm = previousWatermarks[name] || emptyWatermark();
        nextWatermarks[name] = {
          maxId:
            dumped.watermark.maxId &&
            (!prevWm.maxId || dumped.watermark.maxId > prevWm.maxId)
              ? dumped.watermark.maxId
              : prevWm.maxId || dumped.watermark.maxId,
          maxUpdatedAt:
            dumped.watermark.maxUpdatedAt &&
            (!prevWm.maxUpdatedAt ||
              dumped.watermark.maxUpdatedAt > prevWm.maxUpdatedAt)
              ? dumped.watermark.maxUpdatedAt
              : prevWm.maxUpdatedAt || dumped.watermark.maxUpdatedAt,
        };
      }

      files.push({
        collectionName: name,
        type: stored.type,
        bucket: stored.bucket || "",
        key: stored.key || "",
        localPath: stored.localPath || localPath,
        bytes: stored.bytes || 0,
        count: dumped.count,
      });
    }

    // full 이후 워터마크는 위에서 계산. incremental에서 파일 없는 컬렉션도 유지.
    for (const name of targets) {
      if (!nextWatermarks[name]) {
        nextWatermarks[name] =
          mode === "full"
            ? await computeCollectionWatermark(db, name)
            : previousWatermarks[name] || emptyWatermark();
      }
    }

    const storageTypes = [...new Set(files.map((f) => f.type))];
    const storageType =
      storageTypes.length === 0
        ? "none"
        : storageTypes.length === 1
          ? storageTypes[0]
          : "mixed";

    const storage = {
      type: storageType,
      bucket: files.find((f) => f.bucket)?.bucket || "",
      key: s3Dir,
      localPath: localDir,
      bytes: totalBytes,
    };

    const reason =
      mode === "full"
        ? previous?.mode === "full" || previous
          ? weeklyDue || forceFull || requestedMode === "full"
            ? "weekly_full"
            : "full_backup"
          : "initial_full"
        : totalDeltaDocs > 0
          ? "incremental_delta"
          : "fingerprint_changed_no_delta_docs";

    const manifest = {
      createdAt: new Date().toISOString(),
      createdAtKst: stamp.label,
      dbName: mongoose.connection?.name || "",
      mode,
      kind: resolvedKind,
      collections: files.map((f) => ({
        name: f.collectionName,
        count: f.count,
        bytes: f.bytes,
        storageType: f.type,
        key: f.key,
        localPath: f.localPath,
      })),
      deltaCounts,
      watermarks: nextWatermarks,
      fingerprint,
      previousFingerprint,
      requestCount,
      stageCounts,
      collectionCounts,
      storage,
      baseRunId: runDoc.baseRunId ? String(runDoc.baseRunId) : null,
      note:
        mode === "full"
          ? "append-only full critical backup; never auto-deleted"
          : "append-only incremental critical backup (upsert by _id onto last full); never auto-deleted",
    };
    await fs.promises.writeFile(
      path.join(localDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8",
    );

    runDoc.status = "completed";
    runDoc.reason = reason;
    runDoc.requestCount = requestCount;
    runDoc.collectionCounts = collectionCounts;
    runDoc.deltaCounts = deltaCounts;
    runDoc.watermarks = nextWatermarks;
    runDoc.storage = storage;
    runDoc.files = files;
    runDoc.finishedAt = new Date();
    await runDoc.save();

    return {
      status: "completed",
      reason,
      mode,
      kind: resolvedKind,
      fingerprint,
      storage,
      files,
      deltaCounts,
      runId: String(runDoc._id),
      requestCount,
      collectionCounts,
    };
  } catch (err) {
    runDoc.status = "failed";
    runDoc.reason = "backup_failed";
    runDoc.error = String(err?.message || err);
    runDoc.files = files;
    runDoc.finishedAt = new Date();
    await runDoc.save();
    throw err;
  }
}
