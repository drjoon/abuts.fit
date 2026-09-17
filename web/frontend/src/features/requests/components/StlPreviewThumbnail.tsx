// change-log:
// - 2026-09-17: finishLinePoints — 준비 카드용 filled STL 썸네일에 FL(빨간 튜브) 오버레이.
// - 2026-09-14: Orthographic 카메라 — 뷰어와 동일하게 평행 왜곡 없이 맞춤.
// - 2026-08-23: 의뢰 상세 작업 파일 타일용 정적 3D 썸네일.
// - 2026-08-28: WebGL은 1회 렌더 후 PNG 스냅샷·즉시 dispose — 모달 뷰어와 컨텍스트 충돌 방지.
// - 2026-08-28: PLY/OBJ 버텍스 컬러·TextureFile 칼라 표시.
// - 2026-08-28: companionFiles 참조 변경만으로 썸네일 null 리셋하지 않음(플리커 방지).
// related files:
// - web/frontend/src/shared/files/modelPreviewFile.ts
// - web/frontend/src/features/requests/components/StlPreviewViewer.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/features/chat/components/ChatMessageBubble.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/FilledStlCardThumbnail.tsx
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Box } from "lucide-react";
import { cn } from "@/shared/ui/cn";
import {
  createModelPreviewMaterial,
  isScanColorPreview,
  parseModelPreview,
} from "@/shared/files/modelPreviewFile";

type Props = {
  file: File;
  textureFile?: File | null;
  companionFiles?: File[] | null;
  /** filled STL 피니시라인(xyz). 있으면 빨간 튜브로 오버레이. */
  finishLinePoints?: number[][] | null;
  className?: string;
};

/** 썸네일 캡처 해상도(CSS px). DPR 보정은 renderer에서. */
const THUMB_CSS_SIZE = 160;

function fitOrthographicCameraToGeometry(
  camera: THREE.OrthographicCamera,
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
  const aspect = Math.max(camera.right - camera.left, 0.01) /
    Math.max(camera.top - camera.bottom, 0.01);
  const half = radius * 1.08;
  if (aspect >= 1) {
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.top = half;
    camera.bottom = -half;
  } else {
    camera.left = -half;
    camera.right = half;
    camera.top = half / aspect;
    camera.bottom = -half / aspect;
  }
  camera.zoom = 1;
  const distance = Math.max(radius * 4, 40);
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
  texture: THREE.Texture | null,
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
  texture?.dispose?.();
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

function fileIdentityKey(file: File | null | undefined): string {
  if (!file) return "";
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function companionFilesIdentityKey(files: File[] | null | undefined): string {
  if (!Array.isArray(files) || files.length === 0) return "";
  return files
    .map((file) => fileIdentityKey(file))
    .filter(Boolean)
    .sort()
    .join("|");
}

function finishLineIdentityKey(points: number[][] | null | undefined): string {
  if (!Array.isArray(points) || points.length < 2) return "";
  const first = points[0];
  const mid = points[Math.floor(points.length / 2)];
  const last = points[points.length - 1];
  const fmt = (p: number[] | undefined) =>
    Array.isArray(p) && p.length >= 3
      ? `${Number(p[0]).toFixed(3)},${Number(p[1]).toFixed(3)},${Number(p[2]).toFixed(3)}`
      : "";
  return `${points.length}:${fmt(first)}|${fmt(mid)}|${fmt(last)}`;
}

function addFinishLineOverlay(
  scene: THREE.Scene,
  points: number[][] | null | undefined,
  bbox: THREE.Box3 | null | undefined,
): THREE.Mesh | null {
  if (!Array.isArray(points) || points.length < 2) return null;
  const pts = points
    .filter((p) => Array.isArray(p) && p.length >= 3)
    .map((p) => new THREE.Vector3(Number(p[0]), Number(p[1]), Number(p[2])))
    .filter((v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z));
  if (pts.length < 2) return null;

  const closedPts = pts.slice();
  const first = closedPts[0];
  const last = closedPts[closedPts.length - 1];
  if (first && last && !first.equals(last)) {
    closedPts.push(first.clone());
  }

  const curve = new THREE.CatmullRomCurve3(closedPts, true);
  const tubularSegments = Math.max(pts.length * 3, 120);
  const size = new THREE.Vector3();
  bbox?.getSize(size);
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
  const finishLine = new THREE.Mesh(tubeGeometry, tubeMaterial);
  finishLine.renderOrder = 10;
  scene.add(finishLine);
  return finishLine;
}

export function StlPreviewThumbnail({
  file,
  textureFile = null,
  companionFiles = null,
  finishLinePoints = null,
  className,
}: Props) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const fileKey = fileIdentityKey(file);
  const textureKey = fileIdentityKey(textureFile);
  const companionKey = companionFilesIdentityKey(companionFiles);
  const finishLineKey = finishLineIdentityKey(finishLinePoints);
  const shownCaptureKeyRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    let released = false;
    let mesh: THREE.Mesh | null = null;
    let finishLineMesh: THREE.Mesh | null = null;
    let geometry: THREE.BufferGeometry | null = null;
    let previewTexture: THREE.Texture | null = null;
    let scene: THREE.Scene | null = null;
    let renderer: THREE.WebGLRenderer | null = null;

    const release = () => {
      if (released) return;
      released = true;
      if (finishLineMesh && scene) {
        scene.remove(finishLineMesh);
        finishLineMesh.geometry?.dispose();
        const flMat = finishLineMesh.material;
        if (Array.isArray(flMat)) {
          flMat.forEach((item) => item.dispose());
        } else {
          flMat?.dispose();
        }
        finishLineMesh = null;
      }
      releaseWebGl(renderer, mesh, geometry, scene, previewTexture);
      renderer = null;
      mesh = null;
      geometry = null;
      previewTexture = null;
      scene = null;
    };

    setFailed(false);
    const captureKey = `${fileKey}|${finishLineKey}`;
    // 모델/FL이 바뀐 경우에만 placeholder. companion/texture 갱신은 이전 PNG 유지.
    if (
      shownCaptureKeyRef.current &&
      shownCaptureKeyRef.current !== captureKey
    ) {
      setThumbUrl(null);
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);

    const camera = new THREE.OrthographicCamera(-40, 40, 40, -40, 0.1, 1000);
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
        const parsed = await parseModelPreview(file, {
          textureFile,
          companionFiles,
        });
        if (cancelled || released) {
          parsed.texture?.dispose?.();
          parsed.geometry.dispose();
          return;
        }

        geometry = parsed.geometry;
        previewTexture = parsed.texture;
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        geometry.computeVertexNormals();

        const material = createModelPreviewMaterial(geometry, previewTexture);
        if (isScanColorPreview(geometry, previewTexture)) {
          renderer.toneMappingExposure = 1.35;
        }
        mesh = new THREE.Mesh(geometry, material);
        scene?.add(mesh);

        try {
          finishLineMesh = addFinishLineOverlay(
            scene!,
            finishLinePoints,
            geometry.boundingBox,
          );
        } catch {
          finishLineMesh = null;
        }

        if (geometry.boundingBox) {
          fitOrthographicCameraToGeometry(camera, geometry.boundingBox);
        }
        renderer?.render(scene!, camera);

        const dataUrl = renderer!.domElement.toDataURL("image/png");
        if (cancelled || released) return;
        shownCaptureKeyRef.current = captureKey;
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
    // file/texture/companion/FL 객체 참조가 매 렌더 바뀌어도 identity key가 같으면 재캡처하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identity keys are SSOT
  }, [companionKey, fileKey, finishLineKey, textureKey]);

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
