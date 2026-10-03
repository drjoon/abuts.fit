// related files:
// - web/frontend/src/shared/share/CaseShareViewer.tsx
// - web/frontend/src/shared/files/modelPreviewFile.ts
// - web/frontend/src/shared/three/screenSpaceOrbitControls.ts
// - 2026-10-03: 브리지 seating은 치식으로 좌석을 고른다(이웃 리테이너 오삽입 방지).
// - 2026-10-03: 어벗 seating을 스캔바디·바이트와 같은 trimmed ICP로 맞춘다.
// - 2026-10-03: 어벗 seating에 피니시라인 방위각 회전을 포함한다.
// - 2026-10-03: 어벗은 보철 피니시라인(내면 좌석)에 맞춰 꽂은 뒤, 보철 펼침을 같이 따른다.
// - 2026-10-03: 보철 투명도 0=완전 불투명·100=완전 투명(SSOT).
// - 2026-10-03: 보철 기본 불투명. prosthesisOpacity로 투명도 조절.
// - 2026-10-03: 보철은 펼치고, 어벗은 원본 좌표로 짝 맞춰 같은 이동. 크라운 반투명.
// - 2026-10-03: 어벗·보철은 파일 좌표 그대로 맞춰 꽂는다(옆으로 펼치지 않음). 크라운은 반투명.
// - 2026-10-03: 어벗·보철이 같은 자리에 겹치면 X축으로 나란히 펼친다. 스캔은 파일 좌표 유지.
// - 2026-10-01: onPaintSpace — 페인트 표시를 모델에 붙인다. 화면을 돌리면 같이 돈다.
// - 2026-09-28: captureCanvas(페인트 합성)·colorMapping(스캔 칼라 끄기). 의뢰 파일 프리뷰와 같은 기능.
// - 2026-09-28: 화면 맞춤은 보이는 메시의 꼭짓점을 화면에 투영해 가로·세로에 꽉 차게 맞춘다.
// - 2026-09-28: 케이스 공유 뷰어 — 디자인·스캔 여러 메시를 파일 좌표 그대로 겹치고 레이어별로 켜고 끈다.
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import {
  applyScanColorToneMapping,
  createModelPreviewMaterial,
  isScanColorPreview,
  parseModelPreview,
} from "@/shared/files/modelPreviewFile";
import { disposeBackFaceShell, syncBackFaceShell } from "@/shared/three/backFaceShell";
import { ScreenSpaceOrbitControls, applyExternalView } from "@/shared/three/screenSpaceOrbitControls";
import {
  createViewPaintSpace,
  notifyViewPaint,
  type ViewPaintSpace,
} from "@/shared/components/practice/viewPaintSpace";
import {
  computeAbutmentSeatPose,
  toothLabelFromMeshName,
  toothLabelsOverlap,
} from "@/shared/share/seatAbutmentToProsthesis";
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
  /** 표시를 겹치기 위한 현재 프레임 캔버스. */
  captureCanvas: () => HTMLCanvasElement | null;
};

type CaseLayerViewerProps = {
  layers: CaseLayerModel[];
  /** false면 스캔 레이어의 칼라·텍스처를 끄고 기본 틴트로 그린다. */
  colorMapping?: boolean;
  /** 보철 투명도 0~100. 0=완전 불투명, 100=완전 투명. */
  prosthesisTransparency?: number;
  onLayerError?: (id: string, message: string) => void;
  /** 페인트가 메시 표면에 붙도록. 씬이 준비되면 넘기고, 닫히면 null. */
  onPaintSpace?: (space: ViewPaintSpace | null) => void;
  className?: string;
};

const TEXTURE_KEY = "previewTexture";
const TONE_KEY = "layerTone";

function scanTexture(mesh: THREE.Mesh): THREE.Texture | null {
  return (mesh.userData[TEXTURE_KEY] as THREE.Texture | undefined) ?? null;
}

function layerToneOf(mesh: THREE.Mesh): CaseLayerTone {
  return (mesh.userData[TONE_KEY] as CaseLayerTone | undefined) || "scan";
}

function disposeLayerMesh(mesh: THREE.Mesh) {
  disposeBackFaceShell(mesh);
  mesh.geometry.dispose();
  const mat = mesh.material as THREE.MeshStandardMaterial;
  if (mat.map && mat.map !== scanTexture(mesh)) mat.map.dispose();
  scanTexture(mesh)?.dispose();
  mat.dispose();
}

function applyScanRendering(renderer: THREE.WebGLRenderer, colorMapping: boolean) {
  if (colorMapping) {
    applyScanColorToneMapping(renderer);
    return;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
}

const VIEWER_BACKGROUND = 0xe6e9ec;
const CAMERA_FOV = 30;
/** 화면 맞춤 여백. 1이면 가장자리에 딱 붙는다. */
const FIT_MARGIN = 1.04;
/** 보철 묶음을 펼칠 때 옆 간격(큰 쪽 치수 비율). */
const PROSTHESIS_GAP_RATIO = 0.3;

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

type DesignPiece = {
  mesh: THREE.Mesh;
  tone: "abutment" | "prosthesis";
  box: THREE.Box3;
  center: THREE.Vector3;
  size: THREE.Vector3;
};

function transparencyToOpacity(transparency: number): number {
  const t = Math.min(100, Math.max(0, transparency));
  return 1 - t / 100;
}

function applyProsthesisOpacity(mesh: THREE.Mesh, opacity: number) {
  const mat = mesh.material as THREE.MeshStandardMaterial;
  const clamped = Math.min(1, Math.max(0, opacity));
  // 0에 가까워도 transparent를 켜야 완전 투명이 된다.
  const seeThrough = clamped < 1;
  mat.transparent = seeThrough;
  mat.opacity = clamped;
  // 반투명일 때 depthWrite면 안쪽 어벗이 가려질 수 있다.
  mat.depthWrite = !seeThrough;
  mesh.renderOrder = seeThrough ? 2 : 1;
  mat.needsUpdate = true;
}

function refreshPieceBox(piece: DesignPiece) {
  piece.mesh.updateMatrixWorld(true);
  piece.box.setFromObject(piece.mesh);
  piece.box.getCenter(piece.center);
  piece.box.getSize(piece.size);
}

/**
 * 보철은 옆으로 펼친다. 어벗은 짝 보철 피니시라인에 꽂은 뒤
 * 같은 펼침 이동을 따라간다. 스캔은 손대지 않는다.
 */
function syncDesignAssembly(
  meshes: Iterable<THREE.Mesh>,
  prosthesisTransparency: number,
): boolean {
  const pieces: DesignPiece[] = [];
  for (const mesh of meshes) {
    if (!mesh.visible) continue;
    const tone = layerToneOf(mesh);
    if (tone !== "abutment" && tone !== "prosthesis") continue;
    mesh.position.set(0, 0, 0);
    mesh.quaternion.identity();
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    pieces.push({
      mesh,
      tone,
      box,
      center: box.getCenter(new THREE.Vector3()),
      size: box.getSize(new THREE.Vector3()),
    });
  }

  const crowns = pieces.filter((p) => p.tone === "prosthesis");
  const abuts = pieces.filter((p) => p.tone === "abutment");
  const assemble = crowns.length > 0 && abuts.length > 0;

  // 치식 포함 우선, 아니면 겹침·중심 거리로 보철↔어벗 짝.
  const abutToCrown = new Map<THREE.Mesh, THREE.Mesh>();
  for (const abut of abuts) {
    const abutTooth = toothLabelFromMeshName(abut.mesh.name);
    let best: DesignPiece | null = null;
    let bestScore = Infinity;
    for (const crown of crowns) {
      const crownTooth = toothLabelFromMeshName(crown.mesh.name);
      const toothHit = toothLabelsOverlap(abutTooth, crownTooth);
      const dist = abut.center.distanceTo(crown.center);
      const intersects = abut.box.intersectsBox(crown.box);
      let score = intersects ? dist * 0.01 : dist + crown.size.length() * 0.5;
      if (toothHit) score *= 0.001;
      if (score < bestScore) {
        bestScore = score;
        best = crown;
      }
    }
    if (best) abutToCrown.set(abut.mesh, best.mesh);
  }

  // 피니시라인 중심·방위각을 보철 좌석에 맞춰 어벗만 강체 이동.
  const basePosition = new Map<THREE.Mesh, THREE.Vector3>();
  const baseQuaternion = new Map<THREE.Mesh, THREE.Quaternion>();
  for (const crown of crowns) {
    basePosition.set(crown.mesh, new THREE.Vector3());
    baseQuaternion.set(crown.mesh, new THREE.Quaternion());
  }
  for (const abut of abuts) {
    const crownMesh = abutToCrown.get(abut.mesh);
    let base = new THREE.Vector3();
    let quat = new THREE.Quaternion();
    if (crownMesh) {
      const pose = computeAbutmentSeatPose(
        abut.mesh.geometry,
        crownMesh.geometry,
        {
          abutTooth: toothLabelFromMeshName(abut.mesh.name),
          crownTooth: toothLabelFromMeshName(crownMesh.name),
        },
      );
      if (pose) {
        base = pose.position;
        quat = pose.quaternion;
      }
    }
    basePosition.set(abut.mesh, base);
    baseQuaternion.set(abut.mesh, quat);
    abut.mesh.position.copy(base);
    abut.mesh.quaternion.copy(quat);
    refreshPieceBox(abut);
  }

  const units = crowns.map((crown) => {
    const members = [
      crown,
      ...abuts.filter((a) => abutToCrown.get(a.mesh) === crown.mesh),
    ];
    const unitBox = new THREE.Box3();
    for (const m of members) unitBox.union(m.box);
    return {
      crown,
      members,
      box: unitBox,
      center: unitBox.getCenter(new THREE.Vector3()),
      size: unitBox.getSize(new THREE.Vector3()),
    };
  });

  // 보철이 2개 이상이면 펼친다. 어벗만 있으면 seating만 유지.
  if (units.length >= 2) {
    units.sort(
      (a, b) =>
        a.center.x - b.center.x ||
        a.center.y - b.center.y ||
        String(a.crown.mesh.name || "").localeCompare(
          String(b.crown.mesh.name || ""),
        ),
    );
    const gap =
      Math.max(
        ...units.map((u) => Math.max(u.size.x, u.size.y, u.size.z, 1e-3)),
      ) * PROSTHESIS_GAP_RATIO;
    let cursor = 0;
    const spreadByMesh = new Map<THREE.Mesh, THREE.Vector3>();
    for (const unit of units) {
      const halfW = Math.max(unit.size.x / 2, 1e-3);
      const target = new THREE.Vector3(cursor + halfW, 0, 0);
      const delta = target.sub(unit.center);
      for (const member of unit.members) {
        spreadByMesh.set(member.mesh, delta.clone());
      }
      cursor += unit.size.x + gap;
    }
    for (const [mesh, spread] of spreadByMesh) {
      const base = basePosition.get(mesh) ?? new THREE.Vector3();
      const quat = baseQuaternion.get(mesh) ?? new THREE.Quaternion();
      mesh.quaternion.copy(quat);
      mesh.position.copy(base).add(spread);
    }
    // 펼친 줄 가운데를 원점으로.
    const row = new THREE.Box3();
    for (const unit of units) {
      for (const member of unit.members) {
        member.mesh.updateMatrixWorld(true);
        row.expandByObject(member.mesh);
      }
    }
    if (!row.isEmpty()) {
      const rowCenter = row.getCenter(new THREE.Vector3());
      for (const mesh of spreadByMesh.keys()) {
        mesh.position.x -= rowCenter.x;
        mesh.position.y -= rowCenter.y;
        mesh.position.z -= rowCenter.z;
      }
    }
  }

  const prosthesisOpacity = transparencyToOpacity(prosthesisTransparency);
  for (const piece of crowns) {
    applyProsthesisOpacity(piece.mesh, prosthesisOpacity);
  }
  for (const mesh of abuts) {
    mesh.mesh.renderOrder = 1;
  }
  return units.length >= 2 || assemble;
}

export const CaseLayerViewer = forwardRef<CaseLayerViewerHandle, CaseLayerViewerProps>(
  function CaseLayerViewer({
    layers,
    colorMapping = true,
    prosthesisTransparency = 0,
    onLayerError,
    onPaintSpace,
    className,
  }, ref) {
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
    const colorMappingRef = useRef(colorMapping);
    colorMappingRef.current = colorMapping;
    const prosthesisTransparencyRef = useRef(prosthesisTransparency);
    prosthesisTransparencyRef.current = prosthesisTransparency;
    const onPaintSpaceRef = useRef(onPaintSpace);
    onPaintSpaceRef.current = onPaintSpace;
    const paintListenersRef = useRef(new Set<() => void>());

    const fitToView = () => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      const meshes = [...meshesRef.current.values()];
      const visible = meshes.filter((m) => m.visible);
      const targets = visible.length > 0 ? visible : meshes;
      if (targets.length === 0) return;

      const dir = camera.position.clone().sub(controls.target);
      if (dir.lengthSq() < 1e-9) dir.set(0, 0, 1);
      dir.normalize();

      // 보는 방향 그대로 화면 가로·세로에 맞춘다. 구 대신 실제 꼭짓점을 투영해 여백을 줄인다.
      const box = new THREE.Box3();
      for (const mesh of targets) box.expandByObject(mesh);
      const boxCenter = box.getCenter(new THREE.Vector3());
      camera.position.copy(boxCenter).add(dir);
      camera.lookAt(boxCenter);
      camera.updateMatrixWorld();
      const toView = new THREE.Matrix4()
        .makeRotationFromQuaternion(camera.quaternion)
        .invert();
      const min = new THREE.Vector3(Infinity, Infinity, Infinity);
      const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      const point = new THREE.Vector3();
      const points: THREE.Vector3[] = [];
      for (const mesh of targets) {
        mesh.updateMatrixWorld();
        const pos = mesh.geometry.getAttribute("position");
        if (!pos) continue;
        const stride = Math.max(1, Math.floor(pos.count / 60000));
        for (let i = 0; i < pos.count; i += stride) {
          point
            .fromBufferAttribute(pos, i)
            .applyMatrix4(mesh.matrixWorld)
            .sub(boxCenter)
            .applyMatrix4(toView);
          min.min(point);
          max.max(point);
          points.push(point.clone());
        }
      }
      if (points.length === 0) return;

      // 화면 평면(x·y) 중심으로 옮긴다. z는 카메라 쪽이 +.
      const mid = new THREE.Vector3((min.x + max.x) / 2, (min.y + max.y) / 2, 0);
      const tanV = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));
      const tanH = tanV * Math.max(camera.aspect, 1e-3);
      let distance = 1e-3;
      for (const p of points) {
        const dx = Math.abs(p.x - mid.x);
        const dy = Math.abs(p.y - mid.y);
        distance = Math.max(distance, p.z + dx / tanH, p.z + dy / tanV);
      }
      distance *= FIT_MARGIN;

      const center = mid.applyQuaternion(camera.quaternion).add(boxCenter);
      controls.target.copy(center);
      camera.position.copy(center).addScaledVector(dir, distance);
      camera.near = Math.max(distance / 200, 0.01);
      camera.far = distance * 200;
      camera.updateProjectionMatrix();
      camera.lookAt(center);
      controls.syncFromCamera();
    };

    const captureCanvas = () => {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (!renderer || !scene || !camera) return null;
      renderer.render(scene, camera);
      return renderer.domElement;
    };

    useImperativeHandle(ref, () => ({ fitToView, captureCanvas }));

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

      const paintListeners = paintListenersRef.current;
      let raf = 0;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        if (paintListeners.size > 0) notifyViewPaint(paintListeners);
        renderer.render(scene, camera);
      };
      tick();

      sceneRef.current = scene;
      cameraRef.current = camera;
      rendererRef.current = renderer;
      controlsRef.current = controls;
      if (onPaintSpaceRef.current) {
        onPaintSpaceRef.current(
          createViewPaintSpace({
            getCamera: () => cameraRef.current,
            getRenderer: () => rendererRef.current,
            getParent: () => sceneRef.current,
            getTargets: () =>
              [...meshesRef.current.values()].filter((mesh) => mesh.visible && !mesh.userData.viewPaint),
            listeners: paintListeners,
            onView: (gesture) => applyExternalView(controls, gesture),
          }),
        );
      }

      const meshes = meshesRef.current;
      return () => {
        cancelAnimationFrame(raf);
        paintListeners.clear();
        onPaintSpaceRef.current?.(null);
        observer.disconnect();
        controls.dispose();
        for (const mesh of meshes.values()) disposeLayerMesh(mesh);
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
        disposeLayerMesh(mesh);
        meshes.delete(id);
      }

      let visibilityChanged = false;
      for (const layer of layers) {
        const existing = meshes.get(layer.id);
        if (existing) {
          if (existing.visible !== layer.visible) visibilityChanged = true;
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
                ? createModelPreviewMaterial(geometry, parsed.texture, {
                    colorMapping: colorMappingRef.current,
                  })
                : designMaterial(layer.tone);
            if (layer.tone === "scan" && isScanColorPreview(geometry, parsed.texture)) {
              applyScanRendering(renderer, colorMappingRef.current);
            }
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = layer.file.name || layer.id;
            mesh.userData[TONE_KEY] = layer.tone;
            if (layer.tone === "scan") mesh.userData[TEXTURE_KEY] = parsed.texture;
            mesh.renderOrder = layer.tone === "scan" ? 0 : 1;
            syncBackFaceShell(mesh);
            if (!sceneRef.current) {
              disposeLayerMesh(mesh);
              return;
            }
            const latest = layersRef.current.find((l) => l.id === layer.id);
            if (!latest) {
              disposeLayerMesh(mesh);
              return;
            }
            mesh.visible = latest.visible;
            sceneRef.current.add(mesh);
            meshes.set(layer.id, mesh);
            syncDesignAssembly(
              meshes.values(),
              prosthesisTransparencyRef.current,
            );
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

      syncDesignAssembly(meshes.values(), prosthesisTransparencyRef.current);
      if (
        !userMovedRef.current &&
        visibilityChanged &&
        [...meshes.values()].some((m) => m.visible)
      ) {
        fitToView();
      }
    }, [layers]);

    useEffect(() => {
      const opacity = transparencyToOpacity(prosthesisTransparency);
      for (const mesh of meshesRef.current.values()) {
        if (layerToneOf(mesh) !== "prosthesis") continue;
        applyProsthesisOpacity(mesh, opacity);
      }
    }, [prosthesisTransparency]);

    useEffect(() => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      let scanColor = false;
      for (const [id, mesh] of meshesRef.current) {
        if (layersRef.current.find((l) => l.id === id)?.tone !== "scan") continue;
        const texture = scanTexture(mesh);
        if (!isScanColorPreview(mesh.geometry, texture)) continue;
        scanColor = true;
        const prev = mesh.material as THREE.Material;
        mesh.material = createModelPreviewMaterial(mesh.geometry, texture, { colorMapping });
        prev.dispose();
        syncBackFaceShell(mesh);
      }
      if (scanColor) applyScanRendering(renderer, colorMapping);
    }, [colorMapping]);

    return (
      <div
        ref={containerRef}
        className={cn("absolute inset-0 overflow-hidden", className)}
      />
    );
  },
);
