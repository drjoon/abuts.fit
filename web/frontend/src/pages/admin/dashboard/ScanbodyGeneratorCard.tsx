// 관리자 대시보드 — 어벗츠 스캔바디 생성기.
// 스캔바디 제조사와 직경(열)·높이(행) 표. 칸에 STEP·STL·DCM을 떨어뜨린다.
// 파일명에 직경*높이가 있으면 그 머리글을 만들고 칸에 넣는다.
// related files:
// - web/frontend/src/shared/practice/scanbodyLibraryApi.ts
// - web/backend/services/scanbodyLibraryImport.service.js (parseScanbodySpec)
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/shared/hooks/use-toast";
import {
  uploadScanbodySpecAndWait,
  useScanbodyCatalog,
  type ScanbodySpecInput,
} from "@/shared/practice/scanbodyLibraryApi";
import { cn } from "@/shared/ui/cn";
import { loadScanbodyGeneratorDraft, saveScanbodyGeneratorDraft } from "./scanbodyGeneratorDraft";
import { generateScanbodyStl } from "./scanbodyLocalGenerate";

const SHAPE_PATTERN = /\.(stp|step|stl|dcm)$/i;
/** 파일명 안의 `4.5*10`·`4.5xH`. 앞에 다른 글자가 있어도 된다. */
const SIZE_NAME = /(?:^|[^A-Za-z0-9.])([A-Za-z0-9.]+)\s*[*×xX]\s*([A-Za-z0-9.]+)(?:[^A-Za-z0-9.]|$)/;
/** `10M.dcm`·`6M.DCM` — 직경 숫자 뒤에 높이 글자가 바로 붙는다. */
const GLUED_SIZE = /(?:^|[^A-Za-z0-9.])(\d+(?:\.\d+)?)\s*([A-Za-z]{1,2})(?:[^A-Za-z0-9.]|$)/;
const BLANK = ["", "", ""];

type Grid = {
  diameters: string[];
  heights: string[];
  cells: Record<string, File>;
};

const EMPTY_GRID: Grid = { diameters: [...BLANK], heights: [...BLANK], cells: {} };

const cellKey = (col: number, row: number) => `${col}:${row}`;

function sameSize(a: string, b: string) {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (x === y) return true;
  const nx = Number(x.replace(",", "."));
  const ny = Number(y.replace(",", "."));
  return Number.isFinite(nx) && Number.isFinite(ny) && nx === ny;
}

/** 파일명 `4.5*10.stl`·`OSSTEM_4.5xH.stp`·`10M.dcm` → 직경·높이. 이 값으로 표 머리글을 만든다. */
function sizeFromFileName(name: string) {
  const base = name.replace(/\.(stp|step|stl|dcm)$/i, "").trim();
  const separated = SIZE_NAME.exec(base);
  if (separated) {
    const diameter = separated[1]!;
    const height = separated[2]!;
    if (diameter.length > 20 || height.length > 20) return null;
    return { diameter, height };
  }
  const glued = GLUED_SIZE.exec(base);
  if (!glued) return null;
  const diameter = glued[1]!;
  const height = glued[2]!.toUpperCase();
  if (diameter.length > 20 || height.length > 20) return null;
  return { diameter, height };
}

function indexOfSize(values: readonly string[], size: string) {
  return values.findIndex((value) => value.trim() && sameSize(value, size));
}

function placeSize(values: string[], size: string) {
  const found = indexOfSize(values, size);
  if (found >= 0) return { values, index: found };
  const empty = values.findIndex((value) => !value.trim());
  const next = [...values];
  if (empty >= 0) {
    next[empty] = size;
    return { values: next, index: empty };
  }
  next.push(size);
  return { values: next, index: next.length - 1 };
}

/** 빈 칸은 맨 뒤. 숫자는 작은 값부터, 글자는 그다음. */
function compareSizeLabel(a: string, b: string) {
  const rank = (value: string) => {
    const raw = value.trim().replace(",", ".");
    if (!raw) return { group: 2, n: 0, text: "" };
    const n = Number(raw);
    if (Number.isFinite(n)) return { group: 0, n, text: raw.toLowerCase() };
    return { group: 1, n: 0, text: raw.toLowerCase() };
  };
  const x = rank(a);
  const y = rank(b);
  if (x.group !== y.group) return x.group - y.group;
  if (x.group === 0 && x.n !== y.n) return x.n - y.n;
  return x.text.localeCompare(y.text, "en");
}

function sortGrid(grid: Grid): Grid {
  const order = (values: string[]) =>
    values
      .map((value, index) => ({ value, index }))
      .sort((a, b) => compareSizeLabel(a.value, b.value) || a.index - b.index);
  const cols = order(grid.diameters);
  const rows = order(grid.heights);
  const colAt = new Map(cols.map((item, index) => [item.index, index]));
  const rowAt = new Map(rows.map((item, index) => [item.index, index]));
  const cells: Record<string, File> = {};
  for (const [key, file] of Object.entries(grid.cells)) {
    const [col, row] = key.split(":").map(Number);
    cells[cellKey(colAt.get(col) ?? col, rowAt.get(row) ?? row)] = file;
  }
  return {
    diameters: cols.map((item) => item.value),
    heights: rows.map((item) => item.value),
    cells,
  };
}

function fileLabel(name: string) {
  return name.replace(/\.(stp|step|stl|dcm)$/i, "");
}

function axesInOrder(grid: Grid, ordered: Grid) {
  return (
    ordered.diameters.length === grid.diameters.length &&
    ordered.heights.length === grid.heights.length &&
    ordered.diameters.every((value, index) => value === grid.diameters[index]) &&
    ordered.heights.every((value, index) => value === grid.heights[index])
  );
}

function reindex(cells: Record<string, File>, dropCol: number | null, dropRow: number | null) {
  const next: Record<string, File> = {};
  for (const [key, file] of Object.entries(cells)) {
    const [col, row] = key.split(":").map(Number);
    if (col === dropCol || row === dropRow) continue;
    const c = dropCol != null && col > dropCol ? col - 1 : col;
    const r = dropRow != null && row > dropRow ? row - 1 : row;
    next[cellKey(c, r)] = file;
  }
  return next;
}

export function ScanbodyGeneratorCard({ className }: { className?: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [maker, setMaker] = useState("");
  const [grid, setGrid] = useState<Grid>(EMPTY_GRID);
  const [over, setOver] = useState<string | null>(null);
  const [modalOver, setModalOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const editingHeader = useRef(false);
  const touched = useRef(false);
  const ordered = sortGrid(grid);
  if (!editingHeader.current && !axesInOrder(grid, ordered)) {
    setGrid(ordered);
  }
  const view = editingHeader.current ? grid : ordered;
  const { catalog, loaded, reload } = useScanbodyCatalog(open);

  useEffect(() => {
    let cancel = false;
    void loadScanbodyGeneratorDraft()
      .then((draft) => {
        if (cancel || !draft || touched.current) return;
        if (!draft.maker && Object.keys(draft.cells).length === 0) return;
        setMaker(draft.maker);
        setGrid({ diameters: draft.diameters, heights: draft.heights, cells: draft.cells });
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancel) setDraftReady(true);
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    const timer = window.setTimeout(() => {
      void saveScanbodyGeneratorDraft({
        maker,
        diameters: grid.diameters,
        heights: grid.heights,
        cells: grid.cells,
      }).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draftReady, maker, grid]);

  const generated = useMemo(
    () =>
      catalog.libraries
        .filter((lib) => lib.source === "generated")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [catalog.libraries],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return generated;
    return generated.filter((lib) =>
      [
        lib.systemName,
        lib.implantManufacturer,
        lib.brand,
        ...(lib.manufacturers ?? []),
        ...lib.kits.flatMap((kit) => [kit.name, kit.spec, kit.code]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [generated, query]);

  const jobs = useMemo(() => {
    const rows: Array<{ file: File; diameter: string; height: string }> = [];
    grid.heights.forEach((height, row) => {
      grid.diameters.forEach((diameter, col) => {
        const file = grid.cells[cellKey(col, row)];
        if (file) rows.push({ file, diameter: diameter.trim(), height: height.trim() });
      });
    });
    return rows;
  }, [grid]);

  const setHeader = (axis: "diameters" | "heights", index: number, value: string) => {
    setGrid((prev) => {
      const next = [...prev[axis]];
      next[index] = value;
      return { ...prev, [axis]: next };
    });
  };

  const addColumn = () => setGrid((prev) => ({ ...prev, diameters: [...prev.diameters, ""] }));
  const addRow = () => setGrid((prev) => ({ ...prev, heights: [...prev.heights, ""] }));

  const removeColumn = (col: number) => {
    setGrid((prev) => {
      if (prev.diameters.length <= 1) return prev;
      return {
        ...prev,
        diameters: prev.diameters.filter((_, index) => index !== col),
        cells: reindex(prev.cells, col, null),
      };
    });
  };

  const removeRow = (row: number) => {
    setGrid((prev) => {
      if (prev.heights.length <= 1) return prev;
      return {
        ...prev,
        heights: prev.heights.filter((_, index) => index !== row),
        cells: reindex(prev.cells, null, row),
      };
    });
  };

  const ingest = (dropped: File[], target: { col: number; row: number } | null) => {
    touched.current = true;
    const steps = dropped.filter((file) => SHAPE_PATTERN.test(file.name));
    if (steps.length === 0) {
      toast({ title: "STEP, STL, DCM 파일을 떨어뜨려 주세요.", variant: "destructive" });
      return;
    }
    let diameters = grid.diameters;
    let heights = grid.heights;
    const cells = { ...grid.cells };
    const leftover: string[] = [];
    for (const file of steps) {
      const size = sizeFromFileName(file.name);
      if (size) {
        const col = placeSize(diameters, size.diameter);
        const row = placeSize(heights, size.height);
        diameters = col.values;
        heights = row.values;
        cells[cellKey(col.index, row.index)] = file;
        continue;
      }
      if (steps.length === 1 && target) {
        cells[cellKey(target.col, target.row)] = file;
        continue;
      }
      leftover.push(file.name);
    }
    setGrid(sortGrid({ diameters, heights, cells }));
    if (leftover.length > 0) {
      toast({
        title: "칸을 찾지 못한 파일이 있습니다.",
        description: leftover.slice(0, 3).join(", "),
      });
    }
  };

  const submit = async () => {
    if (busy || jobs.length === 0) return;
    if (!maker.trim()) {
      toast({ title: "스캔바디 제조사를 입력해 주세요.", variant: "destructive" });
      return;
    }
    const missing = jobs.find((job) => !job.diameter || !job.height);
    if (missing) {
      toast({ title: "직경과 높이를 입력해 주세요.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      setStatus("이 브라우저에 저장하는 중…");
      await saveScanbodyGeneratorDraft({
        maker: maker.trim(),
        diameters: grid.diameters,
        heights: grid.heights,
        cells: grid.cells,
      });
      for (const [index, job] of jobs.entries()) {
        const prefix = jobs.length > 1 ? `${index + 1}/${jobs.length} ` : "";
        setStatus(`${prefix}만드는 중…`);
        const stl = new File([await generateScanbodyStl(job.file)], `${job.diameter}*${job.height}.stl`, {
          type: "model/stl",
        });
        const spec: ScanbodySpecInput = {
          maker: maker.trim(),
          implantManufacturer: "",
          brand: "",
          diameter: job.diameter,
          height: job.height,
          axis: "auto",
          platformEnd: "auto",
          localGenerated: true,
        };
        const row = await uploadScanbodySpecAndWait(stl, spec, (text) => setStatus(`${prefix}${text}`));
        if (row.status !== "done") {
          toast({
            title: "스캔바디를 만들지 못했습니다.",
            description: row.message || job.file.name,
            variant: "destructive",
          });
          return;
        }
      }
      toast({ title: `스캔바디 ${jobs.length}개를 만들었습니다.` });
      const cleared = { ...grid, cells: {} as Record<string, File> };
      setGrid(cleared);
      await saveScanbodyGeneratorDraft({
        maker: maker.trim(),
        diameters: grid.diameters,
        heights: grid.heights,
        cells: {},
      });
      reload();
    } catch (error) {
      toast({
        title: "스캔바디를 만들지 못했습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
      setStatus("");
    }
  };

  return (
    <>
      <Card
        className={cn("app-glass-card app-glass-card--lg h-full cursor-pointer transition hover:bg-slate-50/60", className)}
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">어벗츠 스캔바디</CardTitle>
          <Box className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">직경·높이 표에 STEP·STL·DCM</p>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent
          className={cn(
            "flex max-h-[85vh] flex-col gap-6 overflow-hidden sm:max-w-6xl sm:p-8",
            modalOver && "bg-sky-50/50",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setModalOver(true);
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            setModalOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setModalOver(false);
            setOver(null);
            ingest(Array.from(e.dataTransfer.files), null);
          }}
        >
          <DialogHeader className="shrink-0 pr-10">
            <DialogTitle className="text-base">어벗츠 스캔바디 생성기</DialogTitle>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-8 overflow-hidden sm:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
          <div className="flex min-h-0 min-w-0 flex-col pr-2">
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-2">
          <div className="min-w-0 pl-2 pt-2">
            <table className="w-full table-fixed border-separate border-spacing-3 text-xs">
              <thead>
                <tr>
                  <th className="w-[4.5rem]" />
                  {view.diameters.map((diameter, col) => (
                    <th key={`d-${col}`} className="min-w-0 font-normal">
                      <div className="group relative min-w-0">
                        <Input
                          className="h-8 min-w-0 rounded-lg border-slate-200 bg-white px-4 text-center text-xs tabular-nums shadow-none"
                          value={diameter}
                          disabled={busy}
                          aria-label={`직경 ${col + 1}`}
                          placeholder="직경"
                          onFocus={() => {
                            editingHeader.current = true;
                          }}
                          onBlur={() => {
                            editingHeader.current = false;
                            setGrid((prev) => sortGrid(prev));
                          }}
                          onChange={(e) => setHeader("diameters", col, e.target.value)}
                        />
                        {view.diameters.length > 1 ? (
                          <button
                            type="button"
                            className="pointer-events-none absolute right-1 top-1/2 z-10 inline-flex h-4 w-4 -translate-y-1/2 items-center justify-center text-red-500 opacity-0 focus:pointer-events-auto focus:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
                            disabled={busy}
                            aria-label="직경 열 지우기"
                            onClick={() => removeColumn(col)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </th>
                  ))}
                  <th className="w-8">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50"
                      disabled={busy}
                      aria-label="직경 열 추가"
                      onClick={addColumn}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.heights.map((height, row) => (
                  <tr key={`h-${row}`}>
                    <th className="min-w-0 font-normal">
                      <div className="group relative min-w-0">
                        <Input
                          className="h-8 min-w-0 rounded-lg border-slate-200 bg-white px-4 text-center text-xs tabular-nums shadow-none"
                          value={height}
                          disabled={busy}
                          aria-label={`높이 ${row + 1}`}
                          placeholder="높이"
                          onFocus={() => {
                            editingHeader.current = true;
                          }}
                          onBlur={() => {
                            editingHeader.current = false;
                            setGrid((prev) => sortGrid(prev));
                          }}
                          onChange={(e) => setHeader("heights", row, e.target.value)}
                        />
                        {view.heights.length > 1 ? (
                          <button
                            type="button"
                            className="pointer-events-none absolute right-1 top-1/2 z-10 inline-flex h-4 w-4 -translate-y-1/2 items-center justify-center text-red-500 opacity-0 focus:pointer-events-auto focus:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
                            disabled={busy}
                            aria-label="높이 행 지우기"
                            onClick={() => removeRow(row)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </th>
                    {view.diameters.map((_, col) => {
                      const key = cellKey(col, row);
                      const file = view.cells[key];
                      return (
                        <td key={key}>
                          <div
                            className={cn(
                              "group relative flex h-10 items-center justify-center rounded-lg border px-1.5 text-center text-[11px] transition-colors",
                              file
                                ? "border-sky-200 bg-sky-50 pr-5 font-medium text-slate-800"
                                : "border-dashed border-slate-200 bg-white text-slate-400",
                              over === key && "border-sky-400 bg-sky-100 text-sky-700",
                            )}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setOver(key);
                            }}
                            onDragLeave={() => setOver((current) => (current === key ? null : current))}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setModalOver(false);
                              setOver(null);
                              ingest(Array.from(e.dataTransfer.files), { col, row });
                            }}
                          >
                            {file ? (
                              <>
                                <span className="min-w-0 truncate" title={file.name}>
                                  {fileLabel(file.name)}
                                </span>
                                <button
                                  type="button"
                                  className="pointer-events-none absolute right-1 top-1/2 z-10 inline-flex h-4 w-4 -translate-y-1/2 items-center justify-center text-red-500 opacity-0 focus:pointer-events-auto focus:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
                                  disabled={busy}
                                  aria-label="파일 빼기"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setGrid((prev) => {
                                      const cells = { ...prev.cells };
                                      delete cells[key];
                                      return { ...prev, cells };
                                    });
                                  }}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </>
                            ) : (
                              "드롭"
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td />
                  </tr>
                ))}
                <tr>
                  <th className="text-left">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50"
                      disabled={busy}
                      aria-label="높이 행 추가"
                      onClick={addRow}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </th>
                </tr>
              </tbody>
            </table>
          </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 px-1.5 pb-1.5 pt-4">
            {busy && status ? <span className="min-w-0 truncate text-xs text-muted-foreground">{status}</span> : null}
            <Input
              className="h-8 w-44 rounded-lg border-slate-200 shadow-none"
              value={maker}
              disabled={busy}
              placeholder="스캔바디 제조사"
              aria-label="스캔바디 제조사"
              onChange={(e) => {
                touched.current = true;
                setMaker(e.target.value);
              }}
            />
            <Button size="sm" disabled={busy || jobs.length === 0} onClick={() => void submit()}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Box className="mr-1.5 h-4 w-4" />}
              {busy ? "만드는 중…" : "스캔바디 만들기"}
            </Button>
          </div>
          </div>

          <section className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-2xl bg-slate-50 p-4">
            <div className="flex shrink-0 items-center justify-between gap-3">
              <h3 className="shrink-0 text-sm font-semibold text-slate-900">
                등록된 스캔바디{loaded ? ` · ${generated.length}개` : ""}
              </h3>
              <Input
                className="h-8 w-40 rounded-lg border-slate-200 bg-white shadow-none"
                value={query}
                placeholder="검색"
                aria-label="등록된 스캔바디 검색"
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {loaded && visible.length > 0 ? (
              <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                {visible.map((lib) => (
                  <li key={lib.id} className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-xs shadow-sm">
                    <div className="font-medium text-slate-900">{lib.systemName}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {lib.kits.map((kit) => kit.spec || kit.name).filter(Boolean).join(", ")}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
