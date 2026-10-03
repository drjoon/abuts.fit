// 어벗을 보철(크라운·브리지)에 꽂는다.
// 바이트에 악궁을 붙이듯 자세 가설(보철 삽입축·포스트 방향·치식 좌석·축 회전)을 세우고,
// 각각 trimmed ICP로 맞춘 뒤 포스트가 내면에 닿고 벽을 뚫지 않는 자세를 고른다.
// related files:
// - web/frontend/src/shared/share/CaseLayerViewer.tsx
// - web/frontend/src/shared/practice/scanbodyRegistration.ts
// - web/frontend/src/shared/practice/biteRegistration.ts
// - web/frontend/src/shared/filename/parseFilename.ts
// change-log:
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

/** 어벗 메시 로컬 → 보철 좌표 seating 자세. */
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
function seatHypotheses(
  abutPos: Float32Array,
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
  const posts = {
    1: sampleAbutPost(abutPos, ring, 1, 500),
    [-1]: sampleAbutPost(abutPos, ring, -1, 500),
  } as Record<1 | -1, { post: Float32Array; probe: Float32Array }>;
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

const SEAT_POSE_CACHE = new WeakMap<
  THREE.BufferGeometry,
  WeakMap<THREE.BufferGeometry, Map<string, AbutmentSeatPose | null>>
>();

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
const GROUP_RMS_SLACK_MM = 0.25;

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

/**
 * 어벗을 보철 좌석에 꽂을 자세(회전+이동). 이미 맞거나 맞는 자리를 못 찾으면 null.
 * 메시 로컬(위치·회전 0) 기준. world = R · p + t
 */
export function computeAbutmentSeatPose(
  abutGeometry: THREE.BufferGeometry,
  crownGeometry: THREE.BufferGeometry,
  opts?: AbutmentSeatPoseOptions,
): AbutmentSeatPose | null {
  const cacheKey = `${opts?.abutTooth ?? ""}|${opts?.crownTooth ?? ""}`;
  const cached = SEAT_POSE_CACHE.get(abutGeometry)?.get(crownGeometry)?.get(cacheKey);
  if (cached !== undefined) {
    return cached
      ? { position: cached.position.clone(), quaternion: cached.quaternion.clone() }
      : null;
  }
  const pose = solveSeatPose(abutGeometry, crownGeometry, opts);
  rememberSeatPose(abutGeometry, crownGeometry, cacheKey, pose);
  return pose
    ? { position: pose.position.clone(), quaternion: pose.quaternion.clone() }
    : null;
}

/**
 * 좌석 점수를 직접 올리는 국소 탐색. 회전(축 셋)·이동(축 셋)을 조금씩 흔들어 나아지면 받고,
 * 더 못 나아지면 보폭을 줄인다.
 */
function polishSeat(
  h: SeatHypothesis,
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

function solveSeatPose(
  abutGeometry: THREE.BufferGeometry,
  crownGeometry: THREE.BufferGeometry,
  opts?: AbutmentSeatPoseOptions,
): AbutmentSeatPose | null {
  const ring = estimateAbutmentFinishRing(abutGeometry);
  const abutPos = readPositions(abutGeometry);
  const crownPos = readPositions(crownGeometry);
  if (!ring || !abutPos || !crownPos) return null;
  const crown = buildCrownSurface(crownGeometry);
  if (!crown) return null;
  const hypotheses = seatHypotheses(abutPos, crownGeometry, crownPos, crown, ring, opts, SEEDS);
  if (hypotheses.length === 0) return null;

  type Coarse = { h: SeatHypothesis; pose: RigidPose; rmsMm: number; rank: number };
  const coarseFit = (h: SeatHypothesis): Coarse => {
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
    return { h, pose: fit.pose, rmsMm: fit.rmsMm, rank: fit.rmsMm + pen };
  };

  // 거친 RMS는 헐거운(큰) 좌석이 더 작게 나와, 전체 순위로 자르면 맞는 좌석이 밀린다.
  // 묶음(축·포스트 방향·좌석)마다 시드 몇 개로 먼저 보고, 축부터 틀린 묶음만 버린 뒤 나머지 시드를 돈다.
  const groups = new Map<number, Coarse[]>();
  for (const h of hypotheses) {
    if (h.seed % PROBE_SEED_STRIDE !== 0) continue;
    const list = groups.get(h.group) ?? [];
    list.push(coarseFit(h));
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
      if (h.group === group && h.seed % PROBE_SEED_STRIDE !== 0) list.push(coarseFit(h));
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

  const refined = basins.map((start) => {
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
    return { h: start.h, pose: fine.pose, fit: scoreSeat(start.h.post, start.h.probe, fine.pose, crown) };
  });
  refined.sort((a, b) => b.fit.score - a.fit.score);

  // ICP는 거리만 줄이고 관통은 벌하지 않는다. 상위 둘을 점수(덮임 − 관통)로 직접 다듬어 가른다.
  const finalists: typeof refined = [];
  for (const row of refined) {
    if (finalists.some((f) => samePose(f.pose, row.pose))) continue;
    finalists.push(row);
    if (finalists.length >= FINALISTS) break;
  }
  let best: { pose: RigidPose; fit: SeatFit } | null = null;
  for (const start of finalists) {
    const polished = polishSeat(start.h, start.pose, start.fit, crown);
    if (!best || polished.fit.score > best.fit.score) best = polished;
  }
  if (!best || best.fit.score < MIN_SEAT_SCORE) return null;

  const pose = rigidToThree(best.pose);
  const angleDeg = (pose.quaternion.angleTo(new THREE.Quaternion()) * 180) / Math.PI;
  if (pose.position.length() < ALREADY_SEATED_MM && angleDeg < ALREADY_SEATED_DEG) return null;
  return pose;
}

function rememberSeatPose(
  abutGeometry: THREE.BufferGeometry,
  crownGeometry: THREE.BufferGeometry,
  key: string,
  pose: AbutmentSeatPose | null,
) {
  let byCrown = SEAT_POSE_CACHE.get(abutGeometry);
  if (!byCrown) {
    byCrown = new WeakMap();
    SEAT_POSE_CACHE.set(abutGeometry, byCrown);
  }
  let byKey = byCrown.get(crownGeometry);
  if (!byKey) {
    byKey = new Map();
    byCrown.set(crownGeometry, byKey);
  }
  byKey.set(
    key,
    pose ? { position: pose.position.clone(), quaternion: pose.quaternion.clone() } : null,
  );
}

/** @deprecated seating은 computeAbutmentSeatPose 사용. */
export function computeAbutmentSeatOffset(
  abutGeometry: THREE.BufferGeometry,
  crownGeometry: THREE.BufferGeometry,
): THREE.Vector3 | null {
  return computeAbutmentSeatPose(abutGeometry, crownGeometry)?.position ?? null;
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
