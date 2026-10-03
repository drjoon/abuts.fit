// 어벗을 보철(크라운·브리지) 내면에 꽂는다. 보철은 파일 좌표 그대로 두고 어벗만 옮긴다.
// 바이트에 악궁을 붙이듯 자세 가설(보철 삽입축·포스트 방향·치식 좌석·축 회전)을 세우고,
// 각각 trimmed ICP로 맞춘 뒤 포스트가 내면에 닿고 벽을 뚫지 않는 자세를 고른다.
// 브리지는 어벗마다 다른 좌석을 배정한다. 결과에 편차(통계·꼭짓점별 거리)를 붙인다.
// related files:
// - web/frontend/src/shared/share/CaseLayerViewer.tsx
// - web/frontend/src/shared/practice/scanbodyRegistration.ts
// - web/frontend/src/shared/practice/biteRegistration.ts
// - web/frontend/src/shared/filename/parseFilename.ts
// change-log:
// - 2026-10-03: 맞추는 중 취소(cancelled). 캐시에 실패로 남기지 않아 다시 맞출 수 있다.
// - 2026-10-03: 보철 고정, 어벗을 옮긴다. 어벗별 편차를 같이 돌려준다(확인 후 자세만 저장).
// - 2026-10-03: 어벗은 고정, 보철을 옮긴다. 브리지는 어벗 전부로 같이 맞춘다. 진행률을 알리며 비동기로 푼다.
// - 2026-10-03: 바이트식 가설 탐색으로 교체. 축 부호·기울기를 풀고, 브리지 치식은 범위로 펼친다.
// - 2026-10-03: 브리지 좌석은 치식 순서로 고른다. 반경만 보면 이웃 리테이너에 꽂힌다.
// - 2026-10-03: ICP 타깃은 보철 내면만. FL→좌석 중심을 다시 고정한다.
// - 2026-10-03: seating을 스캔바디 ICP 파이프라인으로 교체(삽입축 시드 + trimmed ICP).
// - 2026-10-03: 삽입축 회전 — 어벗 외면↔보철 내면 맞춤(주) + FL 링 위상(보조).
// - 2026-10-03: FL 링 방위각 프로파일로 삽입축 회전까지 맞춘다.
// - 2026-10-03: 뷰어용 — 어벗 FL 링 ↔ 보철 내면 좌석 중심을 맞춰 꽂는다(회전 없음).
import * as THREE from "three";
import { parseFilename } from "@/shared/filename/parseFilename";
import {
  applyPose,
  icp,
  PointGrid,
  samplePoints,
  voxelDownsample,
  type Mat3,
  type RigidPose,
  type Vec3,
} from "@/shared/practice/scanbodyRegistration";

/** 사용자가 맞추기를 멈췄을 때. 캐시에 실패로 남기지 않는다. */
export class SeatCancelledError extends Error {
  constructor() {
    super("seat-cancelled");
    this.name = "SeatCancelledError";
  }
}

export function isSeatCancelled(error: unknown): boolean {
  return error instanceof SeatCancelledError || (error as { name?: string } | null)?.name === "SeatCancelledError";
}

export type FinishRing = {
  /** 링 중심(메시 로컬). */
  center: THREE.Vector3;
  /** 평균 반경(mm). */
  radius: number;
  /** 삽입축 0=x, 1=y, 2=z. */
  axis: 0 | 1 | 2;
};

export type ProsthesisSeat = {
  center: THREE.Vector3;
  radius: number;
  score: number;
  /** 스팬을 유닛 수로 나눈 구역 번호(스팬 축 작은 쪽부터). */
  unit: number;
};

/** 강체 자세. world = R · p + t */
export type AbutmentSeatPose = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
};

const ALREADY_SEATED_MM = 0.35;
const ALREADY_SEATED_DEG = 2;
const AXIS_COMPONENTS: Array<0 | 1 | 2> = [0, 1, 2];
const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function readPositions(geometry: THREE.BufferGeometry): Float32Array | null {
  const attr = geometry.getAttribute("position");
  if (!attr || attr.itemSize < 3 || attr.count < 24) return null;
  const arr = attr.array;
  if (!(arr instanceof Float32Array) && !ArrayBuffer.isView(arr)) return null;
  return arr as Float32Array;
}

function readNormals(geometry: THREE.BufferGeometry): Float32Array | null {
  const attr = geometry.getAttribute("normal");
  if (!attr || attr.itemSize < 3 || attr.count < 24) return null;
  const arr = attr.array;
  if (!(arr instanceof Float32Array) && !ArrayBuffer.isView(arr)) return null;
  return arr as Float32Array;
}

function boxOf(positions: Float32Array): THREE.Box3 {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < positions.length; i += 3) {
    v.set(positions[i]!, positions[i + 1]!, positions[i + 2]!);
    box.expandByPoint(v);
  }
  return box;
}

function longestAxis(size: THREE.Vector3): 0 | 1 | 2 {
  if (size.x >= size.y && size.x >= size.z) return 0;
  if (size.y >= size.x && size.y >= size.z) return 1;
  return 2;
}

function radialAxes(axis: 0 | 1 | 2): [0 | 1 | 2, 0 | 1 | 2] {
  const a0 = ((axis + 1) % 3) as 0 | 1 | 2;
  const a1 = ((axis + 2) % 3) as 0 | 1 | 2;
  return [a0, a1];
}

function axisVec(axis: 0 | 1 | 2): Vec3 {
  const v: Vec3 = [0, 0, 0];
  v[axis] = 1;
  return v;
}

function rotAroundAxis(axis: Vec3, rad: number): Mat3 {
  const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const x = axis[0] / len;
  const y = axis[1] / len;
  const z = axis[2] / len;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const C = 1 - c;
  return [
    c + x * x * C,
    x * y * C - z * s,
    x * z * C + y * s,
    y * x * C + z * s,
    c + y * y * C,
    y * z * C - x * s,
    z * x * C - y * s,
    z * y * C + x * s,
    c + z * z * C,
  ];
}

function rigidToThree(pose: RigidPose): AbutmentSeatPose {
  const matrix = new THREE.Matrix4().set(
    pose.r[0],
    pose.r[1],
    pose.r[2],
    pose.t[0],
    pose.r[3],
    pose.r[4],
    pose.r[5],
    pose.t[1],
    pose.r[6],
    pose.r[7],
    pose.r[8],
    pose.t[2],
    0,
    0,
    0,
    1,
  );
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  return { position, quaternion };
}

/**
 * 어벗 피니시라인 — 삽입축(긴 축) 중간 밴드에서 평균 반경이 가장 큰 링.
 * 제조 STL은 보통 Z가 삽입축이다.
 */
export function estimateAbutmentFinishRing(
  geometry: THREE.BufferGeometry,
): FinishRing | null {
  const positions = readPositions(geometry);
  if (!positions) return null;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox ?? boxOf(positions);
  if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3());
  const axis = longestAxis(size);
  const [a0, a1] = radialAxes(axis);
  const minA = box.min.getComponent(axis);
  const maxA = box.max.getComponent(axis);
  const span = Math.max(maxA - minA, 1e-3);
  const bins = 48;
  let best: { t: number; cx: number; cy: number; r: number } | null = null;

  for (let b = 8; b < bins - 8; b += 1) {
    const t0 = minA + (span * b) / bins;
    const t1 = minA + (span * (b + 1)) / bins;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let i = 0; i < positions.length; i += 3) {
      const t = positions[i + axis]!;
      if (t < t0 || t >= t1) continue;
      sx += positions[i + a0]!;
      sy += positions[i + a1]!;
      n += 1;
    }
    if (n < 40) continue;
    const cx = sx / n;
    const cy = sy / n;
    let rSum = 0;
    let rN = 0;
    for (let i = 0; i < positions.length; i += 3) {
      const t = positions[i + axis]!;
      if (t < t0 || t >= t1) continue;
      rSum += Math.hypot(positions[i + a0]! - cx, positions[i + a1]! - cy);
      rN += 1;
    }
    const r = rSum / Math.max(rN, 1);
    if (!best || r > best.r) best = { t: (t0 + t1) / 2, cx, cy, r };
  }
  if (!best || best.r < 0.4) return null;
  const center = new THREE.Vector3();
  center.setComponent(axis, best.t);
  center.setComponent(a0, best.cx);
  center.setComponent(a1, best.cy);
  return { center, radius: best.r, axis };
}

type Region = { min: number; max: number };

/** 브리지는 유닛 수(치식)만큼 스팬을 고르게 나눈다. 치식이 없으면 길쭉할 때만 둘로. */
function seatRegions(box: THREE.Box3, spanAxis: 0 | 1 | 2, units = 0): Region[] {
  const min = box.min.getComponent(spanAxis);
  const max = box.max.getComponent(spanAxis);
  if (units >= 2) {
    const step = (max - min) / units;
    return Array.from({ length: units }, (_, i) => ({
      min: min + step * i,
      max: i === units - 1 ? max + 1e-6 : min + step * (i + 1),
    }));
  }
  const size = box.getSize(new THREE.Vector3());
  const long = size.getComponent(spanAxis);
  const other = Math.max(
    ...AXIS_COMPONENTS.filter((a) => a !== spanAxis).map((a) =>
      size.getComponent(a),
    ),
    1e-3,
  );
  if (long > other * 1.35) {
    const mid = (min + max) / 2;
    return [
      { min, max: mid },
      { min: mid, max },
    ];
  }
  return [{ min, max }];
}

/**
 * 보철 내면 좌석 — 축 밴드에서 중심을 향하는 법선 점들의 중앙 반경 링. 구역마다 하나.
 * 폰틱 구역은 안쪽을 보는 면이 없어 좌석이 안 나온다.
 */
export function findProsthesisSeats(
  geometry: THREE.BufferGeometry,
  targetRadius: number,
  insertAxis: 0 | 1 | 2,
  units = 0,
): ProsthesisSeat[] {
  const positions = readPositions(geometry);
  if (!positions) return [];
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  const normals = readNormals(geometry);
  if (!normals || normals.length !== positions.length) return [];
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox ?? boxOf(positions);
  if (box.isEmpty()) return [];

  const size = box.getSize(new THREE.Vector3());
  const spanAxis = longestAxis(size);
  const [a0, a1] = radialAxes(insertAxis);
  const regions = seatRegions(box, spanAxis, units);
  const bins = 36;
  const cells = regions.length * bins;
  const axisMin = box.min.getComponent(insertAxis);
  const span = Math.max(box.max.getComponent(insertAxis) - axisMin, 1e-3);
  const cellOf = new Int32Array(positions.length / 3).fill(-1);
  const sx = new Float64Array(cells);
  const sy = new Float64Array(cells);
  const sSpan = new Float64Array(cells);
  const count = new Int32Array(cells);
  for (let i = 0, v = 0; i < positions.length; i += 3, v += 1) {
    const alongSpan = positions[i + spanAxis]!;
    const region = regions.findIndex((r) => alongSpan >= r.min && alongSpan < r.max);
    if (region < 0) continue;
    const b = Math.floor(((positions[i + insertAxis]! - axisMin) / span) * bins);
    if (b < 0 || b >= bins) continue;
    const c = region * bins + b;
    cellOf[v] = c;
    sx[c] += positions[i + a0]!;
    sy[c] += positions[i + a1]!;
    sSpan[c] += alongSpan;
    count[c] += 1;
  }
  const radii: number[][] = Array.from({ length: cells }, () => []);
  for (let i = 0, v = 0; i < positions.length; i += 3, v += 1) {
    const c = cellOf[v]!;
    if (c < 0 || count[c]! < 80) continue;
    const dx = positions[i + a0]! - sx[c]! / count[c]!;
    const dy = positions[i + a1]! - sy[c]! / count[c]!;
    const rr = Math.hypot(dx, dy);
    if (rr < 0.5) continue;
    const facing = (normals[i + a0]! * -dx + normals[i + a1]! * -dy) / rr;
    if (facing < 0.2) continue;
    radii[c]!.push(rr);
  }

  const seats: ProsthesisSeat[] = [];
  for (let region = 0; region < regions.length; region += 1) {
    let best: ProsthesisSeat | null = null;
    for (let b = 0; b < bins; b += 1) {
      const c = region * bins + b;
      const list = radii[c]!;
      if (list.length < 20) continue;
      list.sort((x, y) => x - y);
      const medR = list[Math.floor(list.length / 2)]!;
      const score = list.length / (1 + Math.abs(medR - targetRadius) * 2);
      if (best && score <= best.score) continue;
      const center = new THREE.Vector3();
      center.setComponent(insertAxis, axisMin + (span * (b + 0.5)) / bins);
      center.setComponent(a0, sx[c]! / count[c]!);
      center.setComponent(a1, sy[c]! / count[c]!);
      center.setComponent(spanAxis, sSpan[c]! / count[c]!);
      best = { center, radius: medR, score, unit: region };
    }
    if (best) seats.push(best);
  }
  return seats;
}

const FDI_TOOTH = /^[1-8][1-8]$/;

/** FDI 치식의 악. 1·2·5·6 상악, 3·4·7·8 하악. */
function jawOfTooth(tooth: string): "upper" | "lower" | null {
  const t = tooth.trim();
  if (!FDI_TOOTH.test(t)) return null;
  return "1256".includes(t[0]!) ? "upper" : "lower";
}

/** 정중선 기준 아치 위치. 오른쪽(1·4·5·8 분면)은 음수, 왼쪽은 양수. */
function archPosition(tooth: string): number {
  const side = "1458".includes(tooth[0]!) ? -1 : 1;
  return side * Number(tooth[1]);
}

function toothAtArchPosition(pos: number, jaw: "upper" | "lower", deciduous: boolean): string {
  const right = pos < 0;
  const quadrant =
    jaw === "upper" ? (right ? 1 : 2) : right ? 4 : 3;
  return `${deciduous ? quadrant + 4 : quadrant}${Math.abs(pos)}`;
}

/**
 * 치식 라벨을 아치 순서의 개별 치아로. 브리지 `A-B`는 끝 치아 범위다.
 * `46-47` → 46·47, `45-47` → 45·46·47, `12-22` → 12·11·21·22.
 */
export function expandToothLabel(label: string): string[] {
  const parts = label
    .split("-")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length !== 2) return parts;
  const [a, b] = parts as [string, string];
  const jaw = jawOfTooth(a);
  const deciduous = Number(a[0]) >= 5;
  if (!jaw || jawOfTooth(b) !== jaw || Number(b[0]) >= 5 !== deciduous) return parts;
  const pa = archPosition(a);
  const pb = archPosition(b);
  const step = pb >= pa ? 1 : -1;
  const out: string[] = [];
  for (let p = pa; ; p += step) {
    if (p !== 0) out.push(toothAtArchPosition(p, jaw, deciduous));
    if (p === pb) break;
  }
  return out;
}

/** 보철 치식의 유닛 수와 그중 어벗 치아 순번. 모르면 null. */
function toothSlot(opts?: AbutmentSeatPoseOptions): { units: number; index: number } | null {
  const abutTooth = String(opts?.abutTooth || "").trim();
  const teeth = expandToothLabel(String(opts?.crownTooth || ""));
  const index = abutTooth ? teeth.indexOf(abutTooth) : -1;
  if (index < 0 || teeth.length < 2) return null;
  return { units: teeth.length, index };
}

/**
 * 브리지 좌석 후보. 치식으로 어벗 치아가 몇 번째 유닛인지 알고, 스팬 축 앞뒤 방향만 모른다.
 * 그래서 그 순번과 반대 순번 구역의 좌석만 남긴다. 방향은 맞춤 점수가 가른다.
 */
function seatsForTooth(
  seats: ProsthesisSeat[],
  slot: { units: number; index: number } | null,
): ProsthesisSeat[] {
  if (!slot || seats.length <= 1) return seats;
  const units = new Set([slot.index, slot.units - 1 - slot.index]);
  const picked = seats.filter((seat) => units.has(seat.unit));
  return picked.length > 0 ? picked : seats;
}

/** 메시 부피 부호. STL 감김이 뒤집혀 법선이 안쪽을 보면 음수. */
function signedVolume(positions: Float32Array, index: THREE.BufferAttribute | null): number {
  const tri = index ? index.count / 3 : positions.length / 9;
  let vol = 0;
  for (let t = 0; t < tri; t += 1) {
    const ia = (index ? index.getX(t * 3) : t * 3) * 3;
    const ib = (index ? index.getX(t * 3 + 1) : t * 3 + 1) * 3;
    const ic = (index ? index.getX(t * 3 + 2) : t * 3 + 2) * 3;
    const ax = positions[ia]!;
    const ay = positions[ia + 1]!;
    const az = positions[ia + 2]!;
    const bx = positions[ib]!;
    const by = positions[ib + 1]!;
    const bz = positions[ib + 2]!;
    const cx = positions[ic]!;
    const cy = positions[ic + 1]!;
    const cz = positions[ic + 2]!;
    vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return vol / 6;
}

/** 보철 표면 점과 바깥 법선. 관통 판정에 쓴다. */
type CrownSurface = {
  probe: PointGrid;
  probeNormals: Float32Array;
};

function buildCrownSurface(geometry: THREE.BufferGeometry): CrownSurface | null {
  const positions = readPositions(geometry);
  if (!positions) return null;
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  const normals = readNormals(geometry);
  if (!normals || normals.length !== positions.length) return null;
  const sign = signedVolume(positions, geometry.index) < 0 ? -1 : 1;
  const voxel = 0.12;
  const seen = new Set<number>();
  const pts: number[] = [];
  const nrm: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    const key =
      (Math.floor(positions[i]! / voxel) + 4096) * 67108864 +
      (Math.floor(positions[i + 1]! / voxel) + 4096) * 8192 +
      (Math.floor(positions[i + 2]! / voxel) + 4096);
    if (seen.has(key)) continue;
    seen.add(key);
    pts.push(positions[i]!, positions[i + 1]!, positions[i + 2]!);
    nrm.push(normals[i]! * sign, normals[i + 1]! * sign, normals[i + 2]! * sign);
  }
  const probePts = new Float32Array(pts);
  return {
    probe: new PointGrid(probePts, 0.6),
    probeNormals: new Float32Array(nrm),
  };
}

/**
 * 좌석의 캐비티 방향(마진 → 지붕)과 마진 높이. 축 가까이의 보철 점은 지붕·교합면이라 그쪽이 막힌 쪽이다.
 */
function seatCavity(
  positions: Float32Array,
  seat: ProsthesisSeat,
  insertAxis: 0 | 1 | 2,
): { roofSign: 1 | -1; margin: number } | null {
  const [a0, a1] = radialAxes(insertAxis);
  const c0 = seat.center.getComponent(a0);
  const c1 = seat.center.getComponent(a1);
  const cA = seat.center.getComponent(insertAxis);
  const coreR = seat.radius * 0.45;
  let above = 0;
  let below = 0;
  let wallMin = Infinity;
  let wallMax = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const r = Math.hypot(positions[i + a0]! - c0, positions[i + a1]! - c1);
    const t = positions[i + insertAxis]!;
    if (r < coreR) {
      if (t > cA) above += 1;
      else below += 1;
    } else if (r < seat.radius * 1.6) {
      wallMin = Math.min(wallMin, t);
      wallMax = Math.max(wallMax, t);
    }
  }
  if (above + below < 20 || !Number.isFinite(wallMin)) return null;
  const roofSign: 1 | -1 = above >= below ? 1 : -1;
  return { roofSign, margin: roofSign > 0 ? wallMin : wallMax };
}

function applyRot(r: Mat3, v: Vec3): Vec3 {
  return [
    r[0] * v[0] + r[1] * v[1] + r[2] * v[2],
    r[3] * v[0] + r[4] * v[1] + r[5] * v[2],
    r[6] * v[0] + r[7] * v[1] + r[8] * v[2],
  ];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot3(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function norm3(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

type IntaglioGrids = { coarse: PointGrid; mid: PointGrid; fine: PointGrid };

/**
 * 좌석 하나의 내면(벽·지붕). 외면·이웃 리테이너·연결부 밑면이 섞이면 ICP가 마진 쪽으로 끌려간다.
 * 벽은 축을 향하는 법선, 지붕은 마진(입구)을 향하는 법선이다.
 */
function intaglioGrids(
  crown: CrownSurface,
  seat: ProsthesisSeat,
  insertAxis: 0 | 1 | 2,
  cavity: { roofSign: 1 | -1; margin: number },
): IntaglioGrids | null {
  const [a0, a1] = radialAxes(insertAxis);
  const c0 = seat.center.getComponent(a0);
  const c1 = seat.center.getComponent(a1);
  const pts = crown.probe.points;
  const nrm = crown.probeNormals;
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 3) {
    const depth = (pts[i + insertAxis]! - cavity.margin) * cavity.roofSign;
    if (depth < -0.3 || depth > 12) continue;
    const d0 = pts[i + a0]! - c0;
    const d1 = pts[i + a1]! - c1;
    const r = Math.hypot(d0, d1);
    if (r > seat.radius * 1.5) continue;
    const towardAxis = r > 1e-6 ? -(nrm[i + a0]! * d0 + nrm[i + a1]! * d1) / r : 0;
    const towardOpening = -nrm[i + insertAxis]! * cavity.roofSign;
    const wall = r > seat.radius * 0.45 && towardAxis > 0.3;
    const roof = r < seat.radius * 1.1 && depth > 1 && towardOpening > 0.5;
    if (!wall && !roof) continue;
    out.push(pts[i]!, pts[i + 1]!, pts[i + 2]!);
  }
  if (out.length < 450) return null;
  const target = new Float32Array(out);
  return {
    coarse: new PointGrid(voxelDownsample(target, 0.28), 1.4),
    mid: new PointGrid(voxelDownsample(target, 0.14), 0.75),
    fine: new PointGrid(target, 0.4),
  };
}

/** u를 v로 보내는 최소 회전. */
function rotBetween(u: Vec3, v: Vec3): Mat3 {
  const a = norm3(u);
  const b = norm3(v);
  const c = dot3(a, b);
  if (c > 1 - 1e-9) return [...IDENTITY] as Mat3;
  if (c < -1 + 1e-9) {
    const ref: Vec3 = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    return rotAroundAxis(cross3(a, ref), Math.PI);
  }
  return rotAroundAxis(cross3(a, b), Math.acos(c));
}

function mulMat3(a: Mat3, b: Mat3): Mat3 {
  const out = new Array(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      out[i * 3 + j] =
        a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!;
    }
  }
  return out;
}

/** 어벗 외면 표본. 스크류 홀은 빼고, FL에서 포스트 쪽(postSign)만 남긴다. */
function sampleAbutPost(
  positions: Float32Array,
  ring: FinishRing,
  postSign: 1 | -1,
  max: number,
): { post: Float32Array; probe: Float32Array } {
  const [a0, a1] = radialAxes(ring.axis);
  const fl = ring.center.getComponent(ring.axis);
  const c0 = ring.center.getComponent(a0);
  const c1 = ring.center.getComponent(a1);
  const post: number[] = [];
  const probe: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    const r = Math.hypot(positions[i + a0]! - c0, positions[i + a1]! - c1);
    if (r < ring.radius * 0.5) continue;
    const along = (positions[i + ring.axis]! - fl) * postSign;
    if (along < -0.5) continue;
    probe.push(positions[i]!, positions[i + 1]!, positions[i + 2]!);
    if (along > 0.25) post.push(positions[i]!, positions[i + 1]!, positions[i + 2]!);
  }
  return {
    post: samplePoints(new Float32Array(post), max),
    probe: samplePoints(new Float32Array(probe), max),
  };
}

type SeatFit = {
  /** 포스트 표면 중 보철 내면에 닿은 비율. */
  coverage: number;
  /** 보철 재료 안으로 들어간 어벗 점 비율. */
  penetration: number;
  rmsMm: number;
  score: number;
};

const COVER_MM = 0.2;
const PENETRATE_MM = 0.08;

/**
 * 맞은 자리 판정. 바이트 맞춤의 coverage·side처럼, 포스트가 내면에 얼마나 닿는지와
 * 벽을 얼마나 뚫는지로 본다. RMS만 보면 외면이나 이웃 리테이너에 붙어도 작게 나온다.
 */
function scoreSeat(
  post: Float32Array,
  probe: Float32Array,
  pose: RigidPose,
  crown: CrownSurface,
): SeatFit {
  const grid = crown.probe;
  const pts = grid.points;
  let covered = 0;
  let sum = 0;
  for (let i = 0; i < post.length; i += 3) {
    const p = applyPose(pose, post[i]!, post[i + 1]!, post[i + 2]!);
    const j = grid.nearest(p[0], p[1], p[2], 0.6);
    if (j < 0) continue;
    const d = Math.hypot(pts[j * 3]! - p[0], pts[j * 3 + 1]! - p[1], pts[j * 3 + 2]! - p[2]);
    sum += d * d;
    if (d < COVER_MM) covered += 1;
  }
  let inside = 0;
  for (let i = 0; i < probe.length; i += 3) {
    const p = applyPose(pose, probe[i]!, probe[i + 1]!, probe[i + 2]!);
    const j = grid.nearest(p[0], p[1], p[2], 0.6);
    if (j < 0) continue;
    const n = crown.probeNormals;
    const side =
      (p[0] - pts[j * 3]!) * n[j * 3]! +
      (p[1] - pts[j * 3 + 1]!) * n[j * 3 + 1]! +
      (p[2] - pts[j * 3 + 2]!) * n[j * 3 + 2]!;
    if (side < -PENETRATE_MM) inside += 1;
  }
  const postN = Math.max(post.length / 3, 1);
  const coverage = covered / postN;
  const penetration = inside / Math.max(probe.length / 3, 1);
  const rmsMm = covered > 0 ? Math.sqrt(sum / postN) : Infinity;
  return { coverage, penetration, rmsMm, score: coverage - penetration * 3 };
}

type SeatHypothesis = {
  /** 같은 축·포스트 방향·좌석이면 같은 번호. 시드만 다르다. */
  group: number;
  seed: number;
  seat: ProsthesisSeat;
  insertAxis: 0 | 1 | 2;
  postSign: 1 | -1;
  post: Float32Array;
  probe: Float32Array;
  grids: IntaglioGrids;
  init: RigidPose;
};

/**
 * 바이트에 악궁을 붙일 때처럼 가능한 자세를 다 세워 본다.
 * 보철 삽입축(3축) × 어벗 포스트 방향(±) × 치식 좌석 × 축 회전 시드.
 * 맞춘 뒤 내면 덮임·관통으로 고른다.
 */
type AbutPosts = Record<1 | -1, { post: Float32Array; probe: Float32Array }>;

function seatHypotheses(
  posts: AbutPosts,
  crownGeometry: THREE.BufferGeometry,
  crownPos: Float32Array,
  crown: CrownSurface,
  ring: FinishRing,
  opts: AbutmentSeatPoseOptions | undefined,
  seeds: number,
): SeatHypothesis[] {
  if (!crownGeometry.boundingBox) crownGeometry.computeBoundingBox();
  const box = crownGeometry.boundingBox ?? boxOf(crownPos);
  const spanAxis = longestAxis(box.getSize(new THREE.Vector3()));
  const slot = toothSlot(opts);
  const bridge = slot ? slot.units > 1 : seatRegions(box, spanAxis).length > 1;
  const abutAxis = axisVec(ring.axis);
  const fl: Vec3 = [ring.center.x, ring.center.y, ring.center.z];
  const out: SeatHypothesis[] = [];
  let groupCount = 0;
  for (const insertAxis of AXIS_COMPONENTS) {
    if (bridge && insertAxis === spanAxis) continue;
    const seats = seatsForTooth(
      findProsthesisSeats(crownGeometry, ring.radius, insertAxis, slot?.units ?? 0),
      slot,
    );
    for (const seat of seats) {
      const cavity = seatCavity(crownPos, seat, insertAxis);
      if (!cavity) continue;
      const grids = intaglioGrids(crown, seat, insertAxis, cavity);
      if (!grids) continue;
      const roof = axisVec(insertAxis).map((v) => v * cavity.roofSign) as Vec3;
      const anchor = seat.center.clone().setComponent(insertAxis, cavity.margin);
      for (const postSign of [1, -1] as const) {
        const group = groupCount;
        groupCount += 1;
        const base = rotBetween(
          abutAxis.map((v) => v * postSign) as Vec3,
          roof,
        );
        for (let k = 0; k < seeds; k += 1) {
          const r = mulMat3(rotAroundAxis(roof, (k / seeds) * Math.PI * 2), base);
          const rf = applyRot(r, fl);
          out.push({
            group,
            seed: k,
            seat,
            insertAxis,
            postSign,
            ...posts[postSign],
            grids,
            init: {
              r,
              t: [anchor.x - rf[0], anchor.y - rf[1], anchor.z - rf[2]],
            },
          });
        }
      }
    }
  }
  return out;
}

export type AbutmentSeatPoseOptions = {
  /** 어벗 파일 치식. 브리지에서 좌석 짝을 고를 때 쓴다. */
  abutTooth?: string;
  /** 보철 파일 치식(`46-47`). */
  crownTooth?: string;
};

/** 이 점수 아래면 어느 가설도 꽂힌 자리가 아니다. 원래 위치에 둔다. */
const MIN_SEAT_SCORE = 0.35;
const SEEDS = 12;
const POLISH_ROUNDS = 24;
/** 묶음을 거를 때 먼저 보는 시드 간격(12개 중 4개). */
const PROBE_SEED_STRIDE = 3;
const BASINS_PER_GROUP = 3;
const FINALISTS = 3;
/** 피니시라인 중심이 이보다 가까우면 같은 좌석이다. */
const SAME_SEAT_MM = 2.5;
/** 이 점수 이상이면 잘 맞은 자리. 모든 어벗이 여기 못 미치면 포스트 축 기준으로 다시 찾는다. */
const GOOD_SEAT_SCORE = 0.6;
/** 제자리(항등) 후보 가산점. 다듬은 후보가 잡음만큼 높아도 저장한 자리를 지킨다. */
const IDENTITY_BONUS = 0.05;
/** 좌석 배정에서 어벗마다 보는 후보 수. */
const MAX_ASSIGN_CANDIDATES = 5;
const GROUP_RMS_SLACK_MM = 0.25;
/** 이 시간마다 화면에 차례를 넘긴다. 진행 막대가 멈추지 않게. */
const YIELD_MS = 24;

/** 진행률 0~1. */
export type SeatProgress = (ratio: number) => void;

class Pacer {
  private last = performance.now();
  constructor(
    private readonly onProgress?: SeatProgress,
    private readonly cancelled?: () => boolean,
  ) {}

  async report(ratio: number) {
    if (this.cancelled?.()) throw new SeatCancelledError();
    this.onProgress?.(Math.min(1, Math.max(0, ratio)));
    if (performance.now() - this.last < YIELD_MS) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    this.last = performance.now();
    if (this.cancelled?.()) throw new SeatCancelledError();
  }
}

/** 같은 자리로 수렴한 자세. */
function samePose(a: RigidPose, b: RigidPose): boolean {
  const dt = Math.hypot(a.t[0] - b.t[0], a.t[1] - b.t[1], a.t[2] - b.t[2]);
  return dt < 0.6 && rotationGapDeg(a.r, b.r) < 10;
}

function rotationGapDeg(a: Mat3, b: Mat3): number {
  const trace =
    a[0] * b[0] + a[3] * b[3] + a[6] * b[6] +
    a[1] * b[1] + a[4] * b[4] + a[7] * b[7] +
    a[2] * b[2] + a[5] * b[5] + a[8] * b[8];
  return (Math.acos(Math.max(-1, Math.min(1, (trace - 1) / 2))) * 180) / Math.PI;
}

export type ProsthesisSeatAbutment = {
  geometry: THREE.BufferGeometry;
  /** 어벗 파일 치식. */
  tooth?: string;
};

/** 어벗↔보철 편차(mm·비율). 포스트 쪽 꼭짓점 기준. */
export type SeatDeviation = {
  /** 틈(+) 평균. */
  meanMm: number;
  /** 부호 거리 중앙값. */
  medianMm: number;
  /** |거리| 90%. */
  p90Mm: number;
  maxGapMm: number;
  maxPenetrationMm: number;
  /** 보철 내면에 0.2mm 안으로 닿은 비율. */
  contact: number;
  /** 보철 재료 안으로 들어간 비율. */
  penetration: number;
};

export type AbutmentSeat = {
  /** 어벗 메시 자세(어벗 로컬 → 보철 파일 좌표). 이미 제자리면 null. */
  pose: AbutmentSeatPose | null;
  deviation: SeatDeviation;
  /** 꼭짓점별 보철 표면까지 부호 거리(mm). +는 틈, −는 관통, 멀면 NaN. */
  vertexDistances: Float32Array;
};

export type ProsthesisSeatResult = {
  /** 어벗별 결과. 좌석을 못 찾은 어벗은 null(파일 좌표 그대로). */
  abutments: Array<AbutmentSeat | null>;
};

type CrownSeatEntry = {
  abuts: THREE.BufferGeometry[];
  key: string;
  promise: Promise<ProsthesisSeatResult | null>;
  done?: ProsthesisSeatResult | null;
};

const CROWN_SEAT_CACHE = new WeakMap<THREE.BufferGeometry, CrownSeatEntry[]>();

function clonePose(pose: AbutmentSeatPose | null): AbutmentSeatPose | null {
  return pose ? { position: pose.position.clone(), quaternion: pose.quaternion.clone() } : null;
}

function cloneResult(result: ProsthesisSeatResult | null): ProsthesisSeatResult | null {
  return result
    ? {
        abutments: result.abutments.map((a) =>
          a ? { ...a, pose: clonePose(a.pose), deviation: { ...a.deviation } } : null,
        ),
      }
    : null;
}

function crownSeatKey(abutments: ProsthesisSeatAbutment[], crownTooth: string) {
  return `${crownTooth}|${abutments.map((a) => a.tooth ?? "").join(",")}`;
}

function findCrownSeatEntry(
  crownGeometry: THREE.BufferGeometry,
  abutments: ProsthesisSeatAbutment[],
  crownTooth: string,
): CrownSeatEntry | undefined {
  const key = crownSeatKey(abutments, crownTooth);
  return CROWN_SEAT_CACHE.get(crownGeometry)?.find(
    (e) =>
      e.key === key &&
      e.abuts.length === abutments.length &&
      e.abuts.every((g, i) => g === abutments[i]!.geometry),
  );
}

function dropCrownSeatEntry(
  crownGeometry: THREE.BufferGeometry,
  abutments: ProsthesisSeatAbutment[],
  crownTooth: string,
) {
  const list = CROWN_SEAT_CACHE.get(crownGeometry);
  if (!list) return;
  const key = crownSeatKey(abutments, crownTooth);
  const next = list.filter(
    (e) =>
      !(
        e.key === key &&
        e.abuts.length === abutments.length &&
        e.abuts.every((g, i) => g === abutments[i]!.geometry)
      ),
  );
  if (next.length === 0) CROWN_SEAT_CACHE.delete(crownGeometry);
  else CROWN_SEAT_CACHE.set(crownGeometry, next);
}

/** 이미 맞춘 결과. 아직 안 맞췄거나 맞추는 중이면 undefined. */
export function peekAbutmentSeats(
  crownGeometry: THREE.BufferGeometry,
  abutments: ProsthesisSeatAbutment[],
  crownTooth = "",
): ProsthesisSeatResult | null | undefined {
  const entry = findCrownSeatEntry(crownGeometry, abutments, crownTooth);
  if (!entry || entry.done === undefined) return undefined;
  return cloneResult(entry.done);
}

/**
 * 어벗을 보철에 꽂는다. 보철 파일 좌표는 그대로 두고 어벗만 옮긴다.
 * 짝 어벗이 여럿(브리지)이면 좌석을 나눠 배정한다. 어느 좌석에도 맞지 않으면 null.
 * cancelled가 true가 되면 SeatCancelledError로 멈추고 캐시에 남기지 않는다.
 */
export function computeAbutmentSeats(
  crownGeometry: THREE.BufferGeometry,
  abutments: ProsthesisSeatAbutment[],
  crownTooth = "",
  onProgress?: SeatProgress,
  cancelled?: () => boolean,
): Promise<ProsthesisSeatResult | null> {
  const found = findCrownSeatEntry(crownGeometry, abutments, crownTooth);
  if (found) return found.promise.then(cloneResult);
  const entry: CrownSeatEntry = {
    abuts: abutments.map((a) => a.geometry),
    key: crownSeatKey(abutments, crownTooth),
    promise: solveAbutmentSeats(crownGeometry, abutments, crownTooth, onProgress, cancelled).then(
      (result) => {
        entry.done = result;
        return result;
      },
      (error) => {
        if (isSeatCancelled(error)) {
          dropCrownSeatEntry(crownGeometry, abutments, crownTooth);
          throw error;
        }
        entry.done = null;
        return null;
      },
    ),
  };
  const list = CROWN_SEAT_CACHE.get(crownGeometry) ?? [];
  list.push(entry);
  CROWN_SEAT_CACHE.set(crownGeometry, list);
  return entry.promise.then(cloneResult);
}

/**
 * 좌석 점수를 직접 올리는 국소 탐색. 회전(축 셋)·이동(축 셋)을 조금씩 흔들어 나아지면 받고,
 * 더 못 나아지면 보폭을 줄인다.
 */
function polishSeat(
  h: { post: Float32Array; probe: Float32Array },
  pose: RigidPose,
  fit: SeatFit,
  crown: CrownSurface,
): { pose: RigidPose; fit: SeatFit } {
  let cur = { pose, fit };
  let rotStep = (2 * Math.PI) / 180;
  let moveStep = 0.12;
  const axes: Vec3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let round = 0; round < POLISH_ROUNDS; round += 1) {
    let improved = false;
    // 회전은 FL 근처(포스트 뿌리)를 중심으로 돌려야 이동과 섞이지 않는다.
    const pivot = applyPose(cur.pose, ...centroid3(h.post));
    for (const axis of axes) {
      for (const sign of [1, -1]) {
        const dr = rotAroundAxis(axis, rotStep * sign);
        const r = mulMat3(dr, cur.pose.r);
        const pr = applyRot(dr, [
          cur.pose.t[0] - pivot[0],
          cur.pose.t[1] - pivot[1],
          cur.pose.t[2] - pivot[2],
        ]);
        const tryPose: RigidPose = { r, t: [pr[0] + pivot[0], pr[1] + pivot[1], pr[2] + pivot[2]] };
        const next = scoreSeat(h.post, h.probe, tryPose, crown);
        if (next.score > cur.fit.score + 1e-4) {
          cur = { pose: tryPose, fit: next };
          improved = true;
        }
      }
    }
    for (const axis of axes) {
      for (const sign of [1, -1]) {
        const tryPose: RigidPose = {
          r: cur.pose.r,
          t: [
            cur.pose.t[0] + axis[0] * moveStep * sign,
            cur.pose.t[1] + axis[1] * moveStep * sign,
            cur.pose.t[2] + axis[2] * moveStep * sign,
          ],
        };
        const next = scoreSeat(h.post, h.probe, tryPose, crown);
        if (next.score > cur.fit.score + 1e-4) {
          cur = { pose: tryPose, fit: next };
          improved = true;
        }
      }
    }
    if (!improved) {
      rotStep /= 2;
      moveStep /= 2;
      if (moveStep < 0.01) break;
    }
  }
  return cur;
}

function centroid3(points: Float32Array): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  const n = Math.max(points.length / 3, 1);
  for (let i = 0; i < points.length; i += 3) {
    x += points[i]!;
    y += points[i + 1]!;
    z += points[i + 2]!;
  }
  return [x / n, y / n, z / n];
}

type AbutCandidate = {
  pose: RigidPose;
  fit: SeatFit;
  /** 어벗 피니시라인 중심이 놓인 보철 좌표. 좌석 구분에 쓴다. */
  fl: Vec3;
};

/**
 * 어벗 하나를 보철에 꽂는 자세 후보(어벗 좌표 → 보철 좌표). 점수 높은 순.
 * pace(0~1)로 진행을 알리고 틈틈이 화면에 차례를 넘긴다.
 */
async function abutmentCandidates(
  abutGeometry: THREE.BufferGeometry,
  crownGeometry: THREE.BufferGeometry,
  crownPos: Float32Array,
  crown: CrownSurface,
  opts: AbutmentSeatPoseOptions,
  pace: (ratio: number) => Promise<void>,
): Promise<{ posts: AbutPosts; candidates: AbutCandidate[] } | null> {
  const ring = estimateAbutmentFinishRing(abutGeometry);
  const abutPos = readPositions(abutGeometry);
  if (!ring || !abutPos) return null;
  const posts: AbutPosts = {
    1: sampleAbutPost(abutPos, ring, 1, 500),
    [-1]: sampleAbutPost(abutPos, ring, -1, 500),
  };
  const hypotheses = seatHypotheses(posts, crownGeometry, crownPos, crown, ring, opts, SEEDS);
  if (hypotheses.length === 0) return null;

  type Coarse = { h: SeatHypothesis; pose: RigidPose; rmsMm: number; rank: number };
  let coarseDone = 0;
  const coarseFit = async (h: SeatHypothesis): Promise<Coarse> => {
    const fit = icp({
      model: samplePoints(h.post, 240),
      grid: h.grids.coarse,
      init: h.init,
      maxDist: 1.4,
      iterations: 12,
      topY: -1e9,
      trim: 0.8,
    });
    const pen = scoreSeat(h.post, h.probe, fit.pose, crown).penetration;
    coarseDone += 1;
    await pace((coarseDone / hypotheses.length) * 0.4);
    return { h, pose: fit.pose, rmsMm: fit.rmsMm, rank: fit.rmsMm + pen };
  };

  // 거친 RMS는 헐거운(큰) 좌석이 더 작게 나와, 전체 순위로 자르면 맞는 좌석이 밀린다.
  // 묶음(축·포스트 방향·좌석)마다 시드 몇 개로 먼저 보고, 축부터 틀린 묶음만 버린 뒤 나머지 시드를 돈다.
  const groups = new Map<number, Coarse[]>();
  for (const h of hypotheses) {
    if (h.seed % PROBE_SEED_STRIDE !== 0) continue;
    const list = groups.get(h.group) ?? [];
    list.push(await coarseFit(h));
    groups.set(h.group, list);
  }
  const groupBest = (list: Coarse[]) => Math.min(...list.map((r) => r.rmsMm));
  const floor = Math.min(...[...groups.values()].map(groupBest));
  for (const [group, list] of groups) {
    if (groupBest(list) > floor + GROUP_RMS_SLACK_MM) {
      groups.delete(group);
      continue;
    }
    for (const h of hypotheses) {
      if (h.group === group && h.seed % PROBE_SEED_STRIDE !== 0) list.push(await coarseFit(h));
    }
  }

  const basins: Coarse[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.rank - b.rank);
    const picked: Coarse[] = [];
    for (const row of list) {
      if (!picked.some((b) => samePose(b.pose, row.pose))) picked.push(row);
      if (picked.length >= BASINS_PER_GROUP) break;
    }
    basins.push(...picked);
  }

  const refined: Array<{ h: SeatHypothesis; pose: RigidPose; fit: SeatFit }> = [];
  for (const [k, start] of basins.entries()) {
    const mid = icp({
      model: start.h.post,
      grid: start.h.grids.mid,
      init: start.pose,
      maxDist: 0.75,
      iterations: 22,
      topY: -1e9,
      trim: 0.85,
    });
    const fine = icp({
      model: start.h.post,
      grid: start.h.grids.fine,
      init: mid.pose,
      maxDist: 0.4,
      iterations: 36,
      topY: -1e9,
      trim: 0.9,
    });
    refined.push({
      h: start.h,
      pose: fine.pose,
      fit: scoreSeat(start.h.post, start.h.probe, fine.pose, crown),
    });
    await pace(0.4 + ((k + 1) / basins.length) * 0.3);
  }
  refined.sort((a, b) => b.fit.score - a.fit.score);

  // ICP는 거리만 줄이고 관통은 벌하지 않는다. 상위 몇 개를 점수(덮임 − 관통)로 직접 다듬어 가른다.
  // 브리지는 어벗끼리 좌석을 나눠야 하니, 좌석마다 가장 나은 자세도 하나씩 남긴다.
  const fl: Vec3 = [ring.center.x, ring.center.y, ring.center.z];
  const flOf = (pose: RigidPose) => applyPose(pose, fl[0], fl[1], fl[2]);
  const finalists: typeof refined = [];
  for (const row of refined) {
    if (finalists.some((f) => samePose(f.pose, row.pose))) continue;
    finalists.push(row);
    if (finalists.length >= FINALISTS) break;
  }
  for (const row of refined) {
    const at = flOf(row.pose);
    const seatTaken = finalists.some((f) => dist3(flOf(f.pose), at) < SAME_SEAT_MM);
    if (!seatTaken && row.fit.score >= MIN_SEAT_SCORE) finalists.push(row);
  }
  const candidates: AbutCandidate[] = [];
  for (const [k, start] of finalists.entries()) {
    const polished = polishSeat(start.h, start.pose, start.fit, crown);
    candidates.push({ ...polished, fl: flOf(polished.pose) });
    await pace(0.7 + ((k + 1) / finalists.length) * 0.3);
  }
  candidates.sort((a, b) => b.fit.score - a.fit.score);
  return { posts, candidates };
}

function dist3(a: Vec3, b: Vec3) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function rigidToMatrix(pose: RigidPose): THREE.Matrix4 {
  const { position, quaternion } = rigidToThree(pose);
  return new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1));
}

function matrixToPose(matrix: THREE.Matrix4): AbutmentSeatPose {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  matrix.decompose(position, quaternion, new THREE.Vector3());
  return { position, quaternion };
}

/** 치식 순서. 브리지 라벨에 없는 어벗은 뒤로. */
function toothOrder(abutments: ProsthesisSeatAbutment[], crownTooth: string): number[] {
  const teeth = expandToothLabel(crownTooth);
  const rank = (i: number) => {
    const at = teeth.indexOf(String(abutments[i]!.tooth || "").trim());
    return at < 0 ? teeth.length + i : at;
  };
  return abutments.map((_, i) => i).sort((a, b) => rank(a) - rank(b));
}

/**
 * 어벗마다 후보 하나씩(또는 없음) 골라 점수 합이 가장 큰 배정. 두 어벗이 한 좌석에 들어가면 안 된다.
 */
function assignSeats(lists: AbutCandidate[][]): Array<AbutCandidate | null> {
  let best: { total: number; picks: Array<AbutCandidate | null> } = {
    total: -Infinity,
    picks: lists.map(() => null),
  };
  const picks: Array<AbutCandidate | null> = [];
  const walk = (i: number, total: number) => {
    if (i === lists.length) {
      if (total > best.total) best = { total, picks: [...picks] };
      return;
    }
    for (const c of lists[i]!) {
      if (picks.some((p) => p && dist3(p.fl, c.fl) < SAME_SEAT_MM)) continue;
      picks.push(c);
      walk(i + 1, total + c.fit.score);
      picks.pop();
    }
    picks.push(null);
    walk(i + 1, total);
    picks.pop();
  };
  walk(0, 0);
  return best.picks;
}

function transpose3(m: Mat3): Mat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

/**
 * 보철을 좌석 찾기에 맞는 자세로 돌리는 회전(행 = 새 x·y·z). z는 삽입축, x는 그에 수직인 면에서
 * 보철이 가장 긴 방향(브리지 스팬)이다.
 */
function canonicalFrame(positions: Float32Array, insertAxis: Vec3): Mat3 {
  const z = norm3(insertAxis);
  const ref: Vec3 = Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = norm3(cross3(z, ref));
  const v = cross3(z, u);
  let su = 0;
  let sv = 0;
  const n = positions.length / 3;
  for (let i = 0; i < positions.length; i += 3) {
    const p: Vec3 = [positions[i]!, positions[i + 1]!, positions[i + 2]!];
    su += dot3(p, u);
    sv += dot3(p, v);
  }
  su /= n;
  sv /= n;
  let cuu = 0;
  let cvv = 0;
  let cuv = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const p: Vec3 = [positions[i]!, positions[i + 1]!, positions[i + 2]!];
    const a = dot3(p, u) - su;
    const b = dot3(p, v) - sv;
    cuu += a * a;
    cvv += b * b;
    cuv += a * b;
  }
  const theta = 0.5 * Math.atan2(2 * cuv, cuu - cvv);
  const x = norm3([
    u[0] * Math.cos(theta) + v[0] * Math.sin(theta),
    u[1] * Math.cos(theta) + v[1] * Math.sin(theta),
    u[2] * Math.cos(theta) + v[2] * Math.sin(theta),
  ]);
  const y = cross3(z, x);
  return [x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2]];
}

const IDENTITY_POSE: RigidPose = { r: IDENTITY, t: [0, 0, 0] };

/** 3×3 대칭 행렬에서 가장 작은 고윳값의 고유벡터(야코비). */
function smallestEigenvector(m: number[][]): Vec3 {
  const a = m.map((row) => [...row]);
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 24; sweep += 1) {
    let off = 0;
    for (let p = 0; p < 3; p += 1) for (let q = p + 1; q < 3; q += 1) off += a[p]![q]! ** 2;
    if (off < 1e-14) break;
    for (let p = 0; p < 3; p += 1) {
      for (let q = p + 1; q < 3; q += 1) {
        if (Math.abs(a[p]![q]!) < 1e-15) continue;
        const theta = (a[q]![q]! - a[p]![p]!) / (2 * a[p]![q]!);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const sn = t * c;
        for (let k = 0; k < 3; k += 1) {
          const akp = a[k]![p]!;
          const akq = a[k]![q]!;
          a[k]![p] = c * akp - sn * akq;
          a[k]![q] = sn * akp + c * akq;
        }
        for (let k = 0; k < 3; k += 1) {
          const apk = a[p]![k]!;
          const aqk = a[q]![k]!;
          a[p]![k] = c * apk - sn * aqk;
          a[q]![k] = sn * apk + c * aqk;
        }
        for (let k = 0; k < 3; k += 1) {
          const vkp = v[k]![p]!;
          const vkq = v[k]![q]!;
          v[k]![p] = c * vkp - sn * vkq;
          v[k]![q] = sn * vkp + c * vkq;
        }
      }
    }
  }
  let min = 0;
  for (let i = 1; i < 3; i += 1) if (a[i]![i]! < a[min]![min]!) min = i;
  return norm3([v[0]![min]!, v[1]![min]!, v[2]![min]!]);
}

type MeasuredSeat = {
  fit: SeatFit;
  fl: Vec3;
  /** 그 리테이너 내면 벽에서 잰 삽입축(보철 좌표). */
  cavityAxis: Vec3;
};

/**
 * 어벗을 pose로 보철에 댔을 때의 맞춤과, 포스트에 닿은 보철 내면 벽 법선으로 잰 삽입축.
 * 벽 법선은 삽입축에 수직이다. 잘 맞지 않으면 null.
 */
function measureSeat(
  abutGeometry: THREE.BufferGeometry,
  crown: CrownSurface,
  pose: RigidPose,
): MeasuredSeat | null {
  const ring = estimateAbutmentFinishRing(abutGeometry);
  const pos = readPositions(abutGeometry);
  if (!ring || !pos) return null;
  let best: { sign: 1 | -1; fit: SeatFit } | null = null;
  for (const sign of [1, -1] as const) {
    const { post, probe } = sampleAbutPost(pos, ring, sign, 500);
    const fit = scoreSeat(post, probe, pose, crown);
    if (!best || fit.score > best.fit.score) best = { sign, fit };
  }
  if (!best || best.fit.score < MIN_SEAT_SCORE) return null;

  const local = sampleAbutPost(pos, ring, best.sign, 6000).post;
  const post = new Float32Array(local.length);
  for (let i = 0; i < local.length; i += 3) {
    post.set(applyPose(pose, local[i]!, local[i + 1]!, local[i + 2]!), i);
  }
  const fl = applyPose(pose, ring.center.x, ring.center.y, ring.center.z);
  const postGrid = new PointGrid(post, 0.5);
  const pts = crown.probe.points;
  const nrm = crown.probeNormals;
  const touching: Vec3[] = [];
  for (let i = 0; i < pts.length; i += 3) {
    if (postGrid.nearest(pts[i]!, pts[i + 1]!, pts[i + 2]!, 0.35) < 0) continue;
    touching.push([nrm[i]!, nrm[i + 1]!, nrm[i + 2]!]);
  }
  if (touching.length < 60) return null;
  const c = centroid3(post);
  let axis = norm3([c[0] - fl[0], c[1] - fl[1], c[2] - fl[2]]);
  for (let iter = 0; iter < 5; iter += 1) {
    const m = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    let n = 0;
    for (const v of touching) {
      if (Math.abs(dot3(v, axis)) > 0.7) continue;
      for (let r = 0; r < 3; r += 1) for (let k = 0; k < 3; k += 1) m[r]![k] += v[r]! * v[k]!;
      n += 1;
    }
    if (n < 40) break;
    const next = smallestEigenvector(m);
    axis = dot3(next, axis) < 0 ? (next.map((x) => -x) as Vec3) : next;
  }
  return { fit: best.fit, fl, cavityAxis: axis };
}

async function solveAbutmentSeats(
  crownGeometry: THREE.BufferGeometry,
  abutments: ProsthesisSeatAbutment[],
  crownTooth: string,
  onProgress?: SeatProgress,
  cancelled?: () => boolean,
): Promise<ProsthesisSeatResult | null> {
  const crownPos = readPositions(crownGeometry);
  if (!crownPos || abutments.length === 0) return null;
  const crown = buildCrownSurface(crownGeometry);
  if (!crown) return null;
  const pacer = new Pacer(onProgress, cancelled);
  await pacer.report(0);

  const lists: AbutCandidate[][] = abutments.map(() => []);
  const runPass = async (
    geometry: THREE.BufferGeometry,
    surface: CrownSurface,
    toCrown: Mat3 | null,
    from: number,
    to: number,
  ) => {
    const pos = readPositions(geometry)!;
    const share = (to - from) / abutments.length;
    for (const [i, abut] of abutments.entries()) {
      const result = await abutmentCandidates(
        abut.geometry,
        geometry,
        pos,
        surface,
        { abutTooth: abut.tooth, crownTooth },
        (ratio) => pacer.report(from + share * (i + ratio)),
      );
      for (const c of result?.candidates ?? []) {
        if (c.fit.score < MIN_SEAT_SCORE) continue;
        lists[i]!.push(
          toCrown
            ? {
                pose: {
                  r: mulMat3(toCrown, c.pose.r),
                  t: applyRot(toCrown, c.pose.t),
                },
                fit: c.fit,
                fl: applyRot(toCrown, c.fl),
              }
            : c,
        );
      }
    }
  };

  // 좌석 찾기는 보철 삽입축이 파일 축과 나란할 때 가장 잘 맞는다. 기공소 원본은 대개 나란하지만 조금씩 기울고,
  // 어벗에 맞춰 저장한 보철은 어벗 좌표라 더 기운다. 그래서 한 번 찾은 자리에서 내면 벽으로 삽입축을 재고,
  // 그 축을 z로 돌린 보철에서 다시 찾는다. 저장한 보철이면 기준 어벗은 제자리(항등)에 꽂혀 있다.
  const order = toothOrder(abutments, crownTooth);
  let reference: MeasuredSeat | null = null;
  for (const i of order) {
    const atIdentity = measureSeat(abutments[i]!.geometry, crown, IDENTITY_POSE);
    if (!atIdentity || atIdentity.fit.score < GOOD_SEAT_SCORE) continue;
    lists[i]!.push({
      pose: IDENTITY_POSE,
      fit: { ...atIdentity.fit, score: atIdentity.fit.score + IDENTITY_BONUS },
      fl: atIdentity.fl,
    });
    reference ??= atIdentity;
  }
  await runPass(crownGeometry, crown, null, 0, 0.5);
  for (const i of order) {
    if (reference) break;
    const best = lists[i]![0] && [...lists[i]!].sort((a, b) => b.fit.score - a.fit.score)[0];
    if (best) reference = measureSeat(abutments[i]!.geometry, crown, best.pose);
  }
  if (reference) {
    const toCanon = canonicalFrame(crownPos, reference.cavityAxis);
    const rotated = crownGeometry.clone();
    rotated.applyMatrix4(
      new THREE.Matrix4().set(
        toCanon[0], toCanon[1], toCanon[2], 0,
        toCanon[3], toCanon[4], toCanon[5], 0,
        toCanon[6], toCanon[7], toCanon[8], 0,
        0, 0, 0, 1,
      ),
    );
    rotated.computeBoundingBox();
    const rotatedSurface = buildCrownSurface(rotated);
    if (rotatedSurface) {
      await runPass(rotated, rotatedSurface, transpose3(toCanon), 0.5, 1);
    }
    rotated.dispose();
  }
  for (const list of lists) {
    list.sort((a, b) => b.fit.score - a.fit.score);
    list.splice(MAX_ASSIGN_CANDIDATES);
  }
  await pacer.report(1);
  const picks = assignSeats(lists);
  if (!picks.some(Boolean)) return null;
  return {
    abutments: picks.map((pick, i) => {
      if (!pick) return null;
      const toCrown = rigidToThree(pick.pose);
      const angleDeg = (toCrown.quaternion.angleTo(new THREE.Quaternion()) * 180) / Math.PI;
      const inPlace = toCrown.position.length() < ALREADY_SEATED_MM && angleDeg < ALREADY_SEATED_DEG;
      const pose = inPlace ? IDENTITY_POSE : pick.pose;
      const measured = seatDeviation(abutments[i]!.geometry, crown, pose);
      if (!measured) return null;
      return { pose: inPlace ? null : toCrown, ...measured };
    }),
  };
}

/**
 * 어벗을 pose로 댔을 때 꼭짓점마다 보철 표면까지 부호 거리(점-면). 통계는 포스트 쪽 꼭짓점만 본다.
 */
function seatDeviation(
  abutGeometry: THREE.BufferGeometry,
  crown: CrownSurface,
  pose: RigidPose,
): { deviation: SeatDeviation; vertexDistances: Float32Array } | null {
  const ring = estimateAbutmentFinishRing(abutGeometry);
  const pos = readPositions(abutGeometry);
  if (!ring || !pos) return null;
  let sign: 1 | -1 = 1;
  let bestScore = -Infinity;
  for (const s of [1, -1] as const) {
    const { post, probe } = sampleAbutPost(pos, ring, s, 500);
    const { score } = scoreSeat(post, probe, pose, crown);
    if (score > bestScore) {
      bestScore = score;
      sign = s;
    }
  }
  const [a0, a1] = radialAxes(ring.axis);
  const flA = ring.center.getComponent(ring.axis);
  const c0 = ring.center.getComponent(a0);
  const c1 = ring.center.getComponent(a1);
  const pts = crown.probe.points;
  const nrm = crown.probeNormals;
  const distances = new Float32Array(pos.length / 3).fill(Number.NaN);
  const post: number[] = [];
  let postTotal = 0;
  let contact = 0;
  let inside = 0;
  for (let i = 0, v = 0; i < pos.length; i += 3, v += 1) {
    const p = applyPose(pose, pos[i]!, pos[i + 1]!, pos[i + 2]!);
    const j = crown.probe.nearest(p[0], p[1], p[2], 0.6);
    const isPost =
      (pos[i + ring.axis]! - flA) * sign > 0.25 &&
      Math.hypot(pos[i + a0]! - c0, pos[i + a1]! - c1) >= ring.radius * 0.5;
    if (isPost) postTotal += 1;
    if (j < 0) continue;
    const d =
      (p[0] - pts[j * 3]!) * nrm[j * 3]! +
      (p[1] - pts[j * 3 + 1]!) * nrm[j * 3 + 1]! +
      (p[2] - pts[j * 3 + 2]!) * nrm[j * 3 + 2]!;
    distances[v] = d;
    if (!isPost) continue;
    post.push(d);
    if (Math.abs(d) < COVER_MM) contact += 1;
    if (d < -PENETRATE_MM) inside += 1;
  }
  if (post.length === 0) return null;
  const sorted = [...post].sort((x, y) => x - y);
  const abs = post.map(Math.abs).sort((x, y) => x - y);
  const gaps = post.filter((d) => d > 0);
  return {
    vertexDistances: distances,
    deviation: {
      meanMm: gaps.length ? gaps.reduce((x, y) => x + y, 0) / gaps.length : 0,
      medianMm: sorted[Math.floor(sorted.length / 2)]!,
      p90Mm: abs[Math.floor(abs.length * 0.9)]!,
      maxGapMm: Math.max(0, sorted[sorted.length - 1]!),
      maxPenetrationMm: Math.max(0, -sorted[0]!),
      contact: contact / Math.max(postTotal, 1),
      penetration: inside / Math.max(postTotal, 1),
    },
  };
}

/** 자세를 행 우선 4×4로. 서버·뷰어가 메시 좌표에 그대로 곱한다. */
export function rowMajorToSeatPose(matrix: readonly number[]): AbutmentSeatPose {
  const m = new THREE.Matrix4().fromArray(matrix as number[]).transpose();
  return matrixToPose(m);
}

/** 자세 → 행 우선 4×4. */
export function seatPoseToRowMajor(pose: AbutmentSeatPose): number[] {
  const m = new THREE.Matrix4().compose(pose.position, pose.quaternion, new THREE.Vector3(1, 1, 1));
  return m.clone().transpose().toArray();
}

/** 파일명의 치식 토큰. 브리지는 `46-47`. */
export function toothLabelFromMeshName(name: string): string {
  return String(parseFilename(name || "").tooth || "").trim();
}

/** 어벗 치식이 보철 치식(단일·브리지 범위)에 포함되면 true. */
export function toothLabelsOverlap(abutLabel: string, crownLabel: string): boolean {
  const a = abutLabel.trim();
  const c = crownLabel.trim();
  if (!a || !c) return false;
  const crown = new Set(expandToothLabel(c));
  return expandToothLabel(a).some((t) => crown.has(t));
}
