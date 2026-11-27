// change-log:
// - 2026-11-27: 대기 목록이 있을 때 마진은 목록 안 라이벌만 본다(목록 밖 오독이 ambiguous로 막지 않음).
//   1위가 목록 밖이면 여전히 not_in_queue(목록 안 2위로 바꾸지 않음). 확정 전에 not_in_queue를 ambiguous보다 먼저 검사.
// - 2026-11-27: 각인 전용 인식. 지그 프로필 ROI를 자르고 0/90/180/270도로 돌려, 글자 높이·피치 가설마다
//   32×48 칸 특징 → MLP(A–Z+배경) 확률 격자를 만든다. 이웃한 세 칸이 한 코드.
//   코드 증거 = 그 코드의 가장 좋은 창 근처(같은 회전·반 글자 안·크기 ±30%) 창들의 세 칸 확률 곱 합(한 자리에서 일관되게 읽힌 코드가 앞선다).
//   후보 = 창마다 칸별 1위로 읽은 코드들 + 대기 목록 코드. 확정: 증거 1위가 (1) 가장 좋은 창에서 세 글자 모두 확률 ≥ MIN_P,
//   (2) 2위 코드보다 증거가 4배↑, (3) allowed(대기 목록)에 있을 때. 1위가 목록 밖이면 reason not_in_queue(목록 안 2위로 바꾸지 않는다).
// related files:
// - bg/pc2/lot-server/src/engrave/features.js
// - bg/pc2/lot-server/src/engrave/mlp.js
// - bg/pc2/lot-server/src/engrave/model-store.js
// - bg/pc2/lot-server/src/jig-profiles.js
// - bg/pc2/lot-server/src/ocr/index.js

import sharp from "sharp";
import { CELL_H, CELL_W, FEAT_DIM, buildIntegrals, cellFeature } from "./features.js";
import { BG, CLASSES, forward } from "./mlp.js";
import { CELL_PAD_Y, cropGray, decodeGray, roiPixels, rotateGray } from "./crops.js";
import { loadModel } from "./model-store.js";

const LETTERS = CLASSES.length - 1;
export const MIN_P = 0.45;
export const MARGIN = Math.log(4);
export const STRIDE = 4;
const ASPECTS = [0.66, 0.78, 0.9];
const HEIGHT_STEPS = 5;

/** 회색조 raw 리사이즈(비등방) + 약한 흐림. */
async function resizeGray(gray, width, height, outW, outH) {
  const { data } = await sharp(Buffer.from(gray), { raw: { width, height, channels: 1 } })
    .resize(Math.max(CELL_W * 3 + 1, outW), Math.max(CELL_H + 1, outH), { fit: "fill" })
    .blur(0.8)
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { gray: new Uint8Array(data), width: Math.max(CELL_W * 3 + 1, outW), height: Math.max(CELL_H + 1, outH) };
}

/**
 * 한 회전·가설에서 칸 확률 격자.
 * @returns {{ cols:number, rows:number, probs: Float32Array }} probs[(row*cols+col)*27+k]
 */
function probGrid(model, img) {
  const ii = buildIntegrals(img.gray, img.width, img.height);
  const cols = Math.floor((img.width - CELL_W) / STRIDE) + 1;
  const rows = Math.floor((img.height - CELL_H) / STRIDE) + 1;
  const probs = new Float32Array(cols * rows * CLASSES.length);
  const feat = new Float32Array(FEAT_DIM);
  const h = new Float32Array(model.hidden);
  const out = new Float32Array(model.outDim);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      cellFeature(ii, c * STRIDE, r * STRIDE, feat);
      forward(model, feat, h, out);
      probs.set(out, (r * cols + c) * CLASSES.length);
    }
  }
  return { cols, rows, probs };
}

/** 글자 높이 가설(px). */
export function heightHypotheses(minPx, maxPx, steps = HEIGHT_STEPS) {
  return Array.from({ length: steps }, (_, i) => minPx * Math.pow(maxPx / minPx, steps === 1 ? 0 : i / (steps - 1)));
}

/**
 * 회전된 ROI 한 장에 대해 (글자 높이 × 피치) 가설마다 확률 격자를 만들어 넘긴다.
 * visit({ cols, rows, probs, sx, sy, lh, aspect })
 */
export async function forEachGrid(model, rg, heights, visit, aspects = ASPECTS) {
  for (const lh of heights) {
    const sy = CELL_H / (lh * CELL_PAD_Y);
    for (const aspect of aspects) {
      const sx = CELL_W / (lh * aspect);
      const outW = Math.round(rg.width * sx);
      const outH = Math.round(rg.height * sy);
      if (outW < CELL_W * 3 || outH < CELL_H) continue;
      const img = await resizeGray(rg.gray, rg.width, rg.height, outW, outH);
      const grid = probGrid(model, img);
      await visit({ ...grid, sx, sy, lh, aspect });
    }
  }
}

/** 격자 칸 (col,row) → 회전된 ROI 픽셀 칸 {cx,cy,w,h}. */
export function gridCell(g, col, row) {
  const w = CELL_W / g.sx;
  const h = CELL_H / g.sy;
  return { cx: (col * STRIDE) / g.sx + w / 2, cy: (row * STRIDE) / g.sy + h / 2, w, h };
}

/**
 * 프레임의 ROI를 회전·크기 가설마다 훑어 확률 격자들을 만든다.
 * @param {Buffer} input JPEG
 * @param {{ profile: object, model?: object }} opts
 */
export async function scanFrame(input, { profile, model = loadModel()?.model } = {}) {
  if (!model) return { ok: false, reason: "no-model", grids: [] };
  const frame = await decodeGray(input);
  const rect = roiPixels(profile.roi, frame.width, frame.height);
  const roiGray = cropGray(frame.gray, frame.width, rect);
  const heights = heightHypotheses(profile.letterH.min * frame.height, profile.letterH.max * frame.height);
  const grids = [];
  for (const rot of profile.rotations) {
    const rg = rotateGray(roiGray, rect.width, rect.height, rot);
    await forEachGrid(model, rg, heights, (g) => {
      grids.push({ ...g, rot, rgW: rg.width, rgH: rg.height });
    });
  }
  return { ok: true, grids, rect, frame: { width: frame.width, height: frame.height } };
}

const STEP = CELL_W / STRIDE; // 이웃 칸 간격(격자 열 수)
const K = CLASSES.length;

/** 창마다 칸별 1위(배경 제외)로 읽은 코드와 그 확률 곱 합. */
export function freeReadings(grids) {
  const mass = new Map();
  for (const g of grids) {
    const { probs, cols, rows } = g;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c + 2 * STEP < cols; c += 1) {
        let code = "";
        let prod = 1;
        for (let i = 0; i < 3; i += 1) {
          const base = (r * cols + c + i * STEP) * K;
          let best = 0;
          for (let k = 1; k < LETTERS; k += 1) if (probs[base + k] > probs[base + best]) best = k;
          code += CLASSES[best];
          prod *= probs[base + best];
        }
        if (prod < 1e-4) continue;
        mass.set(code, (mass.get(code) || 0) + prod);
      }
    }
  }
  return [...mass.entries()].sort((a, b) => b[1] - a[1]);
}

/** 두 창이 같은 자리·비슷한 크기인가(회전된 ROI 픽셀 기준). */
function near(g, c, r, w) {
  if (g.rot !== w.rot) return false;
  const ratio = g.lh / w.lh;
  if (ratio < 0.75 || ratio > 1.33) return false;
  const cx = (c * STRIDE + CELL_W * 1.5) / g.sx;
  const cy = (r * STRIDE + CELL_H / 2) / g.sy;
  const wx = (w.col * STRIDE + CELL_W * 1.5) / w.sx;
  const wy = (w.row * STRIDE + CELL_H / 2) / w.sy;
  return Math.abs(cx - wx) < 0.5 * w.lh * w.aspect && Math.abs(cy - wy) < 0.35 * w.lh;
}

/**
 * 코드마다 가장 좋은 창과 증거(그 창 근처 — 같은 회전, 반 글자 안, 크기 ±30% — 창들의 확률 곱 합).
 * 멀리 떨어진 여러 곳의 약한 오독이 쌓여 이기지 않도록 한 자리만 센다.
 */
export function codeEvidence(grids, codes) {
  const list = [...new Set(codes)].filter((c) => /^[A-Z]{3}$/.test(c));
  const idx = list.map((c) => [...c].map((ch) => CLASSES.indexOf(ch)));
  const out = list.map((code) => ({ code, mass: 0, best: null, bestProd: 0 }));
  const each = (fn) => {
    for (const g of grids) {
      const { probs, cols, rows } = g;
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c + 2 * STEP < cols; c += 1) {
          const b0 = (r * cols + c) * K;
          const b1 = b0 + STEP * K;
          const b2 = b1 + STEP * K;
          for (let j = 0; j < list.length; j += 1) {
            const [i0, i1, i2] = idx[j];
            const p0 = probs[b0 + i0];
            const p1 = probs[b1 + i1];
            const p2 = probs[b2 + i2];
            const prod = p0 * p1 * p2;
            if (prod < 1e-9) continue;
            fn(out[j], prod, g, c, r, p0, p1, p2);
          }
        }
      }
    }
  };
  each((e, prod, g, c, r, p0, p1, p2) => {
    if (prod > e.bestProd) {
      e.bestProd = prod;
      const base = (r * g.cols + c) * K;
      // 글자다움: 세 칸 모두 배경이 아닐 확률(어느 글자인지와 무관). 데이터 수집 때 위치 확인용.
      const letterness = 1 - Math.max(g.probs[base + BG], g.probs[base + STEP * K + BG], g.probs[base + 2 * STEP * K + BG]);
      e.best = { col: c, row: r, sx: g.sx, sy: g.sy, lh: g.lh, aspect: g.aspect, rot: g.rot, rgW: g.rgW, rgH: g.rgH, minP: Math.min(p0, p1, p2), letterness };
    }
  });
  each((e, prod, g, c, r) => {
    if (e.best && near(g, c, r, e.best)) e.mass += prod;
  });
  return out.filter((e) => e.best).sort((a, b) => b.mass - a.mass);
}

/** 창 → 회전된 ROI 안 글자 상자(정규화 0–1). */
export function windowBoxes(w) {
  const pitch = CELL_W / w.sx;
  const cellH = CELL_H / w.sy;
  const x0 = (w.col * STRIDE) / w.sx;
  const y0 = (w.row * STRIDE) / w.sy;
  return [0, 1, 2].map((i) => {
    const cx = x0 + (i + 0.5) * pitch;
    const cy = y0 + cellH / 2;
    const lh = cellH / CELL_PAD_Y;
    const lw = pitch * 0.9;
    return [(cx - lw / 2) / w.rgW, (cy - lh / 2) / w.rgH, (cx + lw / 2) / w.rgW, (cy + lh / 2) / w.rgH].map((v) => Math.round(v * 10000) / 10000);
  });
}

const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * 각인 3글자 인식.
 * @param {Buffer} input
 * @param {{ profile: object, allowed?: Iterable<string> | null, model?: object }} opts
 */
export async function recognizeEngraving(input, { profile, allowed = null, model } = {}) {
  const scan = await scanFrame(input, { profile, model });
  if (!scan.ok) return { success: false, reason: scan.reason, method: "engrave" };
  const allow = allowed ? new Set([...allowed].map((v) => String(v).toUpperCase())) : null;
  const free = freeReadings(scan.grids).slice(0, 12).map(([code]) => code);
  if (!free.length) return { success: false, reason: "no-candidate", method: "engrave", top: "" };
  const ev = codeEvidence(scan.grids, [...free, ...(allow || [])]);
  const top = ev[0];
  // 대기 목록이 있으면 마진은 목록 안 다른 코드와만 비교. 목록 밖 오독(예: BLZ)이 확정을 막지 않는다.
  // 다만 1위 자체가 목록 밖이면 아래에서 not_in_queue로 버린다(2위로 바꾸지 않음).
  const rival =
    (allow
      ? ev.find((e) => e.code !== top.code && allow.has(e.code))
      : ev.find((e) => e.code !== top.code)) || { code: "", mass: 0 };
  const margin = rival.mass > 0 ? Math.log(top.mass / rival.mass) : 99;
  const w = top.best;
  const info = {
    method: "engrave",
    lot: "",
    top: top.code,
    confidence: round(100 * Math.cbrt(top.bestProd), 1),
    evidence: round(top.mass, 4),
    margin: round(margin),
    rival: rival.code,
    minP: round(w.minP, 3),
    rotation: w.rot,
    letterH: round(w.lh / scan.frame.height, 4),
    boxes: windowBoxes(w),
    roi: profile.roi,
    profileId: profile.id,
    ranking: ev.slice(0, 5).map((e) => ({ code: e.code, evidence: round(e.mass, 4) })),
  };
  if (w.minP < MIN_P) return { ...info, success: false, reason: "low-confidence" };
  if (allow && !allow.has(top.code)) return { ...info, success: false, reason: "not_in_queue", rejected: top.code };
  if (margin < MARGIN) return { ...info, success: false, reason: "ambiguous" };
  return { ...info, success: true, lot: top.code, provider: "engrave-mlp" };
}

/** 위치를 믿고 학습에 써도 되는가: 코드 확률이 높거나, 세 칸 모두 글자다움이 높을 때. */
export function locationTrusted(loc) {
  return Boolean(loc && (loc.meanP >= 0.35 || (loc.letterness >= 0.6 && loc.meanP >= 0.01)));
}

/** 알려진 코드(매칭으로 확정된 코드)의 위치 찾기. 데이터셋 저장용. */
export async function locateCode(input, code, { profile, model } = {}) {
  const scan = await scanFrame(input, { profile, model });
  if (!scan.ok) return null;
  const [e] = codeEvidence(scan.grids, [code]);
  if (!e?.best) return null;
  return {
    meanP: Math.cbrt(e.bestProd),
    letterness: e.best.letterness,
    evidence: e.mass,
    rotation: e.best.rot,
    boxes: windowBoxes(e.best),
    letterH: e.best.lh / scan.frame.height,
    rect: scan.rect,
    frame: scan.frame,
  };
}
