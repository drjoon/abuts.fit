// change-log:
// - 2026-11-28: 확정되지 않은 촬영(목록 밖·미확정)은 학습에 넣지 않고 data/engrave-pending에만 둔다.
//   작업자가 코드를 확인하면 데이터셋으로 옮긴다. 버리기는 skipped 폴더로 옮기고 지우지 않는다.
// related files:
// - bg/pc2/lot-server/src/engrave/dataset.js
// - bg/pc2/lot-server/src/index.js

import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";
import { cropGray, decodeGray, roiPixels } from "./crops.js";
import { datasetDir, saveSample } from "./dataset.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

export function pendingDir() {
  return process.env.LOT_ENGRAVE_PENDING || path.join(ROOT, "data", "engrave-pending");
}

export function skippedDir() {
  return process.env.LOT_ENGRAVE_PENDING_SKIPPED || path.join(ROOT, "data", "engrave-pending-skipped");
}

function stampParts(d = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, "0");
  const day = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const time = `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`;
  return { day, time };
}

export function pendingId(dir, root = pendingDir()) {
  return path.relative(root, dir).split(path.sep).join("/");
}

/**
 * 학습에 쓰지 않는 대기 표본.
 * @param {{ frame: Buffer, profile: object, guess?: string, reason?: string, settings?: object, extra?: object }} s
 */
export async function savePending(s, root = pendingDir()) {
  const guess = String(s.guess || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  const tag = /^[A-Z]{3}$/.test(guess) ? guess : "UNK";
  const { day, time } = stampParts();
  const dir = path.join(root, day, `${time}-${tag}`);
  fs.mkdirSync(dir, { recursive: true });
  const frame = await decodeGray(s.frame);
  const rect = roiPixels(s.profile.roi, frame.width, frame.height);
  const roiGray = cropGray(frame.gray, frame.width, rect);
  await sharp(s.frame).jpeg({ quality: 92 }).toFile(path.join(dir, "frame.jpg"));
  await sharp(Buffer.from(roiGray), { raw: { width: rect.width, height: rect.height, channels: 1 } })
    .jpeg({ quality: 95 })
    .toFile(path.join(dir, "roi.jpg"));
  const meta = {
    version: 1,
    guess: /^[A-Z]{3}$/.test(guess) ? guess : "",
    reason: s.reason || "unconfirmed",
    profileId: s.profile.id,
    profileName: s.profile.name,
    roi: s.profile.roi,
    letterH: s.profile.letterH || null,
    rotation: s.rotation || null,
    boxes: Array.isArray(s.boxes) ? s.boxes : null,
    settings: s.settings || null,
    extra: s.extra || null,
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  return { dir, id: pendingId(dir, root), meta };
}

export function listPending(root = pendingDir()) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const day of fs.readdirSync(root).sort().reverse()) {
    const dayDir = path.join(root, day);
    if (!fs.statSync(dayDir).isDirectory()) continue;
    for (const name of fs.readdirSync(dayDir).sort().reverse()) {
      const dir = path.join(dayDir, name);
      const metaFile = path.join(dir, "meta.json");
      if (!fs.existsSync(metaFile)) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
        if (meta.status && meta.status !== "pending") continue;
        out.push({ dir, id: pendingId(dir, root), meta });
      } catch {}
    }
  }
  return out;
}

function resolvePending(id, root = pendingDir()) {
  const clean = String(id || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean || clean.includes("..")) throw new Error("잘못된 대기 표본입니다.");
  const dir = path.join(root, ...clean.split("/"));
  const metaFile = path.join(dir, "meta.json");
  if (!fs.existsSync(metaFile)) throw new Error("대기 표본을 찾지 못했습니다.");
  const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
  return { dir, meta, id: pendingId(dir, root) };
}

/** 작업자가 코드를 확인 → 학습 데이터셋으로 복사(원본은 labeled로 표시 후 skipped가 아니라 labeled 폴더에 남김). */
export async function labelPending(id, code, { profile, datasetRoot = datasetDir(), root = pendingDir() } = {}) {
  const lot = String(code || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  if (!/^[A-Z]{3}$/.test(lot)) throw new Error("코드는 영문 대문자 3글자여야 합니다.");
  const item = resolvePending(id, root);
  const framePath = path.join(item.dir, "frame.jpg");
  if (!fs.existsSync(framePath)) throw new Error("대기 표본에 프레임이 없습니다.");
  const frame = fs.readFileSync(framePath);
  const usedProfile = profile || {
    id: item.meta.profileId,
    name: item.meta.profileName,
    roi: item.meta.roi,
    letterH: item.meta.letterH,
  };
  const saved = await saveSample({
    frame,
    code: lot,
    profile: usedProfile,
    rotation: item.meta.rotation || 0,
    boxes: item.meta.boxes || null,
    settings: item.meta.settings,
    source: "operator-label",
    extra: { pendingId: item.id, guess: item.meta.guess || "" },
  }, datasetRoot);
  item.meta.status = "labeled";
  item.meta.labeledCode = lot;
  item.meta.labeledAt = new Date().toISOString();
  item.meta.datasetDir = saved.dir;
  fs.writeFileSync(path.join(item.dir, "meta.json"), JSON.stringify(item.meta, null, 2));
  return { pending: item, sample: saved };
}

/** 지우지 않고 skipped 아래로 옮긴다. */
export function skipPending(id, { root = pendingDir(), dest = skippedDir() } = {}) {
  const item = resolvePending(id, root);
  const target = path.join(dest, pendingId(item.dir, root));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(item.dir, target);
  const metaFile = path.join(target, "meta.json");
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    meta.status = "skipped";
    meta.skippedAt = new Date().toISOString();
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
  } catch {}
  return { id: item.id, dir: target };
}

export function pendingSummary(root = pendingDir()) {
  const items = listPending(root);
  return { pending: items.length, items: items.slice(0, 40) };
}
