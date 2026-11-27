// change-log:
// - 2026-11-27: 각인 학습 데이터셋. 지그와 무관하게 쌓는다: 표본마다 ROI 크롭(roi.jpg, 회전 전), 전체 프레임(frame.jpg),
//   글자별 정규화 크롭(letters/0-B.png, 32×48, 바로 세움), meta.json(코드·글자·지그 프로필·ROI·회전·ROI 상대 글자 상자·화질 설정·시각·출처).
//   절대 픽셀 위치에 묶지 않는다(글자 상자는 회전된 ROI 크롭 기준 0–1). 위치: data/engrave-dataset(LOT_ENGRAVE_DATASET).
// related files:
// - bg/pc2/lot-server/scripts/train-engrave.mjs
// - bg/pc2/lot-server/src/index.js
// - bg/pc2/lot-server/README.md

import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";
import { CELL_H, CELL_W } from "./features.js";
import { cellsFromLetterBoxes, cropCell, cropGray, decodeGray, roiPixels, rotateGray } from "./crops.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

export function datasetDir() {
  return process.env.LOT_ENGRAVE_DATASET || path.join(ROOT, "data", "engrave-dataset");
}

function stampParts(d = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, "0");
  const day = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const time = `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`;
  return { day, time };
}

/**
 * 표본 저장.
 * @param {{ frame: Buffer, code: string, profile: object, rotation: number, boxes: number[][] | null,
 *   settings?: object, source?: string, requestId?: string, extra?: object }} s
 *   boxes: 회전된 ROI 크롭 기준 정규화 글자 상자 3개 [x0,y0,x1,y1]. 모르면 null(ROI만 저장, 학습은 상자 있는 표본만).
 */
export async function saveSample(s, root = datasetDir()) {
  const code = String(s.code || "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error("코드는 영문 대문자 3글자여야 합니다.");
  const { day, time } = stampParts();
  const dir = path.join(root, "samples", day, `${time}-${code}`);
  fs.mkdirSync(path.join(dir, "letters"), { recursive: true });
  const frame = await decodeGray(s.frame);
  const rect = roiPixels(s.profile.roi, frame.width, frame.height);
  const roiGray = cropGray(frame.gray, frame.width, rect);
  await sharp(s.frame).jpeg({ quality: 92 }).toFile(path.join(dir, "frame.jpg"));
  await sharp(Buffer.from(roiGray), { raw: { width: rect.width, height: rect.height, channels: 1 } })
    .jpeg({ quality: 95 })
    .toFile(path.join(dir, "roi.jpg"));
  const letters = [];
  if (Array.isArray(s.boxes) && s.boxes.length === 3) {
    const rg = rotateGray(roiGray, rect.width, rect.height, s.rotation || 0);
    const px = s.boxes.map((b) => [b[0] * rg.width, b[1] * rg.height, b[2] * rg.width, b[3] * rg.height]);
    const cells = cellsFromLetterBoxes(px);
    for (let i = 0; i < 3; i += 1) {
      const cell = await cropCell(rg.gray, rg.width, rg.height, cells[i]);
      const name = `${i}-${code[i]}.png`;
      await sharp(Buffer.from(cell), { raw: { width: CELL_W, height: CELL_H, channels: 1 } }).png().toFile(path.join(dir, "letters", name));
      letters.push({ index: i, letter: code[i], file: `letters/${name}` });
    }
  }
  const meta = {
    version: 1,
    code,
    letters,
    profileId: s.profile.id,
    profileName: s.profile.name,
    roi: s.profile.roi,
    letterH: s.profile.letterH || null,
    roiPx: rect,
    frameSize: { width: frame.width, height: frame.height },
    rotation: s.rotation || 0,
    boxes: Array.isArray(s.boxes) ? s.boxes : null,
    settings: s.settings || null,
    source: s.source || "unknown",
    requestId: s.requestId || null,
    extra: s.extra || null,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  return { dir, meta };
}

/** 모든 표본 meta(+폴더). */
export function listSamples(root = datasetDir()) {
  const base = path.join(root, "samples");
  const out = [];
  if (!fs.existsSync(base)) return out;
  for (const day of fs.readdirSync(base).sort()) {
    const dayDir = path.join(base, day);
    if (!fs.statSync(dayDir).isDirectory()) continue;
    for (const name of fs.readdirSync(dayDir).sort()) {
      const dir = path.join(dayDir, name);
      const metaFile = path.join(dir, "meta.json");
      if (!fs.existsSync(metaFile)) continue;
      try {
        out.push({ dir, meta: JSON.parse(fs.readFileSync(metaFile, "utf8")) });
      } catch {}
    }
  }
  return out;
}

export function datasetSummary(root = datasetDir()) {
  const samples = listSamples(root);
  const letters = {};
  const codes = {};
  let boxed = 0;
  for (const { meta } of samples) {
    codes[meta.code] = (codes[meta.code] || 0) + 1;
    if (meta.boxes) {
      boxed += 1;
      for (const ch of meta.code) letters[ch] = (letters[ch] || 0) + 1;
    }
  }
  return { root, samples: samples.length, boxed, codes, letters };
}
