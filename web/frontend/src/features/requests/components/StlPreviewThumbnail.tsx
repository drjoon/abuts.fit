// related files:
// - web/frontend/src/shared/files/modelPreviewFile.ts
// - web/frontend/src/features/requests/components/StlPreviewViewer.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - 2026-08-23: 의뢰 상세 작업 파일 타일용 정적 3D 썸네일.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Box } from "lucide-react";
import { cn } from "@/shared/ui/cn";
import { parseModelGeometry } from "@/shared/files/modelPreviewFile";

type Props = {
  file: File;
  className?: string;
};

function fitCameraToGeometry(
  camera: THREE.PerspectiveCamera,
  bbox: THREE.Box3,
): void {
  const viewTarget = bbox.getCenter(new THREE.Vector3());
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const radius =
    Math.max(size.x, size.y, size.z) / 2 ||
    bbox.getBoundingSphere(new THREE.Sphere()).radius ||
    1;
  const viewDir = new THREE.Vector3(1, -1, 0.9).normalize();
  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  const aspect = Math.max(camera.aspect, 0.01);
  const halfVFov = fovRad / 2;
  const halfHFov = Math.atan(Math.tan(halfVFov) * aspect);
  const fitDistance = Math.max(
    radius / Math.sin(halfVFov),
    radius / Math.sin(halfHFov),
  );
  const distance = fitDistance * 1.08;
  camera.position.copy(
    viewTarget.clone().add(viewDir.clone().multiplyScalar(distance)),
  );
  camera.near = Math.max(distance / 200, 0.01);
  camera.far = Math.max(distance * 40, 2000);
  camera.updateProjectionMatrix();
  camera.lookAt(viewTarget);
}

export function StlPreviewThumbnail({ file, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setFailed(false);
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.up.set(0, 0, 1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    container.replaceChildren(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.pointerEvents = "none";

    const hemi = new THREE.HemisphereLight(0xf7fafc, 0xc5d0de, 0.5);
    scene.add(hemi);
    scene.add(new THREE.AmbientLight(0xffffff, 0.18));

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
    keyLight.position.set(35, -55, 95);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xeaf2ff, 0.4);
    fillLight.position.set(-70, 45, 50);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
    rimLight.position.set(15, 90, -60);
    scene.add(rimLight);

    let mesh: THREE.Mesh | null = null;
    let geometry: THREE.BufferGeometry | null = null;

    const renderOnce = () => {
      renderer.render(scene, camera);
    };

    const updateSize = () => {
      if (!container) return;
      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      if (geometry?.boundingBox) {
        fitCameraToGeometry(camera, geometry.boundingBox);
      }
      renderOnce();
    };

    void (async () => {
      try {
        geometry = await parseModelGeometry(file);
        if (cancelled) return;

        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
          color: 0x5b9dff,
          metalness: 0.08,
          roughness: 0.6,
        });
        mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        updateSize();
        requestAnimationFrame(() => {
          if (!cancelled) updateSize();
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => updateSize());
      resizeObserver.observe(container);
    }

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      if (mesh) {
        scene.remove(mesh);
        const material = mesh.material;
        if (Array.isArray(material)) {
          material.forEach((item) => item.dispose());
        } else {
          material.dispose();
        }
      }
      geometry?.dispose();
      renderer.dispose();
      container.replaceChildren();
    };
  }, [file]);

  if (failed) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-1 text-slate-500",
          className,
        )}
      >
        <Box className="h-7 w-7 shrink-0" aria-hidden />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("h-full w-full", className)}
      aria-hidden
    />
  );
}
