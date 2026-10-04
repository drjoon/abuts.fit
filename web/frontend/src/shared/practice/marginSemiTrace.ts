// 마진 반자동 추적 — 찍은 점을 스캔 엣지에 붙이고, 점 사이는 스캔 형상(법선 변화)에서 엣지를 찾아 잇는다.
// 제조사 FL 반자동(finishLineTrace.ts)의 ridge 스냅 + 방위각 추적을 마진 좌표계로 옮기고,
// 가장 바깥 점 대신 "벽(가파름) → 면(평탄)" 전이를 엣지로 보고 Viterbi로 경로를 매끄럽게 고른다.
// 좌표는 마진 샘플 공간이다: angle(삽입축 둘레), radius(기본 고리 `치아반경×0.78`에 대한 비), depth(삽입축 방향 기하 단위).
import type { MarginSample } from "./labProsthesisModify";

/** 스캔 꼭짓점. flat은 법선과 삽입축의 평행도(0 벽, 1 평탄). */
export type MarginCloudPoint = MarginSample & { flat: number };

const TAU = Math.PI * 2;
/** 점 사이 중간 점의 각도 간격. */
const STEP_RAD = (4 * Math.PI) / 180;
/** 벌어진 두 점 사이에 서브 점을 넣는 기준 거리(기본 고리 비). */
const SUB_DIST = 0.1;
const SNAP = { arc: 0.16, radius: 0.2, depth: 0.12 };
const MID = { arc: 0.06, radius: 0.4, depth: 0.22 };
const BIN = 0.03;
const BIN_REACH = 5;
const KEEP = 6;

function shortest(delta: number) {
  let d = delta % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function arcOf(angleDelta: number, radius: number) {
  return Math.abs(shortest(angleDelta)) * Math.max(radius, 0.3);
}

type Candidate = { index: number; radius: number; depth: number; score: number };

type Bin = { n: number; flat: number; depth: number; rep: number; repGap: number };

/**
 * 한 각도(angle) 둘레에서 엣지 후보를 점수순으로 돌려준다.
 * 반경을 BIN 단위로 묶어, 안쪽보다 바깥이 평탄해지는(벽에서 면으로 넘어가는) 자리를 높게 친다.
 */
function edgeCandidates(
  cloud: readonly MarginCloudPoint[],
  angle: number,
  r0: number,
  d0: number,
  base: number,
  win: { arc: number; radius: number; depth: number },
): Candidate[] {
  const bins = new Map<number, Bin>();
  for (let i = 0; i < cloud.length; i += 1) {
    const c = cloud[i]!;
    if (arcOf(c.angle - angle, r0) > win.arc) continue;
    if (Math.abs(c.radius - r0) > win.radius) continue;
    if (Math.abs(c.depth - d0) / base > win.depth) continue;
    const key = Math.round((c.radius - r0) / BIN);
    const gap = Math.abs(c.radius - (r0 + key * BIN));
    const bin = bins.get(key);
    if (!bin) {
      bins.set(key, { n: 1, flat: c.flat, depth: c.depth, rep: i, repGap: gap });
    } else {
      bin.n += 1;
      bin.flat += c.flat;
      bin.depth += c.depth;
      if (gap < bin.repGap) {
        bin.rep = i;
        bin.repGap = gap;
      }
    }
  }
  if (bins.size === 0) return [];
  const meanFlat = (from: number, to: number) => {
    let n = 0;
    let sum = 0;
    for (let k = from; k <= to; k += 1) {
      const bin = bins.get(k);
      if (!bin) continue;
      n += bin.n;
      sum += bin.flat;
    }
    return n > 0 ? sum / n : null;
  };
  const out: Candidate[] = [];
  for (const [key, bin] of bins) {
    const inside = meanFlat(key - BIN_REACH, key - 1);
    const outside = meanFlat(key + 1, key + BIN_REACH);
    const edge = inside != null && outside != null ? outside - inside : 0;
    const offset = key * BIN;
    const rPrior = Math.exp(-((offset / 0.25) ** 2));
    const dPrior = Math.exp(-(((bin.depth / bin.n - d0) / base / (win.depth * 0.8)) ** 2));
    const rep = cloud[bin.rep]!;
    out.push({
      index: bin.rep,
      radius: rep.radius,
      depth: rep.depth,
      score: edge * 1.4 + rPrior * 0.5 + dPrior * 0.3,
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, KEEP);
}

/** 찍은 점을 근처 엣지로 스냅한다. 후보가 없으면 -1. */
export function snapMarginPick(
  cloud: readonly MarginCloudPoint[],
  pick: MarginSample,
  base: number,
): number {
  const found = edgeCandidates(cloud, pick.angle, pick.radius, pick.depth, base, {
    arc: SNAP.arc,
    radius: SNAP.radius,
    depth: SNAP.depth,
  });
  return found[0]?.index ?? -1;
}

/**
 * 두 점 사이를 엣지를 따라 잇는다(양 끝 제외).
 * 각도 4°마다, 그리고 두 점이 멀면(SUB_DIST 단위) 서브 점을 더 넣어 후보를 모은 뒤 Viterbi로 매끄러운 경로를 고른다.
 * index는 cloud 안의 꼭짓점 번호, 엣지를 못 찾은 자리는 -1(보간값).
 */
export function traceMarginSegment(
  cloud: readonly MarginCloudPoint[],
  a: MarginSample,
  b: MarginSample,
  base: number,
  delta = shortest(b.angle - a.angle),
): Array<{ sample: MarginSample; index: number }> {
  const meanR = (a.radius + b.radius) / 2;
  const dist = Math.hypot(
    Math.abs(delta) * Math.max(meanR, 0.3),
    b.radius - a.radius,
    (b.depth - a.depth) / base,
  );
  const steps = Math.max(Math.floor(Math.abs(delta) / STEP_RAD), Math.ceil(dist / SUB_DIST));
  if (steps < 2) return [];

  const layers: Candidate[][] = [];
  const angles: number[] = [];
  for (let s = 1; s < steps; s += 1) {
    const t = s / steps;
    const angle = a.angle + delta * t;
    const r0 = a.radius + (b.radius - a.radius) * t;
    const d0 = a.depth + (b.depth - a.depth) * t;
    angles.push(angle);
    const found = edgeCandidates(cloud, angle, r0, d0, base, MID).filter((c) => {
      if (c.index < 0) return true;
      const t = shortest(cloud[c.index]!.angle - a.angle);
      return delta >= 0 ? t >= -0.04 && t <= delta + 0.04 : t <= 0.04 && t >= delta - 0.04;
    });
    layers.push(found.length > 0 ? found : [{ index: -1, radius: r0, depth: d0, score: 0 }]);
  }

  const move = (p: { radius: number; depth: number }, q: { radius: number; depth: number }) => {
    const dr = q.radius - p.radius;
    const dd = (q.depth - p.depth) / base;
    return 3 * dr * dr + 2 * dd * dd;
  };
  let cost: number[] = layers[0]!.map((c) => move(a, c) - c.score);
  const back: number[][] = [layers[0]!.map(() => -1)];
  for (let i = 1; i < layers.length; i += 1) {
    const prev = layers[i - 1]!;
    const next: number[] = [];
    const from: number[] = [];
    for (const c of layers[i]!) {
      let best = Infinity;
      let bestJ = 0;
      prev.forEach((p, j) => {
        const v = cost[j]! + move(p, c);
        if (v < best) {
          best = v;
          bestJ = j;
        }
      });
      next.push(best - c.score);
      from.push(bestJ);
    }
    cost = next;
    back.push(from);
  }
  let end = 0;
  let endCost = Infinity;
  layers[layers.length - 1]!.forEach((c, k) => {
    const v = cost[k]! + move(c, b);
    if (v < endCost) {
      endCost = v;
      end = k;
    }
  });
  const picked: Candidate[] = new Array(layers.length);
  let cursor = end;
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    picked[i] = layers[i]![cursor]!;
    cursor = back[i]![cursor] ?? 0;
  }
  return picked.map((c, i) => ({
    sample: { angle: angles[i]!, radius: c.radius, depth: c.depth },
    index: c.index,
  }));
}

function smoothInterior(values: number[], fixed: boolean[], passes: number) {
  let cur = values;
  for (let pass = 0; pass < passes; pass += 1) {
    const prev = cur;
    cur = prev.map((v, i) => {
      if (fixed[i]) return v;
      const a = prev[Math.max(0, i - 1)]!;
      const b = prev[Math.min(prev.length - 1, i + 1)]!;
      return v * 0.5 + (a + b) * 0.25;
    });
  }
  return cur;
}

/**
 * 찍은 점들(순서대로, 한 바퀴)을 잇는 완만한 마진 경로.
 * 한 바퀴가 아니면 null.
 */
export function traceMarginPicks(
  cloud: readonly MarginCloudPoint[],
  picks: readonly MarginSample[],
  base: number,
): MarginSample[] | null {
  if (picks.length < 3 || !(base > 0)) return null;
  const n = picks.length;
  const deltas: number[] = [];
  let turn = 0;
  for (let i = 0; i < n; i += 1) {
    const d = shortest(picks[(i + 1) % n]!.angle - picks[i]!.angle);
    deltas.push(d);
    turn += d;
  }
  if (Math.abs(Math.abs(turn) - TAU) > 0.5) return null;

  const angles: number[] = [];
  const radii: number[] = [];
  const depths: number[] = [];
  const fixed: boolean[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = picks[i]!;
    const b = picks[(i + 1) % n]!;
    angles.push(a.angle);
    radii.push(a.radius);
    depths.push(a.depth);
    fixed.push(true);
    for (const mid of traceMarginSegment(cloud, a, b, base, deltas[i]!)) {
      angles.push(mid.sample.angle);
      radii.push(mid.sample.radius);
      depths.push(mid.sample.depth);
      fixed.push(false);
    }
  }
  const sr = smoothInterior(radii, fixed, 2);
  const sd = smoothInterior(depths, fixed, 2);
  return angles.map((angle, i) => ({ angle, radius: sr[i]!, depth: sd[i]! }));
}
