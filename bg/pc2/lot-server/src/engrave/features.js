// change-log:
// - 2026-11-27: ROI 전체 퍼센타일 스트레치는 금속면 대비를 죽여 되돌림. 특징 계산은 원본 회색조 HOG+밝기.
// - 2026-11-27: 각인 글자 특징. 글자 한 칸을 32×48로 맞춘 회색조에서 HOG(9방향×4×6) + 밝기 블록(4×6) = 240차원.
//   추론은 회전·크기 맞춘 ROI 전체에 적분영상을 만들어 칸마다 O(1)로 뽑는다(학습 크롭과 같은 계산).
// related files:
// - bg/pc2/lot-server/src/engrave/recognize.js
// - bg/pc2/lot-server/src/engrave/mlp.js
// - bg/pc2/lot-server/scripts/train-engrave.mjs

export const CELL_W = 32;
export const CELL_H = 48;
export const GX = 4;
export const GY = 6;
export const BINS = 9;
export const FEAT_DIM = BINS * GX * GY + GX * GY;

/**
 * 회색조(0–255) 한 장의 적분영상들. bins[k]는 방향 k 기울기 크기의 적분, lum은 밝기 적분, lum2는 제곱 적분.
 * @param {Uint8Array | Buffer | Float32Array} gray
 */
export function buildIntegrals(gray, width, height) {
  const W1 = width + 1;
  const size = W1 * (height + 1);
  const bins = Array.from({ length: BINS }, () => new Float64Array(size));
  const lum = new Float64Array(size);
  const lum2 = new Float64Array(size);
  const mag = new Float32Array(width * height);
  const bin = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const xm = x > 0 ? x - 1 : x;
      const xp = x < width - 1 ? x + 1 : x;
      const ym = y > 0 ? y - 1 : y;
      const yp = y < height - 1 ? y + 1 : y;
      const gx = gray[y * width + xp] - gray[y * width + xm];
      const gy = gray[yp * width + x] - gray[ym * width + x];
      const m = Math.sqrt(gx * gx + gy * gy);
      let a = Math.atan2(gy, gx);
      if (a < 0) a += Math.PI;
      let k = Math.floor((a / Math.PI) * BINS);
      if (k >= BINS) k = BINS - 1;
      mag[y * width + x] = m;
      bin[y * width + x] = k;
    }
  }
  for (let y = 0; y < height; y += 1) {
    const rowB = new Float64Array(BINS);
    let rowL = 0;
    let rowL2 = 0;
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      rowB[bin[i]] += mag[i];
      const v = gray[i];
      rowL += v;
      rowL2 += v * v;
      const o = (y + 1) * W1 + x + 1;
      const up = y * W1 + x + 1;
      for (let k = 0; k < BINS; k += 1) bins[k][o] = bins[k][up] + rowB[k];
      lum[o] = lum[up] + rowL;
      lum2[o] = lum2[up] + rowL2;
    }
  }
  return { width, height, W1, bins, lum, lum2 };
}

function rectSum(arr, W1, x0, y0, x1, y1) {
  return arr[y1 * W1 + x1] - arr[y0 * W1 + x1] - arr[y1 * W1 + x0] + arr[y0 * W1 + x0];
}

/**
 * 칸(x,y,CELL_W,CELL_H)의 특징. out에 쓴다(없으면 새 배열).
 * @param {ReturnType<typeof buildIntegrals>} ii
 */
export function cellFeature(ii, x, y, out = new Float32Array(FEAT_DIM)) {
  const { W1, bins, lum, lum2 } = ii;
  const cw = CELL_W / GX;
  const ch = CELL_H / GY;
  let p = 0;
  let norm = 1e-6;
  for (let gy = 0; gy < GY; gy += 1) {
    for (let gx = 0; gx < GX; gx += 1) {
      const x0 = Math.round(x + gx * cw);
      const y0 = Math.round(y + gy * ch);
      const x1 = Math.round(x + (gx + 1) * cw);
      const y1 = Math.round(y + (gy + 1) * ch);
      for (let k = 0; k < BINS; k += 1) {
        const v = Math.sqrt(Math.max(0, rectSum(bins[k], W1, x0, y0, x1, y1)));
        out[p++] = v;
        norm += v * v;
      }
    }
  }
  norm = Math.sqrt(norm);
  for (let i = 0; i < p; i += 1) out[i] = Math.min(0.35, out[i] / norm) * 2.5;
  // 밝기 블록: 칸 평균·표준편차로 정규화.
  const n = CELL_W * CELL_H;
  const s = rectSum(lum, W1, x, y, x + CELL_W, y + CELL_H);
  const s2 = rectSum(lum2, W1, x, y, x + CELL_W, y + CELL_H);
  const mean = s / n;
  const sd = Math.sqrt(Math.max(1, s2 / n - mean * mean));
  for (let gy = 0; gy < GY; gy += 1) {
    for (let gx = 0; gx < GX; gx += 1) {
      const x0 = Math.round(x + gx * cw);
      const y0 = Math.round(y + gy * ch);
      const x1 = Math.round(x + (gx + 1) * cw);
      const y1 = Math.round(y + (gy + 1) * ch);
      const m = rectSum(lum, W1, x0, y0, x1, y1) / ((x1 - x0) * (y1 - y0));
      out[p++] = Math.max(-3, Math.min(3, (m - mean) / sd)) * 0.5;
    }
  }
  return out;
}

/** 32×48 회색조 크롭 하나의 특징(학습용). */
export function cropFeature(gray) {
  const ii = buildIntegrals(gray, CELL_W, CELL_H);
  return cellFeature(ii, 0, 0);
}
