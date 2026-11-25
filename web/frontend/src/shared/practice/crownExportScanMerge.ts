// 크라운 작업용 export: 구강 스캔에서 마진 상방을 덮는 치은을 지운 뒤
// 커스텀어벗을 같은 파일에 합친다. 어벗 단독 파일은 만들지 않는다.
// related: docs/intent/crown-export-scan-abutment-merge.md
// - PracticeCustomAbutmentPreviewDialog.downloadCrownWorkScans

import * as THREE from "three";
import type { DesignedCustomAbutment } from "@/shared/practice/customAbutmentStlDesign";
import type { FixtureWorldPose } from "@/shared/practice/customAbutmentScanbodyMatch";

const SECTORS = 72;
/** 마진·어벗 윤곽보다 이만큼 바깥까지 치은을 지운다. */
const OUTER_PAD_MM = 0.5;
/** 마진보다 살짝 아래에서부터 지워 덮인 치은을 남기지 않는다. */
const BELOW_MARGIN_TOL_MM = 0.2;
const HEIGHT_BIN_MM = 0.25;

type MarginProfile = {
  pose: FixtureWorldPose;
  marginZ: Float32Array;
  marginR: Float32Array;
  /** 높이 칸마다 섹터별 어벗 외곽 반경. */
  envelopeR: Float32Array[];
  z0: number;
  z1: number;
};

function ringAt(values: Float32Array, phi: number): number {
  const n = values.length;
  let a = (phi / (Math.PI * 2)) * n;
  a = ((a % n) + n) % n;
  const i0 = Math.floor(a) % n;
  const t = a - Math.floor(a);
  return values[i0]! * (1 - t) + values[(i0 + 1) % n]! * t;
}

function worldToLocal(
  x: number,
  y: number,
  z: number,
  pose: FixtureWorldPose,
): { lx: number; ly: number; lz: number; r: number; phi: number } {
  const dx = x - pose.origin[0];
  const dy = y - pose.origin[1];
  const dz = z - pose.origin[2];
  const lx = dx * pose.hexX[0] + dy * pose.hexX[1] + dz * pose.hexX[2];
  const ly = dx * pose.hexY[0] + dy * pose.hexY[1] + dz * pose.hexY[2];
  const lz = dx * pose.axis[0] + dy * pose.axis[1] + dz * pose.axis[2];
  return { lx, ly, lz, r: Math.hypot(lx, ly), phi: Math.atan2(ly, lx) };
}

function buildMarginProfile(design: DesignedCustomAbutment): MarginProfile | null {
  const loop = design.marginLoopLocal;
  if (!loop || loop.length < 9) return null;
  const pose = design.fixture.fixturePose;
  const marginZ = new Float32Array(SECTORS);
  const marginR = new Float32Array(SECTORS);
  const zBuckets: number[][] = Array.from({ length: SECTORS }, () => []);
  const rBuckets: number[][] = Array.from({ length: SECTORS }, () => []);
  const n = Math.floor(loop.length / 3);
  for (let i = 0; i < n; i += 1) {
    const x = loop[i * 3]!;
    const y = loop[i * 3 + 1]!;
    const z = loop[i * 3 + 2]!;
    const phi = Math.atan2(y, x);
    let s = Math.floor(((phi + Math.PI) / (Math.PI * 2)) * SECTORS) % SECTORS;
    if (s < 0) s += SECTORS;
    zBuckets[s]!.push(z);
    rBuckets[s]!.push(Math.hypot(x, y));
  }
  const fill = (out: Float32Array, buckets: number[][], fallback: number) => {
    for (let s = 0; s < SECTORS; s += 1) {
      const list = buckets[s]!;
      if (list.length === 0) {
        out[s] = Number.NaN;
        continue;
      }
      list.sort((a, b) => a - b);
      out[s] = list[Math.floor(list.length / 2)]!;
    }
    for (let s = 0; s < SECTORS; s += 1) {
      if (Number.isFinite(out[s]!)) continue;
      let found = fallback;
      for (let d = 1; d < SECTORS; d += 1) {
        const a = out[(s + d) % SECTORS]!;
        const b = out[(s - d + SECTORS) % SECTORS]!;
        if (Number.isFinite(a) && Number.isFinite(b)) {
          found = (a + b) * 0.5;
          break;
        }
        if (Number.isFinite(a)) {
          found = a;
          break;
        }
        if (Number.isFinite(b)) {
          found = b;
          break;
        }
      }
      out[s] = found;
    }
  };
  fill(marginZ, zBuckets, 0);
  fill(marginR, rBuckets, 3);

  let zMin = Infinity;
  let zMax = -Infinity;
  for (let s = 0; s < SECTORS; s += 1) {
    zMin = Math.min(zMin, marginZ[s]!);
    zMax = Math.max(zMax, marginZ[s]!);
  }
  const local = design.localPositions;
  const triCount = Math.floor(local.length / 9);
  for (let t = 0; t < triCount; t += 1) {
    const o = t * 9;
    for (let k = 0; k < 3; k += 1) {
      const z = local[o + k * 3 + 2]!;
      if (z > zMax) zMax = z;
    }
  }
  zMax += 0.6;
  const z0 = zMin - 1.0;
  const binCount = Math.max(1, Math.ceil((zMax - z0) / HEIGHT_BIN_MM));
  const envelopeR: Float32Array[] = Array.from(
    { length: binCount },
    () => new Float32Array(SECTORS),
  );
  for (let t = 0; t < triCount; t += 1) {
    const o = t * 9;
    for (let k = 0; k < 3; k += 1) {
      const x = local[o + k * 3]!;
      const y = local[o + k * 3 + 1]!;
      const z = local[o + k * 3 + 2]!;
      if (z < zMin - 0.6) continue;
      const r = Math.hypot(x, y);
      const phi = Math.atan2(y, x);
      let s = Math.floor(((phi + Math.PI) / (Math.PI * 2)) * SECTORS) % SECTORS;
      if (s < 0) s += SECTORS;
      const bi = Math.min(binCount - 1, Math.max(0, Math.floor((z - z0) / HEIGHT_BIN_MM)));
      const row = envelopeR[bi]!;
      if (r > row[s]!) row[s] = r;
    }
  }
  // 빈 칸은 같은 높이·이웃 섹터에서 채운다.
  for (let bi = 0; bi < binCount; bi += 1) {
    const row = envelopeR[bi]!;
    for (let s = 0; s < SECTORS; s += 1) {
      if (row[s]! > 0) continue;
      let best = 0;
      for (let d = 1; d < SECTORS && best <= 0; d += 1) {
        best = Math.max(row[(s + d) % SECTORS]!, row[(s - d + SECTORS) % SECTORS]!);
      }
      if (best <= 0 && bi > 0) best = envelopeR[bi - 1]![s]!;
      if (best <= 0 && bi + 1 < binCount) best = envelopeR[bi + 1]![s]!;
      row[s] = best > 0 ? best : marginR[s]!;
    }
  }

  return { pose, marginZ, marginR, envelopeR, z0, z1: z0 + binCount * HEIGHT_BIN_MM };
}

function coversAboveMargin(profile: MarginProfile, x: number, y: number, z: number): boolean {
  const { lz, r, phi } = worldToLocal(x, y, z, profile.pose);
  const mZ = ringAt(profile.marginZ, phi);
  if (lz < mZ - BELOW_MARGIN_TOL_MM) return false;
  const mR = ringAt(profile.marginR, phi);
  const bi = Math.min(
    profile.envelopeR.length - 1,
    Math.max(0, Math.floor((lz - profile.z0) / HEIGHT_BIN_MM)),
  );
  const eR = ringAt(profile.envelopeR[bi]!, phi);
  const limit = Math.max(mR, eR) + OUTER_PAD_MM;
  return r <= limit;
}

/**
 * 마진 상방을 덮는 치은 삼각형을 지운 새 geometry를 돌려준다.
 * 지울 것이 없으면 원본을 그대로 반환한다(dispose 금지).
 */
export function removeGingivaCoveringAboveMargin(
  geometry: THREE.BufferGeometry,
  designs: readonly DesignedCustomAbutment[],
): THREE.BufferGeometry {
  if (!designs.length) return geometry;
  const profiles = designs
    .map((d) => buildMarginProfile(d))
    .filter((p): p is MarginProfile => Boolean(p));
  if (!profiles.length) return geometry;

  const pos = geometry.getAttribute("position");
  if (!pos || pos.count < 3) return geometry;
  const index = geometry.getIndex();
  const triCount = index ? Math.floor(index.count / 3) : Math.floor(pos.count / 3);
  if (triCount < 1) return geometry;

  const vert = (t: number, c: number) => (index ? index.getX(t * 3 + c) : t * 3 + c);
  const kept: number[] = [];
  let dropped = 0;
  for (let t = 0; t < triCount; t += 1) {
    const i0 = vert(t, 0);
    const i1 = vert(t, 1);
    const i2 = vert(t, 2);
    const x0 = pos.getX(i0);
    const y0 = pos.getY(i0);
    const z0 = pos.getZ(i0);
    const x1 = pos.getX(i1);
    const y1 = pos.getY(i1);
    const z1 = pos.getZ(i1);
    const x2 = pos.getX(i2);
    const y2 = pos.getY(i2);
    const z2 = pos.getZ(i2);
    const cx = (x0 + x1 + x2) / 3;
    const cy = (y0 + y1 + y2) / 3;
    const cz = (z0 + z1 + z2) / 3;
    let cover = false;
    for (const profile of profiles) {
      if (
        coversAboveMargin(profile, cx, cy, cz) ||
        coversAboveMargin(profile, x0, y0, z0) ||
        coversAboveMargin(profile, x1, y1, z1) ||
        coversAboveMargin(profile, x2, y2, z2)
      ) {
        cover = true;
        break;
      }
    }
    if (cover) {
      dropped += 1;
      continue;
    }
    kept.push(i0, i1, i2);
  }
  if (dropped === 0) return geometry;

  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(geometry.attributes)) {
    out.setAttribute(name, attr);
  }
  out.setIndex(kept);
  return out;
}
