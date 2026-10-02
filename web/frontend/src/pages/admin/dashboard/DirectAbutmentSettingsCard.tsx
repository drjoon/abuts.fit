// 관리자 대시보드 — 치과 신규의뢰 직접어벗.
// 심플어벗·심플밀링 3D 모델은 어벗츠가 올린다. 직접 입력(회사·직경·높이)은 기공소가 관리한다.
import { useMemo, useRef, useState } from "react";
import { Cylinder, Loader2, X } from "lucide-react";
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
  deleteAbutmentTemplate,
  parseTemplateFileName,
  uploadTemplateFileAndWait,
  useScanbodyCatalog,
  type AbutmentTemplateRow,
  type TemplateSpec,
} from "@/shared/practice/scanbodyLibraryApi";
import {
  SIMPLE_ABUTMENT_DIAMETERS,
  SIMPLE_ABUTMENT_HEIGHTS,
  SIMPLE_ABUTMENT_KINDS,
  type SimpleAbutmentKind,
} from "@/shared/practice/transferMemo";
import { cn } from "@/shared/ui/cn";
import {
  DIRECT_ABUTMENT_MODEL_ACCEPT,
  isDirectAbutmentModelName,
  prepareDirectAbutmentUploadFile,
} from "@/pages/admin/dashboard/directAbutmentModelFile";

const HEIGHT_ORDER = ["S", "M", "L", "XL"];

function cellKey(kind: string, diameter: string, height: string) {
  return `${kind}|${diameter}|${height}`;
}

function sortLabels(values: readonly string[], preferred: readonly string[]) {
  const rank = new Map(preferred.map((label, index) => [label, index]));
  return [...new Set(values)].sort((a, b) => {
    const da = Number(a);
    const db = Number(b);
    if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return da - db;
    const ra = rank.get(a);
    const rb = rank.get(b);
    if (ra != null && rb != null) return ra - rb;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return a.localeCompare(b, "ko");
  });
}

function abutsSimpleTemplates(rows: readonly AbutmentTemplateRow[]) {
  return rows.filter(
    (row) =>
      row.scope === "public" &&
      (SIMPLE_ABUTMENT_KINDS as readonly string[]).includes(row.kind),
  );
}

export function DirectAbutmentSettingsCard({ className }: { className?: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SimpleAbutmentKind>(SIMPLE_ABUTMENT_KINDS[0]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const dropSpec = useRef<TemplateSpec | null>(null);
  const { catalog, loaded, reload } = useScanbodyCatalog(true);

  useAppEventDebouncedReload({
    eventTypes: ["scanbody:demand-updated"],
    delayMs: 800,
    requireVisible: false,
    onMatch: () => reload(),
  });

  const templates = useMemo(() => abutsSimpleTemplates(catalog.templates), [catalog.templates]);
  const byCell = useMemo(() => {
    const map = new Map<string, AbutmentTemplateRow>();
    for (const row of templates) {
      const key = cellKey(row.kind, row.diameter, row.height);
      const prev = map.get(key);
      if (!prev || row.updatedAt > prev.updatedAt) map.set(key, row);
    }
    return map;
  }, [templates]);
  const kindRows = useMemo(() => templates.filter((row) => row.kind === kind), [templates, kind]);
  const diameters = useMemo(
    () => sortLabels([...SIMPLE_ABUTMENT_DIAMETERS, ...kindRows.map((row) => row.diameter)], SIMPLE_ABUTMENT_DIAMETERS),
    [kindRows],
  );
  const heights = useMemo(() => {
    const recorded = kindRows.map((row) => row.height);
    const labels = sortLabels(
      [...SIMPLE_ABUTMENT_HEIGHTS, ...recorded.filter(Boolean)],
      HEIGHT_ORDER,
    );
    if (recorded.some((height) => !height)) labels.push("");
    return labels;
  }, [kindRows]);

  const uploadOne = async (file: File, spec: TemplateSpec) => {
    const key = cellKey(spec.kind, spec.diameter, spec.height);
    setBusyKey(key);
    setStatus("형상을 읽는 중…");
    try {
      const prepared = await prepareDirectAbutmentUploadFile(file);
      const row = await uploadTemplateFileAndWait(prepared, spec, setStatus);
      if (row.status !== "done") {
        toast({
          title: "모델을 등록하지 못했습니다.",
          description: row.message || file.name,
          variant: "destructive",
        });
        return;
      }
      toast({ title: `${spec.kind} ${spec.diameter}${spec.height} 모델을 등록했습니다.` });
      reload();
    } catch (error) {
      toast({
        title: "모델을 올리지 못했습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusyKey(null);
      setStatus("");
    }
  };

  const uploadFiles = async (files: File[], spec: TemplateSpec | null) => {
    if (busyKey) return;
    const models = files.filter((file) => isDirectAbutmentModelName(file.name));
    if (models.length === 0) {
      toast({ title: "3DM, STL, DCM, PLY, OBJ 파일을 올려 주세요.", variant: "destructive" });
      return;
    }
    if (spec) {
      if (models.length > 1) {
        toast({ title: "한 칸에는 모델 하나만 올려 주세요.", variant: "destructive" });
        return;
      }
      await uploadOne(models[0]!, spec);
      return;
    }
    for (const file of models) {
      const parsed = parseTemplateFileName(file.name);
      if (!parsed?.diameter || !parsed.height) {
        toast({
          title: "파일 이름에서 직경·높이를 읽지 못했습니다.",
          description: "6M.stl 처럼 적거나, 칸에 떨어뜨리세요.",
          variant: "destructive",
        });
        continue;
      }
      await uploadOne(file, { kind, diameter: parsed.diameter, height: parsed.height });
    }
  };

  const remove = async (row: AbutmentTemplateRow) => {
    if (busyKey) return;
    const key = cellKey(row.kind, row.diameter, row.height);
    setBusyKey(key);
    try {
      await deleteAbutmentTemplate(row.id);
      toast({ title: `${row.kind} ${row.diameter}${row.height} 모델을 지웠습니다.` });
      reload();
    } catch (error) {
      toast({
        title: "모델을 지우지 못했습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const pickCell = (spec: TemplateSpec) => {
    if (busyKey) return;
    dropSpec.current = spec;
    fileInput.current?.click();
  };

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept={DIRECT_ABUTMENT_MODEL_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          const spec = dropSpec.current;
          dropSpec.current = null;
          event.target.value = "";
          void uploadFiles(files, spec);
        }}
      />
      <Card
        className={cn(
          "app-glass-card app-glass-card--lg h-full cursor-pointer transition hover:bg-slate-50/60",
          className,
        )}
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">직접어벗</CardTitle>
          <Cylinder className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between gap-2">
            <div className="text-2xl font-bold">{loaded ? templates.length.toLocaleString() : "—"}</div>
            <span className="text-xs text-muted-foreground">심플어벗</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">3DM · STL</p>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-4 overflow-hidden sm:max-w-5xl">
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle className="text-base">직접어벗 설정</DialogTitle>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-1.5 py-1.5 sm:grid-cols-2">
            <section
              className="rounded-xl border border-amber-200 bg-amber-50/70 p-4"
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                if ((event.target as HTMLElement).closest?.("[data-abutment-cell]")) return;
                void uploadFiles(Array.from(event.dataTransfer.files), null);
              }}
            >
              <h3 className="text-sm font-semibold text-slate-900">심플어벗</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                어벗츠 관리자가 3D 모델을 올립니다.
                <br />
                칸에 3DM, STL, DCM, PLY, OBJ를 떨어뜨리세요.
              </p>
              <div className="mt-3 flex gap-1.5">
                {SIMPLE_ABUTMENT_KINDS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={cn(
                      "h-8 flex-1 rounded-lg border text-xs font-medium",
                      option === kind
                        ? "border-amber-400 bg-white text-slate-900"
                        : "border-transparent bg-white/80 text-slate-500",
                    )}
                    onClick={() => setKind(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full border-separate border-spacing-1.5 text-xs">
                  <thead>
                    <tr>
                      <th className="w-8" />
                      {diameters.map((diameter) => (
                        <th key={diameter} className="px-1 text-center font-medium text-slate-600">
                          {diameter}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {heights.map((height) => (
                      <tr key={height}>
                        <th className="pr-1 text-left font-medium text-slate-600">{height || "—"}</th>
                        {diameters.map((diameter) => {
                          const spec: TemplateSpec = { kind, diameter, height };
                          const key = cellKey(kind, diameter, height);
                          const row = byCell.get(key);
                          const busy = busyKey === key;
                          return (
                            <td key={key}>
                              <div
                                role="button"
                                tabIndex={0}
                                aria-label={`${kind} ${diameter}${height} 모델`}
                                data-abutment-cell=""
                                className={cn(
                                  "relative flex h-14 min-w-[4.5rem] flex-col items-center justify-center rounded-lg border px-1 text-[11px]",
                                  row ? "border-slate-200 bg-white text-slate-800" : "border-dashed border-slate-300 bg-white/70 text-slate-400",
                                  overKey === key && "border-sky-400 bg-sky-50 text-sky-800",
                                )}
                                onClick={() => pickCell(spec)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    pickCell(spec);
                                  }
                                }}
                                onDragOver={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setOverKey(key);
                                }}
                                onDragLeave={() => setOverKey((prev) => (prev === key ? null : prev))}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setOverKey(null);
                                  void uploadFiles(Array.from(event.dataTransfer.files), spec);
                                }}
                              >
                                {busy ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : row ? (
                                  <span className="truncate font-medium">{row.diameter}{row.height}</span>
                                ) : (
                                  "올리기"
                                )}
                                {row && !busy ? (
                                  <button
                                    type="button"
                                    className="absolute right-0.5 top-0.5 inline-flex h-4 w-4 items-center justify-center text-slate-400 hover:text-red-600"
                                    aria-label={`${kind} ${diameter}${height} 지우기`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void remove(row);
                                    }}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {status ? <p className="mt-2 text-[11px] text-muted-foreground">{status}</p> : null}
            </section>

            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">직접 입력</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                어벗츠는 관리하지 않습니다.
                <br />
                기공소가 회사·직경·높이를 자체적으로 관리합니다.
              </p>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
