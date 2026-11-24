// 스캔 모델 전체에서 전치/구치(앞·뒤)·치아/잇몸(교합·치은)·미드라인 순으로 잡아
// 정교한 치과 표준 3차원 좌표계(위·앞·오른쪽)를 세우고 교합면 중심을 원점으로 옮긴다.
// 뷰어·방향 큐브·스캔바디 정합·커스텀어벗 디자인·백엔드 작업 스캔 자동 정렬이 같이 쓴다.
// three 외에 브라우저 API를 쓰지 않는다.
// related files:
// - web/frontend/src/shared/components/practice/OralScanOverlayViewer.tsx
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentViewCube.tsx
// - web/frontend/src/shared/practice/workScanAutoAlign.ts
import * as THREE from "three";

export type FrameMesh = { role: string; geometry: THREE.BufferGeometry };

export type DentalFrame = {
  up: THREE.Vector3;
  anterior: THREE.Vector3;
  right: THREE.Vector3;
};

/** 교합 정렬이 확정한 해부 축. 작업 좌표(자세를 적용한 뒤) 기준이다. */
export type StoredArchFrame = {
  /** 두개 쪽. */
  up: [number, number, number];
  /** 전치. 반대가 구치(7번·원심)다. */
  anterior: [number, number, number];
  /** 환자 우측. U의 좁은 오목한 쪽은 설·구개, 바깥은 협측이다. */
  right: [number, number, number];
};

function roundAxis(v: THREE.Vector3): [number, number, number] {
  return [
    Math.round(v.x * 1e4) / 1e4,
    Math.round(v.y * 1e4) / 1e4,
    Math.round(v.z * 1e4) / 1e4,
  ];
}

/**
 * 교합 정렬 직후의 모델 축.
 * 앞은 전치(그 치아의 근심), 뒤는 구치(원심), 위는 두개 쪽이다.
 * 오른손 축에서 U자의 오목한 좁은 쪽이 설·구개, 볼록한 바깥이 협측이다.
 */
export function archFrameAxes(frame: DentalFrame): StoredArchFrame | null {
  const up = frame.up.clone();
  if (up.lengthSq() < 1e-8) return null;
  up.normalize();
  const anterior = frame.anterior.clone();
  anterior.addScaledVector(up, -anterior.dot(up));
  if (anterior.lengthSq() < 1e-8) return null;
  anterior.normalize();
  const right = new THREE.Vector3().crossVectors(anterior, up);
  if (right.lengthSq() < 1e-8) return null;
  right.normalize();
  return { up: roundAxis(up), anterior: roundAxis(anterior), right: roundAxis(right) };
}

/** 세션에 저장된 축. 부호가 오른손 좌표계와 맞을 때만 되돌린다. */
export function dentalFrameFromStored(raw: StoredArchFrame | null | undefined): DentalFrame | null {
  if (!raw) return null;
  const read = (row: readonly number[] | undefined) => {
    if (!row || row.length < 3) return null;
    const v = new THREE.Vector3(Number(row[0]), Number(row[1]), Number(row[2]));
    if (v.lengthSq() < 0.25) return null;
    return v.normalize();
  };
  const up = read(raw.up);
  const anterior = read(raw.anterior);
  const right = read(raw.right);
  if (!up || !anterior || !right) return null;
  anterior.addScaledVector(up, -anterior.dot(up));
  if (anterior.lengthSq() < 1e-8) return null;
  anterior.normalize();
  const expect = new THREE.Vector3().crossVectors(anterior, up).normalize();
  if (right.dot(expect) < 0.8) return null;
  return { up, anterior, right: expect };
}

type Pt3 = [number, number, number];

export function samplePositions(geometry: THREE.BufferGeometry, cap: number): Pt3[] {
  const pos = geometry.getAttribute("position");
  const out: Pt3[] = [];
  if (!pos || pos.count === 0) return out;
  const stride = Math.max(1, Math.floor(pos.count / cap));
  for (let i = 0; i < pos.count; i += stride) {
    out.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  }
  return out;
}

export function meanVec(points: ReadonlyArray<Pt3>): THREE.Vector3 | null {
  if (points.length === 0) return null;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
    z += p[2];
  }
  const n = points.length;
  return new THREE.Vector3(x / n, y / n, z / n);
}

function quantileSorted(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)));
  return sorted[idx] ?? 0;
}

/** 3×3 대칭 공분산 행렬의 정확한 야코비 고유값 분해(오름차순 λ0 ≤ λ1 ≤ λ2). */
function eigenSymmetric3(
  xx: number,
  xy: number,
  xz: number,
  yy: number,
  yz: number,
  zz: number,
): { values: [number, number, number]; vectors: [THREE.Vector3, THREE.Vector3, THREE.Vector3] } {
  const a = [xx, xy, xz, xy, yy, yz, xz, yz, zz];
  const v = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let sw = 0; sw < 32; sw += 1) {
    let maxOff = 0;
    for (let p = 0; p < 3; p += 1) {
      for (let q = p + 1; q < 3; q += 1) {
        const apq = a[p * 3 + q]!;
        if (Math.abs(apq) > maxOff) maxOff = Math.abs(apq);
        if (Math.abs(apq) < 1e-13) continue;
        const theta = (a[q * 3 + q]! - a[p * 3 + p]!) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 3; k += 1) {
          const akp = a[k * 3 + p]!;
          const akq = a[k * 3 + q]!;
          a[k * 3 + p] = c * akp - s * akq;
          a[k * 3 + q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k += 1) {
          const apk = a[p * 3 + k]!;
          const aqk = a[q * 3 + k]!;
          a[p * 3 + k] = c * apk - s * aqk;
          a[q * 3 + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 3; k += 1) {
          const vkp = v[k * 3 + p]!;
          const vkq = v[k * 3 + q]!;
          v[k * 3 + p] = c * vkp - s * vkq;
          v[k * 3 + q] = s * vkp + c * vkq;
        }
      }
    }
    if (maxOff < 1e-12) break;
  }
  const order = [0, 1, 2].sort((i, j) => a[i * 4]! - a[j * 4]!);
  const vecAt = (i: number) => {
    const out = new THREE.Vector3(v[i]!, v[3 + i]!, v[6 + i]!);
    return out.lengthSq() > 1e-12 ? out.normalize() : new THREE.Vector3(0, 0, 1);
  };
  return {
    values: [a[order[0]! * 4]!, a[order[1]! * 4]!, a[order[2]! * 4]!],
    vectors: [vecAt(order[0]!), vecAt(order[1]!), vecAt(order[2]!)],
  };
}

function smallestPcaAxis(points: ReadonlyArray<Pt3>, mean: THREE.Vector3): THREE.Vector3 {
  if (points.length < 3) return new THREE.Vector3(0, 0, 1);
  let xx = 0;
  let yy = 0;
  let zz = 0;
  let xy = 0;
  let xz = 0;
  let yz = 0;
  for (const p of points) {
    const x = p[0] - mean.x;
    const y = p[1] - mean.y;
    const z = p[2] - mean.z;
    xx += x * x;
    yy += y * y;
    zz += z * z;
    xy += x * y;
    xz += x * z;
    yz += y * z;
  }
  return eigenSymmetric3(xx, xy, xz, yy, yz, zz).vectors[0];
}

/** Huber 가중 반복 최소제곱(IRLS) 평면 법선. 스캔바디 돌출이나 국소 이상점에 흔들리지 않는다. */
function fitRobustPlaneNormal(
  points: ReadonlyArray<Pt3>,
  seedNormal: THREE.Vector3,
  huberDelta: number,
): { normal: THREE.Vector3; eigMinor: number; eigMajor: number } | null {
  if (points.length < 6) return null;
  let normal = seedNormal.clone().normalize();
  let eigMinor = 0;
  let eigMajor = 0;
  const weights = new Float64Array(points.length).fill(1);

  for (let iter = 0; iter < 4; iter += 1) {
    let sw = 0;
    let mx = 0;
    let my = 0;
    let mz = 0;
    for (let i = 0; i < points.length; i += 1) {
      const w = weights[i]!;
      const p = points[i]!;
      sw += w;
      mx += w * p[0];
      my += w * p[1];
      mz += w * p[2];
    }
    if (sw < 1e-8) return null;
    mx /= sw;
    my /= sw;
    mz /= sw;

    let xx = 0;
    let xy = 0;
    let xz = 0;
    let yy = 0;
    let yz = 0;
    let zz = 0;
    for (let i = 0; i < points.length; i += 1) {
      const w = weights[i]!;
      const p = points[i]!;
      const dx = p[0] - mx;
      const dy = p[1] - my;
      const dz = p[2] - mz;
      xx += w * dx * dx;
      xy += w * dx * dy;
      xz += w * dx * dz;
      yy += w * dy * dy;
      yz += w * dy * dz;
      zz += w * dz * dz;
    }
    const eig = eigenSymmetric3(xx / sw, xy / sw, xz / sw, yy / sw, yz / sw, zz / sw);
    const next = eig.vectors[0];
    if (next.dot(normal) < 0) next.negate();
    normal = next;
    eigMinor = eig.values[1];
    eigMajor = eig.values[2];

    for (let i = 0; i < points.length; i += 1) {
      const p = points[i]!;
      const res = Math.abs((p[0] - mx) * normal.x + (p[1] - my) * normal.y + (p[2] - mz) * normal.z);
      weights[i] = res <= huberDelta ? 1 : huberDelta / res;
    }
  }
  return { normal, eigMinor, eigMajor };
}

function extractBoundaryVertices(geometry: THREE.BufferGeometry): Pt3[] {
  const pos = geometry.getAttribute("position");
  if (!pos || pos.count === 0) return [];
  const index = geometry.index;
  const triCount = index ? Math.floor(index.count / 3) : Math.floor(pos.count / 3);
  const edgeCount = new Map<string, number>();
  for (let t = 0; t < triCount; t += 1) {
    const a = index ? index.getX(t * 3) : t * 3;
    const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    const e1 = a < b ? `${a}_${b}` : `${b}_${a}`;
    const e2 = b < c ? `${b}_${c}` : `${c}_${b}`;
    const e3 = c < a ? `${c}_${a}` : `${a}_${c}`;
    edgeCount.set(e1, (edgeCount.get(e1) ?? 0) + 1);
    edgeCount.set(e2, (edgeCount.get(e2) ?? 0) + 1);
    edgeCount.set(e3, (edgeCount.get(e3) ?? 0) + 1);
  }
  const pts: Pt3[] = [];
  const seen = new Set<number>();
  for (const [key, count] of edgeCount.entries()) {
    if (count === 1) {
      const parts = key.split("_");
      const u = Number(parts[0]);
      const v = Number(parts[1]);
      if (u !== undefined && !seen.has(u)) {
        seen.add(u);
        pts.push([pos.getX(u), pos.getY(u), pos.getZ(u)]);
      }
      if (v !== undefined && !seen.has(v)) {
        seen.add(v);
        pts.push([pos.getX(v), pos.getY(v), pos.getZ(v)]);
      }
    }
  }
  return pts;
}

function computeMeshNormalVoting(geometry: THREE.BufferGeometry): THREE.Vector3 {
  const pos = geometry.getAttribute("position");
  if (!pos || pos.count < 3) return new THREE.Vector3(0, 0, 1);
  const index = geometry.index;
  const triCount = index ? Math.floor(index.count / 3) : Math.floor(pos.count / 3);
  const sumN = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let t = 0; t < triCount; t += 1) {
    const ia = index ? index.getX(t * 3) : t * 3;
    const ib = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const ic = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    v1.set(
      pos.getX(ib) - pos.getX(ia),
      pos.getY(ib) - pos.getY(ia),
      pos.getZ(ib) - pos.getZ(ia),
    );
    v2.set(
      pos.getX(ic) - pos.getX(ia),
      pos.getY(ic) - pos.getY(ia),
      pos.getZ(ic) - pos.getZ(ia),
    );
    n.crossVectors(v1, v2);
    sumN.add(n);
  }
  if (sumN.lengthSq() > 1e-6) sumN.normalize();
  return sumN;
}

/** 치열 반지름이 수 m면 mm로 올리고, 수 μm면 mm로 내린다. 구강 스캔은 보통 mm. */
function spanUnitsToMm(points: ReadonlyArray<Pt3>, mean: THREE.Vector3) {
  let radius = 0;
  for (const p of points) {
    radius = Math.max(radius, Math.hypot(p[0] - mean.x, p[1] - mean.y, p[2] - mean.z));
  }
  if (radius > 0 && radius < 5) return 1000;
  if (radius > 400) return 0.001;
  return 1;
}

/** 경계(잘린 잇몸)에서 질량 중심 쪽. 교합면(치관)을 가리킨다. */
function crownDirection(mesh: FrameMesh): THREE.Vector3 | null {
  const pts = samplePositions(mesh.geometry, 2500);
  const mean = meanVec(pts);
  if (!mean) return null;
  const border = extractBoundaryVertices(mesh.geometry);
  let toCrown = new THREE.Vector3();
  if (border.length >= 20) {
    const borderMean = meanVec(border);
    if (borderMean) toCrown.subVectors(mean, borderMean);
  }
  if (toCrown.lengthSq() < 1e-4) toCrown = computeMeshNormalVoting(mesh.geometry);
  if (toCrown.lengthSq() < 1e-4) return null;
  return toCrown.normalize();
}

function planeBasis(up: THREE.Vector3): { e1: THREE.Vector3; e2: THREE.Vector3 } {
  const ref = Math.abs(up.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const e1 = new THREE.Vector3().crossVectors(ref, up).normalize();
  const e2 = new THREE.Vector3().crossVectors(up, e1).normalize();
  return { e1, e2 };
}

type CrownCell = {
  gx: number;
  gy: number;
  xMm: number;
  yMm: number;
  zUpMm: number;
  hOccMm: number;
  pt: Pt3;
  isPeak: boolean;
};

/**
 * 한 악궁에서 치은 스커트·구개 천장·스캔바디 뾰족 기둥을 걸러내고 실제 치관 능선(교합면/절단연) 격자만 추출한다.
 * occSign: 상악은 -1(-up 방향이 치관), 하악은 +1(+up 방향이 치관).
 */
function extractJawCrownCells(
  pts: ReadonlyArray<Pt3>,
  origin: THREE.Vector3,
  up: THREE.Vector3,
  e1: THREE.Vector3,
  e2: THREE.Vector3,
  toMm: number,
  occSign: 1 | -1,
): { allMap: Map<string, CrownCell>; crownCells: CrownCell[]; peakCells: CrownCell[] } {
  const cellMm = 2.0;
  const raw = new Map<string, CrownCell>();
  for (const p of pts) {
    const dx = (p[0] - origin.x) * toMm;
    const dy = (p[1] - origin.y) * toMm;
    const dz = (p[2] - origin.z) * toMm;
    const xMm = dx * e1.x + dy * e1.y + dz * e1.z;
    const yMm = dx * e2.x + dy * e2.y + dz * e2.z;
    const zUpMm = dx * up.x + dy * up.y + dz * up.z;
    const hOccMm = zUpMm * occSign;
    const gx = Math.round(xMm / cellMm);
    const gy = Math.round(yMm / cellMm);
    const key = `${gx},${gy}`;
    const prev = raw.get(key);
    if (!prev || hOccMm > prev.hOccMm) {
      raw.set(key, { gx, gy, xMm, yMm, zUpMm, hOccMm, pt: p, isPeak: false });
    }
  }
  const all = [...raw.values()];
  if (all.length === 0) return { allMap: raw, crownCells: [], peakCells: [] };

  const allH = all.map((c) => c.hOccMm).sort((a, b) => a - b);
  const hTop92 = quantileSorted(allH, 0.92);
  const hFloor18 = quantileSorted(allH, 0.18);
  const bandDepth = Math.min(7.5, Math.max(3.8, (hTop92 - hFloor18) * 0.56));
  const crownFloor = hTop92 - bandDepth;

  const crownCells: CrownCell[] = [];
  const peakCells: CrownCell[] = [];
  for (const c of all) {
    if (c.hOccMm < crownFloor) continue;
    const nearH: number[] = [];
    let higherIn4mm = 0;
    for (let dy = -3; dy <= 3; dy += 1) {
      for (let dx = -3; dx <= 3; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nb = raw.get(`${c.gx + dx},${c.gy + dy}`);
        if (!nb) continue;
        nearH.push(nb.hOccMm);
        if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2 && nb.hOccMm > c.hOccMm + 0.15) {
          higherIn4mm += 1;
        }
      }
    }
    if (nearH.length < 3) continue;
    nearH.sort((a, b) => a - b);
    const nearP80 = quantileSorted(nearH, 0.8);
    const nearP15 = quantileSorted(nearH, 0.15);
    // 주변 치관보다 2.5mm 넘게 홀로 솟은 좁은 스캔바디 기둥 상단은 교합평면·미드라인 추정에서 뺀다.
    if (c.hOccMm > nearP80 + 2.5) continue;
    if (c.hOccMm - nearP15 < 0.7 && c.hOccMm < hTop92 - 3.5) continue;
    c.isPeak = higherIn4mm <= 2 && c.hOccMm - nearP15 >= 1.3;
    crownCells.push(c);
    if (c.isPeak) peakCells.push(c);
  }
  return {
    allMap: raw,
    crownCells: crownCells.length >= 12 ? crownCells : all,
    peakCells: peakCells.length >= 10 ? peakCells : crownCells.length >= 12 ? crownCells : all,
  };
}

type Weighted2D = { x: number; y: number; h: number; w: number; isUpper: boolean };

/**
 * 후보 축의 플러스 끝이 전치(좁고 한 덩어리)인지, 구치(넓거나 좌우로 갈라짐)인지 본다.
 * 구치 쪽을 앞으로 잡았으면 -1. 애매하면 후보를 유지한다.
 */
function incisorEndSign(samples: readonly Weighted2D[], ax: number, ay: number): 1 | -1 {
  if (samples.length < 16) return 1;
  const proj = samples.map((s) => ({
    a: s.x * ax + s.y * ay,
    r: s.x * ay - s.y * ax,
  }));
  const as = proj.map((p) => p.a).sort((u, v) => u - v);
  const aHi = quantileSorted(as, 0.82);
  const aLo = quantileSorted(as, 0.18);
  if (aHi - aLo < 12) return 1;

  const endScore = (side: "hi" | "lo") => {
    const pts = proj.filter((p) => (side === "hi" ? p.a >= aHi : p.a <= aLo));
    if (pts.length < 4) return -1e6;
    const rs = pts.map((p) => p.r).sort((u, v) => u - v);
    const rL = quantileSorted(rs, 0.12);
    const rR = quantileSorted(rs, 0.88);
    const width = rR - rL;
    let hollow = 0;
    if (width >= 16) {
      const mid = 0.5 * (rL + rR);
      const inner = Math.max(4, width * 0.22);
      let midCnt = 0;
      for (const p of pts) {
        if (Math.abs(p.r - mid) <= inner) midCnt += 1;
      }
      hollow = 1 - midCnt / pts.length;
    }
    // 전치는 좁고 가운데가 이어져 있다. 구치는 넓거나 좌·우로 비어 있다.
    return -width - hollow * 22;
  };

  const frontLike = endScore("hi");
  const backLike = endScore("lo");
  if (backLike > frontLike + 6) return -1;
  return 1;
}

/**
 * 교합평면 위 치관 능선 격자에서 미드라인(상악 중절치 #11·#21 사이 정중시상면)과 전치 방향(+anterior)을 찾는다.
 * - 양측성 악궁(전악 · 3/4악): 말굽 전방 폐쇄 + 구치 설측/구개 빈 공간 + 좌우 치열 대칭선 드리프트 0 +
 *   상악 전치·소구치 순측 호 거울 대칭(#11↔#21, #12↔#22, #13↔#23)으로 정중선을 0.5° 단위로 정밀 고정한다.
 * - 편측 사분악 스캔: 전후 장축을 찾고 치관 폭 테이퍼와 악궁 오목(설·구개측) 곡률로 전치 방향을 잡는다.
 */
function findMidlineAnteriorAxis(
  upperCrowns: readonly CrownCell[],
  lowerCrowns: readonly CrownCell[],
  fallbackPts: ReadonlyArray<Pt3>,
  origin: THREE.Vector3,
  up: THREE.Vector3,
  e1: THREE.Vector3,
  e2: THREE.Vector3,
  toMm: number,
): { anterior: THREE.Vector3; midlineOffsetRightMm: number } {
  const samples: Weighted2D[] = [];
  for (const c of upperCrowns) {
    samples.push({ x: c.xMm, y: c.yMm, h: c.hOccMm, w: c.isPeak ? 1.55 : 1.25, isUpper: true });
  }
  for (const c of lowerCrowns) {
    samples.push({ x: c.xMm, y: c.yMm, h: c.hOccMm, w: c.isPeak ? 1.15 : 0.95, isUpper: false });
  }
  if (samples.length < 20) {
    for (const p of fallbackPts) {
      const dx = (p[0] - origin.x) * toMm;
      const dy = (p[1] - origin.y) * toMm;
      const dz = (p[2] - origin.z) * toMm;
      samples.push({
        x: dx * e1.x + dy * e1.y + dz * e1.z,
        y: dx * e2.x + dy * e2.y + dz * e2.z,
        h: 0,
        w: 1,
        isUpper: false,
      });
    }
  }
  if (samples.length < 6) {
    return { anterior: e1.clone(), midlineOffsetRightMm: 0 };
  }

  let sw = 0;
  let mx = 0;
  let my = 0;
  for (const s of samples) {
    sw += s.w;
    mx += s.w * s.x;
    my += s.w * s.y;
  }
  mx /= sw;
  my /= sw;
  let cxx = 0;
  let cxy = 0;
  let cyy = 0;
  for (const s of samples) {
    const dx = s.x - mx;
    const dy = s.y - my;
    cxx += s.w * dx * dx;
    cxy += s.w * dx * dy;
    cyy += s.w * dy * dy;
  }
  const pcaTheta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const cp = Math.cos(pcaTheta);
  const sp = Math.sin(pcaTheta);
  const vA = cxx * cp * cp + 2 * cxy * cp * sp + cyy * sp * sp;
  const vB = cxx * sp * sp - 2 * cxy * cp * sp + cyy * cp * cp;
  const majorDir: [number, number] = vA >= vB ? [cp, sp] : [-sp, cp];
  const minorDir: [number, number] = [-majorDir[1], majorDir[0]];

  const majVals = samples.map((s) => s.x * majorDir[0] + s.y * majorDir[1]).sort((a, b) => a - b);
  const minVals = samples.map((s) => s.x * minorDir[0] + s.y * minorDir[1]).sort((a, b) => a - b);
  const spanMajor = quantileSorted(majVals, 0.97) - quantileSorted(majVals, 0.03);
  const spanMinor = quantileSorted(minVals, 0.97) - quantileSorted(minVals, 0.03);

  const evalHorseshoe = (theta: number) => {
    const ax = Math.cos(theta);
    const ay = Math.sin(theta);
    // right = anterior × up = (ax e1 + ay e2) × up = ay e1 - ax e2 (since e1 × e2 = up => e1 × up = -e2, e2 × up = +e1)
    const rx = ay;
    const ry = -ax;

    const as: number[] = [];
    const proj: Array<{ r: number; a: number; w: number; isUpper: boolean }> = [];
    for (const s of samples) {
      const a = s.x * ax + s.y * ay;
      const r = s.x * rx + s.y * ry;
      as.push(a);
      proj.push({ r, a, w: s.w, isUpper: s.isUpper });
    }
    as.sort((u, v) => u - v);
    const aHi = quantileSorted(as, 0.97);
    const aLo = quantileSorted(as, 0.03);
    const depth = aHi - aLo;
    if (depth < 14) return null;

    // 전방 절단 호(상단 7mm)의 좌우 중심을 초기 정중선 후보로 삼는다.
    const frontRs: number[] = [];
    for (const q of proj) {
      if (q.a >= aHi - Math.min(7.5, depth * 0.24)) frontRs.push(q.r);
    }
    if (frontRs.length < 4) return null;
    frontRs.sort((u, v) => u - v);
    const rFrontMid = 0.5 * (quantileSorted(frontRs, 0.12) + quantileSorted(frontRs, 0.88));
    const frontSpan = quantileSorted(frontRs, 0.9) - quantileSorted(frontRs, 0.1);

    // 전방에서 후방으로 3mm 간격 슬라이스마다 좌·우 날개 분리와 좌우 외측 중점 일관성을 평가한다.
    const sliceMm = 3.0;
    const sliceCount = Math.max(3, Math.min(18, Math.floor(depth / sliceMm)));
    let bilateralSlices = 0;
    let midSumW = 0;
    let midSumR = 0;
    const biRows: Array<{ a: number; mid: number; width: number; hollow: number; w: number }> = [];
    let maxBackWidth = frontSpan;

    for (let si = 1; si < sliceCount; si += 1) {
      const sTop = aHi - si * sliceMm;
      const sBot = sTop - sliceMm;
      const rs: number[] = [];
      for (const q of proj) {
        if (q.a >= sBot && q.a <= sTop) rs.push(q.r);
      }
      if (rs.length < 4) continue;
      rs.sort((u, v) => u - v);
      const rL = quantileSorted(rs, 0.08);
      const rR = quantileSorted(rs, 0.92);
      const width = rR - rL;
      if (si >= 2 && width > maxBackWidth) maxBackWidth = width;
      if (rL < rFrontMid - 6.0 && rR > rFrontMid + 6.0 && width >= 22) {
        let midCnt = 0;
        const innerHalf = Math.max(4.0, width * 0.24);
        const midEst = 0.5 * (rL + rR);
        for (const r of rs) {
          if (Math.abs(r - midEst) <= innerHalf) midCnt += 1;
        }
        const hollow = si >= 3 ? 1 - midCnt / rs.length : 0.5;
        const w = 1 / (1 + si * 0.08);
        bilateralSlices += 1;
        midSumW += w;
        midSumR += w * midEst;
        biRows.push({ a: 0.5 * (sTop + sBot), mid: midEst, width, hollow, w });
      }
    }
    if (bilateralSlices < 2) return null;

    const rMid = midSumR / Math.max(midSumW, 1e-6);
    let driftErr = 0;
    let hollowSum = 0;
    for (const row of biRows) {
      driftErr += row.w * (row.mid - rMid) ** 2;
      hollowSum += row.hollow;
    }
    const rmsMidDrift = Math.sqrt(driftErr / Math.max(midSumW, 1e-6));
    const avgHollow = hollowSum / biRows.length;

    // 상악 중절치(#11·#21)·측절치(#12·#22)·견치(#13·#23) 순측 아치 거울 대칭 오차.
    // 상악 전치부 데이터가 충분하면 상악을 우선 쓰고, 부족하면 상·하악 통합 전치 호를 쓴다.
    const upperAntCnt = proj.filter(
      (q) => q.isUpper && q.a >= aHi - 16 && Math.abs(q.r - rMid) <= 18,
    ).length;
    const useUpperOnlyForMidline = upperAntCnt >= 14;
    const dBins = [2, 4.5, 7, 9.5, 12, 15];
    let symErrSq = 0;
    let symWeight = 0;
    let apexDropSum = 0;
    let centerLabialA = -Infinity;
    for (const q of proj) {
      if (useUpperOnlyForMidline && !q.isUpper) continue;
      if (Math.abs(q.r - rMid) <= 4.8 && q.a > centerLabialA) centerLabialA = q.a;
    }
    if (!Number.isFinite(centerLabialA)) centerLabialA = aHi;

    for (const d of dBins) {
      let maxPos = -Infinity;
      let maxNeg = -Infinity;
      for (const q of proj) {
        if (useUpperOnlyForMidline && !q.isUpper) continue;
        if (q.a < aHi - 22) continue;
        const dr = q.r - rMid;
        if (Math.abs(dr - d) <= 1.6 && q.a > maxPos) maxPos = q.a;
        if (Math.abs(dr + d) <= 1.6 && q.a > maxNeg) maxNeg = q.a;
      }
      if (Number.isFinite(maxPos) && Number.isFinite(maxNeg)) {
        const wd = d <= 7 ? 2.2 : 1.2;
        symErrSq += wd * (maxPos - maxNeg) ** 2;
        symWeight += wd;
        if (d >= 9.5) {
          apexDropSum += centerLabialA - 0.5 * (maxPos + maxNeg);
        }
      }
    }
    if (symWeight < 2.0) return null;
    const symRms = Math.sqrt(symErrSq / symWeight);

    // 전방 중절치 연결부(|r - rMid| <= 5.5mm)가 실제로 닫혀 있는지 확인(180° 뒤집힌 후방 개방단 배제).
    let antBridgeCnt = 0;
    for (const q of proj) {
      if (q.a >= aHi - 7.5 && Math.abs(q.r - rMid) <= 5.8) antBridgeCnt += 1;
    }
    if (antBridgeCnt < 3) return null;

    const taperGain = Math.max(-8, Math.min(24, maxBackWidth - frontSpan));
    const score =
      taperGain * 1.15 +
      avgHollow * 16.0 +
      Math.min(12, Math.max(-4, apexDropSum * 0.9)) +
      Math.min(8, bilateralSlices * 1.1) -
      rmsMidDrift * 3.8 -
      symRms * 4.4 -
      Math.abs(rFrontMid - rMid) * 1.2;

    return { theta, rMid, score, symRms, rmsMidDrift };
  };

  // 1) 양측성 악궁 스캔: 6° 전역 탐색 후 최고 후보 주변 ±6°를 0.5° 단위로 정밀 수렴(상악 중절치 정중선 고정)
  if (spanMinor >= 27) {
    let best: ReturnType<typeof evalHorseshoe> = null;
    for (let k = 0; k < 60; k += 1) {
      const res = evalHorseshoe((k * 6 * Math.PI) / 180);
      if (res && (!best || res.score > best.score)) best = res;
    }
    if (best) {
      const seedTheta = best.theta;
      for (let step = -12; step <= 12; step += 1) {
        if (step === 0) continue;
        const th = seedTheta + (step * 0.5 * Math.PI) / 180;
        const res = evalHorseshoe(th);
        if (res && res.score > best.score) best = res;
      }
      // 최종 정중선 점: 상악 중절치(#11·#21) 절단연 대칭 중심(±4.5mm)의 정확한 중앙 rMid 미세 보정
      const ax = Math.cos(best.theta);
      const ay = Math.sin(best.theta);
      const rx = ay;
      const ry = -ax;
      const upperIncisal = samples.filter((s) => s.isUpper);
      const pool = upperIncisal.length >= 20 ? upperIncisal : samples;
      let aMaxInc = -Infinity;
      for (const s of pool) {
        const r = s.x * rx + s.y * ry;
        const a = s.x * ax + s.y * ay;
        if (Math.abs(r - best.rMid) <= 9.5 && a > aMaxInc) aMaxInc = a;
      }
      let refinedMid = best.rMid;
      let bestIncErr = Infinity;
      for (let dr = -2.4; dr <= 2.401; dr += 0.2) {
        const candMid = best.rMid + dr;
        let err = dr * dr * 0.35;
        let pairs = 0;
        for (const d of [2.5, 4.5, 6.5, 9.0, 11.5]) {
          let pHi = -Infinity;
          let nHi = -Infinity;
          for (const s of pool) {
            const a = s.x * ax + s.y * ay;
            if (a < aMaxInc - 14) continue;
            const r = s.x * rx + s.y * ry - candMid;
            if (Math.abs(r - d) <= 1.25 && a > pHi) pHi = a;
            if (Math.abs(r + d) <= 1.25 && a > nHi) nHi = a;
          }
          if (Number.isFinite(pHi) && Number.isFinite(nHi)) {
            err += (pHi - nHi) ** 2 * (d <= 6.5 ? 1.8 : 1.0);
            pairs += 1;
          }
        }
        if (pairs >= 3 && err < bestIncErr) {
          bestIncErr = err;
          refinedMid = candMid;
        }
      }

      const sign = incisorEndSign(samples, ax, ay);
      const anterior = new THREE.Vector3()
        .addScaledVector(e1, ax * sign)
        .addScaledVector(e2, ay * sign)
        .normalize();
      return { anterior, midlineOffsetRightMm: refinedMid * sign };
    }
  }

  // 2) 편측 사분악 스캔(전치 정중선이 안 찍힌 반악 스캔):
  //    전체 메쉬(구개·치은 포함)의 장축 양끝 폭 테이퍼(전방 절단·소구치 끝은 좁고, 후방 대구치·구개 끝은 넓음)로 전치 방향을 잡는다.
  const fullProj: Array<{ m: number; n: number }> = [];
  for (const p of fallbackPts) {
    const dx = (p[0] - origin.x) * toMm;
    const dy = (p[1] - origin.y) * toMm;
    const dz = (p[2] - origin.z) * toMm;
    const px = dx * e1.x + dy * e1.y + dz * e1.z;
    const py = dx * e2.x + dy * e2.y + dz * e2.z;
    fullProj.push({
      m: px * majorDir[0] + py * majorDir[1],
      n: px * minorDir[0] + py * minorDir[1],
    });
  }
  const fullM = fullProj.map((q) => q.m).sort((a, b) => a - b);
  const fmLo = quantileSorted(fullM, 0.14);
  const fmHi = quantileSorted(fullM, 0.86);
  const fullEndWidth = (side: "lo" | "hi") => {
    const ns: number[] = [];
    for (const q of fullProj) {
      if (side === "lo" ? q.m > fmLo : q.m < fmHi) continue;
      ns.push(q.n);
    }
    if (ns.length < 4) return spanMinor;
    ns.sort((a, b) => a - b);
    return quantileSorted(ns, 0.92) - quantileSorted(ns, 0.08);
  };
  const wLo = fullEndWidth("lo");
  const wHi = fullEndWidth("hi");
  const signMajor = wHi <= wLo ? 1 : -1;
  const ant2: [number, number] = [majorDir[0] * signMajor, majorDir[1] * signMajor];
  const sign = incisorEndSign(samples, ant2[0], ant2[1]);
  const anterior = new THREE.Vector3()
    .addScaledVector(e1, ant2[0] * sign)
    .addScaledVector(e2, ant2[1] * sign)
    .normalize();
  return { anterior, midlineOffsetRightMm: 0 };
}

/**
 * 스캔 모델 전체를 파악해
 * 1) 치아(교합)와 잇몸(치은)으로 위(+up = 두개 쪽)를 잡고,
 * 2) 전치·구치로 앞(+anterior = 전치, 좁고 이어진 끝)과 뒤(구치, 넓거나 좌우로 갈라진 끝)를 잡은 뒤,
 * 3) 오른손 좌표계 { up, anterior, right }를 돌려준다. 메시 정점은 바꾸지 않는다.
 * 치아 큐브의 근심은 이 미드라인 쪽, 원심은 7번(제2대구치) 쪽이다.
 */
export function estimateDentalFrame(loaded: readonly FrameMesh[]): DentalFrame | null {
  const upperPts: Pt3[] = [];
  const lowerPts: Pt3[] = [];
  const archPts: Pt3[] = [];
  let upperMesh: FrameMesh | null = null;
  let lowerMesh: FrameMesh | null = null;
  let singleMesh: FrameMesh | null = null;

  for (const entry of loaded) {
    if (entry.role !== "upper" && entry.role !== "lower") continue;
    const pts = samplePositions(entry.geometry, 5000);
    archPts.push(...pts);
    if (entry.role === "upper") {
      upperPts.push(...pts);
      upperMesh = entry;
    } else {
      lowerPts.push(...pts);
      lowerMesh = entry;
    }
  }
  if (archPts.length < 30) {
    for (const entry of loaded) {
      if (entry.role === "bite") continue;
      const pts = samplePositions(entry.geometry, 5000);
      archPts.push(...pts);
      singleMesh = entry;
    }
  }
  if (archPts.length < 30) return null;

  const upperC = meanVec(upperPts);
  const lowerC = meanVec(lowerPts);
  const mean = meanVec(archPts)!;
  const both = upperPts.length >= 30 && lowerPts.length >= 30;
  const toMm = spanUnitsToMm(archPts, mean);

  const orientUpPolarity = (dir: THREE.Vector3): THREE.Vector3 => {
    if (both && upperC && lowerC) {
      const uProj = upperPts.map((p) => p[0] * dir.x + p[1] * dir.y + p[2] * dir.z).sort((a, b) => a - b);
      const lProj = lowerPts.map((p) => p[0] * dir.x + p[1] * dir.y + p[2] * dir.z).sort((a, b) => a - b);
      const medDiffMm = (quantileSorted(uProj, 0.5) - quantileSorted(lProj, 0.5)) * toMm;
      if (Math.abs(medDiffMm) >= 1.5) {
        if (medDiffMm < 0) dir.negate();
        return dir.normalize();
      }
      const cu = upperMesh ? crownDirection(upperMesh) : null;
      const cl = lowerMesh ? crownDirection(lowerMesh) : null;
      const vote = new THREE.Vector3();
      if (cu) vote.sub(cu);
      if (cl) vote.add(cl);
      if (vote.lengthSq() > 1e-6 && dir.dot(vote) < 0) dir.negate();
      return dir.normalize();
    }
    const single = upperMesh ?? lowerMesh ?? singleMesh;
    const crown = single ? crownDirection(single) : null;
    if (crown) {
      const expectedUp = upperMesh && !lowerMesh ? crown.clone().negate() : crown;
      if (dir.dot(expectedUp) < 0) dir.negate();
    }
    return dir.normalize();
  };

  // 초기 평면 시드: 상·하악 중심 차(편측·비대칭 범위 오차에 30~50° 기욺)를 절대 법선으로 쓰지 않고,
  // 각 악궁 자체의 얇은 판 최소 고유벡터로부터 시작해 상/하 부호만 맞춘다.
  let up = new THREE.Vector3();
  if (both && upperC && lowerC) {
    const nu = smallestPcaAxis(upperPts, upperC);
    const nl = smallestPcaAxis(lowerPts, lowerC);
    if (nl.dot(nu) < 0) nl.negate();
    up.copy(nu).add(nl);
  }
  if (up.lengthSq() < 1e-6) {
    up = smallestPcaAxis(archPts, mean);
  }
  if (up.lengthSq() < 1e-8) return null;
  orientUpPolarity(up);

  // 교합평면 수렴(2회 반복): 치은 스커트·구개 천장·스캔바디 돌출을 제외한 치관 능선과
  // 상·하악 실제 교합 접촉 중점들로 해부학적 교합평면 법선을 정확히 고정한다.
  let upperGrid: ReturnType<typeof extractJawCrownCells> | null = null;
  let lowerGrid: ReturnType<typeof extractJawCrownCells> | null = null;
  let singleGrid: ReturnType<typeof extractJawCrownCells> | null = null;

  for (let pass = 0; pass < 2; pass += 1) {
    const { e1, e2 } = planeBasis(up);
    if (both) {
      upperGrid = extractJawCrownCells(upperPts, mean, up, e1, e2, toMm, -1);
      lowerGrid = extractJawCrownCells(lowerPts, mean, up, e1, e2, toMm, 1);

      const pairRows: Array<{ gapMm: number; mid: Pt3 }> = [];
      for (const lc of lowerGrid.crownCells) {
        let bestU: CrownCell | null = null;
        let bestGap = Infinity;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const uc = upperGrid.allMap.get(`${lc.gx + dx},${lc.gy + dy}`);
            if (!uc) continue;
            const gap = uc.zUpMm - lc.zUpMm;
            if (gap < bestGap) {
              bestGap = gap;
              bestU = uc;
            }
          }
        }
        if (bestU && bestGap >= -3.0 && bestGap <= 9.5) {
          pairRows.push({
            gapMm: bestGap,
            mid: [
              (bestU.pt[0] + lc.pt[0]) * 0.5,
              (bestU.pt[1] + lc.pt[1]) * 0.5,
              (bestU.pt[2] + lc.pt[2]) * 0.5,
            ],
          });
        }
      }

      const fitU = fitRobustPlaneNormal(
        upperGrid.peakCells.map((c) => c.pt),
        up,
        1.8 / toMm,
      );
      const fitL = fitRobustPlaneNormal(
        lowerGrid.peakCells.map((c) => c.pt),
        up,
        1.8 / toMm,
      );
      const crownNormal = new THREE.Vector3();
      if (fitU) crownNormal.add(fitU.normal);
      if (fitL) crownNormal.add(fitL.normal);
      if (crownNormal.lengthSq() < 1e-6) crownNormal.copy(up);
      else crownNormal.normalize();

      let nextUp = crownNormal;
      if (pairRows.length >= 16) {
        const sortedGaps = pairRows.map((r) => r.gapMm).sort((a, b) => a - b);
        const g10 = quantileSorted(sortedGaps, 0.1);
        if (g10 <= 6.0) {
          const maxContactGap = Math.max(2.6, g10 + 2.8);
          const contactPts = pairRows.filter((r) => r.gapMm <= maxContactGap).map((r) => r.mid);
          const fitContact = fitRobustPlaneNormal(contactPts, up, 1.4 / toMm);
          if (fitContact) {
            const minorMm2 = fitContact.eigMinor * toMm * toMm;
            const wContact = Math.max(0, Math.min(1, (minorMm2 - 3.5) / 14.0));
            nextUp = crownNormal
              .clone()
              .multiplyScalar(1 - wContact)
              .addScaledVector(fitContact.normal, wContact)
              .normalize();
          }
        }
      }
      up = orientUpPolarity(nextUp);
    } else {
      const occSign: 1 | -1 = upperMesh && !lowerMesh ? -1 : 1;
      singleGrid = extractJawCrownCells(archPts, mean, up, e1, e2, toMm, occSign);
      const fitSingle = fitRobustPlaneNormal(
        singleGrid.peakCells.map((c) => c.pt),
        up,
        1.7 / toMm,
      );
      if (fitSingle && fitSingle.eigMinor * toMm * toMm >= 6.0) {
        up = orientUpPolarity(fitSingle.normal);
      }
    }
  }

  const { e1, e2 } = planeBasis(up);
  if (both) {
    upperGrid = extractJawCrownCells(upperPts, mean, up, e1, e2, toMm, -1);
    lowerGrid = extractJawCrownCells(lowerPts, mean, up, e1, e2, toMm, 1);
  } else {
    const occSign: 1 | -1 = upperMesh && !lowerMesh ? -1 : 1;
    singleGrid = extractJawCrownCells(archPts, mean, up, e1, e2, toMm, occSign);
  }

  const { anterior } = findMidlineAnteriorAxis(
    upperGrid?.crownCells ?? (upperMesh && !lowerMesh ? (singleGrid?.crownCells ?? []) : []),
    lowerGrid?.crownCells ?? (!upperMesh && singleGrid ? singleGrid.crownCells : []),
    archPts,
    mean,
    up,
    e1,
    e2,
    toMm,
  );
  anterior.addScaledVector(up, -anterior.dot(up));
  if (anterior.lengthSq() < 1e-8) return null;
  anterior.normalize();

  const right = new THREE.Vector3().crossVectors(anterior, up).normalize();
  if (right.lengthSq() < 1e-8) return null;
  return { up, anterior, right };
}

/**
 * 악궁 하나의 교합면 법선(부호 없음)과 전치 쪽. 바이트 맞춤이 상악·하악 자세가 서로 맞는지 볼 때 쓴다.
 * 경계선으로 법선 부호를 정하지 않아 가볍다.
 */
export function archPlanAxes(points: Array<[number, number, number]>) {
  if (points.length < 30) return null;
  const mean = meanVec(points)!;
  const up = smallestPcaAxis(points, mean);
  if (up.lengthSq() < 1e-8) return null;
  up.normalize();
  const toMm = spanUnitsToMm(points, mean);
  const { e1, e2 } = planeBasis(up);
  const grid = extractJawCrownCells(points, mean, up, e1, e2, toMm, 1);
  const { anterior } = findMidlineAnteriorAxis([], grid.crownCells, points, mean, up, e1, e2, toMm);
  return { up, anterior, center: mean };
}

/** 교합평면·정중선을 기준으로 원점을 잡고, 위쪽(+Z)이 상악, 앞(+Y)이 전치(미드라인), 오른쪽(+X)이 환자 우측이 되게 돌린다. */
export function reseatOcclusalOrigin(loaded: readonly FrameMesh[], frame: DentalFrame) {
  const upperPts: Pt3[] = [];
  const lowerPts: Pt3[] = [];
  const archPts: Pt3[] = [];
  for (const entry of loaded) {
    if (entry.role !== "upper" && entry.role !== "lower") continue;
    const pts = samplePositions(entry.geometry, 2500);
    archPts.push(...pts);
    if (entry.role === "upper") upperPts.push(...pts);
    else lowerPts.push(...pts);
  }
  const mean = meanVec(archPts);
  if (!mean) return;
  const up = frame.up.clone().normalize();
  const { right, anterior } = frame;
  if (
    Math.abs(right.dot(anterior)) > 0.02 ||
    Math.abs(right.dot(up)) > 0.02 ||
    Math.abs(anterior.dot(up)) > 0.02 ||
    Math.abs(right.length() - 1) > 0.02 ||
    Math.abs(anterior.length() - 1) > 0.02 ||
    Math.abs(up.length() - 1) > 0.02
  ) {
    return;
  }

  // 교합평면 높이(up 방향)는 상악 치관 최하단과 하악 치관 최상단의 중앙(= 실제 교합평면 높이)에 맞춘다.
  const toMm = spanUnitsToMm(archPts, mean);
  const { e1, e2 } = planeBasis(up);
  let occLevel = mean.dot(up);
  let midlineRight = mean.dot(right);
  if (upperPts.length >= 30 && lowerPts.length >= 30) {
    const uGrid = extractJawCrownCells(upperPts, mean, up, e1, e2, toMm, -1);
    const lGrid = extractJawCrownCells(lowerPts, mean, up, e1, e2, toMm, 1);
    const uOccZ = uGrid.crownCells.map((c) => c.zUpMm / toMm).sort((a, b) => a - b);
    const lOccZ = lGrid.crownCells.map((c) => c.zUpMm / toMm).sort((a, b) => a - b);
    if (uOccZ.length >= 6 && lOccZ.length >= 6) {
      const uLow = quantileSorted(uOccZ, 0.12);
      const lHigh = quantileSorted(lOccZ, 0.88);
      occLevel = mean.dot(up) + 0.5 * (uLow + lHigh);
    }
    const midInfo = findMidlineAnteriorAxis(
      uGrid.crownCells,
      lGrid.crownCells,
      archPts,
      mean,
      up,
      e1,
      e2,
      toMm,
    );
    const midWorld = mean
      .clone()
      .addScaledVector(anterior.clone().cross(up).normalize(), midInfo.midlineOffsetRightMm / toMm);
    if (Math.abs(midInfo.midlineOffsetRightMm) > 0.01 && Math.abs(midInfo.midlineOffsetRightMm) < 25) {
      midlineRight = midWorld.dot(right);
    }
  }

  const origin = new THREE.Vector3()
    .addScaledVector(right, midlineRight)
    .addScaledVector(anterior, mean.dot(anterior))
    .addScaledVector(up, occLevel);

  const matrix = new THREE.Matrix4().set(
    right.x,
    right.y,
    right.z,
    -right.dot(origin),
    anterior.x,
    anterior.y,
    anterior.z,
    -anterior.dot(origin),
    up.x,
    up.y,
    up.z,
    -up.dot(origin),
    0,
    0,
    0,
    1,
  );
  for (const entry of loaded) {
    entry.geometry.applyMatrix4(matrix);
    entry.geometry.computeBoundingBox();
  }
}
