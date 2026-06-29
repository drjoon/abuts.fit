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
  const directions = [];
  const angles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

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
    const dirPostStartZ = dirFinishLineZ + dirAvailableHeight * 0.3;
    const dirPostEndZ = dirFinishLineZ + dirAvailableHeight * 0.4;
    const dirPostHeight = dirPostEndZ - dirPostStartZ;

    if (dirPostHeight > 0.1) {
      const dirSamples = [];
      const sliceCount = 40;

      for (let s = 0; s <= sliceCount; s++) {
        const targetZ = dirPostStartZ + (dirPostHeight * s) / sliceCount;
        const tolerance = dirPostHeight / (sliceCount * 4);
        let maxRadiusInDir = -Infinity;

        for (let tri = 0; tri < triangleCount; tri++) {
          const i0 = index ? index.getX(tri * 3) : tri * 3;
          const i1 = index ? index.getX(tri * 3 + 1) : tri * 3 + 1;
          const i2 = index ? index.getX(tri * 3 + 2) : tri * 3 + 2;
          const v0 = readVertex(i0);
          const v1 = readVertex(i1);
          const v2 = readVertex(i2);

          // 정점 체크
          [v0, v1, v2].forEach((v) => {
            if (Math.abs(v.z - targetZ) <= tolerance) {
              const cx = v.x - center.x;
              const cy = v.y - center.y;
              const proj = cx * dx + cy * dy;
              if (proj > maxRadiusInDir) {
                maxRadiusInDir = proj;
              }
            }
          });

          // 엣지 교차점 체크
          const intersectEdgeDir = (a, b) => {
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
            const cx = ix - center.x;
            const cy = iy - center.y;
            const proj = cx * dx + cy * dy;
            if (proj > maxRadiusInDir) {
              maxRadiusInDir = proj;
            }
          };

          intersectEdgeDir(v0, v1);
          intersectEdgeDir(v1, v2);
          intersectEdgeDir(v2, v0);
        }

        if (maxRadiusInDir > -10) {
          dirSamples.push({ z: targetZ, radius: maxRadiusInDir });
        }
      }

      // 회귀선 계산
      if (dirSamples.length >= 6) {
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

          if (rSquared > 0.92) {
            const dirTaperAngleSigned = Math.atan(dirSlope) * (180 / Math.PI);
            directions.push({
              angle: angleDeg,
              slope: dirSlope,
              intercept: dirIntercept,
              taperAngle: dirTaperAngleSigned,
              rSquared,
              dirFinishLineZ,
              dirAvailableHeight,
            });
          }
        }
      }
    }
  }

  if (directions.length < 6) {
    return null;
  }

  // 2. Tilt axis vector 계산 (180도 쌍 분석)
  let taperAngle = 0;
  let tiltAxisVector = null;

  const pairedAverages = [];
  for (let baseAngle = 0; baseAngle < 180; baseAngle += 30) {
    const oppositeAngle = baseAngle + 180;
    const baseGuide = directions.find((g) => g.angle === baseAngle);
    const oppositeGuide = directions.find((g) => g.angle === oppositeAngle);

    if (baseGuide && oppositeGuide) {
      const trueTilt = (baseGuide.taperAngle - oppositeGuide.taperAngle) / 2;
      pairedAverages.push(Math.abs(trueTilt));
      baseGuide.taperAngle = trueTilt;
      oppositeGuide.taperAngle = -trueTilt;
    }
  }

  if (pairedAverages.length > 0) {
    taperAngle = Math.max(...pairedAverages);

    let localMaxTiltValue = -1;
    let localMaxTiltAngle = -1;
    let bestTrueTilt = 0;
    for (let baseAngle = 0; baseAngle < 180; baseAngle += 30) {
      const oppositeAngle = baseAngle + 180;
      const baseGuide = directions.find((g) => g.angle === baseAngle);
      const oppositeGuide = directions.find((g) => g.angle === oppositeAngle);
      if (baseGuide && oppositeGuide) {
        const tilt = Math.abs(baseGuide.taperAngle);
        if (tilt > localMaxTiltValue) {
          localMaxTiltValue = tilt;
          localMaxTiltAngle = baseAngle;
          bestTrueTilt = baseGuide.taperAngle;
        }
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
  }

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

  // FrontPoint 계산:
  // 1) Top/Side 교점 후보를 모은다(= 축면과 교합면 경계 후보)
  // 2) 경사축선(보라색선) 기준 20도 간격 18개 방향으로 교점을 뽑는다
  // 3) 뽑힌 교점 중 z가 가장 작은 점을 최종 frontPoint로 선택
  const minRadius = Math.max(1.0, maxDiameter * 0.15);
  const strictProjMin = maxProj - Math.min(1.2, totalLength * 0.12);

  const strictCandidates = [];
  const relaxedCandidates = [];

  for (const { v, types } of vertexFaceTypes.values()) {
    if (types.has("top") && types.has("side")) {
      const dx = v.x - center.x;
      const dy = v.y - center.y;
      const distToAxis = Math.sqrt(dx * dx + dy * dy);
      if (distToAxis <= minRadius) continue;

      const proj = v.x * tiltDir.x + v.y * tiltDir.y + v.z * tiltDir.z;
      const candidate = { v, dx, dy, proj, distToAxis };
      relaxedCandidates.push(candidate);
      if (proj >= strictProjMin) {
        strictCandidates.push(candidate);
      }
    }
  }

  // strict 필터는 고점 쪽으로 치우칠 수 있어 최저점 탐색에서는 relaxed 전체를 사용
  const baseCandidates = relaxedCandidates;

  // 보라색 측정선(최대 기울기 쌍) 방향
  const maxTilt = directions.reduce(
    (acc, g) => Math.max(acc, Math.abs(Number(g.taperAngle) || 0)),
    0,
  );
  const purpleGuideAngles = directions
    .filter(
      (g) => Math.abs(Math.abs(Number(g.taperAngle) || 0) - maxTilt) <= 0.05,
    )
    .map((g) => Number(g.angle))
    .filter((a) => Number.isFinite(a));

  const guideAnglesDeg = purpleGuideAngles;

  const lineBand = Math.max(0.2, maxDiameter * 0.03);
  const maxDistInPool = baseCandidates.reduce(
    (acc, cur) => Math.max(acc, cur.distToAxis),
    0,
  );
  const outerMinTight = Math.max(minRadius, maxDistInPool * 0.82);
  const outerMinRelaxed = Math.max(minRadius * 0.7, maxDistInPool * 0.62);

  const makeRadialAngles = (count) => {
    const baseAngle = Math.atan2(frontDir.y, frontDir.x);
    return Array.from({ length: count }, (_, i) => {
      let deg = ((baseAngle + (Math.PI * 2 * i) / count) * 180) / Math.PI;
      deg %= 360;
      if (deg < 0) deg += 360;
      return deg;
    });
  };

  const selectMinZPoint = (pool, dir, lateral) => {
    if (!pool.length) return null;

    let best = null;
    let bestZ = Infinity;
    let bestLateralAbs = Infinity;
    let bestAlongAbs = -Infinity;

    for (const c of pool) {
      const alongAbs = Math.abs(c.dx * dir.x + c.dy * dir.y);
      const lateralAbs = Math.abs(c.dx * lateral.x + c.dy * lateral.y);

      const isLowerZ = c.v.z < bestZ - 1e-6;
      const isSameZ = Math.abs(c.v.z - bestZ) <= 1e-6;
      const isBetterLineFit = lateralAbs < bestLateralAbs - 1e-6;
      const isSameLineFit = Math.abs(lateralAbs - bestLateralAbs) <= 1e-6;
      const isFurtherAlong = alongAbs > bestAlongAbs + 1e-6;

      if (
        isLowerZ ||
        (isSameZ && isBetterLineFit) ||
        (isSameZ && isSameLineFit && isFurtherAlong)
      ) {
        best = c;
        bestZ = c.v.z;
        bestLateralAbs = lateralAbs;
        bestAlongAbs = alongAbs;
      }
    }

    return best;
  };

  const pickIntersections = ({ angles, band, outerMin }) => {
    const hits = [];
    const outerPool = baseCandidates.filter((c) => c.distToAxis >= outerMin);

    for (const guideAngleDeg of angles) {
      const angleRad = (guideAngleDeg * Math.PI) / 180;
      const dir = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
      const lateral = { x: -dir.y, y: dir.x };

      const inBandPool = outerPool.filter(
        (c) => Math.abs(c.dx * lateral.x + c.dy * lateral.y) <= band,
      );

      // 밴드 내 교점이 없으면 동일 outerPool에서 무밴드 최저점 선택(누락 방지)
      const best =
        selectMinZPoint(inBandPool, dir, lateral) ||
        selectMinZPoint(outerPool, dir, lateral);

      if (best) hits.push(best.v);
    }

    return hits;
  };

  // 1차: 20개 직선(18° 간격) + 완화 조건
  const fallback20Angles = makeRadialAngles(20);
  const fallback20Hits = pickIntersections({
    angles: fallback20Angles,
    band: lineBand * 2.5,
    outerMin: outerMinRelaxed,
  });
  let directionIntersections = [...fallback20Hits];

  // 1차-보강: 20개 직선이 부족하면 36개 직선(10° 간격) 추가 시도
  let fallback36Hits = [];
  if (directionIntersections.length < 20) {
    const fallback36Angles = makeRadialAngles(36);
    fallback36Hits = pickIntersections({
      angles: fallback36Angles,
      band: lineBand * 2.5,
      outerMin: outerMinRelaxed,
    });

    if (fallback36Hits.length > 0) {
      directionIntersections = [...directionIntersections, ...fallback36Hits];
    }
  }

  // 2차: 보라색 가이드 각도 + 타이트 조건
  if (directionIntersections.length === 0 && guideAnglesDeg.length > 0) {
    directionIntersections = pickIntersections({
      angles: guideAnglesDeg,
      band: lineBand,
      outerMin: outerMinTight,
    });
  }

  // 3차: 보라색 가이드 각도 + 완화 조건
  if (directionIntersections.length === 0 && guideAnglesDeg.length > 0) {
    directionIntersections = pickIntersections({
      angles: guideAnglesDeg,
      band: lineBand * 2.2,
      outerMin: outerMinRelaxed,
    });
  }

  let frontPoint = null;
  if (directionIntersections.length > 0) {
    let minPoint = directionIntersections[0];
    for (const p of directionIntersections) {
      if (p.z < minPoint.z) {
        minPoint = p;
      }
    }
    frontPoint = {
      x: Math.round(minPoint.x * 100) / 100,
      y: Math.round(minPoint.y * 100) / 100,
      z: Math.round(minPoint.z * 100) / 100,
    };
  }

  console.error(
    `[frontPoint] candidates strict=${strictCandidates.length} relaxed=${relaxedCandidates.length} guides=${guideAnglesDeg.length} purpleGuides=${purpleGuideAngles.length} hits=${directionIntersections.length} hits20=${fallback20Hits.length} hits36=${fallback36Hits.length} lineBand=${lineBand.toFixed(3)} outerMinTight=${outerMinTight.toFixed(3)} outerMinRelaxed=${outerMinRelaxed.toFixed(3)} strictProjMin=${strictProjMin.toFixed(3)}`,
  );

  return {
    taperAngle,
    tiltAxisVector,
    frontPoint,
    taperGuide: {
      zStart: finishLineTopZ,
      zEnd: bbox.max.z,
      multiDirectionGuides: directions,
    },
  };
}

// 메인 실행
(async () => {
  try {
    const metadata = await calculateStlMetadata(stlFilePath, finishLinePoints);

    // 버전 확인용 주석 (Python 로그에서 확인 가능)
    // VERSION: 2026-06-30-v10-frontpoint-min-z-refactor

    // JSON 출력 (표준 출력)
    console.log(JSON.stringify(metadata, null, 2));
    process.exit(0);
  } catch (error) {
    console.error("Error calculating STL metadata:", error.message);
    process.exit(1);
  }
})();
