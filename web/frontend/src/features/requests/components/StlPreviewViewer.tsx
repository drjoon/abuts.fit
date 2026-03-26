import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { cn } from "@/shared/ui/cn";
import { useStlMetadata, type StlMetadata } from "../hooks/useStlMetadata";

type Props = {
  file: File;
  requestId?: string;
  onDiameterComputed?: (
    filename: string,
    maxDiameter: number,
    connectionDiameter: number,
    totalLength: number,
    taperAngle: number,
    tiltAxisVector?: { x: number; y: number; z: number } | null,
    frontPoint?: { x: number; y: number; z: number } | null,
  ) => void;
  showOverlay?: boolean;
  finishLinePoints?: number[][] | null;
  className?: string;
  metadata?: StlMetadata | null;
};

export function StlPreviewViewer({
  file,
  requestId,
  onDiameterComputed,
  showOverlay = true,
  finishLinePoints,
  className,
  metadata,
}: Props) {
  const { metadata: fetchedMetadata } = useStlMetadata(
    metadata ? undefined : requestId,
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onDiameterComputedRef = useRef(onDiameterComputed);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const centerRef = useRef<THREE.Vector3 | null>(null);
  const centeredBoundsRef = useRef<{
    min: THREE.Vector3;
    max: THREE.Vector3;
    margin: number;
  } | null>(null);
  const frontPointMeshRef = useRef<THREE.Mesh | null>(null);
  const maxDiameterRef = useRef<number>(0);
  const [frontPointRenderRevision, setFrontPointRenderRevision] = useState(0);
  const [maxDiameterState, setMaxDiameterState] = useState<number | null>(null);
  const [connectionDiameterState, setConnectionDiameterState] = useState<
    number | null
  >(null);
  const [totalLengthState, setTotalLengthState] = useState<number | null>(null);
  const [taperAngleState, setTaperAngleState] = useState<number | null>(null);
  const [tiltAxisVectorState, setTiltAxisVectorState] = useState<{
    x: number;
    y: number;
    z: number;
  } | null>(null);
  const [frontPointState, setFrontPointState] = useState<{
    x: number;
    y: number;
    z: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resolvedMetadata = metadata ?? fetchedMetadata;

  const toValidPoint = (value: unknown) => {
    if (!value || typeof value !== "object") return null;
    const candidate = value as { x?: unknown; y?: unknown; z?: unknown };
    const x = Number(candidate.x);
    const y = Number(candidate.y);
    const z = Number(candidate.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }
    return { x, y, z };
  };

  const disposeFrontPointMesh = () => {
    const existing = frontPointMeshRef.current;
    if (!existing) return;
    if (sceneRef.current) {
      sceneRef.current.remove(existing);
    }
    existing.geometry?.dispose?.();
    const material = existing.material;
    if (Array.isArray(material)) {
      material.forEach((m) => m.dispose());
    } else {
      material.dispose();
    }
    frontPointMeshRef.current = null;
  };

  const resolveFrontPointScenePosition = (point: {
    x: number;
    y: number;
    z: number;
  }) => {
    const center = centerRef.current;
    const bounds = centeredBoundsRef.current;
    if (!center || !bounds) return null;

    const isWithinCenteredBounds = (candidate: THREE.Vector3) =>
      candidate.x >= bounds.min.x - bounds.margin &&
      candidate.x <= bounds.max.x + bounds.margin &&
      candidate.y >= bounds.min.y - bounds.margin &&
      candidate.y <= bounds.max.y + bounds.margin &&
      candidate.z >= bounds.min.z - bounds.margin &&
      candidate.z <= bounds.max.z + bounds.margin;

    const rawScenePoint = new THREE.Vector3(point.x, point.y, point.z);
    const centeredScenePoint = rawScenePoint.clone().sub(center);

    if (isWithinCenteredBounds(centeredScenePoint)) {
      return centeredScenePoint;
    }
    if (isWithinCenteredBounds(rawScenePoint)) {
      return rawScenePoint;
    }
    return centeredScenePoint;
  };

  useEffect(() => {
    onDiameterComputedRef.current = onDiameterComputed;
  }, [onDiameterComputed]);

  // 백엔드 캐시된 메타데이터 동기화
  useEffect(() => {
    if (resolvedMetadata) {
      if (
        typeof resolvedMetadata.maxDiameter === "number" &&
        Number.isFinite(resolvedMetadata.maxDiameter)
      ) {
        setMaxDiameterState(resolvedMetadata.maxDiameter);
      }

      if (
        typeof resolvedMetadata.connectionDiameter === "number" &&
        Number.isFinite(resolvedMetadata.connectionDiameter)
      ) {
        setConnectionDiameterState(resolvedMetadata.connectionDiameter);
      }
      if (
        typeof resolvedMetadata.totalLength === "number" &&
        Number.isFinite(resolvedMetadata.totalLength)
      ) {
        setTotalLengthState(resolvedMetadata.totalLength);
      }
      if (
        typeof resolvedMetadata.taperAngle === "number" &&
        Number.isFinite(resolvedMetadata.taperAngle)
      ) {
        setTaperAngleState(resolvedMetadata.taperAngle);
      }
      if (resolvedMetadata.tiltAxisVector !== undefined) {
        setTiltAxisVectorState(toValidPoint(resolvedMetadata.tiltAxisVector));
      }
      if (resolvedMetadata.frontPoint !== undefined) {
        setFrontPointState(toValidPoint(resolvedMetadata.frontPoint));
      }

      // 콜백 호출
      if (
        onDiameterComputedRef.current &&
        resolvedMetadata.maxDiameter &&
        resolvedMetadata.connectionDiameter &&
        resolvedMetadata.totalLength
      ) {
        onDiameterComputedRef.current(
          file.name,
          resolvedMetadata.maxDiameter,
          resolvedMetadata.connectionDiameter,
          resolvedMetadata.totalLength,
          resolvedMetadata.taperAngle || 0,
          resolvedMetadata.tiltAxisVector,
          resolvedMetadata.frontPoint,
        );
      }
    }
  }, [
    file.name,
    resolvedMetadata?.maxDiameter,
    resolvedMetadata?.connectionDiameter,
    resolvedMetadata?.totalLength,
    resolvedMetadata?.taperAngle,
    resolvedMetadata?.tiltAxisVector?.x,
    resolvedMetadata?.tiltAxisVector?.y,
    resolvedMetadata?.tiltAxisVector?.z,
    resolvedMetadata?.frontPoint?.x,
    resolvedMetadata?.frontPoint?.y,
    resolvedMetadata?.frontPoint?.z,
  ]);

  useEffect(() => {
    const pointFromMetadata = toValidPoint(resolvedMetadata?.frontPoint);
    const point = pointFromMetadata ?? frontPointState ?? null;
    const scene = sceneRef.current;
    const scenePosition = point ? resolveFrontPointScenePosition(point) : null;

    if (
      !showOverlay ||
      !scene ||
      !scenePosition ||
      maxDiameterRef.current <= 0
    ) {
      disposeFrontPointMesh();
      return;
    }

    if (!frontPointMeshRef.current) {
      const dotGeometry = new THREE.SphereGeometry(
        maxDiameterRef.current * 0.02,
        32,
        32,
      );
      const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
      dotMaterial.depthTest = false;
      dotMaterial.depthWrite = false;
      const mesh = new THREE.Mesh(dotGeometry, dotMaterial);
      mesh.renderOrder = 999;
      scene.add(mesh);
      frontPointMeshRef.current = mesh;
    }

    frontPointMeshRef.current.position.copy(scenePosition);

    return () => {
      if (!sceneRef.current) {
        disposeFrontPointMesh();
      }
    };
  }, [
    showOverlay,
    frontPointRenderRevision,
    frontPointState?.x,
    frontPointState?.y,
    frontPointState?.z,
    resolvedMetadata?.frontPoint?.x,
    resolvedMetadata?.frontPoint?.y,
    resolvedMetadata?.frontPoint?.z,
  ]);

  // STL 렌더링 및 finish line 시각화
  useEffect(() => {
    if (!containerRef.current) return;

    setError(null);

    const height = containerRef.current.clientHeight || 300;
    let width = containerRef.current.clientWidth || 300;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0xf9fafb);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, -60, 60);
    camera.up.set(0, 0, 1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio || 1);

    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(80, -40, 100);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
    fillLight.position.set(-60, 40, 60);
    scene.add(fillLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;

    const grid = new THREE.GridHelper(60, 12, 0xaaaaaa, 0xe5e7eb);
    (grid.rotation as any).x = Math.PI / 2;
    scene.add(grid);

    const loader = new STLLoader();
    let mesh: THREE.Mesh | null = null;
    let geometry: THREE.BufferGeometry | null = null;
    let finishLine: THREE.Object3D | null = null;
    let taperAxisGuide: Line2 | THREE.Line | null = null;
    const taperMeasureGuide: Line2 | THREE.Line | null = null;
    const taperAngleArcGuide: THREE.Line | null = null;
    const multiDirectionLines: (Line2 | THREE.Line)[] = [];
    const multiDirectionSprites: THREE.Sprite[] = [];

    let cancelled = false;
    (async () => {
      try {
        const buffer = await file.arrayBuffer();
        if (cancelled) return;

        geometry = loader.parse(buffer);
        geometry = mergeVertices(geometry, 1e-5);
        geometry.computeBoundingBox();
        geometry.computeVertexNormals();

        const bbox = geometry.boundingBox!;
        const center = new THREE.Vector3();
        bbox.getCenter(center);
        centerRef.current = center.clone();

        const material = new THREE.MeshStandardMaterial({
          color: 0x5b9dff,
          metalness: 0.2,
          roughness: 0.25,
        });
        mesh = new THREE.Mesh(geometry, material);

        const position = geometry.getAttribute("position");
        const index = geometry.getIndex();
        if (!bbox || !position) {
          scene.add(mesh);
          return;
        }

        // 최대 직경(전체) + 커넥션 직경(원본 좌표계 z=0 단면) 계산
        let maxR = 0;
        for (let i = 0; i < position.count; i++) {
          const x = position.getX(i);
          const y = position.getY(i);
          const r = Math.sqrt(x * x + y * y);
          if (r > maxR) maxR = r;
        }

        let connectionMaxR = 0;
        const sliceTolerance = 1e-4;
        const addIntersection = (
          x1: number,
          y1: number,
          z1: number,
          x2: number,
          y2: number,
          z2: number,
        ) => {
          if ((z1 === 0 && z2 === 0) || z1 === z2) return;
          if ((z1 > 0 && z2 > 0) || (z1 < 0 && z2 < 0)) return;

          const t = z1 / (z1 - z2);
          if (t < 0 || t > 1) return;

          const ix = x1 + t * (x2 - x1);
          const iy = y1 + t * (y2 - y1);
          const r = Math.sqrt(ix * ix + iy * iy);
          if (r > connectionMaxR) connectionMaxR = r;
        };

        const readVertex = (vertexIndex: number) => ({
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

          addIntersection(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z);
          addIntersection(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
          addIntersection(v2.x, v2.y, v2.z, v0.x, v0.y, v0.z);
        }

        const maxDiameter = maxR * 2;
        maxDiameterRef.current = maxDiameter;
        const connectionDiameter =
          connectionMaxR > 0 ? connectionMaxR * 2 : maxDiameter;

        // LLL(전체길이): Z축 범위
        const totalLength = bbox.max.z - bbox.min.z;

        // 프론트에서 계산한 최대직경을 콜백으로 전달 (리드타임 표시용)
        if (onDiameterComputedRef.current && maxDiameter > 0) {
          onDiameterComputedRef.current(
            file.name,
            maxDiameter,
            connectionDiameter,
            totalLength,
            0, // taperAngle은 아직 계산 전
            null,
            null,
          );
        }

        // 상태에도 저장 (UI 표시용)
        setMaxDiameterState(maxDiameter);
        setConnectionDiameterState(connectionDiameter);
        setTotalLengthState(totalLength);

        let taperAngle = 0;
        let tiltAxisVector: { x: number; y: number; z: number } | null = null;
        let frontPoint: { x: number; y: number; z: number } | null = null;
        let taperGuide: {
          zStart: number;
          zEnd: number;
          slope: number;
          intercept: number;
          multiDirectionGuides?: Array<{
            angle: number; // 0-360도
            slope: number;
            intercept: number;
            taperAngle: number; // 부호가 있는 각도 (+ 또는 -)
            rSquared: number; // 선형성 검증 (R²)
            surfacePoints: Array<{ x: number; y: number; z: number }>; // 실제 표면 포인트들
            dirFinishLineZ?: number;
            dirAvailableHeight?: number;
          }>;
        } | null = null;
        const finishLineZs = Array.isArray(finishLinePoints)
          ? finishLinePoints
              .filter((p) => Array.isArray(p) && p.length >= 3)
              .map((p) => Number(p[2]))
              .filter((z) => Number.isFinite(z))
          : [];
        const finishLineTopZ =
          finishLineZs.length > 0 ? Math.max(...finishLineZs) : null;

        // 마진을 제외한 중간 영역으로 재조정 (finishLineTopZ ~ z_max 사이의 40%~60% 구간, 중앙 20%)
        let postStartZ = bbox.min.z + totalLength * 0.6;
        let postEndZ = bbox.max.z - totalLength * 0.8;

        if (finishLineTopZ != null) {
          const availableHeight = bbox.max.z - finishLineTopZ;
          // 마진 곡면 제외 (하단 40%), 상단 플랫 제외 (상단 40%)
          postStartZ = finishLineTopZ + availableHeight * 0.4;
          postEndZ = bbox.max.z - availableHeight * 0.4;
        }

        const postHeight = postEndZ - postStartZ;

        if (postHeight > 0.3) {
          const sliceCount = 40;
          const samples: Array<{ z: number; radius: number }> = [];

          for (let s = 0; s <= sliceCount; s++) {
            const targetZ = postStartZ + (postHeight * s) / sliceCount;
            const tolerance = postHeight / (sliceCount * 4);
            let maxRadiusAtSlice = 0;

            for (let tri = 0; tri < triangleCount; tri++) {
              const i0 = index ? index.getX(tri * 3) : tri * 3;
              const i1 = index ? index.getX(tri * 3 + 1) : tri * 3 + 1;
              const i2 = index ? index.getX(tri * 3 + 2) : tri * 3 + 2;
              const v0 = readVertex(i0);
              const v1 = readVertex(i1);
              const v2 = readVertex(i2);

              const checkVertex = (v: { x: number; y: number; z: number }) => {
                if (Math.abs(v.z - targetZ) <= tolerance) {
                  const r = Math.sqrt(v.x * v.x + v.y * v.y);
                  if (r > maxRadiusAtSlice) maxRadiusAtSlice = r;
                }
              };

              checkVertex(v0);
              checkVertex(v1);
              checkVertex(v2);

              const intersectEdge = (
                a: { x: number; y: number; z: number },
                b: { x: number; y: number; z: number },
              ) => {
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
                const r = Math.sqrt(ix * ix + iy * iy);
                if (r > maxRadiusAtSlice) maxRadiusAtSlice = r;
              };

              intersectEdge(v0, v1);
              intersectEdge(v1, v2);
              intersectEdge(v2, v0);
            }

            if (maxRadiusAtSlice > 0) {
              samples.push({ z: targetZ, radius: maxRadiusAtSlice });
            }
          }

          if (samples.length >= 6) {
            const ransacIterations = 50;
            let bestInliers: typeof samples = [];
            let bestScore = 0;

            for (let iter = 0; iter < ransacIterations; iter++) {
              const idx1 = Math.floor(Math.random() * samples.length);
              let idx2 = Math.floor(Math.random() * samples.length);
              while (idx2 === idx1) {
                idx2 = Math.floor(Math.random() * samples.length);
              }
              const p1 = samples[idx1];
              const p2 = samples[idx2];
              if (Math.abs(p2.z - p1.z) < 0.1) continue;

              const slope = (p2.radius - p1.radius) / (p2.z - p1.z);
              const intercept = p1.radius - slope * p1.z;

              const inliers: typeof samples = [];
              const threshold = 0.08;
              for (const sample of samples) {
                const predicted = slope * sample.z + intercept;
                const error = Math.abs(sample.radius - predicted);
                if (error < threshold) {
                  inliers.push(sample);
                }
              }

              const score = inliers.length;
              if (score > bestScore) {
                bestScore = score;
                bestInliers = inliers;
              }
            }

            if (bestInliers.length >= 6) {
              const n = bestInliers.length;
              const sumZ = bestInliers.reduce((acc, cur) => acc + cur.z, 0);
              const sumR = bestInliers.reduce(
                (acc, cur) => acc + cur.radius,
                0,
              );
              const meanZ = sumZ / n;
              const meanR = sumR / n;
              let numerator = 0;
              let denominator = 0;
              for (const sample of bestInliers) {
                const dz = sample.z - meanZ;
                numerator += dz * (sample.radius - meanR);
                denominator += dz * dz;
              }
              if (denominator > 1e-8) {
                const slope = numerator / denominator;
                const intercept = meanR - slope * meanZ;
                taperAngle = Math.abs(Math.atan(slope) * (180 / Math.PI));
                const sortedInliers = [...bestInliers].sort(
                  (a, b) => a.z - b.z,
                );
                const guideStart = sortedInliers[0];
                const guideEnd = sortedInliers[sortedInliers.length - 1];
                if (guideStart && guideEnd) {
                  const multiDirectionGuides: (typeof taperGuide)["multiDirectionGuides"] =
                    [];

                  // 12개 방향 (0°, 30°, 60°, 90°, 120°, 150°, 180°, 210°, 240°, 270°, 300°, 330°)
                  const angles = [
                    0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330,
                  ];
                  for (let dirIdx = 0; dirIdx < angles.length; dirIdx++) {
                    const dirAngleDeg = angles[dirIdx];
                    const dirAngle = dirAngleDeg * (Math.PI / 180);
                    const dirX = Math.cos(dirAngle);
                    const dirY = Math.sin(dirAngle);

                    let dirFinishLineZ =
                      finishLineTopZ ?? bbox.min.z + totalLength * 0.2;
                    if (
                      finishLineZs.length > 0 &&
                      Array.isArray(finishLinePoints)
                    ) {
                      let minAngleDiff = Infinity;
                      for (const p of finishLinePoints) {
                        if (!Array.isArray(p) || p.length < 3) continue;
                        const cx = Number(p[0]) - center.x;
                        const cy = Number(p[1]) - center.y;
                        let ptAngle = Math.atan2(cy, cx) * (180 / Math.PI);
                        if (ptAngle < 0) ptAngle += 360;

                        let angleDiff = Math.abs(ptAngle - dirAngleDeg);
                        if (angleDiff > 180) angleDiff = 360 - angleDiff;
                        if (angleDiff < minAngleDiff) {
                          minAngleDiff = angleDiff;
                          dirFinishLineZ = Number(p[2]);
                        }
                      }
                    }

                    const dirAvailableHeight = bbox.max.z - dirFinishLineZ;
                    // 각 방향의 피니시라인에서 30%~40% 구간
                    const dirPostStartZ =
                      dirFinishLineZ + dirAvailableHeight * 0.3;
                    const dirPostEndZ =
                      dirFinishLineZ + dirAvailableHeight * 0.4;
                    const dirPostHeight = dirPostEndZ - dirPostStartZ;

                    const dirSamples: Array<{ z: number; radius: number }> = [];
                    const surfacePoints: Array<{
                      x: number;
                      y: number;
                      z: number;
                    }> = [];

                    if (dirPostHeight > 0.1) {
                      // 각 방향에서 반지름 프로파일 및 표면 포인트 추출
                      for (let s = 0; s <= sliceCount; s++) {
                        const targetZ =
                          dirPostStartZ + (dirPostHeight * s) / sliceCount;
                        const tolerance = dirPostHeight / (sliceCount * 4);
                        let maxRadiusInDir = -Infinity;
                        let bestSurfacePoint: {
                          x: number;
                          y: number;
                          z: number;
                        } | null = null;

                        for (let tri = 0; tri < triangleCount; tri++) {
                          const i0 = index ? index.getX(tri * 3) : tri * 3;
                          const i1 = index
                            ? index.getX(tri * 3 + 1)
                            : tri * 3 + 1;
                          const i2 = index
                            ? index.getX(tri * 3 + 2)
                            : tri * 3 + 2;
                          const v0 = readVertex(i0);
                          const v1 = readVertex(i1);
                          const v2 = readVertex(i2);

                          const checkVertexDir = (v: {
                            x: number;
                            y: number;
                            z: number;
                          }) => {
                            if (Math.abs(v.z - targetZ) <= tolerance) {
                              const cx = v.x - center.x;
                              const cy = v.y - center.y;
                              const proj = cx * dirX + cy * dirY;
                              if (proj > maxRadiusInDir) {
                                maxRadiusInDir = proj;
                                bestSurfacePoint = { x: v.x, y: v.y, z: v.z };
                              }
                            }
                          };

                          checkVertexDir(v0);
                          checkVertexDir(v1);
                          checkVertexDir(v2);

                          const intersectEdgeDir = (
                            a: { x: number; y: number; z: number },
                            b: { x: number; y: number; z: number },
                          ) => {
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
                            const proj = cx * dirX + cy * dirY;
                            if (proj > maxRadiusInDir) {
                              maxRadiusInDir = proj;
                              bestSurfacePoint = { x: ix, y: iy, z: targetZ };
                            }
                          };

                          intersectEdgeDir(v0, v1);
                          intersectEdgeDir(v1, v2);
                          intersectEdgeDir(v2, v0);
                        }

                        if (maxRadiusInDir > -10 && bestSurfacePoint) {
                          dirSamples.push({
                            z: targetZ,
                            radius: maxRadiusInDir,
                          });
                          surfacePoints.push(bestSurfacePoint);
                        }
                      }
                    } // end if dirPostHeight > 0.1

                    // 각 방향의 회귀선 계산
                    if (dirSamples.length >= 6) {
                      const dirN = dirSamples.length;
                      const dirSumZ = dirSamples.reduce(
                        (acc, cur) => acc + cur.z,
                        0,
                      );
                      const dirSumR = dirSamples.reduce(
                        (acc, cur) => acc + cur.radius,
                        0,
                      );
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

                        // 선형성 검증 (R² 계산)
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

                        // R² > 0.92인 경우만 유효한 직선으로 간주 (더 엄격한 선형성 검증)
                        if (rSquared > 0.92) {
                          // 부호가 있는 각도 계산 (기울기 방향 유지)
                          const dirTaperAngleSigned =
                            Math.atan(dirSlope) * (180 / Math.PI);

                          multiDirectionGuides.push({
                            angle: dirAngleDeg,
                            slope: dirSlope,
                            intercept: dirIntercept,
                            taperAngle: dirTaperAngleSigned,
                            rSquared,
                            surfacePoints,
                            dirFinishLineZ,
                            dirAvailableHeight,
                          });
                        }
                      }
                    }
                  }

                  taperGuide = {
                    zStart: guideStart.z,
                    zEnd: guideEnd.z,
                    slope,
                    intercept,
                    multiDirectionGuides:
                      multiDirectionGuides.length > 0
                        ? multiDirectionGuides
                        : undefined,
                  };

                  // 180도 반대편 각도 쌍의 진짜 기울기 계산 (6그룹)
                  if (multiDirectionGuides.length >= 6) {
                    const pairedAverages: number[] = [];

                    // 0-150도 범위의 6개 각도에 대해 180도 반대편과 쌍을 만듦
                    for (let baseAngle = 0; baseAngle < 180; baseAngle += 30) {
                      const oppositeAngle = baseAngle + 180;

                      const baseGuide = multiDirectionGuides.find(
                        (g) => g.angle === baseAngle,
                      );
                      const oppositeGuide = multiDirectionGuides.find(
                        (g) => g.angle === oppositeAngle,
                      );

                      // 두 방향 모두 유효한 경우에만 진짜 기울기 계산
                      if (baseGuide && oppositeGuide) {
                        // 포스트는 기본적으로 양쪽으로 테이퍼(약 2~5도)가 들어가 있음
                        // 예: 기울기가 0도일 때, 양쪽 측정값은 둘 다 +3도일 수 있음
                        // 기울기가 생기면 한쪽은 +3도 + 기울기(a), 반대쪽은 +3도 - 기울기(a)가 됨
                        // 따라서 두 각도의 차이를 반으로 나누면 진짜 기울어진 각도(a)를 구할 수 있음
                        // 한쪽 편을 기준으로 기울기 방향이 반대이므로:
                        // 진짜 기울기 = (base각도 - opposite각도) / 2

                        // 두 값의 절댓값을 사용하여 원래 테이퍼 각도 제거 후 순수 기울기 도출
                        // 방향성을 고려하기 위해 원래 각도의 부호를 유지하면서 계산
                        const trueTilt =
                          (baseGuide.taperAngle - oppositeGuide.taperAngle) / 2;
                        pairedAverages.push(Math.abs(trueTilt));

                        // 시각적 렌더링을 위해 각 가이드에 계산된 진짜 기울기를 저장
                        baseGuide.taperAngle = trueTilt;
                        oppositeGuide.taperAngle = -trueTilt;
                      }
                    }

                    if (pairedAverages.length > 0) {
                      // 가장 큰 진짜 기울기를 선택
                      taperAngle = Math.max(...pairedAverages);

                      // Calculate tiltAxisVector
                      let localMaxTiltAngle = -1;
                      let localMaxTiltValue = -1;
                      let bestTrueTilt = 0;
                      for (
                        let baseAngle = 0;
                        baseAngle < 180;
                        baseAngle += 30
                      ) {
                        const oppositeAngle = baseAngle + 180;
                        const baseGuide = multiDirectionGuides.find(
                          (g) => g.angle === baseAngle,
                        );
                        const oppositeGuide = multiDirectionGuides.find(
                          (g) => g.angle === oppositeAngle,
                        );
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
                        const tiltRad =
                          Math.abs(bestTrueTilt) * (Math.PI / 180);
                        const directionAngle =
                          bestTrueTilt >= 0 ? rad : rad + Math.PI;

                        tiltAxisVector = {
                          x: Math.sin(tiltRad) * Math.cos(directionAngle),
                          y: Math.sin(tiltRad) * Math.sin(directionAngle),
                          z: Math.cos(tiltRad),
                        };
                      }
                    }
                  }
                }
              }
            }
          }
        }

        const tiltDir = tiltAxisVector
          ? new THREE.Vector3(
              tiltAxisVector.x,
              tiltAxisVector.y,
              tiltAxisVector.z,
            ).normalize()
          : new THREE.Vector3(0, 0, 1);

        // FrontPoint 로직 재설계 (Raycasting 개념 도입):
        // 경사축(tiltDir) 방향으로 가장 높은 곳에 있는 수직 평면을 "Top",
        // 그 외측의 수평/측면을 "Side"로 정의하여 교점(모서리) 중 최저점을 찾습니다.

        // 1. 경사축 방향으로 가장 높은 투영(Projection) 값 찾기
        let maxProj = -Infinity;
        for (let tri = 0; tri < triangleCount; tri++) {
          for (let j = 0; j < 3; j++) {
            const idx = index ? index.getX(tri * 3 + j) : tri * 3 + j;
            const v = readVertex(idx);
            const proj = v.x * tiltDir.x + v.y * tiltDir.y + v.z * tiltDir.z;
            if (proj > maxProj) maxProj = proj;
          }
        }

        // 포스트 탑은 최상단으로부터 약 2mm 이내에 존재한다고 가정 (피니시라인 완벽 배제)
        const topProjThreshold = maxProj - Math.min(2.0, totalLength * 0.2);

        // 좌표 기반 공간 해싱 (Unindexed Geometry 대비)
        const vertexFaceTypes = new Map<
          string,
          { v: { x: number; y: number; z: number }; types: Set<string> }
        >();

        const getVertexHash = (v: { x: number; y: number; z: number }) => {
          return `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
        };

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

          // 포스트 탑 근처의 면들만 검사 (마진/피니시라인 부위 원천 배제)
          if (avgProj > topProjThreshold - 2.0) {
            const vec0 = new THREE.Vector3(v0.x, v0.y, v0.z);
            const vec1 = new THREE.Vector3(v1.x, v1.y, v1.z);
            const vec2 = new THREE.Vector3(v2.x, v2.y, v2.z);
            const normal = new THREE.Vector3()
              .subVectors(vec1, vec0)
              .cross(new THREE.Vector3().subVectors(vec2, vec0))
              .normalize();

            // 경사축과 이루는 각도로 Top / Side 분류
            let faceType = "none";
            // 0.5 (약 60도) 기준: 평평한 상단은 1.0에 가깝고, 테이퍼진 측면은 0.1 근처입니다.
            if (normal.dot(tiltDir) > 0.5) {
              if (avgProj > topProjThreshold) {
                faceType = "top"; // 최상단 영역의 수직(위쪽) 방향 면
              }
            } else {
              faceType = "side"; // 수평(측면) 방향 면
            }

            if (faceType !== "none") {
              for (const vertex of [v0, v1, v2]) {
                const hash = getVertexHash(vertex);
                if (!vertexFaceTypes.has(hash)) {
                  vertexFaceTypes.set(hash, { v: vertex, types: new Set() });
                }
                vertexFaceTypes.get(hash)!.types.add(faceType);
              }
            }
          }
        }

        let bestFrontPoint: { x: number; y: number; z: number } | null = null;
        let minZFront = Infinity;

        // "포스트 탑과 사이드월 사이의 모서리 중 최저점"
        // 나사 구멍 안쪽 모서리를 배제하기 위해 최소 반경 필터 적용
        const minRadius = Math.max(1.0, (maxDiameter || 4) * 0.15);
        let edgePointCount = 0;

        for (const { v, types } of vertexFaceTypes.values()) {
          if (types.has("top") && types.has("side")) {
            edgePointCount++;

            const dx = v.x - center.x;
            const dy = v.y - center.y;
            const distToAxis = Math.sqrt(dx * dx + dy * dy);

            // 외곽에 위치하면서, 가장 Z좌표가 낮은 점 탐색
            if (distToAxis > minRadius && v.z < minZFront) {
              minZFront = v.z;
              bestFrontPoint = v;
            }
          }
        }

        console.log(
          "[FrontPoint] 모서리 후보 점 개수:",
          edgePointCount,
          "검색 결과:",
          bestFrontPoint
            ? `found at z=${bestFrontPoint.z}, distToAxis=${Math.sqrt((bestFrontPoint?.x || 0 - center.x) ** 2 + (bestFrontPoint?.y || 0 - center.y) ** 2).toFixed(2)}`
            : "not found",
        );

        // 메타데이터는 백엔드 캐시에서만 사용 (프론트 계산 제거)
        // STL 메시 추가
        mesh.position.sub(center);
        scene.add(mesh);

        // Draw tilt axis (dotted line passing through origin)
        if (tiltAxisVector && showOverlay) {
          const axisLength = totalLength * 1.5;
          const originCentered = new THREE.Vector3(
            -center.x,
            -center.y,
            -center.z,
          );
          const dir = new THREE.Vector3(
            tiltAxisVector.x,
            tiltAxisVector.y,
            tiltAxisVector.z,
          ).normalize();

          const p1 = originCentered
            .clone()
            .add(dir.clone().multiplyScalar(axisLength));
          const p2 = originCentered
            .clone()
            .add(dir.clone().multiplyScalar(-axisLength * 0.2)); // extend a bit below origin

          const axisGeom = new LineGeometry();
          axisGeom.setPositions([p2.x, p2.y, p2.z, p1.x, p1.y, p1.z]);
          const axisMat = new LineMaterial({
            color: 0x66cc66, // 눈에 잘 띄는 연두색
            linewidth: 5,
            dashed: true,
            dashScale: 2,
            dashSize: 2,
            gapSize: 1,
            transparent: true,
            opacity: 0.9,
          });
          axisMat.resolution.set(window.innerWidth, window.innerHeight);
          taperAxisGuide = new Line2(axisGeom, axisMat);
          taperAxisGuide.computeLineDistances();
          taperAxisGuide.renderOrder = 13;
          scene.add(taperAxisGuide);
        }

        const bboxSize = new THREE.Vector3();
        bbox.getSize(bboxSize);
        centeredBoundsRef.current = {
          min: bbox.min.clone().sub(center),
          max: bbox.max.clone().sub(center),
          margin: Math.max(
            0.2,
            Math.min(bboxSize.x, bboxSize.y, bboxSize.z) * 0.1,
          ),
        };
        setFrontPointRenderRevision((prev) => prev + 1);

        // showOverlay가 true일 때(제조사 페이지 등)는 모든 가이드를,
        // false일 때(의뢰자 페이지)는 AAA 값과 관련된 가이드만 그립니다.
        if (taperGuide) {
          const guideHeight = Math.max(taperGuide.zEnd - taperGuide.zStart, 1);
          // 측정선 위치: 피니시라인~포스트최상단의 10~20% 구간 (피니시라인에 가깝게)
          const extendedStartZ = taperGuide.zStart - guideHeight * 0.9;
          const extendedEndZ = taperGuide.zEnd + guideHeight * 1;
          const zStartCentered = extendedStartZ - center.z;
          const zEndCentered = extendedEndZ - center.z;

          // 의뢰자 페이지(showOverlay=false)에서는 중심축을 숨김
          // 제조사 페이지에서도 녹색 중심축 표시 제거

          // 12개 방향 측정선 렌더링 (180도 쌍은 동일 색상 사용)
          if (
            taperGuide.multiDirectionGuides &&
            taperGuide.multiDirectionGuides.length > 0
          ) {
            // 6개 기본 색상 정의 (0~150도 용)
            const baseColors = [
              0xff0000, // 0도/180도: 빨강
              0xffa500, // 30도/210도: 주황
              0xffff00, // 60도/240도: 노랑
              0x00ff00, // 90도/270도: 초록
              0x0099ff, // 120도/300도: 파랑
              0x9933ff, // 150도/330도: 보라
            ];

            // 가장 큰 진짜 기울기(AAA)를 가진 쌍의 각도 찾기
            let maxTiltAngle = -1;
            let maxTiltValue = -1;
            for (let baseAngle = 0; baseAngle < 180; baseAngle += 30) {
              const oppositeAngle = baseAngle + 180;
              const baseGuide = taperGuide.multiDirectionGuides.find(
                (g) => g.angle === baseAngle,
              );
              const oppositeGuide = taperGuide.multiDirectionGuides.find(
                (g) => g.angle === oppositeAngle,
              );

              if (baseGuide && oppositeGuide) {
                // 부호 상관없이 원래 계산된 진짜 기울기의 절댓값으로 비교
                const tilt = Math.abs(baseGuide.taperAngle);
                if (tilt > maxTiltValue) {
                  maxTiltValue = tilt;
                  maxTiltAngle = baseAngle;
                }
              }
            }

            taperGuide.multiDirectionGuides.forEach((guide) => {
              if (!guide.surfacePoints || guide.surfacePoints.length < 2)
                return;

              const isMaxPair = guide.angle % 180 === maxTiltAngle % 180;
              const colorIdx = (guide.angle / 30) % 6;

              // // 의뢰자 페이지(showOverlay=false)일 경우 최대 기울기(AAA) 쌍이 아니면 렌더링하지 않음
              // if (!showOverlay && !isMaxPair) return;

              // 최대 기울기 쌍만 유채색, 나머지는 회색 계열(농도 다르게)로 렌더링
              const color = isMaxPair
                ? baseColors[colorIdx]
                : // 농도를 다르게 하기 위해 인덱스별로 회색 값 조정 (0x666666 부터 0xcccccc 까지)
                  0x666666 + colorIdx * 0x111111;

              // 실제 표면 포인트들을 중심 좌표계로 변환
              const centeredPoints = guide.surfacePoints.map((p) => ({
                x: p.x - center.x,
                y: p.y - center.y,
                z: p.z - center.z,
              }));

              // 측정선 - Line2로 굵게 (실제 표면 포인트들 연결)
              const positions: number[] = [];
              centeredPoints.forEach((p) => {
                positions.push(p.x, p.y, p.z);
              });

              const lineGeom = new LineGeometry();
              lineGeom.setPositions(positions);
              // 최대 기울기 쌍은 더 굵게 (linewidth: 5), 나머지는 원래 굵기 (linewidth: 2 - 기존 3에서 키움)
              const lineMat = new LineMaterial({
                color: color,
                linewidth: isMaxPair ? 5 : 2,
                transparent: true,
                opacity: 0.9,
              });
              lineMat.resolution.set(window.innerWidth, window.innerHeight);
              const line = new Line2(lineGeom, lineMat);
              line.renderOrder = 11;
              line.computeLineDistances();
              scene.add(line);
              multiDirectionLines.push(line);

              // 시작점과 끝점 (각도 호 및 텍스트 위치용)
              // const startPos = centeredPoints[0];
              const endPos = centeredPoints[centeredPoints.length - 1];

              // 제조사 페이지에서만 각도 텍스트 표시 (의뢰자 페이지에서는 표시하지 않음)
              if (showOverlay) {
                const canvas = document.createElement("canvas");
                canvas.width = 256;
                canvas.height = 64;
                const ctx = canvas.getContext("2d");
                if (ctx) {
                  ctx.fillStyle = "#" + color.toString(16).padStart(6, "0");
                  // 폰트 크기: 40px
                  ctx.font = "bold 40px Arial";
                  ctx.fillText(
                    `${Math.abs(guide.taperAngle).toFixed(1)}°`,
                    10,
                    40,
                  );
                }
                const texture = new THREE.CanvasTexture(canvas);
                const spriteMat = new THREE.SpriteMaterial({ map: texture });
                const sprite = new THREE.Sprite(spriteMat);

                // 표면 외측으로 오프셋 (방향 벡터로 1.2배 확장)
                const textOffsetFactor = 1.2;
                const textPosX = endPos.x * textOffsetFactor;
                const textPosY = endPos.y * textOffsetFactor;
                sprite.position.set(textPosX, textPosY, endPos.z);
                // 개별 텍스트 크기 조절: 2배 (AAA 3.0, 나머지 2.0)
                const textScale = isMaxPair ? 3.0 : 2.0;
                sprite.scale.set(textScale, textScale * 0.25, 1);
                sprite.renderOrder = 12;
                scene.add(sprite);
                multiDirectionSprites.push(sprite);
              }
            });
          }
        }

        const hasFinishLine = Array.isArray(finishLinePoints);
        if (hasFinishLine && finishLinePoints!.length >= 2) {
          const pts = finishLinePoints!
            .filter((p) => Array.isArray(p) && p.length >= 3)
            .map((p) => new THREE.Vector3(p[0], p[1], p[2]).sub(center));
          if (pts.length >= 2) {
            const closedPts = pts.slice();
            const first = closedPts[0];
            const last = closedPts[closedPts.length - 1];
            if (first && last && !first.equals(last)) {
              closedPts.push(first.clone());
            }

            const curve = new THREE.CatmullRomCurve3(closedPts, true);
            const tubularSegments = Math.max(pts.length * 3, 120);
            const size = new THREE.Vector3();
            bbox.getSize(size);
            const diag = size.length() || 40;
            const radius = Math.max(diag * 0.003, 0.05);

            const tubeGeometry = new THREE.TubeGeometry(
              curve,
              tubularSegments,
              radius,
              12,
              true,
            );
            const tubeMaterial = new THREE.MeshPhongMaterial({
              color: 0xff2d2d,
              emissive: 0xaa0000,
              shininess: 80,
              transparent: true,
              opacity: 1,
              depthTest: false,
              depthWrite: false,
            });
            finishLine = new THREE.Mesh(tubeGeometry, tubeMaterial);
            finishLine.renderOrder = 10;
            scene.add(finishLine);
          }
        }

        const sphere = geometry.boundingSphere;
        const radius = sphere ? sphere.radius : maxR || 40;

        // 모델의 실제 높이(totalLength)와 반경을 고려하여 카메라 거리 계산
        // 세로로 긴 모델이 화면 밖으로 벗어나지 않도록 bounding box의 크기를 반영
        const modelHeight = bbox.max.z - bbox.min.z;
        const modelWidth = Math.max(
          bbox.max.x - bbox.min.x,
          bbox.max.y - bbox.min.y,
        );
        const maxDimension = Math.max(modelHeight, modelWidth);

        // 카메라 거리: 모델의 가장 긴 변에 비례하게 설정하되, 기존 반경 로직과 조합
        const dist = Math.max(radius * 2.5, maxDimension * 1.5);

        // 카메라 위치 조정: 세로로 긴 모델일 경우 상하가 꽉 차도록 Y, Z축을 조정
        // dist 값을 키워서 모델 전체가 한눈에 들어오도록 줌아웃 (기존보다 더 멀리서 보게)
        const cameraDist = dist * (showOverlay ? 1.0 : 1.2); // 의뢰자 페이지(showOverlay=false)에서는 조금 더 멀리서
        camera.position.set(cameraDist, -cameraDist, cameraDist * 0.9);
        camera.lookAt(0, 0, 0);
      } catch (e) {
        console.error("[StlPreviewViewer] failed to load STL", e);
        setError("STL 파일을 불러오지 못했습니다");
      }
    })();
    const updateSize = () => {
      if (!containerRef.current) return;
      const newWidth = containerRef.current.clientWidth || width;
      const newHeight = containerRef.current.clientHeight || height;
      width = newWidth;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    // 컨테이너의 폭 변화에 반응
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        updateSize();
      });
      resizeObserver.observe(containerRef.current);
    } else {
      // 폴백: 윈도우 리사이즈에만 반응
      window.addEventListener("resize", updateSize);
    }

    let frameId: number;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener("resize", updateSize);
      }
      if (mesh) {
        scene.remove(mesh);
        const material = mesh.material;
        if (Array.isArray(material)) {
          material.forEach((m) => m.dispose());
        } else {
          material.dispose();
        }
      }
      if (finishLine) {
        scene.remove(finishLine);
        if (finishLine instanceof THREE.Mesh) {
          finishLine.geometry?.dispose?.();
          const mat = finishLine.material;
          if (Array.isArray(mat)) {
            mat.forEach((mm) => mm.dispose());
          } else {
            mat.dispose();
          }
        }
      }
      disposeFrontPointMesh();
      if (taperAxisGuide) {
        scene.remove(taperAxisGuide);
        taperAxisGuide.geometry?.dispose?.();
        const mat = taperAxisGuide.material;
        if (Array.isArray(mat)) {
          mat.forEach((mm) => mm.dispose());
        } else {
          mat.dispose();
        }
      }
      if (taperMeasureGuide) {
        scene.remove(taperMeasureGuide);
        taperMeasureGuide.geometry?.dispose?.();
        const mat = taperMeasureGuide.material;
        if (Array.isArray(mat)) {
          mat.forEach((mm) => mm.dispose());
        } else {
          mat.dispose();
        }
      }
      if (taperAngleArcGuide) {
        scene.remove(taperAngleArcGuide);
        taperAngleArcGuide.geometry?.dispose?.();
        const mat = taperAngleArcGuide.material;
        if (Array.isArray(mat)) {
          mat.forEach((mm) => mm.dispose());
        } else {
          mat.dispose();
        }
      }
      multiDirectionLines.forEach((line) => {
        scene.remove(line);
        if (line instanceof Line2) {
          line.geometry?.dispose?.();
          (line.material as LineMaterial).dispose();
        } else if (line instanceof THREE.Line) {
          line.geometry?.dispose?.();
          const mat = line.material;
          if (Array.isArray(mat)) {
            mat.forEach((mm) => mm.dispose());
          } else {
            mat.dispose();
          }
        }
      });
      multiDirectionLines.length = 0;
      multiDirectionSprites.forEach((sprite) => {
        scene.remove(sprite);
        if (sprite.material instanceof THREE.SpriteMaterial) {
          sprite.material.map?.dispose?.();
          sprite.material.dispose();
        }
      });
      multiDirectionSprites.length = 0;
      if (geometry) {
        geometry.dispose();
      }
      controls.dispose();
      renderer.dispose();
      sceneRef.current = null;
      centerRef.current = null;
      centeredBoundsRef.current = null;
      maxDiameterRef.current = 0;
      setFrontPointRenderRevision((prev) => prev + 1);
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [file, showOverlay, finishLinePoints]);

  return (
    <div
      className={cn(
        "relative w-full max-w-full h-full min-h-[300px]",
        className,
      )}
    >
      <div ref={containerRef} className="w-full h-full" />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center rounded-md bg-white/70 text-sm text-destructive">
          {error}
        </div>
      )}
      {showOverlay && (
        <>
          <div className="pointer-events-none absolute bottom-2 left-2 flex flex-col items-start gap-1 rounded-md bg-white/85 px-2 py-1 text-[11px] md:text-[12px] font-medium text-slate-800 shadow-sm border border-slate-200 z-10">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">테이퍼 각도 (AAA):</span>
              <span>
                {taperAngleState > 0 ? taperAngleState.toFixed(1) : "-"}°
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">최대 직경 (DDD):</span>
              <span>
                {maxDiameterState > 0 ? maxDiameterState.toFixed(1) : "-"} mm
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">전체 길이 (LLL):</span>
              <span>
                {totalLengthState > 0 ? totalLengthState.toFixed(1) : "-"} mm
              </span>
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-2 right-2 flex flex-col items-start gap-1 rounded-md bg-white/85 px-2 py-1 text-[11px] md:text-[12px] font-medium text-slate-800 shadow-sm border border-slate-200 z-10">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">커넥션 직경:</span>
              <span>
                {connectionDiameterState !== null && connectionDiameterState > 0
                  ? connectionDiameterState.toFixed(1)
                  : "-"}{" "}
                mm
              </span>
            </div>
            {tiltAxisVectorState &&
              tiltAxisVectorState.x !== undefined &&
              tiltAxisVectorState.y !== undefined &&
              tiltAxisVectorState.z !== undefined && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">경사축 벡터:</span>
                  <span>
                    [{tiltAxisVectorState.x.toFixed(2)},{" "}
                    {tiltAxisVectorState.y.toFixed(2)},{" "}
                    {tiltAxisVectorState.z.toFixed(2)}]
                  </span>
                </div>
              )}
            {frontPointState && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">프론트 포인트:</span>
                <span>
                  [
                  {frontPointState.x !== undefined && frontPointState.x !== null
                    ? frontPointState.x.toFixed(2)
                    : "-"}
                  ,{" "}
                  {frontPointState.y !== undefined && frontPointState.y !== null
                    ? frontPointState.y.toFixed(2)
                    : "-"}
                  ,{" "}
                  {frontPointState.z !== undefined && frontPointState.z !== null
                    ? frontPointState.z.toFixed(2)
                    : "-"}
                  ]
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
