// 기공소 AI 보철 — 상악·하악·바이트를 저장된 좌표 그대로 겹쳐 본다.
// - 2026-09-26: 표시 토글·교합/협측/설측/근심/원심 뷰 큐브·칼라 매핑·바이트 투명도.
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import * as THREE from "three";
import { ImageDown, LocateFixed } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScreenSpaceOrbitControls } from "@/shared/three/screenSpaceOrbitControls";
import {
  applyScanColorToneMapping,
  createModelPreviewMaterial,
  isScanColorPreview,
  parseModelPreview,
  SCAN_COLOR_PREVIEW_BACKGROUND,
} from "@/shared/files/modelPreviewFile";
import type { LabOralScanRole } from "@/shared/practice/labProsthesisAiDesign";
import { cn } from "@/shared/ui/cn";

export type OralScanOverlaySource = {
  id: string;
  fileName: string;
  role: LabOralScanRole;
  file: File;
  companionFiles?: File[] | null;
};

type Props = {
  items: OralScanOverlaySource[];
  visible: Record<string, boolean>;
  colorMapping: boolean;
  /** 0–1. 바이트 메시만 적용 */
  biteOpacity: number;
  busy?: boolean;
  busyLabel?: string;
  onScanColorChange?: (hasScanColor: boolean) => void;
  className?: string;
};

type LoadedMesh = {
  id: string;
  role: LabOralScanRole;
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  texture: THREE.Texture | null;
  hasColor: boolean;
};

type SnapAnim = {
  start: number;
  duration: number;
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromUp: THREE.Vector3;
  toUp: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromZoom: number;
  toZoom: number;
};

type ViewPreset = {
  id: string;
  label: string;
  dir: THREE.Vector3;
  up: THREE.Vector3;
};

const ROLE_COLOR: Record<LabOralScanRole, number> = {
  upper: 0x3b82f6,
  lower: 0xe39a3c,
  bite: 0x14b8a6,
  other: 0x94a3b8,
};

const HOME_DIR = new THREE.Vector3(0.42, -1, 0.68);
const HOME_UP = new THREE.Vector3(0, 0, 1);

const VIEW_PRESETS: ViewPreset[] = [
  {
    id: "occlusal",
    label: "교합면",
    dir: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
  },
  {
    id: "buccal",
    label: "협측",
    dir: new THREE.Vector3(0, -1, 0),
    up: new THREE.Vector3(0, 0, 1),
  },
  {
    id: "lingual",
    label: "설측",
    dir: new THREE.Vector3(0, 1, 0),
    up: new THREE.Vector3(0, 0, 1),
  },
  {
    id: "mesial",
    label: "근심측",
    dir: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 0, 1),
  },
  {
    id: "distal",
    label: "원심측",
    dir: new THREE.Vector3(-1, 0, 0),
    up: new THREE.Vector3(0, 0, 1),
  },
  {
    id: "inferior",
    label: "하방",
    dir: new THREE.Vector3(0, 0, -1),
    up: new THREE.Vector3(0, 1, 0),
  },
];

/** BoxGeometry material index: +X -X +Y -Y +Z -Z */
const CUBE_FACE_VIEWS: ViewPreset[] = [
  VIEW_PRESETS[3],
  VIEW_PRESETS[4],
  VIEW_PRESETS[2],
  VIEW_PRESETS[1],
  VIEW_PRESETS[0],
  VIEW_PRESETS[5],
];

const CUBE_FACE_FILL = [
  "#e7f8ef",
  "#ffe8e8",
  "#f3e8ff",
  "#fff4e5",
  "#e8f1ff",
  "#eef2f6",
];

type DentalFrame = {
  up: THREE.Vector3;
  anterior: THREE.Vector3;
  right: THREE.Vector3;
};

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function samplePositions(geometry: THREE.BufferGeometry, cap: number) {
  const pos = geometry.getAttribute("position");
  const out: Array<[number, number, number]> = [];
  if (!pos || pos.count === 0) return out;
  const stride = Math.max(1, Math.floor(pos.count / cap));
  for (let i = 0; i < pos.count; i += stride) {
    out.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  }
  return out;
}

function meanVec(points: Array<[number, number, number]>): THREE.Vector3 | null {
  if (points.length === 0) return null;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
    z += p[2];
  }
  const n = points.length;
  return new THREE.Vector3(x / n, y / n, z / n);
}

/** 상악·하악 중심 차이와 치열 형태로 교합 축을 잡는다. 메시 상대 위치는 바꾸지 않는다. */
function estimateDentalFrame(loaded: LoadedMesh[]): DentalFrame | null {
  const upperPts: Array<[number, number, number]> = [];
  const lowerPts: Array<[number, number, number]> = [];
  const archPts: Array<[number, number, number]> = [];
  for (const entry of loaded) {
    if (entry.role !== "upper" && entry.role !== "lower") continue;
    const pts = samplePositions(entry.geometry, 2500);
    archPts.push(...pts);
    if (entry.role === "upper") upperPts.push(...pts);
    else lowerPts.push(...pts);
  }
  if (archPts.length < 30) return null;

  const upperC = meanVec(upperPts);
  const lowerC = meanVec(lowerPts);
  const mean = meanVec(archPts)!;
  let up = new THREE.Vector3();
  if (upperC && lowerC) up.subVectors(upperC, lowerC);
  if (up.lengthSq() < 1e-4) {
    up = smallestPcaAxis(archPts, mean);
  }
  if (up.lengthSq() < 1e-8) return null;
  up.normalize();

  const tangent = Math.abs(up.z) < 0.9
    ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(1, 0, 0);
  const axisA = new THREE.Vector3().crossVectors(up, tangent).normalize();
  const axisB = new THREE.Vector3().crossVectors(up, axisA).normalize();

  let cxx = 0;
  let cxy = 0;
  let cyy = 0;
  const proj: Array<{ a: number; b: number }> = [];
  for (const p of archPts) {
    const dx = p[0] - mean.x;
    const dy = p[1] - mean.y;
    const dz = p[2] - mean.z;
    const a = dx * axisA.x + dy * axisA.y + dz * axisA.z;
    const b = dx * axisB.x + dy * axisB.y + dz * axisB.z;
    proj.push({ a, b });
    cxx += a * a;
    cxy += a * b;
    cyy += b * b;
  }
  const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const lAlong = cxx * ct * ct + 2 * cxy * ct * st + cyy * st * st;
  const lAcross = cxx * st * st - 2 * cxy * ct * st + cyy * ct * ct;
  let major = new THREE.Vector2(ct, st);
  let minor = new THREE.Vector2(-st, ct);
  if (lAcross > lAlong) {
    major = new THREE.Vector2(-st, ct);
    minor = new THREE.Vector2(ct, st);
  }

  const minorScores = proj.map((p) => p.a * minor.x + p.b * minor.y);
  const sorted = [...minorScores].sort((a, b) => a - b);
  const loCut = sorted[Math.floor(sorted.length * 0.1)] ?? sorted[0] ?? 0;
  const hiCut = sorted[Math.floor(sorted.length * 0.9)] ?? sorted[sorted.length - 1] ?? 0;
  const spread = (side: "lo" | "hi") => {
    let n = 0;
    let sum = 0;
    let sum2 = 0;
    for (let i = 0; i < proj.length; i += 1) {
      const score = minorScores[i] ?? 0;
      if (side === "lo" ? score > loCut : score < hiCut) continue;
      const majorScore = (proj[i]?.a ?? 0) * major.x + (proj[i]?.b ?? 0) * major.y;
      sum += majorScore;
      sum2 += majorScore * majorScore;
      n += 1;
    }
    if (n < 2) return 0;
    const avg = sum / n;
    return sum2 / n - avg * avg;
  };
  const loSpread = spread("lo");
  const hiSpread = spread("hi");
  const minor3 = new THREE.Vector3()
    .addScaledVector(axisA, minor.x)
    .addScaledVector(axisB, minor.y)
    .normalize();
  // 좌우로 벌어진 쪽이 구치(원심), 모아진 쪽이 전치(협측이 바라보는 방향).
  const anterior = hiSpread < loSpread ? minor3 : minor3.negate();
  const right = new THREE.Vector3().crossVectors(anterior, up).normalize();
  if (right.lengthSq() < 1e-8) return null;
  return { up, anterior, right };
}

function smallestPcaAxis(
  points: Array<[number, number, number]>,
  mean: THREE.Vector3,
): THREE.Vector3 {
  let xx = 0;
  let yy = 0;
  let zz = 0;
  let xy = 0;
  let xz = 0;
  let yz = 0;
  for (const p of points) {
    const x = p[0] - mean.x;
    const y = p[1] - mean.y;
    const z = p[2] - mean.z;
    xx += x * x;
    yy += y * y;
    zz += z * z;
    xy += x * y;
    xz += x * z;
    yz += y * z;
  }
  const axes = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ];
  const vars = [xx, yy, zz];
  let best = 0;
  if ((vars[1] ?? 0) < (vars[best] ?? 0)) best = 1;
  if ((vars[2] ?? 0) < (vars[best] ?? 0)) best = 2;
  const axis = axes[best] ?? new THREE.Vector3(0, 0, 1);
  if (xy * xy + xz * xz + yz * yz > 1) {
    const candidates = [
      new THREE.Vector3(yy + zz, -xy, -xz),
      new THREE.Vector3(-xy, xx + zz, -yz),
      new THREE.Vector3(-xz, -yz, xx + yy),
    ];
    let pick = candidates[0]!;
    let score = Infinity;
    for (const c of candidates) {
      if (c.lengthSq() < 1e-8) continue;
      const v = xx * c.x * c.x + yy * c.y * c.y + zz * c.z * c.z +
        2 * xy * c.x * c.y + 2 * xz * c.x * c.z + 2 * yz * c.y * c.z;
      if (v < score) {
        score = v;
        pick = c;
      }
    }
    if (pick.lengthSq() > 1e-8) return pick.normalize();
  }
  return axis;
}

function applyDentalFrame(frame: DentalFrame) {
  const set = (id: string, dir: THREE.Vector3, camUp: THREE.Vector3) => {
    const view = VIEW_PRESETS.find((row) => row.id === id);
    if (!view) return;
    view.dir.copy(dir);
    view.up.copy(camUp);
  };
  const { up, anterior, right } = frame;
  set("occlusal", up, anterior);
  set("inferior", up.clone().negate(), anterior);
  set("buccal", anterior.clone().negate(), up);
  set("lingual", anterior, up);
  set("mesial", right, up);
  set("distal", right.clone().negate(), up);
  HOME_DIR.copy(anterior).multiplyScalar(-1).addScaledVector(up, 0.62).normalize();
  HOME_UP.copy(up);
}

function makeFaceTexture(label: string, fill: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 240, 240);
  ctx.fillStyle = "#0f172a";
  ctx.font = '700 72px Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function triggerPngDownload(dataUrl: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = "scan-overlay.png";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function OralScanOverlayViewer({
  items,
  visible,
  colorMapping,
  biteOpacity,
  busy = false,
  busyLabel = "",
  onScanColorChange,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cubeRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<ScreenSpaceOrbitControls | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const cubeSceneRef = useRef<THREE.Scene | null>(null);
  const cubeCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const cubeRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cubeMeshRef = useRef<THREE.Mesh | null>(null);
  const cubeMaterialsRef = useRef<THREE.MeshBasicMaterial[]>([]);
  const loadedRef = useRef<LoadedMesh[]>([]);
  const fitRadiusRef = useRef(40);
  const snapRef = useRef<SnapAnim | null>(null);
  const lookRef = useRef({ colorMapping, biteOpacity });
  const visibleRef = useRef(visible);
  const onScanColorChangeRef = useRef(onScanColorChange);
  const itemsRef = useRef(items);
  const [parseNote, setParseNote] = useState("");
  const [loadVersion, setLoadVersion] = useState(0);

  lookRef.current = { colorMapping, biteOpacity };
  visibleRef.current = visible;
  onScanColorChangeRef.current = onScanColorChange;
  itemsRef.current = items;

  const itemsKey = items
    .map((item) => `${item.id}:${item.file.size}:${item.file.lastModified}`)
    .join("|");

  const frameCamera = (
    dir: THREE.Vector3,
    up: THREE.Vector3,
    animate: boolean,
  ) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const radius = Math.max(fitRadiusRef.current, 1);
    const dist = radius * 4;
    const toPos = dir.clone().normalize().multiplyScalar(dist);
    const toUp = up.clone();
    if (Math.abs(toUp.dot(dir.clone().normalize())) > 0.92) {
      toUp.set(0, 0, 1);
    }
    toUp.normalize();
    if (!animate) {
      snapRef.current = null;
      controls.target.set(0, 0, 0);
      camera.position.copy(toPos);
      camera.up.copy(toUp);
      camera.zoom = 1;
      camera.lookAt(controls.target);
      camera.updateProjectionMatrix();
      controls.syncFromCamera();
      return;
    }
    snapRef.current = {
      start: performance.now(),
      duration: 280,
      fromPos: camera.position.clone(),
      toPos,
      fromUp: camera.up.clone(),
      toUp,
      fromTarget: controls.target.clone(),
      toTarget: new THREE.Vector3(0, 0, 0),
      fromZoom: camera.zoom,
      toZoom: 1,
    };
  };

  const applyFitFrustrum = () => {
    const camera = cameraRef.current;
    const el = containerRef.current;
    if (!camera || !el) return;
    const width = Math.max(el.clientWidth, 1);
    const height = Math.max(el.clientHeight, 1);
    const aspect = width / height;
    const frustumH = Math.max(fitRadiusRef.current, 1) * 2 * 1.42;
    camera.top = frustumH / 2;
    camera.bottom = -frustumH / 2;
    camera.right = (frustumH * aspect) / 2;
    camera.left = (-frustumH * aspect) / 2;
    const dist = Math.max(fitRadiusRef.current, 1) * 4;
    camera.near = Math.max(fitRadiusRef.current * 0.01, 0.05);
    camera.far = dist * 40;
    camera.updateProjectionMatrix();
    const controls = controlsRef.current;
    if (controls) {
      controls.minDistance = Math.max(fitRadiusRef.current * 0.15, 1);
      controls.maxDistance = Math.max(fitRadiusRef.current * 30, 80);
    }
  };

  const restyleLoaded = () => {
    const { colorMapping: mapping, biteOpacity: opacity } = lookRef.current;
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    let anyColor = false;
    for (const entry of loadedRef.current) {
      if (entry.hasColor) anyColor = true;
      const useScan = mapping && entry.hasColor;
      const mat = createModelPreviewMaterial(entry.geometry, entry.texture, {
        colorMapping: useScan,
      });
      mat.side = THREE.DoubleSide;
      if (!useScan) mat.color.set(ROLE_COLOR[entry.role]);
      const isBite = entry.role === "bite";
      const alpha = isBite ? Math.min(1, Math.max(0.15, opacity)) : 1;
      mat.transparent = alpha < 0.995;
      mat.opacity = alpha;
      mat.depthWrite = alpha > 0.92;
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = isBite ? -2 : entry.role === "upper" ? -1 : 0;
      mat.polygonOffsetUnits = 1;
      const prev = entry.mesh.material;
      entry.mesh.material = mat;
      entry.mesh.renderOrder = isBite ? 2 : 1;
      const list = Array.isArray(prev) ? prev : [prev];
      for (const old of list) old.dispose();
      entry.mesh.visible = visibleRef.current[entry.id] !== false;
    }
    if (scene && renderer) {
      if (mapping && anyColor) {
        applyScanColorToneMapping(renderer);
        scene.background = new THREE.Color(SCAN_COLOR_PREVIEW_BACKGROUND);
      } else {
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1;
        scene.background = new THREE.Color(0xf3f4f6);
      }
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    const cubeEl = cubeRef.current;
    if (!el || !cubeEl) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf3f4f6);
    sceneRef.current = scene;

    const width = Math.max(el.clientWidth, 1);
    const height = Math.max(el.clientHeight, 1);
    const aspect = width / height;
    const frustum = 80;
    const camera = new THREE.OrthographicCamera(
      (-frustum * aspect) / 2,
      (frustum * aspect) / 2,
      frustum / 2,
      -frustum / 2,
      0.1,
      5000,
    );
    camera.up.copy(HOME_UP);
    camera.position.copy(HOME_DIR.clone().normalize().multiplyScalar(160));
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    rendererRef.current = renderer;
    el.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xf8fafc, 0xcbd5e1, 0.55));
    scene.add(new THREE.AmbientLight(0xffffff, 0.22));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(40, -60, 90);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xe8eef8, 0.4);
    fill.position.set(-70, 40, 40);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.28);
    rim.position.set(10, 80, -50);
    scene.add(rim);

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    camera.lookAt(0, 0, 0);
    const controls = new ScreenSpaceOrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.syncFromCamera();
    controlsRef.current = controls;
    const cancelSnap = () => {
      snapRef.current = null;
    };
    controls.addEventListener("start", cancelSnap);

    const cubeScene = new THREE.Scene();
    cubeSceneRef.current = cubeScene;
    const cubeCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 20);
    cubeCameraRef.current = cubeCamera;
    const cubeRenderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      canvas: cubeEl,
    });
    cubeRenderer.outputColorSpace = THREE.SRGBColorSpace;
    cubeRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    cubeRenderer.setSize(132, 132);
    cubeRendererRef.current = cubeRenderer;

    const materials = CUBE_FACE_VIEWS.map((view, index) => {
      const texture = makeFaceTexture(view.label, CUBE_FACE_FILL[index] || "#fff");
      return new THREE.MeshBasicMaterial({
        map: texture,
        color: 0xffffff,
      });
    });
    cubeMaterialsRef.current = materials;
    const cubeMesh = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.35, 1.35), materials);
    cubeMeshRef.current = cubeMesh;
    cubeScene.add(cubeMesh);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.35, 1.35, 1.35)),
      new THREE.LineBasicMaterial({ color: 0x334155 }),
    );
    cubeMesh.add(edges);

    const viewDir = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const syncCube = () => {
      viewDir.subVectors(camera.position, controls.target);
      if (viewDir.lengthSq() < 1e-6) viewDir.set(0, -1, 0.6);
      viewDir.normalize();
      cubeCamera.position.copy(viewDir).multiplyScalar(3.1);
      cubeCamera.up.copy(camera.up);
      cubeCamera.lookAt(0, 0, 0);
      materials.forEach((mat, index) => {
        const normal = CUBE_FACE_VIEWS[index]?.dir;
        const facing = normal ? normal.clone().normalize().dot(viewDir) : 0;
        mat.color.set(facing > 0.82 ? 0xfff3c4 : 0xffffff);
      });
    };

    let raf = 0;
    const loop = () => {
      raf = window.requestAnimationFrame(loop);
      const snap = snapRef.current;
      if (snap) {
        const k = easeOutCubic(
          Math.min(1, (performance.now() - snap.start) / snap.duration),
        );
        camera.position.lerpVectors(snap.fromPos, snap.toPos, k);
        camera.up.lerpVectors(snap.fromUp, snap.toUp, k).normalize();
        controls.target.lerpVectors(snap.fromTarget, snap.toTarget, k);
        camera.zoom = snap.fromZoom + (snap.toZoom - snap.fromZoom) * k;
        camera.lookAt(controls.target);
        camera.updateProjectionMatrix();
        if (k >= 1) {
          snapRef.current = null;
          controls.syncFromCamera();
        }
      }
      renderer.render(scene, camera);
      syncCube();
      cubeRenderer.render(cubeScene, cubeCamera);
    };
    loop();

    const onResize = () => {
      const w = Math.max(el.clientWidth, 1);
      const h = Math.max(el.clientHeight, 1);
      renderer.setSize(w, h);
      const frustumH = Math.max(fitRadiusRef.current, 1) * 2 * 1.42;
      const nextAspect = w / h;
      camera.top = frustumH / 2;
      camera.bottom = -frustumH / 2;
      camera.right = (frustumH * nextAspect) / 2;
      camera.left = (-frustumH * nextAspect) / 2;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);

    ro.observe(el);

    const onCubeClick = (event: PointerEvent) => {
      const rect = cubeEl.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, cubeCamera);
      const hit = raycaster.intersectObject(cubeMesh, false)[0];
      const materialIndex = hit?.face?.materialIndex;
      if (materialIndex == null) return;
      const view = CUBE_FACE_VIEWS[materialIndex];
      if (!view) return;
      const radius = Math.max(fitRadiusRef.current, 1);
      const toPos = view.dir.clone().normalize().multiplyScalar(radius * 4);
      const toUp = view.up.clone().normalize();
      snapRef.current = {
        start: performance.now(),
        duration: 280,
        fromPos: camera.position.clone(),
        toPos,
        fromUp: camera.up.clone(),
        toUp,
        fromTarget: controls.target.clone(),
        toTarget: new THREE.Vector3(0, 0, 0),
        fromZoom: camera.zoom,
        toZoom: 1,
      };
    };
    cubeEl.addEventListener("pointerdown", onCubeClick);

    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      cubeEl.removeEventListener("pointerdown", onCubeClick);
      controls.removeEventListener("start", cancelSnap);
      controls.dispose();
      for (const entry of loadedRef.current) {
        entry.geometry.dispose();
        entry.texture?.dispose();
        const prev = entry.mesh.material;
        const list = Array.isArray(prev) ? prev : [prev];
        for (const old of list) old.dispose();
      }
      loadedRef.current = [];
      cubeMesh.geometry.dispose();
      for (const mat of materials) {
        mat.map?.dispose();
        mat.dispose();
      }
      edges.geometry.dispose();
      (edges.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      cubeRenderer.dispose();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      groupRef.current = null;
      cubeSceneRef.current = null;
      cubeCameraRef.current = null;
      cubeRendererRef.current = null;
      cubeMeshRef.current = null;
    };
  }, []);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    let cancelled = false;

    const clearGroup = () => {
      for (const entry of loadedRef.current) {
        group.remove(entry.mesh);
        entry.geometry.dispose();
        entry.texture?.dispose();
        const prev = entry.mesh.material;
        const list = Array.isArray(prev) ? prev : [prev];
        for (const old of list) old.dispose();
      }
      loadedRef.current = [];
      group.clear();
      group.position.set(0, 0, 0);
    };

    const sources = itemsRef.current;
    if (sources.length === 0) {
      clearGroup();
      setParseNote("");
      onScanColorChangeRef.current?.(false);
      setLoadVersion((v) => v + 1);
      return;
    }

    void (async () => {
      clearGroup();
      setParseNote("");
      const failed: string[] = [];
      const loaded: LoadedMesh[] = [];
      await Promise.all(
        sources.map(async (source) => {
          try {
            const parsed = await parseModelPreview(source.file, {
              companionFiles: source.companionFiles,
            });
            if (cancelled) {
              parsed.geometry.dispose();
              parsed.texture?.dispose();
              return;
            }
            parsed.geometry.computeBoundingBox();
            if (!parsed.geometry.getAttribute("normal")) {
              parsed.geometry.computeVertexNormals();
            }
            const hasColor = isScanColorPreview(parsed.geometry, parsed.texture);
            const mesh = new THREE.Mesh(parsed.geometry);
            loaded.push({
              id: source.id,
              role: source.role,
              mesh,
              geometry: parsed.geometry,
              texture: parsed.texture,
              hasColor,
            });
          } catch {
            failed.push(source.fileName);
          }
        }),
      );
      if (cancelled) {
        for (const entry of loaded) {
          entry.geometry.dispose();
          entry.texture?.dispose();
        }
        return;
      }
      for (const entry of loaded) group.add(entry.mesh);
      loadedRef.current = loaded;
      const box = new THREE.Box3().setFromObject(group);
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        group.position.sub(center);
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        fitRadiusRef.current = Math.max(sphere.radius, 1);
      }
      applyFitFrustrum();
      const frame = estimateDentalFrame(loaded);
      if (frame) {
        applyDentalFrame(frame);
        cubeMeshRef.current?.quaternion.setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(frame.right, frame.anterior, frame.up),
        );
      }
      frameCamera(HOME_DIR, HOME_UP, false);
      restyleLoaded();
      onScanColorChangeRef.current?.(loaded.some((entry) => entry.hasColor));
      setParseNote(
        failed.length ? `열지 못했습니다: ${failed.join(", ")}` : "",
      );
      setLoadVersion((v) => v + 1);
    })();

    return () => {
      cancelled = true;
    };
  }, [itemsKey]);

  useEffect(() => {
    for (const entry of loadedRef.current) {
      entry.mesh.visible = visible[entry.id] !== false;
    }
  }, [visible, loadVersion]);

  useEffect(() => {
    restyleLoaded();
  }, [colorMapping, biteOpacity, loadVersion]);

  const goView = (view: ViewPreset) => {
    frameCamera(view.dir, view.up, true);
  };

  const onSaveImage = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
    triggerPngDownload(renderer.domElement.toDataURL("image/png"));
  };

  const stopPointer = (event: ReactPointerEvent) => {
    event.stopPropagation();
  };

  return (
    <div className={cn("relative h-full min-h-0 w-full", className)}>
      <div ref={containerRef} className="absolute inset-0" />

      {busy && items.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
          <p className="rounded-md bg-background/90 px-3 py-2 text-sm text-muted-foreground shadow-sm">
            {busyLabel || "스캔을 불러오는 중…"}
          </p>
        </div>
      ) : null}

      {parseNote ? (
        <p className="absolute left-3 top-3 z-10 max-w-sm rounded-md bg-background/95 px-3 py-2 text-xs text-destructive shadow-sm">
          {parseNote}
        </p>
      ) : null}

      <div
        className="absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-2"
        onPointerDown={stopPointer}
      >
        <p className="rounded-md bg-background/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm">
          드래그 회전 · 우클릭 이동 · 휠 확대
        </p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8 gap-1 shadow-sm"
          onClick={() => frameCamera(HOME_DIR, HOME_UP, true)}
        >
          <LocateFixed className="h-3.5 w-3.5" />
          맞춤
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8 gap-1 shadow-sm"
          onClick={onSaveImage}
          title="현재 뷰를 PNG로 저장"
        >
          <ImageDown className="h-3.5 w-3.5" />
          이미지 저장
        </Button>
      </div>

      <div
        className="absolute bottom-3 right-3 z-10 flex flex-col items-end gap-1"
        onPointerDown={stopPointer}
      >
        <div className="grid grid-cols-3 gap-1">
          {VIEW_PRESETS.map((view) => (
            <Button
              key={view.id}
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 px-2 text-[11px] shadow-sm"
              onClick={() => goView(view)}
            >
              {view.label}
            </Button>
          ))}
        </div>
        <canvas
          ref={cubeRef}
          width={132}
          height={132}
          className="h-[132px] w-[132px] cursor-pointer rounded-md bg-white/80 shadow-sm"
          aria-label="보기 방향"
          title="면을 누르면 그 방향으로 봅니다. 축은 저장된 스캔 좌표입니다."
        />
      </div>
    </div>
  );
}
