// change-log:
// - 2026-11-27: 라벨 붙은 실측 프레임(test/fixtures/engrave-annotations.json)을 각인 데이터셋에 넣는다. 같은 파일이 이미 있으면 건너뛴다.
// usage: node scripts/seed-engrave.mjs [annotations.json] [--dataset DIR]
// related files:
// - bg/pc2/lot-server/src/engrave/dataset.js
// - bg/pc2/lot-server/src/engrave/annotations.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { boxesToRoi } from "../src/engrave/annotations.js";
import { datasetDir, listSamples, saveSample } from "../src/engrave/dataset.js";
import { normalizeProfile } from "../src/jig-profiles.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const annFile = args.find((a) => a.endsWith(".json")) || path.join(__dirname, "..", "test", "fixtures", "engrave-annotations.json");
const root = flag("--dataset") || datasetDir();
const ann = JSON.parse(fs.readFileSync(annFile, "utf8"));
const have = new Set(listSamples(root).map((s) => s.meta.extra?.seedFile).filter(Boolean));
let added = 0;
for (const f of ann.frames) {
  if (f.evalOnly) continue;
  if (have.has(f.file)) continue;
  const file = path.resolve(path.dirname(annFile), f.file);
  const frame = fs.readFileSync(file);
  const metaImg = await sharp(frame).metadata();
  const profile = normalizeProfile(ann.profiles[f.profile]);
  const boxes = boxesToRoi(f.boxesRotated, f.rotation, { width: metaImg.width, height: metaImg.height }, profile.roi);
  const { dir } = await saveSample({ frame, code: f.code, profile, rotation: f.rotation, boxes, source: "seed", extra: { seedFile: f.file } }, root);
  added += 1;
  console.log(`+ ${f.code} ${f.file} → ${dir}`);
}
console.log(`seed 완료: ${added}개 추가 (${root})`);
