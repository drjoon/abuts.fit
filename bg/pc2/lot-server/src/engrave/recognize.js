// change-log:
// - 2026-11-28: 리사이즈를 프로세스 안에서 동기 처리, 이전 회전·글자 높이를 먼저 보고 확신이 있으면 나머지 가설을 건너뛴다.
// - 2026-11-28: 마진 기본은 모든 코드와 비교(LOT_ENGRAVE_QUEUE_MARGIN=1이면 목록 안만). 1위가 목록 밖이면 먼저 not_in_queue.
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

/** 회색조 raw 리사이즈(비등방) + 3×3 상자 흐림. sharp 왕복 없이 같은 프로세스에서 처리한다. */
function resizeGray(gray, width, height, outW, outH) {
  const tw = Math.max(CELL_W * 3 + 1, Math.round(outW));
  const th = Math.max(CELL_H + 1, Math.round(outH));
  const tmp = new Uint8Array(tw * th);
  const xScale = width / tw;
  const yScale = height / th;
  for (let y = 0; y < th; y += 1) {
    const fy = (y + 0.5) * yScale - 0.5;
    const y0 = fy < 0 ? 0 : fy >= height - 1 ? height - 1 : Math.floor(fy);
    const y1 = Math.min(height - 1, y0 + 1);
    const ty = fy < 0 ? 0 : fy >= height - 1 ? 1 : fy - y0;
    for (let x = 0; x < tw; x += 1) {
      const fx = (x + 0.5) * xScale - 0.5;
      const x0 = fx < 0 ? 0 : fx >= width - 1 ? width - 1 : Math.floor(fx);
      const x1 = Math.min(width - 1, x0 + 1);
      const tx = fx < 0 ? 0 : fx >= width - 1 ? 1 : fx - x0;
      const a = gray[y0 * width + x0];
      const b = gray[y0 * width + x1];
      const c = gray[y1 * width + x0];
      const d = gray[y1 * width + x1];
      tmp[y * tw + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty + 0.5;
    }
  }
  const out = new Uint8Array(tw * th);
  for (let y = 0; y < th; y += 1) {
    const y0 = y === 0 ? 0 : y - 1;
    const y2 = y === th - 1 ? th - 1 : y + 1;
    for (let x = 0; x < tw; x += 1) {
      const x0 = x === 0 ? 0 : x - 1;
      const x2 = x === tw - 1 ? tw - 1 : x + 1;
      let s = 0;
      s += tmp[y0 * tw + x0] + tmp[y0 * tw + x] + tmp[y0 * tw + x2];
      s += tmp[y * tw + x0] + tmp[y * tw + x] + tmp[y * tw + x2];
      s += tmp[y2 * tw + x0] + tmp[y2 * tw + x] + tmp[y2 * tw + x2];
      out[y * tw + x] = (s / 9) + 0.5;
    }
  }
  return { gray: out, width: tw, height: th };
}

/** 힌트 회전을 맨 앞에. */
export function orderRotations(rots, hintRot) {
  const list = [...new Set((rots || []).map((r) => ((Math.round(Number(r) / 90) * 90) % 360 + 360) % 360))];
  if (hintRot == null || !list.includes(hintRot)) return list.length ? list : [0, 90, 180, 270];
  return [hintRot, ...list.filter((r) => r !== hintRot)];
}

function orderHeights(heights, hintLh) {
  if (hintLh == null || !Number.isFinite(hintLh)) return heights;
  return [...heights].sort((a, b) => Math.abs(a - hintLh) - Math.abs(b - hintLh));
}

function hintHeightPx(hint, frameHeight) {
  if (hint?.letterH == null || !Number.isFinite(Number(hint.letterH))) return null;
  const v = Number(hint.letterH);
  return v <= 2 ? v * frameHeight : v;
}

function orderAspects(aspects, hintAspect) {
  if (hintAspect == null || !Number.isFinite(hintAspect)) return aspects;
  return [...aspects].sort((a, b) => Math.abs(a - hintAspect) - Math.abs(b - hintAspect));
}

/** 이 격자만으로 확정(또는 확실한 목록 밖)으로 봐도 되는가. */
export function confidentEnough(info, { hinted = false } = {}) {
  if (!info?.top || info.reason === "no-candidate" || info.reason === "no-model") return false;
  if ((info.minP || 0) < MIN_P) return false;
  if ((info.margin || 0) >= MARGIN) return true;
  // 힌트 회전에서 세 글자 확률이 매우 높으면 나머지 회전은 건너뛴다(마진은 최종 판정 규칙을 그대로 적용).
  return Boolean(hinted && (info.minP || 0) >= 0.8);
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
export function forEachGrid(model, rg, heights, visit, aspects = ASPECTS) {
  for (const lh of heights) {
    const sy = CELL_H / (lh * CELL_PAD_Y);
    for (const aspect of aspects) {
      const sx = CELL_W / (lh * aspect);
      const outW = Math.round(rg.width * sx);
      const outH = Math.round(rg.height * sy);
      if (outW < CELL_W * 3 || outH < CELL_H) continue;
      const img = resizeGray(rg.gray, rg.width, rg.height, outW, outH);
      const grid = probGrid(model, img);
      visit({ ...grid, sx, sy, lh, aspect });
    }
  }
}

function pushGrids(model, rg, rot, heights, aspects, grids) {
  forEachGrid(model, rg, heights, (g) => {
    grids.push({ ...g, rot, rgW: rg.width, rgH: rg.height });
  }, aspects);
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
export async function scanFrame(input, { profile, model = loadModel()?.model, hint = null } = {}) {
  if (!model) return { ok: false, reason: "no-model", grids: [] };
  const frame = await decodeGray(input);
  const rect = roiPixels(profile.roi, frame.width, frame.height);
  const roiGray = cropGray(frame.gray, frame.width, rect);
  const heights = orderHeights(
    heightHypotheses(profile.letterH.min * frame.height, profile.letterH.max * frame.height),
    hintHeightPx(hint, frame.height),
  );
  const aspects = orderAspects(ASPECTS, hint?.aspect);
  const grids = [];
  for (const rot of orderRotations(profile.rotations, hint?.rot)) {
    const rg = rotateGray(roiGray, rect.width, rect.height, rot);
    pushGrids(model, rg, rot, heights, aspects, grids);
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
export async function recognizeEngraving(input, { profile, allowed = null, model, hint = null } = {}) {
  const loaded = model || loadModel()?.model;
  if (!loaded) return { success: false, reason: "no-model", method: "engrave" };
  const frame = await decodeGray(input);
  const rect = roiPixels(profile.roi, frame.width, frame.height);
  const roiGray = cropGray(frame.gray, frame.width, rect);
  const allow = allowed ? new Set([...allowed].map((v) => String(v).toUpperCase())) : null;
  const heights = orderHeights(
    heightHypotheses(profile.letterH.min * frame.height, profile.letterH.max * frame.height),
    hintHeightPx(hint, frame.height),
  );
  const aspects = orderAspects(ASPECTS, hint?.aspect);
  const rots = orderRotations(profile.rotations, hint?.rot);
  const grids = [];
  let last = { success: false, reason: "no-candidate", method: "engrave", top: "" };
  for (let i = 0; i < rots.length; i += 1) {
    const rot = rots[i];
    const hinted = hint?.rot != null && rot === hint.rot;
    const rg = rotateGray(roiGray, rect.width, rect.height, rot);
    // 힌트가 있으면 그 높이·피치부터 넣고, 확신이 있으면 같은 회전의 나머지 가설도 건너뛴다.
    if (hinted && (hint?.letterH != null || hint?.aspect != null)) {
      const firstH = [heights[0]];
      const firstA = [aspects[0]];
      pushGrids(loaded, rg, rot, firstH, firstA, grids);
      last = decideFromGrids(grids, allow, profile, rect, frame);
      if (confidentEnough(last, { hinted: true })) return { ...last, early: true };
      const restH = heights.slice(1);
      const restA = aspects.slice(1);
      if (restH.length) pushGrids(loaded, rg, rot, restH, firstA, grids);
      if (aspects.length > 1) pushGrids(loaded, rg, rot, heights, restA, grids);
    } else {
      pushGrids(loaded, rg, rot, heights, aspects, grids);
    }
    last = decideFromGrids(grids, allow, profile, rect, frame);
    if (confidentEnough(last, { hinted })) return { ...last, early: i + 1 < rots.length };
  }
  return last;
}

function decideFromGrids(grids, allow, profile, rect, frame) {
  const free = freeReadings(grids).slice(0, 12).map(([code]) => code);
  if (!free.length) return { success: false, reason: "no-candidate", method: "engrave", top: "" };
  const ev = codeEvidence(grids, [...free, ...(allow || [])]);
  const top = ev[0];
  if (!top) return { success: false, reason: "no-candidate", method: "engrave", top: "" };
  // 기본: 마진은 모든 코드(목록 밖 오독 포함)와 비교한다. LOT_ENGRAVE_QUEUE_MARGIN=1이면 목록 안만.
  // 1위가 목록 밖이면 마진과 상관없이 not_in_queue(목록 안 2위로 바꾸지 않음).
  const anyRival = ev.find((e) => e.code !== top.code) || { code: "", mass: 0 };
  const queueRival = allow ? ev.find((e) => e.code !== top.code && allow.has(e.code)) : null;
  const queueMarginOnly = String(process.env.LOT_ENGRAVE_QUEUE_MARGIN || "0") === "1";
  const rival = (queueMarginOnly && allow ? queueRival || { code: "", mass: 0 } : anyRival);
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
    letterH: round(w.lh / frame.height, 4),
    aspect: w.aspect,
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
