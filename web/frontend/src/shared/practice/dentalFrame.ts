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

export type AbutmentArchMark = {
  toothNumber: string;
  /** 픽스처 플랫폼 원점. 악궁 장축에 투영한다. */
  point: readonly [number, number, number];
};

/** 편악 근원심·협설: 인접치(A) 우선, 없으면 스캔바디/FDI/악궁(B). */
export type ArchMdBlResolve = {
  frame: DentalFrame;
  /** A 또는 B로 앞뒤를 잡음. */
  confirmed: boolean;
  /** 신호 없을 때 참고용 스캔바디 치아(수동 방향 도구). */
  pickToothNumber: string | null;
};

function fdiQuadrantPos(toothNumber: string): { quadrant: number; pos: number } | null {
  const digits = String(toothNumber || "").replace(/\D/g, "");
  if (!/^[1-4][1-8]$/.test(digits)) return null;
  return { quadrant: Number(digits[0]), pos: Number(digits[1]) };
}

function percentileOf(sorted: readonly number[], p: number) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx] ?? 0;
}

function finishArchFrame(
  frame: DentalFrame,
  up: THREE.Vector3,
  anterior: THREE.Vector3,
): DentalFrame {
  anterior.addScaledVector(up, -anterior.dot(up));
  if (anterior.lengthSq() < 1e-8) return frame;
  anterior.normalize();
  const right = new THREE.Vector3().crossVectors(anterior, up);
  if (right.lengthSq() < 1e-8) return frame;
  right.normalize();
  return { up, anterior, right };
}

/**
 * 근심·원심 클릭 한 점으로 앞(전치·근심) 축을 맞춘다.
 * 구치 큐브에서 앞=근심이므로, 근심 클릭 → anterior, 원심 클릭 → −anterior.
 */
export function orientAnteriorFromMesialDistalClick(
  frame: DentalFrame,
  origin: readonly [number, number, number],
  click: readonly [number, number, number],
  side: "mesial" | "distal",
): DentalFrame {
  const up = frame.up.clone().normalize();
  const dir = new THREE.Vector3(
    click[0]! - origin[0]!,
    click[1]! - origin[1]!,
    click[2]! - origin[2]!,
  );
  dir.addScaledVector(up, -dir.dot(up));
  if (dir.lengthSq() < 1e-8) return frame;
  dir.normalize();
  const anterior = side === "mesial" ? dir : dir.multiplyScalar(-1);
  return finishArchFrame(frame, up, anterior);
}

/**
 * 스캔바디 픽스처·FDI·인접치로 앞(+anterior = 전치·근심)을 잡는다.
 * 신호 A(인접치 크기/단면)가 있어야 자동 확정. B(스캔바디·FDI·악궁)가 있으면
 * A와 같아야 한다. A 없음·A·B 충돌이면 시드를 유지하고 클릭 폴백.
 */
export function resolveArchMdBlOrientation(
  frame: DentalFrame,
  marks: readonly AbutmentArchMark[],
  archPoints: readonly (readonly [number, number, number])[],
): ArchMdBlResolve {
  const pickToothNumber =
    marks.find((m) => fdiQuadrantPos(m.toothNumber))?.toothNumber ??
    marks[0]?.toothNumber ??
    null;
  const unchanged = (): ArchMdBlResolve => ({
    frame,
    confirmed: false,
    pickToothNumber,
  });

  const up = frame.up.clone().normalize();
  const seedAnt = frame.anterior.clone();
  seedAnt.addScaledVector(up, -seedAnt.dot(up));
  if (seedAnt.lengthSq() < 1e-8) return unchanged();
  seedAnt.normalize();

  const parsed: Array<{
    toothNumber: string;
    quadrant: number;
    pos: number;
    point: readonly [number, number, number];
  }> = [];
  for (const mark of marks) {
    const fdi = fdiQuadrantPos(mark.toothNumber);
    if (!fdi || !mark.point || mark.point.length < 3) continue;
    parsed.push({ toothNumber: mark.toothNumber, ...fdi, point: mark.point });
  }
  if (parsed.length === 0) return unchanged();

  const pts = archPoints.filter(
    (p): p is Pt3 => Boolean(p && p.length >= 3 && Number.isFinite(p[0]) && Number.isFinite(p[1])),
  );
  const mean = meanVec(pts);
  if (!mean || pts.length < 40) return unchanged();

  const toMm = spanUnitsToMm(pts, mean);
  const { e1, e2 } = planeBasis(up);
  let teeth: ToothHit[] = [];
  for (const occSign of [1, -1] as const) {
    const grid = extractJawCrownCells(pts, mean, up, e1, e2, toMm, occSign);
    const seg = segmentJawTeeth(grid.crownCells);
    const cand = absorbOpposing(classifyTeeth(seg.teeth));
    if (cand.length > teeth.length) teeth = cand;
  }

  // 교합면 후보 축 2개(PCA 장·단축). 협설을 장축으로 잡으면 큐브가 90° 돈다.
  const seedAxis: [number, number] = [e1.dot(seedAnt), e2.dot(seedAnt)];
  const seedLen = Math.hypot(seedAxis[0], seedAxis[1]);
  if (seedLen > 1e-6) {
    seedAxis[0] /= seedLen;
    seedAxis[1] /= seedLen;
  }
  let major = toothMajorAxis(teeth);
  if (!major && teeth.length >= 2) {
    const sorted = [...teeth].sort((a, b) => a.x - b.x || a.y - b.y);
    const a = sorted[0]!;
    const b = sorted[sorted.length - 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len >= 4) major = [dx / len, dy / len];
  }
  if (!major) {
    if (seedLen < 1e-6) return unchanged();
    major = [seedAxis[0], seedAxis[1]];
  }
  const minor: [number, number] = [-major[1], major[0]];

  const pointAlong = (point: readonly [number, number, number], ax: readonly [number, number]) => {
    const dx = (point[0]! - mean.x) * toMm;
    const dy = (point[1]! - mean.y) * toMm;
    const dz = (point[2]! - mean.z) * toMm;
    const xMm = dx * e1.x + dy * e1.y + dz * e1.z;
    const yMm = dx * e2.x + dy * e2.y + dz * e2.z;
    return xMm * ax[0] + yMm * ax[1];
  };

  const toothWeight = (t: ToothHit) =>
    t.cls === "M" ? t.area * 1.4 : t.cls === "P" ? t.area : t.area * 0.85;

  /** 신호 A = 인접치 크기/단면. 신호 B = 스캔바디 FDI·악궁 위치. */
  const scoreMdAxis = (ax: readonly [number, number]) => {
    let signalA: 1 | -1 | 0 = 0;
    let asymmetry = 0;
    let span = 0;
    const toothAlongs =
      teeth.length >= 2 ? teeth.map((t) => t.x * ax[0] + t.y * ax[1]) : null;
    if (toothAlongs) {
      span = Math.max(...toothAlongs) - Math.min(...toothAlongs);
      // 스캔바디 바로 옆·같은 치열 줄만: 가까운 큰 쪽=원심.
      const rx = -ax[1];
      const ry = ax[0];
      let distalOnPlus = 0;
      let decided = false;
      for (const mark of parsed) {
        const origin = pointAlong(mark.point, ax);
        const markDx = (mark.point[0]! - mean.x) * toMm;
        const markDy = (mark.point[1]! - mean.y) * toMm;
        const markDz = (mark.point[2]! - mean.z) * toMm;
        const markAcross =
          (markDx * e1.x + markDy * e1.y + markDz * e1.z) * rx +
          (markDx * e2.x + markDy * e2.y + markDz * e2.z) * ry;
        let plusNear: { rel: number; w: number } | null = null;
        let minusNear: { rel: number; w: number } | null = null;
        for (let ti = 0; ti < teeth.length; ti += 1) {
          const t = teeth[ti]!;
          const rel = toothAlongs[ti]! - origin;
          const ad = Math.abs(rel);
          if (ad < 3.0 || ad > 28) continue;
          const across = t.x * rx + t.y * ry;
          if (Math.abs(across - markAcross) > 5.0) continue;
          const w = toothWeight(t);
          if (rel > 0) {
            if (!plusNear || ad < plusNear.rel) plusNear = { rel: ad, w };
          } else if (!minusNear || ad < minusNear.rel) {
            minusNear = { rel: ad, w };
          }
        }
        if (plusNear && minusNear) {
          if (plusNear.w > minusNear.w * 1.08) {
            decided = true;
            distalOnPlus += 1;
            asymmetry += plusNear.w / Math.max(minusNear.w, 1);
          } else if (minusNear.w > plusNear.w * 1.08) {
            decided = true;
            distalOnPlus -= 1;
            asymmetry += minusNear.w / Math.max(plusNear.w, 1);
          }
        }
      }
      // 한쪽만 치아가 있으면(원심 대구치 결손) 그 치아를 원심으로 보지 않는다.
      // 옆 치아가 약하면 줄 양 끝 크기: 큰 쪽=원심.
      if (!decided && span >= 10 && parsed.length > 0) {
        const mark0 = parsed[0]!;
        const mdx = (mark0.point[0]! - mean.x) * toMm;
        const mdy = (mark0.point[1]! - mean.y) * toMm;
        const mdz = (mark0.point[2]! - mean.z) * toMm;
        const rowAcross =
          (mdx * e1.x + mdy * e1.y + mdz * e1.z) * rx +
          (mdx * e2.x + mdy * e2.y + mdz * e2.z) * ry;
        const loCut = Math.min(...toothAlongs) + span * 0.32;
        const hiCut = Math.max(...toothAlongs) - span * 0.32;
        let loBest = 0;
        let hiBest = 0;
        let loN = 0;
        let hiN = 0;
        for (let ti = 0; ti < teeth.length; ti += 1) {
          const along = toothAlongs[ti]!;
          const across = teeth[ti]!.x * rx + teeth[ti]!.y * ry;
          if (Math.abs(across - rowAcross) > 5.0) continue;
          const w = toothWeight(teeth[ti]!);
          if (along <= loCut) {
            loN += 1;
            if (w > loBest) loBest = w;
          } else if (along >= hiCut) {
            hiN += 1;
            if (w > hiBest) hiBest = w;
          }
        }
        if (loN > 0 && hiN > 0 && (hiBest > loBest * 1.1 || loBest > hiBest * 1.1)) {
          decided = true;
          asymmetry += Math.max(hiBest, loBest) / Math.max(Math.min(hiBest, loBest), 1);
          if (hiBest > loBest) distalOnPlus += 1;
          else distalOnPlus -= 1;
        }
      }
      // 결손 대구치: 전치(작은 단면)가 있는 쪽이 근심.
      if (!decided && parsed.length > 0 && teeth.length >= 3) {
        const mark0 = parsed[0]!;
        const mdx = (mark0.point[0]! - mean.x) * toMm;
        const mdy = (mark0.point[1]! - mean.y) * toMm;
        const mdz = (mark0.point[2]! - mean.z) * toMm;
        const rowAcross =
          (mdx * e1.x + mdy * e1.y + mdz * e1.z) * rx +
          (mdx * e2.x + mdy * e2.y + mdz * e2.z) * ry;
        let aAlong = 0;
        let aN = 0;
        let postAlong = 0;
        let postN = 0;
        for (let ti = 0; ti < teeth.length; ti += 1) {
          const across = teeth[ti]!.x * rx + teeth[ti]!.y * ry;
          if (Math.abs(across - rowAcross) > 6) continue;
          const along = toothAlongs[ti]!;
          if (teeth[ti]!.cls === "A") {
            aAlong += along;
            aN += 1;
          } else {
            postAlong += along;
            postN += 1;
          }
        }
        if (aN >= 1 && postN >= 1) {
          const aMean = aAlong / aN;
          const pMean = postAlong / postN;
          if (pMean > aMean + 4) {
            decided = true;
            distalOnPlus += 1;
          } else if (aMean > pMean + 4) {
            decided = true;
            distalOnPlus -= 1;
          }
        }
      }
      if (decided && distalOnPlus !== 0) signalA = distalOnPlus > 0 ? 1 : -1;
    }
    if ((!toothAlongs || teeth.length < 2) && parsed.length > 0) {
      const allAlong: number[] = [];
      for (const p of pts) {
        const dx = (p[0] - mean.x) * toMm;
        const dy = (p[1] - mean.y) * toMm;
        const dz = (p[2] - mean.z) * toMm;
        const xMm = dx * e1.x + dy * e1.y + dz * e1.z;
        const yMm = dx * e2.x + dy * e2.y + dz * e2.z;
        allAlong.push(xMm * ax[0] + yMm * ax[1]);
      }
      if (allAlong.length >= 20) {
        allAlong.sort((a, b) => a - b);
        span = allAlong[Math.floor(allAlong.length * 0.92)]! - allAlong[Math.floor(allAlong.length * 0.08)]!;
      }
    }

    // 신호 B: 같은 사분악 여러 픽스처(작은 번호=전치) 또는 단일 FDI 악궁 위치.
    let signalB: 1 | -1 | 0 = 0;
    let fdiOnPlus = 0;
    let fdiHits = 0;
    const byQuad = new Map<number, typeof parsed>();
    for (const row of parsed) {
      const list = byQuad.get(row.quadrant);
      if (list) list.push(row);
      else byQuad.set(row.quadrant, [row]);
    }
    for (const group of byQuad.values()) {
      if (group.length < 2) continue;
      for (let i = 0; i < group.length; i += 1) {
        for (let j = i + 1; j < group.length; j += 1) {
          const a = group[i]!;
          const b = group[j]!;
          const dPos = a.pos - b.pos;
          const dAlong = pointAlong(a.point, ax) - pointAlong(b.point, ax);
          if (dPos === 0 || Math.abs(dAlong) < 0.5) continue;
          fdiHits += 1;
          fdiOnPlus += dPos * dAlong < 0 ? -1 : 1;
        }
      }
    }
    // 픽스처가 둘 이상일 때만 FDI 순서를 쓴다.
    // 치아 하나인 편악은 장축 위 상대 위치가 잘린 스캔에서 부호가 뒤집힌다.
    if (fdiHits > 0 && fdiOnPlus !== 0) signalB = fdiOnPlus > 0 ? 1 : -1;

    const seedAlign = Math.abs(ax[0] * seedAxis[0] + ax[1] * seedAxis[1]);
    const score =
      (signalA !== 0 ? asymmetry * 4 + Math.min(span, 45) * 0.22 : Math.min(span, 45) * 0.05) +
      (signalB !== 0 ? 2.5 : 0) +
      seedAlign * 0.2;
    return { score, signalA, signalB, span };
  };

  const scored = [scoreMdAxis(major), scoreMdAxis(minor)];
  // 치아 중심이 길게 늘어선 쪽이 근원심이다.
  // 구개·잇몸처럼 짧은 축의 크기 투표가 더 커도 축을 바꾸지 않는다.
  let bestIdx = (scored[0]?.span ?? 0) >= (scored[1]?.span ?? 0) ? 0 : 1;
  if (Math.abs((scored[0]?.span ?? 0) - (scored[1]?.span ?? 0)) < 4) {
    const a0 = Math.abs(major[0] * seedAxis[0] + major[1] * seedAxis[1]);
    const a1 = Math.abs(minor[0] * seedAxis[0] + minor[1] * seedAxis[1]);
    bestIdx = a0 >= a1 ? 0 : 1;
  }
  const axis = bestIdx === 0 ? major : minor;
  const best = scored[bestIdx]!;
  // 자동: 인접치(A)를 우선하고, 없으면 FDI·악궁(B). A·B가 충돌하면 A.
  // 둘 다 없으면 시드를 유지한다(수동 방향 도구로 맞춘다).
  const distalSign =
    best.signalA !== 0 ? best.signalA : best.signalB !== 0 ? best.signalB : 0;
  if (distalSign === 0) {
    return {
      frame,
      confirmed: false,
      pickToothNumber: parsed[0]?.toothNumber ?? pickToothNumber,
    };
  }

  const anterior = new THREE.Vector3()
    .addScaledVector(e1, axis[0] * -distalSign)
    .addScaledVector(e2, axis[1] * -distalSign);
  return {
    frame: finishArchFrame(frame, up, anterior),
    confirmed: true,
    pickToothNumber: null,
  };
}

/**
 * 순측(전방)에서 볼 때: 세로 중앙선=미드라인, 가로 점선=교합면.
 * 화면 위=두개, 카메라 쪽=전치(앞). seedUp이 있으면 두개 쪽 부호를 맞춘다.
 */
export function dentalFrameFromViewOrientation(
  cameraQuaternion: THREE.Quaternion,
  seedUp?: THREE.Vector3 | null,
): DentalFrame {
  const viewDir = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuaternion);
  // 순측에서 보면 viewDir는 전→후. 앞(전치)은 카메라 쪽(−viewDir).
  const anterior = viewDir.clone().multiplyScalar(-1);
  if (anterior.lengthSq() < 1e-8) {
    return {
      up: new THREE.Vector3(0, 0, 1),
      anterior: new THREE.Vector3(1, 0, 0),
      right: new THREE.Vector3(0, 1, 0),
    };
  }
  anterior.normalize();
  let up = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraQuaternion);
  if (up.lengthSq() < 1e-8) up = new THREE.Vector3(0, 0, 1);
  else up.normalize();
  if (seedUp && seedUp.lengthSq() > 1e-8 && up.dot(seedUp) < 0) up.negate();
  return finishArchFrame(
    { up, anterior, right: new THREE.Vector3() },
    up,
    anterior,
  );
}

/**
 * 확정된 축만 적용. 신호 부족이면 입력 프레임을 그대로 둔다.
 */
export function orientAnteriorFromAbutmentFdi(
  frame: DentalFrame,
  marks: readonly AbutmentArchMark[],
  archPoints: readonly (readonly [number, number, number])[],
): DentalFrame {
  return resolveArchMdBlOrientation(frame, marks, archPoints).frame;
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
 * 편측(10·40번대 등) 치열: 치관만으로 전치 쪽 부호를 고른다.
 * 구개·치은 넓이는 쓰지 않는다 — 정중선 절단부 구개가 넓어 전치를 구치로 오인한다.
 * 전치·소구치 끝은 협설로 좁고 봉우리가 적고, 대구치 끝은 넓고 교합면 봉우리가 많다.
 * 악궁 오목(설·구개) 쪽으로 더 굽은 끝이 전치다.
 */
function unilateralAnteriorSign(samples: readonly Weighted2D[], ax: number, ay: number): 1 | -1 {
  if (samples.length < 10) return 1;
  const rx = ay;
  const ry = -ax;
  const proj = samples.map((s) => ({
    a: s.x * ax + s.y * ay,
    r: s.x * rx + s.y * ry,
    h: s.h,
    w: s.w,
  }));
  const as = proj.map((p) => p.a).sort((u, v) => u - v);
  const aSpan = quantileSorted(as, 0.97) - quantileSorted(as, 0.03);
  if (aSpan < 10) return 1;
  const aHi = quantileSorted(as, 0.86);
  const aLo = quantileSorted(as, 0.14);
  const band = Math.max(5.5, Math.min(11, aSpan * 0.22));

  const endStats = (side: "hi" | "lo") => {
    const edge = side === "hi" ? aHi : aLo;
    const pts = proj.filter((p) =>
      side === "hi" ? p.a >= edge - band : p.a <= edge + band,
    );
    if (pts.length < 3) {
      return { width: 0, peaks: 0, area: 0, meanAbsR: 0 };
    }
    const rs = pts.map((p) => p.r).sort((u, v) => u - v);
    const width = quantileSorted(rs, 0.9) - quantileSorted(rs, 0.1);
    let peaks = 0;
    let area = 0;
    let absR = 0;
    for (const p of pts) {
      area += p.w;
      absR += Math.abs(p.r) * p.w;
      if (p.w >= 1.35) peaks += 1;
    }
    return { width, peaks, area, meanAbsR: absR / Math.max(area, 1e-6) };
  };

  const hi = endStats("hi");
  const lo = endStats("lo");
  // 좁고 봉우리가 적은 끝이 전치·소구치, 넓고 봉우리가 많은 끝이 대구치.
  const widthGap = lo.width - hi.width;
  const peakGap = lo.peaks - hi.peaks;
  // +major(hi) 쪽이 더 전치하면 +1.
  if (Math.abs(widthGap) >= 1.0) return widthGap > 0 ? 1 : -1;
  if (peakGap !== 0) return peakGap > 0 ? 1 : -1;
  if (lo.area > hi.area * 1.15) return 1;
  if (hi.area > lo.area * 1.15) return -1;
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
  //    편측은 대칭 점수가 안 나와 best가 비고, 아래 치관 전·구치 판별로 넘어간다.
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

  // 2) 편측 사분악(10·40번대 등, 전치 정중선 미포함):
  //    끝 구간 폭은 쓰지 않는다. 전치가 휘어 모이면 그 끝이 대구치보다 넓어 앞뒤가 뒤집힌다.
  //    치아를 하나씩 나눠 짧은 폭·교합면 넓이로 대구치·소구치·전치를 가리고,
  //    편측 7칸(대구치 2·소구치 2·전치 3)에 빠진 칸을 두고 맞춘다. 큰 쪽이 구치다.
  const byToothSize = anteriorFromToothSizes(upperCrowns, lowerCrowns, e1, e2);
  if (byToothSize) {
    return { anterior: byToothSize, midlineOffsetRightMm: 0 };
  }
  return {
    anterior: anteriorFromCrownTaper(samples, e1, e2, majorDir),
    midlineOffsetRightMm: 0,
  };
}

type ToothClass = "M" | "P" | "A";

type RawTooth = {
  x: number;
  y: number;
  area: number;
  minor: number;
  major: number;
  cusps: number;
};

type ToothHit = RawTooth & { cls: ToothClass };

/** 편측 한쪽. 구치에서 전치로. 빠진 치아는 칸만 건너뛴다. */
const QUADRANT_TOOTH_TEMPLATE: readonly ToothClass[] = ["M", "M", "P", "P", "A", "A", "A"];

function heightBuckets(cells: readonly CrownCell[]): Map<string, CrownCell[]> {
  const map = new Map<string, CrownCell[]>();
  for (const c of cells) {
    const key = `${Math.round(c.xMm / 1.5)},${Math.round(c.yMm / 1.5)}`;
    const list = map.get(key);
    if (list) list.push(c);
    else map.set(key, [c]);
  }
  return map;
}

function heightNear(map: Map<string, CrownCell[]>, x: number, y: number, radiusMm: number): number | null {
  const gx = Math.round(x / 1.5);
  const gy = Math.round(y / 1.5);
  const r2 = radiusMm * radiusMm;
  let best = -Infinity;
  let found = false;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const list = map.get(`${gx + dx},${gy + dy}`);
      if (!list) continue;
      for (const c of list) {
        const ddx = c.xMm - x;
        const ddy = c.yMm - y;
        if (ddx * ddx + ddy * ddy > r2) continue;
        found = true;
        if (c.hOccMm > best) best = c.hOccMm;
      }
    }
  }
  return found ? best : null;
}

/** 교합면이 끊기지 않으면 같은 치아의 봉우리다. 치아 사이 골이 비거나 내려가면 다른 치아다. */
function ridgeHolds(
  a: CrownCell,
  b: CrownCell,
  map: Map<string, CrownCell[]>,
): boolean {
  const dist = Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm);
  if (dist > 9) return false;
  const steps = Math.max(1, Math.round(dist / 1.15));
  let minH = Infinity;
  for (let s = 1; s <= steps; s += 1) {
    const t = s / (steps + 1);
    const h = heightNear(map, a.xMm + (b.xMm - a.xMm) * t, a.yMm + (b.yMm - a.yMm) * t, 0.9);
    if (h == null) return false;
    if (h < minH) minH = h;
  }
  return Math.min(a.hOccMm, b.hOccMm) - minH < 1.45;
}

function localMaxima(cells: readonly CrownCell[]): CrownCell[] {
  const heights = cells.map((c) => c.hOccMm).sort((a, b) => a - b);
  const floor = quantileSorted(heights, 0.4);
  const band = cells.filter((c) => c.hOccMm >= floor);
  const maxima: CrownCell[] = [];
  for (const c of band) {
    let taller = false;
    for (const o of band) {
      if (o === c) continue;
      if (Math.hypot(o.xMm - c.xMm, o.yMm - c.yMm) <= 3.3 && o.hOccMm > c.hOccMm + 0.18) {
        taller = true;
        break;
      }
    }
    if (!taller) maxima.push(c);
  }
  maxima.sort((a, b) => b.hOccMm - a.hOccMm);
  const kept: CrownCell[] = [];
  for (const c of maxima) {
    if (kept.some((k) => Math.hypot(k.xMm - c.xMm, k.yMm - c.yMm) < 2.35)) continue;
    kept.push(c);
    if (kept.length >= 48) break;
  }
  return kept;
}

function spanOnAxis(pts: readonly CrownCell[], ax: number, ay: number): number {
  if (pts.length === 0) return 0;
  let mx = 0;
  let my = 0;
  for (const p of pts) {
    mx += p.xMm;
    my += p.yMm;
  }
  mx /= pts.length;
  my /= pts.length;
  const vals = pts.map((p) => (p.xMm - mx) * ax + (p.yMm - my) * ay).sort((a, b) => a - b);
  return quantileSorted(vals, 0.9) - quantileSorted(vals, 0.1);
}

function toothAxes(pts: readonly CrownCell[]): { minor: number; major: number } {
  if (pts.length < 3) return { minor: 0, major: 0 };
  let mx = 0;
  let my = 0;
  for (const p of pts) {
    mx += p.xMm;
    my += p.yMm;
  }
  mx /= pts.length;
  my /= pts.length;
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const p of pts) {
    const dx = p.xMm - mx;
    const dy = p.yMm - my;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  }
  const theta = 0.5 * Math.atan2(2 * xy, xx - yy);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const a = spanOnAxis(pts, c, s);
  const b = spanOnAxis(pts, -s, c);
  return { minor: Math.min(a, b), major: Math.max(a, b) };
}

function countCusps(pts: readonly CrownCell[]): number {
  const candidates: CrownCell[] = [];
  for (const c of pts) {
    const near: number[] = [];
    for (const o of pts) {
      if (Math.hypot(o.xMm - c.xMm, o.yMm - c.yMm) <= 4.2) near.push(o.hOccMm);
    }
    if (near.length < 3) continue;
    near.sort((a, b) => a - b);
    const base = quantileSorted(near, 0.45);
    if (c.hOccMm >= base + 0.28) candidates.push(c);
  }
  candidates.sort((a, b) => b.hOccMm - a.hOccMm);
  const kept: CrownCell[] = [];
  for (const c of candidates) {
    if (kept.some((k) => Math.hypot(k.xMm - c.xMm, k.yMm - c.yMm) < 2.7)) continue;
    kept.push(c);
    if (kept.length >= 6) break;
  }
  return kept.length;
}

function occlusalRelief(pts: readonly CrownCell[]): number {
  if (pts.length === 0) return 0;
  let top = -Infinity;
  const hs: number[] = [];
  for (const p of pts) {
    hs.push(p.hOccMm);
    if (p.hOccMm > top) top = p.hOccMm;
  }
  hs.sort((a, b) => a - b);
  // 절치 교두는 칸이 하나라 상위 분위수는 평면에 남는다. 최고점과 중앙을 비교한다.
  return top - quantileSorted(hs, 0.5);
}

/** 한 치아보다 긴 덩어리는 밀도 골에서 나눈다. 맞닿은 교합면이 한 덩어리로 붙은 경우다. */
function splitWideTooth(pts: readonly CrownCell[], depth: number): Array<{ pts: CrownCell[] }> {
  if (depth > 6 || pts.length < 10) return [{ pts: [...pts] }];
  let mx = 0;
  let my = 0;
  for (const p of pts) {
    mx += p.xMm;
    my += p.yMm;
  }
  mx /= pts.length;
  my /= pts.length;
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const p of pts) {
    const dx = p.xMm - mx;
    const dy = p.yMm - my;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  }
  const theta = 0.5 * Math.atan2(2 * xy, xx - yy);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const spanA = spanOnAxis(pts, c, s);
  const spanB = spanOnAxis(pts, -s, c);
  const majorIsA = spanA >= spanB;
  const ax = majorIsA ? c : -s;
  const ay = majorIsA ? s : c;
  const major = Math.max(spanA, spanB);
  if (major < 12.8) return [{ pts: [...pts] }];

  const proj = pts.map((p) => (p.xMm - mx) * ax + (p.yMm - my) * ay);
  let minS = Infinity;
  let maxS = -Infinity;
  for (const v of proj) {
    if (v < minS) minS = v;
    if (v > maxS) maxS = v;
  }
  const binW = 1.5;
  const nBins = Math.ceil((maxS - minS) / binW);
  if (nBins < 4) return [{ pts: [...pts] }];
  const counts = new Array<number>(nBins).fill(0);
  for (const v of proj) {
    const bin = Math.min(nBins - 1, Math.max(0, Math.floor((v - minS) / binW)));
    counts[bin] = (counts[bin] ?? 0) + 1;
  }
  let bestAt = -1;
  let bestScore = 0;
  for (let i = 1; i < nBins - 1; i += 1) {
    let leftPeak = 0;
    let rightPeak = 0;
    for (let k = 0; k < i; k += 1) leftPeak = Math.max(leftPeak, counts[k] ?? 0);
    for (let k = i + 1; k < nBins; k += 1) rightPeak = Math.max(rightPeak, counts[k] ?? 0);
    if (leftPeak < 3 || rightPeak < 3) continue;
    // 점이 이어진 능선은 나누지 않는다. 치아 사이처럼 빈 칸이 있을 때만 자른다.
    if ((counts[i] ?? 0) > 0) continue;
    const score = Math.min(leftPeak, rightPeak) - (counts[i] ?? 0);
    if (score > bestScore) {
      bestScore = score;
      bestAt = i;
    }
  }
  if (bestAt < 0) return [{ pts: [...pts] }];
  const cut = minS + (bestAt + 0.5) * binW;
  const left: CrownCell[] = [];
  const right: CrownCell[] = [];
  for (let i = 0; i < pts.length; i += 1) {
    if ((proj[i] ?? 0) < cut) left.push(pts[i]!);
    else right.push(pts[i]!);
  }
  if (left.length < 3 || right.length < 3) return [{ pts: [...pts] }];
  return [...splitWideTooth(left, depth + 1), ...splitWideTooth(right, depth + 1)];
}

function segmentJawTeeth(cells: readonly CrownCell[]): { teeth: RawTooth[]; connectedSheet: boolean } {
  if (cells.length < 8) return { teeth: [], connectedSheet: false };
  const map = heightBuckets(cells);
  const seeds = localMaxima(cells);
  if (seeds.length === 0) return { teeth: [], connectedSheet: false };
  const parent = seeds.map((_, i) => i);
  const find = (i: number): number => {
    let p = i;
    for (let guard = parent.length; guard > 0 && parent[p] !== p; guard -= 1) p = parent[p]!;
    return p;
  };
  for (let i = 0; i < seeds.length; i += 1) {
    for (let j = i + 1; j < seeds.length; j += 1) {
      if (!ridgeHolds(seeds[i]!, seeds[j]!, map)) continue;
      const a = find(i);
      const b = find(j);
      if (a !== b) parent[a] = b;
    }
  }
  const groups = new Map<number, CrownCell[]>();
  for (let i = 0; i < seeds.length; i += 1) {
    const root = find(i);
    const list = groups.get(root);
    if (list) list.push(seeds[i]!);
    else groups.set(root, [seeds[i]!]);
  }
  const groupList = [...groups.values()];
  const buckets: CrownCell[][] = groupList.map(() => []);
  for (const c of cells) {
    let best = -1;
    let bestD = 6.4;
    for (let g = 0; g < groupList.length; g += 1) {
      for (const seed of groupList[g]!) {
        const d = Math.hypot(c.xMm - seed.xMm, c.yMm - seed.yMm);
        if (d < bestD) {
          bestD = d;
          best = g;
        }
      }
    }
    if (best >= 0) buckets[best]!.push(c);
  }

  type Blob = { pts: CrownCell[] };
  let blobs: Blob[] = [];
  for (let g = 0; g < groupList.length; g += 1) {
    const pts = buckets[g]!;
    if (pts.length < 3) continue;
    blobs.push({ pts });
  }
  blobs = blobs.flatMap((blob) => splitWideTooth(blob.pts, 0));
  const centroid = (pts: readonly CrownCell[]) => {
    let x = 0;
    let y = 0;
    for (const p of pts) {
      x += p.xMm;
      y += p.yMm;
    }
    return { x: x / pts.length, y: y / pts.length };
  };
  const surfacesTouch = (a: readonly CrownCell[], b: readonly CrownCell[]) => {
    const step = a.length > 80 ? 3 : 1;
    for (let i = 0; i < a.length; i += step) {
      const p = a[i]!;
      for (const q of b) {
        if (Math.hypot(p.xMm - q.xMm, p.yMm - q.yMm) < 1.5) return true;
      }
    }
    return false;
  };
  for (let guard = blobs.length; guard > 0; guard -= 1) {
    let merged = false;
    outer: for (let i = 0; i < blobs.length; i += 1) {
      const ci = centroid(blobs[i]!.pts);
      for (let j = i + 1; j < blobs.length; j += 1) {
        const cj = centroid(blobs[j]!.pts);
        const close = Math.hypot(ci.x - cj.x, ci.y - cj.y) <= 6.2;
        if (!close && !surfacesTouch(blobs[i]!.pts, blobs[j]!.pts)) continue;
        blobs[i] = { pts: blobs[i]!.pts.concat(blobs[j]!.pts) };
        blobs.splice(j, 1);
        merged = true;
        break outer;
      }
    }
    if (!merged) break;
  }

  const out: RawTooth[] = [];
  let connectedSheet = false;
  for (const blob of blobs) {
    const c = centroid(blob.pts);
    const axes = toothAxes(blob.pts);
    const area = blob.pts.length * 4;
    const relief = occlusalRelief(blob.pts);
    if (area < 14 || area > 155) continue;
    if (axes.minor < 2.4) continue;
    // 빈 칸 없이 이어진 치열은 치아로 나누지 않는다. 끝 폭 판별에 맡긴다.
    if (axes.major > 16.8) {
      connectedSheet = true;
      continue;
    }
    // 구개·치은처럼 편평한 면은 치아가 아니다.
    if (relief < 0.2) continue;
    out.push({
      x: c.x,
      y: c.y,
      area,
      minor: axes.minor,
      major: axes.major,
      cusps: countCusps(blob.pts),
    });
  }
  return { teeth: out, connectedSheet };
}

function classifyTeeth(raw: readonly RawTooth[]): ToothHit[] {
  if (raw.length === 0) return [];
  let maxArea = 0;
  let maxMinor = 0;
  for (const t of raw) {
    if (t.area > maxArea) maxArea = t.area;
    if (t.minor > maxMinor) maxMinor = t.minor;
  }
  return raw.map((t) => {
    const rel = 0.55 * (t.area / maxArea) + 0.45 * (t.minor / Math.max(maxMinor, 0.001));
    let cls: ToothClass;
    if ((t.cusps >= 3 && rel >= 0.7) || (rel >= 0.82 && t.minor >= maxMinor * 0.75)) cls = "M";
    else if (rel <= 0.52 || (t.cusps <= 1 && t.area <= maxArea * 0.5 && t.minor <= maxMinor * 0.72)) cls = "A";
    else cls = "P";
    return { ...t, cls };
  });
}

function classCost(obs: ToothClass, slot: ToothClass): number {
  if (obs === slot) return 0;
  if ((obs === "M" && slot === "A") || (obs === "A" && slot === "M")) return 2.5;
  return 1.05;
}

/** 관찰된 치아 줄을 편측 7칸의 부분 수열에 맞춘다. 앞쪽 빈 칸은 공짜(소구치부터 찍힌 스캔). */
function templateCost(order: readonly ToothClass[]): number {
  const n = order.length;
  const m = QUADRANT_TOOTH_TEMPLATE.length;
  const inf = 1e6;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(inf));
  for (let j = 0; j <= m; j += 1) dp[0]![j] = 0;
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      let best = inf;
      for (let k = 0; k < j; k += 1) {
        const prev = dp[i - 1]![k]!;
        if (prev >= inf) continue;
        const gaps = j - 1 - k;
        const cost = prev + gaps * 0.4 + classCost(order[i - 1]!, QUADRANT_TOOTH_TEMPLATE[j - 1]!);
        if (cost < best) best = cost;
      }
      dp[i]![j] = best;
    }
  }
  let best = inf;
  for (let j = 1; j <= m; j += 1) best = Math.min(best, dp[n]![j]!);
  return best;
}

/** 뒤로 갈수록 치아가 커지면 벌점. 중절치가 측절치보다 조금 큰 정도는 넘긴다. */
function sizeDisorder(order: readonly RawTooth[]): number {
  let pen = 0;
  for (let i = 0; i < order.length; i += 1) {
    for (let j = i + 1; j < order.length; j += 1) {
      const growth = order[j]!.area / Math.max(order[i]!.area, 1);
      if (growth > 1.22) pen += Math.min(1.6, (growth - 1.22) * 2.2);
    }
  }
  return pen;
}

function toothMajorAxis(teeth: readonly RawTooth[]): [number, number] | null {
  if (teeth.length < 2) return null;
  let mx = 0;
  let my = 0;
  for (const t of teeth) {
    mx += t.x;
    my += t.y;
  }
  mx /= teeth.length;
  my /= teeth.length;
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const t of teeth) {
    const dx = t.x - mx;
    const dy = t.y - my;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  }
  if (xx + yy < 16) return null;
  const theta = 0.5 * Math.atan2(2 * xy, xx - yy);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const along = xx * c * c + 2 * xy * c * s + yy * s * s;
  const across = xx * s * s - 2 * xy * c * s + yy * c * c;
  return along >= across ? [c, s] : [-s, c];
}

function projectTeeth(teeth: readonly ToothHit[], ax: number, ay: number): ToothHit[] {
  return [...teeth].sort((a, b) => a.x * ax + a.y * ay - (b.x * ax + b.y * ay));
}

/** 양쪽 끝이 가운데보다 크면 말굽이다. 편측 크기 규칙을 쓰지 않는다. */
function bothEndsPosterior(sorted: readonly ToothHit[]): boolean {
  if (sorted.length < 4) return false;
  const mid = sorted[Math.floor(sorted.length / 2)]!;
  return sorted[0]!.area > mid.area * 1.22 && sorted[sorted.length - 1]!.area > mid.area * 1.22;
}

function absorbOpposing(teeth: readonly ToothHit[]): ToothHit[] {
  const used = new Array(teeth.length).fill(false);
  const order = teeth.map((t, i) => ({ t, i })).sort((a, b) => b.t.area - a.t.area);
  const out: ToothHit[] = [];
  for (const row of order) {
    if (used[row.i]) continue;
    used[row.i] = true;
    for (const other of order) {
      if (used[other.i]) continue;
      if (Math.hypot(other.t.x - row.t.x, other.t.y - row.t.y) <= 4.2) used[other.i] = true;
    }
    out.push(row.t);
  }
  return out;
}

function dropInternalSpecks(sorted: readonly ToothHit[]): ToothHit[] {
  return sorted.filter((t, i) => {
    if (i === 0 || i === sorted.length - 1) return true;
    const prev = sorted[i - 1]!;
    const next = sorted[i + 1]!;
    const ref = Math.min(prev.area, next.area);
    return !(t.cusps <= 1 && t.area < ref * 0.48 && t.minor < 4.6);
  });
}

/**
 * 편측에서 앞(전치) 방향.
 * 큰 치아가 구치, 작은 치아가 전치다. 빠진 치아·부정교합은 7칸 맞춤으로 넘긴다.
 * 치아가 안 나뉘거나 크기가 비슷하면 null. 그때는 끝 폭으로 돌아간다.
 */
function anteriorFromToothSizes(
  upper: readonly CrownCell[],
  lower: readonly CrownCell[],
  e1: THREE.Vector3,
  e2: THREE.Vector3,
): THREE.Vector3 | null {
  const upperSeg = segmentJawTeeth(upper);
  const lowerSeg = segmentJawTeeth(lower);
  if (upperSeg.connectedSheet || lowerSeg.connectedSheet) return null;
  const pooled = absorbOpposing([
    ...classifyTeeth(upperSeg.teeth),
    ...classifyTeeth(lowerSeg.teeth),
  ]);
  const axis = toothMajorAxis(pooled);
  if (!axis) return null;
  let sorted = dropInternalSpecks(projectTeeth(pooled, axis[0], axis[1]));
  if (sorted.length < 2 || bothEndsPosterior(sorted)) return null;
  const refined = toothMajorAxis(sorted);
  if (refined) sorted = dropInternalSpecks(projectTeeth(sorted, refined[0], refined[1]));
  const dir = refined ?? axis;
  if (sorted.length < 2 || bothEndsPosterior(sorted)) return null;

  let maxArea = 0;
  let minArea = Infinity;
  for (const t of sorted) {
    if (t.area > maxArea) maxArea = t.area;
    if (t.area < minArea) minArea = t.area;
  }
  if (!(maxArea / Math.max(minArea, 1) >= 1.3)) return null;

  const forward = sorted;
  const backward = [...sorted].reverse();
  const score = (order: readonly ToothHit[]) => templateCost(order.map((t) => t.cls)) + sizeDisorder(order);
  const forwardScore = score(forward);
  const backwardScore = score(backward);
  if (!Number.isFinite(forwardScore) || !Number.isFinite(backwardScore)) return null;
  let sign: 1 | -1 | 0 = 0;
  if (forwardScore + 0.75 <= backwardScore) sign = 1;
  else if (backwardScore + 0.75 <= forwardScore) sign = -1;
  if (sign === 0) return null;

  return new THREE.Vector3()
    .addScaledVector(e1, dir[0] * sign)
    .addScaledVector(e2, dir[1] * sign)
    .normalize();
}

/** 치관 협설 폭·교합 봉우리로 장축의 전치 쪽을 고른다. */
function anteriorFromCrownTaper(
  samples: readonly Weighted2D[],
  e1: THREE.Vector3,
  e2: THREE.Vector3,
  majorDir: readonly [number, number],
): THREE.Vector3 {
  const crownOnly = samples.filter((s) => s.isUpper || s.h > 0 || s.w >= 1.1);
  const axisPool = crownOnly.length >= 10 ? crownOnly : samples;
  const signMajor = unilateralAnteriorSign(axisPool, majorDir[0], majorDir[1]);
  return new THREE.Vector3()
    .addScaledVector(e1, majorDir[0] * signMajor)
    .addScaledVector(e2, majorDir[1] * signMajor)
    .normalize();
}

/**
 * 스캔 모델 전체를 파악해
 * 1) 치아(교합)와 잇몸(치은)으로 위(+up = 두개 쪽)를 잡고,
 * 2) 전치·구치로 앞(+anterior = 전치)과 뒤(구치)를 잡은 뒤,
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
