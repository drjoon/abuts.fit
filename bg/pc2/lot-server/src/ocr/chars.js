// change-log:
// - 2026-11-26: 각인 3글자를 글자 단위로 잘라 psm 10으로 읽고, 여러 전처리 결과를 자리별로 투표한다.
//   tesseract 한 줄 모드는 테두리만 진한 각인 글자에서 첫 글자를 자주 놓친다(실측 UM20 "BDZ").
// related files:
// - bg/pc2/lot-server2/src/ocr/index.js
// - bg/pc2/lot-server2/src/ocr/preprocess.js
// - bg/pc2/lot-server2/src/ocr/locate.js

import sharp from "sharp";
import { runOcr } from "./engine.js";
import { connectedComponents } from "./locate.js";
import { adaptiveBinarize } from "./preprocess.js";

// 실측(UM20 각인)에서 tesseract가 글자를 자주 비워 돌려준다. 조합을 여러 개 두고 자리별로 투표한다.
const RECIPES = [
  { h: 140, blur: 1.5 },
  { h: 120, blur: 1 },
  { h: 96, blur: 1 },
  { h: 140, blur: 1 },
  { h: 80, blur: 1.5 },
  { h: 120, blur: 1.5 },
  { h: 120, blur: 2.5 },
  { h: 170, blur: 2.5 },
];

/**
 * 이진 이미지(0=잉크)에서 글자 칸을 왼쪽부터. 겹치는 성분은 합친다.
 * @returns {{x0:number,y0:number,x1:number,y1:number,area:number}[]}
 */
export function segmentChars(bin, width, height) {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i += 1) mask[i] = bin[i] === 0 ? 1 : 0;
  const comps = connectedComponents(mask, width, height)
    .filter((c) => c.y1 - c.y0 + 1 > height * 0.35 && c.area > 30)
    .sort((a, b) => a.x0 - b.x0);
  const merged = [];
  for (const c of comps) {
    const last = merged[merged.length - 1];
    if (last && c.x0 <= last.x1 - (c.x1 - c.x0) * 0.5) {
      last.x0 = Math.min(last.x0, c.x0);
      last.x1 = Math.max(last.x1, c.x1);
      last.y0 = Math.min(last.y0, c.y0);
      last.y1 = Math.max(last.y1, c.y1);
      last.area += c.area;
    } else {
      merged.push({ ...c });
    }
  }
  return merged;
}

export async function readOnce(crop, darkInk, recipe) {
  const { data, info } = await sharp(crop)
    .greyscale()
    .resize({ height: recipe.h })
    .normalize()
    .blur(recipe.blur)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels || 1;
  const gray = ch === 1 ? data : Buffer.from(Array.from({ length: info.width * info.height }, (_, i) => data[i * ch]));
  const width = info.width;
  const height = info.height;
  const bin = adaptiveBinarize(gray, width, height, Math.round(recipe.h / 3) | 1, 6, darkInk);
  const cells = segmentChars(bin, width, height);
  if (cells.length !== 3) return null;
  const chars = [];
  for (const c of cells) {
    const pad = 6;
    const x0 = Math.max(0, c.x0 - pad);
    const y0 = Math.max(0, c.y0 - pad);
    const x1 = Math.min(width, c.x1 + pad + 1);
    const y1 = Math.min(height, c.y1 + pad + 1);
    const cw = x1 - x0;
    const chh = y1 - y0;
    const cell = Buffer.alloc(cw * chh);
    for (let y = 0; y < chh; y += 1) bin.copy(cell, y * cw, (y0 + y) * width + x0, (y0 + y) * width + x1);
    const png = await sharp(cell, { raw: { width: cw, height: chh, channels: 1 } })
      .extend({ top: 20, bottom: 20, left: 20, right: 20, background: "#ffffff" })
      .png()
      .toBuffer();
    const { text, confidence } = await runOcr(png, { mode: "char" });
    const letter = String(text || "").replace(/[^A-Z]/g, "");
    chars.push({ letter: letter.length === 1 ? letter : "", confidence });
  }
  return chars;
}

/**
 * 자리별 투표. 자리마다 신뢰도 합이 큰 글자. score는 자리별 1위 합의 합(방향 비교용).
 * @param {({letter:string,confidence:number}[] | null)[]} runs
 */
export function voteChars(runs) {
  const valid = runs.filter((r) => r && r.length === 3);
  if (!valid.length) return null;
  const letters = [];
  let confSum = 0;
  let score = 0;
  let minAgree = Infinity;
  for (let pos = 0; pos < 3; pos += 1) {
    const tally = new Map();
    for (const run of valid) {
      const { letter, confidence } = run[pos];
      if (!letter) continue;
      const cur = tally.get(letter) || { sum: 0, count: 0 };
      cur.sum += Math.max(1, confidence);
      cur.count += 1;
      tally.set(letter, cur);
    }
    const ranked = [...tally.entries()].sort((a, b) => b[1].sum - a[1].sum);
    if (!ranked.length) return null;
    const [letter, { sum, count }] = ranked[0];
    letters.push(letter);
    confSum += sum / count;
    score += sum;
    minAgree = Math.min(minAgree, count);
  }
  return { lot: letters.join(""), confidence: confSum / 3, agree: minAgree, runs: valid.length, score };
}

/** 크롭 하나를 글자 단위로 읽는다. */
export async function readLotByChars(crop, darkInk = true) {
  const runs = [];
  for (const recipe of RECIPES) runs.push(await readOnce(crop, darkInk, recipe).catch(() => null));
  return voteChars(runs);
}
