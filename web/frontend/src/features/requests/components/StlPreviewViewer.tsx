import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type Props = {
  file: File;
  onDiameterComputed?: (
    filename: string,
    maxDiameter: number,
    connectionDiameter: number,
  ) => void;
  showOverlay?: boolean;
  finishLinePoints?: number[][] | null;
};

export function StlPreviewViewer({
  file,
  onDiameterComputed,
  showOverlay = true,
  finishLinePoints,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onDiameterComputedRef = useRef(onDiameterComputed);
  const [maxDiameterState, setMaxDiameterState] = useState<number | null>(null);
  const [connectionDiameterState, setConnectionDiameterState] = useState<
    number | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onDiameterComputedRef.current = onDiameterComputed;
  }, [onDiameterComputed]);

  useEffect(() => {
    if (!containerRef.current) return;

    setError(null);
    setMaxDiameterState(null);
    setConnectionDiameterState(null);

    const height = containerRef.current.clientHeight || 300;
    let width = containerRef.current.clientWidth || 300;

    const scene = new THREE.Scene();
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

    let cancelled = false;
    (async () => {
      try {
        const buffer = await file.arrayBuffer();
        if (cancelled) return;

        geometry = loader.parse(buffer);
        geometry = mergeVertices(geometry, 1e-5);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        const material = new THREE.MeshStandardMaterial({
          color: 0x5b9dff,
          metalness: 0.2,
          roughness: 0.25,
        });
        mesh = new THREE.Mesh(geometry, material);

        const bbox = geometry.boundingBox;
        const position = geometry.getAttribute("position");
        const index = geometry.getIndex();
        if (!bbox || !position) {
          scene.add(mesh);
          return;
        }

        // 최대 직경(전체) + 커넥션 직경(z=0) 계산
        let maxR = 0;
        for (let i = 0; i < position.count; i++) {
          const x = position.getX(i);
          const y = position.getY(i);
          const r = Math.sqrt(x * x + y * y);
          if (r > maxR) maxR = r;
        }

        let connectionMaxR = 0;
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

        for (let i = 0; i + 2 < position.count; i += 3) {
          const x0 = position.getX(i);
          const y0 = position.getY(i);
          const z0 = position.getZ(i);

          const x1 = position.getX(i + 1);
          const y1 = position.getY(i + 1);
          const z1 = position.getZ(i + 1);

          const x2 = position.getX(i + 2);
          const y2 = position.getY(i + 2);
          const z2 = position.getZ(i + 2);

          addIntersection(x0, y0, z0, x1, y1, z1);
          addIntersection(x1, y1, z1, x2, y2, z2);
          addIntersection(x2, y2, z2, x0, y0, z0);
        }

        const maxDiameter = maxR * 2;
        const connectionDiameter =
          connectionMaxR > 0 ? connectionMaxR * 2 : maxDiameter;

        if (showOverlay) {
          setMaxDiameterState(Math.round(maxDiameter * 10) / 10);
          setConnectionDiameterState(Math.round(connectionDiameter * 10) / 10);
        }

        if (onDiameterComputedRef.current) {
          onDiameterComputedRef.current(
            file.name,
            maxDiameter,
            connectionDiameter,
          );
        }

        const center = new THREE.Vector3();
        bbox.getCenter(center);
        mesh.position.sub(center);

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
            });
            finishLine = new THREE.Mesh(tubeGeometry, tubeMaterial);
            scene.add(finishLine);
          }
        }

        const sphere = geometry.boundingSphere;
        const radius = sphere ? sphere.radius : maxR || 40;
        const dist = radius * 1.5;
        camera.position.set(dist, -dist, dist * 1.1);
        camera.lookAt(0, 0, 0);

        scene.add(mesh);
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
        console.log("[StlPreviewViewer] dispose finish line");
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
      if (geometry) {
        geometry.dispose();
      }
      controls.dispose();
      renderer.dispose();
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [file, showOverlay, finishLinePoints]);

  return (
    <div className="relative w-full max-w-full h-full min-h-[300px]">
      <div ref={containerRef} className="w-full h-full" />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center rounded-md bg-white/70 text-sm text-destructive">
          {error}
        </div>
      )}
      {showOverlay &&
        (maxDiameterState !== null || connectionDiameterState !== null) && (
          <div className="pointer-events-none absolute bottom-2 right-2 flex flex-col items-end gap-1 rounded-md bg-white/85 px-2 py-1 text-[12px] md:text-[13px] text-muted-foreground shadow-sm">
            {maxDiameterState !== null && (
              <span>
                최대 직경:{" "}
                <span className="font-semibold text-foreground">
                  {maxDiameterState.toFixed(1)} mm
                </span>
              </span>
            )}
            {connectionDiameterState !== null && (
              <span>
                커넥션 직경:{" "}
                <span className="font-semibold text-foreground">
                  {connectionDiameterState.toFixed(1)} mm
                </span>
              </span>
            )}
          </div>
        )}
    </div>
  );
}
