// 기공소 AI 보철 — 대합 거리(교합 접촉)와 삽입 방향 언더컷을 스캔 정점에서 계산한다.

export type ContactPaintMode = "cut" | "keep";

const TIGHT: [number, number, number] = [0.86, 0.15, 0.13];
const FIT: [number, number, number] = [0.13, 0.72, 0.32];
const OPEN: [number, number, number] = [0.22, 0.48, 0.92];

export const UNDERCUT_RGB: [number, number, number] = [0.62, 0.12, 0.14];

/** 치열 반지름이 수 m면 mm로 올리고, 수 μm면 mm로 내린다. 구강 스캔은 보통 mm. */
export function geometryUnitsToMm(fitRadius: number): number {
  if (fitRadius > 0 && fitRadius < 5) return 1000;
  if (fitRadius > 400) return 0.001;
  return 1;
}

/**
 * 대합까지 거리(mm). 목표 간격 밖이면 null — 치아색을 유지한다.
 * 절삭: 목표보다 가까우면 밀착(빨강). 형태 유지: 초록 폭을 넓힌다.
 */
export function contactColorRgb(
  distMm: number,
  targetMm: number,
  mode: ContactPaintMode,
): [number, number, number] | null {
  if (!Number.isFinite(distMm)) return null;
  const target = Math.min(1.5, Math.max(0, targetMm));
  if (distMm > target + 0.8) return null;
  if (mode === "cut") {
    if (distMm < target - 0.02) return TIGHT;
    if (distMm <= target + 0.08) return FIT;
    return OPEN;
  }
  if (distMm < Math.max(0, target - 0.12)) return TIGHT;
  if (distMm <= target + 0.22) return FIT;
  return OPEN;
}

/**
 * 삽입축과 같은 쪽을 보는 측벽. 교합면(법선이 삽입 반대)은 제외한다.
 * limit 보다 크고 0.82 미만.
 */
export function isUndercutAlignment(align: number, limit: number): boolean {
  return Number.isFinite(align) && align > limit && align < 0.82;
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
