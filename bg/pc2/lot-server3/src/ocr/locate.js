// change-log:
// - 2026-11-26: padRatio 옵션(촘촘한 크롭이 각인 OCR에 유리).
// - 2026-11-26: 글자 후보 영역 찾기. 이진화 → 연결 성분 → 가로로 나란한 2–4개 묶음 bbox.
// related files:
// - bg/pc2/lot-server2/src/ocr/preprocess.js
// - bg/pc2/lot-server2/src/ocr/index.js

import sharp from "sharp";

const WORK_WIDTH = 320;

/** Otsu 임계값(0–255). */
export function otsuThreshold(gray) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i += 1) hist[gray[i]] += 1;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * hist[i];
  let sumB = 0;
  let weightB = 0;
  let best = -1;
  let threshold = 128;
  for (let i = 0; i < 256; i += 1) {
    weightB += hist[i];
    if (!weightB) continue;
    const weightF = total - weightB;
    if (!weightF) break;
    sumB += i * hist[i];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const between = weightB * weightF * (meanB - meanF) ** 2;
    if (between > best) {
      best = between;
      threshold = i;
    }
  }
  return threshold;
}

/**
 * 이진 마스크(1=잉크)에서 4-연결 성분 bbox.
 * @returns {{x0:number,y0:number,x1:number,y1:number,area:number}[]}
 */
export function connectedComponents(mask, width, height) {
  const labels = new Int32Array(width * height);
  const comps = [];
  const stack = [];
  let next = 0;
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || labels[start]) continue;
    next += 1;
    labels[start] = next;
    stack.push(start);
    const c = { x0: width, y0: height, x1: 0, y1: 0, area: 0 };
    while (stack.length) {
      const p = stack.pop();
      const x = p % width;
      const y = (p - x) / width;
      c.area += 1;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      const n = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
      for (const q of n) {
        if (q >= 0 && mask[q] && !labels[q]) {
          labels[q] = next;
          stack.push(q);
        }
      }
    }
    comps.push(c);
  }
  return comps;
}

function isCharLike(c, width, height) {
  const w = c.x1 - c.x0 + 1;
  const h = c.y1 - c.y0 + 1;
  if (h < Math.max(6, height * 0.04) || h > height * 0.85) return false;
  if (w < 2 || w > width * 0.6) return false;
  const aspect = w / h;
  // 붙어 버린 2–3글자도 한 성분일 수 있다.
  if (aspect < 0.12 || aspect > 4.5) return false;
  const fill = c.area / (w * h);
  return fill > 0.12 && fill < 0.95;
}

/** 높이가 비슷하고 가로로 이어진 성분 묶음(1–4개). 면적 큰 순. */
export function groupTextRuns(comps) {
  const sorted = [...comps].sort((a, b) => a.x0 - b.x0);
  const runs = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const run = [sorted[i]];
    let last = sorted[i];
    for (let j = i + 1; j < sorted.length && run.length < 4; j += 1) {
      const c = sorted[j];
      const hl = last.y1 - last.y0 + 1;
      const hc = c.y1 - c.y0 + 1;
      const ratio = Math.max(hl, hc) / Math.min(hl, hc);
      const cyL = (last.y0 + last.y1) / 2;
      const cyC = (c.y0 + c.y1) / 2;
      const gap = c.x0 - last.x1;
      if (ratio <= 1.7 && Math.abs(cyL - cyC) <= Math.max(hl, hc) * 0.45 && gap >= -2 && gap <= Math.max(hl, hc) * 1.2) {
        run.push(c);
        last = c;
      }
    }
    const x0 = Math.min(...run.map((c) => c.x0));
    const x1 = Math.max(...run.map((c) => c.x1));
    const y0 = Math.min(...run.map((c) => c.y0));
    const y1 = Math.max(...run.map((c) => c.y1));
    const aspect = (x1 - x0 + 1) / (y1 - y0 + 1);
    // 3글자 줄은 대략 가로가 세로의 1–6배.
    if (aspect >= 1 && aspect <= 6) runs.push(run);
  }
  // 잡티보다 글자 획이 크다: 면적 합이 큰 묶음 먼저.
  const area = (run) => run.reduce((s, c) => s + c.area, 0);
  runs.sort((a, b) => area(b) - area(a));
  return runs;
}

/**
 * 글자처럼 보이는 영역 bbox(원본 좌표) 후보. 많아야 maxBoxes개. padRatio는 글자 높이 대비 여백.
 * @param {Buffer} input
 */
export async function locateTextBoxes(input, { maxBoxes = 3, padRatio = 0.45 } = {}) {
  const meta = await sharp(input).metadata();
  const fullW = meta.width || 0;
  const fullH = meta.height || 0;
  if (!fullW || !fullH) return [];
  const { data, info } = await sharp(input)
    .greyscale()
    .resize({ width: Math.min(WORK_WIDTH, fullW) })
    .median(3)
    .normalize()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const t = otsuThreshold(data);
  const boxes = [];
  for (const darkInk of [true, false]) {
    const mask = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i += 1) mask[i] = darkInk ? (data[i] < t ? 1 : 0) : data[i] >= t ? 1 : 0;
    const comps = connectedComponents(mask, width, height).filter((c) => isCharLike(c, width, height));
    for (const run of groupTextRuns(comps).slice(0, 4)) {
      const x0 = Math.min(...run.map((c) => c.x0));
      const y0 = Math.min(...run.map((c) => c.y0));
      const x1 = Math.max(...run.map((c) => c.x1));
      const y1 = Math.max(...run.map((c) => c.y1));
      const h = y1 - y0 + 1;
      const pad = Math.ceil(h * padRatio);
      const sx = fullW / width;
      const sy = fullH / height;
      const left = Math.max(0, Math.floor((x0 - pad) * sx));
      const top = Math.max(0, Math.floor((y0 - pad) * sy));
      const right = Math.min(fullW, Math.ceil((x1 + 1 + pad) * sx));
      const bottom = Math.min(fullH, Math.ceil((y1 + 1 + pad) * sy));
      const area = run.reduce((s, c) => s + c.area, 0);
      boxes.push({ left, top, width: right - left, height: bottom - top, darkInk, count: run.length, area });
    }
  }
  // 면적 큰 묶음 먼저, 겹치는 상자는 하나만.
  boxes.sort((a, b) => b.area - a.area);
  const picked = [];
  for (const b of boxes) {
    const overlaps = picked.some((p) => {
      const ix = Math.max(0, Math.min(p.left + p.width, b.left + b.width) - Math.max(p.left, b.left));
      const iy = Math.max(0, Math.min(p.top + p.height, b.top + b.height) - Math.max(p.top, b.top));
      return ix * iy > 0.5 * Math.min(p.width * p.height, b.width * b.height);
    });
    if (!overlaps) picked.push(b);
    if (picked.length >= maxBoxes) break;
  }
  return picked;
}
