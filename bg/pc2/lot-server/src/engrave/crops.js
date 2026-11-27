// change-log:
// - 2026-11-27: 프레임 → 회색조·ROI·회전, 칸(글자) 잘라내기, 밝기·흐림·잡음 증강. 학습·추론·데이터셋이 같은 함수를 쓴다.
// related files:
// - bg/pc2/lot-server/src/engrave/recognize.js
// - bg/pc2/lot-server/src/engrave/dataset.js
// - bg/pc2/lot-server/scripts/train-engrave.mjs

import sharp from "sharp";
import { CELL_H, CELL_W } from "./features.js";
import { cropCell } from "./synth.js";

/** 칸 높이 = 글자 높이 × CELL_PAD_Y. */
export const CELL_PAD_Y = 1.15;

/** JPEG/PNG 버퍼 → 회색조 raw. */
export async function decodeGray(input) {
  const { data, info } = await sharp(input).greyscale().extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  return { gray: new Uint8Array(data), width: info.width, height: info.height };
}

/** 정규화 ROI(0–1) → 픽셀 사각형(프레임 안으로 자름). */
export function roiPixels(roi, width, height) {
  const r = roi || { x: 0, y: 0, w: 1, h: 1 };
  const left = Math.max(0, Math.min(width - 2, Math.round(r.x * width)));
  const top = Math.max(0, Math.min(height - 2, Math.round(r.y * height)));
  const w = Math.max(2, Math.min(width - left, Math.round(r.w * width)));
  const h = Math.max(2, Math.min(height - top, Math.round(r.h * height)));
  return { left, top, width: w, height: h };
}

/** 회색조 raw를 시계 방향 angle(0/90/180/270)만큼 돌린다. */
export function rotateGray(gray, width, height, angle) {
  const a = ((angle % 360) + 360) % 360;
  if (a === 0) return { gray, width, height };
  if (a === 180) {
    const out = new Uint8Array(gray.length);
    for (let i = 0; i < gray.length; i += 1) out[i] = gray[gray.length - 1 - i];
    return { gray: out, width, height };
  }
  const out = new Uint8Array(gray.length);
  const W = height;
  const H = width;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // 90: (x,y) → (H0-1-y, x)   270: (x,y) → (y, W0-1-x)
      const nx = a === 90 ? height - 1 - y : y;
      const ny = a === 90 ? x : width - 1 - x;
      out[ny * W + nx] = gray[y * width + x];
    }
  }
  return { gray: out, width: W, height: H };
}

/** rotateGray와 같은 규칙으로 점 (x,y)를 돌린다(w,h = 돌리기 전 크기). */
export function rotatePoint(x, y, width, height, angle) {
  const a = ((angle % 360) + 360) % 360;
  if (a === 90) return [height - 1 - y, x];
  if (a === 180) return [width - 1 - x, height - 1 - y];
  if (a === 270) return [y, width - 1 - x];
  return [x, y];
}

/** 상자 [x0,y0,x1,y1]를 돌린다. */
export function rotateBox(b, width, height, angle) {
  const p = [rotatePoint(b[0], b[1], width, height, angle), rotatePoint(b[2], b[3], width, height, angle)];
  return [Math.min(p[0][0], p[1][0]), Math.min(p[0][1], p[1][1]), Math.max(p[0][0], p[1][0]), Math.max(p[0][1], p[1][1])];
}

/** 회색조 raw의 사각형 크롭. */
export function cropGray(gray, width, rect) {
  const out = new Uint8Array(rect.width * rect.height);
  for (let y = 0; y < rect.height; y += 1) {
    const src = (rect.top + y) * width + rect.left;
    out.set(gray.subarray(src, src + rect.width), y * rect.width);
  }
  return out;
}

/** 칸 이미지(32×48) 밝기·대비·감마·잡음·흐림 증강. */
export function photometric(cell, r) {
  const out = new Uint8Array(cell.length);
  const gamma = r.range(0.7, 1.4);
  const contrast = r.range(0.65, 1.3);
  const shift = r.range(-35, 35);
  const noise = r.range(0, 12);
  let mean = 0;
  for (const v of cell) mean += v;
  mean /= cell.length;
  for (let i = 0; i < cell.length; i += 1) {
    let v = (cell[i] - mean) * contrast + mean + shift;
    v = 255 * Math.pow(Math.max(0, Math.min(255, v)) / 255, gamma) + (r.next() - 0.5) * noise;
    out[i] = Math.max(0, Math.min(255, v));
  }
  if (r.next() < 0.35) {
    // 가로·세로 3탭 흐림
    const b = new Uint8Array(out.length);
    for (let y = 0; y < CELL_H; y += 1) {
      for (let x = 0; x < CELL_W; x += 1) {
        let s = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= CELL_W || yy >= CELL_H) continue;
            s += out[yy * CELL_W + xx];
            n += 1;
          }
        }
        b[y * CELL_W + x] = s / n;
      }
    }
    return b;
  }
  return out;
}

/** 글자 상자(회전된 ROI 좌표, px)들 → 칸(중심·폭·높이). 폭은 이웃 글자 중심 간격(피치). */
export function cellsFromLetterBoxes(boxes) {
  const centers = boxes.map((b) => ({ cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2, h: b[3] - b[1], w: b[2] - b[0] }));
  const pitch =
    centers.length > 1
      ? (centers[centers.length - 1].cx - centers[0].cx) / (centers.length - 1)
      : centers[0].w * 1.08;
  return centers.map((c) => ({ cx: c.cx, cy: c.cy, w: pitch, h: c.h * CELL_PAD_Y }));
}

export { cropCell };
