// 어벗을 보철(크라운·브리지)에 꽂는다.
// FL·좌석으로 대략 옮긴 뒤, 작업스캔/스캔바디와 같은 trimmed ICP(bestRigid)로 강체 맞춤.
// related files:
// - web/frontend/src/shared/share/CaseLayerViewer.tsx
// - web/frontend/src/shared/practice/scanbodyRegistration.ts
// - web/frontend/src/shared/practice/biteRegistration.ts
// - web/frontend/src/shared/filename/parseFilename.ts
// change-log:
// - 2026-10-03: seating을 스캔바디 ICP 파이프라인으로 교체(삽입축 시드 + trimmed ICP).
// - 2026-10-03: 삽입축 회전 — 어벗 외면↔보철 내면 맞춤(주) + FL 링 위상(보조).
// - 2026-10-03: FL 링 방위각 프로파일로 삽입축 회전까지 맞춘다.
// - 2026-10-03: 뷰어용 — 어벗 FL 링 ↔ 보철 내면 좌석 중심을 맞춰 꽂는다(회전 없음).
import * as THREE from "three";
import { parseFilename } from "@/shared/filename/parseFilename";
import {
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

function seatRegions(box: THREE.Box3, spanAxis: 0 | 1 | 2): Region[] {
  const size = box.getSize(new THREE.Vector3());
  const long = size.getComponent(spanAxis);
  const other = Math.max(
    ...AXIS_COMPONENTS.filter((a) => a !== spanAxis).map((a) =>
      size.getComponent(a),
    ),
    1e-3,
  );
  const min = box.min.getComponent(spanAxis);
  const max = box.max.getComponent(spanAxis);
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
 * 보철 내면 좌석 — 축 밴드에서 중심을 향하는 법선 점들의 중앙 반경 링.
 */
export function findProsthesisSeats(
  geometry: THREE.BufferGeometry,
  targetRadius: number,
  insertAxis: 0 | 1 | 2,
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
  const regions = seatRegions(box, spanAxis);
  const seats: ProsthesisSeat[] = [];
  const bins = 36;

  for (const region of regions) {
    const axisMin = box.min.getComponent(insertAxis);
    const axisMax = box.max.getComponent(insertAxis);
    const span = Math.max(axisMax - axisMin, 1e-3);
    let best: ProsthesisSeat | null = null;

    for (let b = 0; b < bins; b += 1) {
      const t0 = axisMin + (span * b) / bins;
      const t1 = axisMin + (span * (b + 1)) / bins;
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (let i = 0; i < positions.length; i += 3) {
        const alongSpan = positions[i + spanAxis]!;
        if (alongSpan < region.min || alongSpan >= region.max) continue;
        const t = positions[i + insertAxis]!;
        if (t < t0 || t >= t1) continue;
        sx += positions[i + a0]!;
        sy += positions[i + a1]!;
        n += 1;
      }
      if (n < 80) continue;
      const cx = sx / n;
      const cy = sy / n;
      const radii: number[] = [];
      for (let i = 0; i < positions.length; i += 3) {
        const alongSpan = positions[i + spanAxis]!;
        if (alongSpan < region.min || alongSpan >= region.max) continue;
        const t = positions[i + insertAxis]!;
        if (t < t0 || t >= t1) continue;
        const dx = positions[i + a0]! - cx;
        const dy = positions[i + a1]! - cy;
        const rr = Math.hypot(dx, dy);
        if (rr < 0.5) continue;
        const invX = -dx / rr;
        const invY = -dy / rr;
        const facing = normals[i + a0]! * invX + normals[i + a1]! * invY;
        if (facing < 0.2) continue;
        radii.push(rr);
      }
      if (radii.length < 20) continue;
      radii.sort((a, b) => a - b);
      const medR = radii[Math.floor(radii.length / 2)]!;
      const score = radii.length / (1 + Math.abs(medR - targetRadius) * 2);
      if (!best || score > best.score) {
        const center = new THREE.Vector3();
        center.setComponent(insertAxis, (t0 + t1) / 2);
        center.setComponent(a0, cx);
        center.setComponent(a1, cy);
        let spanSum = 0;
        let spanN = 0;
        for (let i = 0; i < positions.length; i += 3) {
          const alongSpan = positions[i + spanAxis]!;
          if (alongSpan < region.min || alongSpan >= region.max) continue;
          const t = positions[i + insertAxis]!;
          if (t < t0 || t >= t1) continue;
          spanSum += alongSpan;
          spanN += 1;
        }
        if (spanN > 0) center.setComponent(spanAxis, spanSum / spanN);
        best = { center, radius: medR, score };
      }
    }
    if (best) seats.push(best);
  }
  return seats;
}

function pickSeat(seats: ProsthesisSeat[], targetRadius: number): ProsthesisSeat | null {
  if (seats.length === 0) return null;
  const close = seats.filter(
    (seat) => Math.abs(seat.radius - targetRadius) <= 0.25,
  );
  const pool = close.length > 0 ? close : seats;
  let best = pool[0]!;
  let bestScore = -Infinity;
  for (const seat of pool) {
    const radiusGap = Math.abs(seat.radius - targetRadius);
    const score = seat.score / (1 + radiusGap * 12);
    if (score > bestScore) {
      bestScore = score;
      best = seat;
    }
  }
  return best;
}

/** FL 근처~포스트 쪽 어벗 외면. 스크류 홀은 뺀다. */
function sampleAbutModel(positions: Float32Array, ring: FinishRing): Float32Array {
  const [a0, a1] = radialAxes(ring.axis);
  const fl = ring.center.getComponent(ring.axis);
  const lo = fl - 0.4;
  const hi = fl + 3.2;
  const out: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    const t = positions[i + ring.axis]!;
    if (t < lo || t > hi) continue;
    const dx = positions[i + a0]! - ring.center.getComponent(a0);
    const dy = positions[i + a1]! - ring.center.getComponent(a1);
    if (Math.hypot(dx, dy) < ring.radius * 0.5) continue;
    out.push(positions[i]!, positions[i + 1]!, positions[i + 2]!);
  }
  if (out.length < 90) return samplePoints(positions, 1200);
  return samplePoints(new Float32Array(out), 1200);
}

/** 브리지에서 해당 좌석 근처만 타깃으로. */
function sampleCrownTarget(
  positions: Float32Array,
  seat: ProsthesisSeat,
): Float32Array {
  const keepR = Math.max(seat.radius * 2.6, 6);
  const keepR2 = keepR * keepR;
  const out: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    const dx = positions[i]! - seat.center.x;
    const dy = positions[i + 1]! - seat.center.y;
    const dz = positions[i + 2]! - seat.center.z;
    if (dx * dx + dy * dy + dz * dz > keepR2) continue;
    out.push(positions[i]!, positions[i + 1]!, positions[i + 2]!);
  }
  if (out.length < 200) return voxelDownsample(positions, 0.2);
  return voxelDownsample(new Float32Array(out), 0.15);
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

/** 강체 회전에서 삽입축 둘레 트위스트만 남긴다(기울기 제거). */
function twistOnlyPose(pose: RigidPose, axis: Vec3): RigidPose {
  const a = norm3(axis);
  const ref: Vec3 = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let u = cross3(a, ref);
  if (Math.hypot(...u) < 1e-8) u = cross3(a, [0, 1, 0]);
  u = norm3(u);
  const ru = applyRot(pose.r, u);
  const ruPerp = norm3([
    ru[0] - a[0] * dot3(ru, a),
    ru[1] - a[1] * dot3(ru, a),
    ru[2] - a[2] * dot3(ru, a),
  ]);
  const angle = Math.atan2(dot3(cross3(u, ruPerp), a), dot3(u, ruPerp));
  return { r: rotAroundAxis(a, angle), t: [...pose.t] as Vec3 };
}

/**
 * 스캔바디 등록과 같이: 삽입축 둘레 시드 → trimmed ICP → 세밀 ICP.
 * 마지막에 삽입축 트위스트만 남기고(보철 축 유지) 평행이동을 한 번 더 다듬는다.
 */
function registerAbutmentToCrown(args: {
  model: Float32Array;
  target: Float32Array;
  axis: Vec3;
  t0: Vec3;
  seeds?: number;
}): RigidPose | null {
  if (args.model.length < 90 || args.target.length < 150) return null;
  const seeds = args.seeds ?? 24;
  const coarseModel = samplePoints(args.model, 400);
  const fullModel = args.model;
  const coarseGrid = new PointGrid(voxelDownsample(args.target, 0.28), 1.4);
  const midGrid = new PointGrid(voxelDownsample(args.target, 0.14), 0.75);
  const fineGrid = new PointGrid(voxelDownsample(args.target, 0.07), 0.4);
  const topY = -1e9;

  const coarseHits = [];
  for (let k = 0; k < seeds; k += 1) {
    const angle = (k / seeds) * Math.PI * 2;
    const init: RigidPose = {
      r: rotAroundAxis(args.axis, angle),
      t: [...args.t0] as Vec3,
    };
    coarseHits.push(
      icp({
        model: coarseModel,
        grid: coarseGrid,
        init,
        maxDist: 1.6,
        iterations: 14,
        topY,
        trim: 0.8,
      }),
    );
  }
  coarseHits.sort((a, b) => a.score - b.score);

  let best: RigidPose | null = null;
  let bestScore = Infinity;
  for (const start of coarseHits.slice(0, 4)) {
    const mid = icp({
      model: fullModel,
      grid: midGrid,
      init: start.pose,
      maxDist: 0.85,
      iterations: 22,
      topY,
      trim: 0.85,
    });
    const fine = icp({
      model: fullModel,
      grid: fineGrid,
      init: mid.pose,
      maxDist: 0.45,
      iterations: 28,
      topY,
      trim: 0.9,
    });
    // 기울기는 버리고 삽입축 회전만 남긴다. t는 ICP가 맞춘 값을 쓴다.
    const finalPose = twistOnlyPose(fine.pose, args.axis);
    const scored = icp({
      model: fullModel,
      grid: fineGrid,
      init: finalPose,
      maxDist: 0.45,
      iterations: 0,
      topY,
      trim: 0.9,
    });
    if (scored.score < bestScore) {
      bestScore = scored.score;
      best = finalPose;
    }
  }
  return best;
}

const SEAT_POSE_CACHE = new WeakMap<
  THREE.BufferGeometry,
  WeakMap<THREE.BufferGeometry, AbutmentSeatPose | null>
>();

/**
 * 어벗을 보철 좌석에 꽂을 자세(회전+이동). 이미 맞으면 null.
 * 메시 로컬(위치·회전 0) 기준. world = R · p + t
 */
export function computeAbutmentSeatPose(
  abutGeometry: THREE.BufferGeometry,
  crownGeometry: THREE.BufferGeometry,
): AbutmentSeatPose | null {
  const cached = SEAT_POSE_CACHE.get(abutGeometry)?.get(crownGeometry);
  if (cached !== undefined) {
    return cached
      ? {
          position: cached.position.clone(),
          quaternion: cached.quaternion.clone(),
        }
      : null;
  }

  const ring = estimateAbutmentFinishRing(abutGeometry);
  if (!ring) {
    rememberSeatPose(abutGeometry, crownGeometry, null);
    return null;
  }
  const seats = findProsthesisSeats(crownGeometry, ring.radius, ring.axis);
  const seat = pickSeat(seats, ring.radius);
  if (!seat) {
    rememberSeatPose(abutGeometry, crownGeometry, null);
    return null;
  }

  const abutPos = readPositions(abutGeometry);
  const crownPos = readPositions(crownGeometry);
  if (!abutPos || !crownPos) {
    rememberSeatPose(abutGeometry, crownGeometry, null);
    return null;
  }

  const model = sampleAbutModel(abutPos, ring);
  const target = sampleCrownTarget(crownPos, seat);
  const t0: Vec3 = [
    seat.center.x - ring.center.x,
    seat.center.y - ring.center.y,
    seat.center.z - ring.center.z,
  ];

  const fitted =
    registerAbutmentToCrown({
      model,
      target,
      axis: axisVec(ring.axis),
      t0,
      seeds: 24,
    }) ?? { r: IDENTITY, t: t0 };

  const pose = rigidToThree(fitted);
  const angleDeg = (pose.quaternion.angleTo(new THREE.Quaternion()) * 180) / Math.PI;
  if (pose.position.length() < ALREADY_SEATED_MM && angleDeg < ALREADY_SEATED_DEG) {
    rememberSeatPose(abutGeometry, crownGeometry, null);
    return null;
  }
  rememberSeatPose(abutGeometry, crownGeometry, pose);
  return {
    position: pose.position.clone(),
    quaternion: pose.quaternion.clone(),
  };
}

function rememberSeatPose(
  abutGeometry: THREE.BufferGeometry,
  crownGeometry: THREE.BufferGeometry,
  pose: AbutmentSeatPose | null,
) {
  let byCrown = SEAT_POSE_CACHE.get(abutGeometry);
  if (!byCrown) {
    byCrown = new WeakMap();
    SEAT_POSE_CACHE.set(abutGeometry, byCrown);
  }
  byCrown.set(
    crownGeometry,
    pose
      ? {
          position: pose.position.clone(),
          quaternion: pose.quaternion.clone(),
        }
      : null,
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

/** 어벗 치식이 보철 치식(단일·브리지)에 포함되면 true. */
export function toothLabelsOverlap(abutLabel: string, crownLabel: string): boolean {
  const a = abutLabel.trim();
  const c = crownLabel.trim();
  if (!a || !c) return false;
  const parts = (label: string) => {
    if (label.includes("-")) {
      const [lo, hi] = label.split("-");
      return [String(lo || "").trim(), String(hi || "").trim()].filter(Boolean);
    }
    return [label];
  };
  const crown = new Set(parts(c));
  return parts(a).some((t) => crown.has(t));
}
