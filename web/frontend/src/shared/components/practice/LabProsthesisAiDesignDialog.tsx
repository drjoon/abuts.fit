// 기공소 채팅 헤더 — 작업시작 오른쪽 AI.
// - 2026-09-26: 헤더 의뢰 정보는 한 줄.
// - 2026-09-26: 스캔·마진·디자인 단계, 언더컷·교합 접촉, 치아별 생성.
// - 2026-09-26: 언더컷·교합은 헤더 중앙. 치아 정보는 설측 아래 트리. 스캔 파일은 세션 캐시.
// - 2026-09-26: 언더컷·교합·칼라·투명도는 작업영역 왼쪽 위. 파일명은 라벨로 끌어 역할을 바꾼다.
// - 2026-09-26: 작업영역 위 버튼은 헤더와 같은 높이.
// - 2026-09-26: 마진·디자인은 카메라를 유지한다. 치아 이름을 누르면 그 치아 교합면.
// - 2026-09-26: 삽입축은 치아 정보에서 보철마다. 브리지는 스팬당 하나.
// - 2026-09-26: 투명 체크는 지대치 외 스캔을 20%로 비추고, 끄면 불투명하다.
// - 2026-09-26: 투명 오른쪽 삽입축 토글이 화살표를 보여 준다. 치아 정보에서 잡으면 화면 중앙 광선에 닿는다.
// - 2026-09-26: 치아 이름은 글자 너비. 삽입축은 파란 버튼. 치아를 누르면 잡은 카메라로.
// - 2026-09-26: 작업영역 위 정중앙 버튼이 가로·세로 점선을 켠다.
// - 2026-09-26: 마진·삽입·내면·형상·훅·컷백·홀·커넥터를 작업 영역에서 고친다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Blend,
  Crosshair,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ImageDown,
  Paintbrush,
  Palette,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import { fetchS3BlobCached } from "@/shared/files/s3BlobCache";
import {
  fileFromImageBlob,
  fileFromModelBlob,
} from "@/shared/files/modelPreviewFile";
import { buildS3ProxyDownloadUrl } from "@/shared/files/useS3FileDownload";
import {
  LabBasketTagGuideButton,
  LabBasketTagPickerButton,
} from "@/shared/components/practice/LabBasketTagToolbar";
import {
  OralScanOverlayViewer,
  type OralScanOverlayHandle,
  type OralScanOverlaySource,
} from "@/shared/components/practice/OralScanOverlayViewer";
import { LabProsthesisModifyPanel } from "@/shared/components/practice/LabProsthesisModifyPanel";
import {
  buildLabProsthesisAiPlan,
  isOralScanMeshName,
  oralScanRoleLabel,
  initialLabOralScanVisible,
  prepArchFromProsthesisTeeth,
  resolveOralScanRole,
  formatProsthesisAiToothLabel,
  type LabOralScanRole,
  type LabProsthesisAiTooth,
} from "@/shared/practice/labProsthesisAiDesign";
import {
  undercutLimitFromRange,
  type ContactPaintMode,
} from "@/shared/practice/oralScanDesignAnalysis";
import {
  createToothDesignEdit,
  marginUntouched,
  redetectMargin,
  reduceDesignGesture,
  type DesignGesture,
  type EditBrush,
  type MarginEditMode,
  type ModifyTool,
  type ToothDesignEdit,
} from "@/shared/practice/labProsthesisModify";

type AiDesignFile = {
  fileName?: string | null;
  scanRole?: string | null;
  s3Key?: string | null;
};

type LabProsthesisAiCaseHeader = {
  /** 예: 테스트치과 · 노해인4 */
  primary?: string | null;
  /** 예: 주문 2026-09-26 · 도착 2026-10-07 */
  dates?: string | null;
};

type LabProsthesisAiBasketTag = {
  value: string;
  occupiedTags?: ReadonlySet<string> | null;
  onChange: (tag: string) => void;
};

type LabProsthesisAiDesignButtonProps = {
  toothWorks?: ReadonlyArray<{
    toothNumber?: string | null;
    prosthesisType?: string | null;
    bridgeLinkedTeeth?: readonly string[] | null;
  }> | null;
  files?: ReadonlyArray<AiDesignFile> | null;
  authToken?: string | null;
  caseHeader?: LabProsthesisAiCaseHeader | null;
  /** 채팅 헤더와 같은 바구니 번호표 */
  basketTag?: LabProsthesisAiBasketTag | null;
  className?: string;
};

type AssignableScanRole = Exclude<LabOralScanRole, "other">;

type MeshSource = {
  id: string;
  fileName: string;
  role: AssignableScanRole;
};

const IMAGE_EXT = /\.(png|jpe?g|webp|bmp|gif)$/i;
const GHOST_OPACITY_ON = 0.2;
/** 같은 세션에서 다시 열면 IndexedDB·네트워크 대신 이 파일을 쓴다. */
const sessionScanFileCache = new Map<string, File>();
const ROLE_DOT: Record<LabOralScanRole, string> = {
  upper: "bg-blue-500",
  lower: "bg-amber-500",
  bite: "bg-teal-500",
  other: "bg-slate-400",
};

type DesignStage = "scan" | "margin" | "design";

const DESIGN_STAGES: Array<{ id: DesignStage; label: string }> = [
  { id: "scan", label: "스캔" },
  { id: "margin", label: "마진" },
  { id: "design", label: "디자인" },
];

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function LabProsthesisAiDesignButton({
  toothWorks,
  files,
  authToken,
  caseHeader,
  basketTag,
  className,
}: LabProsthesisAiDesignButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("h-9 gap-1 px-3", className)}
        title="업로드 스캔으로 보철 디자인"
        aria-label="AI 보철 디자인"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        <span>AI</span>
      </Button>
      <LabProsthesisAiDesignDialog
        open={open}
        onOpenChange={setOpen}
        toothWorks={toothWorks}
        files={files}
        authToken={authToken}
        caseHeader={caseHeader}
        basketTag={basketTag}
      />
    </>
  );
}

function LabProsthesisAiDesignDialog({
  open,
  onOpenChange,
  toothWorks,
  files,
  authToken,
  caseHeader,
  basketTag,
}: LabProsthesisAiDesignButtonProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const plan = useMemo(
    () => buildLabProsthesisAiPlan({ toothWorks, files }),
    [files, toothWorks],
  );
  const filesRef = useRef(files);
  filesRef.current = files;

  const meshSources = useMemo(() => collectMeshSources(files), [files]);
  const meshKey = meshSources
    .map((row) => `${row.id}\0${row.role}\0${row.fileName}`)
    .join("|");
  const imageKey = useMemo(() => {
    return (files || [])
      .filter((file) => IMAGE_EXT.test(String(file.fileName || "")))
      .map((file) => `${file.s3Key || ""}\0${file.fileName || ""}`)
      .join("|");
  }, [files]);
  const prepTeeth =
    plan.designableTeeth.length > 0 ? plan.designableTeeth : plan.teeth;
  const prepArch = useMemo(
    () => prepArchFromProsthesisTeeth(prepTeeth),
    [prepTeeth],
  );
  const focusToothNumbers = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const tooth of prepTeeth) {
      for (const raw of [tooth.toothNumber, ...tooth.linkedTeeth]) {
        const number = String(raw || "").trim();
        if (!number || seen.has(number)) continue;
        seen.add(number);
        out.push(number);
      }
    }
    return out;
  }, [prepTeeth]);

  const [entries, setEntries] = useState<OralScanOverlaySource[]>([]);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [colorMapping, setColorMapping] = useState(true);
  const [hasScanColor, setHasScanColor] = useState(false);
  const [ghostOn, setGhostOn] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [progress, setProgress] = useState(0);
  const [fileState, setFileState] = useState<
    Record<string, "loading" | "ready" | "error">
  >({});
  const [stage, setStage] = useState<DesignStage>("scan");
  const [contactMap, setContactMap] = useState(false);
  const [undercutMap, setUndercutMap] = useState(false);
  const [occlusalGap, setOcclusalGap] = useState(0.1);
  const [contactMode, setContactMode] = useState<ContactPaintMode>("cut");
  const [undercutRange, setUndercutRange] = useState(40);
  const [selectedTooth, setSelectedTooth] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState(false);
  const [genLabel, setGenLabel] = useState("");
  const [toothInfoOpen, setToothInfoOpen] = useState(true);
  const [roleOverride, setRoleOverride] = useState<
    Record<string, AssignableScanRole>
  >({});
  const [scanOrder, setScanOrder] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dragScanId, setDragScanId] = useState<string | null>(null);
  const [dropScanId, setDropScanId] = useState<string | null>(null);
  const [workWide, setWorkWide] = useState(false);
  const [insertionKeys, setInsertionKeys] = useState<string[]>([]);
  const [insertionShown, setInsertionShown] = useState(false);
  const [centerGuides, setCenterGuides] = useState(true);
  const [modifyTool, setModifyTool] = useState<ModifyTool>("margin");
  const [marginMode, setMarginMode] = useState<MarginEditMode>("point");
  const [editBrush, setEditBrush] = useState<EditBrush>("none");
  const [edits, setEdits] = useState<Record<string, ToothDesignEdit>>({});
  const [holeNote, setHoleNote] = useState("");
  const viewerRef = useRef<OralScanOverlayHandle>(null);
  const workObserveRef = useRef<ResizeObserver | null>(null);
  const bindWorkArea = useCallback((node: HTMLDivElement | null) => {
    workObserveRef.current?.disconnect();
    workObserveRef.current = null;
    if (!node) return;
    const sync = () => {
      setWorkWide(node.clientWidth >= 720);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    workObserveRef.current = observer;
  }, []);
  const genSeq = useRef(0);

  useEffect(() => {
    if (!open) {
      setEntries([]);
      setVisible({});
      setColorMapping(true);
      setHasScanColor(false);
      setGhostOn(true);
      setLoadError("");
      setProgress(0);
      setFileState({});
      setStage("scan");
      setContactMap(false);
      setUndercutMap(false);
      setOcclusalGap(0.1);
      setContactMode("cut");
      setUndercutRange(40);
      setSelectedTooth(null);
      setGenerated({});
      setGenerating(false);
      setGenLabel("");
      setToothInfoOpen(true);
      setRoleOverride({});
      setScanOrder([]);
      setSidebarOpen(true);
      setDragScanId(null);
      setDropScanId(null);
      setInsertionKeys([]);
      setInsertionShown(false);
      setCenterGuides(true);
      setModifyTool("margin");
      setMarginMode("point");
      setEditBrush("none");
      setEdits({});
      setHoleNote("");
      genSeq.current += 1;
      return;
    }

    const ac = new AbortController();
    const sources = collectMeshSources(filesRef.current);
    const images = collectImageSources(filesRef.current);

    if (sources.length === 0) {
      setEntries([]);
      setLoadError("");
      setProgress(0);
      return () => {
        ac.abort();
      };
    }
    if (!authToken) {
      setLoadError("로그인이 필요합니다.");
      return () => ac.abort();
    }

    const percents = new Map<string, number>();
    const report = () => {
      const values = [...percents.values()];
      if (!values.length) return;
      const avg = values.reduce((sum, n) => sum + n, 0) / values.length;
      setProgress(Math.round(avg));
    };

    setLoadError("");
    setProgress(0);
    setFileState(
      Object.fromEntries(sources.map((row) => [row.id, "loading" as const])),
    );
    setVisible(
      Object.fromEntries(
        sources.map((row) => [
          row.id,
          initialLabOralScanVisible(row.role, prepArch),
        ]),
      ),
    );

    void (async () => {
      const companions: File[] = [];
      const wantsTexture = sources.some((row) =>
        /\.(ply|obj)$/i.test(row.fileName),
      );
      if (wantsTexture) {
        await Promise.all(
          images.map(async (image) => {
            const cacheKey = `img:${image.id}`;
            const hit = sessionScanFileCache.get(cacheKey);
            if (hit) {
              companions.push(hit);
              return;
            }
            try {
              const blob = await fetchS3BlobCached({
                s3Key: image.id,
                fileName: image.fileName,
                token: authToken,
                buildUrl: buildS3ProxyDownloadUrl,
                signal: ac.signal,
              });
              if (ac.signal.aborted) return;
              const file = fileFromImageBlob(blob, image.fileName);
              sessionScanFileCache.set(cacheKey, file);
              companions.push(file);
            } catch (err) {
              if ((err as { name?: string })?.name === "AbortError") return;
            }
          }),
        );
      }
      if (ac.signal.aborted) return;

      const loaded: OralScanOverlaySource[] = [];
      const nextState: Record<string, "ready" | "error"> = {};
      await Promise.all(
        sources.map(async (source) => {
          percents.set(source.id, 0);
          const cachedFile = sessionScanFileCache.get(source.id);
          if (cachedFile) {
            loaded.push({
              id: source.id,
              fileName: source.fileName,
              role: source.role,
              file: cachedFile,
              companionFiles: companions,
            });
            nextState[source.id] = "ready";
            percents.set(source.id, 100);
            report();
            return;
          }
          try {
            const blob = await fetchS3BlobCached({
              s3Key: source.id,
              fileName: source.fileName,
              token: authToken,
              buildUrl: buildS3ProxyDownloadUrl,
              signal: ac.signal,
              onProgress: (percent) => {
                percents.set(source.id, percent);
                report();
              },
            });
            if (ac.signal.aborted) return;
            const file = fileFromModelBlob(blob, source.fileName);
            sessionScanFileCache.set(source.id, file);
            loaded.push({
              id: source.id,
              fileName: source.fileName,
              role: source.role,
              file,
              companionFiles: companions,
            });
            nextState[source.id] = "ready";
            percents.set(source.id, 100);
            report();
          } catch (err) {
            if ((err as { name?: string })?.name === "AbortError") return;
            nextState[source.id] = "error";
            percents.set(source.id, 100);
            report();
          }
        }),
      );
      if (ac.signal.aborted) return;
      loaded.sort(
        (a, b) =>
          sources.findIndex((row) => row.id === a.id) -
          sources.findIndex((row) => row.id === b.id),
      );
      setEntries(loaded);
      setFileState((prev) => ({ ...prev, ...nextState }));
      if (loaded.length === 0) {
        setLoadError("스캔을 불러오지 못했습니다.");
      }
    })();

    return () => {
      ac.abort();
    };
  }, [authToken, imageKey, meshKey, open, prepArch]);

  const scans = useMemo(() => {
    const byId = new Map(meshSources.map((row) => [row.id, row]));
    const ids = (
      scanOrder.length > 0 ? scanOrder : meshSources.map((row) => row.id)
    ).filter((id) => byId.has(id));
    for (const row of meshSources) {
      if (!ids.includes(row.id)) ids.push(row.id);
    }
    return ids.map((id) => {
      const row = byId.get(id)!;
      return { ...row, role: roleOverride[id] ?? row.role };
    });
  }, [meshSources, roleOverride, scanOrder]);
  const viewerItems = useMemo(
    () =>
      entries.map((entry) => ({
        ...entry,
        role: roleOverride[entry.id] ?? entry.role,
      })),
    [entries, roleOverride],
  );

  const busy = scans.some((row) => fileState[row.id] === "loading");
  const hasGhost = scans.some(
    (row) =>
      row.role === "bite" ||
      ((prepArch === "upper" || prepArch === "lower") &&
        (row.role === "upper" || row.role === "lower") &&
        row.role !== prepArch),
  );
  const scanShown = (row: MeshSource) =>
    row.id in visible
      ? visible[row.id] !== false
      : initialLabOralScanVisible(row.role, prepArch);
  const allShown = scans.length > 0 && scans.every(scanShown);
  const swapScans = (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const originalRole = (id: string) =>
      meshSources.find((row) => row.id === id)?.role;
    setRoleOverride((prev) => {
      const roleOf = (id: string) => prev[id] ?? originalRole(id);
      const roleA = roleOf(sourceId);
      const roleB = roleOf(targetId);
      if (!roleA || !roleB || roleA === roleB) return prev;
      const next = { ...prev };
      if (originalRole(sourceId) === roleB) delete next[sourceId];
      else next[sourceId] = roleB;
      if (originalRole(targetId) === roleA) delete next[targetId];
      else next[targetId] = roleA;
      return next;
    });
    setScanOrder((prev) => {
      const base =
        prev.length > 0 ? [...prev] : meshSources.map((row) => row.id);
      const from = base.indexOf(sourceId);
      const to = base.indexOf(targetId);
      if (from < 0 || to < 0) return base;
      const next = [...base];
      next[from] = targetId;
      next[to] = sourceId;
      return next;
    });
  };

  const toggleAllShown = () => {
    const next = !allShown;
    setVisible(Object.fromEntries(scans.map((row) => [row.id, next])));
  };

  const canUndercut = prepArch != null;
  const canContact =
    prepArch === "both"
      ? scans.some((row) => row.role === "upper") &&
        scans.some((row) => row.role === "lower")
      : prepArch === "upper"
        ? scans.some((row) => row.role === "lower")
        : prepArch === "lower"
          ? scans.some((row) => row.role === "upper")
          : false;
  const activeTooth =
    plan.teeth.find((tooth) => tooth.toothNumber === selectedTooth) ??
    plan.teeth[0] ??
    null;
  const undercutLimit = undercutLimitFromRange(undercutRange);
  const activeNumber = activeTooth?.toothNumber ?? null;
  const activeEdit = activeNumber
    ? (edits[activeNumber] ?? createToothDesignEdit())
    : createToothDesignEdit();
  const bridgeSpan = insertionSpanForTooth(plan.teeth, activeNumber);
  const isBridgeSpan = bridgeSpan.length > 1 || activeTooth?.prosthesisType === "브리지";
  const bridges = useMemo(() => {
    const pairs: Array<{ from: string; to: string }> = [];
    for (const span of insertionSpansByOwner(plan.teeth).values()) {
      if (span.length < 2) continue;
      for (let index = 0; index < span.length - 1; index += 1) {
        const from = span[index];
        const to = span[index + 1];
        if (from && to) pairs.push({ from, to });
      }
    }
    return pairs;
  }, [plan.teeth]);
  const prepBackTransparent = Boolean(activeNumber && edits[activeNumber]?.margin.showBack);
  const designEdit = useMemo(
    () =>
      stage === "scan"
        ? null
        : {
            tool: modifyTool,
            marginMode,
            brush: editBrush,
            edits,
            generated,
            activeTooth: activeNumber,
            bridges,
            prepBackTransparent,
          },
    [
      activeNumber,
      bridges,
      editBrush,
      edits,
      generated,
      marginMode,
      modifyTool,
      prepBackTransparent,
      stage,
    ],
  );

  useEffect(() => {
    if (!open || stage === "scan" || plan.teeth.length === 0) return;
    setEdits((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const tooth of plan.teeth) {
        if (next[tooth.toothNumber]) continue;
        next[tooth.toothNumber] = createToothDesignEdit();
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [open, plan.teeth, stage]);

  const onDesignGesture = (gesture: DesignGesture) => {
    if (gesture.type === "hole-reject") {
      setHoleNote("교합면이 아닙니다. 다른 위치를 고르세요.");
      return;
    }
    setHoleNote("");
    setEdits((prev) => {
      const current = prev[gesture.tooth] ?? createToothDesignEdit();
      const next = reduceDesignGesture(current, gesture, marginMode === "pen");
      if (gesture.type !== "connector") {
        return { ...prev, [gesture.tooth]: next };
      }
      const span = insertionSpanForTooth(plan.teeth, gesture.tooth);
      const out = { ...prev, [gesture.tooth]: next };
      for (const tooth of span) {
        const base = out[tooth] ?? createToothDesignEdit();
        out[tooth] = { ...base, connector: next.connector };
      }
      return out;
    });
  };

  const runGenerate = async (toothNumbers: string[]) => {
    const seq = genSeq.current + 1;
    genSeq.current = seq;
    const targets = toothNumbers.filter(Boolean);
    setGenerating(true);
    setStage("margin");
    if (canUndercut) setUndercutMap(true);
    setGenLabel("마진과 언더컷을 확인하는 중");
    viewerRef.current?.setView("occlusal");
    await wait(900);
    if (genSeq.current !== seq) return;
    setStage("design");
    if (canContact) setContactMap(true);
    setGenLabel(
      canContact
        ? "교합 접촉을 계산하는 중"
        : "대합 스캔이 없어 언더컷만 표시합니다.",
    );
    viewerRef.current?.setView("occlusal");
    await wait(900);
    if (genSeq.current !== seq) return;
    setGenerating(false);
    setGenLabel("");
    if (targets.length === 0) return;
    setGenerated((prev) => {
      const next = { ...prev };
      for (const number of targets) next[number] = true;
      return next;
    });
    setEdits((prev) => {
      const next = { ...prev };
      for (const number of targets) {
        const current = next[number] ?? createToothDesignEdit();
        next[number] = marginUntouched(current) ? redetectMargin(current) : current;
      }
      return next;
    });
    setModifyTool("refine");
    setStage("design");
  };

  const onStage = (next: DesignStage) => {
    setStage(next);
    if (next === "scan") return;
    if (canUndercut) setUndercutMap(true);
    if (next === "design" && canContact) setContactMap(true);
  };

  const generateTargets = (
    prepTeeth.length > 0 ? prepTeeth : plan.teeth
  ).map((tooth) => tooth.toothNumber);

  const showTooth = (toothNumber: string) => {
    setSelectedTooth(toothNumber);
    const span = insertionSpanForTooth(plan.teeth, toothNumber);
    const restored =
      span.length > 0 &&
      viewerRef.current?.restoreInsertionView(span) === true;
    if (!restored) viewerRef.current?.focusTooth(toothNumber);
  };

  const rememberInsertion = (toothNumbers: readonly string[]) => {
    const ok = viewerRef.current?.setInsertionFromView(toothNumbers) === true;
    if (!ok) return;
    const key = insertionAxisKey(toothNumbers);
    if (!key) return;
    setInsertionKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setInsertionShown(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "inset-0 left-0 top-0 z-[480] flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0",
          "sm:inset-0 sm:left-0 sm:top-0 sm:h-[100dvh] sm:max-h-[100dvh] sm:w-screen sm:max-w-none sm:translate-x-0 sm:translate-y-0 sm:rounded-none sm:p-0",
          "duration-0 data-[state=open]:animate-none data-[state=closed]:animate-none",
        )}
        overlayClassName="z-[475]"
        closeClassName="right-3 top-3 z-20"
        closeIconClassName="h-5 w-5"
        onInteractOutside={(event) => {
          const target = event.target;
          if (
            target instanceof Element &&
            (target.closest("[data-radix-popper-content-wrapper]") ||
              target.closest("[data-lab-basket-layer]") ||
              target.closest(".lab-basket-layer-overlay"))
          ) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader className="relative shrink-0 flex-row items-center justify-between gap-3 space-y-0 border-b bg-white/95 py-2 pl-5 pr-3 text-left">
          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-x-3 overflow-hidden">
            <DialogTitle className="shrink-0 text-base sm:text-lg">
              AI 보철 디자인
            </DialogTitle>
            {plan.teeth.length > 0 ? (
              <ul className="flex shrink-0 flex-nowrap gap-1.5">
                {plan.teeth.map((tooth, index) => (
                  <li
                    key={`${tooth.toothNumber}-${tooth.prosthesisType}-${index}`}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-medium",
                      tooth.designable
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {formatProsthesisAiToothLabel(tooth)}
                  </li>
                ))}
              </ul>
            ) : null}
            <CaseHeaderLines header={caseHeader} />
            {basketTag ? (
              <div className="flex shrink-0 items-center gap-0.5">
                <LabBasketTagPickerButton
                  value={basketTag.value}
                  occupiedTags={basketTag.occupiedTags}
                  onChange={basketTag.onChange}
                  popoverClassName="z-[520]"
                />
                <LabBasketTagGuideButton elevated />
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center justify-end gap-1.5 pr-8">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1"
              onClick={() => viewerRef.current?.saveImage()}
              title="현재 뷰를 PNG로 저장"
            >
              <ImageDown className="h-3.5 w-3.5" />
              이미지 저장
            </Button>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          <aside
            className={cn(
              "flex shrink-0 flex-col border-r bg-background",
              sidebarOpen ? "w-[min(20rem,36vw)]" : "w-10",
            )}
          >
            {sidebarOpen ? (
            <>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allShown}
                  disabled={scans.length === 0}
                  onCheckedChange={() => toggleAllShown()}
                  aria-label="표시 전체 선택"
                />
                <p className="text-xs font-semibold text-foreground">표시</p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-7 w-7 px-0"
                  aria-label="사이드바 접기"
                  title="사이드바 접기"
                  onClick={() => setSidebarOpen(false)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
              {scans.length === 0 ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  상악·하악·바이트 스캔이 없습니다.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {scans.map((scan) => {
                    const state = fileState[scan.id];
                    return (
                      <li
                        key={scan.id}
                        className={cn(
                          "flex min-w-0 items-center gap-2 rounded px-0.5",
                          dropScanId === scan.id &&
                            dragScanId &&
                            dragScanId !== scan.id &&
                            "bg-primary/10 ring-1 ring-primary",
                        )}
                        onDragOver={(event) => {
                          if (dragScanId === scan.id) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setDropScanId((prev) =>
                            prev === scan.id ? prev : scan.id,
                          );
                        }}
                        onDragLeave={(event) => {
                          const next = event.relatedTarget;
                          if (
                            next instanceof Node &&
                            event.currentTarget.contains(next)
                          ) {
                            return;
                          }
                          setDropScanId((prev) =>
                            prev === scan.id ? null : prev,
                          );
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const id = event.dataTransfer.getData("text/plain");
                          setDropScanId(null);
                          setDragScanId(null);
                          if (id) swapScans(id, scan.id);
                        }}
                      >
                        <Checkbox
                          checked={scanShown(scan)}
                          disabled={state === "loading" || state === "error"}
                          onCheckedChange={(checked) => {
                            setVisible((prev) => ({
                              ...prev,
                              [scan.id]: checked === true,
                            }));
                          }}
                          aria-label={`${oralScanRoleLabel(scan.role)} 표시`}
                        />
                        <span
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            ROLE_DOT[scan.role],
                          )}
                        />
                        <span className="inline-flex h-5 w-12 shrink-0 items-center justify-center text-[11px] font-semibold text-primary">
                          {oralScanRoleLabel(scan.role)}
                        </span>
                        <span
                          draggable
                          title="끌어 다른 파일이나 상악·하악·바이트 위에 놓으면 서로 바뀝니다"
                          className="min-w-0 flex-1 cursor-grab truncate text-xs text-foreground active:cursor-grabbing"
                          onDragStart={(event) => {
                            event.dataTransfer.setData("text/plain", scan.id);
                            event.dataTransfer.effectAllowed = "move";
                            setDragScanId(scan.id);
                          }}
                          onDragEnd={() => {
                            setDragScanId(null);
                            setDropScanId(null);
                          }}
                        >
                          {scan.fileName}
                        </span>
                        {state === "error" ? (
                          <span className="shrink-0 text-[10px] text-destructive">
                            실패
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
              {busy ? <Progress value={progress} className="h-1.5" /> : null}
            </section>

            {loadError ? (
              <p className="text-xs leading-relaxed text-destructive">{loadError}</p>
            ) : null}

            <section className="mt-5 space-y-2">
              <p className="text-xs font-semibold text-foreground">단계</p>
              <div className="grid grid-cols-3 gap-1">
                {DESIGN_STAGES.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    size="sm"
                    variant={stage === item.id ? "default" : "outline"}
                    className="h-7 px-2 text-[11px]"
                    onClick={() => {
                      onStage(item.id);
                      if (item.id === "margin") setModifyTool("margin");
                      if (item.id === "design") setModifyTool("refine");
                    }}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </section>

            {stage !== "scan" ? (
              <LabProsthesisModifyPanel
                tool={modifyTool}
                onTool={(next) => {
                  setModifyTool(next);
                  setEditBrush("none");
                  setHoleNote("");
                  if (next === "margin" || next === "insertion") onStage("margin");
                  else onStage("design");
                }}
                marginMode={marginMode}
                onMarginMode={setMarginMode}
                brush={editBrush}
                onBrush={setEditBrush}
                edit={activeEdit}
                onEdit={(next) => {
                  if (!activeNumber) return;
                  setEdits((prev) => {
                    if (modifyTool !== "connector" || bridgeSpan.length < 2) {
                      return { ...prev, [activeNumber]: next };
                    }
                    const out = { ...prev, [activeNumber]: next };
                    for (const tooth of bridgeSpan) {
                      const base = out[tooth] ?? createToothDesignEdit();
                      out[tooth] =
                        tooth === activeNumber
                          ? next
                          : { ...base, connector: next.connector };
                    }
                    return out;
                  });
                }}
                toothLabel={
                  activeTooth ? formatProsthesisAiToothLabel(activeTooth) : null
                }
                generated={activeNumber ? generated[activeNumber] === true : false}
                isBridge={isBridgeSpan}
                canMatchInsertion={entries.length > 0 && bridgeSpan.length > 0}
                holeNote={holeNote}
                onRedetect={() => {
                  if (!activeNumber) return;
                  setEdits((prev) => ({
                    ...prev,
                    [activeNumber]: redetectMargin(
                      prev[activeNumber] ?? createToothDesignEdit(),
                    ),
                  }));
                }}
                onClearMargin={() => {
                  if (!activeNumber) return;
                  const current = edits[activeNumber] ?? createToothDesignEdit();
                  setEdits((prev) => ({
                    ...prev,
                    [activeNumber]: {
                      ...current,
                      margin: { ...current.margin, deleted: true },
                    },
                  }));
                }}
                onMatchInsertion={() => {
                  if (bridgeSpan.length === 0) return;
                  rememberInsertion(bridgeSpan);
                  setModifyTool("insertion");
                }}
                onApplyInner={() => {
                  if (!activeNumber) return;
                  setEdits((prev) => {
                    const current = prev[activeNumber] ?? createToothDesignEdit();
                    return {
                      ...prev,
                      [activeNumber]: {
                        ...current,
                        inner: { ...current.inner, applied: true },
                      },
                    };
                  });
                }}
                onRemoveHook={() => {
                  if (!activeNumber) return;
                  setEdits((prev) => {
                    const current = prev[activeNumber] ?? createToothDesignEdit();
                    return {
                      ...prev,
                      [activeNumber]: {
                        ...current,
                        hook: { ...current.hook, on: false },
                      },
                    };
                  });
                }}
              />
            ) : null}

            {stage === "margin" ? (
              <section className="space-y-2">
                <p className="text-xs font-semibold text-foreground">마진</p>
                <label className="flex items-center justify-between gap-3 text-xs font-medium">
                  언더컷
                  <Switch
                    checked={undercutMap}
                    disabled={!canUndercut}
                    onCheckedChange={setUndercutMap}
                    aria-label="언더컷 표시"
                    className="h-5 w-9 data-[state=checked]:bg-primary [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4"
                  />
                </label>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span>언더컷 범위</span>
                    <span className="text-muted-foreground">
                      {undercutRange < 35 ? "좁음" : undercutRange > 70 ? "넓음" : "보통"}
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={100}
                    step={5}
                    value={[undercutRange]}
                    disabled={!canUndercut}
                    onValueChange={([value]) => setUndercutRange(value ?? 40)}
                    aria-label="언더컷 범위"
                  />
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 flex-1 px-2 text-[11px]"
                    disabled={!canUndercut || generating}
                    onClick={() => {
                      setStage("margin");
                      setUndercutMap(true);
                      setUndercutRange(40);
                      const span = insertionSpanForTooth(
                        plan.teeth,
                        activeTooth?.toothNumber,
                      );
                      if (span.length > 0) rememberInsertion(span);
                    }}
                  >
                    다시 표시
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 flex-1 px-2 text-[11px]"
                    onClick={() => setUndercutMap(false)}
                  >
                    지우기
                  </Button>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  화면 중앙이 보철을 지나게 맞춥니다.
                  <br />
                  다시 표시하면 화면과 수직인 삽입축을 그 자리에 잡습니다.
                  <br />
                  언더컷과 마진을 그 축으로 다시 칠합니다.
                </p>
              </section>
            ) : null}

            {stage === "design" ? (
              <section className="space-y-2">
                <p className="text-xs font-semibold text-foreground">교합</p>
                <label className="flex items-center justify-between gap-3 text-xs font-medium">
                  접촉
                  <Switch
                    checked={contactMap}
                    disabled={!canContact}
                    onCheckedChange={setContactMap}
                    aria-label="교합 접촉 표시"
                    className="h-5 w-9 data-[state=checked]:bg-primary [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4"
                  />
                </label>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span>교합 거리</span>
                    <span className="tabular-nums text-muted-foreground">
                      {occlusalGap.toFixed(2)} mm
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={50}
                    step={5}
                    value={[Math.round(occlusalGap * 100)]}
                    disabled={!canContact}
                    onValueChange={([value]) => setOcclusalGap((value ?? 10) / 100)}
                    aria-label="교합 거리"
                  />
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={contactMode === "cut" ? "default" : "outline"}
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setContactMode("cut")}
                  >
                    절삭
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={contactMode === "keep" ? "default" : "outline"}
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setContactMode("keep")}
                  >
                    형태 유지
                  </Button>
                </div>
                {!canContact ? (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    대합 스캔이 있으면 접촉 색을 칠합니다.
                  </p>
                ) : (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    빨강은 목표보다 가깝고, 초록은 맞고, 파랑은 틈입니다.
                    <br />
                    절삭은 가까운 면을 더 붉게 잡습니다.
                  </p>
                )}
              </section>
            ) : null}
            </div>
            </>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="m-1 h-8 w-8 px-0"
                aria-label="사이드바 펼치기"
                title="사이드바 펼치기"
                onClick={() => setSidebarOpen(true)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </aside>
          <div ref={bindWorkArea} className="relative min-w-0 flex-1">
            <OralScanOverlayViewer
              ref={viewerRef}
              items={viewerItems}
              visible={visible}
              colorMapping={colorMapping}
              ghostOpacity={ghostOn ? GHOST_OPACITY_ON : 1}
              prepArch={prepArch}
              focusToothNumbers={focusToothNumbers}
              toothBadges={plan.teeth.map((tooth) => ({
                toothNumber: tooth.toothNumber,
                active: activeTooth?.toothNumber === tooth.toothNumber,
              }))}
              onSelectTooth={showTooth}
              contactMap={contactMap}
              undercutMap={undercutMap}
              occlusalGapMm={occlusalGap}
              contactMode={contactMode}
              undercutLimit={undercutLimit}
              busy={busy}
              busyLabel={busy ? `스캔을 불러오는 중 ${progress}%` : ""}
              onScanColorChange={setHasScanColor}
              onInsertionAxisChange={(active) => {
                if (!active) setInsertionKeys([]);
              }}
              showInsertionAxis={insertionShown}
              showCenterGuides={centerGuides}
              designEdit={designEdit}
              onDesignGesture={onDesignGesture}
              className="absolute inset-0"
            />
            <div className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-12rem)] flex-col items-start gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={undercutMap ? "default" : "outline"}
                className={cn(
                  "h-8 shadow-sm [&_svg]:!size-3.5",
                  workWide ? "gap-1 px-2.5" : "w-8 px-0",
                )}
                title={canUndercut ? "언더컷" : "주문 치아의 악을 알 수 없습니다"}
                aria-label="언더컷"
                disabled={!canUndercut}
                onClick={() => {
                  if (!canUndercut) return;
                  setUndercutMap((on) => !on);
                  setStage("margin");
                }}
              >
                <TriangleAlert />
                {workWide ? <span>언더컷</span> : null}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={contactMap ? "default" : "outline"}
                className={cn(
                  "h-8 shadow-sm [&_svg]:!size-3.5",
                  workWide ? "gap-1 px-2.5" : "w-8 px-0",
                )}
                title={canContact ? "교합 접촉" : "대합 스캔이 없습니다"}
                aria-label="교합 접촉"
                disabled={!canContact}
                onClick={() => {
                  if (!canContact) return;
                  setContactMap((on) => !on);
                  setStage("design");
                }}
              >
                <Palette />
                {workWide ? <span>교합 접촉</span> : null}
              </Button>
              {hasScanColor ? (
                <Button
                  type="button"
                  size="sm"
                  variant={colorMapping ? "default" : "outline"}
                  className={cn(
                    "h-8 shadow-sm [&_svg]:!size-3.5",
                    workWide ? "gap-1 px-2.5" : "w-8 px-0",
                  )}
                  title="스캔 칼라"
                  aria-label="칼라"
                  aria-pressed={colorMapping}
                  onClick={() => setColorMapping((on) => !on)}
                >
                  <Paintbrush />
                  {workWide ? <span>칼라</span> : null}
                </Button>
              ) : null}
              {hasGhost ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant={ghostOn ? "default" : "outline"}
                      className={cn(
                        "h-8 shadow-sm [&_svg]:!size-3.5",
                        workWide ? "gap-1 px-2.5" : "w-8 px-0",
                      )}
                      aria-label="투명"
                      aria-pressed={ghostOn}
                      onClick={() => setGhostOn((on) => !on)}
                    >
                      <Blend />
                      {workWide ? <span>투명</span> : null}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="z-[520]">
                    지대치를 제외한 대합과 바이트를 유리처럼 비춥니다.
                    <br />
                    끄면 그 스캔을 불투명하게 보입니다.
                  </TooltipContent>
                </Tooltip>
              ) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant={insertionShown ? "default" : "outline"}
                    className={cn(
                      "h-8 shadow-sm [&_svg]:!size-3.5",
                      workWide ? "gap-1 px-2.5" : "w-8 px-0",
                    )}
                    title="삽입축"
                    aria-label="삽입축"
                    aria-pressed={insertionShown}
                    onClick={() => setInsertionShown((on) => !on)}
                  >
                    <ArrowDownToLine />
                    {workWide ? <span>삽입축</span> : null}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="z-[520]">
                  잡은 삽입축을 치아에서 2mm 띄워 표시합니다.
                  <br />
                  치아번호는 윗단 고리 중심에 있습니다.
                  <br />
                  끄면 숨깁니다.
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant={centerGuides ? "default" : "outline"}
                    className={cn(
                      "h-8 shadow-sm [&_svg]:!size-3.5",
                      workWide ? "gap-1 px-2.5" : "w-8 px-0",
                    )}
                    title="정중앙"
                    aria-label="정중앙"
                    aria-pressed={centerGuides}
                    onClick={() => setCenterGuides((on) => !on)}
                  >
                    <Crosshair />
                    {workWide ? <span>정중앙</span> : null}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="z-[520]">
                  화면 정중앙에 가로·세로 점선을 표시합니다.
                  <br />
                  끄면 점선을 숨깁니다.
                </TooltipContent>
              </Tooltip>
              </div>
              {undercutMap || contactMap || (insertionShown && insertionKeys.length > 0) ? (
                <div className="pointer-events-none flex items-center gap-2 rounded-md bg-background/95 px-2 py-1 text-[10px] text-muted-foreground shadow-sm">
                  {undercutMap ? (
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-red-700" />
                      언더컷
                    </span>
                  ) : null}
                  {contactMap ? (
                    <>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-red-500" />
                        밀착
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        목표
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-blue-500" />
                        틈
                      </span>
                    </>
                  ) : null}
                  {insertionShown && insertionKeys.length > 0 ? (
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      삽입축
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            <DesignViewerChrome
              teeth={plan.teeth}
              activeTooth={activeTooth}
              generated={generated}
              generating={generating}
              genLabel={genLabel}
              toothInfoOpen={toothInfoOpen}
              insertionKeys={insertionKeys}
              canSetInsertion={entries.length > 0}
              showGenerateAll={generateTargets.length >= 2}
              onSelectTooth={showTooth}
              onSetInsertion={rememberInsertion}
              onToggleInfo={() => setToothInfoOpen((open) => !open)}
              onGenerateAll={() => void runGenerate(generateTargets)}
              onGenerateTooth={(toothNumber) => void runGenerate([toothNumber])}
              onClearTooth={(toothNumber) => {
                setGenerated((prev) => ({ ...prev, [toothNumber]: false }));
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function toothArchGroup(toothNumber: string): "upper" | "lower" | "other" {
  const quadrant = String(toothNumber || "").replace(/\D/g, "")[0];
  if (quadrant === "1" || quadrant === "2") return "upper";
  if (quadrant === "3" || quadrant === "4") return "lower";
  return "other";
}

function insertionAxisKey(toothNumbers: readonly string[]) {
  return toothNumbers
    .map((tooth) => String(tooth || "").replace(/\D/g, ""))
    .filter((tooth) => /^[1-4][1-8]$/.test(tooth))
    .sort()
    .join(",");
}

/**
 * 브리지는 연결된 치아를 한 스팬으로 묶는다.
 * 키는 스팬을 대표하는 행의 치아번호, 값은 스팬 전체.
 */
function insertionSpansByOwner(
  teeth: readonly LabProsthesisAiTooth[],
): Map<string, string[]> {
  const order = new Map<string, number>();
  teeth.forEach((tooth, index) => order.set(tooth.toothNumber, index));
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const current = parent.get(id) ?? id;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const left = find(a);
    const right = find(b);
    if (left !== right) parent.set(right, left);
  };
  const ensure = (id: string) => {
    if (!id) return;
    if (!parent.has(id)) parent.set(id, id);
  };
  for (const tooth of teeth) {
    ensure(tooth.toothNumber);
    const bridged =
      tooth.prosthesisType === "브리지" || tooth.linkedTeeth.length > 0;
    if (!bridged) continue;
    for (const linked of tooth.linkedTeeth) {
      ensure(linked);
      union(tooth.toothNumber, linked);
    }
  }
  const members = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    const list = members.get(root) ?? [];
    list.push(id);
    members.set(root, list);
  }
  const owner = new Map<string, string[]>();
  for (const list of members.values()) {
    const rows = list
      .filter((id) => order.has(id))
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    const lead = rows[0];
    if (!lead) continue;
    owner.set(lead, [...list].sort());
  }
  return owner;
}

function insertionSpanForTooth(
  teeth: readonly LabProsthesisAiTooth[],
  toothNumber: string | null | undefined,
): string[] {
  const digits = String(toothNumber || "").replace(/\D/g, "");
  if (!/^[1-4][1-8]$/.test(digits)) return [];
  const spans = insertionSpansByOwner(teeth);
  const own = spans.get(digits);
  if (own) return own;
  for (const span of spans.values()) {
    if (span.includes(digits)) return span;
  }
  return [digits];
}

function DesignViewerChrome({
  teeth,
  activeTooth,
  generated,
  generating,
  genLabel,
  toothInfoOpen,
  insertionKeys,
  canSetInsertion,
  showGenerateAll,
  onSelectTooth,
  onSetInsertion,
  onToggleInfo,
  onGenerateAll,
  onGenerateTooth,
  onClearTooth,
}: {
  teeth: LabProsthesisAiTooth[];
  activeTooth: LabProsthesisAiTooth | null;
  generated: Record<string, boolean>;
  generating: boolean;
  genLabel: string;
  toothInfoOpen: boolean;
  insertionKeys: readonly string[];
  canSetInsertion: boolean;
  showGenerateAll: boolean;
  onSelectTooth: (toothNumber: string) => void;
  onSetInsertion: (toothNumbers: readonly string[]) => void;
  onToggleInfo: () => void;
  onGenerateAll: () => void;
  onGenerateTooth: (toothNumber: string) => void;
  onClearTooth: (toothNumber: string) => void;
}) {
  const archGroups = (
    [
      { id: "upper" as const, label: "상악" },
      { id: "lower" as const, label: "하악" },
      { id: "other" as const, label: "기타" },
    ] as const
  )
    .map((group) => ({
      ...group,
      teeth: teeth.filter((tooth) => toothArchGroup(tooth.toothNumber) === group.id),
    }))
    .filter((group) => group.teeth.length > 0);
  const spans = insertionSpansByOwner(teeth);
  const toothActionClass =
    "inline-flex h-7 shrink-0 items-center justify-center rounded-md px-2 text-xs font-medium leading-none disabled:opacity-50";

  return (
    <>
      <style>
        {`@keyframes aiScanLine { 0% { transform: translateY(0); opacity: .25; } 50% { opacity: 1; } 100% { transform: translateY(58vh); opacity: .2; } }`}
      </style>

      <div className="absolute right-3 top-3 z-10 flex max-h-[calc(100%-1.5rem)] w-fit max-w-[min(22rem,42vw)] flex-col items-end gap-1">
        {teeth.length > 0 ? (
          <div className="mt-1 w-fit max-w-full overflow-hidden rounded-lg border bg-background/95 text-sm shadow-sm">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left"
              onClick={onToggleInfo}
              aria-expanded={toothInfoOpen}
            >
              <span className="font-semibold text-foreground">치아 정보</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  toothInfoOpen ? "rotate-180" : "",
                )}
              />
            </button>
            {toothInfoOpen ? (
              <div className="max-h-[min(24rem,52vh)] overflow-y-auto border-t px-3.5 py-2.5">
                {archGroups.map((group) => (
                  <div key={group.id} className="mb-2.5 last:mb-0">
                    <p className="text-xs font-medium text-muted-foreground">
                      {group.label}
                    </p>
                    <ul className="ml-2 mt-1 border-l border-border pl-3">
                      {group.teeth.map((tooth, index) => {
                        const selected = activeTooth?.toothNumber === tooth.toothNumber;
                        const done = generated[tooth.toothNumber] === true;
                        const span = spans.get(tooth.toothNumber);
                        const spanKey = span ? insertionAxisKey(span) : "";
                        const axisOn = Boolean(spanKey && insertionKeys.includes(spanKey));
                        return (
                          <li
                            key={`${tooth.toothNumber}-${tooth.prosthesisType}-${index}`}
                            className="py-1"
                          >
                            <div className="flex w-fit items-center gap-1.5 py-0.5">
                              <button
                                type="button"
                                className={cn(
                                  "w-fit shrink-0 whitespace-nowrap rounded-md px-1 py-0.5 text-left",
                                  selected ? "bg-primary/10" : "hover:bg-muted",
                                )}
                                title={
                                  axisOn
                                    ? "삽입축을 잡았던 방향·각도·줌으로 봅니다"
                                    : "이 치아의 교합면을 봅니다"
                                }
                                onClick={() => onSelectTooth(tooth.toothNumber)}
                              >
                                <span className="font-semibold">#{tooth.toothNumber}</span>
                                <span className="ml-1.5 text-muted-foreground">
                                  {tooth.prosthesisType}
                                </span>
                              </button>
                              {span ? (
                                <button
                                  type="button"
                                  className={cn(
                                    toothActionClass,
                                    "bg-primary text-primary-foreground",
                                    !canSetInsertion && "opacity-50",
                                  )}
                                  title={
                                    span.length > 1
                                      ? "화면 중앙을 지나 화면과 수직인 삽입축을 스팬에 잡습니다. 화살표는 치아에서 2mm 떨어집니다"
                                      : "화면 중앙을 지나 화면과 수직인 삽입축을 잡습니다. 화살표는 치아에서 2mm 떨어집니다"
                                  }
                                  aria-label={span.length > 1 ? "스팬 삽입축" : "삽입축"}
                                  aria-pressed={axisOn}
                                  disabled={!canSetInsertion}
                                  onClick={() => onSetInsertion(span)}
                                >
                                  삽입축
                                </button>
                              ) : null}
                              {done ? (
                                <button
                                  type="button"
                                  className={cn(
                                    toothActionClass,
                                    "text-muted-foreground hover:bg-muted",
                                  )}
                                  onClick={() => onClearTooth(tooth.toothNumber)}
                                >
                                  삭제
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className={cn(
                                    toothActionClass,
                                    "bg-primary text-primary-foreground",
                                  )}
                                  disabled={generating || !tooth.designable}
                                  onClick={() => onGenerateTooth(tooth.toothNumber)}
                                >
                                  생성
                                </button>
                              )}
                            </div>
                            {tooth.linkedTeeth.length > 0 ? (
                              <ul className="ml-2 border-l border-border pl-2">
                                {tooth.linkedTeeth.map((linked) => (
                                  <li
                                    key={linked}
                                    className="py-0.5 text-xs text-muted-foreground"
                                  >
                                    #{linked}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {generating ? (
        <>
          <div
            className="pointer-events-none absolute inset-x-8 top-16 z-10 h-px bg-sky-400 shadow-[0_0_12px_2px_rgba(56,189,248,0.85)]"
            style={{ animation: "aiScanLine 1.15s ease-in-out infinite" }}
          />
          {genLabel ? (
            <p className="pointer-events-none absolute bottom-16 left-1/2 z-10 -translate-x-1/2 rounded-md bg-background/95 px-3 py-1.5 text-xs text-foreground shadow-sm">
              {genLabel}
            </p>
          ) : null}
        </>
      ) : null}

      {activeTooth || showGenerateAll ? (
        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1.5">
          {showGenerateAll ? (
            <button
              type="button"
              className="rounded-full bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground shadow-sm disabled:opacity-50"
              disabled={generating}
              onClick={onGenerateAll}
            >
              전체 생성
            </button>
          ) : null}
          {activeTooth ? (
            <div className="flex items-center gap-2 rounded-full border bg-background/95 px-3 py-1 shadow-sm">
              <span className="text-xs font-medium">
                {formatProsthesisAiToothLabel(activeTooth)}
              </span>
              {generated[activeTooth.toothNumber] ? (
                <span className="text-[11px] font-medium text-primary">생성됨</span>
              ) : (
                <button
                  type="button"
                  className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
                  disabled={generating || !activeTooth.designable}
                  onClick={() => onGenerateTooth(activeTooth.toothNumber)}
                >
                  생성
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function CaseHeaderLines({
  header,
}: {
  header?: LabProsthesisAiCaseHeader | null;
}) {
  const primary = String(header?.primary || "").trim();
  const dates = String(header?.dates || "").trim();
  if (!primary && !dates) return null;
  return (
    <p className="flex min-w-0 flex-nowrap items-center gap-x-3 overflow-hidden text-xs text-muted-foreground">
      {primary ? (
        <span className="min-w-0 truncate font-medium text-foreground">
          {primary}
        </span>
      ) : null}
      {dates ? (
        <span className="shrink-0 tabular-nums">{dates}</span>
      ) : null}
    </p>
  );
}

function collectMeshSources(
  files: ReadonlyArray<AiDesignFile> | null | undefined,
): MeshSource[] {
  const out: MeshSource[] = [];
  const seen = new Set<string>();
  for (const file of files || []) {
    const fileName = String(file?.fileName || "").trim();
    const id = String(file?.s3Key || "").trim();
    if (!fileName || !id || seen.has(id) || !isOralScanMeshName(fileName)) {
      continue;
    }
    const role = resolveOralScanRole(file);
    if (role !== "upper" && role !== "lower" && role !== "bite") continue;
    seen.add(id);
    out.push({ id, fileName, role });
  }
  return out;
}

function collectImageSources(
  files: ReadonlyArray<AiDesignFile> | null | undefined,
): Array<{ id: string; fileName: string }> {
  const out: Array<{ id: string; fileName: string }> = [];
  const seen = new Set<string>();
  for (const file of files || []) {
    const fileName = String(file?.fileName || "").trim();
    const id = String(file?.s3Key || "").trim();
    if (!fileName || !id || seen.has(id) || !IMAGE_EXT.test(fileName)) continue;
    seen.add(id);
    out.push({ id, fileName });
  }
  return out;
}
