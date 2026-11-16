// 포스트 윗면 → 대합치 수직 거리.
// 윗면에 0.1mm 그리드를 놓고, 교합 방향(수직)으로 레이를 쏴 스캔 삼각형에 닿는 거리 중 가장 짧은 값.
// related files:
// - web/frontend/src/shared/practice/customAbutmentStlDesign.ts

type V = readonly [number, number, number];

const STEP_MM = 0.1;
const MAX_MM = 8;
const MIN_T_MM = 0.015;
const MAX_SAMPLES = 12000;
const CELL_MM = 1;

function sub(a: V, b: V): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: V, b: V) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: V, b: V): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function norm(a: V): [number, number, number] {
  const l = Math.hypot(a[0], a[1], a[2]);
  if (l < 1e-8) return [0, 0, 1];
  return [a[0] / l, a[1] / l, a[2] / l];
}

function basis(upIn: V) {
  const up = norm(upIn);
  const helper: V = Math.abs(up[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = norm(cross(helper, up));
  const v = cross(up, u);
  return { up, u, v };
}

function uv(p: V, u: V, v: V): [number, number] {
  return [dot(p, u), dot(p, v)];
}

/** 평면 좌표 (pu,pv)가 삼각형 안이면 무게중심. */
function bary(
  pu: number,
  pv: number,
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): [number, number, number] | null {
  const v0x = b[0] - a[0];
  const v0y = b[1] - a[1];
  const v1x = c[0] - a[0];
  const v1y = c[1] - a[1];
  const v2x = pu - a[0];
  const v2y = pv - a[1];
  const den = v0x * v1y - v1x * v0y;
  if (Math.abs(den) < 1e-10) return null;
  const w1 = (v2x * v1y - v1x * v2y) / den;
  const w2 = (v0x * v2y - v2x * v0y) / den;
  const w0 = 1 - w1 - w2;
  if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) return null;
  return [w0, w1, w2];
}

function rayT(orig: V, dir: V, a: V, b: V, c: V): number | null {
  const e1 = sub(b, a);
  const e2 = sub(c, a);
  const pvec = cross(dir, e2);
  const det = dot(e1, pvec);
  if (Math.abs(det) < 1e-8) return null;
  const inv = 1 / det;
  const tvec = sub(orig, a);
  const bu = dot(tvec, pvec) * inv;
  if (bu < -1e-5 || bu > 1 + 1e-5) return null;
  const qvec = cross(tvec, e1);
  const bv = dot(dir, qvec) * inv;
  if (bv < -1e-5 || bu + bv > 1 + 1e-5) return null;
  const t = dot(e2, qvec) * inv;
  return t;
}

function pushTop(
  out: [V, V, V][],
  a: V,
  b: V,
  c: V,
  up: V,
) {
  const n = cross(sub(b, a), sub(c, a));
  const len = Math.hypot(n[0], n[1], n[2]);
  if (len < 1e-8 || dot(n, up) <= 0.2 * len) return;
  out.push([a, b, c]);
}

/**
 * 포스트 윗면 그리드에서 교합 방향 레이가 대합 스캔 면에 닿기까지의 최단 거리(mm).
 * 닿는 면이 없으면 null.
 * opposingTris: 픽스쳐 로컬 좌표의 삼각형. 9 float = 꼭짓점 3개.
 */
export function shortestPostTopClearanceMm(args: {
  columns: readonly (readonly V[])[];
  apex: V;
  roundSteps: number;
  opposingTris: Float32Array;
  up: V;
}): number | null {
  const cols = args.columns;
  if (cols.length < 3 || args.opposingTris.length < 9) return null;
  const { up, u, v } = basis(args.up);
  const cap: [V, V, V][] = [];
  for (let col = 0; col < cols.length; col += 1) {
    const post = cols[col]!;
    const next = cols[(col + 1) % cols.length]!;
    if (post.length < 2 || next.length < 2) continue;
    const start = Math.max(0, post.length - args.roundSteps - 1);
    const start2 = Math.max(0, next.length - args.roundSteps - 1);
    const span = Math.min(post.length - start, next.length - start2);
    for (let s = 0; s < span - 1; s += 1) {
      const a = post[start + s]!;
      const b = post[start + s + 1]!;
      const c = next[start2 + s + 1]!;
      const d = next[start2 + s]!;
      pushTop(cap, a, b, c, up);
      pushTop(cap, a, c, d, up);
    }
    const last = post[post.length - 1];
    const last2 = next[next.length - 1];
    if (last && last2) pushTop(cap, last, last2, args.apex, up);
  }
  if (cap.length === 0) return null;

  const samples = new Map<string, { p: [number, number, number]; h: number }>();
  const keep = (p: [number, number, number]) => {
    if (samples.size >= MAX_SAMPLES && !samples.has(`${Math.round(dot(p, u) / STEP_MM)}:${Math.round(dot(p, v) / STEP_MM)}`)) {
      return;
    }
    const h = dot(p, up);
    const key = `${Math.round(dot(p, u) / STEP_MM)}:${Math.round(dot(p, v) / STEP_MM)}`;
    const prev = samples.get(key);
    if (!prev || h > prev.h) samples.set(key, { p, h });
  };

  for (const [a, b, c] of cap) {
    const au = uv(a, u, v);
    const bu = uv(b, u, v);
    const cu = uv(c, u, v);
    const umin = Math.min(au[0], bu[0], cu[0]);
    const umax = Math.max(au[0], bu[0], cu[0]);
    const vmin = Math.min(au[1], bu[1], cu[1]);
    const vmax = Math.max(au[1], bu[1], cu[1]);
    if (!Number.isFinite(umin) || umax - umin > 20 || vmax - vmin > 20) continue;
    const u0 = Math.ceil(umin / STEP_MM - 1e-6) * STEP_MM;
    const v0 = Math.ceil(vmin / STEP_MM - 1e-6) * STEP_MM;
    for (let uu = u0; uu <= umax + 1e-6; uu += STEP_MM) {
      for (let vv = v0; vv <= vmax + 1e-6; vv += STEP_MM) {
        const w = bary(uu, vv, au, bu, cu);
        if (!w) continue;
        keep([
          a[0] * w[0] + b[0] * w[1] + c[0] * w[2],
          a[1] * w[0] + b[1] * w[1] + c[1] * w[2],
          a[2] * w[0] + b[2] * w[1] + c[2] * w[2],
        ]);
      }
    }
  }
  if (samples.size === 0) return null;

  const buckets = new Map<string, number[]>();
  const tris = args.opposingTris;
  const triCount = Math.floor(tris.length / 9);
  for (let i = 0; i < triCount; i += 1) {
    const o = i * 9;
    const pts: V[] = [
      [tris[o]!, tris[o + 1]!, tris[o + 2]!],
      [tris[o + 3]!, tris[o + 4]!, tris[o + 5]!],
      [tris[o + 6]!, tris[o + 7]!, tris[o + 8]!],
    ];
    const us = pts.map((p) => dot(p, u));
    const vs = pts.map((p) => dot(p, v));
    const i0 = Math.floor(Math.min(us[0]!, us[1]!, us[2]!) / CELL_MM);
    const i1 = Math.floor(Math.max(us[0]!, us[1]!, us[2]!) / CELL_MM);
    const j0 = Math.floor(Math.min(vs[0]!, vs[1]!, vs[2]!) / CELL_MM);
    const j1 = Math.floor(Math.max(vs[0]!, vs[1]!, vs[2]!) / CELL_MM);
    if (i1 - i0 > 24 || j1 - j0 > 24) continue;
    for (let ix = i0; ix <= i1; ix += 1) {
      for (let jy = j0; jy <= j1; jy += 1) {
        const key = `${ix}:${jy}`;
        let list = buckets.get(key);
        if (!list) {
          list = [];
          buckets.set(key, list);
        }
        list.push(i);
      }
    }
  }

  let best = Infinity;
  for (const sample of samples.values()) {
    const key = `${Math.floor(dot(sample.p, u) / CELL_MM)}:${Math.floor(dot(sample.p, v) / CELL_MM)}`;
    const list = buckets.get(key);
    if (!list) continue;
    for (const i of list) {
      const o = i * 9;
      const t = rayT(
        sample.p,
        up,
        [tris[o]!, tris[o + 1]!, tris[o + 2]!],
        [tris[o + 3]!, tris[o + 4]!, tris[o + 5]!],
        [tris[o + 6]!, tris[o + 7]!, tris[o + 8]!],
      );
      if (t != null && t > MIN_T_MM && t < best) best = t;
    }
  }
  if (!Number.isFinite(best) || best >= MAX_MM) return null;
  return Math.round(best * 100) / 100;
}
