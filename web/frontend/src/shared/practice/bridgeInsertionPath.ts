// 브리지 삽입 패스. 의뢰 bridgeLinkedTeeth로만 잇고, 사분악이 같다고 다른 브리지를 섞지 않는다.
// 폰틱을 건너 지대치끼리 같은 월드 삽입축을 쓴다.

import { parseFdiTooth } from "@/shared/practice/customAbutmentScanbodyMatch";

export type BridgePathWork = {
  toothNumber?: string | null;
  bridgeLinkedTeeth?: readonly string[] | null;
};

export type FixtureAxisPose = {
  hexX: readonly number[];
  hexY: readonly number[];
  axis: readonly number[];
};

function digitsOf(tooth: string | null | undefined): string {
  return parseFdiTooth(String(tooth ?? ""))?.digits ?? "";
}

/** 의뢰 연결을 따라간 브리지 치아. 시작 치아를 포함한다. */
export function bridgeSpanDigits(
  toothNumber: string,
  toothWorks: readonly BridgePathWork[] | null | undefined,
): string[] {
  const start = digitsOf(toothNumber);
  if (!start) return [];
  const byDigits = new Map<string, BridgePathWork>();
  for (const row of toothWorks ?? []) {
    const digits = digitsOf(row.toothNumber);
    if (digits && !byDigits.has(digits)) byDigits.set(digits, row);
  }
  const span = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (span.has(cur)) continue;
    span.add(cur);
    const row = byDigits.get(cur);
    for (const linked of row?.bridgeLinkedTeeth ?? []) {
      const digits = digitsOf(linked);
      if (digits && !span.has(digits)) queue.push(digits);
    }
    for (const [other, otherRow] of byDigits) {
      if (span.has(other)) continue;
      if ((otherRow.bridgeLinkedTeeth ?? []).some((linked) => digitsOf(linked) === cur)) {
        queue.push(other);
      }
    }
  }
  return [...span];
}

/**
 * 같은 브리지의 다른 커스텀어벗.
 * 33-43처럼 폰틱을 사이에 둔 지대치만 돌아오고, 옆 브리지(34-35)는 빠진다.
 */
export function bridgeInsertionMates(
  toothNumber: string,
  toothWorks: readonly BridgePathWork[] | null | undefined,
  abutmentTeeth: readonly string[],
): string[] {
  const span = new Set(bridgeSpanDigits(toothNumber, toothWorks));
  if (span.size < 2) return [];
  const self = digitsOf(toothNumber);
  const mates: string[] = [];
  const seen = new Set<string>();
  for (const tooth of abutmentTeeth) {
    const digits = digitsOf(tooth);
    if (!digits || digits === self || !span.has(digits) || seen.has(digits)) continue;
    seen.add(digits);
    mates.push(digits);
  }
  return mates;
}

export function normalizeInsertionAxis(raw: unknown): [number, number, number] | null {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const x = Number(raw[0]);
  const y = Number(raw[1]);
  const z = Number(raw[2]);
  if (![x, y, z].every((value) => Number.isFinite(value))) return null;
  const len = Math.hypot(x, y, z);
  if (len < 1e-6) return null;
  return [x / len, y / len, z / len];
}

export function readBridgeInsertionAxis(
  locked: ReadonlyMap<string, readonly [number, number, number]>,
  toothNumber: string,
): [number, number, number] | undefined {
  const digits = digitsOf(toothNumber);
  const axis = digits ? locked.get(digits) : undefined;
  return axis ? [axis[0], axis[1], axis[2]] : undefined;
}

export function writeBridgeInsertionAxis(
  locked: Map<string, [number, number, number]>,
  teeth: readonly string[],
  axis: readonly [number, number, number] | null,
) {
  for (const tooth of teeth) {
    const digits = digitsOf(tooth);
    if (!digits) continue;
    if (axis) locked.set(digits, [axis[0], axis[1], axis[2]]);
    else locked.delete(digits);
  }
}

/** 마진 위 축벽의 아랫단·윗단 중심으로 잡은 로컬 삽입축. 교합 사면은 빼 둔다. */
export function measureLocalPostAxis(
  local: ArrayLike<number>,
  marginZ: number,
): [number, number, number] | null {
  let topZ = -Infinity;
  for (let i = 2; i < local.length; i += 3) {
    const z = local[i]!;
    if (z > topZ) topZ = z;
  }
  if (!(topZ > marginZ + 1.2)) return null;
  const span = topZ - marginZ;
  const baseLo = marginZ + span * 0.18;
  const baseHi = marginZ + span * 0.34;
  const topLo = marginZ + span * 0.56;
  const topHi = marginZ + span * 0.74;
  let tx = 0;
  let ty = 0;
  let tz = 0;
  let tn = 0;
  let bx = 0;
  let by = 0;
  let bz = 0;
  let bn = 0;
  for (let i = 0; i < local.length; i += 3) {
    const x = local[i]!;
    const y = local[i + 1]!;
    const z = local[i + 2]!;
    if (x * x + y * y < 0.12) continue;
    if (z >= topLo && z <= topHi) {
      tx += x;
      ty += y;
      tz += z;
      tn += 1;
    } else if (z >= baseLo && z <= baseHi) {
      bx += x;
      by += y;
      bz += z;
      bn += 1;
    }
  }
  if (tn < 4 || bn < 4) return null;
  const dx = tx / tn - bx / bn;
  const dy = ty / tn - by / bn;
  const dz = tz / tn - bz / bn;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.4) return null;
  return [dx / len, dy / len, dz / len];
}

/** 픽스처 로컬 방향을 월드 방향으로. hexX·hexY·axis가 열 기저다. */
export function localDirToWorld(
  dir: readonly [number, number, number],
  pose: FixtureAxisPose,
): [number, number, number] | null {
  const lx = dir[0];
  const ly = dir[1];
  const lz = dir[2];
  const x = (pose.hexX[0] ?? 0) * lx + (pose.hexY[0] ?? 0) * ly + (pose.axis[0] ?? 0) * lz;
  const y = (pose.hexX[1] ?? 0) * lx + (pose.hexY[1] ?? 0) * ly + (pose.axis[1] ?? 0) * lz;
  const z = (pose.hexX[2] ?? 0) * lx + (pose.hexY[2] ?? 0) * ly + (pose.axis[2] ?? 0) * lz;
  const len = Math.hypot(x, y, z);
  if (len < 1e-6) return null;
  return [x / len, y / len, z / len];
}

/** 월드 방향을 픽스처 로컬 방향(hexX, hexY, axis 기저)으로 변환한다. */
export function worldDirToLocal(
  world: readonly [number, number, number],
  pose: FixtureAxisPose,
): [number, number, number] | null {
  const wx = world[0];
  const wy = world[1];
  const wz = world[2];
  const lx = (pose.hexX[0] ?? 0) * wx + (pose.hexX[1] ?? 0) * wy + (pose.hexX[2] ?? 0) * wz;
  const ly = (pose.hexY[0] ?? 0) * wx + (pose.hexY[1] ?? 0) * wy + (pose.hexY[2] ?? 0) * wz;
  const lz = (pose.axis[0] ?? 0) * wx + (pose.axis[1] ?? 0) * wy + (pose.axis[2] ?? 0) * wz;
  const len = Math.hypot(lx, ly, lz);
  if (len < 1e-6) return null;
  return [lx / len, ly / len, lz / len];
}
