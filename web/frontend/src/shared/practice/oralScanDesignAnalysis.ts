// 기공소 AI 보철 — 대합 거리(교합 접촉)와 삽입 방향 언더컷을 스캔 정점에서 계산한다.

export type ContactPaintMode = "cut" | "keep";

/** 교합 색 눈금. −0.5mm는 중첩(빨강), 0은 목표(초록), +0.5mm는 틈(파랑). */
export const CONTACT_MAP_HALF_MM = 0.5;

/** t 0이 −0.5mm, 0.5가 0mm, 1이 +0.5mm. */
export const CONTACT_MAP_STOPS: Array<{ t: number; rgb: [number, number, number] }> = [
  { t: 0, rgb: [0.72, 0, 0] },
  { t: 0.12, rgb: [1, 0.13, 0] },
  { t: 0.32, rgb: [1, 0.88, 0] },
  { t: 0.5, rgb: [0.05, 0.78, 0.16] },
  { t: 0.65, rgb: [0, 0.9, 1] },
  { t: 0.85, rgb: [0, 0.4, 1] },
  { t: 1, rgb: [0, 0, 0.78] },
];

export const UNDERCUT_RGB: [number, number, number] = [0.62, 0.12, 0.14];

function rgbCss(rgb: [number, number, number]) {
  const channel = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255);
  return `rgb(${channel(rgb[0])} ${channel(rgb[1])} ${channel(rgb[2])})`;
}

/** 교합 범례 막대. 정점 색과 같은 구간을 쓴다. */
export function contactMapGradientCss() {
  return `linear-gradient(90deg, ${CONTACT_MAP_STOPS.map(
    (stop) => `${rgbCss(stop.rgb)} ${Math.round(stop.t * 100)}%`,
  ).join(", ")})`;
}

function sampleContactMap(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  let prev = CONTACT_MAP_STOPS[0]!;
  for (const stop of CONTACT_MAP_STOPS) {
    if (x <= stop.t) {
      const span = stop.t - prev.t || 1;
      const u = (x - prev.t) / span;
      return [
        prev.rgb[0] + (stop.rgb[0] - prev.rgb[0]) * u,
        prev.rgb[1] + (stop.rgb[1] - prev.rgb[1]) * u,
        prev.rgb[2] + (stop.rgb[2] - prev.rgb[2]) * u,
      ];
    }
    prev = stop;
  }
  const last = CONTACT_MAP_STOPS[CONTACT_MAP_STOPS.length - 1]!;
  return last.rgb;
}

/** 치열 반지름이 수 m면 mm로 올리고, 수 μm면 mm로 내린다. 구강 스캔은 보통 mm. */
export function geometryUnitsToMm(fitRadius: number): number {
  if (fitRadius > 0 && fitRadius < 5) return 1000;
  if (fitRadius > 400) return 0.001;
  return 1;
}

/**
 * 대합까지 거리(mm)를 목표 대비 부호 있는 색으로 칠한다.
 * 목표보다 가까우면 빨강·노랑(중첩), 목표면 초록, 멀면 파랑(틈).
 * +0.5mm보다 먼 틈은 치아색을 유지한다.
 * 형태 유지는 목표 근처 초록 폭만 넓힌다.
 */
export function contactColorRgb(
  distMm: number,
  targetMm: number,
  mode: ContactPaintMode,
): [number, number, number] | null {
  if (!Number.isFinite(distMm)) return null;
  const target = Math.min(1.5, Math.max(0, targetMm));
  const signed = distMm - target;
  if (signed > CONTACT_MAP_HALF_MM) return null;
  const hold = mode === "keep" ? 0.18 : 0.04;
  if (Math.abs(signed) <= hold) return sampleContactMap(0.5);
  const clamped = Math.max(-CONTACT_MAP_HALF_MM, signed);
  return sampleContactMap((clamped + CONTACT_MAP_HALF_MM) / (CONTACT_MAP_HALF_MM * 2));
}

/**
 * 삽입축과 같은 쪽을 보는 측벽. 교합면(법선이 삽입 반대)은 제외한다.
 * limit 보다 크고 0.82 미만.
 */
export function isUndercutAlignment(align: number, limit: number): boolean {
  return Number.isFinite(align) && align > limit && align < 0.82;
}

type Vec3 = [number, number, number];

/** 벽이 이만큼(약 4°) 보여야 벌점이 없다. 여러 방향이 똑같이 0이면 가운데로 간다. */
const TAPER_SLACK = 0.07;
const TILT_PULL = 0.02;

function unit3(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function tangentBasis(dir: Vec3): [Vec3, Vec3] {
  const pick: Vec3 = Math.abs(dir[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0];
  const u = unit3([
    dir[1] * pick[2] - dir[2] * pick[1],
    dir[2] * pick[0] - dir[0] * pick[2],
    dir[0] * pick[1] - dir[1] * pick[0],
  ]);
  const v: Vec3 = [
    dir[1] * u[2] - dir[2] * u[1],
    dir[2] * u[0] - dir[0] * u[2],
    dir[0] * u[1] - dir[1] * u[0],
  ];
  return [u, v];
}

/**
 * 지대치(와동) 면 법선만 보고, 시작 방향에서 `maxTiltDeg` 안에서 가려지는 벽이 가장 적은 삽입 방향.
 * 방향은 카메라가 보는 쪽(치아로 들어가는 쪽)이다. `before`·`after`는 언더컷 면 비율.
 */
export function recommendInsertionDirection(
  normals: Float32Array,
  start: Vec3,
  options: { undercutLimit: number; maxTiltDeg?: number },
): { dir: Vec3; tiltDeg: number; before: number; after: number } | null {
  const count = Math.floor(normals.length / 3);
  if (count < 30) return null;
  const origin = unit3(start);
  const [u, v] = tangentBasis(origin);
  const maxTilt = ((options.maxTiltDeg ?? 32) * Math.PI) / 180;

  const score = (d: Vec3) => {
    let sum = 0;
    for (let i = 0; i < count; i += 1) {
      const a = normals[i * 3]! * d[0] + normals[i * 3 + 1]! * d[1] + normals[i * 3 + 2]! * d[2];
      if (a >= 0.82) continue;
      if (a > -TAPER_SLACK) sum += a + TAPER_SLACK;
    }
    const cos = d[0] * origin[0] + d[1] * origin[1] + d[2] * origin[2];
    return sum + count * TILT_PULL * (1 - cos);
  };
  const undercutShare = (d: Vec3) => {
    let hit = 0;
    for (let i = 0; i < count; i += 1) {
      const a = normals[i * 3]! * d[0] + normals[i * 3 + 1]! * d[1] + normals[i * 3 + 2]! * d[2];
      if (isUndercutAlignment(a, options.undercutLimit)) hit += 1;
    }
    return hit / count;
  };
  const tilted = (x: number, y: number): Vec3 | null => {
    if (Math.hypot(x, y) > Math.tan(maxTilt)) return null;
    return unit3([
      origin[0] + u[0] * x + v[0] * y,
      origin[1] + u[1] * x + v[1] * y,
      origin[2] + u[2] * x + v[2] * y,
    ]);
  };

  let bestX = 0;
  let bestY = 0;
  let best = score(origin);
  const coarseStep = (4 * Math.PI) / 180;
  for (let tilt = coarseStep; tilt <= maxTilt + 1e-6; tilt += coarseStep) {
    for (let k = 0; k < 24; k += 1) {
      const turn = (k / 24) * Math.PI * 2;
      const x = Math.tan(tilt) * Math.cos(turn);
      const y = Math.tan(tilt) * Math.sin(turn);
      const d = tilted(x, y);
      if (!d) continue;
      const s = score(d);
      if (s < best) {
        best = s;
        bestX = x;
        bestY = y;
      }
    }
  }
  for (const stepDeg of [2, 0.75]) {
    const step = Math.tan((stepDeg * Math.PI) / 180);
    const cx = bestX;
    const cy = bestY;
    for (let i = -2; i <= 2; i += 1) {
      for (let j = -2; j <= 2; j += 1) {
        if (i === 0 && j === 0) continue;
        const d = tilted(cx + i * step, cy + j * step);
        if (!d) continue;
        const s = score(d);
        if (s < best) {
          best = s;
          bestX = cx + i * step;
          bestY = cy + j * step;
        }
      }
    }
  }
  const dir = tilted(bestX, bestY) ?? origin;
  return {
    dir,
    tiltDeg: (Math.atan(Math.hypot(bestX, bestY)) * 180) / Math.PI,
    before: undercutShare(origin),
    after: undercutShare(dir),
  };
}

/** 0(좁음) → 0.45, 100(넓음) → -0.08 */
export function undercutLimitFromRange(range: number): number {
  const t = Math.min(100, Math.max(0, range)) / 100;
  return 0.45 - t * 0.53;
}

type ScanPointIndex = {
  nearest: (x: number, y: number, z: number) => number;
  add: (x: number, y: number, z: number) => void;
};

const PER_CELL = 5;
const MAX_RING = 4;

/** 큰 치는 성긴 격자로 거르고, 가까운 셀만 정밀 거리를 본다. 칸 크기는 mm 기준. */
export function createScanPointIndex(unitToMm = 1): ScanPointIndex {
  const scale = unitToMm > 0 ? unitToMm : 1;
  const fine = 0.7 / scale;
  const coarseSize = 2 / scale;
  const buckets = new Map<string, number[]>();
  const coarse = new Set<string>();
  const coords: number[] = [];

  const add = (x: number, y: number, z: number) => {
    coarse.add(
      `${Math.floor(x / coarseSize)},${Math.floor(y / coarseSize)},${Math.floor(z / coarseSize)}`,
    );
    const key = `${Math.floor(x / fine)},${Math.floor(y / fine)},${Math.floor(z / fine)}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    if (bucket.length >= PER_CELL) return;
    bucket.push(coords.length / 3);
    coords.push(x, y, z);
  };

  const nearest = (x: number, y: number, z: number) => {
    const cx = Math.floor(x / coarseSize);
    const cy = Math.floor(y / coarseSize);
    const cz = Math.floor(z / coarseSize);
    let close = false;
    for (let dz = -1; dz <= 1 && !close; dz += 1) {
      for (let dy = -1; dy <= 1 && !close; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (coarse.has(`${cx + dx},${cy + dy},${cz + dz}`)) {
            close = true;
            break;
          }
        }
      }
    }
    if (!close) return Infinity;

    const ix = Math.floor(x / fine);
    const iy = Math.floor(y / fine);
    const iz = Math.floor(z / fine);
    let best = Infinity;
    for (let r = 0; r <= MAX_RING; r += 1) {
      for (let dz = -r; dz <= r; dz += 1) {
        for (let dy = -r; dy <= r; dy += 1) {
          for (let dx = -r; dx <= r; dx += 1) {
            if (r > 0 && Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) {
              continue;
            }
            const bucket = buckets.get(`${ix + dx},${iy + dy},${iz + dz}`);
            if (!bucket) continue;
            for (const index of bucket) {
              const ox = coords[index * 3] ?? 0;
              const oy = coords[index * 3 + 1] ?? 0;
              const oz = coords[index * 3 + 2] ?? 0;
              const d = Math.hypot(ox - x, oy - y, oz - z);
              if (d < best) best = d;
            }
          }
        }
      }
      if (best <= r * fine) return best;
    }
    return best;
  };

  return { add, nearest };
}
