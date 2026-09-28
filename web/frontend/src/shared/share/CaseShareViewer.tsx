// related files:
// - web/frontend/src/shared/share/CaseLayerViewer.tsx
// - web/frontend/src/shared/share/caseShareTypes.ts
// - web/frontend/src/pages/public/CaseSharePage.tsx
// - web/frontend/src/pages/practice/PracticeTransferCaseViewPage.tsx
// - 2026-09-28: 케이스 3D 공유 화면 — 왼쪽 뷰어, 오른쪽 케이스·파일 묶음(눈 아이콘으로 켜고 끔).
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Eye, EyeOff, Loader2, Maximize2 } from "lucide-react";
import { AbutsLogo } from "@/components/branding/AbutsLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";
import { formatKstDateTimeToKo } from "@/shared/date/kst";
import {
  fileFromImageBlob,
  fileFromModelBlob,
  getModelExtLower,
  peekPlyHeaderInfo,
  resolveCompanionTextureFileName,
} from "@/shared/files/modelPreviewFile";
import {
  CaseLayerViewer,
  type CaseLayerModel,
  type CaseLayerTone,
  type CaseLayerViewerHandle,
} from "@/shared/share/CaseLayerViewer";
import {
  caseCompanionFiles,
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
    for (const item of group.items) out[item.file.fileKey] = item.defaultVisible;
  }
  return out;
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
  const companions = useMemo(() => caseCompanionFiles(view.files), [view.files]);
  const [visible, setVisible] = useState<Record<string, boolean>>(() =>
    initialVisibility(groups),
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [loadState, setLoadState] = useState<Record<string, LoadState>>({});
  const [loaded, setLoaded] = useState<Record<string, LoadedModel>>({});
  const startedRef = useRef(new Set<string>());
  const loadFileRef = useRef(loadFile);
  loadFileRef.current = loadFile;

  useEffect(() => {
    setVisible((prev) => ({ ...initialVisibility(groups), ...prev }));
  }, [groups]);

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
                ? { ...prev, [file.fileKey]: { status: "loading", progress: percent } }
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
          setLoadState((prev) => ({ ...prev, [file.fileKey]: { status: "ready" } }));
        } catch (error) {
          startedRef.current.delete(file.fileKey);
          setLoadState((prev) => ({
            ...prev,
            [file.fileKey]: {
              status: "error",
              message: error instanceof Error ? error.message : "불러오지 못했습니다.",
            },
          }));
        }
      })();
    },
    [loadCompanions],
  );

  useEffect(() => {
    for (const group of groups) {
      for (const item of group.items) {
        if (visible[item.file.fileKey]) ensureLoaded(item.file);
      }
    }
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

  const title = caseShareTitle(view);
  const pendingCount = Object.values(loadState).filter((s) => s.status === "loading").length;

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-background md:flex-row">
      <div className="relative min-h-[55dvh] min-w-0 flex-1 md:min-h-0">
        <CaseLayerViewer
          ref={viewerRef}
          layers={layers}
          onLayerError={(id, message) =>
            setLoadState((prev) => ({ ...prev, [id]: { status: "error", message } }))
          }
        />
        {groups.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            볼 수 있는 3D 파일이 없습니다.
          </div>
        ) : null}
        {pendingCount > 0 ? (
          <div className="pointer-events-none absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/55 px-3 py-1 text-xs text-white">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            3D 파일 {pendingCount}개 불러오는 중
          </div>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="absolute bottom-4 left-4 h-8 gap-1.5 bg-white/90 shadow-sm"
          onClick={() => viewerRef.current?.fitToView()}
        >
          <Maximize2 className="h-3.5 w-3.5" />
          화면 맞춤
        </Button>
        <AbutsLogo
          variant="light"
          className="pointer-events-none absolute bottom-4 right-4 opacity-80"
          iconClassName="h-7 w-7"
          wordmarkClassName="text-base"
        />
      </div>

      <aside className="flex max-h-[45dvh] w-full shrink-0 flex-col border-t bg-card md:max-h-none md:w-[22rem] md:border-l md:border-t-0">
        <div className="border-b bg-muted/50 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">케이스</p>
            {headerActions ? (
              <div className="flex shrink-0 items-center gap-1.5">{headerActions}</div>
            ) : null}
          </div>
          <p className="mt-1 truncate text-sm font-medium" title={title}>
            {title}
          </p>
          {view.teeth.some((t) => t.prosthesisType) ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {view.teeth
                .map((t) => [t.tooth, t.prosthesisType].filter(Boolean).join(" "))
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

        <div className="min-h-0 flex-1 overflow-y-auto">
          {groups.map((group) => {
            const keys = group.items.map((i) => i.file.fileKey);
            const groupOn = keys.some((key) => visible[key]);
            const isCollapsed = Boolean(collapsed[group.id]);
            return (
              <section key={group.id} className="border-b last:border-b-0">
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm font-semibold hover:bg-muted/60"
                    onClick={() =>
                      setCollapsed((prev) => ({ ...prev, [group.id]: !isCollapsed }))
                    }
                    aria-expanded={!isCollapsed}
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform",
                        isCollapsed && "-rotate-90",
                      )}
                    />
                    {group.label}
                  </button>
                  <EyeToggle
                    on={groupOn}
                    label={groupOn ? `${group.label} 숨기기` : `${group.label} 보기`}
                    onClick={() => setMany(keys, !groupOn)}
                  />
                </div>
                {!isCollapsed ? (
                  <ul className="pb-1.5">
                    {group.items.map((item) => {
                      const key = item.file.fileKey;
                      const state = loadState[key];
                      return (
                        <li key={key} className="flex items-center gap-2 py-1.5 pl-9 pr-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[0.8125rem]" title={item.file.fileName}>
                              {item.file.fileName}
                            </p>
                            {state?.status === "error" ? (
                              <p className="truncate text-xs text-destructive" title={state.message}>
                                {state.message}
                              </p>
                            ) : item.file.uploadedAt ? (
                              <p className="text-xs text-muted-foreground">
                                {formatKstDateTimeToKo(item.file.uploadedAt)}
                              </p>
                            ) : null}
                          </div>
                          {state?.status === "loading" ? (
                            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              {Math.round(state.progress)}%
                            </span>
                          ) : (
                            <span className="shrink-0 whitespace-nowrap rounded bg-primary-soft px-1.5 py-0.5 text-[0.6875rem] font-medium text-primary-strong">
                              {item.badge}
                            </span>
                          )}
                          <EyeToggle
                            on={Boolean(visible[key])}
                            label={visible[key] ? "숨기기" : "보기"}
                            onClick={() => setMany([key], !visible[key])}
                          />
                        </li>
                      );
                    })}
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
