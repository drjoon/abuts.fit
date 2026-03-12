/**
 * STL 메타데이터 계산 서비스
 * Three.js를 사용하여 STL 파일의 메타데이터(직경, 길이, 각도 등)를 계산
 * 
 * Usage: node index.js <stl-file-path> [finish-line-points-json]
 */

import * as fs from 'fs';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// CLI 인자 파싱
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node index.js <stl-file-path> [finish-line-points-json]');
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
    console.error('Invalid finish line points JSON:', e.message);
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
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();

  if (!bbox || !position) {
    throw new Error('Invalid STL geometry');
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

  const connectionDiameter = connectionMaxR > 0 ? connectionMaxR * 2 : maxDiameter;

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
      bbox
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
  const finishLineZs = finishLinePoints.map(p => p[2]);
  const finishLineZ = finishLineZs.reduce((a, b) => a + b, 0) / finishLineZs.length;

  // Front point 계산 (finish line 포인트들의 중심)
  const frontPoint = {
    x: finishLinePoints.reduce((sum, p) => sum + p[0], 0) / finishLinePoints.length,
    y: finishLinePoints.reduce((sum, p) => sum + p[1], 0) / finishLinePoints.length,
    z: finishLineZ,
  };

  // 사용 가능한 높이 계산
  const availableHeight = bbox.max.z - finishLineZ;
  if (availableHeight <= 0) {
    return null;
  }

  // 다방향 테이퍼 계산 (8방향)
  const directions = [];
  const angleStep = 360 / 8;

  for (let i = 0; i < 8; i++) {
    const angleDeg = i * angleStep;
    const angleRad = (angleDeg * Math.PI) / 180;
    const dx = Math.cos(angleRad);
    const dy = Math.sin(angleRad);

    const directionResult = calculateDirectionalTaper(
      position,
      index,
      frontPoint,
      finishLineZ,
      availableHeight,
      dx,
      dy
    );

    if (directionResult) {
      directions.push({
        angle: angleDeg,
        ...directionResult,
      });
    }
  }

  if (directions.length === 0) {
    return null;
  }

  // 평균 테이퍼 각도 계산
  const avgTaperAngle = directions.reduce((sum, d) => sum + d.taperAngle, 0) / directions.length;

  // Tilt axis vector 계산 (가장 큰 각도 차이 방향)
  const maxTaperDir = directions.reduce((max, d) => 
    Math.abs(d.taperAngle) > Math.abs(max.taperAngle) ? d : max
  );

  const tiltAxisVector = {
    x: Math.cos((maxTaperDir.angle * Math.PI) / 180),
    y: Math.sin((maxTaperDir.angle * Math.PI) / 180),
    z: 0,
  };

  return {
    taperAngle: avgTaperAngle,
    tiltAxisVector,
    frontPoint,
    taperGuide: {
      zStart: finishLineZ,
      zEnd: bbox.max.z,
      multiDirectionGuides: directions,
    },
  };
}

/**
 * 특정 방향의 테이퍼 계산
 */
function calculateDirectionalTaper(position, index, frontPoint, finishLineZ, availableHeight, dx, dy) {
  const samples = [];
  const zStep = availableHeight / 20; // 20 샘플

  for (let i = 1; i <= 20; i++) {
    const sampleZ = finishLineZ + i * zStep;
    const maxR = findMaxRadiusAtZ(position, index, sampleZ, dx, dy);
    
    if (maxR > 0) {
      samples.push({ z: sampleZ, r: maxR });
    }
  }

  if (samples.length < 3) {
    return null;
  }

  // 선형 회귀
  const n = samples.length;
  const sumZ = samples.reduce((sum, s) => sum + s.z, 0);
  const sumR = samples.reduce((sum, s) => sum + s.r, 0);
  const sumZZ = samples.reduce((sum, s) => sum + s.z * s.z, 0);
  const sumZR = samples.reduce((sum, s) => sum + s.z * s.r, 0);

  const slope = (n * sumZR - sumZ * sumR) / (n * sumZZ - sumZ * sumZ);
  const intercept = (sumR - slope * sumZ) / n;

  // R² 계산
  const meanR = sumR / n;
  const ssTot = samples.reduce((sum, s) => sum + Math.pow(s.r - meanR, 2), 0);
  const ssRes = samples.reduce((sum, s) => {
    const predicted = slope * s.z + intercept;
    return sum + Math.pow(s.r - predicted, 2);
  }, 0);
  const rSquared = 1 - ssRes / ssTot;

  // 테이퍼 각도 계산 (라디안 -> 도)
  const taperAngle = Math.atan(slope) * (180 / Math.PI);

  return {
    slope,
    intercept,
    taperAngle,
    rSquared,
    surfacePoints: samples.map(s => ({
      x: frontPoint.x + dx * s.r,
      y: frontPoint.y + dy * s.r,
      z: s.z,
    })),
  };
}

/**
 * 특정 Z 높이에서 특정 방향의 최대 반경 찾기
 */
function findMaxRadiusAtZ(position, index, targetZ, dx, dy) {
  const tolerance = 0.5; // Z 높이 허용 오차
  let maxR = 0;

  const triangleCount = index
    ? Math.floor(index.count / 3)
    : Math.floor(position.count / 3);

  for (let tri = 0; tri < triangleCount; tri++) {
    const i0 = index ? index.getX(tri * 3) : tri * 3;
    const i1 = index ? index.getX(tri * 3 + 1) : tri * 3 + 1;
    const i2 = index ? index.getX(tri * 3 + 2) : tri * 3 + 2;

    const v0 = {
      x: position.getX(i0),
      y: position.getY(i0),
      z: position.getZ(i0),
    };
    const v1 = {
      x: position.getX(i1),
      y: position.getY(i1),
      z: position.getZ(i1),
    };
    const v2 = {
      x: position.getX(i2),
      y: position.getY(i2),
      z: position.getZ(i2),
    };

    // 삼각형이 목표 Z 높이와 교차하는지 확인
    const minZ = Math.min(v0.z, v1.z, v2.z);
    const maxZ = Math.max(v0.z, v1.z, v2.z);

    if (targetZ < minZ - tolerance || targetZ > maxZ + tolerance) {
      continue;
    }

    // 각 정점에서 방향으로의 투영 거리 계산
    [v0, v1, v2].forEach(v => {
      if (Math.abs(v.z - targetZ) <= tolerance) {
        const projectedR = dx * v.x + dy * v.y;
        if (projectedR > maxR) maxR = projectedR;
      }
    });
  }

  return maxR;
}

// 메인 실행
(async () => {
  try {
    const metadata = await calculateStlMetadata(stlFilePath, finishLinePoints);
    
    // JSON 출력 (표준 출력)
    console.log(JSON.stringify(metadata, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('Error calculating STL metadata:', error.message);
    process.exit(1);
  }
})();
