// change-log:
// - 2026-11-27: 라벨 프레임 + 데이터셋 표본 평가, 코드별 집계, --skip-washed, 종료코드(실패 시 1).
// - 2026-11-27: 라벨 붙은 실측 프레임으로 각인 인식 평가(대기 목록 제약/무제약, 위치 오차).
// usage: node scripts/eval-engrave.mjs [--model FILE] [--only BYK,BDZ] [--batch 2026-11-27b]
//        [--queue BYK,BYU,...] [--dataset] [--skip-washed] [--images DIR]
// related files:
// - bg/pc2/lot-server/src/engrave/recognize.js
// - bg/pc2/lot-server/test/fixtures/engrave-annotations.json
// - bg/pc2/lot-server/src/engrave/dataset.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { fromJson } from "../src/engrave/mlp.js";
import { loadModel } from "../src/engrave/model-store.js";
import { recognizeEngraving } from "../src/engrave/recognize.js";
import { boxesToRoi } from "../src/engrave/annotations.js";
import { datasetDir, listSamples } from "../src/engrave/dataset.js";
import { activeProfile, normalizeProfile } from "../src/jig-profiles.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, d = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : d;
};
const has = (name) => args.includes(name);
const annFile = path.join(__dirname, "..", "test", "fixtures", "engrave-annotations.json");
const ann = JSON.parse(fs.readFileSync(annFile, "utf8"));
const model = flag("--model") ? fromJson(JSON.parse(fs.readFileSync(flag("--model"), "utf8"))) : loadModel()?.model;
const only = (flag("--only", "") || "").split(",").filter(Boolean);
const batch = flag("--batch");
const queue = (flag("--queue", "BYZ,BZA,BZB,BZC,BYY,BYW,BYX,BYV,BYT,BYK,BYU,BDZ") || "").split(",");
const skipWashed = has("--skip-washed");
const useDataset = has("--dataset");
const imagesDir = flag("--images");

const byCode = new Map();
let ok = 0;
let n = 0;

function tally(code, hit) {
  const row = byCode.get(code) || { ok: 0, n: 0 };
  row.n += 1;
  if (hit) row.ok += 1;
  byCode.set(code, row);
}

async function evalOne(label, frame, code, profile, truthBoxes, truthRot) {
  const t = Date.now();
  const q = await recognizeEngraving(frame, { profile, allowed: queue, model });
  const free = await recognizeEngraving(frame, { profile, allowed: null, model });
  const ms = Date.now() - t;
  let err = null;
  if (truthBoxes && q.boxes && (truthRot == null || q.rotation === truthRot)) {
    err = Math.max(...q.boxes.map((b, i) => Math.abs((b[0] + b[2]) / 2 - (truthBoxes[i][0] + truthBoxes[i][2]) / 2)));
  }
  const hit = q.success && q.lot === code;
  n += 1;
  if (hit) ok += 1;
  tally(code, hit);
  console.log(
    `${label.padEnd(36)} ${code} → queue:${q.success ? q.lot : `✗(${q.reason}${q.rejected ? " " + q.rejected : ""})`} top=${q.top} conf=${q.confidence} margin=${q.margin} rival=${q.rival} minP=${q.minP} rot=${q.rotation} | free:${free.success ? free.lot : "✗" + free.reason}/${free.top} | posErr=${err == null ? "-" : err.toFixed(3)} ${ms}ms`,
  );
}

// 1) fixtures 라벨 프레임
for (const f of ann.frames) {
  if (only.length && !only.includes(f.code)) continue;
  if (batch && f.batch !== batch) continue;
  if (skipWashed && (f.evalOnly || /washed|b255/i.test(f.file))) continue;
  const frame = fs.readFileSync(path.resolve(path.dirname(annFile), f.file));
  const profile = normalizeProfile(ann.profiles[f.profile]);
  const md = await sharp(frame).metadata();
  const truth = boxesToRoi(f.boxesRotated, f.rotation, { width: md.width, height: md.height }, profile.roi);
  await evalOne(f.file, frame, f.code, profile, truth, f.rotation);
}

// 2) 데이터셋 표본(같은 코드·프레임이 fixtures와 겹치면 추가로 본다 — 실측 누적 확인용)
if (useDataset) {
  const root = flag("--dataset-dir", datasetDir());
  for (const { dir, meta } of listSamples(root)) {
    if (only.length && !only.includes(meta.code)) continue;
    if (!meta.boxes) continue;
    const framePath = path.join(dir, "frame.jpg");
    if (!fs.existsSync(framePath)) continue;
    const frame = fs.readFileSync(framePath);
    const profile = normalizeProfile({
      id: meta.profileId || "jig-1",
      name: meta.profileName,
      roi: meta.roi,
      letterH: meta.letterH,
      rotations: meta.rotations,
    });
    await evalOne(`dataset:${path.basename(dir)}`, frame, meta.code, profile, meta.boxes, meta.rotation);
  }
}

// 3) images/ — 파일명에 =CODE 또는 -CODE.jpg / 코드가 파일명 끝 3글자인 경우만
if (imagesDir) {
  const profile = activeProfile();
  const files = fs.readdirSync(imagesDir).filter((f) => /\.(jpe?g|png)$/i.test(f));
  for (const name of files) {
    let code = null;
    const eq = name.match(/=([A-Za-z]{3})\./);
    const dash = name.match(/-([A-Za-z]{3})\./);
    if (eq) code = eq[1].toUpperCase();
    else if (dash) code = dash[1].toUpperCase();
    if (!code || !/^[A-Z]{3}$/.test(code)) continue;
    if (only.length && !only.includes(code)) continue;
    const frame = fs.readFileSync(path.join(imagesDir, name));
    await evalOne(`images:${name}`, frame, code, profile, null, null);
  }
}

console.log("---");
for (const [code, row] of [...byCode.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`  ${code}: ${row.ok}/${row.n}`);
}
console.log(`정답 확정 ${ok}/${n}`);
if (n > 0 && ok < n) process.exitCode = 1;
