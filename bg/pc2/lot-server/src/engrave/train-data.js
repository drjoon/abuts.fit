// change-log:
// - 2026-11-27: 합성 focusLetters(홀드아웃·희소 글자) 전달, 실측 글자 증강량 상향.
// - 2026-11-27: 학습 표본 만들기. 합성 각인 + 데이터셋(실측) 표본. 실측은 roi.jpg·회전·글자 상자에서
//   위치·크기 흔들기와 밝기 증강으로 여러 칸을 만들고, 글자 사이·위아래·줄 밖·틀린 회전 칸을 배경("_")으로 넣는다.
// related files:
// - bg/pc2/lot-server/scripts/train-engrave.mjs
// - bg/pc2/lot-server/src/engrave/dataset.js
// - bg/pc2/lot-server/src/engrave/synth.js

import fs from "fs";
import path from "path";
import sharp from "sharp";
import { cropFeature } from "./features.js";
import { BG, CLASSES } from "./mlp.js";
import { cellsFromLetterBoxes, cropCell, decodeGray, photometric, rotateGray, rotatePoint } from "./crops.js";
import { forEachGrid, gridCell, heightHypotheses } from "./recognize.js";
import { FOCUS_LETTERS, makeRng, synthCode } from "./synth.js";
import { listSamples } from "./dataset.js";

/** 180도 돌려도 같은 글자(틀린 회전 배경으로 쓰지 않는다). */
const SYM180 = new Set([..."HINOSXZ"]);

/**
 * 실측 금속면 조각 모음. 데이터셋 ROI(맞는 회전)에서 글자 상자(+여유) 밖 사각형들. 글자 위치를 모르는 표본은 뺀다.
 * extraFrames: 글자 위치 없이 바탕만 쓸 프레임(JPEG 버퍼)과 ROI {buffer, roi}.
 */
export async function backgroundPool(root, { exclude = [] } = {}) {
  const ex = new Set(exclude.map((c) => c.toUpperCase()));
  const pool = [];
  for (const { dir, meta } of listSamples(root)) {
    if (ex.has(meta.code) || !meta.boxes) continue;
    const roiFile = path.join(dir, "roi.jpg");
    if (!fs.existsSync(roiFile)) continue;
    const roi = await decodeGray(fs.readFileSync(roiFile));
    const rg = rotateGray(roi.gray, roi.width, roi.height, meta.rotation || 0);
    const xs = meta.boxes.flatMap((b) => [b[0], b[2]]).map((v) => v * rg.width);
    const ys = meta.boxes.flatMap((b) => [b[1], b[3]]).map((v) => v * rg.height);
    const lh = (Math.max(...ys) - Math.min(...ys)) || 40;
    const m = lh * 0.25;
    const L = Math.max(0, Math.min(...xs) - m);
    const R = Math.min(rg.width, Math.max(...xs) + m);
    const T = Math.max(0, Math.min(...ys) - m);
    const B = Math.min(rg.height, Math.max(...ys) + m);
    const rects = [
      { left: 0, top: 0, width: rg.width, height: T },
      { left: 0, top: B, width: rg.width, height: rg.height - B },
      { left: 0, top: 0, width: L, height: rg.height },
      { left: R, top: 0, width: rg.width - R, height: rg.height },
    ].filter((q) => q.width >= 40 && q.height >= 30);
    for (const q of rects) pool.push({ rg, rect: { left: Math.round(q.left), top: Math.round(q.top), width: Math.floor(q.width), height: Math.floor(q.height) }, lh });
  }
  return pool;
}

/** pool에서 width×height 바탕 하나(Float32Array). 조각을 뒤집고 늘려 채운다. */
export function bgSourceFrom(pool) {
  if (!pool.length) return null;
  return async (width, height, r) => {
    const p = r.pick(pool);
    const { rg, rect } = p;
    // 조각 안의 임의 부분(최소 절반)을 잘라 캔버스 크기로.
    const cw = Math.max(20, Math.round(rect.width * r.range(0.5, 1)));
    const chh = Math.max(16, Math.round(rect.height * r.range(0.5, 1)));
    const left = rect.left + r.int(0, Math.max(0, rect.width - cw));
    const top = rect.top + r.int(0, Math.max(0, rect.height - chh));
    let img = sharp(Buffer.from(rg.gray), { raw: { width: rg.width, height: rg.height, channels: 1 } })
      .extract({ left, top, width: Math.min(cw, rg.width - left), height: Math.min(chh, rg.height - top) });
    if (r.next() < 0.5) img = img.flop();
    if (r.next() < 0.5) img = img.flip();
    const { data } = await img.resize(width, height, { fit: "fill" }).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
    return Float32Array.from(data);
  };
}

/** 합성 표본. focusLetters: 홀드아웃·희소 글자 편향. */
export async function synthSet(count, seed = 1, log = () => {}, { bgSource = null, focusLetters = FOCUS_LETTERS } = {}) {
  const r = makeRng(seed);
  const X = [];
  const Y = [];
  for (let i = 0; i < count; i += 1) {
    const { cells } = await synthCode(r, null, { bgSource, focusLetters });
    for (const c of cells) {
      X.push(cropFeature(c.gray));
      Y.push(CLASSES.indexOf(c.label));
    }
    if ((i + 1) % 500 === 0) log(`synth ${i + 1}/${count}`);
  }
  return { X, Y };
}

/** 데이터셋 표본 하나에서 증강 칸들. */
export async function realCells(sample, { perLetter = 48, perBg = 32, seed = 3 } = {}) {
  const { dir, meta } = sample;
  if (!meta.boxes || meta.boxes.length !== 3) return [];
  const roiFile = path.join(dir, "roi.jpg");
  if (!fs.existsSync(roiFile)) return [];
  const r = makeRng(seed);
  const roi = await decodeGray(fs.readFileSync(roiFile));
  const rg = rotateGray(roi.gray, roi.width, roi.height, meta.rotation || 0);
  const px = meta.boxes.map((b) => [b[0] * rg.width, b[1] * rg.height, b[2] * rg.width, b[3] * rg.height]);
  const cells = cellsFromLetterBoxes(px);
  const pitch = cells[0].w;
  const cellH = cells[0].h;
  const out = [];
  const add = async (img, box, label) => {
    const g = await cropCell(img.gray, img.width, img.height, box);
    out.push({ gray: photometric(g, r), label });
  };
  for (let i = 0; i < 3; i += 1) {
    for (let k = 0; k < perLetter; k += 1) {
      const s = 1 + r.range(-0.1, 0.1);
      await add(rg, { cx: cells[i].cx + r.range(-0.08, 0.08) * pitch, cy: cells[i].cy + r.range(-0.07, 0.07) * cellH, w: pitch * s * (1 + r.range(-0.08, 0.08)), h: cellH * s }, meta.code[i]);
    }
  }
  const midY = cells[1].cy;
  for (let k = 0; k < perBg; k += 1) {
    const kind = k % 5;
    const s = 1 + r.range(-0.1, 0.1);
    let box;
    if (kind === 0) box = { cx: cells[r.int(0, 1)].cx + pitch * r.range(0.38, 0.62), cy: midY + r.range(-0.08, 0.08) * cellH, w: pitch * s, h: cellH * s };
    else if (kind === 1) box = { cx: cells[r.int(0, 2)].cx + r.range(-0.2, 0.2) * pitch, cy: midY + r.pick([-1, 1]) * r.range(0.42, 0.9) * cellH, w: pitch * s, h: cellH * s };
    else if (kind === 2) box = { cx: r.next() < 0.5 ? cells[0].cx - pitch * r.range(0.9, 1.6) : cells[2].cx + pitch * r.range(0.9, 1.6), cy: midY + r.range(-0.2, 0.2) * cellH, w: pitch * s, h: cellH * s };
    else if (kind === 3) {
      const sc = r.pick([0.5, 0.6, 1.7, 2.0]);
      box = { cx: cells[r.int(0, 2)].cx, cy: midY, w: pitch * sc, h: cellH * sc };
    } else box = { cx: r.range(0, rg.width), cy: r.range(0, rg.height), w: pitch * s, h: cellH * s };
    await add(rg, box, "_");
  }
  // 틀린 회전: ROI를 더 돌려 같은 글자 칸 자리를 배경으로(180도에 대칭인 글자는 빼고).
  for (const extra of [90, 180, 270]) {
    const rr = rotateGray(rg.gray, rg.width, rg.height, extra);
    for (let i = 0; i < 3; i += 1) {
      if (extra === 180 && SYM180.has(meta.code[i])) continue;
      const cx0 = cells[i].cx;
      const cy0 = cells[i].cy;
      const [cx, cy] =
        extra === 90 ? [rg.height - 1 - cy0, cx0] : extra === 180 ? [rg.width - 1 - cx0, rg.height - 1 - cy0] : [cy0, rg.width - 1 - cx0];
      for (let k = 0; k < 4; k += 1) {
        const s = 1 + r.range(-0.1, 0.1);
        await add(rr, { cx: cx + r.range(-0.1, 0.1) * pitch, cy: cy + r.range(-0.1, 0.1) * cellH, w: pitch * s, h: cellH * s }, "_");
      }
    }
  }
  return out;
}

/** 데이터셋 전체 → 특징. exclude: 뺄 코드(검증용). */
export async function realSet(root, { exclude = [], perLetter = 48, perBg = 32, log = () => {} } = {}) {
  const ex = new Set(exclude.map((c) => c.toUpperCase()));
  const X = [];
  const Y = [];
  const used = [];
  let seed = 100;
  for (const s of listSamples(root)) {
    if (ex.has(s.meta.code)) continue;
    const cells = await realCells(s, { perLetter, perBg, seed: (seed += 1) });
    if (!cells.length) continue;
    used.push(path.basename(s.dir));
    for (const c of cells) {
      X.push(cropFeature(c.gray));
      Y.push(c.label === "_" ? BG : CLASSES.indexOf(c.label));
    }
  }
  log(`real samples ${used.length}, cells ${X.length}`);
  return { X, Y, used };
}

/**
 * 어려운 배경 찾기: 지금 모델로 실측 ROI를 훑어, 글자 자리가 아닌데 글자로 높게 읽힌 칸을 배경("_")으로 모은다.
 * 맞는 회전의 글자 칸 근처(중심 ±0.3 피치·칸 높이, 크기 0.8–1.25배)는 뺀다.
 */
export async function mineNegatives(model, root, { exclude = [], perSample = 200, thr = 0.3, seed = 9, log = () => {} } = {}) {
  const ex = new Set(exclude.map((c) => c.toUpperCase()));
  const r = makeRng(seed);
  const X = [];
  const Y = [];
  for (const { dir, meta } of listSamples(root)) {
    if (ex.has(meta.code) || !meta.boxes) continue;
    const roiFile = path.join(dir, "roi.jpg");
    if (!fs.existsSync(roiFile)) continue;
    const roi = await decodeGray(fs.readFileSync(roiFile));
    const rg = rotateGray(roi.gray, roi.width, roi.height, meta.rotation || 0);
    const px = meta.boxes.map((b) => [b[0] * rg.width, b[1] * rg.height, b[2] * rg.width, b[3] * rg.height]);
    const cells = cellsFromLetterBoxes(px);
    const trueLH = cells[0].h / 1.15;
    const pitch = cells[0].w;
    const heights = heightHypotheses(trueLH * 0.6, trueLH * 1.6, 6);
    const found = [];
    for (const extra of [0, 90, 180, 270]) {
      const img = rotateGray(rg.gray, rg.width, rg.height, extra);
      const centers = cells.map((c, i) => {
        const [x, y] = rotatePoint(c.cx, c.cy, rg.width, rg.height, extra);
        return { x, y, letter: meta.code[i] };
      });
      const guard = extra === 0 ? centers : extra === 180 ? centers.filter((c) => SYM180.has(c.letter)) : [];
      await forEachGrid(model, img, heights, (g) => {
        for (let row = 0; row < g.rows; row += 1) {
          for (let col = 0; col < g.cols; col += 1) {
            const base = (row * g.cols + col) * CLASSES.length;
            let best = 0;
            for (let k = 1; k < BG; k += 1) if (g.probs[base + k] > g.probs[base + best]) best = k;
            const p = g.probs[base + best];
            if (p < thr) continue;
            const cell = gridCell(g, col, row);
            const scale = g.lh / trueLH;
            const nearTrue = guard.some(
              (c) => Math.abs(cell.cx - c.x) < 0.3 * pitch && Math.abs(cell.cy - c.y) < 0.3 * cells[0].h && scale > 0.8 && scale < 1.25,
            );
            if (nearTrue) continue;
            found.push({ p: p + r.next() * 0.05, img, cell });
          }
        }
      }, [0.66, 0.78, 0.9]);
    }
    found.sort((a, b) => b.p - a.p);
    const take = found.slice(0, perSample);
    for (const f of take) {
      const g = await cropCell(f.img.gray, f.img.width, f.img.height, f.cell);
      X.push(cropFeature(photometric(g, r)));
      Y.push(BG);
    }
  }
  log(`hard negatives ${X.length}`);
  return { X, Y };
}
