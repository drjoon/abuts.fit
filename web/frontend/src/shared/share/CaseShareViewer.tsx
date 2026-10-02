// related files:
// - web/frontend/src/shared/share/CaseLayerViewer.tsx
// - web/frontend/src/shared/share/caseShareTypes.ts
// - web/frontend/src/pages/public/CaseSharePage.tsx
// - web/frontend/src/pages/practice/PracticeTransferCaseViewPage.tsx
// - web/frontend/src/shared/components/PreviewAnnotateActions.tsx
// - web/frontend/src/shared/components/WorkScanModelPreviewDialog.tsx
// - 2026-10-03: 의뢰 차수 묶음·전체 선로드 후 보이기만 전환·페인트·칼라 매핑(작업열기 프리뷰와 같음).
// - 2026-09-28: 케이스 3D 공유 화면 — 왼쪽 뷰어, 오른쪽 케이스·파일 묶음(눈 아이콘으로 켜고 끔).
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronDown, Eye, EyeOff, Loader2, Maximize2 } from "lucide-react";
import { AbutsLogo } from "@/components/branding/AbutsLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";
import {
  formatKstDateTimeToKo,
  formatKstYmdToKo,
  toKstYmd,
} from "@/shared/date/kst";
import {
  fileFromImageBlob,
  fileFromModelBlob,
  getModelExtLower,
  peekPlyHeaderInfo,
  resolveCompanionTextureFileName,
} from "@/shared/files/modelPreviewFile";
import {
  PreviewColorMappingToggle,
  PreviewPaintControls,
  PreviewPaintLayer,
  usePreviewPaint,
} from "@/shared/components/PreviewAnnotateActions";
import {
  VIEW_GESTURE_HINT_LAYER_CLASS,
  ViewGestureHint,
} from "@/shared/components/ViewGestureHint";
import type { ViewPaintSpace } from "@/shared/components/practice/viewPaintSpace";
import {
  CaseLayerViewer,
  type CaseLayerModel,
  type CaseLayerTone,
  type CaseLayerViewerHandle,
} from "@/shared/share/CaseLayerViewer";
import {
  preferWorkingOralScanFiles,
  resolveOralScanRole,
} from "@/shared/practice/labProsthesisAiDesign";
import {
  caseCompanionFiles,
  caseRequestWaveGroupIds,
  caseShareTitle,
  groupCaseLayers,
  type CaseLayerGroup,
  type CaseShareFile,
  type CaseShareView,
} from "@/shared/share/caseShareTypes";

export type CaseShareFileLoader = (
  file: CaseShareFile,
  onProgress?: (percent: number) => void,
) => Promise<Blob>;

type LoadState =
  | { status: "loading"; progress: number }
  | { status: "ready" }
  | { status: "error"; message: string };

type LoadedModel = { file: File; companionFiles: File[] };

type CaseShareViewerProps = {
  view: CaseShareView;
  loadFile: CaseShareFileLoader;
  /** 패널 상단 오른쪽(공유·의뢰 열기 등) */
  headerActions?: ReactNode;
  /** 패널 맨 아래(유효 기간 등) */
  footer?: ReactNode;
};

function layerTone(file: CaseShareFile): CaseLayerTone {
  if (file.group === "scan") return "scan";
  return file.kind === "abutment" ? "abutment" : "prosthesis";
}

function initialVisibility(groups: CaseLayerGroup[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const group of groups) {
    for (const item of group.items)
      out[item.file.fileKey] = item.defaultVisible;
  }
  return out;
}

function initialCollapsed(groups: CaseLayerGroup[]): Record<string, boolean> {
  const waves = caseRequestWaveGroupIds(groups);
  const latest = waves[0];
  const out: Record<string, boolean> = {};
  for (const group of groups) {
    if (group.isRequestWave && group.id !== latest) out[group.id] = true;
  }
  return out;
}

/** 고른 의뢰만 켜고, 다른 의뢰 스캔은 끈다. 디자인은 그대로. 작업 스캔이 있으면 그쪽 상·하악만. */
function visibilityForRequestWave(
  groups: CaseLayerGroup[],
  waveId: string,
): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const group of groups) {
    if (!group.isRequestWave) {
      for (const item of group.items)
        next[item.file.fileKey] = item.defaultVisible;
      continue;
    }
    const on = group.id === waveId;
    if (!on) {
      for (const item of group.items) next[item.file.fileKey] = false;
      continue;
    }
    // 이 의뢰 안의 상·하악만 기본으로 켠다(작업 DCM 우선). 바이트는 끈다.
    const preferred = new Set(
      preferWorkingOralScanFiles(
        group.items.map((item) => ({
          fileKey: item.file.fileKey,
          fileName: item.file.fileName,
          scanRole: item.file.scanRole,
          uploadedAt: item.file.uploadedAt,
        })),
      ).map((f) => f.fileKey),
    );
    let anyJaw = false;
    for (const item of group.items) {
      const role = resolveOralScanRole({
        fileName: item.file.fileName,
        scanRole: item.file.scanRole,
      });
      const show =
        (role === "upper" || role === "lower") &&
        preferred.has(item.file.fileKey);
      next[item.file.fileKey] = show;
      if (show) anyJaw = true;
    }
    if (!anyJaw) {
      for (const item of group.items) {
        if (preferred.has(item.file.fileKey)) next[item.file.fileKey] = true;
      }
    }
  }
  return next;
}

function EyeToggle({
  on,
  onClick,
  label,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted disabled:opacity-40",
        on ? "text-primary" : "text-muted-foreground/60",
      )}
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      title={label}
      disabled={disabled}
    >
      {on ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
    </button>
  );
}

export function CaseShareViewer({
  view,
  loadFile,
  headerActions,
  footer,
}: CaseShareViewerProps) {
  const viewerRef = useRef<CaseLayerViewerHandle | null>(null);
  const groups = useMemo(() => groupCaseLayers(view.files), [view.files]);
  const companions = useMemo(
    () => caseCompanionFiles(view.files),
    [view.files],
  );
  const viewKey = useMemo(
    () => `${view.transferId}:${view.files.map((f) => f.fileKey).join("|")}`,
    [view.files, view.transferId],
  );
  const [visible, setVisible] = useState<Record<string, boolean>>(() =>
    initialVisibility(groups),
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    initialCollapsed(groups),
  );
  const [activeWaveId, setActiveWaveId] = useState<string | null>(
    () => caseRequestWaveGroupIds(groups)[0] ?? null,
  );
  const [loadState, setLoadState] = useState<Record<string, LoadState>>({});
  const [loaded, setLoaded] = useState<Record<string, LoadedModel>>({});
  const [colorMapping, setColorMapping] = useState(true);
  const [paintSpace, setPaintSpace] = useState<ViewPaintSpace | null>(null);
  const paint = usePreviewPaint({
    open: true,
    resetKey: viewKey,
    initiallyOn: false,
  });
  const startedRef = useRef(new Set<string>());
  const loadFileRef = useRef(loadFile);
  loadFileRef.current = loadFile;

  useEffect(() => {
    const waves = caseRequestWaveGroupIds(groups);
    const latest = waves[0] ?? null;
    setVisible(initialVisibility(groups));
    setCollapsed(initialCollapsed(groups));
    setActiveWaveId(latest);
    setColorMapping(true);
    setLoaded({});
    setLoadState({});
    startedRef.current = new Set();
  }, [groups, viewKey]);

  const loadCompanions = useCallback(
    async (model: CaseShareFile, blob: Blob): Promise<File[]> => {
      if (companions.length === 0) return [];
      const ext = getModelExtLower(model.fileName);
      if (ext !== ".ply" && ext !== ".obj") return [];
      const preferred =
        ext === ".ply"
          ? peekPlyHeaderInfo(await blob.arrayBuffer()).textureFileName
          : null;
      const textureName = resolveCompanionTextureFileName(
        model.fileName,
        preferred,
        companions.map((c) => c.fileName),
      );
      const picks = companions.filter(
        (c) =>
          c.fileName === textureName ||
          (ext === ".obj" && /\.mtl$/i.test(c.fileName)),
      );
      const files = await Promise.all(
        picks.map(async (c) => {
          try {
            const b = await loadFileRef.current(c);
            return /\.mtl$/i.test(c.fileName)
              ? new File([b], c.fileName, { type: "text/plain" })
              : fileFromImageBlob(b, c.fileName);
          } catch {
            return null;
          }
        }),
      );
      return files.filter((f): f is File => Boolean(f));
    },
    [companions],
  );

  const ensureLoaded = useCallback(
    (file: CaseShareFile) => {
      if (startedRef.current.has(file.fileKey)) return;
      startedRef.current.add(file.fileKey);
      setLoadState((prev) => ({
        ...prev,
        [file.fileKey]: { status: "loading", progress: 0 },
      }));
      void (async () => {
        try {
          const blob = await loadFileRef.current(file, (percent) =>
            setLoadState((prev) =>
              prev[file.fileKey]?.status === "loading"
                ? {
                    ...prev,
                    [file.fileKey]: { status: "loading", progress: percent },
                  }
                : prev,
            ),
          );
          const companionFiles = await loadCompanions(file, blob);
          setLoaded((prev) => ({
            ...prev,
            [file.fileKey]: {
              file: fileFromModelBlob(blob, file.fileName),
              companionFiles,
            },
          }));
          setLoadState((prev) => ({
            ...prev,
            [file.fileKey]: { status: "ready" },
          }));
        } catch (error) {
          startedRef.current.delete(file.fileKey);
          setLoadState((prev) => ({
            ...prev,
            [file.fileKey]: {
              status: "error",
              message:
                error instanceof Error ? error.message : "불러오지 못했습니다.",
            },
          }));
        }
      })();
    },
    [loadCompanions],
  );

  // 작업열기 날짜 전환과 같다: 전부 받아 두고, 의뢰 전환은 보이기만 바꾼다.
  // 지금 보이는 파일을 먼저 시작한다.
  useEffect(() => {
    const all = groups.flatMap((group) => group.items);
    for (const item of all) {
      if (visible[item.file.fileKey]) ensureLoaded(item.file);
    }
    for (const item of all) ensureLoaded(item.file);
  }, [ensureLoaded, groups, visible]);

  const layers = useMemo<CaseLayerModel[]>(() => {
    const out: CaseLayerModel[] = [];
    for (const group of groups) {
      for (const item of group.items) {
        const model = loaded[item.file.fileKey];
        if (!model) continue;
        out.push({
          id: item.file.fileKey,
          file: model.file,
          companionFiles: model.companionFiles,
          tone: layerTone(item.file),
          visible: Boolean(visible[item.file.fileKey]),
        });
      }
    }
    return out;
  }, [groups, loaded, visible]);

  const allKeys = useMemo(
    () => groups.flatMap((g) => g.items.map((i) => i.file.fileKey)),
    [groups],
  );
  const anyVisible = allKeys.some((key) => visible[key]);
  const setMany = (keys: string[], on: boolean) =>
    setVisible((prev) => {
      const next = { ...prev };
      for (const key of keys) next[key] = on;
      return next;
    });

  const selectRequestWave = (waveId: string) => {
    setActiveWaveId(waveId);
    setCollapsed((prev) => {
      const next = { ...prev };
      for (const group of groups) {
        if (!group.isRequestWave) continue;
        next[group.id] = group.id !== waveId;
      }
      return next;
    });
    setVisible(visibilityForRequestWave(groups, waveId));
  };

  const toggleGroupVisibility = (group: CaseLayerGroup) => {
    const keys = group.items.map((i) => i.file.fileKey);
    const groupOn = keys.some((key) => visible[key]);
    if (group.isRequestWave) {
      if (groupOn && activeWaveId === group.id) {
        setMany(keys, false);
        return;
      }
      selectRequestWave(group.id);
      return;
    }
    setMany(keys, !groupOn);
  };

  const title = caseShareTitle(view);
  const pendingCount = Object.values(loadState).filter(
    (s) => s.status === "loading",
  ).length;
  const canAnnotate = layers.some((layer) => layer.visible);

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-background md:flex-row">
      <div className="relative min-h-[55dvh] min-w-0 flex-1 md:min-h-0">
        <CaseLayerViewer
          ref={viewerRef}
          layers={layers}
          colorMapping={colorMapping}
          onPaintSpace={setPaintSpace}
          onLayerError={(id, message) =>
            setLoadState((prev) => ({
              ...prev,
              [id]: { status: "error", message },
            }))
          }
        />
        {groups.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            볼 수 있는 3D 파일이 없습니다.
          </div>
        ) : null}
        <div className="absolute left-3 top-3 z-20 flex flex-col items-start gap-2">
          {layers.length > 0 ? (
            <PreviewColorMappingToggle
              checked={colorMapping}
              onCheckedChange={setColorMapping}
              className="static h-8 py-0 text-xs sm:text-xs"
            />
          ) : null}
          <PreviewPaintControls
            paint={paint}
            disabled={!canAnnotate}
            className="bg-white/95 text-xs shadow-sm"
          />
        </div>
        {pendingCount > 0 ? (
          <div className="pointer-events-none absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/55 px-3 py-1 text-xs text-white">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            3D 파일 {pendingCount}개 불러오는 중
          </div>
        ) : null}
        {canAnnotate ? (
          <PreviewPaintLayer
            paint={paint}
            surfaceKey={viewKey}
            captureCanvas={() => viewerRef.current?.captureCanvas() ?? null}
            fileName={title}
            space={paintSpace}
          />
        ) : null}
        <div className={VIEW_GESTURE_HINT_LAYER_CLASS}>
          <ViewGestureHint storageKey="abuts.viewGestureHint.caseShare.v1.dismissed" />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="absolute bottom-4 left-4 z-20 h-8 gap-1.5 bg-white/95 px-2.5 text-xs shadow-sm"
          onClick={() => viewerRef.current?.fitToView()}
        >
          <Maximize2 className="h-3.5 w-3.5" />
          뷰리셋
        </Button>
        <AbutsLogo
          variant="light"
          className="pointer-events-none absolute bottom-4 right-4 z-10 opacity-80"
          iconClassName="h-7 w-7"
          wordmarkClassName="text-base"
        />
      </div>

      <aside className="flex max-h-[45dvh] w-full shrink-0 flex-col border-t bg-card md:max-h-none md:w-[22rem] md:border-l md:border-t-0">
        <div className="border-b bg-muted/50 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">
              케이스
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              {headerActions}
            </div>
          </div>
          <p className="mt-1 truncate text-sm font-medium" title={title}>
            {title}
          </p>
          {view.teeth.some((t) => t.prosthesisType) ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {view.teeth
                .map((t) =>
                  [t.tooth, t.prosthesisType].filter(Boolean).join(" "),
                )
                .join(" · ")}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
          <p className="text-xs font-semibold text-muted-foreground">파일</p>
          <EyeToggle
            on={anyVisible}
            label={anyVisible ? "모두 숨기기" : "모두 보기"}
            onClick={() => setMany(allKeys, !anyVisible)}
            disabled={allKeys.length === 0}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
          {groups.map((group) => {
            const keys = group.items.map((i) => i.file.fileKey);
            const groupOn = keys.some((key) => visible[key]);
            const isCollapsed = Boolean(collapsed[group.id]);
            const isActiveWave =
              group.isRequestWave && group.id === activeWaveId;
            return (
              <section
                key={group.id}
                className={cn(
                  "mb-1 rounded-lg border last:mb-0",
                  isActiveWave
                    ? "border-primary/40 bg-primary-soft/40"
                    : "border-transparent",
                )}
              >
                <div className="flex items-center gap-1 px-1 py-1">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm font-semibold hover:bg-muted/60"
                    onClick={() => {
                      if (group.isRequestWave && !isActiveWave) {
                        selectRequestWave(group.id);
                        return;
                      }
                      setCollapsed((prev) => ({
                        ...prev,
                        [group.id]: !isCollapsed,
                      }));
                    }}
                    aria-expanded={!isCollapsed}
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform",
                        isCollapsed && "-rotate-90",
                      )}
                    />
                    <span className="min-w-0 truncate">{group.label}</span>
                    {group.isRequestWave && group.uploadedAtMs > 0 ? (
                      <span className="ml-auto shrink-0 text-[0.6875rem] font-normal text-muted-foreground">
                        {formatKstYmdToKo(
                          toKstYmd(new Date(group.uploadedAtMs)),
                        )}
                      </span>
                    ) : null}
                  </button>
                  <EyeToggle
                    on={groupOn}
                    label={
                      group.isRequestWave
                        ? groupOn
                          ? `${group.label} 숨기기`
                          : `${group.label} 보기`
                        : groupOn
                          ? `${group.label} 숨기기`
                          : `${group.label} 보기`
                    }
                    onClick={() => toggleGroupVisibility(group)}
                  />
                </div>
                {!isCollapsed ? (
                  <ul className="flex flex-col gap-2 px-2 pb-2">
                    {[
                      {
                        work: false,
                        items: group.items.filter(
                          (i) => i.badge !== "작업 스캔",
                        ),
                      },
                      {
                        work: true,
                        items: group.items.filter(
                          (i) => i.badge === "작업 스캔",
                        ),
                      },
                    ]
                      .filter((cluster) => cluster.items.length > 0)
                      .map((cluster) => (
                        <li
                          key={cluster.work ? "work" : "request"}
                          className={cn(
                            "flex flex-col gap-1",
                            cluster.work ? "items-end" : "items-start",
                          )}
                        >
                          {(() => {
                            const clusterKeys = cluster.items.map(
                              (i) => i.file.fileKey,
                            );
                            const clusterOn = clusterKeys.some(
                              (k) => visible[k],
                            );
                            const clusterLabel = cluster.work
                              ? "작업 파일"
                              : group.isRequestWave
                                ? `${group.label} 파일`
                                : "의뢰 파일";
                            return (
                              <div className="flex w-full items-center justify-between gap-2 pl-1">
                                <p className="text-xs font-semibold text-muted-foreground">
                                  {clusterLabel}
                                </p>
                                <EyeToggle
                                  on={clusterOn}
                                  label={`${clusterLabel} ${clusterOn ? "숨기기" : "보기"}`}
                                  onClick={() => {
                                    if (
                                      group.isRequestWave &&
                                      !clusterOn &&
                                      activeWaveId !== group.id
                                    ) {
                                      selectRequestWave(group.id);
                                      setVisible({
                                        ...visibilityForRequestWave(
                                          groups,
                                          group.id,
                                        ),
                                        ...Object.fromEntries(
                                          clusterKeys.map((k) => [k, true]),
                                        ),
                                      });
                                      return;
                                    }
                                    setMany(clusterKeys, !clusterOn);
                                  }}
                                />
                              </div>
                            );
                          })()}
                          <ul
                            className={cn(
                              "flex flex-col divide-y rounded-2xl border px-3 py-0.5",
                              cluster.work ? "w-full" : "w-[92%]",
                              cluster.work
                                ? "rounded-tr-sm border-primary/30 bg-primary-soft divide-primary/15"
                                : "rounded-tl-sm bg-muted/60",
                            )}
                          >
                            {cluster.items.map((item) => {
                              const key = item.file.fileKey;
                              const state = loadState[key];
                              return (
                                <li
                                  key={key}
                                  className="flex items-center gap-2 py-1.5"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p
                                      className="truncate text-[0.8125rem]"
                                      title={item.file.fileName}
                                    >
                                      {item.file.fileName}
                                    </p>
                                    {state?.status === "error" ? (
                                      <p
                                        className="truncate text-xs text-destructive"
                                        title={state.message}
                                      >
                                        {state.message}
                                      </p>
                                    ) : item.file.uploadedAt ? (
                                      <p className="text-xs text-muted-foreground">
                                        {formatKstDateTimeToKo(
                                          item.file.uploadedAt,
                                        )}
                                      </p>
                                    ) : null}
                                  </div>
                                  {state?.status === "loading" ? (
                                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      {Math.round(state.progress)}%
                                    </span>
                                  ) : item.badge === "스캔" ||
                                    item.badge === "작업 스캔" ? null : (
                                    <span className="shrink-0 whitespace-nowrap rounded bg-white/80 px-1.5 py-0.5 text-[0.6875rem] font-medium text-primary-strong">
                                      {item.badge}
                                    </span>
                                  )}
                                  <EyeToggle
                                    on={Boolean(visible[key])}
                                    label={visible[key] ? "숨기기" : "보기"}
                                    onClick={() => {
                                      if (
                                        group.isRequestWave &&
                                        !visible[key] &&
                                        activeWaveId !== group.id
                                      ) {
                                        selectRequestWave(group.id);
                                        setVisible({
                                          ...visibilityForRequestWave(
                                            groups,
                                            group.id,
                                          ),
                                          [key]: true,
                                        });
                                        return;
                                      }
                                      setMany([key], !visible[key]);
                                    }}
                                  />
                                </li>
                              );
                            })}
                          </ul>
                        </li>
                      ))}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>

        {footer ? (
          <div className="border-t bg-muted/30 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
            {footer}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
