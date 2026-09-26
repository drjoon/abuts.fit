// 기공소 채팅 헤더 — 작업시작 오른쪽 AI.
// - 2026-09-26: 헤더 의뢰 정보는 한 줄.
// - 2026-09-26: 스캔·마진·디자인 단계, 언더컷·교합 접촉, 치아별 생성.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ImageDown,
  Link2,
  LocateFixed,
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
  type OralScanViewPreset,
} from "@/shared/components/practice/OralScanOverlayViewer";
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

type MeshSource = {
  id: string;
  fileName: string;
  role: LabOralScanRole;
};

const IMAGE_EXT = /\.(png|jpe?g|webp|bmp|gif)$/i;
const GHOST_OPACITY_DEFAULT = 0.3;
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

const DESIGN_VIEWS: Array<{ id: OralScanViewPreset; label: string }> = [
  { id: "occlusal", label: "교합면" },
  { id: "buccal", label: "협측" },
  { id: "lingual", label: "설측" },
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
  const [ghostOpacity, setGhostOpacity] = useState(GHOST_OPACITY_DEFAULT);
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
  const viewerRef = useRef<OralScanOverlayHandle>(null);
  const genSeq = useRef(0);

  useEffect(() => {
    if (!open) {
      setEntries([]);
      setVisible({});
      setColorMapping(true);
      setHasScanColor(false);
      setGhostOpacity(GHOST_OPACITY_DEFAULT);
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
            try {
              const blob = await fetchS3BlobCached({
                s3Key: image.id,
                fileName: image.fileName,
                token: authToken,
                buildUrl: buildS3ProxyDownloadUrl,
                signal: ac.signal,
              });
              if (ac.signal.aborted) return;
              companions.push(fileFromImageBlob(blob, image.fileName));
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
            loaded.push({
              id: source.id,
              fileName: source.fileName,
              role: source.role,
              file: fileFromModelBlob(blob, source.fileName),
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
  const busy = meshSources.some((row) => fileState[row.id] === "loading");
  const hasGhost = meshSources.some(
    (row) =>
      row.role === "bite" ||
      ((prepArch === "upper" || prepArch === "lower") &&
        (row.role === "upper" || row.role === "lower") &&
        row.role !== prepArch),
  );

  const showAll = () => {
    setVisible(Object.fromEntries(meshSources.map((row) => [row.id, true])));
  };

  const canUndercut = prepArch != null;
  const canContact =
    prepArch === "both"
      ? meshSources.some((row) => row.role === "upper") &&
        meshSources.some((row) => row.role === "lower")
      : prepArch === "upper"
        ? meshSources.some((row) => row.role === "lower")
        : prepArch === "lower"
          ? meshSources.some((row) => row.role === "upper")
          : false;
  const activeTooth =
    plan.teeth.find((tooth) => tooth.toothNumber === selectedTooth) ??
    plan.teeth[0] ??
    null;
  const undercutLimit = undercutLimitFromRange(undercutRange);

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
  };

  const onStage = (next: DesignStage) => {
    setStage(next);
    if (next === "scan") return;
    if (canUndercut) setUndercutMap(true);
    if (next === "design" && canContact) setContactMap(true);
    viewerRef.current?.setView("occlusal");
  };

  const generateTargets = (
    prepTeeth.length > 0 ? prepTeeth : plan.teeth
  ).map((tooth) => tooth.toothNumber);

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
        <DialogHeader className="shrink-0 flex-row items-center gap-3 space-y-0 border-b bg-white/95 py-2 pl-5 pr-3 text-left">
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
          <div className="flex shrink-0 items-center gap-1.5 pr-8">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1"
              onClick={() => viewerRef.current?.setView("fit")}
            >
              <LocateFixed className="h-3.5 w-3.5" />
              맞춤
            </Button>
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
          <aside className="flex w-[min(20rem,36vw)] shrink-0 flex-col border-r bg-background">
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">표시</p>
                <div className="flex flex-wrap justify-end gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px]"
                    onClick={showAll}
                  >
                    전체
                  </Button>
                  {(["upper", "lower", "bite"] as const).map((role) =>
                    meshSources.some((row) => row.role === role) ? (
                      <Button
                        key={role}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => {
                          setVisible(
                            Object.fromEntries(
                              meshSources.map((row) => [
                                row.id,
                                row.role === role,
                              ]),
                            ),
                          );
                        }}
                      >
                        {oralScanRoleLabel(role)}
                      </Button>
                    ) : null,
                  )}
                </div>
              </div>
              {meshSources.length === 0 ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  상악·하악·바이트 스캔이 없습니다.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {meshSources.map((scan) => {
                    const state = fileState[scan.id];
                    return (
                      <li key={scan.id} className="flex min-w-0 items-center gap-2">
                        <Checkbox
                          checked={
                            scan.id in visible
                              ? visible[scan.id] !== false
                              : initialLabOralScanVisible(scan.role, prepArch)
                          }
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
                        <span className="w-10 shrink-0 text-[11px] font-semibold text-primary">
                          {oralScanRoleLabel(scan.role)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs text-foreground">
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

            {hasScanColor ? (
              <label className="flex items-center justify-between gap-3 text-xs font-medium">
                칼라 매핑
                <Switch
                  checked={colorMapping}
                  onCheckedChange={setColorMapping}
                  aria-label="칼라 매핑"
                  className="h-5 w-9 data-[state=checked]:bg-primary [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4"
                />
              </label>
            ) : null}

            {hasGhost ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span>대합·바이트</span>
                  <span className="tabular-nums text-muted-foreground">
                    {Math.round(ghostOpacity * 100)}%
                  </span>
                </div>
                <Slider
                  min={10}
                  max={100}
                  step={5}
                  value={[Math.round(ghostOpacity * 100)]}
                  onValueChange={([value]) => {
                    setGhostOpacity((value ?? 30) / 100);
                  }}
                  aria-label="대합·바이트 불투명도"
                />
              </div>
            ) : null}

            {loadError ? (
              <p className="text-xs leading-relaxed text-destructive">{loadError}</p>
            ) : null}

            <section className="space-y-2">
              <p className="text-xs font-semibold text-foreground">단계</p>
              <div className="grid grid-cols-3 gap-1">
                {DESIGN_STAGES.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    size="sm"
                    variant={stage === item.id ? "default" : "outline"}
                    className="h-7 px-2 text-[11px]"
                    onClick={() => onStage(item.id)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </section>

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
                      setUndercutMap(true);
                      viewerRef.current?.setView("occlusal");
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
                  삽입 방향으로 걸리는 면을 붉게 표시합니다.
                  <br />
                  주문 치아의 악을 기준으로 지대치를 봅니다.
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
            <div className="shrink-0 border-t p-3">
              <Button
                type="button"
                className="h-9 w-full"
                disabled={busy || generating || meshSources.length === 0 || !canUndercut}
                onClick={() => void runGenerate(generateTargets)}
              >
                {generating ? "생성 중…" : "생성"}
              </Button>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                생성하면 언더컷과 교합 접촉을 계산해 칠합니다.
                <br />
                치아 정보에서 치아마다 다시 돌릴 수 있습니다.
              </p>
            </div>
          </aside>
          <div className="relative min-w-0 flex-1">
            <OralScanOverlayViewer
              ref={viewerRef}
              items={entries}
              visible={visible}
              colorMapping={colorMapping}
              ghostOpacity={ghostOpacity}
              prepArch={prepArch}
              focusToothNumbers={focusToothNumbers}
              contactMap={contactMap}
              undercutMap={undercutMap}
              occlusalGapMm={occlusalGap}
              contactMode={contactMode}
              undercutLimit={undercutLimit}
              busy={busy}
              busyLabel={busy ? `스캔을 불러오는 중 ${progress}%` : ""}
              onScanColorChange={setHasScanColor}
              className="absolute inset-0"
            />
            <DesignViewerChrome
              teeth={plan.teeth}
              activeTooth={activeTooth}
              generated={generated}
              generating={generating}
              genLabel={genLabel}
              toothInfoOpen={toothInfoOpen}
              contactMap={contactMap}
              undercutMap={undercutMap}
              canContact={canContact}
              canUndercut={canUndercut}
              onSelectTooth={setSelectedTooth}
              onToggleInfo={() => setToothInfoOpen((open) => !open)}
              onToggleContact={() => {
                if (!canContact) return;
                setContactMap((on) => !on);
                setStage("design");
              }}
              onToggleUndercut={() => {
                if (!canUndercut) return;
                setUndercutMap((on) => !on);
                setStage("margin");
              }}
              onView={(preset) => viewerRef.current?.setView(preset)}
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

function DesignViewerChrome({
  teeth,
  activeTooth,
  generated,
  generating,
  genLabel,
  toothInfoOpen,
  contactMap,
  undercutMap,
  canContact,
  canUndercut,
  onSelectTooth,
  onToggleInfo,
  onToggleContact,
  onToggleUndercut,
  onView,
  onGenerateTooth,
  onClearTooth,
}: {
  teeth: LabProsthesisAiTooth[];
  activeTooth: LabProsthesisAiTooth | null;
  generated: Record<string, boolean>;
  generating: boolean;
  genLabel: string;
  toothInfoOpen: boolean;
  contactMap: boolean;
  undercutMap: boolean;
  canContact: boolean;
  canUndercut: boolean;
  onSelectTooth: (toothNumber: string) => void;
  onToggleInfo: () => void;
  onToggleContact: () => void;
  onToggleUndercut: () => void;
  onView: (preset: OralScanViewPreset) => void;
  onGenerateTooth: (toothNumber: string) => void;
  onClearTooth: (toothNumber: string) => void;
}) {
  return (
    <>
      <style>
        {`@keyframes aiScanLine { 0% { transform: translateY(0); opacity: .25; } 50% { opacity: 1; } 100% { transform: translateY(58vh); opacity: .2; } }`}
      </style>
      {teeth.length > 0 ? (
        <div className="absolute left-1/2 top-3 z-10 flex max-w-[46%] -translate-x-1/2 flex-wrap justify-center gap-1">
          {teeth.map((tooth, index) => {
            const selected = activeTooth?.toothNumber === tooth.toothNumber;
            return (
              <button
                key={`${tooth.toothNumber}-${index}`}
                type="button"
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-semibold shadow-sm",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-background/95 text-foreground",
                )}
                onClick={() => onSelectTooth(tooth.toothNumber)}
              >
                {tooth.toothNumber}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1">
        <Button
          type="button"
          size="sm"
          variant={contactMap ? "default" : "secondary"}
          className="h-8 w-8 px-0 shadow-sm"
          title={canContact ? "교합 접촉" : "대합 스캔이 없습니다"}
          aria-label="교합 접촉"
          disabled={!canContact}
          onClick={onToggleContact}
        >
          <Palette className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant={undercutMap ? "default" : "secondary"}
          className="h-8 w-8 px-0 shadow-sm"
          title={canUndercut ? "언더컷" : "주문 치아의 악을 알 수 없습니다"}
          aria-label="언더컷"
          disabled={!canUndercut}
          onClick={onToggleUndercut}
        >
          <TriangleAlert className="h-3.5 w-3.5" />
        </Button>
        {DESIGN_VIEWS.map((view) => (
          <Button
            key={view.id}
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 px-2 text-[11px] shadow-sm"
            onClick={() => onView(view.id)}
          >
            {view.label}
          </Button>
        ))}
      </div>

      {toothInfoOpen && teeth.length > 0 ? (
        <div className="absolute right-14 top-3 z-10 w-56 rounded-lg border bg-background/95 p-2 text-xs shadow-sm">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="font-semibold text-foreground">치아 정보</p>
            <button
              type="button"
              className="text-[11px] text-muted-foreground"
              onClick={onToggleInfo}
            >
              닫기
            </button>
          </div>
          <ul className="max-h-52 space-y-1 overflow-y-auto">
            {teeth.map((tooth, index) => {
              const selected = activeTooth?.toothNumber === tooth.toothNumber;
              const done = generated[tooth.toothNumber] === true;
              return (
                <li key={`${tooth.toothNumber}-${tooth.prosthesisType}-${index}`}>
                  <div
                    className={cn(
                      "flex items-center gap-1 rounded-md px-1.5 py-1",
                      selected ? "bg-primary/10" : "hover:bg-muted",
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => onSelectTooth(tooth.toothNumber)}
                    >
                      <span className="font-semibold">#{tooth.toothNumber}</span>
                      <span className="ml-1.5 text-muted-foreground">
                        {tooth.prosthesisType}
                      </span>
                      {tooth.linkedTeeth.length > 0 ? (
                        <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Link2 className="h-3 w-3 shrink-0" />
                          {tooth.linkedTeeth.join(" · ")}
                        </span>
                      ) : null}
                    </button>
                    {done ? (
                      <button
                        type="button"
                        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
                        onClick={() => onClearTooth(tooth.toothNumber)}
                      >
                        삭제
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground disabled:opacity-50"
                        disabled={generating || !tooth.designable}
                        onClick={() => onGenerateTooth(tooth.toothNumber)}
                      >
                        생성
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : teeth.length > 0 ? (
        <button
          type="button"
          className="absolute right-14 top-3 z-10 rounded-md border bg-background/95 px-2 py-1 text-[11px] font-medium shadow-sm"
          onClick={onToggleInfo}
        >
          치아 정보
        </button>
      ) : null}

      {contactMap || undercutMap ? (
        <div className="pointer-events-none absolute bottom-14 left-3 z-10 flex items-center gap-2 rounded-md bg-background/95 px-2 py-1 text-[10px] text-muted-foreground shadow-sm">
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
        </div>
      ) : null}

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

      {activeTooth ? (
        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 px-3 py-1 shadow-sm">
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
