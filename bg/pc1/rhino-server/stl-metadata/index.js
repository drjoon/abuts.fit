/**
 * STL 메타데이터 계산 서비스
 * Three.js를 사용하여 STL 파일의 메타데이터(직경, 길이, 각도 등)를 계산
 *
 * Usage: node index.js <stl-file-path> [finish-line-points-json]
 */

import * as fs from "fs";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// CLI 인자 파싱
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error(
    "Usage: node index.js <stl-file-path> [finish-line-points-json]",
  );
  process.exit(1);
}

const stlFilePath = args[0];
const finishLinePointsJson = args[1] || null;

// 파일 존재 확인
if (!fs.existsSync(stlFilePath)) {
  console.error(`File not found: ${stlFilePath}`);
  process.exit(1);
}

// Finish line points 파싱
let finishLinePoints = null;
if (finishLinePointsJson) {
  try {
    finishLinePoints = JSON.parse(finishLinePointsJson);
  } catch (e) {
    console.error("Invalid finish line points JSON:", e.message);
    process.exit(1);
  }
}

/**
 * STL 모델의 좌표계 검증
 *
 * 정의: 어버트먼트는 원점(0,0) 중심, Z축 정렬이어야 함
 * 검증 기준:
 * 1. XY 평면 최대 직경이 15mm 이하
 * 2. 모델이 원점 근처에 위치 (중심이 원점에서 크게 벗어나지 않음)
 *
 * @param {THREE.BufferGeometry} geometry - 원본 geometry
 * @returns {Object} 검증 결과 { valid: boolean, error: string|null, info: object }
 */
function validateCoordinateSystem(geometry) {
  const bbox = geometry.boundingBox;
  const position = geometry.getAttribute("position");

  const xRange = bbox.max.x - bbox.min.x;
  const yRange = bbox.max.y - bbox.min.y;
  const zRange = bbox.max.z - bbox.min.z;

  // XY 평면 중심 계산
  const xCenter = (bbox.max.x + bbox.min.x) / 2;
  const yCenter = (bbox.max.y + bbox.min.y) / 2;
  const centerOffset = Math.sqrt(xCenter * xCenter + yCenter * yCenter);

  // XY 평면에서 최대 직경 계산
  let maxR = 0;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const r = Math.sqrt(x * x + y * y);
    if (r > maxR) maxR = r;
  }
  const xyMaxDiameter = maxR * 2;

  const validationInfo = {
    xyMaxDiameter: xyMaxDiameter,
    centerOffset: centerOffset,
    ranges: { x: xRange, y: yRange, z: zRange },
    bbox: {
      min: { x: bbox.min.x, y: bbox.min.y, z: bbox.min.z },
      max: { x: bbox.max.x, y: bbox.max.y, z: bbox.max.z },
    },
  };

  console.error(
    `[coordValidation] xyDiameter=${xyMaxDiameter.toFixed(2)}mm centerOffset=${centerOffset.toFixed(2)}mm`,
  );
  console.error(
    `[coordValidation] Ranges: X=${xRange.toFixed(2)} Y=${yRange.toFixed(2)} Z=${zRange.toFixed(2)}`,
  );
  console.error(
    `[coordValidation] Center: (${xCenter.toFixed(2)}, ${yCenter.toFixed(2)})`,
  );

  // 검증 1: XY 직경이 15mm 초과 → 좌표계 문제
  if (xyMaxDiameter > 15.0) {
    console.error(
      `[coordValidation] ERROR: XY diameter exceeds 15mm (${xyMaxDiameter.toFixed(2)}mm)`,
    );
    return {
      valid: false,
      error: `COORDINATE_ERROR: XY 평면 최대 직경이 ${xyMaxDiameter.toFixed(2)}mm로 15mm를 초과합니다. 모델을 원점(0,0) 중심으로 이동시켜주세요.`,
      info: validationInfo,
    };
  }

  // 검증 2: 중심이 원점에서 10mm 이상 벗어남 → 경고
  if (centerOffset > 10.0) {
    console.error(
      `[coordValidation] WARNING: Center offset from origin is ${centerOffset.toFixed(2)}mm`,
    );
    return {
      valid: false,
      error: `COORDINATE_WARNING: 모델 중심이 원점에서 ${centerOffset.toFixed(2)}mm 떨어져 있습니다. 원점(0,0) 중심으로 이동시켜주세요.`,
      info: validationInfo,
    };
  }

  console.error(`[coordValidation] PASS: Coordinate system is valid`);
  return {
    valid: true,
    error: null,
    info: validationInfo,
  };
}

/**
 * STL 메타데이터 계산 (프론트 로직 포팅)
 */
async function calculateStlMetadata(filePath, finishLinePoints) {
  const buffer = fs.readFileSync(filePath);
  const loader = new STLLoader();

  let geometry = loader.parse(buffer.buffer);
  geometry = mergeVertices(geometry, 1e-5);
  geometry.computeBoundingBox();
  geometry.computeVertexNormals();

  // 좌표계 검증
  const validation = validateCoordinateSystem(geometry);

  const bbox = geometry.boundingBox;
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();

  if (!bbox || !position) {
    throw new Error("Invalid STL geometry");
  }

  // 1. 최대 직경 계산 (전체)
  let maxR = 0;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const r = Math.sqrt(x * x + y * y);
    if (r > maxR) maxR = r;
  }
  const maxDiameter = maxR * 2;

  // 2. 커넥션 직경 계산 (z=0 평면 통과 edge intersection만 사용 → z에 대해 연속/monotonic)
  let connectionMaxR = 0;
  let pointCount = 0;

  const readVertex = (vertexIndex) => ({
    x: position.getX(vertexIndex),
    y: position.getY(vertexIndex),
    z: position.getZ(vertexIndex),
  });

  const triangleCount = index
    ? Math.floor(index.count / 3)
    : Math.floor(position.count / 3);

  for (let tri = 0; tri < triangleCount; tri++) {
    const i0 = index ? index.getX(tri * 3) : tri * 3;
    const i1 = index ? index.getX(tri * 3 + 1) : tri * 3 + 1;
    const i2 = index ? index.getX(tri * 3 + 2) : tri * 3 + 2;
    const v0 = readVertex(i0);
    const v1 = readVertex(i1);
    const v2 = readVertex(i2);

    // 엣지가 z=0을 통과하는 경우만 측정 (정점 측정은 step 함수가 되므로 제외)
    const addIntersection = (va, vb) => {
      if ((va.z > 0 && vb.z < 0) || (va.z < 0 && vb.z > 0)) {
        const denom = Math.abs(va.z - vb.z);
        if (denom < 1e-10) return;
        const t = Math.abs(va.z) / denom;
        const ix = va.x + t * (vb.x - va.x);
        const iy = va.y + t * (vb.y - va.y);
        const r = Math.sqrt(ix * ix + iy * iy);
        if (r > connectionMaxR) connectionMaxR = r;
        pointCount++;
      }
    };
    addIntersection(v0, v1);
    addIntersection(v1, v2);
    addIntersection(v2, v0);
  }

  const connectionDiameter =
    connectionMaxR > 0 ? connectionMaxR * 2 : maxDiameter;

  console.error(
    `[connectionDiameter] Z=0: maxR=${connectionMaxR.toFixed(6)}mm, d=${connectionDiameter.toFixed(6)}mm (${pointCount} edge points)`,
  );

  // 3. 전체 길이 (Z축 범위)
  const totalLength = bbox.max.z - bbox.min.z;

  // 3-1. L1 (원점 기준 포스트 최상단까지 거리)
  // process_abutment_stl.py 정렬 이후 기준 좌표계에서 max.z를 사용한다.
  const l1 = bbox.max.z;

  // 4. 테이퍼 계산 (finish line이 있는 경우에만)
  let taperAngle = 0;
  let tiltAxisVector = null;
  let frontPoint = null;
  let taperGuide = null;

  if (finishLinePoints && finishLinePoints.length >= 3) {
    const result = calculateTaperWithFinishLine(
      position,
      index,
      finishLinePoints,
      bbox,
    );

    if (result) {
      taperAngle = result.taperAngle;
      tiltAxisVector = result.tiltAxisVector;
      frontPoint = result.frontPoint;
      taperGuide = result.taperGuide;
    }
  }

  return {
    maxDiameter,
    connectionDiameter,
    totalLength,
    l1,
    taperAngle,
    tiltAxisVector,
    frontPoint,
    taperGuide,
    bbox: {
      min: { x: bbox.min.x, y: bbox.min.y, z: bbox.min.z },
      max: { x: bbox.max.x, y: bbox.max.y, z: bbox.max.z },
    },
    coordinateValidation: {
      valid: validation.valid,
      error: validation.error,
      xyMaxDiameter: validation.info.xyMaxDiameter,
      centerOffset: validation.info.centerOffset,
    },
  };
}

/**
 * Finish line 기반 테이퍼 계산 (프론트 로직 포팅)
 */
function calculateTaperWithFinishLine(position, index, finishLinePoints, bbox) {
  // Finish line Z 좌표 계산
  const finishLineZs = finishLinePoints
    .filter((p) => Array.isArray(p) && p.length >= 3)
    .map((p) => Number(p[2]))
    .filter((z) => Number.isFinite(z));

  if (finishLineZs.length === 0) {
    return null;
  }

  const finishLineTopZ = Math.max(...finishLineZs);
  const availableHeight = bbox.max.z - finishLineTopZ;

  if (availableHeight <= 0) {
    return null;
  }

  // 기하 중심 계산 (Z축 중심)
  const center = {
    x: (bbox.min.x + bbox.max.x) / 2,
    y: (bbox.min.y + bbox.max.y) / 2,
    z: (bbox.min.z + bbox.max.z) / 2,
  };

  const triangleCount = index
    ? Math.floor(index.count / 3)
    : Math.floor(position.count / 3);

  const readVertex = (vertexIndex) => ({
    x: position.getX(vertexIndex),
    y: position.getY(vertexIndex),
    z: position.getZ(vertexIndex),
  });

  // 1. Taper 계산 (12방향)
  //    - finish line 상방 구간에서만 측정
  //    - 순면/설면(상방 경사면) 영향 제거를 위해 side-like face만 사용
  const directions = [];
  const angles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

  const SIDE_FACE_MAX_ABS_NZ = 0.5;
  const SIDE_FACE_MIN_RADIAL_DOT = 0.15;
  const DIRECTION_FACE_MIN_DOT = 0.2;

  const triangleInfos = [];
  for (let tri = 0; tri < triangleCount; tri++) {
    const i0 = index ? index.getX(tri * 3) : tri * 3;
    const i1 = index ? index.getX(tri * 3 + 1) : tri * 3 + 1;
    const i2 = index ? index.getX(tri * 3 + 2) : tri * 3 + 2;

    const v0 = readVertex(i0);
    const v1 = readVertex(i1);
    const v2 = readVertex(i2);

    const e1 = { x: v1.x - v0.x, y: v1.y - v0.y, z: v1.z - v0.z };
    const e2 = { x: v2.x - v0.x, y: v2.y - v0.y, z: v2.z - v0.z };
    const normal = {
      x: e1.y * e2.z - e1.z * e2.y,
      y: e1.z * e2.x - e1.x * e2.z,
      z: e1.x * e2.y - e1.y * e2.x,
    };

    const normalLen = Math.sqrt(
      normal.x * normal.x + normal.y * normal.y + normal.z * normal.z,
    );
    if (normalLen < 1e-9) continue;

    const nx = normal.x / normalLen;
    const ny = normal.y / normalLen;
    const nz = normal.z / normalLen;
    const normalXYLen = Math.sqrt(nx * nx + ny * ny);

    const cx = (v0.x + v1.x + v2.x) / 3 - center.x;
    const cy = (v0.y + v1.y + v2.y) / 3 - center.y;
    const radialLen = Math.sqrt(cx * cx + cy * cy);

    let radialDot = 0;
    if (normalXYLen > 1e-9 && radialLen > 1e-9) {
      radialDot = (nx * cx + ny * cy) / (normalXYLen * radialLen);
    }

    const sideLike =
      Math.abs(nz) <= SIDE_FACE_MAX_ABS_NZ &&
      radialDot >= SIDE_FACE_MIN_RADIAL_DOT;

    triangleInfos.push({
      v0,
      v1,
      v2,
      nx,
      ny,
      normalXYLen,
      sideLike,
    });
  }

  const collectDirectionalSamples = (
    dx,
    dy,
    dirPostStartZ,
    dirPostHeight,
    useDirectionalNormalGate,
  ) => {
    const dirSamples = [];
    const surfacePoints = [];
    const sliceCount = 48;

    for (let s = 0; s <= sliceCount; s++) {
      const targetZ = dirPostStartZ + (dirPostHeight * s) / sliceCount;
      const tolerance = Math.max(0.01, dirPostHeight / (sliceCount * 4));
      let maxRadiusInDir = -Infinity;
      let bestPoint = null;

      for (const triInfo of triangleInfos) {
        if (!triInfo.sideLike) continue;

        if (useDirectionalNormalGate) {
          if (triInfo.normalXYLen < 1e-9) continue;
          const dirDot =
            (triInfo.nx * dx + triInfo.ny * dy) / triInfo.normalXYLen;
          if (dirDot < DIRECTION_FACE_MIN_DOT) continue;
        }

        // 정점 체크
        for (const v of [triInfo.v0, triInfo.v1, triInfo.v2]) {
          if (Math.abs(v.z - targetZ) <= tolerance) {
            const cx = v.x - center.x;
            const cy = v.y - center.y;
            const proj = cx * dx + cy * dy;
            if (proj > maxRadiusInDir) {
              maxRadiusInDir = proj;
              bestPoint = { x: v.x, y: v.y, z: targetZ };
            }
          }
        }

        // 엣지 교차점 체크
        const intersectEdgeDir = (a, b) => {
          if (
            (a.z < targetZ && b.z < targetZ) ||
            (a.z > targetZ && b.z > targetZ)
          ) {
            return;
          }
          if (Math.abs(a.z - b.z) < 1e-9) return;
          const t = (targetZ - a.z) / (b.z - a.z);
          if (t < 0 || t > 1) return;

          const ix = a.x + t * (b.x - a.x);
          const iy = a.y + t * (b.y - a.y);
          const cx = ix - center.x;
          const cy = iy - center.y;
          const proj = cx * dx + cy * dy;
          if (proj > maxRadiusInDir) {
            maxRadiusInDir = proj;
            bestPoint = { x: ix, y: iy, z: targetZ };
          }
        };

        intersectEdgeDir(triInfo.v0, triInfo.v1);
        intersectEdgeDir(triInfo.v1, triInfo.v2);
        intersectEdgeDir(triInfo.v2, triInfo.v0);
      }

      if (maxRadiusInDir > -10 && bestPoint) {
        dirSamples.push({ z: targetZ, radius: maxRadiusInDir });
        surfacePoints.push(bestPoint);
      }
    }

    return { dirSamples, surfacePoints };
  };

  for (const angleDeg of angles) {
    const angleRad = (angleDeg * Math.PI) / 180;
    const dx = Math.cos(angleRad);
    const dy = Math.sin(angleRad);

    // 각 방향의 finish line Z 찾기
    let dirFinishLineZ = finishLineTopZ;
    if (finishLinePoints.length > 0) {
      let minAngleDiff = Infinity;
      for (const p of finishLinePoints) {
        if (!Array.isArray(p) || p.length < 3) continue;
        const cx = Number(p[0]) - center.x;
        const cy = Number(p[1]) - center.y;
        let ptAngle = Math.atan2(cy, cx) * (180 / Math.PI);
        if (ptAngle < 0) ptAngle += 360;

        let angleDiff = Math.abs(ptAngle - angleDeg);
        if (angleDiff > 180) angleDiff = 360 - angleDiff;
        if (angleDiff < minAngleDiff) {
          minAngleDiff = angleDiff;
          dirFinishLineZ = Number(p[2]);
        }
      }
    }

    const dirAvailableHeight = bbox.max.z - dirFinishLineZ;

    // finish line 상방의 측벽을 충분히 포함하되, 최상단 순면/설면 영향은 side-like face로 차단
    const dirPostStartZ = dirFinishLineZ + dirAvailableHeight * 0.08;
    const dirPostEndZ = dirFinishLineZ + dirAvailableHeight * 0.78;
    const dirPostHeight = dirPostEndZ - dirPostStartZ;

    if (dirPostHeight <= 0.25) continue;

    let { dirSamples, surfacePoints } = collectDirectionalSamples(
      dx,
      dy,
      dirPostStartZ,
      dirPostHeight,
      true,
    );

    // 측벽 면적이 작을 때는 방향성 게이트를 완화해서 재시도
    if (dirSamples.length < 8) {
      ({ dirSamples, surfacePoints } = collectDirectionalSamples(
        dx,
        dy,
        dirPostStartZ,
        dirPostHeight,
        false,
      ));
    }

    // 회귀선 계산
    if (dirSamples.length >= 8) {
      const dirN = dirSamples.length;
      const dirSumZ = dirSamples.reduce((acc, cur) => acc + cur.z, 0);
      const dirSumR = dirSamples.reduce((acc, cur) => acc + cur.radius, 0);
      const dirMeanZ = dirSumZ / dirN;
      const dirMeanR = dirSumR / dirN;

      let dirNum = 0;
      let dirDenom = 0;
      for (const sample of dirSamples) {
        const dz = sample.z - dirMeanZ;
        dirNum += dz * (sample.radius - dirMeanR);
        dirDenom += dz * dz;
      }

      if (dirDenom > 1e-8) {
        const dirSlope = dirNum / dirDenom;
        const dirIntercept = dirMeanR - dirSlope * dirMeanZ;

        // R² 계산
        let ssRes = 0;
        let ssTot = 0;
        for (const sample of dirSamples) {
          const predicted = dirSlope * sample.z + dirIntercept;
          const residual = sample.radius - predicted;
          ssRes += residual * residual;
          const totalDev = sample.radius - dirMeanR;
          ssTot += totalDev * totalDev;
        }
        const rSquared = ssTot > 1e-8 ? 1 - ssRes / ssTot : 0;

        const dirTaperAngleSigned = Math.atan(dirSlope) * (180 / Math.PI);

        if (rSquared > 0.9 && Math.abs(dirTaperAngleSigned) <= 20) {
          directions.push({
            angle: angleDeg,
            slope: dirSlope,
            intercept: dirIntercept,
            taperAngle: dirTaperAngleSigned,
            rSquared,
            dirFinishLineZ,
            dirAvailableHeight,
            surfacePoints,
          });
        }
      }
    }
  }

  if (directions.length < 4) {
    return null;
  }

  // 2. Tilt axis vector 계산 (180도 쌍 분석)
  //    - 반대편 쌍의 절댓각도가 유사해야 "측벽"으로 인정
  //    - 한쪽이 순면/설면에 걸린 비대칭 쌍은 폐기
  let taperAngle = 0;
  let tiltAxisVector = null;

  const STRICT_ABS_DIFF_MAX = 2.5; // deg
  const STRICT_R2_MIN = 0.92;
  const RELAXED_ABS_DIFF_MAX = 5.0; // deg
  const RELAXED_R2_MIN = 0.88;

  const candidatePairs = [];
  for (let baseAngle = 0; baseAngle < 180; baseAngle += 30) {
    const oppositeAngle = baseAngle + 180;
    const baseGuide = directions.find((g) => g.angle === baseAngle);
    const oppositeGuide = directions.find((g) => g.angle === oppositeAngle);
    if (!baseGuide || !oppositeGuide) continue;

    const absA = Math.abs(baseGuide.taperAngle);
    const absB = Math.abs(oppositeGuide.taperAngle);
    const absDiff = Math.abs(absA - absB);
    const r2Min = Math.min(
      baseGuide.rSquared ?? 0,
      oppositeGuide.rSquared ?? 0,
    );
    const trueTilt = (baseGuide.taperAngle - oppositeGuide.taperAngle) / 2;

    candidatePairs.push({
      baseAngle,
      oppositeAngle,
      baseGuide,
      oppositeGuide,
      absDiff,
      r2Min,
      trueTilt,
    });
  }

  let selectedPairs = candidatePairs.filter(
    (p) => p.absDiff <= STRICT_ABS_DIFF_MAX && p.r2Min >= STRICT_R2_MIN,
  );

  if (selectedPairs.length === 0) {
    selectedPairs = candidatePairs.filter(
      (p) => p.absDiff <= RELAXED_ABS_DIFF_MAX && p.r2Min >= RELAXED_R2_MIN,
    );
  }

  // 그래도 없으면 "가장 대칭적인" 1쌍을 fallback으로 사용 (AAA 공백 방지)
  if (selectedPairs.length === 0 && candidatePairs.length > 0) {
    const bestPair = [...candidatePairs].sort((a, b) => {
      if (a.absDiff !== b.absDiff) return a.absDiff - b.absDiff;
      return b.r2Min - a.r2Min;
    })[0];
    if (bestPair) selectedPairs = [bestPair];
  }

  if (selectedPairs.length === 0) {
    return null;
  }

  // 시각화/소비 측에서는 pair-corrected 값을 사용
  for (const pair of selectedPairs) {
    pair.baseGuide.taperAngle = pair.trueTilt;
    pair.oppositeGuide.taperAngle = -pair.trueTilt;
  }

  const pairedAverages = selectedPairs.map((p) => Math.abs(p.trueTilt));
  taperAngle = Math.max(...pairedAverages);

  let localMaxTiltValue = -1;
  let localMaxTiltAngle = -1;
  let bestTrueTilt = 0;

  for (const pair of selectedPairs) {
    const tilt = Math.abs(pair.trueTilt);
    if (tilt > localMaxTiltValue) {
      localMaxTiltValue = tilt;
      localMaxTiltAngle = pair.baseAngle;
      bestTrueTilt = pair.trueTilt;
    }
  }

  if (localMaxTiltAngle !== -1) {
    const rad = localMaxTiltAngle * (Math.PI / 180);
    const tiltRad = Math.abs(bestTrueTilt) * (Math.PI / 180);
    const directionAngle = bestTrueTilt >= 0 ? rad : rad + Math.PI;

    tiltAxisVector = {
      x: Math.sin(tiltRad) * Math.cos(directionAngle),
      y: Math.sin(tiltRad) * Math.sin(directionAngle),
      z: Math.cos(tiltRad),
    };
  }

  const validAngles = new Set();
  for (const pair of selectedPairs) {
    validAngles.add(pair.baseAngle);
    validAngles.add(pair.oppositeAngle);
  }
  const filteredDirections = directions.filter((d) => validAngles.has(d.angle));

  // 3. FrontPoint 계산 (Top/Side 교점 + side 방향 보정)
  //
  // 1단계: tiltAxisVector 기준 Top/Side 교점 탐색 (기존 방식)
  //        - top face: tiltDir 방향 법선이 0.5 초과 & proj > topProjThreshold
  //        - side face: 그 외
  //        - 교점 정점 = top+side 양쪽 face에 속하는 정점
  // 2단계: 교점이 상방 홈 테두리에 떨어진 경우 보정
  //        - 교점 Z에서 tiltDir 반대 방향으로 sideOffset(0.5mm) 이동한 Z를 구함
  //        - 보정된 Z에서 frontDir(XY 경사 방향) 수평 ray로 mesh 재교차 → 포스트 측면 확정
  if (!tiltAxisVector) {
    tiltAxisVector = { x: 0, y: 0, z: 1 };
  }

  // tiltDir 정규화
  const tiltDirLen = Math.sqrt(
    tiltAxisVector.x * tiltAxisVector.x +
      tiltAxisVector.y * tiltAxisVector.y +
      tiltAxisVector.z * tiltAxisVector.z,
  );
  const tiltDir = {
    x: tiltAxisVector.x / tiltDirLen,
    y: tiltAxisVector.y / tiltDirLen,
    z: tiltAxisVector.z / tiltDirLen,
  };

  // tiltAxisVector의 XY 투영으로 수평 경사 방향(frontDir) 추출
  const xyLen = Math.sqrt(tiltDir.x * tiltDir.x + tiltDir.y * tiltDir.y);
  const frontDir =
    xyLen > 1e-6
      ? { x: tiltDir.x / xyLen, y: tiltDir.y / xyLen }
      : { x: 1, y: 0 };

  // 경사축 방향으로 가장 높은 투영값 찾기
  let maxProj = -Infinity;
  for (let tri = 0; tri < triangleCount; tri++) {
    for (let j = 0; j < 3; j++) {
      const idx = index ? index.getX(tri * 3 + j) : tri * 3 + j;
      const v = readVertex(idx);
      const proj = v.x * tiltDir.x + v.y * tiltDir.y + v.z * tiltDir.z;
      if (proj > maxProj) maxProj = proj;
    }
  }

  const totalLength = bbox.max.z - bbox.min.z;
  const topProjThreshold = maxProj - Math.min(2.0, totalLength * 0.2);

  // 정점 분류 (Top/Side)
  const vertexFaceTypes = new Map();
  const getVertexHash = (v) =>
    `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;

  for (let tri = 0; tri < triangleCount; tri++) {
    const i0 = index ? index.getX(tri * 3) : tri * 3;
    const i1 = index ? index.getX(tri * 3 + 1) : tri * 3 + 1;
    const i2 = index ? index.getX(tri * 3 + 2) : tri * 3 + 2;

    const v0 = readVertex(i0);
    const v1 = readVertex(i1);
    const v2 = readVertex(i2);

    const avgProj =
      ((v0.x + v1.x + v2.x) * tiltDir.x +
        (v0.y + v1.y + v2.y) * tiltDir.y +
        (v0.z + v1.z + v2.z) * tiltDir.z) /
      3;

    if (avgProj > topProjThreshold - 2.0) {
      const e1 = { x: v1.x - v0.x, y: v1.y - v0.y, z: v1.z - v0.z };
      const e2 = { x: v2.x - v0.x, y: v2.y - v0.y, z: v2.z - v0.z };
      const normal = {
        x: e1.y * e2.z - e1.z * e2.y,
        y: e1.z * e2.x - e1.x * e2.z,
        z: e1.x * e2.y - e1.y * e2.x,
      };
      const normalLen = Math.sqrt(
        normal.x * normal.x + normal.y * normal.y + normal.z * normal.z,
      );
      if (normalLen > 1e-9) {
        normal.x /= normalLen;
        normal.y /= normalLen;
        normal.z /= normalLen;
      }

      let faceType = "none";
      const dotProduct =
        normal.x * tiltDir.x + normal.y * tiltDir.y + normal.z * tiltDir.z;
      if (dotProduct > 0.5) {
        if (avgProj > topProjThreshold) {
          faceType = "top";
        }
      } else {
        faceType = "side";
      }

      if (faceType !== "none") {
        for (const vertex of [v0, v1, v2]) {
          const hash = getVertexHash(vertex);
          if (!vertexFaceTypes.has(hash)) {
            vertexFaceTypes.set(hash, { v: vertex, types: new Set() });
          }
          vertexFaceTypes.get(hash).types.add(faceType);
        }
      }
    }
  }

  // 최대 직경 계산 (전체 기하)
  let maxR = 0;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const r = Math.sqrt(x * x + y * y);
    if (r > maxR) maxR = r;
  }
  const maxDiameter = maxR * 2;

  // Top/Side 교점 중 최저 Z 찾기
  let bestFrontPoint = null;
  let minZFront = Infinity;
  const minRadius = Math.max(1.0, maxDiameter * 0.15);
  const strictProjMin = maxProj - Math.min(1.2, totalLength * 0.12);

  const strictCandidates = [];
  const relaxedCandidates = [];

  for (const { v, types } of vertexFaceTypes.values()) {
    if (types.has("top") && types.has("side")) {
      const dx = v.x - center.x;
      const dy = v.y - center.y;
      const distToAxis = Math.sqrt(dx * dx + dy * dy);

      if (distToAxis > minRadius) {
        const proj = v.x * tiltDir.x + v.y * tiltDir.y + v.z * tiltDir.z;
        relaxedCandidates.push(v);
        if (proj >= strictProjMin) {
          strictCandidates.push(v);
        }
      }
    }
  }

  const selectedCandidates =
    strictCandidates.length > 0 ? strictCandidates : relaxedCandidates;
  for (const v of selectedCandidates) {
    if (v.z < minZFront) {
      minZFront = v.z;
      bestFrontPoint = v;
    }
  }

  console.error(
    `[frontPoint] candidates strict=${strictCandidates.length} relaxed=${relaxedCandidates.length} strictProjMin=${strictProjMin.toFixed(3)}`,
  );

  let frontPoint = null;
  if (bestFrontPoint) {
    // 2단계: 교점에서 XY 평면상 frontDir(경사 방향, 바깥쪽)으로 0.2mm 이동한
    //        위치를 ray 출발점으로 삼아 같은 Z에서 mesh 재교차 → 포스트 측면 확정
    //
    // 이유: Top/Side 교점은 상방 홈 테두리에 걸릴 수 있다.
    //       포스트 외부(frontDir 방향)에서 안쪽으로 쏘면 홈이 아닌
    //       포스트 측면과의 교점을 얻을 수 있다.
    const xyShift = 0.2; // XY 바깥쪽으로 이동할 거리 (mm)
    const rayOriginX = bestFrontPoint.x + frontDir.x * xyShift;
    const rayOriginY = bestFrontPoint.y + frontDir.y * xyShift;
    const targetZ = bestFrontPoint.z;

    // targetZ 슬라이스에서 frontDir 방향 최대 반경 교점 탐색
    // (ray 출발점이 mesh 외부이므로, 교점이 bestFrontPoint보다 안쪽이어도 허용)
    const tolerance = 0.15;
    let bestProj = -Infinity;
    let bestX = bestFrontPoint.x;
    let bestY = bestFrontPoint.y;
    let found = false;

    for (let tri = 0; tri < triangleCount; tri++) {
      const i0 = index ? index.getX(tri * 3) : tri * 3;
      const i1 = index ? index.getX(tri * 3 + 1) : tri * 3 + 1;
      const i2 = index ? index.getX(tri * 3 + 2) : tri * 3 + 2;
      const v0 = readVertex(i0);
      const v1 = readVertex(i1);
      const v2 = readVertex(i2);

      for (const v of [v0, v1, v2]) {
        if (Math.abs(v.z - targetZ) <= tolerance) {
          const proj =
            (v.x - center.x) * frontDir.x + (v.y - center.y) * frontDir.y;
          if (proj > bestProj) {
            bestProj = proj;
            bestX = v.x;
            bestY = v.y;
            found = true;
          }
        }
      }

      const checkEdge = (a, b) => {
        if (
          (a.z < targetZ && b.z < targetZ) ||
          (a.z > targetZ && b.z > targetZ)
        )
          return;
        if (Math.abs(a.z - b.z) < 1e-9) return;
        const t = (targetZ - a.z) / (b.z - a.z);
        if (t < 0 || t > 1) return;
        const ix = a.x + t * (b.x - a.x);
        const iy = a.y + t * (b.y - a.y);
        const proj =
          (ix - center.x) * frontDir.x + (iy - center.y) * frontDir.y;
        if (proj > bestProj) {
          bestProj = proj;
          bestX = ix;
          bestY = iy;
          found = true;
        }
      };
      checkEdge(v0, v1);
      checkEdge(v1, v2);
      checkEdge(v2, v0);
    }

    frontPoint = {
      x: Math.round(bestX * 100) / 100,
      y: Math.round(bestY * 100) / 100,
      z: Math.round(targetZ * 100) / 100,
    };
  }

  return {
    taperAngle,
    tiltAxisVector,
    frontPoint,
    taperGuide: {
      zStart: finishLineTopZ,
      zEnd: bbox.max.z,
      multiDirectionGuides: filteredDirections,
    },
  };
}

// 메인 실행
(async () => {
  try {
    const metadata = await calculateStlMetadata(stlFilePath, finishLinePoints);

    // 버전 확인용 주석 (Python 로그에서 확인 가능)
    // VERSION: 2026-06-23-v5-opposite-pair-symmetry-fallback

    // JSON 출력 (표준 출력)
    console.log(JSON.stringify(metadata, null, 2));
    process.exit(0);
  } catch (error) {
    console.error("Error calculating STL metadata:", error.message);
    process.exit(1);
  }
})();
