// 삽입축과 나란한 광선으로 스캔 면에 붙인 점에서 치아·잇몸 경계(마진)를 고른다.
// 탐색 반지름은 화면에 그려진 기본 원(toothRadius * 0.78)보다 넓다.

export const COLOR_MARGIN_POINT_COUNT = 24;
/** x y z, rgb — 꼭짓점 3개. 좌표는 삽입축 프레임(x, 삽입 방향, z). */
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

type Hit = { rad: number; y: number; color: Rgb };

type Grid = {
  cell: number;
  n: number;
  min: number;
  lists: Map<number, number[]>;
  outer: number;
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

function buildGrid(triangles: Float32Array, toothRadius: number): Grid | null {
  const stride = PROJECTED_MARGIN_TRIANGLE_STRIDE;
  const triCount = Math.floor(triangles.length / stride);
  if (triCount < 12) return null;
  const outer = toothRadius * 2.45;
  const cell = Math.max(toothRadius * 0.1, 1e-4);
  const n = Math.ceil((outer * 2) / cell) + 1;
  const min = -outer;
  const lists = new Map<number, number[]>();
  const areaEps = Math.max(toothRadius * toothRadius * 1e-8, 1e-10);

  for (let tri = 0; tri < triCount; tri += 1) {
    const o = tri * stride;
    const ax = triangles[o] ?? 0;
    const az = triangles[o + 2] ?? 0;
    const bx = triangles[o + 3] ?? 0;
    const bz = triangles[o + 5] ?? 0;
    const cx = triangles[o + 6] ?? 0;
    const cz = triangles[o + 8] ?? 0;
    const den = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (Math.abs(den) < areaEps) continue;
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
  return { cell, n, min, lists, outer };
}

/** 삽입축 광선이 스캔 면에 처음 닿는 점. `sign` 1은 축 방향, -1은 반대다. */
function projectRay(
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
    const o = (list[cursor] ?? 0) * stride;
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
    bestKey = key;
    best = { rad: radial, y, color: { r, g, b } };
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

function isGingiva(hit: Hit, tooth: Rgb) {
  const pinkGain = pink(hit.color) - pink(tooth);
  const darkGain = luma(tooth) - luma(hit.color);
  const delta = colorDistance(hit.color, tooth);
  return pinkGain >= 0.018 && (darkGain >= 0.012 || delta >= 0.07);
}

/**
 * 각 방향에서 기본 마진 원 안쪽 치아색을 기준으로, 그보다 바깥 스캔 면을 따라
 * 잇몸으로 갈라지는 마지막 치아 점을 마진으로 둔다.
 * `sign` 1은 삽입 방향으로 처음 닿는 면, -1은 그 반대 면이다.
 */
function traceProjectedMargin(
  triangles: Float32Array,
  grid: Grid,
  toothRadius: number,
  count: number,
  sign: number,
): ColorMarginLine | null {
  const radius = toothRadius;
  const base = radius * 0.78;
  const ring = base;
  const radialMin = ring * 0.42;
  const radialMax = radius * 2.28;
  const steps = 52;
  const radii = Array.from({ length: count }, () => 1);
  const depths = Array.from({ length: count }, () => 0);
  const chosen: Array<Hit | null> = Array.from({ length: count }, () => null);
  const hit = Array.from({ length: count }, () => false);
  let found = 0;
  let strength = 0;

  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const samples: Hit[] = [];
    for (let step = 0; step < steps; step += 1) {
      const rad = radialMin + ((radialMax - radialMin) * step) / (steps - 1);
      const projected = projectRay(triangles, grid, cos * rad, sin * rad, sign);
      if (projected) samples.push(projected);
    }
    if (samples.length < 6) continue;
    const inner = samples.filter((sample) => sample.rad <= ring * 0.8);
    const tooth = averageColor(inner.length >= 3 ? inner : samples.slice(0, 4));
    if (!tooth) continue;

    let previous: Hit | null = null;
    let run = 0;
    let pending: Hit | null = null;
    let picked: Hit | null = null;
    let pickedDelta = 0;
    for (const sample of samples) {
      if (sample.rad < ring * 0.95) {
        if (!isGingiva(sample, tooth)) previous = sample;
        continue;
      }
      if (
        previous &&
        sample.rad - previous.rad > radius * 0.2 &&
        isGingiva(sample, tooth)
      ) {
        previous = null;
        run = 0;
        pending = null;
        continue;
      }
      if (!isGingiva(sample, tooth)) {
        previous = sample;
        run = 0;
        pending = null;
        continue;
      }
      if (!previous) continue;
      run += 1;
      if (run === 1) pending = previous;
      const delta = colorDistance(sample.color, tooth);
      const strong = delta >= 0.09 && pink(sample.color) - pink(tooth) >= 0.02;
      if ((run >= 2 || strong) && pending) {
        let lo = pending.rad;
        let hi = sample.rad;
        let edge = pending;
        for (let iter = 0; iter < 6; iter += 1) {
          const mid = (lo + hi) / 2;
          const probe = projectRay(triangles, grid, cos * mid, sin * mid, sign);
          if (!probe) {
            hi = mid;
            continue;
          }
          if (isGingiva(probe, tooth)) hi = mid;
          else {
            lo = mid;
            edge = probe;
          }
        }
        picked = edge;
        pickedDelta = delta;
        break;
      }
    }
    if (!picked) continue;
    radii[index] = clamp(picked.rad / base, 0.45, 2.85);
    depths[index] = picked.y;
    chosen[index] = picked;
    hit[index] = true;
    found += 1;
    strength += pickedDelta;
  }

  if (found < Math.ceil(count * 0.34)) return null;

  for (let index = 0; index < count; index += 1) {
    if (hit[index]) continue;
    let prev = -1;
    let next = -1;
    for (let step = 1; step < count; step += 1) {
      const before = (index - step + count) % count;
      const after = (index + step) % count;
      if (prev < 0 && hit[before]) prev = before;
      if (next < 0 && hit[after]) next = after;
      if (prev >= 0 && next >= 0) break;
    }
    if (prev < 0 || next < 0) continue;
    radii[index] = ((radii[prev] ?? 1) + (radii[next] ?? 1)) / 2;
    depths[index] = ((depths[prev] ?? 0) + (depths[next] ?? 0)) / 2;
    hit[index] = true;
  }

  const smoothed = smoothCircular(radii, 1);
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let rad = clamp(smoothed[index] ?? 1, 0.45, 2.85) * base;
    let projected = projectRay(triangles, grid, cos * rad, sin * rad, sign);
    const origin = chosen[index];
    let guard = 0;
    while (
      projected &&
      origin &&
      pink(projected.color) - pink(origin.color) > 0.04 &&
      guard < 6
    ) {
      rad *= 0.96;
      projected = projectRay(triangles, grid, cos * rad, sin * rad, sign);
      guard += 1;
    }
    if (!projected) {
      radii[index] = clamp(rad / base, 0.45, 2.85);
      continue;
    }
    radii[index] = clamp(projected.rad / base, 0.45, 2.85);
    depths[index] = projected.y;
  }

  return {
    radii,
    depths,
    found,
    strength: strength / found,
  };
}

/**
 * 기본 녹색 원보다 넓은 고리에서, 삽입축으로 메시 위에 붙인 색 경계를 마진으로 고른다.
 * 축 방향 면에서 경계가 없으면 반대 면을 본다.
 */
export function detectProjectedColorMargin(
  triangles: Float32Array,
  toothRadius: number,
  count = COLOR_MARGIN_POINT_COUNT,
): ColorMarginLine | null {
  if (!(toothRadius > 0) || count < 8) return null;
  const grid = buildGrid(triangles, toothRadius);
  if (!grid) return null;
  const direct = traceProjectedMargin(triangles, grid, toothRadius, count, 1);
  if (direct) return direct;
  return traceProjectedMargin(triangles, grid, toothRadius, count, -1);
}
