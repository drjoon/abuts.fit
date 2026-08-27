// related files:
// - web/frontend/src/shared/files/modelPreviewFile.ts
// - web/frontend/src/features/requests/components/StlPreviewViewer.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/features/chat/components/ChatMessageBubble.tsx
// - 2026-08-23: 의뢰 상세 작업 파일 타일용 정적 3D 썸네일.
// - 2026-08-28: WebGL은 1회 렌더 후 PNG 스냅샷·즉시 dispose — 모달 뷰어와 컨텍스트 충돌 방지.
import { useEffect, useState } from "react";
import * as THREE from "three";
import { Box } from "lucide-react";
import { cn } from "@/shared/ui/cn";
import { parseModelGeometry } from "@/shared/files/modelPreviewFile";

type Props = {
  file: File;
  className?: string;
};

/** 썸네일 캡처 해상도(CSS px). DPR 보정은 renderer에서. */
const THUMB_CSS_SIZE = 160;

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

function releaseWebGl(
  renderer: THREE.WebGLRenderer | null,
  mesh: THREE.Mesh | null,
  geometry: THREE.BufferGeometry | null,
  scene: THREE.Scene | null,
): void {
  if (mesh && scene) {
    scene.remove(mesh);
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
    } else {
      material.dispose();
    }
  }
  geometry?.dispose();
  if (!renderer) return;
  try {
    const gl = renderer.getContext();
    gl?.getExtension?.("WEBGL_lose_context")?.loseContext();
  } catch {
    // ignore
  }
  try {
    renderer.dispose();
  } catch {
    // ignore
  }
  try {
    renderer.forceContextLoss?.();
  } catch {
    // ignore
  }
  try {
    renderer.domElement.remove();
  } catch {
    // ignore
  }
}

export function StlPreviewThumbnail({ file, className }: Props) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let released = false;
    let mesh: THREE.Mesh | null = null;
    let geometry: THREE.BufferGeometry | null = null;
    let scene: THREE.Scene | null = null;
    let renderer: THREE.WebGLRenderer | null = null;

    const release = () => {
      if (released) return;
      released = true;
      releaseWebGl(renderer, mesh, geometry, scene);
      renderer = null;
      mesh = null;
      geometry = null;
      scene = null;
    };

    setFailed(false);
    setThumbUrl(null);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.up.set(0, 0, 1);

    // preserveDrawingBuffer: toDataURL 캡처용. 썸네일은 1프레임만 쓰므로 OK.
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: false,
    });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(THUMB_CSS_SIZE, THUMB_CSS_SIZE, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    scene.add(new THREE.HemisphereLight(0xf7fafc, 0xc5d0de, 0.5));
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

    void (async () => {
      try {
        geometry = await parseModelGeometry(file);
        if (cancelled || released) return;

        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
          color: 0x5b9dff,
          metalness: 0.08,
          roughness: 0.6,
        });
        mesh = new THREE.Mesh(geometry, material);
        scene?.add(mesh);

        if (geometry.boundingBox) {
          fitCameraToGeometry(camera, geometry.boundingBox);
        }
        renderer?.render(scene!, camera);

        const dataUrl = renderer!.domElement.toDataURL("image/png");
        if (cancelled || released) return;
        setThumbUrl(dataUrl);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        release();
      }
    })();

    return () => {
      cancelled = true;
      release();
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

  if (!thumbUrl) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-1 text-slate-400",
          className,
        )}
        aria-hidden
      >
        <Box className="h-7 w-7 shrink-0 opacity-60" />
      </div>
    );
  }

  return (
    <img
      src={thumbUrl}
      alt=""
      className={cn("h-full w-full object-cover", className)}
      draggable={false}
    />
  );
}
