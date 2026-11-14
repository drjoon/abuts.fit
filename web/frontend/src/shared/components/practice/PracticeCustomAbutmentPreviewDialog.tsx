// 치과 채팅창 「디자인」 버튼 → 전체 화면 프리뷰 모달.
// 치과 스캔에서 스캔바디를 인식·라이브러리 정합해 픽스쳐 위치를 잡고, 그 상방에 커스텀어벗 STL을 디자인하여
// 스캔 치아 데이터 위에 올라간 모습으로 간단히 확인하는 뷰어 모달이다(기공소 AI 디자인 크롬 기반, 수동 편집 제외).
// related files:
// - web/frontend/src/shared/practice/customAbutmentScanbodyMatch.ts
// - web/frontend/src/shared/practice/customAbutmentStlDesign.ts
// - web/frontend/src/shared/components/practice/LabProsthesisAiDesignDialog.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import {
  Crosshair,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Maximize2,
  Paintbrush,
  Sparkles,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  VIEW_GESTURE_HINT_LAYER_CLASS,
  ViewGestureHint,
} from "@/shared/components/ViewGestureHint";
import { saveBlobAsDownload } from "@/shared/files/downloadWithProgress";
import {
  applyScanColorToneMapping,
  createModelPreviewMaterial,
  fileFromImageBlob,
  fileFromModelBlob,
  getModelExtLower,
  isScanColorPreview,
  parseModelPreview,
  peekPlyHeaderInfo,
  resolveCompanionTextureFileName,
  SCAN_COLOR_PREVIEW_BACKGROUND,
} from "@/shared/files/modelPreviewFile";
import { fetchS3BlobCached } from "@/shared/files/s3BlobCache";
import { buildS3ProxyDownloadUrl } from "@/shared/files/useS3FileDownload";
import { registerJawsToBiteResult, applyBiteFitPoses } from "@/shared/practice/biteRegistration";
import {
  buildScanGeometryWithoutScanbodies,
  detectAndMatchScanbodyOnScan,
  fixturePoseToMatrix4,
  loadCandidateScanbodyModels,
  parseFdiTooth,
} from "@/shared/practice/customAbutmentScanbodyMatch";
import {
  designCustomAbutmentStl,
  type DesignedCustomAbutment,
} from "@/shared/practice/customAbutmentStlDesign";
import { estimateDentalFrame, type DentalFrame } from "@/shared/practice/dentalFrame";
import {
  isOralScanMeshName,
  preferWorkingOralScanFiles,
  resolveOralScanRole,
} from "@/shared/practice/labProsthesisAiDesign";
import { apiFetch } from "@/shared/api/apiClient";
import { type ScanbodyCatalog } from "@/shared/practice/scanbodyLibraryApi";
import { toToothMemoSortNumber, type ToothWorkSelection } from "@/shared/practice/transferMemo";
import { useImplantConnectionCatalog } from "@/shared/practice/useImplantConnectionCatalog";
import { disposeBackFaceShell, syncBackFaceShell } from "@/shared/three/backFaceShell";
import { ScreenSpaceOrbitControls } from "@/shared/three/screenSpaceOrbitControls";
import {
  applyOrthoHeight,
  readHostSize,
  resizeWebglToHost,
} from "@/shared/three/squarePixelViewport";
import { cn } from "@/shared/ui/cn";

export type PracticeDesignPreviewFileItem = {
  fileName: string;
  s3Key?: string;
  size?: number;
  scanRole?: string | null;
  uploadedAt?: string | null;
};

export type PracticeCustomAbutmentPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authToken?: string | null;
  caseTitle?: string;
  caseDatesLabel?: string;
  patientName?: string;
  toothWorks: readonly ToothWorkSelection[];
  files: readonly PracticeDesignPreviewFileItem[];
  workScanFiles?: readonly PracticeDesignPreviewFileItem[];
};

type CenterGuideMode = "off" | "center" | "grid";

type LoadedJawScan = {
  role: "upper" | "lower" | "bite";
  fileName: string;
  geometry: THREE.BufferGeometry;
  texture: THREE.Texture | null;
};

type PipelineStatus =
  | { kind: "loading"; percent: number; step: string }
  | { kind: "ready" }
  | { kind: "error"; message: string };

const VIEWER_PLAIN_BG = 0xe6e9ec;
const FIT_MARGIN = 1.06;

function nextCenterGuide(mode: CenterGuideMode): CenterGuideMode {
  if (mode === "off") return "center";
  if (mode === "center") return "grid";
  return "off";
}

function centerGuideLabel(mode: CenterGuideMode): string {
  if (mode === "center") return "중앙선";
  if (mode === "grid") return "모눈종이";
  return "없음";
}

function createFixtureAnalogGeometry(originDiameterMm: number, lengthMm = 9.5): THREE.BufferGeometry {
  const topR = Math.max(1.5, originDiameterMm * 0.56);
  const botR = Math.max(1.15, topR * 0.78);
  const geo = new THREE.CylinderGeometry(topR, botR, lengthMm, 32, 8, false);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0, -lengthMm / 2 - 0.05);
  geo.computeVertexNormals();
  return geo;
}

export function PracticeCustomAbutmentPreviewButton({
  disabled,
  className,
  ...dialogProps
}: Omit<PracticeCustomAbutmentPreviewDialogProps, "open" | "onOpenChange"> & {
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        className={cn(
          "h-7 shrink-0 gap-1 border-primary/45 bg-background px-2.5 text-xs font-medium text-primary hover:bg-primary/10 hover:text-primary",
          className,
        )}
        onClick={() => setOpen(true)}
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        <span>디자인</span>
      </Button>
      {open ? (
        <PracticeCustomAbutmentPreviewDialog
          {...dialogProps}
          open={open}
          onOpenChange={setOpen}
        />
      ) : null}
    </>
  );
}

export function PracticeCustomAbutmentPreviewDialog({
  open,
  onOpenChange,
  authToken,
  caseTitle,
  caseDatesLabel,
  patientName,
  toothWorks,
  files,
  workScanFiles = [],
}: PracticeCustomAbutmentPreviewDialogProps) {
  const { connections } = useImplantConnectionCatalog(open ? (authToken ?? null) : null);

  const abutmentToothWorks = useMemo(() => {
    const seen = new Set<string>();
    const list: ToothWorkSelection[] = [];
    for (const row of toothWorks || []) {
      if (!row?.customAbutment) continue;
      const parsed = parseFdiTooth(row.toothNumber);
      if (!parsed || seen.has(parsed.digits)) continue;
      seen.add(parsed.digits);
      list.push({ ...row, toothNumber: parsed.digits });
    }
    return list.sort(
      (a, b) => toToothMemoSortNumber(a.toothNumber) - toToothMemoSortNumber(b.toothNumber),
    );
  }, [toothWorks]);

  const scanSources = useMemo(() => {
    const merged: PracticeDesignPreviewFileItem[] = [];
    const seen = new Set<string>();
    const push = (item: PracticeDesignPreviewFileItem) => {
      const key = String(item.s3Key || item.fileName || "").trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push(item);
    };
    for (const f of workScanFiles) push(f);
    for (const f of files) push(f);
    const preferred = preferWorkingOralScanFiles(merged);
    const meshes = preferred.filter(
      (f) => Boolean(f.s3Key) && isOralScanMeshName(f.fileName),
    );
    const companions = merged.filter((f) => {
      if (!f.s3Key) return false;
      return /\.(mtl|jpe?g|png|webp|bmp)$/i.test(f.fileName);
    });
    return { meshes, companions };
  }, [files, workScanFiles]);

  const [status, setStatus] = useState<PipelineStatus>({
    kind: "loading",
    percent: 5,
    step: "구강 스캔을 불러오는 중…",
  });
  const [designedList, setDesignedList] = useState<DesignedCustomAbutment[]>([]);
  const [colorMapping, setColorMapping] = useState(true);
  const [centerGuide, setCenterGuide] = useState<CenterGuideMode>("grid");
  const [hideScanbodyOnScan, setHideScanbodyOnScan] = useState(true);
  const [showFixtureAnalog, setShowFixtureAnalog] = useState(true);
  const [showFinishLine, setShowFinishLine] = useState(true);
  const [opposingTransparency, setOpposingTransparency] = useState(55);
  const [visibleJaws, setVisibleJaws] = useState<{ upper: boolean; lower: boolean }>({
    upper: true,
    lower: true,
  });
  const [availableJaws, setAvailableJaws] = useState<{ upper: boolean; lower: boolean }>({
    upper: false,
    lower: false,
  });
  const [visibleTeeth, setVisibleTeeth] = useState<Record<string, boolean>>({});
  const [selectedTooth, setSelectedTooth] = useState<string | null>(null);
  const [hostEl, setHostEl] = useState<HTMLDivElement | null>(null);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const bindHostRef = useCallback((node: HTMLDivElement | null) => {
    hostRef.current = node;
    setHostEl(node);
  }, []);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const labelRendererRef = useRef<CSS2DRenderer | null>(null);
  const controlsRef = useRef<ScreenSpaceOrbitControls | null>(null);
  const frameRef = useRef<DentalFrame | null>(null);

  const jawMeshesRef = useRef<{
    upperRaw: THREE.Mesh[];
    upperTrimmed: THREE.Mesh[];
    lowerRaw: THREE.Mesh[];
    lowerTrimmed: THREE.Mesh[];
  }>({
    upperRaw: [],
    upperTrimmed: [],
    lowerRaw: [],
    lowerTrimmed: [],
  });
  const abutmentMeshesRef = useRef(new Map<string, THREE.Mesh>());
  const fixtureMeshesRef = useRef(new Map<string, THREE.Mesh>());
  const marginLinesRef = useRef(new Map<string, THREE.LineLoop>());

  const prepJaws = useMemo(() => {
    const set = new Set<"upper" | "lower">();
    for (const row of abutmentToothWorks) {
      const p = parseFdiTooth(row.toothNumber);
      if (p) set.add(p.jaw);
    }
    return set;
  }, [abutmentToothWorks]);

  const clearSceneObjects = useCallback(() => {
    const scene = sceneRef.current;
    const disposeMesh = (mesh: THREE.Mesh) => {
      scene?.remove(mesh);
      mesh.children.slice().forEach((ch) => {
        if ((ch as CSS2DObject).isCSS2DObject) {
          (ch as CSS2DObject).element.remove();
          mesh.remove(ch);
        }
      });
      disposeBackFaceShell(mesh);
      mesh.geometry.dispose();
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const savedTex = mesh.userData.previewTexture as THREE.Texture | undefined;
      if (mat.map && mat.map !== savedTex) mat.map.dispose();
      savedTex?.dispose();
      mat.dispose();
    };

    for (const list of Object.values(jawMeshesRef.current)) {
      for (const m of list) disposeMesh(m);
    }
    jawMeshesRef.current = {
      upperRaw: [],
      upperTrimmed: [],
      lowerRaw: [],
      lowerTrimmed: [],
    };

    for (const m of abutmentMeshesRef.current.values()) disposeMesh(m);
    abutmentMeshesRef.current.clear();

    for (const m of fixtureMeshesRef.current.values()) disposeMesh(m);
    fixtureMeshesRef.current.clear();

    for (const line of marginLinesRef.current.values()) {
      scene?.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    marginLinesRef.current.clear();
  }, []);

  const fitCameraToTargets = useCallback(
    (targets: THREE.Object3D[], viewDir?: THREE.Vector3, upDir?: THREE.Vector3) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      const host = hostRef.current;
      if (!camera || !controls || !host || targets.length === 0) return;

      const box = new THREE.Box3();
      for (const obj of targets) {
        obj.updateMatrixWorld(true);
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          if (m.geometry.boundingBox && !m.geometry.boundingBox.isEmpty()) {
            box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));
          }
        } else {
          box.expandByObject(obj);
        }
      }
      if (box.isEmpty()) return;

      const center = box.getCenter(new THREE.Vector3());
      const dir = (
        viewDir && viewDir.lengthSq() > 1e-6
          ? viewDir.clone()
          : camera.position.clone().sub(controls.target)
      ).normalize();
      if (dir.lengthSq() < 1e-6) dir.set(0, -0.75, 0.66).normalize();
      if (upDir && upDir.lengthSq() > 1e-6) {
        const cleanUp = upDir.clone().addScaledVector(dir, -upDir.dot(dir));
        if (cleanUp.lengthSq() > 1e-6) camera.up.copy(cleanUp.normalize());
      }

      camera.position.copy(center).add(dir);
      camera.lookAt(center);
      camera.updateMatrixWorld();
      const toView = new THREE.Matrix4().makeRotationFromQuaternion(camera.quaternion).invert();

      const min = new THREE.Vector3(Infinity, Infinity, Infinity);
      const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      const pt = new THREE.Vector3();
      let count = 0;

      for (const obj of targets) {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) continue;
        const pos = mesh.geometry.getAttribute("position");
        if (!pos) continue;
        const stride = Math.max(1, Math.floor(pos.count / 35000));
        for (let i = 0; i < pos.count; i += stride) {
          pt.fromBufferAttribute(pos, i)
            .applyMatrix4(mesh.matrixWorld)
            .sub(center)
            .applyMatrix4(toView);
          min.min(pt);
          max.max(pt);
          count += 1;
        }
      }
      if (count === 0) return;

      const aspect = readHostSize(host).aspect;
      const halfW = Math.max((max.x - min.x) / 2, 2);
      let halfH = Math.max((max.y - min.y) / 2, 2);
      if (halfW / halfH > aspect) halfH = halfW / aspect;
      halfH *= FIT_MARGIN;

      const mid = new THREE.Vector3((min.x + max.x) / 2, (min.y + max.y) / 2, 0)
        .applyQuaternion(camera.quaternion)
        .add(center);
      const depth = Math.max(max.z - min.z, halfH, 10);
      const distance = Math.max(max.z + depth * 1.5, halfH * 4, 60);

      controls.target.copy(mid);
      camera.position.copy(mid).addScaledVector(dir, distance);
      camera.near = Math.max(distance / 250, 0.05);
      camera.far = distance * 200;
      camera.zoom = 1;
      applyOrthoHeight(camera, halfH, aspect);
      camera.lookAt(mid);
      controls.syncFromCamera();
    },
    [],
  );

  const fitDefaultCamera = useCallback(() => {
    const frame = frameRef.current;
    const abutMeshes = [...abutmentMeshesRef.current.values()].filter((m) => m.visible);
    const jawMeshes = [
      ...jawMeshesRef.current.upperTrimmed,
      ...jawMeshesRef.current.upperRaw,
      ...jawMeshesRef.current.lowerTrimmed,
      ...jawMeshesRef.current.lowerRaw,
    ].filter((m) => m.visible);
    const targets = jawMeshes.length > 0 ? [...jawMeshes, ...abutMeshes] : abutMeshes;
    if (targets.length === 0) return;

    if (frame) {
      const onlyUpper = prepJaws.has("upper") && !prepJaws.has("lower");
      const onlyLower = prepJaws.has("lower") && !prepJaws.has("upper");
      // 정면·교합 사선에서 스캔 치아와 어벗이 입체적으로 바로 보이게 잡는다.
      const tilt = onlyUpper ? -0.45 : onlyLower ? 0.45 : 0.22;
      const viewDir = frame.anterior
        .clone()
        .multiplyScalar(0.9)
        .addScaledVector(frame.up, tilt)
        .normalize();
      fitCameraToTargets(targets, viewDir, frame.up);
      return;
    }
    fitCameraToTargets(targets);
  }, [fitCameraToTargets, prepJaws]);

  const focusSingleTooth = useCallback(
    (toothNumber: string) => {
      setSelectedTooth(toothNumber);
      const designed = designedList.find((d) => d.toothNumber === toothNumber);
      const mesh = abutmentMeshesRef.current.get(toothNumber);
      const frame = frameRef.current;
      if (!designed || !mesh) return;
      const labial = new THREE.Vector3(...designed.fixture.labialDir);
      const occ = new THREE.Vector3(...designed.fixture.archOcclusalDir);
      const viewDir = labial.multiplyScalar(0.82).addScaledVector(occ, 0.52).normalize();
      const upDir = frame ? frame.up.clone() : new THREE.Vector3(0, 0, 1);
      // 어벗 주변 반경으로 클로즈업하되 스캔 치아가 함께 보이도록 여유 상자를 둔다.
      const padMesh = mesh.clone();
      if (!padMesh.geometry.boundingBox) padMesh.geometry.computeBoundingBox();
      const box = padMesh.geometry.boundingBox?.clone();
      if (box) {
        box.expandByScalar(8);
        const helper = new THREE.Mesh(
          new THREE.BoxGeometry(
            box.max.x - box.min.x,
            box.max.y - box.min.y,
            box.max.z - box.min.z,
          ),
        );
        box.getCenter(helper.position);
        fitCameraToTargets([helper], viewDir, upDir);
        helper.geometry.dispose();
        return;
      }
      fitCameraToTargets([mesh], viewDir, upDir);
    },
    [designedList, fitCameraToTargets],
  );

  const latestInputsRef = useRef({
    abutmentToothWorks,
    scanSources,
    connections,
    patientName,
    workScanFiles,
  });
  latestInputsRef.current = {
    abutmentToothWorks,
    scanSources,
    connections,
    patientName,
    workScanFiles,
  };

  const pipelineKey = useMemo(
    () =>
      JSON.stringify({
        teeth: abutmentToothWorks.map((t) => [
          t.toothNumber,
          t.implantManufacturer,
          t.implantBrand,
          t.implantFamily,
          t.implantType,
          t.abutmentManufacturer,
          t.abutmentDiameter,
          t.abutmentHeight,
        ]),
        scans: scanSources.meshes.map((s) => [s.s3Key, s.fileName, s.scanRole]),
      }),
    [abutmentToothWorks, scanSources.meshes],
  );

  // WebGL 씬 초기화 (Radix DialogPortal이 마운트된 뒤 hostEl 콜백 ref로 실행)
  useEffect(() => {
    if (!open || !hostEl) return;
    const host = hostEl;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SCAN_COLOR_PREVIEW_BACKGROUND);
    sceneRef.current = scene;

    const { width, height, aspect } = readHostSize(host);
    const camera = new THREE.OrthographicCamera(-20 * aspect, 20 * aspect, 20, -20, 0.1, 4000);
    camera.position.set(0, 90, 20);
    camera.up.set(0, 0, 1);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    applyScanColorToneMapping(renderer);
    renderer.domElement.className = "block h-full w-full touch-none select-none";
    host.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(width, height);
    labelRenderer.domElement.style.cssText =
      "position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:4;";
    host.appendChild(labelRenderer.domElement);
    labelRendererRef.current = labelRenderer;

    const hemi = new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 0.92);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.08);
    const fillLight = new THREE.DirectionalLight(0xf8fafc, 0.58);
    const rimLight = new THREE.DirectionalLight(0xe2e8f0, 0.42);
    scene.add(keyLight, fillLight, rimLight);

    const controls = new ScreenSpaceOrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;

    let raf = 0;
    const renderLoop = () => {
      raf = window.requestAnimationFrame(renderLoop);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      const fwd = camera.position.clone().sub(controls.target).normalize();
      keyLight.position
        .copy(controls.target)
        .addScaledVector(fwd, 120)
        .addScaledVector(up, 55)
        .addScaledVector(right, 35);
      fillLight.position
        .copy(controls.target)
        .addScaledVector(fwd, 95)
        .addScaledVector(right, -65)
        .addScaledVector(up, -25);
      rimLight.position
        .copy(controls.target)
        .addScaledVector(fwd, -90)
        .addScaledVector(up, 50);

      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    };
    renderLoop();

    const onResize = () => {
      if (!host) return;
      const next = resizeWebglToHost(renderer, host);
      labelRenderer.setSize(next.width, next.height);
      const halfH = (camera.top - camera.bottom) / 2;
      applyOrthoHeight(camera, halfH, next.aspect);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      clearSceneObjects();
      renderer.dispose();
      renderer.domElement.remove();
      labelRenderer.domElement.remove();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      labelRendererRef.current = null;
      controlsRef.current = null;
    };
  }, [clearSceneObjects, hostEl, open]);

  // 스캔 로드 → 스캔바디 인식·정합 → 픽스쳐 결정 → 커스텀어벗 STL 디자인 → 씬 배치
  useEffect(() => {
    if (!open || !hostEl) return;
    const {
      abutmentToothWorks: curToothWorks,
      scanSources: curScanSources,
      connections: curConnections,
      patientName: curPatientName,
      workScanFiles: curWorkScanFiles,
    } = latestInputsRef.current;
    const token = String(authToken || "").trim();
    if (!token) {
      setStatus({ kind: "error", message: "로그인이 필요합니다." });
      return;
    }
    if (curToothWorks.length === 0) {
      setStatus({ kind: "error", message: "커스텀어벗 디자인 대상 치아가 없습니다." });
      return;
    }
    if (curScanSources.meshes.length === 0) {
      setStatus({
        kind: "error",
        message: "구강 스캔 파일(DCM·PLY·STL·OBJ)이 없어 디자인 프리뷰를 만들 수 없습니다.",
      });
      return;
    }

    const abort = new AbortController();
    let cancelled = false;

    const loadSingleScan = async (
      item: PracticeDesignPreviewFileItem,
      onProgress: (p: number) => void,
    ): Promise<LoadedJawScan | null> => {
      const s3Key = String(item.s3Key || "").trim();
      if (!s3Key) return null;
      const role = resolveOralScanRole({
        fileName: item.fileName,
        scanRole: item.scanRole ?? undefined,
      });
      if (role !== "upper" && role !== "lower" && role !== "bite") return null;

      const blob = await fetchS3BlobCached({
        s3Key,
        fileName: item.fileName,
        token,
        buildUrl: buildS3ProxyDownloadUrl,
        onProgress,
        signal: abort.signal,
      });
      const modelFile = fileFromModelBlob(blob, item.fileName);
      const companionFiles: File[] = [];
      const ext = getModelExtLower(item.fileName);
      if ((ext === ".ply" || ext === ".obj") && curScanSources.companions.length > 0) {
        const preferredTex =
          ext === ".ply"
            ? peekPlyHeaderInfo(await blob.arrayBuffer()).textureFileName
            : null;
        const texName = resolveCompanionTextureFileName(
          item.fileName,
          preferredTex,
          curScanSources.companions.map((c) => c.fileName),
        );
        const hitComp = texName
          ? curScanSources.companions.find((c) => c.fileName === texName)
          : null;
        if (hitComp?.s3Key) {
          const texBlob = await fetchS3BlobCached({
            s3Key: hitComp.s3Key,
            fileName: hitComp.fileName,
            token,
            buildUrl: buildS3ProxyDownloadUrl,
            signal: abort.signal,
          });
          companionFiles.push(fileFromImageBlob(texBlob, hitComp.fileName));
        }
      }
      const parsed = await parseModelPreview(modelFile, { companionFiles });
      return {
        role,
        fileName: item.fileName,
        geometry: parsed.geometry,
        texture: parsed.texture ?? null,
      };
    };

    const runPipeline = async () => {
      try {
        clearSceneObjects();
        setDesignedList([]);
        setAvailableJaws({ upper: false, lower: false });
        setSelectedTooth(null);
        setStatus({ kind: "loading", percent: 8, step: "구강 스캔을 불러오는 중…" });

        const targetRoles = new Set<"upper" | "lower" | "bite">(["upper", "lower"]);
        const hasWorkScans = curWorkScanFiles.some((f) => isOralScanMeshName(f.fileName));
        if (!hasWorkScans) targetRoles.add("bite");

        const toLoad = curScanSources.meshes.filter((f) => {
          const r = resolveOralScanRole({
            fileName: f.fileName,
            scanRole: f.scanRole ?? undefined,
          });
          return r === "upper" || r === "lower" || (targetRoles.has("bite") && r === "bite");
        });

        const emptyCatalog: ScanbodyCatalog = {
          libraries: [],
          templates: [],
          templateUploads: [],
          labUploadRequestKeys: [],
        };
        const catalogPromise = apiFetch<{ data?: ScanbodyCatalog }>({
          path: "/api/scanbody-libraries",
          token,
          cacheTtlMs: 30_000,
        })
          .then((res) =>
            res.ok && res.data?.data
              ? {
                  ...emptyCatalog,
                  ...res.data.data,
                  templateUploads: res.data.data.templateUploads ?? [],
                  labUploadRequestKeys: res.data.data.labUploadRequestKeys ?? [],
                }
              : emptyCatalog,
          )
          .catch(() => emptyCatalog);

        const progressByIdx = new Array<number>(Math.max(toLoad.length, 1)).fill(0);
        const [rawLoadedScans, curCatalog] = await Promise.all([
          Promise.all(
            toLoad.map((item, idx) =>
              loadSingleScan(item, (pct) => {
                progressByIdx[idx] = pct;
                const avg =
                  progressByIdx.reduce((a, b) => a + b, 0) / Math.max(toLoad.length, 1);
                if (!cancelled) {
                  setStatus({
                    kind: "loading",
                    percent: Math.round(8 + avg * 0.45),
                    step: "구강 스캔을 불러오는 중…",
                  });
                }
              }),
            ),
          ),
          catalogPromise,
        ]);
        const loadedScans = rawLoadedScans.filter(
          (row): row is LoadedJawScan => row != null,
        );

        if (cancelled) return;

        // 작업 스캔이 아닌 원본 상·하악·바이트면 바이트 기준으로 먼저 정렬한다.
        const upperScans = loadedScans.filter((s) => s.role === "upper");
        const lowerScans = loadedScans.filter((s) => s.role === "lower");
        const biteScans = loadedScans.filter((s) => s.role === "bite");
        if (!hasWorkScans && biteScans.length > 0 && (upperScans.length > 0 || lowerScans.length > 0)) {
          setStatus({ kind: "loading", percent: 58, step: "상·하악 교합을 맞추는 중…" });
          await new Promise<void>((r) => window.setTimeout(r, 0));
          const fit = registerJawsToBiteResult({
            upper: upperScans.map((s) => s.geometry),
            lower: lowerScans.map((s) => s.geometry),
            bites: biteScans.map((s) => s.geometry),
          });
          applyBiteFitPoses(
            {
              upper: upperScans.map((s) => s.geometry),
              lower: lowerScans.map((s) => s.geometry),
            },
            fit,
          );
        }

        const frame = estimateDentalFrame(
          loadedScans
            .filter((s) => s.role === "upper" || s.role === "lower")
            .map((s) => ({ role: s.role, geometry: s.geometry })),
        );
        if (!frame) {
          for (const s of loadedScans) {
            s.geometry.dispose();
            s.texture?.dispose();
          }
          setStatus({
            kind: "error",
            message: "상악·하악 스캔 좌표를 해석하지 못했습니다.",
          });
          return;
        }
        frameRef.current = frame;

        setStatus({
          kind: "loading",
          percent: 68,
          step: "스캔바디 인식 및 픽스쳐 위치 정합 중…",
        });
        await new Promise<void>((r) => window.setTimeout(r, 16));
        if (cancelled) return;

        const upperPrimary = upperScans[0]?.geometry ?? null;
        const lowerPrimary = lowerScans[0]?.geometry ?? null;

        const matchedByJaw: Record<"upper" | "lower", DesignedCustomAbutment[]> = {
          upper: [],
          lower: [],
        };
        const builtAbutments: DesignedCustomAbutment[] = [];
        const excludedByJaw: Record<"upper" | "lower", Array<[number, number, number]>> = {
          upper: [],
          lower: [],
        };

        for (let i = 0; i < curToothWorks.length; i += 1) {
          const tw = curToothWorks[i]!;
          const parsed = parseFdiTooth(tw.toothNumber);
          if (!parsed) continue;
          const jawGeo = parsed.jaw === "upper" ? upperPrimary : lowerPrimary;
          const oppGeo = parsed.jaw === "upper" ? lowerPrimary : upperPrimary;
          if (!jawGeo) continue;

          setStatus({
            kind: "loading",
            percent: Math.round(68 + ((i + 0.4) / curToothWorks.length) * 24),
            step: `#${tw.toothNumber} 스캔바디 매칭 및 커스텀어벗 디자인 중…`,
          });
          await new Promise<void>((r) => window.setTimeout(r, 16));
          if (cancelled) return;

          const models = await loadCandidateScanbodyModels({
            toothWork: tw,
            catalog: curCatalog,
            connections: curConnections,
          });
          if (cancelled) return;

          const matched = detectAndMatchScanbodyOnScan({
            jawGeometry: jawGeo,
            frame,
            toothWork: tw,
            models,
            connections: curConnections,
            excludeTops: excludedByJaw[parsed.jaw],
          });
          if (!matched) continue;

          excludedByJaw[parsed.jaw].push(matched.scanbodyTop);
          const designed = designCustomAbutmentStl({
            fixture: matched,
            jawGeometry: jawGeo,
            opposingGeometry: oppGeo,
            patientName: curPatientName,
          });
          builtAbutments.push(designed);
          matchedByJaw[parsed.jaw].push(designed);
        }

        for (const bite of biteScans) {
          bite.geometry.dispose();
          bite.texture?.dispose();
        }

        if (cancelled) {
          for (const d of builtAbutments) d.worldGeometry.dispose();
          for (const s of [...upperScans, ...lowerScans]) {
            s.geometry.dispose();
            s.texture?.dispose();
          }
          return;
        }

        if (builtAbutments.length === 0) {
          for (const s of [...upperScans, ...lowerScans]) {
            s.geometry.dispose();
            s.texture?.dispose();
          }
          setStatus({
            kind: "error",
            message: "스캔 데이터에서 의뢰 치아의 스캔바디를 찾지 못했습니다.",
          });
          return;
        }

        // 스캔 메시(원본 + 스캔바디 숨김본)와 어벗·픽스쳐·마진선 씬 등록
        const scene = sceneRef.current;
        if (!scene) {
          throw new Error("3D 뷰어 캔버스를 준비하지 못했습니다.");
        }

        const makeScanMesh = (
          geo: THREE.BufferGeometry,
          tex: THREE.Texture | null,
          shareTex: boolean,
        ) => {
          if (!geo.getAttribute("normal")) geo.computeVertexNormals();
          const mat = createModelPreviewMaterial(geo, tex);
          mat.side = THREE.DoubleSide;
          const mesh = new THREE.Mesh(geo, mat);
          if (!shareTex && tex) mesh.userData.previewTexture = tex;
          mesh.userData.scanColorCapable = isScanColorPreview(geo, tex);
          syncBackFaceShell(mesh);
          scene.add(mesh);
          return mesh;
        };

        for (const scan of upperScans) {
          const rawMesh = makeScanMesh(scan.geometry, scan.texture, false);
          const trimmedGeo = buildScanGeometryWithoutScanbodies(
            scan.geometry,
            matchedByJaw.upper.map((d) => d.fixture),
          );
          const trimmedMesh = makeScanMesh(trimmedGeo, scan.texture, true);
          jawMeshesRef.current.upperRaw.push(rawMesh);
          jawMeshesRef.current.upperTrimmed.push(trimmedMesh);
        }

        for (const scan of lowerScans) {
          const rawMesh = makeScanMesh(scan.geometry, scan.texture, false);
          const trimmedGeo = buildScanGeometryWithoutScanbodies(
            scan.geometry,
            matchedByJaw.lower.map((d) => d.fixture),
          );
          const trimmedMesh = makeScanMesh(trimmedGeo, scan.texture, true);
          jawMeshesRef.current.lowerRaw.push(rawMesh);
          jawMeshesRef.current.lowerTrimmed.push(trimmedMesh);
        }

        const nextVisibleTeeth: Record<string, boolean> = {};
        for (const d of builtAbutments) {
          nextVisibleTeeth[d.toothNumber] = true;

          // 티타늄/골드 아노다이징 느낌의 금속 재질 커스텀어벗 메시
          const abutMat = new THREE.MeshStandardMaterial({
            color: 0xd4c59e,
            metalness: 0.52,
            roughness: 0.3,
            side: THREE.DoubleSide,
          });
          const abutMesh = new THREE.Mesh(d.worldGeometry, abutMat);
          abutMesh.renderOrder = 2;
          syncBackFaceShell(abutMesh);

          // 치아 번호 CSS2D 배지
          if (!d.worldGeometry.boundingBox) d.worldGeometry.computeBoundingBox();
          const tagEl = document.createElement("div");
          tagEl.textContent = `#${d.toothNumber}`;
          tagEl.style.cssText =
            "pointer-events:none;user-select:none;border-radius:0.375rem;" +
            "background:rgba(15,23,42,0.82);color:#fff;font:600 11px/1.2 ui-sans-serif,system-ui,sans-serif;" +
            "padding:0.18rem 0.42rem;white-space:nowrap;";
          const badge = new CSS2DObject(tagEl);
          const topWorld = d.fixture.scanbodyTop;
          badge.position.set(topWorld[0], topWorld[1], topWorld[2]);
          abutMesh.add(badge);

          scene.add(abutMesh);
          abutmentMeshesRef.current.set(d.toothNumber, abutMesh);

          // 잇몸 아래 식립된 픽스쳐 아날로그(반투명 청회색)
          const fixGeo = createFixtureAnalogGeometry(d.fixture.connectionSpec.originDiameterMm);
          fixGeo.applyMatrix4(fixturePoseToMatrix4(d.fixture.fixturePose));
          const fixMat = new THREE.MeshStandardMaterial({
            color: 0x64748b,
            metalness: 0.48,
            roughness: 0.38,
            transparent: true,
            opacity: 0.58,
            depthWrite: false,
          });
          const fixMesh = new THREE.Mesh(fixGeo, fixMat);
          fixMesh.renderOrder = 3;
          scene.add(fixMesh);
          fixtureMeshesRef.current.set(d.toothNumber, fixMesh);

          // 피니시라인 폐곡선(청록색)
          const lineGeo = new THREE.BufferGeometry();
          lineGeo.setAttribute(
            "position",
            new THREE.BufferAttribute(d.marginLoopWorld, 3),
          );
          const lineMat = new THREE.LineBasicMaterial({
            color: 0x0d9488,
            depthTest: false,
            transparent: true,
            opacity: 0.9,
          });
          const marginLine = new THREE.LineLoop(lineGeo, lineMat);
          marginLine.renderOrder = 5;
          scene.add(marginLine);
          marginLinesRef.current.set(d.toothNumber, marginLine);
        }

        setVisibleTeeth(nextVisibleTeeth);
        const hasUpper = upperScans.length > 0;
        const hasLower = lowerScans.length > 0;
        setAvailableJaws({ upper: hasUpper, lower: hasLower });
        setVisibleJaws({
          upper: hasUpper,
          lower: hasLower,
        });
        setDesignedList(builtAbutments);
        setStatus({ kind: "ready" });

        window.requestAnimationFrame(() => {
          fitDefaultCamera();
        });
      } catch (err) {
        if (cancelled || (err as { name?: string } | null)?.name === "AbortError") return;
        setStatus({
          kind: "error",
          message:
            err instanceof Error && err.message
              ? err.message
              : "커스텀어벗 디자인 프리뷰 생성 중 오류가 발생했습니다.",
        });
      }
    };

    void runPipeline();
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [
    authToken,
    clearSceneObjects,
    fitDefaultCamera,
    hostEl,
    open,
    pipelineKey,
  ]);

  // 표시 옵션 동기화(스캔색, 스캔바디 가리기, 대합 투명도, 픽스쳐, 마진선, 악·치아 토글)
  useEffect(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    if (!renderer || !scene) return;

    if (colorMapping) {
      applyScanColorToneMapping(renderer);
      scene.background = new THREE.Color(SCAN_COLOR_PREVIEW_BACKGROUND);
    } else {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      scene.background = new THREE.Color(VIEWER_PLAIN_BG);
    }

    const syncJawRole = (
      role: "upper" | "lower",
      rawList: THREE.Mesh[],
      trimmedList: THREE.Mesh[],
    ) => {
      const roleVisible = visibleJaws[role];
      const isOpposing =
        (role === "upper" && !prepJaws.has("upper") && prepJaws.has("lower")) ||
        (role === "lower" && !prepJaws.has("lower") && prepJaws.has("upper"));
      const opacity = isOpposing
        ? Math.max(0.05, Math.min(1, 1 - opposingTransparency / 100))
        : 1;

      const applyMat = (mesh: THREE.Mesh, show: boolean) => {
        mesh.visible = show;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const tex =
          (mesh.userData.previewTexture as THREE.Texture | undefined) ?? mat.map ?? null;
        const hasVertexColors = Boolean(mesh.geometry.getAttribute("color"));
        if (colorMapping && (tex || hasVertexColors)) {
          mat.map = tex;
          mat.vertexColors = hasVertexColors && !tex;
          mat.color.setHex(0xffffff);
          mat.roughness = 0.78;
          mat.metalness = 0.02;
        } else {
          mat.map = null;
          mat.vertexColors = false;
          mat.color.setHex(role === "upper" ? 0xdbeafe : 0xe2e8f0);
          mat.roughness = 0.55;
          mat.metalness = 0.04;
        }
        const seeThrough = opacity < 0.995;
        mat.transparent = seeThrough;
        mat.opacity = opacity;
        mat.depthWrite = !seeThrough;
        mesh.renderOrder = seeThrough ? 4 : 1;
        mat.needsUpdate = true;
        syncBackFaceShell(mesh);
      };

      for (const m of rawList) applyMat(m, roleVisible && !hideScanbodyOnScan);
      for (const m of trimmedList) applyMat(m, roleVisible && hideScanbodyOnScan);
    };

    syncJawRole("upper", jawMeshesRef.current.upperRaw, jawMeshesRef.current.upperTrimmed);
    syncJawRole("lower", jawMeshesRef.current.lowerRaw, jawMeshesRef.current.lowerTrimmed);

    for (const [tooth, mesh] of abutmentMeshesRef.current.entries()) {
      const on = visibleTeeth[tooth] !== false;
      mesh.visible = on;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(selectedTooth === tooth ? 0x332800 : 0x000000);
    }
    for (const [tooth, mesh] of fixtureMeshesRef.current.entries()) {
      mesh.visible = showFixtureAnalog && visibleTeeth[tooth] !== false;
    }
    for (const [tooth, line] of marginLinesRef.current.entries()) {
      line.visible = showFinishLine && visibleTeeth[tooth] !== false;
    }
  }, [
    colorMapping,
    designedList,
    hideScanbodyOnScan,
    opposingTransparency,
    prepJaws,
    selectedTooth,
    showFinishLine,
    showFixtureAnalog,
    visibleJaws,
    visibleTeeth,
  ]);

  const hasOpposingJaw =
    (prepJaws.has("upper") && availableJaws.lower) ||
    (prepJaws.has("lower") && availableJaws.upper);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "inset-0 left-0 top-0 z-[480] flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0",
          "sm:inset-0 sm:left-0 sm:top-0 sm:h-[100dvh] sm:max-h-[100dvh] sm:w-screen sm:max-w-none sm:translate-x-0 sm:translate-y-0 sm:rounded-none sm:p-0",
          "duration-0 data-[state=open]:animate-none data-[state=closed]:animate-none",
        )}
        overlayClassName="z-[475]"
        hideClose
      >
        <DialogHeader className="relative shrink-0 flex-row items-center justify-between gap-3 space-y-0 border-b bg-white/95 py-2.5 pl-5 pr-14 text-left">
          <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
            <DialogTitle className="shrink-0 text-base sm:text-lg">
              커스텀어벗 디자인 프리뷰
            </DialogTitle>
            {caseTitle ? (
              <span className="truncate text-sm font-medium text-foreground">
                {caseTitle}
              </span>
            ) : null}
            {caseDatesLabel ? (
              <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground md:inline">
                {caseDatesLabel}
              </span>
            ) : null}
          </div>

          {status.kind === "ready" && designedList.length > 0 ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 px-2.5 text-xs"
                onClick={() => {
                  setSelectedTooth(null);
                  fitDefaultCamera();
                }}
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">전체 맞춤</span>
              </Button>
            </div>
          ) : null}

          <DialogClose
            className="absolute right-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md bg-destructive text-destructive-foreground opacity-100 shadow-sm hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="닫기"
          >
            <X className="h-7 w-7" />
          </DialogClose>
        </DialogHeader>

        <div className="relative min-h-0 min-w-0 flex-1">
          <div ref={bindHostRef} className="relative h-full w-full overflow-hidden" />

          {/* 중앙선 · 모눈종이 오버레이 */}
          {centerGuide !== "off" ? (
            <div
              className="pointer-events-none absolute inset-0 z-[3]"
              style={
                centerGuide === "grid"
                  ? {
                      backgroundImage:
                        "linear-gradient(to right, rgba(15,23,42,0.06) 1px, transparent 1px)," +
                        "linear-gradient(to bottom, rgba(15,23,42,0.06) 1px, transparent 1px)," +
                        "linear-gradient(to right, rgba(15,23,42,0.13) 1px, transparent 1px)," +
                        "linear-gradient(to bottom, rgba(15,23,42,0.13) 1px, transparent 1px)",
                      backgroundSize: "24px 24px, 24px 24px, 120px 120px, 120px 120px",
                      backgroundPosition: "center center",
                    }
                  : undefined
              }
            >
              <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-slate-500/55" />
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 border-l border-dashed border-slate-500/55" />
            </div>
          ) : null}

          {/* 상단 뷰어 간단 토글 바 */}
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
            <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-lg border bg-background/95 p-1 shadow-sm">
              <Button
                type="button"
                size="sm"
                variant={centerGuide === "off" ? "outline" : "default"}
                className="h-8 gap-1.5 px-2.5 text-xs"
                onClick={() => setCenterGuide((m) => nextCenterGuide(m))}
              >
                <Crosshair className="h-3.5 w-3.5" />
                <span>{centerGuideLabel(centerGuide)}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={colorMapping ? "default" : "outline"}
                className="h-8 gap-1.5 px-2.5 text-xs"
                onClick={() => setColorMapping((v) => !v)}
              >
                <Paintbrush className="h-3.5 w-3.5" />
                <span>스캔색</span>
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant={hideScanbodyOnScan ? "default" : "outline"}
                    className="h-8 gap-1.5 px-2.5 text-xs"
                    onClick={() => setHideScanbodyOnScan((v) => !v)}
                  >
                    {hideScanbodyOnScan ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                    <span>스캔바디 가리기</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="z-[520]">
                  스캔에 찍힌 스캔바디 기둥을 가려 디자인된 커스텀어벗이 또렷하게 보이게 합니다.
                </TooltipContent>
              </Tooltip>
              <Button
                type="button"
                size="sm"
                variant={showFinishLine ? "default" : "outline"}
                className="h-8 px-2.5 text-xs"
                onClick={() => setShowFinishLine((v) => !v)}
              >
                마진선
              </Button>
              <Button
                type="button"
                size="sm"
                variant={showFixtureAnalog ? "default" : "outline"}
                className="h-8 px-2.5 text-xs"
                onClick={() => setShowFixtureAnalog((v) => !v)}
              >
                픽스쳐
              </Button>
            </div>
          </div>

          {/* 오른쪽 표시·치아 정보 뷰어 카드 */}
          {status.kind === "ready" ? (
            <aside className="pointer-events-auto absolute right-3 top-16 z-10 flex max-h-[calc(100%-5rem)] w-[min(19.5rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-lg border bg-background/95 text-xs shadow-sm">
              <div className="border-b px-3.5 py-2.5 font-semibold text-foreground">
                표시 및 커스텀어벗 정보
              </div>
              <div className="min-h-0 space-y-3.5 overflow-y-auto px-3.5 py-3">
                <section className="space-y-2">
                  <div className="text-[11px] font-semibold text-muted-foreground">
                    구강 스캔
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    {availableJaws.upper ? (
                      <label className="flex cursor-pointer items-center gap-2">
                        <Checkbox
                          checked={visibleJaws.upper}
                          onCheckedChange={(c) =>
                            setVisibleJaws((prev) => ({ ...prev, upper: Boolean(c) }))
                          }
                        />
                        <span>상악 스캔</span>
                      </label>
                    ) : null}
                    {availableJaws.lower ? (
                      <label className="flex cursor-pointer items-center gap-2">
                        <Checkbox
                          checked={visibleJaws.lower}
                          onCheckedChange={(c) =>
                            setVisibleJaws((prev) => ({ ...prev, lower: Boolean(c) }))
                          }
                        />
                        <span>하악 스캔</span>
                      </label>
                    ) : null}
                  </div>
                  {hasOpposingJaw ? (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">대합악 투명도</span>
                        <span className="tabular-nums text-muted-foreground">
                          {opposingTransparency}%
                        </span>
                      </div>
                      <Slider
                        min={0}
                        max={90}
                        step={5}
                        value={[opposingTransparency]}
                        onValueChange={([val]) => setOpposingTransparency(val ?? 55)}
                        aria-label="대합악 투명도"
                      />
                    </div>
                  ) : null}
                </section>

                <section className="space-y-2 border-t pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground">
                      디자인된 커스텀어벗 ({designedList.length}개)
                    </span>
                    {selectedTooth ? (
                      <button
                        type="button"
                        className="text-[11px] font-medium text-primary hover:underline"
                        onClick={() => {
                          setSelectedTooth(null);
                          fitDefaultCamera();
                        }}
                      >
                        전체 보기
                      </button>
                    ) : null}
                  </div>
                  <ul className="space-y-2 py-0.5">
                    {designedList.map((item) => {
                      const checked = visibleTeeth[item.toothNumber] !== false;
                      const isSelected = selectedTooth === item.toothNumber;
                      const conn = item.fixture.connectionSpec;
                      return (
                        <li
                          key={item.toothNumber}
                          className={cn(
                            "rounded-md border p-2.5 transition-colors",
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border bg-card/60",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(c) =>
                                  setVisibleTeeth((prev) => ({
                                    ...prev,
                                    [item.toothNumber]: Boolean(c),
                                  }))
                                }
                              />
                              <button
                                type="button"
                                className="truncate text-left font-semibold text-foreground hover:text-primary"
                                onClick={() => focusSingleTooth(item.toothNumber)}
                              >
                                #{item.toothNumber} 커스텀어벗
                              </button>
                            </div>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 shrink-0 px-0"
                                  aria-label={`#${item.toothNumber} STL 다운로드`}
                                  onClick={() => saveBlobAsDownload(item.stlBlob, item.fileName)}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="z-[520]">
                                디자인된 #{item.toothNumber} 커스텀어벗 STL 저장
                              </TooltipContent>
                            </Tooltip>
                          </div>

                          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 text-[11px]">
                            <dt className="text-muted-foreground">임플란트</dt>
                            <dd className="truncate text-foreground">
                              {[conn.manufacturer, conn.brand, conn.family, conn.type]
                                .filter(Boolean)
                                .join(" / ") || "-"}
                            </dd>
                            <dt className="text-muted-foreground">스캔바디</dt>
                            <dd className="truncate text-foreground">
                              {item.fixture.matchedLibraryLabel} (오차 {item.metrics.rmsMm}mm)
                            </dd>
                            <dt className="text-muted-foreground">외경·길이</dt>
                            <dd className="tabular-nums text-foreground">
                              Ø{item.metrics.maxDiameterMm}mm · 총 {item.metrics.totalLengthMm}mm
                            </dd>
                            <dt className="text-muted-foreground">커프·기울기</dt>
                            <dd className="tabular-nums text-foreground">
                              커프 {item.metrics.cuffHeightMinMm}~{item.metrics.cuffHeightMaxMm}mm ·{" "}
                              {item.metrics.angulationDeg}°
                            </dd>
                          </dl>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </div>
            </aside>
          ) : null}

          {/* 로딩 · 에러 상태 표시 */}
          {status.kind === "loading" ? (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-900/15">
              <div className="w-[min(22rem,calc(100%-2rem))] space-y-2.5 rounded-xl border bg-background/95 p-4 shadow-lg">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                  <span className="truncate">{status.step}</span>
                </div>
                <Progress value={status.percent} className="h-2" />
              </div>
            </div>
          ) : null}

          {status.kind === "error" ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
              <div className="max-w-md space-y-2 rounded-xl border bg-background p-5 text-center shadow-lg">
                <p className="text-sm font-semibold text-destructive">
                  프리뷰를 준비하지 못했습니다.
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {status.message}
                </p>
              </div>
            </div>
          ) : null}

          <div className={cn(VIEW_GESTURE_HINT_LAYER_CLASS, "z-[30]")}>
            <ViewGestureHint storageKey="abuts.viewGestureHint.practiceCaPreview.v1.dismissed" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
