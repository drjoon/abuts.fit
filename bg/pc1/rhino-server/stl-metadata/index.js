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
 * STL 메타데이터 계산 (프론트 로직 포팅)
 */
async function calculateStlMetadata(filePath, finishLinePoints) {
  const buffer = fs.readFileSync(filePath);
  const loader = new STLLoader();

  let geometry = loader.parse(buffer.buffer);
  geometry = mergeVertices(geometry, 1e-5);
  geometry.computeBoundingBox();
  geometry.computeVertexNormals();

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

  // 2. 커넥션 직경 계산 (z=0 단면)
  let connectionMaxR = 0;
  const sliceTolerance = 1e-4;

  const addIntersection = (x1, y1, z1, x2, y2, z2) => {
    if ((z1 === 0 && z2 === 0) || z1 === z2) return;
    if ((z1 > 0 && z2 > 0) || (z1 < 0 && z2 < 0)) return;

    const t = z1 / (z1 - z2);
    if (t < 0 || t > 1) return;

    const ix = x1 + t * (x2 - x1);
    const iy = y1 + t * (y2 - y1);
    const r = Math.sqrt(ix * ix + iy * iy);
    if (r > connectionMaxR) connectionMaxR = r;
  };

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

    // z=0 근처 정점 체크
    if (Math.abs(v0.z) <= sliceTolerance) {
      const r = Math.sqrt(v0.x * v0.x + v0.y * v0.y);
      if (r > connectionMaxR) connectionMaxR = r;
    }
    if (Math.abs(v1.z) <= sliceTolerance) {
      const r = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
      if (r > connectionMaxR) connectionMaxR = r;
    }
    if (Math.abs(v2.z) <= sliceTolerance) {
      const r = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
      if (r > connectionMaxR) connectionMaxR = r;
    }

    // 엣지 교차점 체크
    addIntersection(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z);
    addIntersection(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
    addIntersection(v2.x, v2.y, v2.z, v0.x, v0.y, v0.z);
  }

  const connectionDiameter =
    connectionMaxR > 0 ? connectionMaxR * 2 : maxDiameter;

  // 3. 전체 길이 (Z축 범위)
  const totalLength = bbox.max.z - bbox.min.z;

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
    taperAngle,
    tiltAxisVector,
    frontPoint,
    taperGuide,
    bbox: {
      min: { x: bbox.min.x, y: bbox.min.y, z: bbox.min.z },
      max: { x: bbox.max.x, y: bbox.max.y, z: bbox.max.z },
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

  // 3. FrontPoint 계산 (프론트 로직: Top/Side 교점 중 최저 Z)
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
      // 법선 계산
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

  for (const { v, types } of vertexFaceTypes.values()) {
    if (types.has("top") && types.has("side")) {
      const dx = v.x - center.x;
      const dy = v.y - center.y;
      const distToAxis = Math.sqrt(dx * dx + dy * dy);

      if (distToAxis > minRadius && v.z < minZFront) {
        minZFront = v.z;
        bestFrontPoint = v;
      }
    }
  }

  let frontPoint = null;
  if (bestFrontPoint) {
    frontPoint = {
      x: Math.round(bestFrontPoint.x * 100) / 100,
      y: Math.round(bestFrontPoint.y * 100) / 100,
      z: Math.round(bestFrontPoint.z * 100) / 100,
    };
  }

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

    // JSON 출력 (표준 출력)
    console.log(JSON.stringify(metadata, null, 2));
    process.exit(0);
  } catch (error) {
    console.error("Error calculating STL metadata:", error.message);
    process.exit(1);
  }
})();
