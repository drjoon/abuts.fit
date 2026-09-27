// 인레이·온레이 와동 마진 — 삽입축에서 교합면을 내려다보고 와동 바닥·벽·테두리를 찾는다.
// 삼각형은 detectColorMargin과 같은 삽입축 프레임이다. +y가 교합 쪽이다.

import {
  buildGrid,
  projectRay,
  type Grid,
} from "@/shared/practice/detectColorMargin";

export type CavityMarginLine = {
  /** `toothRadius * 0.78`에 대한 비. 렌더의 마진 반지름과 같다. */
  radii: number[];
  /** 테두리 높이. 치아 중심에서 삽입 방향 거리, 기하 단위. */
  depths: number[];
  /** 방향마다 와동 벽이 삽입축에서 벌어진 각(°). 벽을 못 찾으면 NaN. */
  taperDeg: number[];
  /** 와동 바닥 높이. 기하 단위. */
  floorDepth: number;
  /** 테두리에서 바닥까지 중앙값. 기하 단위, 양수. */
  cavityDepth: number;
  /** 인접면으로 열린 방향 수. MOD 박스 등. */
  openSides: number;
};

type Sample = { rad: number; h: number };

const STEPS = 56;
/** 벽으로 보는 기울기(dh/dr). 약 55°. */
const WALL_SLOPE = 1.4;
/** 테두리를 넘어 교두 경사로 보는 기울기. 약 35°. */
const RIM_SLOPE = 0.7;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function percentile(values: number[], q: number) {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const at = clamp(Math.round((sorted.length - 1) * q), 0, sorted.length - 1);
  return sorted[at]!;
}

function smoothCircular(values: number[], passes: number) {
  let current = values;
  for (let pass = 0; pass < passes; pass += 1) {
    current = current.map((value, index) => {
      const prev = current[(index - 1 + current.length) % current.length] ?? value;
      const next = current[(index + 1) % current.length] ?? value;
      return value * 0.5 + (prev + next) * 0.25;
    });
  }
  return current;
}

/** 교합 쪽 가장 높은 면. `projectRay` sign -1은 y가 가장 큰 면이다. */
function topHit(triangles: Float32Array, grid: Grid, x: number, z: number) {
  return projectRay(triangles, grid, x, z, -1);
}

function sampleRay(
  triangles: Float32Array,
  grid: Grid,
  cos: number,
  sin: number,
  radMax: number,
): Sample[] {
  const out: Sample[] = [];
  for (let step = 0; step < STEPS; step += 1) {
    const rad = (radMax * step) / (STEPS - 1);
    const hit = topHit(triangles, grid, cos * rad, sin * rad);
    if (hit) out.push({ rad, h: hit.y });
  }
  return out;
}

type RayResult = {
  rad: number;
  open: boolean;
  taperDeg: number;
};

function traceRay(
  samples: Sample[],
  floor: number,
  rim: number,
  medianDepth: number,
  radMax: number,
  step: number,
): RayResult {
  const depth = rim - floor;
  const last = samples[samples.length - 1];
  if (!last || depth < medianDepth * 0.4) {
    return { rad: last?.rad ?? radMax, open: true, taperDeg: NaN };
  }
  let wallAt = -1;
  let rimAt = -1;
  for (let k = 1; k < samples.length; k += 1) {
    const a = samples[k - 1]!;
    const b = samples[k]!;
    const dr = b.rad - a.rad;
    if (dr <= 1e-9) continue;
    const slope = (b.h - a.h) / dr;
    const lifted = (b.h - floor) / depth;
    if (wallAt < 0) {
      if (slope >= WALL_SLOPE && lifted > 0.05) wallAt = k - 1;
      continue;
    }
    if (slope < RIM_SLOPE && lifted > 0.45) {
      rimAt = k - 1;
      break;
    }
  }
  if (wallAt < 0 || rimAt < 0) {
    const level = floor + depth * 0.7;
    const cross = samples.findIndex((row, k) => k > 0 && row.h >= level);
    if (cross <= 0) return { rad: last.rad, open: true, taperDeg: NaN };
    const a = samples[cross - 1]!;
    const b = samples[cross]!;
    const u = b.h - a.h > 1e-9 ? (level - a.h) / (b.h - a.h) : 0;
    return { rad: a.rad + (b.rad - a.rad) * u, open: false, taperDeg: NaN };
  }
  const wall = samples[wallAt]!;
  const edge = samples[rimAt]!;
  const rise = edge.h - wall.h;
  // 광선 간격 반 칸은 양자화다. 평행 벽도 한 칸은 벌어져 보인다.
  const run = Math.max(0, edge.rad - wall.rad - step * 0.5);
  const taperDeg = rise > 1e-9 ? (Math.atan2(run, rise) * 180) / Math.PI : NaN;
  return { rad: edge.rad, open: false, taperDeg };
}

function traceCavity(
  triangles: Float32Array,
  grid: Grid,
  toothRadius: number,
  count: number,
): CavityMarginLine | null {
  const base = toothRadius * 0.78;
  const radMax = toothRadius * 0.95;
  const step = radMax / (STEPS - 1);
  const rays: Sample[][] = [];
  const centerHeights: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const samples = sampleRay(triangles, grid, Math.cos(angle), Math.sin(angle), radMax);
    rays.push(samples);
    for (const row of samples) {
      if (row.rad <= base * 0.22) centerHeights.push(row.h);
    }
  }
  const covered = rays.filter((samples) => samples.length >= STEPS * 0.5).length;
  if (covered < count * 0.6 || centerHeights.length < 6) return null;

  const floor = percentile(centerHeights, 0.3);
  const rims = rays.map((samples) => {
    let max = -Infinity;
    for (const row of samples) {
      if (row.rad >= base * 0.3 && row.h > max) max = row.h;
    }
    return max;
  });
  const depths = rims.filter((rim) => Number.isFinite(rim)).map((rim) => rim - floor);
  const medianDepth = percentile(depths, 0.5);
  // 자연치 중심와(교두 끝에서 약 1mm)보다 깊어야 와동으로 본다.
  if (!(medianDepth > toothRadius * 0.12)) return null;

  const traced = rays.map((samples, i) =>
    traceRay(samples, floor, rims[i] ?? floor, medianDepth, radMax, step),
  );
  const ratioMax = radMax / base;
  const radii = smoothCircular(
    traced.map((row) => clamp(row.rad / base, 0.15, ratioMax)),
    1,
  );
  const outDepths: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const r = radii[i]! * base;
    const hit = topHit(triangles, grid, Math.cos(angle) * r, Math.sin(angle) * r);
    outDepths.push(hit ? hit.y : floor + medianDepth);
  }
  return {
    radii,
    depths: outDepths,
    taperDeg: traced.map((row) => row.taperDeg),
    floorDepth: floor,
    cavityDepth: medianDepth,
    openSides: traced.filter((row) => row.open).length,
  };
}

/**
 * 와동이 없으면 null. 호출자는 기본 인레이 고리로 둔다.
 * 반대 방향은 보지 않는다. 뒤집으면 볼록한 교합면이 오목한 와동처럼 읽힌다.
 */
export function detectCavityMargin(
  triangles: Float32Array,
  toothRadius: number,
  count = 24,
): CavityMarginLine | null {
  if (!(toothRadius > 0) || count < 8) return null;
  const grid = buildGrid(triangles, toothRadius);
  if (!grid) return null;
  return traceCavity(triangles, grid, toothRadius, count);
}
