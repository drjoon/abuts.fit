// related files:
// - web/frontend/src/shared/share/CaseShareViewer.tsx
// - web/frontend/src/shared/files/modelPreviewFile.ts
// - web/frontend/src/shared/three/screenSpaceOrbitControls.ts
// - 2026-09-28: 케이스 공유 뷰어 — 디자인·스캔 여러 메시를 파일 좌표 그대로 겹치고 레이어별로 켜고 끈다.
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import {
  applyScanColorToneMapping,
  createModelPreviewMaterial,
  isScanColorPreview,
  parseModelPreview,
} from "@/shared/files/modelPreviewFile";
import { ScreenSpaceOrbitControls } from "@/shared/three/screenSpaceOrbitControls";
import { cn } from "@/shared/ui/cn";

export type CaseLayerTone = "prosthesis" | "abutment" | "scan";

export type CaseLayerModel = {
  id: string;
  file: File;
  companionFiles?: File[];
  tone: CaseLayerTone;
  visible: boolean;
};

export type CaseLayerViewerHandle = {
  fitToView: () => void;
};

type CaseLayerViewerProps = {
  layers: CaseLayerModel[];
  onLayerError?: (id: string, message: string) => void;
  className?: string;
};

const VIEWER_BACKGROUND = 0xe6e9ec;
const CAMERA_FOV = 30;

function designMaterial(tone: CaseLayerTone): THREE.MeshStandardMaterial {
  if (tone === "abutment") {
    return new THREE.MeshStandardMaterial({
      color: 0xb9bec6,
      metalness: 0.55,
      roughness: 0.35,
    });
  }
  return new THREE.MeshStandardMaterial({
    color: 0xf2eee4,
    metalness: 0.04,
    roughness: 0.42,
  });
}

export const CaseLayerViewer = forwardRef<CaseLayerViewerHandle, CaseLayerViewerProps>(
  function CaseLayerViewer({ layers, onLayerError, className }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const controlsRef = useRef<ScreenSpaceOrbitControls | null>(null);
    const meshesRef = useRef(new Map<string, THREE.Mesh>());
    const loadingRef = useRef(new Set<string>());
    /** 사용자가 돌리거나 옮기기 전에는 메시가 들어올 때마다 다시 맞춘다. */
    const userMovedRef = useRef(false);
    const layersRef = useRef(layers);
    layersRef.current = layers;
    const onLayerErrorRef = useRef(onLayerError);
    onLayerErrorRef.current = onLayerError;

    const fitToView = () => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      const meshes = [...meshesRef.current.values()];
      const visible = meshes.filter((m) => m.visible);
      const targets = visible.length > 0 ? visible : meshes;
      if (targets.length === 0) return;

      const box = new THREE.Box3();
      for (const mesh of targets) box.expandByObject(mesh);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const radius = Math.max(sphere.radius, 1e-3);
      const distance = (radius / Math.sin(THREE.MathUtils.degToRad(CAMERA_FOV / 2))) * 1.1;

      const dir = camera.position.clone().sub(controls.target);
      if (dir.lengthSq() < 1e-9) dir.set(0, 0, 1);
      dir.normalize();

      controls.target.copy(sphere.center);
      camera.position.copy(sphere.center).addScaledVector(dir, distance);
      camera.near = Math.max(distance / 200, 0.01);
      camera.far = distance * 200;
      camera.updateProjectionMatrix();
      camera.lookAt(sphere.center);
      controls.syncFromCamera();
    };

    useImperativeHandle(ref, () => ({ fitToView }));

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(VIEWER_BACKGROUND);
      const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 5000);
      camera.position.set(0, 0, 100);
      scene.add(camera);
      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 0.55));
      const key = new THREE.DirectionalLight(0xffffff, 1.05);
      key.position.set(0.6, 0.8, 1);
      camera.add(key);
      const fill = new THREE.DirectionalLight(0xffffff, 0.35);
      fill.position.set(-0.8, -0.3, 0.6);
      camera.add(fill);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      container.appendChild(renderer.domElement);
      renderer.domElement.style.display = "block";
      renderer.domElement.style.position = "absolute";
      renderer.domElement.style.inset = "0";

      const controls = new ScreenSpaceOrbitControls(camera, renderer.domElement, {
        rotateSpeed: 1,
        zoomSpeed: 1.1,
      });
      controls.addEventListener("change", () => {
        userMovedRef.current = true;
      });

      const resize = () => {
        const w = Math.max(container.clientWidth, 1);
        const h = Math.max(container.clientHeight, 1);
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(container);

      let raf = 0;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        renderer.render(scene, camera);
      };
      tick();

      sceneRef.current = scene;
      cameraRef.current = camera;
      rendererRef.current = renderer;
      controlsRef.current = controls;

      const meshes = meshesRef.current;
      return () => {
        cancelAnimationFrame(raf);
        observer.disconnect();
        controls.dispose();
        for (const mesh of meshes.values()) {
          mesh.geometry.dispose();
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.map?.dispose();
          mat.dispose();
        }
        meshes.clear();
        renderer.dispose();
        renderer.domElement.remove();
        sceneRef.current = null;
        cameraRef.current = null;
        rendererRef.current = null;
        controlsRef.current = null;
      };
    }, []);

    useEffect(() => {
      const scene = sceneRef.current;
      const renderer = rendererRef.current;
      if (!scene || !renderer) return;
      const meshes = meshesRef.current;
      const wanted = new Set(layers.map((l) => l.id));

      for (const [id, mesh] of meshes) {
        if (wanted.has(id)) continue;
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        meshes.delete(id);
      }

      for (const layer of layers) {
        const existing = meshes.get(layer.id);
        if (existing) {
          existing.visible = layer.visible;
          continue;
        }
        if (loadingRef.current.has(layer.id)) continue;
        loadingRef.current.add(layer.id);
        void (async () => {
          try {
            const parsed = await parseModelPreview(layer.file, {
              companionFiles: layer.companionFiles || [],
            });
            const geometry = parsed.geometry;
            if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
            const material =
              layer.tone === "scan"
                ? createModelPreviewMaterial(geometry, parsed.texture)
                : designMaterial(layer.tone);
            if (layer.tone === "scan" && isScanColorPreview(geometry, parsed.texture)) {
              applyScanColorToneMapping(renderer);
            }
            const mesh = new THREE.Mesh(geometry, material);
            mesh.renderOrder = layer.tone === "scan" ? 0 : 1;
            if (!sceneRef.current) {
              geometry.dispose();
              material.dispose();
              return;
            }
            const latest = layersRef.current.find((l) => l.id === layer.id);
            if (!latest) {
              geometry.dispose();
              material.dispose();
              return;
            }
            mesh.visible = latest.visible;
            sceneRef.current.add(mesh);
            meshes.set(layer.id, mesh);
            if (!userMovedRef.current && mesh.visible) fitToView();
          } catch (error) {
            onLayerErrorRef.current?.(
              layer.id,
              error instanceof Error ? error.message : "3D 파일을 읽지 못했습니다.",
            );
          } finally {
            loadingRef.current.delete(layer.id);
          }
        })();
      }
    }, [layers]);

    return (
      <div
        ref={containerRef}
        className={cn("absolute inset-0 overflow-hidden", className)}
      />
    );
  },
);
