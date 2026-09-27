// 기공소 AI 보철 — 스캔 면에 받침을 붙여 출력용 모델을 만든다.
// 윗면은 스캔 그대로, 경계에서 바닥 평면까지 벽을 내리고 바닥을 막는다.
// 다이는 마진 바깥에서 잘라 소켓과 간격을 두고, 교합 모델은 두 받침을 지주로 잇는다.
// related files:
// - web/frontend/src/shared/components/practice/OralScanOverlayViewer.tsx
// - web/frontend/src/shared/practice/labProsthesisModify.ts

import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { ModelSettings } from "@/shared/practice/labProsthesisModify";

export type StoneModelArch = "upper" | "lower";

export type StoneModelJaw = {
  arch: StoneModelArch;
  geometry: THREE.BufferGeometry;
  /** 월드 행렬. 결과는 월드 좌표다. */
  matrix: THREE.Matrix4;
};

export type StoneModelDie = {
  tooth: string;
  arch: StoneModelArch;
  /** 월드 좌표 치아 중심. */
  center: THREE.Vector3;
  /** 삽입축에 수직인 절단 반지름(기하 단위). 마진보다 바깥이다. */
  cutRadius: number;
};

export type StoneModelInput = {
  settings: ModelSettings;
  jaws: readonly StoneModelJaw[];
  dies: readonly StoneModelDie[];
  /** 하악에서 상악 쪽. */
  up: THREE.Vector3;
  right: THREE.Vector3;
  anterior: THREE.Vector3;
  unitToMm: number;
};

export type StoneModelPartKind = "arch" | "die" | "post";

export type StoneModelPart = {
  id: string;
  label: string;
  fileName: string;
  kind: StoneModelPartKind;
  arch: StoneModelArch | null;
  /** 월드 좌표 삼각형(비색인). */
  positions: Float32Array;
};

const ARCH_LABEL: Record<StoneModelArch, string> = { upper: "상악", lower: "하악" };

class TriangleWriter {
  private data: Float32Array;
  private size = 0;

  constructor(capacity: number) {
    this.data = new Float32Array(Math.max(capacity, 9) * 9);
  }

  private reserve(extra: number) {
    if (this.size + extra <= this.data.length) return;
    let next = this.data.length * 2;
    while (next < this.size + extra) next *= 2;
    const grown = new Float32Array(next);
    grown.set(this.data.subarray(0, this.size));
    this.data = grown;
  }

  push(a: ArrayLike<number>, b: ArrayLike<number>, c: ArrayLike<number>) {
    this.reserve(9);
    const d = this.data;
    let i = this.size;
    d[i++] = a[0]!;
    d[i++] = a[1]!;
    d[i++] = a[2]!;
    d[i++] = b[0]!;
    d[i++] = b[1]!;
    d[i++] = b[2]!;
    d[i++] = c[0]!;
    d[i++] = c[1]!;
    d[i++] = c[2]!;
    this.size = i;
  }

  result() {
    return this.data.slice(0, this.size);
  }
}

type WeldedJaw = {
  arch: StoneModelArch;
  positions: Float32Array;
  index: Uint32Array;
};

/** 월드 좌표로 옮기고 겹친 정점을 합친다. 면 방향은 바깥을 보게 맞춘다. */
function weldJaw(jaw: StoneModelJaw, unitToMm: number, outward: THREE.Vector3): WeldedJaw | null {
  const src = jaw.geometry.getAttribute("position");
  if (!src || src.count < 3) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", src.clone());
  const srcIndex = jaw.geometry.getIndex();
  if (srcIndex) geometry.setIndex(srcIndex.clone());
  geometry.applyMatrix4(jaw.matrix);
  const welded = mergeVertices(geometry, 1e-3 / Math.max(unitToMm, 1e-6));
  geometry.dispose();
  const pos = welded.getAttribute("position");
  const idx = welded.getIndex();
  if (!pos || !idx) {
    welded.dispose();
    return null;
  }
  const positions = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    positions[i * 3] = pos.getX(i);
    positions[i * 3 + 1] = pos.getY(i);
    positions[i * 3 + 2] = pos.getZ(i);
  }
  const index = new Uint32Array(idx.count - (idx.count % 3));
  for (let i = 0; i < index.length; i += 1) index[i] = idx.getX(i);
  welded.dispose();

  let facing = 0;
  for (let t = 0; t < index.length; t += 3) {
    const n = triangleNormal(positions, index[t]!, index[t + 1]!, index[t + 2]!);
    facing += n[0] * outward.x + n[1] * outward.y + n[2] * outward.z;
  }
  if (facing < 0) {
    for (let t = 0; t < index.length; t += 3) {
      const b = index[t + 1]!;
      index[t + 1] = index[t + 2]!;
      index[t + 2] = b;
    }
  }
  return { arch: jaw.arch, positions, index };
}

/** 넓이를 곱한 법선. */
function triangleNormal(p: Float32Array, a: number, b: number, c: number): [number, number, number] {
  const ax = p[a * 3]!;
  const ay = p[a * 3 + 1]!;
  const az = p[a * 3 + 2]!;
  const ux = p[b * 3]! - ax;
  const uy = p[b * 3 + 1]! - ay;
  const uz = p[b * 3 + 2]! - az;
  const vx = p[c * 3]! - ax;
  const vy = p[c * 3 + 1]! - ay;
  const vz = p[c * 3 + 2]! - az;
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}

function point(p: Float32Array, i: number): [number, number, number] {
  return [p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!];
}

function dot3(v: ArrayLike<number>, d: THREE.Vector3) {
  return v[0]! * d.x + v[1]! * d.y + v[2]! * d.z;
}

/** 삽입축에 수직인 평면에서 치아 중심까지 거리. */
function planarDistance(v: ArrayLike<number>, center: THREE.Vector3, up: THREE.Vector3) {
  const dx = v[0]! - center.x;
  const dy = v[1]! - center.y;
  const dz = v[2]! - center.z;
  const h = dx * up.x + dy * up.y + dz * up.z;
  return Math.hypot(dx - up.x * h, dy - up.y * h, dz - up.z * h);
}

type BoundaryLoop = { verts: number[]; closed: boolean };

/** 한 번만 쓰인 모서리를 면 방향 그대로 이어 고리로 만든다. */
function boundaryLoops(index: Uint32Array, mask: Uint8Array, vertexCount: number): BoundaryLoop[] {
  const open = new Map<number, number>();
  const n = vertexCount;
  for (let t = 0; t < mask.length; t += 1) {
    if (!mask[t]) continue;
    for (let k = 0; k < 3; k += 1) {
      const a = index[t * 3 + k]!;
      const b = index[t * 3 + ((k + 1) % 3)]!;
      const key = a < b ? a * n + b : b * n + a;
      if (open.has(key)) open.delete(key);
      else open.set(key, a * n + b);
    }
  }
  const next = new Map<number, number[]>();
  for (const directed of open.values()) {
    const a = Math.floor(directed / n);
    const b = directed - a * n;
    const list = next.get(a);
    if (list) list.push(b);
    else next.set(a, [b]);
  }
  const loops: BoundaryLoop[] = [];
  for (const start of [...next.keys()]) {
    while ((next.get(start)?.length ?? 0) > 0) {
      const verts = [start];
      let current = start;
      let closed = false;
      for (let guard = 0; guard < open.size + 1; guard += 1) {
        const outs = next.get(current);
        const to = outs?.pop();
        if (to == null) break;
        if (to === start) {
          closed = true;
          break;
        }
        verts.push(to);
        current = to;
      }
      if (verts.length >= 2) loops.push({ verts, closed: closed && verts.length >= 3 });
    }
  }
  return loops;
}

type PlaneBasis = { e1: THREE.Vector3; e2: THREE.Vector3 };

function planeBasis(down: THREE.Vector3): PlaneBasis {
  const helper = Math.abs(down.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const e1 = helper.clone().addScaledVector(down, -helper.dot(down)).normalize();
  const e2 = new THREE.Vector3().crossVectors(down, e1).normalize();
  return { e1, e2 };
}

function project2(v: ArrayLike<number>, basis: PlaneBasis) {
  return new THREE.Vector2(dot3(v, basis.e1), dot3(v, basis.e2));
}

function polygonArea(points: readonly THREE.Vector2[]) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function insidePolygon(p: THREE.Vector2, poly: readonly THREE.Vector2[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

type SolidOptions = {
  /** 받침 쪽. 상악은 +up, 하악은 −up. */
  down: THREE.Vector3;
  /** 바닥 평면. down 방향 좌표. */
  bottom: number;
  up: THREE.Vector3;
  /** 다이면 벽을 치아 중심 쪽으로 이만큼 들인다(기하 단위). */
  inset: { center: THREE.Vector3; gap: number } | null;
  /** 이 고리는 막지 않고 바닥까지 뚫는다. 다이 소켓. */
  isSocket: (loop: readonly number[]) => boolean;
};

/** 고른 삼각형으로 닫힌 솔리드를 만든다. */
function buildSolid(jaw: WeldedJaw, mask: Uint8Array, options: SolidOptions): Float32Array | null {
  const { positions: p, index } = jaw;
  let surfaceCount = 0;
  for (let t = 0; t < mask.length; t += 1) if (mask[t]) surfaceCount += 1;
  if (surfaceCount === 0) return null;
  const out = new TriangleWriter(surfaceCount * 1.2 + 64);
  for (let t = 0; t < mask.length; t += 1) {
    if (!mask[t]) continue;
    out.push(point(p, index[t * 3]!), point(p, index[t * 3 + 1]!), point(p, index[t * 3 + 2]!));
  }

  const { down, bottom, up, inset } = options;
  const wallTop = (v: [number, number, number]): [number, number, number] => {
    if (!inset || inset.gap <= 0) return v;
    const dx = v[0] - inset.center.x;
    const dy = v[1] - inset.center.y;
    const dz = v[2] - inset.center.z;
    const h = dx * up.x + dy * up.y + dz * up.z;
    const hx = dx - up.x * h;
    const hy = dy - up.y * h;
    const hz = dz - up.z * h;
    const len = Math.hypot(hx, hy, hz);
    if (len < 1e-9) return v;
    const step = Math.min(inset.gap, len * 0.5) / len;
    return [v[0] - hx * step, v[1] - hy * step, v[2] - hz * step];
  };
  const toBottom = (v: [number, number, number]): [number, number, number] => {
    const s = dot3(v, down);
    const lift = bottom - s;
    return [v[0] + down.x * lift, v[1] + down.y * lift, v[2] + down.z * lift];
  };

  const loops = boundaryLoops(index, mask, p.length / 3);
  const basis = planeBasis(down);
  const closed = loops
    .filter((loop) => loop.closed)
    .map((loop) => {
      const flat = loop.verts.map((v) => project2(point(p, v), basis));
      return { loop, flat, area: Math.abs(polygonArea(flat)) };
    });
  const outer = closed.reduce<(typeof closed)[number] | null>(
    (best, row) => (!best || row.area > best.area ? row : best),
    null,
  );

  const walled: BoundaryLoop[] = [];
  const holes: THREE.Vector2[][] = [];
  const holeLoops: number[][] = [];
  for (const row of closed) {
    if (row === outer) {
      walled.push(row.loop);
      continue;
    }
    const centroid = row.flat
      .reduce((acc, v) => acc.add(v), new THREE.Vector2())
      .multiplyScalar(1 / row.flat.length);
    if (outer && options.isSocket(row.loop.verts) && insidePolygon(centroid, outer.flat)) {
      walled.push(row.loop);
      holes.push(row.loop.verts.map((v) => project2(toBottom(wallTop(point(p, v))), basis)));
      holeLoops.push(row.loop.verts);
      continue;
    }
    // 스캔 구멍은 제자리에서 막는다.
    const verts = row.loop.verts;
    const c: [number, number, number] = [0, 0, 0];
    for (const v of verts) {
      c[0] += p[v * 3]!;
      c[1] += p[v * 3 + 1]!;
      c[2] += p[v * 3 + 2]!;
    }
    c[0] /= verts.length;
    c[1] /= verts.length;
    c[2] /= verts.length;
    for (let i = 0; i < verts.length; i += 1) {
      const a = point(p, verts[i]!);
      const b = point(p, verts[(i + 1) % verts.length]!);
      out.push(b, a, c);
    }
  }
  for (const loop of loops) if (!loop.closed) walled.push(loop);

  for (const loop of walled) {
    const verts = loop.verts;
    const count = loop.closed ? verts.length : verts.length - 1;
    for (let i = 0; i < count; i += 1) {
      const a = point(p, verts[i]!);
      const b = point(p, verts[(i + 1) % verts.length]!);
      const topA = wallTop(a);
      const topB = wallTop(b);
      if (topA !== a || topB !== b) {
        out.push(b, a, topA);
        out.push(b, topA, topB);
      }
      const lowA = toBottom(topA);
      const lowB = toBottom(topB);
      out.push(topB, topA, lowA);
      out.push(topB, lowA, lowB);
    }
  }

  if (outer) {
    const ring = outer.loop.verts.map((v) => toBottom(wallTop(point(p, v))));
    const contour = ring.map((v) => project2(v, basis));
    const holeRings = holeLoops.map((verts) => verts.map((v) => toBottom(wallTop(point(p, v)))));
    const all = [ring, ...holeRings].flat();
    const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
    for (const face of faces) {
      const a = all[face[0]!];
      const b = all[face[1]!];
      const c = all[face[2]!];
      if (!a || !b || !c) continue;
      const ux = b[0] - a[0];
      const uy = b[1] - a[1];
      const uz = b[2] - a[2];
      const vx = c[0] - a[0];
      const vy = c[1] - a[1];
      const vz = c[2] - a[2];
      const facing =
        (uy * vz - uz * vy) * down.x + (uz * vx - ux * vz) * down.y + (ux * vy - uy * vx) * down.z;
      if (facing >= 0) out.push(a, b, c);
      else out.push(a, c, b);
    }
  }
  return out.result();
}

function geometryTriangles(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): Float32Array {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  flat.applyMatrix4(matrix);
  const pos = flat.getAttribute("position");
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    out[i * 3] = pos.getX(i);
    out[i * 3 + 1] = pos.getY(i);
    out[i * 3 + 2] = pos.getZ(i);
  }
  if (flat !== geometry) flat.dispose();
  geometry.dispose();
  return out;
}

function concatTriangles(rows: readonly Float32Array[]) {
  const total = rows.reduce((sum, row) => sum + row.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const row of rows) {
    out.set(row, offset);
    offset += row.length;
  }
  return out;
}

type ArchExtent = {
  arch: StoneModelArch;
  /** 받침 바닥의 up 좌표. */
  baseUp: number;
  minRight: number;
  maxRight: number;
  minAnterior: number;
  maxAnterior: number;
};

/** 두 받침을 뒤쪽 좌우 기둥으로 잇는다. 기둥마다 받침으로 들어가는 날개가 있다. */
function buildBitePosts(
  extents: readonly ArchExtent[],
  input: StoneModelInput,
): Float32Array | null {
  const upper = extents.find((row) => row.arch === "upper");
  const lower = extents.find((row) => row.arch === "lower");
  if (!upper || !lower) return null;
  const unit = input.unitToMm > 0 ? input.unitToMm : 1;
  const mm = (value: number) => value / unit;
  const { up, right, anterior } = input;
  const minRight = Math.min(upper.minRight, lower.minRight);
  const maxRight = Math.max(upper.maxRight, lower.maxRight);
  const back = Math.min(upper.minAnterior, lower.minAnterior) + mm(6);
  const bottomUp = lower.baseUp;
  const topUp = upper.baseUp;
  const height = topUp - bottomUp;
  if (!(height > mm(4))) return null;
  const postRadius = mm(3);
  const flange = mm(4);
  const rows: Float32Array[] = [];
  for (const side of [-1, 1] as const) {
    const edge = side > 0 ? maxRight : minRight;
    const postRight = edge + side * (postRadius + mm(3));
    const place = (r: number, u: number, a: number) =>
      new THREE.Vector3()
        .addScaledVector(right, r)
        .addScaledVector(up, u)
        .addScaledVector(anterior, a);
    const basis = new THREE.Matrix4().makeBasis(right, up, anterior);
    const post = new THREE.Matrix4().copy(basis).setPosition(place(postRight, (bottomUp + topUp) / 2, back));
    rows.push(geometryTriangles(new THREE.CylinderGeometry(postRadius, postRadius, height, 32), post));
    const wingLength = postRadius + mm(3) + mm(8);
    const wingRight = postRight - side * (wingLength / 2);
    for (const u of [bottomUp + flange / 2, topUp - flange / 2]) {
      const wing = new THREE.Matrix4().copy(basis).setPosition(place(wingRight, u, back));
      rows.push(geometryTriangles(new THREE.BoxGeometry(wingLength, flange, mm(8)), wing));
    }
  }
  return concatTriangles(rows);
}

/**
 * 모델 종류대로 파트를 만든다.
 * 다이만 — 지대치 다이. 접촉 확인 — 지대치 악. 교합 확인 — 상·하악과 지주.
 */
export function buildStoneModel(input: StoneModelInput): StoneModelPart[] {
  const { settings, dies } = input;
  const unit = input.unitToMm > 0 ? input.unitToMm : 1;
  const mm = (value: number) => value / unit;
  const up = input.up.clone().normalize();
  const dieArches = new Set(dies.map((die) => die.arch));
  const wanted = new Set<StoneModelArch>(
    settings.kind === "bite"
      ? ["upper", "lower"]
      : dieArches.size > 0
        ? dieArches
        : input.jaws.map((jaw) => jaw.arch),
  );
  const split = settings.kind === "die" || (settings.dieSplit && dies.length > 0);
  const parts: StoneModelPart[] = [];
  const extents: ArchExtent[] = [];

  for (const jaw of input.jaws) {
    if (!wanted.has(jaw.arch)) continue;
    const down = jaw.arch === "upper" ? up.clone() : up.clone().negate();
    const welded = weldJaw(jaw, unit, down.clone().negate());
    if (!welded) continue;
    const { positions: p, index } = welded;
    const triCount = index.length / 3;
    const archDies = split ? dies.filter((die) => die.arch === jaw.arch) : [];
    if (settings.kind === "die" && archDies.length === 0) continue;

    let sMin = Infinity;
    let sMax = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      const s = p[i]! * down.x + p[i + 1]! * down.y + p[i + 2]! * down.z;
      if (s < sMin) sMin = s;
      if (s > sMax) sMax = s;
    }
    const bottom = Math.max(sMax + mm(2), sMin + mm(settings.heightMm));

    const dieOf = new Int16Array(triCount).fill(-1);
    if (archDies.length > 0) {
      const centroid: [number, number, number] = [0, 0, 0];
      for (let t = 0; t < triCount; t += 1) {
        const a = index[t * 3]!;
        const b = index[t * 3 + 1]!;
        const c = index[t * 3 + 2]!;
        centroid[0] = (p[a * 3]! + p[b * 3]! + p[c * 3]!) / 3;
        centroid[1] = (p[a * 3 + 1]! + p[b * 3 + 1]! + p[c * 3 + 1]!) / 3;
        centroid[2] = (p[a * 3 + 2]! + p[b * 3 + 2]! + p[c * 3 + 2]!) / 3;
        for (let d = 0; d < archDies.length; d += 1) {
          const die = archDies[d]!;
          if (planarDistance(centroid, die.center, up) < die.cutRadius) {
            dieOf[t] = d;
            break;
          }
        }
      }
    }

    if (settings.kind !== "die") {
      const mask = new Uint8Array(triCount);
      for (let t = 0; t < triCount; t += 1) mask[t] = dieOf[t]! < 0 ? 1 : 0;
      const solid = buildSolid(welded, mask, {
        down,
        bottom,
        up,
        inset: null,
        isSocket: (verts) => {
          if (archDies.length === 0) return false;
          const v = point(p, verts[0]!);
          return archDies.some((die) => planarDistance(v, die.center, up) < die.cutRadius * 1.15);
        },
      });
      if (solid) {
        const label = `${ARCH_LABEL[jaw.arch]} 모델`;
        parts.push({
          id: `arch:${jaw.arch}`,
          label,
          fileName: `${label}.stl`,
          kind: "arch",
          arch: jaw.arch,
          positions: solid,
        });
      }
    }

    archDies.forEach((die, d) => {
      const mask = new Uint8Array(triCount);
      for (let t = 0; t < triCount; t += 1) mask[t] = dieOf[t] === d ? 1 : 0;
      const solid = buildSolid(welded, mask, {
        down,
        bottom,
        up,
        inset: { center: die.center, gap: mm(settings.dieGapMm) },
        isSocket: () => false,
      });
      if (!solid) return;
      const label = `다이 #${die.tooth}`;
      parts.push({
        id: `die:${die.tooth}`,
        label,
        fileName: `다이-${die.tooth}.stl`,
        kind: "die",
        arch: jaw.arch,
        positions: solid,
      });
    });

    let minRight = Infinity;
    let maxRight = -Infinity;
    let minAnterior = Infinity;
    let maxAnterior = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      const v = [p[i]!, p[i + 1]!, p[i + 2]!];
      const r = dot3(v, input.right);
      const a = dot3(v, input.anterior);
      if (r < minRight) minRight = r;
      if (r > maxRight) maxRight = r;
      if (a < minAnterior) minAnterior = a;
      if (a > maxAnterior) maxAnterior = a;
    }
    const sign = jaw.arch === "upper" ? 1 : -1;
    extents.push({
      arch: jaw.arch,
      baseUp: sign * bottom,
      minRight,
      maxRight,
      minAnterior,
      maxAnterior,
    });
  }

  if (settings.kind === "bite") {
    const posts = buildBitePosts(extents, { ...input, up });
    if (posts) {
      parts.push({
        id: "post",
        label: "교합 지주",
        fileName: "교합-지주.stl",
        kind: "post",
        arch: null,
        positions: posts,
      });
    }
  }
  return parts;
}
