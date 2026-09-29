// 상악·하악 스캔의 교합 축(위·앞·오른쪽)을 잡고, 교합면 중심을 원점으로 옮긴다.
// 뷰어와 백엔드 작업 스캔 자동 정렬이 같이 쓴다. three 외에 브라우저 API를 쓰지 않는다.
// - 2026-09-30: 양악이면 위는 항상 상악 중심 쪽. 로드 순서·마지막 악 하나로 부호를 뒤집지 않는다.
// related files:
// - web/frontend/src/shared/components/practice/OralScanOverlayViewer.tsx
// - web/frontend/src/shared/practice/workScanAutoAlign.ts
import * as THREE from "three";

export type FrameMesh = { role: string; geometry: THREE.BufferGeometry };

export type DentalFrame = {
  up: THREE.Vector3;
  anterior: THREE.Vector3;
  right: THREE.Vector3;
};

export function samplePositions(geometry: THREE.BufferGeometry, cap: number) {
  const pos = geometry.getAttribute("position");
  const out: Array<[number, number, number]> = [];
  if (!pos || pos.count === 0) return out;
  const stride = Math.max(1, Math.floor(pos.count / cap));
  for (let i = 0; i < pos.count; i += stride) {
    out.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  }
  return out;
}

export function meanVec(points: Array<[number, number, number]>): THREE.Vector3 | null {
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

function extractBoundaryVertices(geometry: THREE.BufferGeometry): Array<[number, number, number]> {
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
  const pts: Array<[number, number, number]> = [];
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
function spanUnitsToMm(points: Array<[number, number, number]>, mean: THREE.Vector3) {
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

/**
 * 파일 라벨이 치관 방향과 반대다.
 * 상악 치관은 하악 쪽으로, 하악 치관은 상악 쪽으로 난다.
 * 둘 다 그 반대면 라벨이 바뀐 것이다. 한쪽만 애매하면 그대로 둔다.
 */
export function jawsLookSwapped(loaded: readonly FrameMesh[]): boolean {
  const upper = loaded.find((entry) => entry.role === "upper");
  const lower = loaded.find((entry) => entry.role === "lower");
  if (!upper || !lower) return false;
  const upperPts = samplePositions(upper.geometry, 2500);
  const lowerPts = samplePositions(lower.geometry, 2500);
  const upperC = meanVec(upperPts);
  const lowerC = meanVec(lowerPts);
  const all = [...upperPts, ...lowerPts];
  const mean = meanVec(all);
  if (!upperC || !lowerC || !mean) return false;
  const towardUpper = upperC.clone().sub(lowerC);
  const gapMm = towardUpper.length() * spanUnitsToMm(all, mean);
  if (gapMm < 3 || towardUpper.lengthSq() < 1e-8) return false;
  towardUpper.normalize();
  const upperCrown = crownDirection(upper);
  const lowerCrown = crownDirection(lower);
  if (!upperCrown || !lowerCrown) return false;
  return upperCrown.dot(towardUpper) > 0.25 && lowerCrown.dot(towardUpper) < -0.25;
}

/** 상악·하악 중심 차이와 치열 형태로 교합 축을 잡는다. 메시 상대 위치는 바꾸지 않는다. */
export function estimateDentalFrame(loaded: readonly FrameMesh[]): DentalFrame | null {
  const upperPts: Array<[number, number, number]> = [];
  const lowerPts: Array<[number, number, number]> = [];
  const archPts: Array<[number, number, number]> = [];
  let upperMesh: FrameMesh | null = null;
  let lowerMesh: FrameMesh | null = null;

  for (const entry of loaded) {
    if (entry.role !== "upper" && entry.role !== "lower") continue;
    const pts = samplePositions(entry.geometry, 2500);
    archPts.push(...pts);
    if (entry.role === "upper") {
      upperPts.push(...pts);
      upperMesh = entry;
    } else {
      lowerPts.push(...pts);
      lowerMesh = entry;
    }
  }
  // 역할이 아직 지정되지 않았거나 bite 외 스캔만 있는 경우 대비
  if (archPts.length < 30) {
    for (const entry of loaded) {
      if (entry.role === "bite") continue;
      const pts = samplePositions(entry.geometry, 2500);
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
  let up = new THREE.Vector3();
  if (both && upperC && lowerC) {
    const delta = upperC.clone().sub(lowerC);
    if (delta.length() * toMm >= 3) up.copy(delta);
  }
  if (up.lengthSq() < 1e-4) {
    up = smallestPcaAxis(archPts, mean);
    if (both && upperC && lowerC && upperC.distanceToSquared(lowerC) > 1e-8) {
      if (up.dot(upperC.clone().sub(lowerC)) < 0) up.negate();
    } else {
      const single = upperMesh ?? lowerMesh;
      const crown = single ? crownDirection(single) : null;
      if (crown) {
        // lower: 치관 방향이 +up (cranial). upper: 치관 방향이 -up.
        const expectedUp = upperMesh && !lowerMesh ? crown.clone().negate() : crown;
        if (up.dot(expectedUp) < 0) up.negate();
      }
    }
  }
  if (up.lengthSq() < 1e-8) return null;
  up.normalize();

  const anterior = anteriorAxis(archPts, mean, up);
  const right = new THREE.Vector3().crossVectors(anterior, up).normalize();
  if (right.lengthSq() < 1e-8) return null;
  return { up, anterior, right };
}

/** 교합면 안에서 전치 쪽. 좌우로 벌어진 쪽이 구치다. up 부호와 무관하게 같은 쪽을 가리킨다. */
function anteriorAxis(
  archPts: Array<[number, number, number]>,
  mean: THREE.Vector3,
  up: THREE.Vector3,
): THREE.Vector3 {
  const tangent = Math.abs(up.z) < 0.9
    ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(1, 0, 0);
  const axisA = new THREE.Vector3().crossVectors(up, tangent).normalize();
  const axisB = new THREE.Vector3().crossVectors(up, axisA).normalize();

  let cxx = 0;
  let cxy = 0;
  let cyy = 0;
  const proj: Array<{ a: number; b: number }> = [];
  for (const p of archPts) {
    const dx = p[0] - mean.x;
    const dy = p[1] - mean.y;
    const dz = p[2] - mean.z;
    const a = dx * axisA.x + dy * axisA.y + dz * axisA.z;
    const b = dx * axisB.x + dy * axisB.y + dz * axisB.z;
    proj.push({ a, b });
    cxx += a * a;
    cxy += a * b;
    cyy += b * b;
  }
  const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const lAlong = cxx * ct * ct + 2 * cxy * ct * st + cyy * st * st;
  const lAcross = cxx * st * st - 2 * cxy * ct * st + cyy * ct * ct;
  let major = new THREE.Vector2(ct, st);
  let minor = new THREE.Vector2(-st, ct);
  if (lAcross > lAlong) {
    major = new THREE.Vector2(-st, ct);
    minor = new THREE.Vector2(ct, st);
  }

  const evalAxis = (axisVec: THREE.Vector2, perpVec: THREE.Vector2) => {
    const scores = proj.map((p) => p.a * axisVec.x + p.b * axisVec.y);
    const sorted = [...scores].sort((a, b) => a - b);
    const loCut = sorted[Math.floor(sorted.length * 0.1)] ?? sorted[0] ?? 0;
    const hiCut = sorted[Math.floor(sorted.length * 0.9)] ?? sorted[sorted.length - 1] ?? 0;
    const spread = (side: "lo" | "hi") => {
      let n = 0;
      let sum = 0;
      let sum2 = 0;
      for (let i = 0; i < proj.length; i += 1) {
        const score = scores[i] ?? 0;
        if (side === "lo" ? score > loCut : score < hiCut) continue;
        const perpScore = (proj[i]?.a ?? 0) * perpVec.x + (proj[i]?.b ?? 0) * perpVec.y;
        sum += perpScore;
        sum2 += perpScore * perpScore;
        n += 1;
      }
      if (n < 2) return 0;
      const avg = sum / n;
      return sum2 / n - avg * avg;
    };
    const loSpread = spread("lo");
    const hiSpread = spread("hi");
    return { loSpread, hiSpread, contrast: Math.abs(hiSpread - loSpread) };
  };

  const minorRes = evalAxis(minor, major);
  const majorRes = evalAxis(major, minor);
  const useMinor = minorRes.contrast >= majorRes.contrast;
  const chosenRes = useMinor ? minorRes : majorRes;
  const chosenAxis = useMinor ? minor : major;

  const chosenAxis3 = new THREE.Vector3()
    .addScaledVector(axisA, chosenAxis.x)
    .addScaledVector(axisB, chosenAxis.y)
    .normalize();

  // 좌우로 벌어진 쪽이 구치(원심), 모아진 쪽이 전치(협측이 바라보는 방향).
  return chosenRes.hiSpread < chosenRes.loSpread ? chosenAxis3 : chosenAxis3.negate();
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
  return { up, anterior: anteriorAxis(points, mean, up), center: mean };
}


function smallestPcaAxis(
  points: Array<[number, number, number]>,
  mean: THREE.Vector3,
): THREE.Vector3 {
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
  const axes = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ];
  const vars = [xx, yy, zz];
  let best = 0;
  if ((vars[1] ?? 0) < (vars[best] ?? 0)) best = 1;
  if ((vars[2] ?? 0) < (vars[best] ?? 0)) best = 2;
  const axis = axes[best] ?? new THREE.Vector3(0, 0, 1);
  if (xy * xy + xz * xz + yz * yz > 1) {
    const candidates = [
      new THREE.Vector3(yy + zz, -xy, -xz),
      new THREE.Vector3(-xy, xx + zz, -yz),
      new THREE.Vector3(-xz, -yz, xx + yy),
    ];
    let pick = candidates[0]!;
    let score = Infinity;
    for (const c of candidates) {
      if (c.lengthSq() < 1e-8) continue;
      const v = xx * c.x * c.x + yy * c.y * c.y + zz * c.z * c.z +
        2 * xy * c.x * c.y + 2 * xz * c.x * c.z + 2 * yz * c.y * c.z;
      if (v < score) {
        score = v;
        pick = c;
      }
    }
    if (pick.lengthSq() > 1e-8) return pick.normalize();
  }
  return axis;
}

/** 교합면 중심을 원점으로 두고, 위쪽이 상악, 앞이 전치가 되게 돌린다. */
export function reseatOcclusalOrigin(loaded: readonly FrameMesh[], frame: DentalFrame) {
  const upperPts: Array<[number, number, number]> = [];
  const lowerPts: Array<[number, number, number]> = [];
  const archPts: Array<[number, number, number]> = [];
  for (const entry of loaded) {
    if (entry.role !== "upper" && entry.role !== "lower") continue;
    const pts = samplePositions(entry.geometry, 1800);
    archPts.push(...pts);
    if (entry.role === "upper") upperPts.push(...pts);
    else lowerPts.push(...pts);
  }
  const mean = meanVec(archPts);
  if (!mean) return;
  const upperC = meanVec(upperPts);
  const lowerC = meanVec(lowerPts);
  const mid = upperC && lowerC ? upperC.clone().add(lowerC).multiplyScalar(0.5) : mean;
  const up = frame.up.clone().normalize();
  const shift =
    (mean.x - mid.x) * up.x + (mean.y - mid.y) * up.y + (mean.z - mid.z) * up.z;
  const origin = new THREE.Vector3(
    mean.x - up.x * shift,
    mean.y - up.y * shift,
    mean.z - up.z * shift,
  );
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
