// 기공소 채팅 헤더 — 작업시작 오른쪽 AI.
// - 2026-09-26: 전체 화면 3D — 저장된 바이트 좌표로 스캔을 겹치고, 표시·뷰 큐브·칼라 매핑.
import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  OralScanOverlayViewer,
  type OralScanOverlaySource,
} from "@/shared/components/practice/OralScanOverlayViewer";
import {
  buildLabProsthesisAiPlan,
  isOralScanMeshName,
  oralScanRoleLabel,
  resolveOralScanRole,
  formatProsthesisAiToothLabel,
  type LabOralScanRole,
  type LabProsthesisAiPlan,
} from "@/shared/practice/labProsthesisAiDesign";

type AiDesignFile = {
  fileName?: string | null;
  scanRole?: string | null;
  s3Key?: string | null;
};

type LabProsthesisAiDesignButtonProps = {
  toothWorks?: ReadonlyArray<{
    toothNumber?: string | null;
    prosthesisType?: string | null;
    bridgeLinkedTeeth?: readonly string[] | null;
  }> | null;
  files?: ReadonlyArray<AiDesignFile> | null;
  authToken?: string | null;
  className?: string;
};

type ReadPhase = "reading" | "ready";

type MeshSource = {
  id: string;
  fileName: string;
  role: LabOralScanRole;
};

const IMAGE_EXT = /\.(png|jpe?g|webp|bmp|gif)$/i;
const ROLE_DOT: Record<LabOralScanRole, string> = {
  upper: "bg-blue-500",
  lower: "bg-amber-500",
  bite: "bg-teal-500",
  other: "bg-slate-400",
};

export function LabProsthesisAiDesignButton({
  toothWorks,
  files,
  authToken,
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

  const [phase, setPhase] = useState<ReadPhase>("reading");
  const [entries, setEntries] = useState<OralScanOverlaySource[]>([]);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [colorMapping, setColorMapping] = useState(true);
  const [hasScanColor, setHasScanColor] = useState(false);
  const [biteOpacity, setBiteOpacity] = useState(0.55);
  const [loadError, setLoadError] = useState("");
  const [progress, setProgress] = useState(0);
  const [fileState, setFileState] = useState<
    Record<string, "loading" | "ready" | "error">
  >({});

  useEffect(() => {
    if (!open) {
      setPhase("reading");
      setEntries([]);
      setVisible({});
      setColorMapping(true);
      setHasScanColor(false);
      setBiteOpacity(0.55);
      setLoadError("");
      setProgress(0);
      setFileState({});
      return;
    }

    const timer = window.setTimeout(() => setPhase("ready"), 450);
    const ac = new AbortController();
    const sources = collectMeshSources(filesRef.current);
    const images = collectImageSources(filesRef.current);

    if (sources.length === 0) {
      setEntries([]);
      setLoadError("");
      setProgress(0);
      return () => {
        window.clearTimeout(timer);
        ac.abort();
      };
    }
    if (!authToken) {
      setLoadError("로그인이 필요합니다.");
      return () => window.clearTimeout(timer);
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
      Object.fromEntries(sources.map((row) => [row.id, true])),
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
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [authToken, imageKey, meshKey, open]);

  const busy = meshSources.some((row) => fileState[row.id] === "loading");
  const hasBite = meshSources.some((row) => row.role === "bite");

  const showAll = () => {
    setVisible(Object.fromEntries(meshSources.map((row) => [row.id, true])));
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
      >
        <DialogHeader className="shrink-0 space-y-1 border-b bg-white/95 px-5 py-3 pr-14 text-left">
          <DialogTitle className="text-base sm:text-lg">AI 보철 디자인</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
            저장된 위치 그대로 상악·하악·바이트를 겹쳐 보여 줍니다.
            <br />
            바이트가 같은 좌표에 있으면 추가 정렬 없이 교합이 맞습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="relative min-h-0 flex-1">
          <OralScanOverlayViewer
            items={entries}
            visible={visible}
            colorMapping={colorMapping}
            biteOpacity={biteOpacity}
            busy={busy}
            busyLabel={
              busy ? `스캔을 불러오는 중 ${progress}%` : ""
            }
            onScanColorChange={setHasScanColor}
            className="absolute inset-0"
          />

          <aside className="absolute left-3 top-3 z-10 flex max-h-[calc(100%-5.5rem)] w-[min(18rem,calc(100%-10.5rem))] flex-col gap-3 overflow-y-auto rounded-xl border bg-background/95 p-3 shadow-md">
            <section className="space-y-2">
              <p className="text-xs font-semibold text-foreground">주문 치아</p>
              {plan.teeth.length === 0 ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  주문에 치아번호가 없습니다.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
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
              )}
            </section>

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
                          checked={visible[scan.id] !== false}
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

            {hasBite ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span>바이트 불투명도</span>
                  <span className="tabular-nums text-muted-foreground">
                    {Math.round(biteOpacity * 100)}%
                  </span>
                </div>
                <Slider
                  min={20}
                  max={100}
                  step={5}
                  value={[Math.round(biteOpacity * 100)]}
                  onValueChange={([value]) => {
                    setBiteOpacity((value ?? 55) / 100);
                  }}
                  aria-label="바이트 불투명도"
                />
              </div>
            ) : null}

            {loadError ? (
              <p className="text-xs leading-relaxed text-destructive">{loadError}</p>
            ) : null}

            <section className="rounded-md border bg-slate-50 px-3 py-3 text-xs leading-relaxed text-foreground">
              {phase === "reading" ? (
                <p>업로드 파일을 읽는 중…</p>
              ) : (
                <PlanStatus plan={plan} />
              )}
            </section>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
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

function PlanStatus({ plan }: { plan: LabProsthesisAiPlan }) {
  if (plan.designableTeeth.length === 0) {
    return (
      <p>
        디자인할 크라운·인레이·온레이·브리지 주문이 없습니다.
        <br />
        주문 치아와 보철 형태를 확인해 주세요.
      </p>
    );
  }
  if (plan.missingRoles.length > 0) {
    const missing = plan.missingRoles.map(oralScanRoleLabel).join("·");
    return (
      <p>
        {missing} 스캔이 없습니다.
        <br />
        상악·하악·바이트가 있어야 교합을 맞추고 보철을 디자인합니다.
      </p>
    );
  }
  const targets = plan.designableTeeth
    .map((tooth) => formatProsthesisAiToothLabel(tooth))
    .join(", ");
  return (
    <p>
      스캔 역할을 확인했습니다. {targets}
      <br />
      바이트를 기준으로 상악·하악을 겹치고, 보철이 스캔과 만나는 선을 마진으로 저장합니다.
      <br />
      보철 파일을 올리면 작업이 완료됩니다.
      <br />
      스캔·치아·형태·마진이 학습 데이터로 남습니다.
    </p>
  );
}
