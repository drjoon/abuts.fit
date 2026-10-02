// 관리자 대시보드 — 의뢰에 쌓인 스캔바디·심플 규격 중 공용 형상이 없는 것(임플란트·치과·기공소 수와 함께).
// 치과가 의뢰를 보내면 서버가 쌓은 뒤 scanbody:demand-updated를 보내 바로 다시 센다. 새 규격이 생기면 토스트로도 알린다.
// 카드는 요약만 보이고, 클릭하면 전체 목록 모달(미등록 카드 아래 등록된 라이브러리·템플릿).
// 「압축 파일 올리기」는 .zip만 고른다. 관리 모달은 열지 않는다.
// 제조사(지오메디 등)와 심플 종류는 각각 한 장에 없는 규격을 여러 개 넣고, 「기공소에 요청」은 그 규격을 한 번에 올린다.
// 제조사에 접촉해 받아 등록하는 것이 기본이다. 제조사를 찾을 수 없을 때만 기공소 AI 디자인에 올리기 버튼이 뜬다.
// related files:
// - web/backend/services/scanbodyDemand.service.js
// - web/frontend/src/shared/practice/scanbodyLibraryApi.ts
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Boxes, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/shared/hooks/use-toast";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import {
  TEMPLATE_KINDS,
  fetchScanbodyDemand,
  setScanbodyDemandLabRequest,
  uploadScanbodyFilesAndWait,
  useScanbodyCatalog,
  type AbutmentTemplateRow,
  type ScanbodyDemandRow,
  type ScanbodyLibraryRow,
  type ScanbodyUploadRow,
} from "@/shared/practice/scanbodyLibraryApi";
import {
  groupRegisteredLibraries,
  isPriorityMakerLibrary,
  libraryMatchesMaker,
  splitScanbodyCode,
  type RegisteredLibraryGroup,
} from "@/shared/practice/scanbodyLibraryIdentity";
import { cn } from "@/shared/ui/cn";

const POLL_MS = 60_000;

const kstTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function specBits(
  spec: { diameter: string; height: string; heights: string[] },
  type: ScanbodyDemandRow["type"],
) {
  if (type === "library") return [spec.diameter, spec.height].filter(Boolean).join("/");
  const heights = spec.height ? spec.height : spec.heights.join("·");
  return `${spec.diameter}${heights ? ` (${heights})` : ""}`.trim();
}

function demandKeys(row: ScanbodyDemandRow) {
  return row.keys?.length ? row.keys : [row.key];
}

function cardTitle(row: ScanbodyDemandRow) {
  return row.type === "template" ? `${row.maker} 템플릿` : `${row.maker} 스캔바디 라이브러리`;
}

function specLabel(row: ScanbodyDemandRow) {
  const bits = (row.specs?.length ? row.specs : []).map((spec) => specBits(spec, row.type)).filter(Boolean);
  const noun = row.type === "template" ? "템플릿" : "스캔바디 라이브러리";
  return `${row.maker}${bits.length ? ` ${bits.join(", ")}` : ""} ${noun}`;
}

function implantLabel(row: ScanbodyDemandRow) {
  return row.implants
    .map((implant) => `${[implant.manufacturer, implant.brand].filter(Boolean).join(" ")} ${implant.count}`)
    .join(" · ");
}

function trimMm(value: number) {
  return String(Math.round(value * 100) / 100);
}

function chipSort(a: string, b: string) {
  const da = Number(a.split(/[/(]/)[0]);
  const db = Number(b.split(/[/(]/)[0]);
  if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return da - db;
  return a.localeCompare(b, "ko");
}

function librarySourceLabel(lib: ScanbodyLibraryRow) {
  if (lib.source === "exocad") return "exocad";
  if (lib.source === "scan") return "형상 파일";
  if (lib.source === "generated") return "어벗츠 생성";
  const versions = lib.containerVersions.filter(Boolean).join(", ");
  return versions ? `3Shape ${versions}` : "3Shape";
}

function partSize(lib: ScanbodyLibraryRow, partId: string) {
  const part = lib.parts.find((row) => row.partId === partId);
  if (!part || part.diameterMm == null) return "";
  return part.heightMm != null ? `${trimMm(part.diameterMm)}/${trimMm(part.heightMm)}` : trimMm(part.diameterMm);
}

function kitSpecLabel(lib: ScanbodyLibraryRow, kit: ScanbodyLibraryRow["kits"][number]) {
  if (kit.spec?.trim()) return kit.spec.trim();
  const fromName = splitScanbodyCode(kit.name).spec;
  if (fromName) return fromName;
  const fromCode = splitScanbodyCode(kit.code || "").spec;
  if (fromCode) return fromCode;
  const fromLib = splitScanbodyCode(lib.systemName).spec;
  if (fromLib) return fromLib;
  return kit.name.trim();
}

function groupChipList(group: RegisteredLibraryGroup<ScanbodyLibraryRow>) {
  const rows: Array<{ label: string; size: string }> = [];
  for (const lib of group.libs) {
    const kits = lib.kits.length > 0 ? lib.kits : [{ kitId: lib.id, name: lib.systemName, spec: "", code: "", implantPartId: null, scanAbutmentPartIds: [], screwPartId: null, basePartId: null, blankPartId: null, catalogIds: [] }];
    for (const kit of kits) {
      const size = kit.scanAbutmentPartIds.map((id) => partSize(lib, id)).find(Boolean) || "";
      rows.push({ label: kitSpecLabel(lib, kit), size });
    }
  }
  const sizes = new Set(rows.map((row) => row.size).filter(Boolean));
  const sharedSize = sizes.size === 1 ? [...sizes][0] : "";
  const chips = [
    ...new Set(
      rows
        .map((row) => {
          if (!row.label) return row.size;
          if (!row.size || row.size === sharedSize) return row.label;
          return `${row.label} ${row.size}`;
        })
        .filter(Boolean),
    ),
  ].sort(chipSort);
  return { chips, sharedSize };
}

function templateGroups(rows: readonly AbutmentTemplateRow[]) {
  const buckets = new Map<string, AbutmentTemplateRow[]>();
  for (const row of rows) {
    const bucket = buckets.get(row.kind) ?? [];
    bucket.push(row);
    buckets.set(row.kind, bucket);
  }
  const order = new Map(TEMPLATE_KINDS.map((kind, index) => [kind, index]));
  return [...buckets.entries()]
    .sort((a, b) => (order.get(a[0] as (typeof TEMPLATE_KINDS)[number]) ?? 99) - (order.get(b[0] as (typeof TEMPLATE_KINDS)[number]) ?? 99))
    .map(([kind, specs]) => {
      const sorted = [...specs].sort(
        (a, b) => Number(a.diameter) - Number(b.diameter) || a.height.localeCompare(b.height),
      );
      const chips = [...new Set(sorted.map((row) => (row.height ? `${row.diameter} (${row.height})` : row.diameter)))];
      const latest = sorted.reduce((max, row) => (row.updatedAt > max ? row.updatedAt : max), "");
      const owners = [...new Set(sorted.map((row) => row.ownerName).filter(Boolean))];
      return { kind, chips, count: sorted.length, latest, owners };
    });
}

/** 상태 문구의 `45%`를 진행 막대 값으로 떼고, 문구에서는 뺀다. */
function uploadProgress(text: string): { label: string; percent: number | null } {
  const match = text.match(/(\d+)\s*%/);
  const value = match ? Number(match[1]) : NaN;
  const percent = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;
  return { label: text.replace(/\s*\d+\s*%/, "").trim(), percent };
}

function uploadFailLine(row: ScanbodyUploadRow) {
  const reason = row.message || (row.status === "rejected" ? "거절" : "등록이 끝나지 않았습니다.");
  return `${row.fileName}: ${reason}`;
}

function SpecChips({ chips, tone }: { chips: readonly string[]; tone: "amber" | "slate" }) {
  if (chips.length === 0) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1">
      {chips.map((chip) => (
        <li
          key={chip}
          className={cn(
            "rounded px-1.5 py-0.5 text-[11px] font-medium",
            tone === "amber" ? "bg-amber-50 text-amber-900" : "bg-slate-100 text-slate-700",
          )}
        >
          {chip}
        </li>
      ))}
    </ul>
  );
}

function DemandFrame({
  embedded,
  open,
  onOpenChange,
  children,
}: {
  embedded: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  if (embedded) return <div className="flex min-h-0 flex-col gap-4">{children}</div>;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-6xl">{children}</DialogContent>
    </Dialog>
  );
}
export function ScanbodyDemandCard({
  className,
  embedded = false,
  notifyNew = true,
  queuedZip = null,
  onQueuedZipHandled,
}: {
  className?: string;
  /** 간접어벗 모달 안. 카드·다이얼로그 없이 목록만. */
  embedded?: boolean;
  notifyNew?: boolean;
  queuedZip?: File[] | null;
  onQueuedZipHandled?: () => void;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<ScanbodyDemandRow[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadReport, setUploadReport] = useState<string[]>([]);
  const zipInput = useRef<HTMLInputElement>(null);
  const known = useRef<Set<string> | null>(null);
  const { catalog, loaded: catalogLoaded, reload: reloadCatalog } = useScanbodyCatalog(embedded || listOpen);

  const load = useCallback(async () => {
    try {
      const next = await fetchScanbodyDemand();
      const prev = known.current;
      if (prev && notifyNew) {
        const fresh = next.filter((row) => demandKeys(row).some((key) => !prev.has(key)));
        if (fresh.length > 0) {
          toast({
            title: "라이브러리가 없는 스캔바디 의뢰가 들어왔습니다.",
            description: fresh.slice(0, 3).map(specLabel).join(", "),
          });
        }
      }
      known.current = new Set(next.flatMap(demandKeys));
      setRows(next);
    } catch {
      // 다음 폴링에서 다시 받는다.
    }
  }, [notifyNew, toast]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useAppEventDebouncedReload({
    eventTypes: ["scanbody:demand-updated"],
    delayMs: 800,
    requireVisible: false,
    onMatch: () => load(),
  });

  const toggleLabRequest = async (row: ScanbodyDemandRow) => {
    const requested = !row.labUploadRequested;
    setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, labUploadRequested: requested } : r)));
    try {
      await setScanbodyDemandLabRequest(demandKeys(row), requested);
    } catch (error) {
      setRows((prev) => prev.map((r) => (r.key === row.key ? row : r)));
      toast({
        title: "기공소 요청을 바꾸지 못했습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

  const onZipFiles = async (files: File[]) => {
    const zips = files.filter((file) => /\.zip$/i.test(file.name));
    if (zips.length === 0) {
      toast({ title: "압축 파일(.zip)을 골라 주세요.", variant: "destructive" });
      return;
    }
    setListOpen(true);
    setUploading(true);
    setUploadStatus("압축 파일을 읽는 중…");
    setUploadReport([]);
    try {
      const { rows: uploaded, notes } = await uploadScanbodyFilesAndWait(zips, "", setUploadStatus);
      const failed = uploaded.filter((row) => row.status !== "done");
      const registered = uploaded
        .filter((row) => row.status === "done")
        .reduce((sum, row) => sum + row.libraries.length, 0);
      const report = [
        ...notes,
        ...failed.map(uploadFailLine),
        ...(registered > 0 ? [`라이브러리 ${registered}개를 등록했습니다.`] : []),
        ...(failed.length === 0 && registered === 0 ? ["압축 파일에서 등록된 라이브러리가 없습니다."] : []),
      ];
      setUploadReport(report);
      if (failed.length > 0) {
        toast({
          title: "일부 압축 파일을 등록하지 못했습니다.",
          description: failed.map(uploadFailLine).join(" "),
          variant: "destructive",
        });
      } else if (registered > 0) {
        toast({ title: `라이브러리 ${registered}개를 등록했습니다.` });
      } else if (notes.length > 0) {
        toast({ title: "일부 파일은 올리지 않습니다.", description: notes.join(" ") });
      } else {
        toast({ title: "압축 파일에서 등록된 라이브러리가 없습니다." });
      }
      reloadCatalog();
      void load();
    } catch (error) {
      toast({
        title: "압축 파일을 올리지 못했습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setUploadStatus("");
    }
  };

  const uploadZipRef = useRef(onZipFiles);
  uploadZipRef.current = onZipFiles;
  const handledZip = useRef<File[] | null>(null);
  useEffect(() => {
    if (!queuedZip?.length || handledZip.current === queuedZip) return;
    handledZip.current = queuedZip;
    onQueuedZipHandled?.();
    void uploadZipRef.current(queuedZip);
  }, [onQueuedZipHandled, queuedZip]);

  const transfers = rows.reduce((sum, row) => sum + row.transferCount, 0);
  const hasRows = rows.length > 0;
  const libraries = useMemo(
    () => [...catalog.libraries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [catalog.libraries],
  );
  const libraryGroups = useMemo(() => groupRegisteredLibraries(libraries), [libraries]);
  const attachedGroupKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const row of rows) {
      if (row.type !== "library") continue;
      for (const group of libraryGroups) {
        if (group.libs.some((lib) => libraryMatchesMaker(lib, row.maker))) keys.add(group.key);
      }
    }
    return keys;
  }, [rows, libraryGroups]);
  const looseGroups = useMemo(
    () => libraryGroups.filter((group) => !attachedGroupKeys.has(group.key)),
    [libraryGroups, attachedGroupKeys],
  );
  const templates = useMemo(() => templateGroups(catalog.templates), [catalog.templates]);
  const registeredCount = libraries.length + templates.length;
  const [query, setQuery] = useState("");
  const [showRest, setShowRest] = useState(false);
  const [openAttached, setOpenAttached] = useState<Set<string>>(new Set());
  const { priorityGroups, restGroups } = useMemo(() => {
    const priority: typeof looseGroups = [];
    const rest: typeof looseGroups = [];
    for (const group of looseGroups) {
      (group.libs.some(isPriorityMakerLibrary) ? priority : rest).push(group);
    }
    return { priorityGroups: priority, restGroups: rest };
  }, [looseGroups]);
  const restLibCount = restGroups.reduce((sum, group) => sum + group.libs.length, 0);
  const needle = query.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    if (needle) {
      return looseGroups.filter((group) =>
        [group.title, ...group.libs.flatMap((lib) => [lib.systemName, ...lib.kits.map((kit) => kit.name)])]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      );
    }
    return showRest ? [...priorityGroups, ...restGroups] : priorityGroups;
  }, [needle, looseGroups, priorityGroups, restGroups, showRest]);

  const pickZip = () => zipInput.current?.click();
  const progress = uploadStatus ? uploadProgress(uploadStatus) : null;

  return (
    <>
      <input
        ref={zipInput}
        type="file"
        accept=".zip,application/zip"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          void onZipFiles(files);
        }}
      />
      {embedded ? null : (
      <Card
        className={cn(
          "app-glass-card app-glass-card--lg h-full cursor-pointer transition hover:bg-slate-50/60",
          hasRows && "border-amber-300 bg-amber-50/60 hover:bg-amber-50",
          className,
        )}
        role="button"
        tabIndex={0}
        onClick={() => setListOpen(true)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setListOpen(true);
          }
        }}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">타사 스캔바디</CardTitle>
          <Boxes className={cn("h-4 w-4", hasRows ? "text-amber-600" : "text-muted-foreground")} />
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-end justify-between gap-2">
            <div className={cn("text-2xl font-bold", hasRows && "text-amber-900")}>
              {rows.length.toLocaleString()}
              <span className="ml-1 text-sm font-medium text-muted-foreground">종</span>
            </div>
            <span className="text-xs text-muted-foreground">의뢰 {transfers.toLocaleString()}건</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-full bg-white text-[11px]"
            disabled={uploading}
            onClick={(e) => {
              e.stopPropagation();
              pickZip();
            }}
          >
            {uploading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
            {uploading ? "올리는 중…" : "압축 파일 올리기"}
          </Button>
          {uploadStatus && !listOpen ? <p className="text-[11px] text-muted-foreground">{uploadStatus}</p> : null}
        </CardContent>
      </Card>
      )}

      <DemandFrame embedded={embedded} open={listOpen} onOpenChange={setListOpen}>
          <DialogHeader className={cn(
            "space-y-0",
            embedded
              ? "flex flex-col items-stretch gap-2"
              : "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 pr-8 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
          )}>
            {embedded ? (
              <h3 className="text-sm font-semibold text-slate-900">타사 스캔바디</h3>
            ) : (
              <DialogTitle className="text-base sm:justify-self-start">스캔바디 라이브러리 · 템플릿</DialogTitle>
            )}
            <div className={cn(
              "flex flex-col gap-1.5",
              embedded ? "items-start" : "col-span-2 items-center sm:col-span-1 sm:col-start-2",
            )}>
              <p className={cn("text-xs leading-relaxed text-muted-foreground", !embedded && "text-center")}>
                제조사에 접촉해서 라이브러리를 받아서 올리세요.
                <br />
                제조사를 찾을 수 없는 경우 「기공소에 요청」을 누르면 의뢰받은 기공소가 올립니다.
              </p>
              {progress ? (
                <div className="flex w-full max-w-sm items-center justify-center gap-2">
                  {progress.label ? (
                    <p className="shrink-0 text-xs text-muted-foreground">{progress.label}</p>
                  ) : null}
                  {progress.percent != null ? (
                    <>
                      <Progress value={progress.percent} className="h-1.5 w-28" aria-label="업로드 진행률" />
                      <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                        {progress.percent}%
                      </span>
                    </>
                  ) : null}
                </div>
              ) : null}
              {uploadReport.length > 0 ? (
                <ul className="max-w-md space-y-0.5 text-center text-xs text-slate-700">
                  {uploadReport.map((line, index) => (
                    <li key={`${index}-${line}`}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <Button
              size="sm"
              className={cn("shrink-0", embedded ? "self-start" : "col-start-2 row-start-1 justify-self-end sm:col-start-3")}
              disabled={uploading}
              onClick={pickZip}
            >
              {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
              {uploading ? "올리는 중…" : "압축 파일 올리기"}
            </Button>
          </DialogHeader>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                미등록 {rows.length}종 · 의뢰 {transfers}건
              </h3>
            </div>
            {hasRows ? (
              <ul className={cn("grid grid-cols-1 gap-3", !embedded && "sm:grid-cols-2")}>
                {rows.map((row) => {
                  const specs = row.specs?.length ? row.specs : [];
                  const attached =
                    row.type === "library"
                      ? libraryGroups.filter(
                          (group) =>
                            attachedGroupKeys.has(group.key) &&
                            group.libs.some((lib) => libraryMatchesMaker(lib, row.maker)),
                        )
                      : [];
                  return (
                    <li
                      key={row.key}
                      className="flex flex-col justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2.5 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-slate-900">{cardTitle(row)}</span>
                          {row.labUploadRequested ? (
                            <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                              기공소에 요청함
                            </span>
                          ) : null}
                        </div>
                        <SpecChips chips={specs.map((spec) => specBits(spec, row.type))} tone="amber" />
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          의뢰 {row.transferCount}건 · 치아 {row.teethCount}개 · 치과 {row.practiceCount}곳 · 기공소{" "}
                          {row.labCount}곳 · 최근 {row.latestAt ? kstTime.format(new Date(row.latestAt)) : "-"}
                        </div>
                        {row.implants.length > 0 ? (
                          <div className="text-[11px] text-muted-foreground">임플란트 {implantLabel(row)}</div>
                        ) : null}
                        {attached.length > 0 ? (
                          <div className="mt-2 space-y-1.5 border-t border-slate-200 pt-2">
                            <button
                              type="button"
                              className="text-[11px] text-sky-700 hover:underline"
                              onClick={() =>
                                setOpenAttached((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(row.key)) next.delete(row.key);
                                  else next.add(row.key);
                                  return next;
                                })
                              }
                            >
                              등록된 {row.maker} {attached.length}묶음 · {attached.reduce((s, g) => s + g.libs.length, 0)}개{" "}
                              {openAttached.has(row.key) ? "접기" : "보기"}
                            </button>
                            {(openAttached.has(row.key) ? attached : []).map((group) => {
                              const { chips } = groupChipList(group);
                              return (
                                <div key={group.key}>
                                  <div className="font-medium text-slate-800">{group.title}</div>
                                  <SpecChips chips={chips} tone="slate" />
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 self-start bg-white px-2 text-[11px]"
                        onClick={() => void toggleLabRequest(row)}
                      >
                        {row.labUploadRequested ? "요청 거두기" : "기공소에 요청"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">라이브러리가 없는 스캔바디 의뢰가 없습니다.</p>
            )}
          </section>

          <section className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-semibold text-slate-900">
              등록됨
              {catalogLoaded
                ? ` · 묶음 ${libraryGroups.length} · 라이브러리 ${libraries.length}개 · 템플릿 ${catalog.templates.length}개`
                : ""}
            </h3>
            {!catalogLoaded ? (
              <p className="text-xs text-muted-foreground">등록된 데이터를 불러오는 중입니다.</p>
            ) : registeredCount === 0 ? (
              <p className="text-xs text-muted-foreground">등록된 라이브러리·템플릿이 없습니다.</p>
            ) : (
              <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="제조사·코드 검색"
                  className="h-7 w-56 rounded-md border border-slate-200 px-2 text-xs"
                />
                {!needle && restGroups.length > 0 ? (
                  <>
                    <span className="text-muted-foreground">
                      그 외 {restGroups.length}묶음 · {restLibCount}개 숨김
                    </span>
                    <button
                      type="button"
                      className="text-sky-700 hover:underline"
                      onClick={() => setShowRest((v) => !v)}
                    >
                      {showRest ? "접기" : "펼치기"}
                    </button>
                  </>
                ) : null}
              </div>
              <ul className={cn("grid grid-cols-1 gap-3", !embedded && "sm:grid-cols-2")}>
                {visibleGroups.map((group) => {
                  const latest = group.libs.reduce((max, lib) => (lib.updatedAt > max ? lib.updatedAt : max), "");
                  const kits = group.libs.reduce((sum, lib) => sum + lib.kits.length, 0);
                  const parts = group.libs.reduce((sum, lib) => sum + lib.parts.length, 0);
                  const { chips, sharedSize } = groupChipList(group);
                  const sources = [...new Set(group.libs.map(librarySourceLabel))];
                  const owners = [...new Set(group.libs.map((lib) => lib.ownerName).filter(Boolean))];
                  const scopes = [...new Set(group.libs.map((lib) => lib.scope))];
                  const meta =
                    group.manufacturer || group.brand
                      ? [group.manufacturer && `제조사 ${group.manufacturer}`, group.brand && `브랜드 ${group.brand}`, group.implantType && `타입 ${group.implantType}`]
                          .filter(Boolean)
                          .join(" · ")
                      : "";
                  return (
                    <li key={group.key} className="rounded-md border border-slate-200 bg-white px-3 py-2.5 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-slate-900">{group.title}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                          {scopes.length === 1 && scopes[0] === "public" ? "어벗츠 공용" : scopes.length === 1 ? "기공소" : "혼합"}
                        </span>
                      </div>
                      <SpecChips chips={chips} tone="slate" />
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {sources.join(" · ")}
                        {sharedSize ? ` · ${sharedSize}` : ""} · 키트 {kits}개 · 스캔바디 {parts}개 · 최근{" "}
                        {latest ? kstTime.format(new Date(latest)) : "-"}
                      </div>
                      {meta ? <div className="text-[11px] text-muted-foreground">{meta}</div> : null}
                      {owners.length > 0 ? <div className="text-[11px] text-muted-foreground">{owners.join(" · ")}</div> : null}
                    </li>
                  );
                })}
                {templates.map((group) => (
                  <li key={group.kind} className="rounded-md border border-slate-200 bg-white px-3 py-2.5 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-slate-900">{group.kind} 템플릿</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        템플릿
                      </span>
                    </div>
                    <SpecChips chips={group.chips} tone="slate" />
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {group.count}개 · 최근 {group.latest ? kstTime.format(new Date(group.latest)) : "-"}
                    </div>
                    {group.owners.length > 0 ? (
                      <div className="text-[11px] text-muted-foreground">{group.owners.join(" · ")}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
              </>
            )}
          </section>
      </DemandFrame>
    </>
  );
}
