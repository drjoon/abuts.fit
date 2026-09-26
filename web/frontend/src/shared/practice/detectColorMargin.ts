// 삽입축 주변 스캔 칼라에서 치아·잇몸 경계(마진)를 고른다.

export const COLOR_MARGIN_POINT_COUNT = 24;

export type ColorMarginSample = {
  /** 삽입축에 수직. 각도 0이 오른쪽. */
  x: number;
  z: number;
  /** 삽입 방향(교합면→치은) 거리. */
  axial: number;
  r: number;
  g: number;
  b: number;
};

export type ColorMarginLine = {
  /** `toothRadius * 0.78`에 대한 비. 렌더의 마진 반지름과 같다. */
  radii: number[];
  /** 치아 중심에서 삽입 방향으로의 거리. 기하 단위. */
  depths: number[];
  found: number;
  strength: number;
};

type Rgb = { r: number; g: number; b: number };

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

type Silhouette = { rad: number; y: number; color: Rgb };

/**
 * 각 방향에서 교합면에서 치은 쪽으로 가며, 바깥 실루엣 색이 처음 크게 갈라지는 곳을 마진으로 둔다.
 * 잇몸 쪽이 더 붉고 더 어두울 때만 경계로 인정한다.
 */
export function detectColorMargin(
  samples: readonly ColorMarginSample[],
  toothRadius: number,
  count = COLOR_MARGIN_POINT_COUNT,
): ColorMarginLine | null {
  if (!(toothRadius > 0) || samples.length < 48 || count < 8) return null;
  const radius = toothRadius;
  const base = radius * 0.78;
  const y0 = 0.06 * radius;
  const y1 = 1.5 * radius;
  const radialMin = 0.22 * radius;
  const radialMax = 1.65 * radius;
  const axialBins = 16;

  const buckets: ColorMarginSample[][][] = Array.from({ length: count }, () =>
    Array.from({ length: axialBins }, () => []),
  );
  let used = 0;
  for (const sample of samples) {
    if (sample.axial < y0 || sample.axial > y1) continue;
    const radial = Math.hypot(sample.x, sample.z);
    if (radial < radialMin || radial > radialMax) continue;
    let angle = Math.atan2(sample.z, sample.x);
    if (angle < 0) angle += Math.PI * 2;
    const index = Math.round((angle / (Math.PI * 2)) * count) % count;
    const bin = Math.min(
      axialBins - 1,
      Math.max(0, Math.floor(((sample.axial - y0) / (y1 - y0)) * axialBins)),
    );
    buckets[index]?.[bin]?.push(sample);
    used += 1;
  }
  if (used < 36) return null;

  const columns: Array<Array<Silhouette | null>> = buckets.map((bins) =>
    bins.map((points) => {
      if (points.length < 3) return null;
      const ranked = points
        .map((point) => ({ point, radial: Math.hypot(point.x, point.z) }))
        .sort((a, b) => b.radial - a.radial);
      const keep = ranked.slice(0, Math.max(3, Math.ceil(ranked.length * 0.35)));
      let radial = 0;
      let y = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (const row of keep) {
        radial += row.radial;
        y += row.point.axial;
        r += row.point.r;
        g += row.point.g;
        b += row.point.b;
      }
      const n = keep.length;
      return {
        rad: radial / n,
        y: y / n,
        color: { r: r / n, g: g / n, b: b / n },
      };
    }),
  );

  const radii = Array.from({ length: count }, () => 1);
  const depths = Array.from({ length: count }, () => 0);
  const hit = Array.from({ length: count }, () => false);
  let found = 0;
  let strength = 0;

  for (let index = 0; index < count; index += 1) {
    const column = columns[index] ?? [];
    const filled: Silhouette[] = [];
    for (let bin = 0; bin < axialBins; bin += 1) {
      const row = column[bin];
      if (row) filled.push(row);
    }
    let chosenAbove: Silhouette | null = null;
    let chosenBelow: Silhouette | null = null;
    let chosenDelta = 0;
    let previousDelta = 0;
    for (let step = 0; step < filled.length - 1; step += 1) {
      const above = filled[step]!;
      const below = filled[step + 1]!;
      const delta = colorDistance(above.color, below.color);
      if (below.y - above.y > radius * 0.45) {
        previousDelta = delta;
        continue;
      }
      const yMid = (above.y + below.y) / 2;
      const jumps = delta >= 0.045 && delta >= previousDelta * 1.6;
      previousDelta = delta;
      if (yMid < radius * 0.18) continue;
      if (!jumps) continue;
      if (pink(below.color) - pink(above.color) < 0.01) continue;
      if (luma(above.color) - luma(below.color) < 0.008) continue;
      chosenAbove = above;
      chosenBelow = below;
      chosenDelta = delta;
      break;
    }
    if (!chosenAbove || !chosenBelow) continue;
    radii[index] = clamp(chosenAbove.rad / base, 0.5, 1.7);
    depths[index] = (chosenAbove.y + chosenBelow.y) / 2;
    hit[index] = true;
    found += 1;
    strength += chosenDelta;
  }

  if (found < Math.ceil(count * 0.4)) return null;

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

  return {
    radii: smoothCircular(radii, 2),
    depths: smoothCircular(depths, 2),
    found,
    strength: strength / found,
  };
}

/** 삽입 방향이 반대여도 색 경계가 있는 쪽을 고른다. */
export function detectColorMarginEitherWay(
  samples: readonly ColorMarginSample[],
  toothRadius: number,
): ColorMarginLine | null {
  const direct = detectColorMargin(samples, toothRadius);
  const flipped = detectColorMargin(
    samples.map((sample) => ({ ...sample, axial: -sample.axial })),
    toothRadius,
  );
  if (!direct && !flipped) return null;
  if (!flipped) return direct;
  if (!direct) {
    return { ...flipped, depths: flipped.depths.map((depth) => -depth) };
  }
  if (flipped.found > direct.found || flipped.strength > direct.strength * 1.15) {
    return { ...flipped, depths: flipped.depths.map((depth) => -depth) };
  }
  return direct;
}
