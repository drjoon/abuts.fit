import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

type Props = {
  file: File;
  onDiameterComputed?: (
    filename: string,
    maxDiameter: number,
    connectionDiameter: number
  ) => void;
  showOverlay?: boolean;
};

export function StlPreviewViewer({
  file,
  onDiameterComputed,
  showOverlay = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onDiameterComputedRef = useRef(onDiameterComputed);
  const [maxDiameterState, setMaxDiameterState] = useState<number | null>(null);
  const [connectionDiameterState, setConnectionDiameterState] = useState<
    number | null
  >(null);

  useEffect(() => {
    onDiameterComputedRef.current = onDiameterComputed;
  }, [onDiameterComputed]);

  useEffect(() => {
    if (!containerRef.current) return;

    const height = 300;
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
    const url = URL.createObjectURL(file);

    loader.load(
      url,
      (geometry) => {
        const material = new THREE.MeshStandardMaterial({
          color: 0x5b9dff,
          metalness: 0.2,
          roughness: 0.25,
        });
        const mesh = new THREE.Mesh(geometry, material);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        const bbox = geometry.boundingBox;
        if (bbox) {
          const position = geometry.getAttribute("position");

          // 1) 전체 포인트에서 최대 반지름(maxR) 계산
          let maxR = 0;
          for (let i = 0; i < position.count; i++) {
            const x = position.getX(i);
            const y = position.getY(i);
            const r = Math.sqrt(x * x + y * y);
            if (r > maxR) maxR = r;
          }

          // 2) z=0 평면과 각 삼각형(face)의 교차선을 이용해 커넥션 직경 계산
          //    STL은 인덱스 없이 position 속에 삼각형이 순서대로 들어있다고 가정 (v0,v1,v2),(v3,v4,v5),...
          let connectionMaxR = 0;

          const addIntersection = (
            x1: number,
            y1: number,
            z1: number,
            x2: number,
            y2: number,
            z2: number
          ) => {
            if ((z1 === 0 && z2 === 0) || z1 === z2) return;
            if ((z1 > 0 && z2 > 0) || (z1 < 0 && z2 < 0)) return; // 같은 쪽이면 z=0 안 지남

            const t = z1 / (z1 - z2); // z1 + t*(z2-z1) = 0
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

            // 세 엣지와 z=0 평면의 교차점 계산
            addIntersection(x0, y0, z0, x1, y1, z1);
            addIntersection(x1, y1, z1, x2, y2, z2);
            addIntersection(x2, y2, z2, x0, y0, z0);
          }

          const maxDiameter = maxR * 2;
          const connectionDiameter =
            connectionMaxR > 0 ? connectionMaxR * 2 : maxDiameter;

          // 내부 표시용 상태 업데이트 (필요 시에만)
          if (showOverlay) {
            setMaxDiameterState(Math.round(maxDiameter * 10) / 10);
            setConnectionDiameterState(
              Math.round(connectionDiameter * 10) / 10
            );
          }

          // 부모로 콜백 전달 (기존 동작 유지)
          if (onDiameterComputedRef.current) {
            onDiameterComputedRef.current(
              file.name,
              maxDiameter,
              connectionDiameter
            );
          }

          // 3) 시각화를 위해서만 메쉬를 씬 중앙으로 이동
          const center = new THREE.Vector3();
          bbox.getCenter(center);
          mesh.position.sub(center);

          const sphere = geometry.boundingSphere;
          const radius = sphere ? sphere.radius : maxR || 40;
          const dist = radius * 1.5;
          camera.position.set(dist, -dist, dist * 1.1);
          camera.lookAt(0, 0, 0);
        }

        scene.add(mesh);
      },
      undefined,
      () => {
        URL.revokeObjectURL(url);
      }
    );

    const updateSize = () => {
      if (!containerRef.current) return;
      const newWidth = containerRef.current.clientWidth || width;
      const newHeight = height;
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
      cancelAnimationFrame(frameId);
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener("resize", updateSize);
      }
      controls.dispose();
      renderer.dispose();
      URL.revokeObjectURL(url);
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [file, showOverlay]);

  return (
    <div className="relative w-full max-w-full h-[300px]">
      <div ref={containerRef} className="w-full h-full" />
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
