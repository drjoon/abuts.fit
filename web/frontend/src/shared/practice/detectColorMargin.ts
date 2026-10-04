// 치아 프렙 마진(Finish line) 검출 — 기하 특징(경사 변화·능선 곡률·단차)과 스캔 색상 경계를 결합한다.
// 무색 STL 스캔(단색)과 색상 PLY/OBJ 스캔(치아-잇몸 색상차) 모두 지원한다.
// 탐색 반지름은 화면에 그려진 기본 원(toothRadius * 0.78) 주변을 3차원 광선으로 추적한다.

export const COLOR_MARGIN_POINT_COUNT = 24;
/** x y z, rgb — 꼭짓점 3개. 좌표는 삽입축 프레임(x, 삽입 방향 y, z). */
export const PROJECTED_MARGIN_TRIANGLE_STRIDE = 18;

export type ColorMarginLine = {
  /** `toothRadius * 0.78`에 대한 비. 렌더의 마진 반지름과 같다. */
  radii: number[];
  /** 치아 중심에서 삽입 방향으로의 거리. 기하 단위. 메시 표면이다. */
  depths: number[];
  found: number;
  strength: number;
};

type Rgb = { r: number; g: number; b: number };

export type Hit = {
  rad: number;
  y: number;
  color: Rgb;
  nx: number;
  ny: number;
  nz: number;
};

export type Grid = {
  cell: number;
  n: number;
  min: number;
  lists: Map<number, number[]>;
  outer: number;
  normals: Float32Array;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function luma(color: Rgb) {
  return 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
}

/** 잇몸은 빨강이 초록·파랑보다 크다. */
function pink(color: Rgb) {
  return color.r - 0.5 * (color.g + color.b);
}

function colorDistance(a: Rgb, b: Rgb) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
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

export function buildGrid(triangles: Float32Array, toothRadius: number): Grid | null {
  const stride = PROJECTED_MARGIN_TRIANGLE_STRIDE;
  const triCount = Math.floor(triangles.length / stride);
  if (triCount < 12) return null;
  const outer = toothRadius * 2.5;
  const cell = Math.max(toothRadius * 0.08, 1e-4);
  const n = Math.ceil((outer * 2) / cell) + 1;
  const min = -outer;
  const lists = new Map<number, number[]>();
  const areaEps = Math.max(toothRadius * toothRadius * 1e-8, 1e-10);
  const normals = new Float32Array(triCount * 3);

  for (let tri = 0; tri < triCount; tri += 1) {
    const o = tri * stride;
    const ax = triangles[o] ?? 0;
    const ay = triangles[o + 1] ?? 0;
    const az = triangles[o + 2] ?? 0;
    const bx = triangles[o + 3] ?? 0;
    const by = triangles[o + 4] ?? 0;
    const bz = triangles[o + 5] ?? 0;
    const cx = triangles[o + 6] ?? 0;
    const cy = triangles[o + 7] ?? 0;
    const cz = triangles[o + 8] ?? 0;

    const den = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (Math.abs(den) < areaEps) continue;

    // 삼각형 법선 미리 계산
    const v1x = bx - ax;
    const v1y = by - ay;
    const v1z = bz - az;
    const v2x = cx - ax;
    const v2y = cy - ay;
    const v2z = cz - az;
    let nx = v1y * v2z - v1z * v2y;
    let ny = v1z * v2x - v1x * v2z;
    let nz = v1x * v2y - v1y * v2x;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-8) {
      nx /= len;
      ny /= len;
      nz /= len;
    }
    const no = tri * 3;
    normals[no] = nx;
    normals[no + 1] = ny;
    normals[no + 2] = nz;

    let i0 = Math.floor((Math.min(ax, bx, cx) - min) / cell);
    let i1 = Math.floor((Math.max(ax, bx, cx) - min) / cell);
    let k0 = Math.floor((Math.min(az, bz, cz) - min) / cell);
    let k1 = Math.floor((Math.max(az, bz, cz) - min) / cell);
    if (i1 < 0 || k1 < 0 || i0 >= n || k0 >= n) continue;
    i0 = clamp(i0, 0, n - 1);
    i1 = clamp(i1, 0, n - 1);
    k0 = clamp(k0, 0, n - 1);
    k1 = clamp(k1, 0, n - 1);
    for (let ix = i0; ix <= i1; ix += 1) {
      for (let iz = k0; iz <= k1; iz += 1) {
        const key = iz * n + ix;
        const bucket = lists.get(key);
        if (bucket) bucket.push(tri);
        else lists.set(key, [tri]);
      }
    }
  }
  if (lists.size === 0) return null;
  return { cell, n, min, lists, outer, normals };
}

/** 삽입축 광선이 스캔 면에 닿는 점. `sign` 1은 음의 축 방향(위에서 아래), -1은 반대다. */
export function projectRay(
  triangles: Float32Array,
  grid: Grid,
  rx: number,
  rz: number,
  sign: number,
): Hit | null {
  const radial = Math.hypot(rx, rz);
  if (radial > grid.outer) return null;
  const ix = clamp(Math.floor((rx - grid.min) / grid.cell), 0, grid.n - 1);
  const iz = clamp(Math.floor((rz - grid.min) / grid.cell), 0, grid.n - 1);
  const list = grid.lists.get(iz * grid.n + ix);
  if (!list) return null;
  const stride = PROJECTED_MARGIN_TRIANGLE_STRIDE;
  let bestKey = Infinity;
  let best: Hit | null = null;
  for (let cursor = 0; cursor < list.length; cursor += 1) {
    const tri = list[cursor] ?? 0;
    const o = tri * stride;
    const ax = triangles[o] ?? 0;
    const ay = triangles[o + 1] ?? 0;
    const az = triangles[o + 2] ?? 0;
    const bx = triangles[o + 3] ?? 0;
    const by = triangles[o + 4] ?? 0;
    const bz = triangles[o + 5] ?? 0;
    const cx = triangles[o + 6] ?? 0;
    const cy = triangles[o + 7] ?? 0;
    const cz = triangles[o + 8] ?? 0;
    const v0x = cx - ax;
    const v0z = cz - az;
    const v1x = bx - ax;
    const v1z = bz - az;
    const v2x = rx - ax;
    const v2z = rz - az;
    const dot00 = v0x * v0x + v0z * v0z;
    const dot01 = v0x * v1x + v0z * v1z;
    const dot02 = v0x * v2x + v0z * v2z;
    const dot11 = v1x * v1x + v1z * v1z;
    const dot12 = v1x * v2x + v1z * v2z;
    const den = dot00 * dot11 - dot01 * dot01;
    if (Math.abs(den) < 1e-12) continue;
    const inv = 1 / den;
    const u = (dot11 * dot02 - dot01 * dot12) * inv;
    const v = (dot00 * dot12 - dot01 * dot02) * inv;
    if (u < -1e-4 || v < -1e-4 || u + v > 1 + 1e-4) continue;
    const w = 1 - u - v;
    const y = ay * w + by * v + cy * u;
    const key = y * sign;
    if (key >= bestKey) continue;
    const r = (triangles[o + 9] ?? 0) * w + (triangles[o + 12] ?? 0) * v + (triangles[o + 15] ?? 0) * u;
    const g = (triangles[o + 10] ?? 0) * w + (triangles[o + 13] ?? 0) * v + (triangles[o + 16] ?? 0) * u;
    const b = (triangles[o + 11] ?? 0) * w + (triangles[o + 14] ?? 0) * v + (triangles[o + 17] ?? 0) * u;
    const no = tri * 3;
    const nx = grid.normals[no] ?? 0;
    const ny = grid.normals[no + 1] ?? 0;
    const nz = grid.normals[no + 2] ?? 0;
    bestKey = key;
    best = { rad: radial, y, color: { r, g, b }, nx, ny, nz };
  }
  return best;
}

function averageColor(hits: readonly Hit[]): Rgb | null {
  if (hits.length === 0) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const hit of hits) {
    r += hit.color.r;
    g += hit.color.g;
    b += hit.color.b;
  }
  const n = hits.length;
  return { r: r / n, g: g / n, b: b / n };
}

/** 색상 분산이 유의미하게 존재하는지(단색 STL이 아닌 컬러 스캔인지) 확인 */
function checkColorVariation(hits: readonly Hit[]): boolean {
  if (hits.length < 10) return false;
  let minP = Infinity;
  let maxP = -Infinity;
  let minL = Infinity;
  let maxL = -Infinity;
  for (const h of hits) {
    const p = pink(h.color);
    const l = luma(h.color);
    if (p < minP) minP = p;
    if (p > maxP) maxP = p;
    if (l < minL) minL = l;
    if (l > maxL) maxL = l;
  }
  return (maxP - minP >= 0.025 && maxL - minL >= 0.04);
}

/**
 * 치아 지대치(Abutment)의 마진선 복합 점수(Geometric Curvature/Slope Inflection + Color Boundary).
 * 논문(Shin et al. 2022, Alsheghri et al. 2025)에 따른 기하학적 특징:
 * - 축벽(axial wall)은 중심축에서 멀어질수록 고도가 급격히 하강함 (slope < 0).
 * - 마진 피니시라인(chamfer / shoulder)에서 하강이 멈추고 둔화되거나 ledge가 형성됨 (d^2y/dr^2 peak).
 * - 법선 방향이 급변(능선 곡률 ridge / dihedral angle crease)함.
 * - 색상 정보가 있는 경우 치아 상아질(아이보리)에서 잇몸(핑크)으로의 색상 전이가 일어남.
 */
function scoreMarginCandidates(
  samples: Hit[],
  baseRadius: number,
  toothColor: Rgb | null,
  hasColor: boolean,
  cos: number,
  sin: number,
  seedRadius?: number | null,
): number[] {
  const m = samples.length;
  const scores = new Array<number>(m).fill(0);
  if (m < 5) return scores;

  // 1. 반경 방향 기울기 (dy/dr)
  const slopes = new Float32Array(m);
  for (let k = 0; k < m - 1; k += 1) {
    const s0 = samples[k]!;
    const s1 = samples[k + 1]!;
    const dr = s1.rad - s0.rad;
    slopes[k] = dr > 1e-5 ? (s1.y - s0.y) / dr : 0;
  }
  slopes[m - 1] = slopes[m - 2] ?? 0;

  for (let k = 1; k < m - 1; k += 1) {
    const curr = samples[k]!;
    const prev = samples[k - 1]!;
    const next = samples[k + 1]!;

    // 거리 가우시안 사전 확률 (기본 반경 0.75 ~ 1.35 사이 선호)
    const radRatio = curr.rad / baseRadius;
    const radPrior = Math.exp(-Math.pow((radRatio - 1.0) / 0.42, 2));

    // A. 경사 변곡점(Slope Inflection): 이전 경사는 급한 하강(< -0.2), 이후 경사는 완만하거나 상승
    const slopePrev = slopes[k - 1] ?? 0;
    const slopeNext = slopes[k] ?? 0;
    const deltaSlope = slopeNext - slopePrev;
    // 축벽을 따라 내려오다가 바닥(마진 숄더/챔퍼)에서 꺾이는 특성
    const axialDropConfidence = Math.max(0, -slopePrev);
    const inflectionScore = Math.max(0, deltaSlope) * Math.min(2.5, axialDropConfidence + 0.2);

    // B. 법선 능선 변화(Normal crease / Ridge curvature)
    const dotN = clamp(prev.nx * curr.nx + prev.ny * curr.ny + prev.nz * curr.nz, -1, 1);
    const creaseScore = (1 - dotN) * 2.0;

    // C. 지대치 축벽 방향성 (중심에서 바깥을 향하는 법선)
    const radialNormal = (curr.nx * cos + curr.nz * sin);
    const wallScore = Math.max(0, radialNormal) * (1 - Math.abs(curr.ny));

    // 기하 점수 결합
    let geomScore = inflectionScore * 1.5 + creaseScore * 1.2 + wallScore * 0.5;

    // D. 색상 전이 점수 (컬러 데이터가 있을 때)
    let colorScore = 0;
    if (hasColor && toothColor) {
      const pDiff = pink(curr.color) - pink(toothColor);
      const lDiff = luma(toothColor) - luma(curr.color);
      const cDist = colorDistance(curr.color, toothColor);
      if (pDiff > 0.015) {
        colorScore += pDiff * 6.0;
      }
      if (lDiff > 0.02) {
        colorScore += lDiff * 2.0;
      }
      colorScore += cDist * 1.5;
    }

    // 시드 포인트가 주어졌을 경우 시드 반경과의 일치도 추가 가중치
    let seedMultiplier = 1.0;
    if (typeof seedRadius === "number" && seedRadius > 0) {
      const seedDist = Math.abs(curr.rad - seedRadius) / baseRadius;
      seedMultiplier = 1.0 + 3.0 * Math.exp(-Math.pow(seedDist / 0.18, 2));
    }

    const totalWeight = hasColor ? (geomScore * 0.55 + colorScore * 0.45) : geomScore;
    scores[k] = totalWeight * radPrior * seedMultiplier;
  }

  return scores;
}

/**
 * 극좌표로 펼친 (각도 × 반경) 후보 평면에서 닫힌 최적 경로를 Viterbi 동적 계획법으로 찾는다.
 * 비용 = −정규화한 마진 점수 + 인접 각도 간 반경 도약·높이 도약 벌점.
 * 닫힘은 두 바퀴를 돌려 가운데 바퀴를 쓰는 방식으로 맞춘다(고전적 snake/active contour의 이산 해).
 */
function optimizeClosedMarginLoop(
  rayHits: Hit[][],
  rayScores: number[][],
  baseRadius: number,
  count: number,
): { bestIndices: number[]; averageStrength: number } {
  let maxScore = 0;
  for (const row of rayScores) for (const value of row) if (value > maxScore) maxScore = value;
  const norm = maxScore > 1e-9 ? 1 / maxScore : 1;
  const radialPenalty = 2.2;
  const heightPenalty = 1.2;
  const laps = 2;
  const total = count * laps;

  const prevCost: number[][] = [];
  const back: Int16Array[] = [];
  let strengthSum = 0;
  let strengthN = 0;

  const hitsAt = (i: number) => rayHits[i % count] ?? [];
  const scoreAt = (i: number, k: number) => (rayScores[i % count]?.[k] ?? 0) * norm;

  let cost: number[] = hitsAt(0).map((_, k) => -scoreAt(0, k));
  prevCost.push(cost);
  back.push(new Int16Array(cost.length).fill(-1));
  for (let i = 1; i < total; i += 1) {
    const hits = hitsAt(i);
    const before = hitsAt(i - 1);
    const next = new Array<number>(hits.length).fill(Infinity);
    const from = new Int16Array(hits.length).fill(-1);
    for (let k = 0; k < hits.length; k += 1) {
      const hit = hits[k]!;
      let best = Infinity;
      let bestJ = -1;
      for (let j = 0; j < before.length; j += 1) {
        const prev = before[j]!;
        const dr = (hit.rad - prev.rad) / baseRadius;
        const dy = (hit.y - prev.y) / baseRadius;
        const c = (cost[j] ?? Infinity) + radialPenalty * dr * dr + heightPenalty * dy * dy;
        if (c < best) {
          best = c;
          bestJ = j;
        }
      }
      next[k] = best - scoreAt(i, k);
      from[k] = bestJ;
    }
    cost = next;
    prevCost.push(next);
    back.push(from);
  }

  // 마지막 줄에서 최저 비용 끝점을 고르고 거꾸로 따라간다.
  let end = -1;
  let endCost = Infinity;
  for (let k = 0; k < cost.length; k += 1) {
    if (cost[k]! < endCost) {
      endCost = cost[k]!;
      end = k;
    }
  }
  const path = new Array<number>(total).fill(0);
  let cursor = end;
  for (let i = total - 1; i >= 0; i -= 1) {
    path[i] = Math.max(0, cursor);
    cursor = back[i]?.[Math.max(0, cursor)] ?? -1;
    if (cursor < 0 && i > 0) cursor = 0;
  }
  const bestIndices = new Array<number>(count).fill(0);
  for (let i = 0; i < count; i += 1) {
    const k = path[count + i] ?? 0;
    bestIndices[i] = k;
    const s = rayScores[i]?.[k] ?? 0;
    if (s > 0) {
      strengthSum += s;
      strengthN += 1;
    }
  }
  return {
    bestIndices,
    averageStrength: strengthN > 0 ? strengthSum / strengthN : 0.5,
  };
}

/**
 * 단일 방향(sign = 1 또는 -1)으로 삽입축 레이를 투사하여 복합 마진선을 추적한다.
 */
function traceProjectedMargin(
  triangles: Float32Array,
  grid: Grid,
  toothRadius: number,
  count: number,
  sign: number,
  seedPoint?: { x: number; y: number; z: number } | null,
): ColorMarginLine | null {
  const base = toothRadius * 0.78;
  const radialMin = base * 0.42;
  const radialMax = toothRadius * 2.35;
  const steps = 54;

  const rayHits: Hit[][] = [];
  const rayScores: number[][] = [];
  const allHitsForColor: Hit[] = [];

  // 각도별 광선 샘플링
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const samples: Hit[] = [];
    for (let step = 0; step < steps; step += 1) {
      const rad = radialMin + ((radialMax - radialMin) * step) / (steps - 1);
      const hit = projectRay(triangles, grid, cos * rad, sin * rad, sign);
      if (hit) {
        samples.push(hit);
        allHitsForColor.push(hit);
      }
    }
    rayHits.push(samples);
  }

  if (allHitsForColor.length < count * 8) return null;

  // 치아 중심부(안쪽 0.75 base)의 대표 색상 추출
  const innerHits = allHitsForColor.filter((h) => h.rad <= base * 0.75);
  const toothColor = averageColor(innerHits.length >= 10 ? innerHits : allHitsForColor.slice(0, 30));
  const hasColor = checkColorVariation(allHitsForColor);

  // 시드 포인트가 전달된 경우 각도 및 반경 매핑
  let seedAngle: number | null = null;
  let seedRadius: number | null = null;
  if (seedPoint) {
    seedAngle = Math.atan2(seedPoint.z, seedPoint.x);
    if (seedAngle < 0) seedAngle += Math.PI * 2;
    seedRadius = Math.hypot(seedPoint.x, seedPoint.z);
  }

  // 각 광선별 후보 점수 계산
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const samples = rayHits[i]!;

    let currentSeedRad: number | null = null;
    if (seedAngle != null && seedRadius != null) {
      let angDiff = Math.abs(angle - seedAngle);
      if (angDiff > Math.PI) angDiff = Math.PI * 2 - angDiff;
      if (angDiff < 0.6) {
        currentSeedRad = seedRadius;
      }
    }

    const scores = scoreMarginCandidates(
      samples,
      base,
      toothColor,
      hasColor,
      cos,
      sin,
      currentSeedRad,
    );
    rayScores.push(scores);
  }

  // 원형 최적화
  const { bestIndices, averageStrength } = optimizeClosedMarginLoop(
    rayHits,
    rayScores,
    base,
    count,
  );

  const radii = new Array<number>(count).fill(1.0);
  const depths = new Array<number>(count).fill(0);
  let found = 0;

  for (let i = 0; i < count; i += 1) {
    const hitIdx = bestIndices[i]!;
    const hit = rayHits[i]?.[hitIdx];
    if (hit) {
      radii[i] = clamp(hit.rad / base, 0.45, 2.85);
      depths[i] = hit.y;
      found += 1;
    }
  }

  if (found < Math.ceil(count * 0.4)) return null;

  // 부드러운 연결을 위해 최종 1회 가중 평활화 후 메시 표면 재투영
  const smoothed = smoothCircular(radii, 1);
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const r = clamp(smoothed[i] ?? 1.0, 0.45, 2.85) * base;
    const hit = projectRay(triangles, grid, cos * r, sin * r, sign);
    if (hit) {
      radii[i] = clamp(hit.rad / base, 0.45, 2.85);
      depths[i] = hit.y;
    } else {
      radii[i] = clamp(r / base, 0.45, 2.85);
    }
  }

  return {
    radii,
    depths,
    found,
    strength: averageStrength,
  };
}

/**
 * 기본 녹색 원보다 넓은 영역에서 스캔 메시에 붙인 복합 특징(기하 능선·변곡점 + 색상 경계)을 추적하여
 * 지대치의 3D 마진 라인을 검출한다.
 * 단색 STL 스캔에서는 순수 3차원 기하 능선과 하강 변곡점을 이용하며, 컬러 스캔에서는 잇몸 색상 경계가 함께 결합된다.
 */
export function detectProjectedColorMargin(
  triangles: Float32Array,
  toothRadius: number,
  count = COLOR_MARGIN_POINT_COUNT,
  seedPoint?: { x: number; y: number; z: number } | null,
): ColorMarginLine | null {
  if (!(toothRadius > 0) || count < 8) return null;
  const grid = buildGrid(triangles, toothRadius);
  if (!grid) return null;

  // 삽입 방향(위에서 아래 1)으로 먼저 시도하고, 메시 방향이 뒤집힌 경우 반대 방향(-1)도 검사
  const direct = traceProjectedMargin(triangles, grid, toothRadius, count, 1, seedPoint);
  if (direct && direct.found >= count * 0.6) return direct;

  const reverse = traceProjectedMargin(triangles, grid, toothRadius, count, -1, seedPoint);
  if (!direct) return reverse;
  if (!reverse) return direct;
  return direct.strength >= reverse.strength ? direct : reverse;
}
