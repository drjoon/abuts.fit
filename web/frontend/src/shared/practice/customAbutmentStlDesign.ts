// 매칭된 픽스쳐 자세와 구강스캔(인접치·잇몸·대합치)으로 커스텀어벗 닫힌 이진 STL을 생성한다.
// 로컬 좌표계(제조사 STL SSOT): 플랫폼 원점(0,0,0), +Z 임플란트 장축, +X 헥스 평면 법선.
// related files:
// - web/frontend/src/shared/practice/customAbutmentScanbodyMatch.ts
// - web/frontend/src/shared/files/stlBinaryWrite.ts
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
// - web/backend/services/abutmentStl/cuffConnectionSpecs.js

import * as THREE from "three";
import { encodeBinaryStl } from "@/shared/files/stlBinaryWrite";
import {
  cropScanPointsInFixtureFrame,
  fixturePoseToMatrix4,
  parseFdiTooth,
  type CustomAbutmentConnectionSpec,
  type FixtureWorldPose,
  type MatchedScanbodyFixture,
} from "@/shared/practice/customAbutmentScanbodyMatch";
import type { Vec3 } from "@/shared/practice/scanbodyRegistration";

const TAPER_11_SLOPE = Math.tan((11 * Math.PI) / 180);
const CUFF_START_SLOPE = Math.tan((2 * Math.PI) / 180);
const POST_TAPER_SLOPE = Math.tan((6 * Math.PI) / 180);
/** 2.5° 간격(144열) — 6각 헥스 모서리(30°+60°k)가 정확히 격자 위에 놓인다. */
const ANGULAR_COLS = 144;
const SECTORS = 36;
const MIN_WALL_MM = 0.5;

export type CustomAbutmentDesignMetrics = {
  connectionDiameterMm: number;
  maxDiameterMm: number;
  cuffHeightMinMm: number;
  cuffHeightMaxMm: number;
  postHeightMm: number;
  totalLengthMm: number;
  angulationDeg: number;
  rmsMm: number;
};

export type DesignedCustomAbutment = {
  toothNumber: string;
  jaw: "upper" | "lower";
  fileName: string;
  /** 픽스쳐 로컬 좌표(플랫폼 원점, +Z 장축) 삼각형 정점(9개씩). */
  localPositions: Float32Array;
  stlBlob: Blob;
  /** 스캔 월드 좌표로 배치된 Three.js BufferGeometry. */
  worldGeometry: THREE.BufferGeometry;
  /** 스캔 월드 좌표의 피니시라인 폐곡선(x,y,z 반복). */
  marginLoopWorld: Float32Array;
  fixture: MatchedScanbodyFixture;
  metrics: CustomAbutmentDesignMetrics;
};

function worldDirToFixtureLocal(dir: Vec3, pose: FixtureWorldPose): Vec3 {
  const x = dir[0] * pose.hexX[0] + dir[1] * pose.hexX[1] + dir[2] * pose.hexX[2];
  const y = dir[0] * pose.hexY[0] + dir[1] * pose.hexY[1] + dir[2] * pose.hexY[2];
  const z = dir[0] * pose.axis[0] + dir[1] * pose.axis[1] + dir[2] * pose.axis[2];
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

/** 저차 푸리에 조화함수(0~3차)로 둘레 배열을 매끄럽게 고른다. */
function lowPassCircular(values: readonly number[], maxHarmonic = 3): number[] {
  const n = values.length;
  let a0 = 0;
  for (const v of values) a0 += v / n;
  const cosC: number[] = [];
  const sinC: number[] = [];
  for (let k = 1; k <= maxHarmonic; k += 1) {
    let ac = 0;
    let bs = 0;
    for (let i = 0; i < n; i += 1) {
      const ang = (i / n) * Math.PI * 2 * k;
      ac += (values[i]! * Math.cos(ang) * 2) / n;
      bs += (values[i]! * Math.sin(ang) * 2) / n;
    }
    cosC.push(ac);
    sinC.push(bs);
  }
  return Array.from({ length: n }, (_, i) => {
    let sum = a0;
    for (let k = 1; k <= maxHarmonic; k += 1) {
      const ang = (i / n) * Math.PI * 2 * k;
      sum += cosC[k - 1]! * Math.cos(ang) + sinC[k - 1]! * Math.sin(ang);
    }
    return sum;
  });
}

function evalPeriodicLinear(samples: readonly number[], theta: number): number {
  const n = samples.length;
  let u = theta / (Math.PI * 2);
  u = u - Math.floor(u);
  const f = u * n;
  const i0 = Math.floor(f) % n;
  const i1 = (i0 + 1) % n;
  const t = f - Math.floor(f);
  return samples[i0]! * (1 - t) + samples[i1]! * t;
}

/** 치아 번호별 표준 치경부 반경(순설·근원심, mm). */
function nominalCervicalRadiiMm(toothNumber: string): { labialLingual: number; mesioDistal: number } {
  const p = parseFdiTooth(toothNumber);
  const pos = p?.pos ?? 6;
  if (pos === 1) return { labialLingual: 3.15, mesioDistal: 2.95 };
  if (pos === 2) return { labialLingual: 2.75, mesioDistal: 2.45 };
  if (pos === 3) return { labialLingual: 3.3, mesioDistal: 2.9 };
  if (pos === 4 || pos === 5) return { labialLingual: 3.45, mesioDistal: 2.85 };
  return { labialLingual: 4.15, mesioDistal: 3.85 };
}

/** 6각 헥스 단면 반경(모서리 라운드 포함). +X가 평면 법선(0°, 60°, ...). */
function hexOuterRadiusAt(theta: number, hexSizeMm: number): number {
  const flatR = hexSizeMm / 2;
  const cornerMaxR = (flatR / Math.cos(Math.PI / 6)) * 0.982;
  const sector = Math.PI / 3;
  let local = ((theta % sector) + sector) % sector;
  if (local > sector / 2) local = sector - local;
  const raw = flatR / Math.cos(local);
  return Math.min(raw, cornerMaxR);
}

function smootherstep(t: number) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * 스캔 점군(잇몸·인접치·대합치)으로 치아별 스캘럽 마진, 포스트 기울기, 높이를 산출한다.
 */
function computeAnatomicalEnvelope(args: {
  fixture: MatchedScanbodyFixture;
  jawLocalPts: Float32Array;
  opposingLocalPts: Float32Array;
}) {
  const { fixture, jawLocalPts, opposingLocalPts } = args;
  const conn = fixture.connectionSpec;
  const occLocal = worldDirToFixtureLocal(fixture.archOcclusalDir, fixture.fixturePose);
  const labialLocal = worldDirToFixtureLocal(fixture.labialDir, fixture.fixturePose);
  const labialAngle = Math.atan2(labialLocal[1], labialLocal[0]);

  const sbR = fixture.scanbodyRadiusMm;
  const sbH = fixture.scanbodyHeightMm;
  const coneTopR = conn.originDiameterMm / 2 + TAPER_11_SLOPE * conn.prcConeTopMm;

  // 1) 스캔바디 둘레 치은 높이 z_gingiva(θ) 측정
  const rawGingivaZ = new Array<number>(SECTORS).fill(Number.NaN);
  const sectorBuckets: number[][] = Array.from({ length: SECTORS }, () => []);
  for (let i = 0; i < jawLocalPts.length; i += 3) {
    const x = jawLocalPts[i]!;
    const y = jawLocalPts[i + 1]!;
    const z = jawLocalPts[i + 2]!;
    if (z < 0.7 || z > sbH - 0.8) continue;
    const r = Math.hypot(x, y);
    if (r < sbR + 0.35 || r > sbR + 2.6) continue;
    const b = Math.min(
      SECTORS - 1,
      Math.max(0, Math.floor((((Math.atan2(y, x) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / ((Math.PI * 2) / SECTORS))),
    );
    sectorBuckets[b]!.push(z);
  }
  const validGingiva: number[] = [];
  for (let b = 0; b < SECTORS; b += 1) {
    const bucket = sectorBuckets[b]!;
    if (bucket.length < 3) continue;
    bucket.sort((a, c) => a - c);
    const zAt = bucket[Math.floor(bucket.length * 0.3)]!;
    rawGingivaZ[b] = zAt;
    validGingiva.push(zAt);
  }
  validGingiva.sort((a, c) => a - c);
  const fallbackGingiva =
    validGingiva.length > 0
      ? validGingiva[Math.floor(validGingiva.length * 0.5)]!
      : Math.max(2.0, fixture.gingivaFloorMm + 0.6);

  // 빈 섹터는 양옆 유효 섹터 보간으로 채운다.
  for (let b = 0; b < SECTORS; b += 1) {
    if (Number.isFinite(rawGingivaZ[b]!)) continue;
    let prev = fallbackGingiva;
    let next = fallbackGingiva;
    let dPrev = SECTORS;
    let dNext = SECTORS;
    for (let step = 1; step < SECTORS; step += 1) {
      const lp = rawGingivaZ[(b - step + SECTORS) % SECTORS]!;
      if (dPrev === SECTORS && Number.isFinite(lp)) {
        prev = lp;
        dPrev = step;
      }
      const rn = rawGingivaZ[(b + step) % SECTORS]!;
      if (dNext === SECTORS && Number.isFinite(rn)) {
        next = rn;
        dNext = step;
      }
      if (dPrev < SECTORS && dNext < SECTORS) break;
    }
    rawGingivaZ[b] = (prev * dNext + next * dPrev) / Math.max(dPrev + dNext, 1);
  }

  // 순측은 잇몸 아래 약 0.45mm, 설측·인접면은 치은연 근처로 스캘럽 마진을 둔다.
  const minMarginZ = Math.max(1.25, conn.prcConeTopMm + 0.95);
  const marginTargets = rawGingivaZ.map((gz, b) => {
    const theta = (b / SECTORS) * Math.PI * 2;
    const labialness = Math.max(0, Math.cos(theta - labialAngle));
    const subgingival = 0.15 + 0.35 * labialness;
    return Math.max(minMarginZ, Math.min(8.6, gz - subgingival));
  });
  const smoothMarginZ = lowPassCircular(marginTargets, 2).map((z) =>
    Math.max(minMarginZ, Math.min(8.8, z)),
  );
  const meanMarginZ = smoothMarginZ.reduce((s, v) => s + v, 0) / SECTORS;

  // 2) 인접치 거리 측정 → 마진 외경 r_margin(θ) 결정
  const cervical = nominalCervicalRadiiMm(fixture.toothNumber);
  const adjMinR = new Array<number>(SECTORS).fill(Infinity);
  for (let i = 0; i < jawLocalPts.length; i += 3) {
    const x = jawLocalPts[i]!;
    const y = jawLocalPts[i + 1]!;
    const z = jawLocalPts[i + 2]!;
    if (z < meanMarginZ + 1.2 || z > meanMarginZ + 8.5) continue;
    const r = Math.hypot(x, y);
    if (r < sbR + 0.9 || r > 8.5) continue;
    const b = Math.min(
      SECTORS - 1,
      Math.max(0, Math.floor((((Math.atan2(y, x) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / ((Math.PI * 2) / SECTORS))),
    );
    if (r < adjMinR[b]!) adjMinR[b] = r;
  }

  const rawMarginR = Array.from({ length: SECTORS }, (_, b) => {
    const theta = (b / SECTORS) * Math.PI * 2;
    const cLab = Math.cos(theta - labialAngle);
    const sMes = Math.sin(theta - labialAngle);
    const anatR =
      (cervical.labialLingual * cervical.mesioDistal) /
      Math.hypot(cervical.mesioDistal * cLab, cervical.labialLingual * sMes);
    const adjLimit = Number.isFinite(adjMinR[b]!) ? adjMinR[b]! - 1.35 : anatR;
    const minR = Math.max(coneTopR + 0.55, conn.screwUpperDiameterMm / 2 + 0.95);
    return Math.max(minR, Math.min(anatR, Math.max(minR, adjLimit), 4.6));
  });
  const smoothMarginR = lowPassCircular(rawMarginR, 2);

  // 3) 보철 삽입축 방향 포스트 각도 보정(견치 등 순측 경사 식립 보정, 최대 16°)
  const rawTiltAngle = Math.acos(Math.max(-1, Math.min(1, occLocal[2])));
  const maxTiltRad = (16 * Math.PI) / 180;
  const compensatedRad = Math.min(rawTiltAngle * 0.78, maxTiltRad);
  const lateralLen = Math.hypot(occLocal[0], occLocal[1]);
  const tiltDirX = lateralLen > 1e-5 ? occLocal[0] / lateralLen : 0;
  const tiltDirY = lateralLen > 1e-5 ? occLocal[1] / lateralLen : 0;
  const postSlope = Math.tan(compensatedRad);
  const postShiftPerMm: [number, number] = [tiltDirX * postSlope, tiltDirY * postSlope];
  const angulationDeg = Math.round(((compensatedRad * 180) / Math.PI) * 10) / 10;

  // 4) 대합치·인접치 교합면 높이로 포스트 상단 높이 결정
  let oppMinZ = Infinity;
  for (let i = 0; i < opposingLocalPts.length; i += 3) {
    const x = opposingLocalPts[i]!;
    const y = opposingLocalPts[i + 1]!;
    const z = opposingLocalPts[i + 2]!;
    if (z <= meanMarginZ + 2.5) continue;
    const estPostH = Math.max(0, z - meanMarginZ);
    const cx = postShiftPerMm[0] * estPostH;
    const cy = postShiftPerMm[1] * estPostH;
    if (Math.hypot(x - cx, y - cy) <= 3.6 && z < oppMinZ) oppMinZ = z;
  }

  let adjCrownTopZ = -Infinity;
  const adjHeights: number[] = [];
  for (let i = 0; i < jawLocalPts.length; i += 3) {
    const r = Math.hypot(jawLocalPts[i]!, jawLocalPts[i + 1]!);
    const z = jawLocalPts[i + 2]!;
    if (r >= 4.2 && r <= 10.5 && z > meanMarginZ + 2) adjHeights.push(z);
  }
  if (adjHeights.length >= 20) {
    adjHeights.sort((a, c) => a - c);
    adjCrownTopZ = adjHeights[Math.floor(adjHeights.length * 0.92)]!;
  }

  const maxMarginZ = Math.max(...smoothMarginZ);
  let targetTopZ = maxMarginZ + 5.6;
  if (Number.isFinite(oppMinZ)) {
    targetTopZ = Math.min(oppMinZ - 1.65, maxMarginZ + 7.2);
  } else if (Number.isFinite(adjCrownTopZ) && adjCrownTopZ > maxMarginZ + 3) {
    targetTopZ = Math.min(adjCrownTopZ - 1.5, maxMarginZ + 7.2);
  }
  const postTopZ = Math.max(maxMarginZ + 4.0, Math.min(16.2, targetTopZ));

  // 전치·견치가 순측으로 기울어진 경우 순측 절단 사면(스크류홀 출구 사면)을 둔다.
  const parsed = parseFdiTooth(fixture.toothNumber);
  const isAnteriorOrCanine = (parsed?.pos ?? 6) <= 3;
  const labialBevelDropMm =
    isAnteriorOrCanine && angulationDeg >= 6
      ? Math.min(2.4, 0.8 + angulationDeg * 0.1)
      : Math.min(1.1, angulationDeg * 0.06);

  return {
    smoothMarginZ,
    smoothMarginR,
    meanMarginZ,
    postTopZ,
    postShiftPerMm,
    angulationDeg,
    labialAngle,
    labialBevelDropMm,
  };
}

/**
 * 매칭된 픽스쳐와 스캔으로부터 닫힌 2-매니폴드 커스텀어벗 STL을 생성한다.
 */
export function designCustomAbutmentStl(args: {
  fixture: MatchedScanbodyFixture;
  jawGeometry: THREE.BufferGeometry;
  opposingGeometry: THREE.BufferGeometry | null;
  patientName?: string;
}): DesignedCustomAbutment {
  const { fixture, jawGeometry, opposingGeometry } = args;
  const conn = fixture.connectionSpec;
  const jawLocalPts = cropScanPointsInFixtureFrame(jawGeometry, fixture.fixturePose, 12.5);
  const opposingLocalPts = cropScanPointsInFixtureFrame(
    opposingGeometry,
    fixture.fixturePose,
    11.5,
  );

  const env = computeAnatomicalEnvelope({
    fixture,
    jawLocalPts,
    opposingLocalPts,
  });

  const boreBotR = conn.screwLowerDiameterMm / 2;
  const boreTopR = conn.screwUpperDiameterMm / 2;
  const originR = conn.originDiameterMm / 2;
  const coneTopZ = conn.prcConeTopMm;
  const coneTopR = originR + TAPER_11_SLOPE * coneTopZ;
  const l2 = conn.l2Mm;
  const zBot = -l2;
  const seatZ0 = 0.8;
  const seatZ1 = 1.3;

  // 헥스 상단 → 11° 원뿔 전환 높이
  const hexFlatR = conn.hexSizeMm ? conn.hexSizeMm / 2 : originR - TAPER_11_SLOPE * (l2 * 0.45);
  const hexCornerR = conn.hexSizeMm
    ? (hexFlatR / Math.cos(Math.PI / 6)) * 0.982
    : hexFlatR;
  const coneStartZ = Math.max(
    zBot + 0.75,
    Math.min(-0.25, (hexCornerR - originR) / TAPER_11_SLOPE),
  );

  const cuffRows = 22;
  const postRows = 16;
  const boreRows = 10;

  // 각 열(θ)마다 닫힌 자오선 프로파일 점 배열 [x, y, z]을 생성한다.
  // 순서: 하단 내경 → 하단 외경 → 헥스 → 11° 원뿔 → 치은 커프 → 피니시라인 챔퍼 → 포스트 → 상단 라운드 → 스크류홀 내벽
  const columns: Vec3[][] = [];
  const marginLoopLocal: number[] = [];
  let maxOuterR = 0;

  for (let col = 0; col < ANGULAR_COLS; col += 1) {
    const theta = (col / ANGULAR_COLS) * Math.PI * 2;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);

    const zMargin = evalPeriodicLinear(env.smoothMarginZ, theta);
    const rMargin = evalPeriodicLinear(env.smoothMarginR, theta);
    marginLoopLocal.push(rMargin * ct, rMargin * st, zMargin);

    const pts: Vec3[] = [];
    const pushCyl = (r: number, z: number) => {
      const safeR = Math.max(r, boreBotR + 0.08);
      if (safeR > maxOuterR && z >= 0) maxOuterR = safeR;
      pts.push([safeR * ct, safeR * st, z]);
    };

    // 1) 하단 바닥 링(내경 → 모따기 외경)
    pts.push([boreBotR * ct, boreBotR * st, zBot]);
    const hexR = conn.hexSizeMm ? hexOuterRadiusAt(theta, conn.hexSizeMm) : hexCornerR;
    const botChamferR = Math.max(boreBotR + 0.14, hexR - 0.16);
    pushCyl(botChamferR, zBot);
    pushCyl(hexR, zBot + 0.14);

    // 2) 헥스 구간 (zBot+0.14 .. coneStartZ)
    pushCyl(hexR, coneStartZ - 0.06);
    const coneStartR = Math.max(hexR, originR + TAPER_11_SLOPE * coneStartZ);
    pushCyl(coneStartR, coneStartZ);

    // 3) 11° 원뿔 커넥션 구간 (coneStartZ .. Z=0 .. coneTopZ)
    pushCyl(originR, 0);
    pushCyl(coneTopR, coneTopZ);

    // 4) 치은 출현 커프(coneTopZ → zMargin): 2° 출발 S-커브로 뼈 간섭 없이 부드럽게 상승
    const cuffSpan = Math.max(0.35, zMargin - coneTopZ);
    for (let k = 1; k <= cuffRows; k += 1) {
      const u = k / cuffRows;
      const z = coneTopZ + cuffSpan * u;
      const linearBase = coneTopR + CUFF_START_SLOPE * (z - coneTopZ);
      const flare = smootherstep(u);
      // 상단 마진 직전은 완만한 볼록 지지로 피니시라인 날개 두께 확보
      const support = Math.sin(Math.PI * u) * Math.min(0.18, (rMargin - coneTopR) * 0.09) * u;
      const r = linearBase + flare * (rMargin - linearBase) + support;
      pushCyl(r, z);
    }

    // 5) 피니시라인 챔퍼 숄더(내측으로 약 0.55mm 챔퍼 단) + 테이퍼 포스트
    const chamferW = Math.min(0.62, Math.max(0.42, (rMargin - (boreTopR + MIN_WALL_MM)) * 0.28));
    const postBaseR = Math.max(boreTopR + MIN_WALL_MM + 0.18, rMargin - chamferW);

    // 순측 회전방지 평면(anti-rotation flat) 감쇠
    const labialCos = Math.cos(theta - env.labialAngle);
    const antiRotFactor = labialCos > 0.35 ? 1 - (labialCos - 0.35) * 0.14 : 1;

    // 순측 사면이 있는 경우 순측 상단 높이를 낮춘다.
    const topDrop = env.labialBevelDropMm * Math.max(0, labialCos);
    const colTopZ = Math.max(zMargin + 2.6, env.postTopZ - topDrop);
    const postSpan = Math.max(1.8, colTopZ - (zMargin + 0.24));

    const pushPostPoint = (localR: number, z: number, centerBlend: number) => {
      const aboveMargin = Math.max(0, z - env.meanMarginZ);
      const sx = env.postShiftPerMm[0] * aboveMargin * centerBlend;
      const sy = env.postShiftPerMm[1] * aboveMargin * centerBlend;
      let px = sx + localR * ct;
      let py = sy + localR * st;
      // +Z 스크류홀(원점 중심 반경 boreTopR)과의 최소 벽 두께 보장
      const distFromBoreAxis = Math.hypot(px, py);
      const minAllowed = boreTopR + MIN_WALL_MM;
      if (distFromBoreAxis < minAllowed) {
        const scaleUp = minAllowed / Math.max(distFromBoreAxis, 1e-5);
        px *= scaleUp;
        py *= scaleUp;
      }
      const radWorld = Math.hypot(px, py);
      if (radWorld > maxOuterR) maxOuterR = radWorld;
      pts.push([px, py, z]);
    };

    // 피니시라인 챔퍼 2단 필렛
    pushPostPoint((rMargin + postBaseR) * 0.5, zMargin + 0.1, 0.04);
    pushPostPoint(postBaseR, zMargin + 0.24, 0.08);

    // 포스트 외벽 상승
    const topEdgeBevel = 0.28;
    const wallTopZ = colTopZ - topEdgeBevel;
    let lastPostR = postBaseR;
    for (let k = 1; k <= postRows; k += 1) {
      const u = k / postRows;
      const z = zMargin + 0.24 + (wallTopZ - (zMargin + 0.24)) * u;
      const taperLoss = POST_TAPER_SLOPE * (z - (zMargin + 0.24));
      const flatBlend = smootherstep(Math.min(1, u * 1.4));
      const shapeScale = 1 - (1 - antiRotFactor) * flatBlend;
      const localR = Math.max(boreTopR + MIN_WALL_MM + 0.1, (postBaseR - taperLoss) * shapeScale);
      lastPostR = localR;
      pushPostPoint(localR, z, smootherstep(Math.min(1, u * 1.15)));
    }

    // 6) 상단 교합면 라운드 챔퍼 → 스크류홀 입구 림
    const holeExitZ = Math.max(seatZ1 + 0.8, colTopZ - 0.12);
    const midTopR = Math.max(boreTopR + 0.22, lastPostR - 0.24);
    pushPostPoint(midTopR, colTopZ, 1);
    pts.push([(boreTopR + 0.12) * ct, (boreTopR + 0.12) * st, colTopZ - 0.04]);
    pts.push([boreTopR * ct, boreTopR * st, holeExitZ]);

    // 7) 내부 스크류 채널 하강(holeExitZ → seatZ1 → seatZ0 → zBot)
    for (let k = 1; k <= boreRows; k += 1) {
      const u = k / boreRows;
      const z = holeExitZ + (seatZ1 - holeExitZ) * u;
      pts.push([boreTopR * ct, boreTopR * st, z]);
    }
    pts.push([((boreTopR + boreBotR) * 0.5) * ct, ((boreTopR + boreBotR) * 0.5) * st, (seatZ1 + seatZ0) * 0.5]);
    pts.push([boreBotR * ct, boreBotR * st, seatZ0]);
    pts.push([boreBotR * ct, boreBotR * st, 0]);

    columns.push(pts);
  }

  const ringCount = columns[0]!.length;
  const triCount = ANGULAR_COLS * ringCount * 2;
  const localPositions = new Float32Array(triCount * 9);
  let outOffset = 0;

  const writeTri = (a: Vec3, b: Vec3, c: Vec3) => {
    localPositions[outOffset++] = a[0];
    localPositions[outOffset++] = a[1];
    localPositions[outOffset++] = a[2];
    localPositions[outOffset++] = b[0];
    localPositions[outOffset++] = b[1];
    localPositions[outOffset++] = b[2];
    localPositions[outOffset++] = c[0];
    localPositions[outOffset++] = c[1];
    localPositions[outOffset++] = c[2];
  };

  for (let col = 0; col < ANGULAR_COLS; col += 1) {
    const nextCol = (col + 1) % ANGULAR_COLS;
    const colA = columns[col]!;
    const colB = columns[nextCol]!;
    for (let r = 0; r < ringCount; r += 1) {
      const nextR = (r + 1) % ringCount;
      const p00 = colA[r]!;
      const p10 = colB[r]!;
      const p11 = colB[nextR]!;
      const p01 = colA[nextR]!;
      writeTri(p00, p10, p11);
      writeTri(p00, p11, p01);
    }
  }

  const cleanPatient = String(args.patientName || "")
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, "");
  const fileName = cleanPatient
    ? `${cleanPatient}_${fixture.toothNumber}_custom_abutment.stl`
    : `custom_abutment_${fixture.toothNumber}.stl`;
  const stlBlob = encodeBinaryStl(
    localPositions,
    `abuts.fit custom abutment #${fixture.toothNumber}`,
  );

  // 월드 좌표 BufferGeometry 생성
  const toWorld = fixturePoseToMatrix4(fixture.fixturePose);
  const worldGeometry = new THREE.BufferGeometry();
  worldGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(localPositions.slice(), 3),
  );
  worldGeometry.applyMatrix4(toWorld);
  worldGeometry.computeVertexNormals();
  worldGeometry.computeBoundingBox();

  // 피니시라인 월드 루프
  const marginLoopWorld = new Float32Array(marginLoopLocal.length);
  const tmp = new THREE.Vector3();
  for (let i = 0; i < marginLoopLocal.length; i += 3) {
    tmp
      .set(marginLoopLocal[i]!, marginLoopLocal[i + 1]!, marginLoopLocal[i + 2]!)
      .applyMatrix4(toWorld);
    marginLoopWorld[i] = tmp.x;
    marginLoopWorld[i + 1] = tmp.y;
    marginLoopWorld[i + 2] = tmp.z;
  }

  let zMinLocal = Infinity;
  let zMaxLocal = -Infinity;
  for (let i = 2; i < localPositions.length; i += 3) {
    const z = localPositions[i]!;
    if (z < zMinLocal) zMinLocal = z;
    if (z > zMaxLocal) zMaxLocal = z;
  }

  const cuffMin = Math.min(...env.smoothMarginZ);
  const cuffMax = Math.max(...env.smoothMarginZ);

  return {
    toothNumber: fixture.toothNumber,
    jaw: fixture.jaw,
    fileName,
    localPositions,
    stlBlob,
    worldGeometry,
    marginLoopWorld,
    fixture,
    metrics: {
      connectionDiameterMm: conn.originDiameterMm,
      maxDiameterMm: Math.round(maxOuterR * 2 * 100) / 100,
      cuffHeightMinMm: Math.round(cuffMin * 100) / 100,
      cuffHeightMaxMm: Math.round(cuffMax * 100) / 100,
      postHeightMm: Math.round((zMaxLocal - env.meanMarginZ) * 100) / 100,
      totalLengthMm: Math.round((zMaxLocal - zMinLocal) * 100) / 100,
      angulationDeg: env.angulationDeg,
      rmsMm: fixture.rmsMm,
    },
  };
}
