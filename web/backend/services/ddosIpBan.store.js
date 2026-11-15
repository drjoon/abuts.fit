// related files:
// - web/backend/models/ddosIpBan.model.js
// - web/backend/middlewares/requestFloodBlocker.js
// - web/backend/server.js
// - web/backend/utils/mongoUri.js
// 서버가 이미 연 mongoose 연결에 upsert 한다.
// 로컬·개발은 resolveMongoUri()가 MONGODB_URI_TEST 이다.
import mongoose from "mongoose";
import DdosIpBan from "../models/ddosIpBan.model.js";

const SYNC_MS = 30_000;
const LOAD_LIMIT = 2000;
const PRUNE_LIMIT = 100;
const PRUNE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let applyRows = () => {};
let timer = null;
let syncing = false;
let saveWarnedAt = 0;

export function bindDdosIpBanApply(fn) {
  applyRows = typeof fn === "function" ? fn : () => {};
}

/**
 * 같은 IP는 한 문서만 둔다.
 * 이미 더 긴 차단이 있으면 줄이지 않고, banLevel 은 더 큰 값만 남긴다.
 */
export async function saveDdosIpBan({ ip, banUntilMs, banLevel, reason }) {
  const key = String(ip || "").trim();
  const untilMs = Number(banUntilMs) || 0;
  if (!key || untilMs <= 0) return { saved: false };
  if (mongoose.connection.readyState !== 1) return { saved: false };

  const banUntil = new Date(untilMs);
  const level = Math.max(0, Number(banLevel) || 0);
  const patch = { banUntil, reason: String(reason || "") };

  const updated = await DdosIpBan.updateOne(
    { ip: key, banUntil: { $lt: banUntil } },
    { $set: patch, $max: { banLevel: level } },
  );
  if (updated.matchedCount > 0) return { saved: true };

  try {
    await DdosIpBan.create({ ip: key, banUntil, banLevel: level, reason: patch.reason });
    return { saved: true };
  } catch (err) {
    if (err?.code !== 11000) throw err;
    await DdosIpBan.updateOne(
      { ip: key, banUntil: { $lt: banUntil } },
      { $set: patch, $max: { banLevel: level } },
    );
    await DdosIpBan.updateOne({ ip: key }, { $max: { banLevel: level } });
    return { saved: true };
  }
}

export async function loadDdosIpBans() {
  if (mongoose.connection.readyState !== 1) return [];
  const cutoff = new Date(Date.now() - PRUNE_AGE_MS);
  const stale = await DdosIpBan.find({ banUntil: { $lt: cutoff } })
    .select({ _id: 1 })
    .limit(PRUNE_LIMIT)
    .lean();
  if (stale.length > 0) {
    await DdosIpBan.deleteMany({ _id: { $in: stale.map((row) => row._id) } });
  }
  return DdosIpBan.find({})
    .sort({ banUntil: -1 })
    .limit(LOAD_LIMIT)
    .select({ ip: 1, banUntil: 1, banLevel: 1, reason: 1 })
    .lean();
}

async function syncOnce() {
  if (syncing) return;
  syncing = true;
  try {
    const rows = await loadDdosIpBans();
    applyRows(rows);
  } catch (err) {
    const now = Date.now();
    if (now - saveWarnedAt > SYNC_MS) {
      saveWarnedAt = now;
      console.warn("[ddos-guard] sync failed", err?.message || err);
    }
  } finally {
    syncing = false;
  }
}

export function startDdosIpBanSync() {
  if (timer) return;
  void syncOnce();
  timer = setInterval(() => {
    void syncOnce();
  }, SYNC_MS);
  timer.unref?.();
}

export function warnDdosIpBanSaveFailure(err) {
  const now = Date.now();
  if (now - saveWarnedAt <= SYNC_MS) return;
  saveWarnedAt = now;
  console.warn("[ddos-guard] save failed", err?.message || err);
}
