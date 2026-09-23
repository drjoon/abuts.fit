// change-log:
// - 2026-09-23: FL 반자동 — 시드 ridge 스냅 + 방위각 max-radius 전둘레 추적 (클라).
// related files:
// - web/frontend/src/features/requests/components/StlPreviewViewer.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/finishLineQuality.ts
// - bg/pc1/rhino-server/compute/scripts/finishline_detection.py
import type { BufferGeometry } from "three";

export type Xyz = [number, number, number];

const DEFAULT_SNAP_RADIUS_MM = 1.4;
const DEFAULT_SNAP_Z_BAND_MM = 0.85;
const DEFAULT_SECTION_COUNT = 72;
const DEFAULT_TRACE_Z_BAND_MM = 1.2;
const DEFAULT_RESAMPLE_COUNT = 96;
const OUTLIER_RADIUS_RATIO = 0.22;
const OUTLIER_DZ_MM = 1.2;

function readPositions(geometry: BufferGeometry): Float32Array | null {
  const attr = geometry.getAttribute("position");
  if (!attr || attr.itemSize < 3 || attr.count < 8) return null;
  const arr = attr.array;
  if (!(arr instanceof Float32Array) && !ArrayBuffer.isView(arr)) return null;
  return arr as Float32Array;
}

function xyRadius(x: number, y: number, cx: number, cy: number): number {
  return Math.hypot(x - cx, y - cy);
}

/**
 * raycast hit 주변에서 시드 Z 밴드 안 max-radius 정점으로 스냅.
 * 벽면/포스트 클릭을 어깨 능선으로 끌어올린다.
 */
export function snapToLocalRidge(
  geometry: BufferGeometry,
  hit: Xyz,
  options?: {
    searchRadiusMm?: number;
    zBandMm?: number;
    axisXy?: [number, number];
  },
): Xyz {
  const positions = readPositions(geometry);
  if (!positions) return hit;

  const searchR = options?.searchRadiusMm ?? DEFAULT_SNAP_RADIUS_MM;
  const zBand = options?.zBandMm ?? DEFAULT_SNAP_Z_BAND_MM;
  const cx = options?.axisXy?.[0] ?? 0;
  const cy = options?.axisXy?.[1] ?? 0;
  const searchR2 = searchR * searchR;

  let best: Xyz | null = null;
  let bestR = -1;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    if (Math.abs(z - hit[2]) > zBand) continue;
    const dx = x - hit[0];
    const dy = y - hit[1];
    const dz = z - hit[2];
    if (dx * dx + dy * dy + dz * dz > searchR2) continue;
    const r = xyRadius(x, y, cx, cy);
    if (r > bestR) {
      bestR = r;
      best = [x, y, z];
    }
  }

  return best ?? hit;
}

type BucketPoint = { x: number; y: number; z: number; r: number };

function azimuthBucket(
  x: number,
  y: number,
  cx: number,
  cy: number,
  sectionCount: number,
): number {
  let a = Math.atan2(y - cy, x - cx);
  if (a < 0) a += Math.PI * 2;
  const idx = Math.floor((a / (Math.PI * 2)) * sectionCount) % sectionCount;
  return idx < 0 ? idx + sectionCount : idx;
}

function lerpPoint(a: BucketPoint, b: BucketPoint, t: number): BucketPoint {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    r: a.r + (b.r - a.r) * t,
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/**
 * 시드 점 기준 방위각 max-radius 단면 추적 → 폐곡선 피니시라인.
 * Rhino section / max-radius fallback 계열을 FE 정점 버킷으로 이식.
 */
export function traceFinishLineFromSeed(
  geometry: BufferGeometry,
  seedRaw: Xyz,
  options?: {
    sectionCount?: number;
    zBandMm?: number;
    resampleCount?: number;
    axisXy?: [number, number];
  },
): Xyz[] {
  const positions = readPositions(geometry);
  if (!positions) return [];

  const sectionCount = options?.sectionCount ?? DEFAULT_SECTION_COUNT;
  const zBand = options?.zBandMm ?? DEFAULT_TRACE_Z_BAND_MM;
  const resampleCount = options?.resampleCount ?? DEFAULT_RESAMPLE_COUNT;
  const cx = options?.axisXy?.[0] ?? 0;
  const cy = options?.axisXy?.[1] ?? 0;

  const seed = snapToLocalRidge(geometry, seedRaw, {
    axisXy: [cx, cy],
    zBandMm: Math.min(zBand, DEFAULT_SNAP_Z_BAND_MM),
  });
  const z0 = seed[2];

  const buckets: Array<BucketPoint | null> = Array.from(
    { length: sectionCount },
    () => null,
  );

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    if (Math.abs(z - z0) > zBand) continue;
    const r = xyRadius(x, y, cx, cy);
    if (r < 0.15) continue;
    const bi = azimuthBucket(x, y, cx, cy, sectionCount);
    const prev = buckets[bi];
    if (!prev || r > prev.r) {
      buckets[bi] = { x, y, z, r };
    }
  }

  // 빈 버킷: 양옆 유효 버킷 보간
  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 0; i < sectionCount; i += 1) {
      if (buckets[i]) continue;
      let left: BucketPoint | null = null;
      let leftDist = 0;
      for (let d = 1; d < sectionCount; d += 1) {
        const p = buckets[(i - d + sectionCount) % sectionCount];
        if (p) {
          left = p;
          leftDist = d;
          break;
        }
      }
      let right: BucketPoint | null = null;
      let rightDist = 0;
      for (let d = 1; d < sectionCount; d += 1) {
        const p = buckets[(i + d) % sectionCount];
        if (p) {
          right = p;
          rightDist = d;
          break;
        }
      }
      if (left && right) {
        const t = leftDist / Math.max(1, leftDist + rightDist);
        buckets[i] = lerpPoint(left, right, t);
      } else if (left) {
        buckets[i] = { ...left };
      } else if (right) {
        buckets[i] = { ...right };
      }
    }
  }

  const filled = buckets.filter((b): b is BucketPoint => !!b);
  if (filled.length < 8) return [];

  // 반경·Δz 이상치 완화 (이웃 중앙값으로 당겨줌)
  const radii = filled.map((p) => p.r);
  const rMed = median(radii);
  const cleaned: BucketPoint[] = filled.map((p, i) => {
    const prev = filled[(i - 1 + filled.length) % filled.length];
    const next = filled[(i + 1) % filled.length];
    let { x, y, z, r } = p;
    if (rMed > 1e-6 && Math.abs(r - rMed) / rMed > OUTLIER_RADIUS_RATIO) {
      x = (prev.x + next.x) / 2;
      y = (prev.y + next.y) / 2;
      z = (prev.z + next.z) / 2;
      r = xyRadius(x, y, cx, cy);
    }
    if (
      Math.abs(z - prev.z) > OUTLIER_DZ_MM &&
      Math.abs(z - next.z) > OUTLIER_DZ_MM
    ) {
      z = (prev.z + next.z) / 2;
    }
    return { x, y, z, r };
  });

  // 균등 방위각으로 리샘플
  const out: Xyz[] = [];
  for (let i = 0; i < resampleCount; i += 1) {
    const t = i / resampleCount;
    const idx = t * cleaned.length;
    const i0 = Math.floor(idx) % cleaned.length;
    const i1 = (i0 + 1) % cleaned.length;
    const frac = idx - Math.floor(idx);
    const a = cleaned[i0];
    const b = cleaned[i1];
    out.push([
      a.x + (b.x - a.x) * frac,
      a.y + (b.y - a.y) * frac,
      a.z + (b.z - a.z) * frac,
    ]);
  }

  return out;
}
