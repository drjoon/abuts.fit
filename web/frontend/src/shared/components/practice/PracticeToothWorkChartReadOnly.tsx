// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/shared/practice/transferMemo.ts
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import {
  formatAbutmentCompact,
  formatAbutmentSummary,
  formatImplantCompact,
  formatImplantSummary,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";
import {
  getAdjacentTeeth,
  isCustomAbutmentSupportedProsthesisType,
} from "@/shared/practice/usePracticeToothWorkEditor";

const TOOTH_CHART_VISIBLE = 6;
const TOOTH_CARD_HEIGHT_CLASS = "h-[11rem]";

const TOOTH_CHART_ROWS: ReadonlyArray<{
  key: string;
  label: string;
  teeth: readonly string[];
}> = [
  {
    key: "upper",
    label: "상악",
    teeth: [
      "18", "17", "16", "15", "14", "13", "12", "11",
      "21", "22", "23", "24", "25", "26", "27", "28",
    ],
  },
  {
    key: "lower",
    label: "하악",
    teeth: [
      "48", "47", "46", "45", "44", "43", "42", "41",
      "31", "32", "33", "34", "35", "36", "37", "38",
    ],
  },
];

const toothChartOffsetForRegion = (
  region: "R" | "M" | "L",
  teethLength: number,
  visibleCount: number = TOOTH_CHART_VISIBLE,
) => {
  const maxOffset = Math.max(0, teethLength - visibleCount);
  if (region === "R") return 0;
  if (region === "L") return maxOffset;
  return Math.min(maxOffset, Math.max(0, Math.round(maxOffset / 2)));
};

const offsetToRevealSelected = (
  teeth: readonly string[],
  selected: ReadonlySet<string>,
  visibleCount: number = TOOTH_CHART_VISIBLE,
) => {
  const indices = teeth
    .map((tooth, index) => (selected.has(tooth) ? index : -1))
    .filter((index) => index >= 0);
  const maxOffset = Math.max(0, teeth.length - visibleCount);
  if (indices.length === 0) return toothChartOffsetForRegion("M", teeth.length, visibleCount);
  const min = Math.min(...indices);
  const max = Math.max(...indices);
  const ideal = Math.round((min + max) / 2 - (visibleCount - 1) / 2);
  return Math.min(maxOffset, Math.max(0, ideal));
};

const initialToothChartOffsets = (
  selected: ReadonlySet<string>,
  visibleCount: number = TOOTH_CHART_VISIBLE,
) => {
  const next: Record<string, number> = {};
  for (const decade of TOOTH_CHART_ROWS) {
    next[decade.key] = offsetToRevealSelected(decade.teeth, selected, visibleCount);
  }
  return next;
};

type PracticeToothWorkChartReadOnlyProps = {
  toothWorks: ToothWorkSelection[];
  className?: string;
};

export const PracticeToothWorkChartReadOnly = ({
  toothWorks,
  className,
}: PracticeToothWorkChartReadOnlyProps) => {
  const byTooth = useMemo(() => {
    const map = new Map<string, ToothWorkSelection>();
    for (const row of toothWorks) {
      const tooth = String(row.toothNumber || "").trim();
      if (!/^[1-4][1-8]$/.test(tooth)) continue;
      if (!map.has(tooth)) map.set(tooth, row);
    }
    return map;
  }, [toothWorks]);

  const selectedTeeth = useMemo(() => new Set(byTooth.keys()), [byTooth]);

  const [toothChartOffsets, setToothChartOffsets] = useState<Record<string, number>>(() =>
    initialToothChartOffsets(selectedTeeth),
  );
  const [toothChartEnlargeOpen, setToothChartEnlargeOpen] = useState(false);
  const toothChartVisibleCount = toothChartEnlargeOpen ? 16 : TOOTH_CHART_VISIBLE;

  if (selectedTeeth.size === 0) {
    return (
      <div className={cn("rounded-lg border border-dashed border-slate-200 px-3 py-4", className)}>
        <p className="text-center text-sm text-slate-400">선택된 보철물이 없습니다</p>
      </div>
    );
  }

  const chartRows = TOOTH_CHART_ROWS.map((decade) => {
    const maxOffset = Math.max(0, decade.teeth.length - toothChartVisibleCount);
    const offset = Math.min(maxOffset, toothChartOffsets[decade.key] ?? 0);
    const visible = decade.teeth.slice(offset, offset + toothChartVisibleCount);

    return (
      <div key={`ro-decade-${decade.key}`} className="flex items-stretch gap-0.5">
        {maxOffset > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-12 w-12 shrink-0 self-center rounded-xl text-slate-500 hover:bg-primary-soft hover:text-primary-strong disabled:opacity-30"
            disabled={offset <= 0}
            onClick={() =>
              setToothChartOffsets((prev) => ({
                ...prev,
                [decade.key]: Math.max(0, (prev[decade.key] ?? 0) - 1),
              }))
            }
            aria-label={`${decade.label} 이전`}
          >
            <ChevronLeft className="h-8 w-8" strokeWidth={2.25} />
          </Button>
        ) : null}

        <div className="flex min-w-0 flex-1 items-stretch">
          {visible.map((toothNumber, visibleIndex) => {
            const row = byTooth.get(toothNumber);
            const chartIdx = decade.teeth.indexOf(toothNumber);
            const chartNext =
              chartIdx >= 0 && chartIdx < decade.teeth.length - 1
                ? decade.teeth[chartIdx + 1]
                : null;
            const chartPrev = chartIdx > 0 ? decade.teeth[chartIdx - 1] : null;
            const nextVisible = visible[visibleIndex + 1];
            const showBridgeSlot =
              Boolean(chartNext) &&
              nextVisible === chartNext &&
              (byTooth.has(toothNumber) || byTooth.has(chartNext!));

            const linkedTeeth = row
              ? (Array.isArray(row.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : []).filter((t) =>
                  getAdjacentTeeth(row.toothNumber).includes(t),
                )
              : [];
            const isLinked = linkedTeeth.length > 0;
            const bridgeLinked = Boolean(
              chartNext &&
                ((row && linkedTeeth.includes(chartNext)) ||
                  (() => {
                    const nextRow = chartNext ? byTooth.get(chartNext) : undefined;
                    return (
                      nextRow &&
                      Array.isArray(nextRow.bridgeLinkedTeeth) &&
                      nextRow.bridgeLinkedTeeth.includes(toothNumber)
                    );
                  })()),
            );
            const linkedChartNext = Boolean(chartNext && linkedTeeth.includes(chartNext));
            const linkedChartPrev = Boolean(chartPrev && linkedTeeth.includes(chartPrev));

            const bridgeSlot = showBridgeSlot ? (
              <div
                className={cn(
                  "relative z-20 flex shrink-0 items-center justify-center self-stretch",
                  bridgeLinked
                    ? "w-3.5 border-y border-primary bg-gradient-to-b from-primary-soft via-primary-soft to-white"
                    : "w-5",
                )}
              >
                {bridgeLinked ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-3 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-primary/70"
                  />
                ) : null}
                {bridgeLinked ? (
                  <span
                    className="relative z-10 flex h-5 w-5 items-center justify-center rounded-full border border-primary bg-primary text-white ring-2 ring-primary-soft"
                    title={`${toothNumber}–${chartNext} 연결`}
                  >
                    <span className="h-0.5 w-2.5 rounded-full bg-white" />
                  </span>
                ) : (
                  <span className="w-5" aria-hidden />
                )}
              </div>
            ) : visibleIndex < visible.length - 1 ? (
              <div className="w-2 shrink-0" aria-hidden />
            ) : null;

            if (!row) {
              return (
                <div key={`ro-tooth-slot-${toothNumber}`} className="contents">
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "flex w-full flex-col items-center justify-start rounded-xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80 px-1 pt-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]",
                        TOOTH_CARD_HEIGHT_CLASS,
                      )}
                    >
                      <span className="flex h-10 items-center text-xl font-semibold tabular-nums tracking-tight text-slate-400/90">
                        {toothNumber}
                      </span>
                    </div>
                  </div>
                  {bridgeSlot}
                </div>
              );
            }

            const canShowCustom =
              isCustomAbutmentSupportedProsthesisType(row.prosthesisType) &&
              Boolean(row.customAbutment);
            const implantSummary = formatImplantSummary(row);
            const abutmentSummary = formatAbutmentSummary(row);
            const implantCompact = formatImplantCompact(row);
            const abutmentCompact = formatAbutmentCompact(row);

            return (
              <div key={`ro-tooth-slot-${toothNumber}`} className="contents">
                <div className="relative min-w-0 flex-1">
                  {linkedChartNext && !showBridgeSlot ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute right-0 top-1/2 z-20 h-8 w-1.5 -translate-y-1/2 rounded-l-full bg-primary/80"
                    />
                  ) : null}
                  {linkedChartPrev && visible[visibleIndex - 1] !== chartPrev ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute left-0 top-1/2 z-20 h-8 w-1.5 -translate-y-1/2 rounded-r-full bg-primary/80"
                    />
                  ) : null}

                  <div
                    className={cn(
                      "relative flex w-full min-w-0 flex-col items-center justify-start overflow-hidden border px-1 pb-1 pt-1.5 shadow-sm",
                      TOOTH_CARD_HEIGHT_CLASS,
                      isLinked
                        ? "border-primary bg-gradient-to-b from-primary-soft via-primary-soft/95 to-white ring-1 ring-primary/40"
                        : "rounded-xl border-primary/90 bg-gradient-to-b from-primary-soft via-white to-primary-soft/40 ring-1 ring-primary-muted/40",
                      isLinked && !linkedChartPrev && !linkedChartNext && "rounded-xl",
                      isLinked && linkedChartPrev && linkedChartNext && "rounded-none",
                      isLinked && linkedChartPrev && !linkedChartNext && "rounded-r-xl rounded-l-none",
                      isLinked && !linkedChartPrev && linkedChartNext && "rounded-l-xl rounded-r-none",
                      linkedChartPrev && "border-l-0",
                      linkedChartNext && "border-r-0",
                    )}
                  >
                    <span className="flex h-10 items-center text-xl font-bold tabular-nums tracking-tight text-slate-800">
                      {row.toothNumber}
                    </span>

                    <div className="mt-1.5 flex h-7 w-full min-w-0 max-w-full items-center justify-center self-stretch rounded-md border border-primary-muted/80 bg-white/80 px-0.5 text-center text-[11px] text-slate-600">
                      <span className="block w-full truncate px-0.5">{row.prosthesisType || "-"}</span>
                    </div>

                    {canShowCustom ? (
                      <div className="mt-2 flex w-full flex-col items-center gap-0.5 leading-none">
                        <span className="inline-flex h-5 items-center text-[11px] leading-none text-primary-strong">
                          커스텀
                        </span>
                        <TooltipProvider delayDuration={0}>
                          <div className="flex w-full flex-col items-stretch gap-0.5 px-0.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="h-5 w-full truncate px-0.5 text-center text-[10px] leading-none text-primary-strong">
                                  {implantCompact || "임플란트"}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-[16rem] text-xs">
                                {implantSummary || "임플란트"}
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="h-5 w-full truncate px-0.5 text-center text-[10px] leading-none text-service-abut">
                                  {abutmentCompact || "스캔바디"}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-[16rem] text-xs">
                                {abutmentSummary || "스캔바디"}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                      </div>
                    ) : null}
                  </div>
                </div>
                {bridgeSlot}
              </div>
            );
          })}
        </div>

        {maxOffset > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-12 w-12 shrink-0 self-center rounded-xl text-slate-500 hover:bg-primary-soft hover:text-primary-strong disabled:opacity-30"
            disabled={offset >= maxOffset}
            onClick={() =>
              setToothChartOffsets((prev) => ({
                ...prev,
                [decade.key]: Math.min(maxOffset, (prev[decade.key] ?? 0) + 1),
              }))
            }
            aria-label={`${decade.label} 다음`}
          >
            <ChevronRight className="h-8 w-8" strokeWidth={2.25} />
          </Button>
        ) : null}
      </div>
    );
  });

  const chartBody = <div className="space-y-2">{chartRows}</div>;

  const regionNav = (
    <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        title="오른쪽 · 10/40번대"
        className="h-8 w-10 px-0 text-sm font-semibold tabular-nums"
        onClick={() => {
          setToothChartOffsets(() => {
            const next: Record<string, number> = {};
            for (const decade of TOOTH_CHART_ROWS) {
              next[decade.key] = toothChartOffsetForRegion(
                "R",
                decade.teeth.length,
                toothChartVisibleCount,
              );
            }
            return next;
          });
        }}
      >
        R
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title="한 칸 왼쪽"
        className="h-8 w-8 text-slate-500"
        onClick={() => {
          setToothChartOffsets((prev) => {
            const next = { ...prev };
            for (const decade of TOOTH_CHART_ROWS) {
              const cur = next[decade.key] ?? 0;
              next[decade.key] = Math.max(0, cur - 1);
            }
            return next;
          });
        }}
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={2.25} />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        title="전치부"
        className="h-8 w-10 px-0 text-sm font-semibold tabular-nums"
        onClick={() => {
          setToothChartOffsets(() => {
            const next: Record<string, number> = {};
            for (const decade of TOOTH_CHART_ROWS) {
              next[decade.key] = toothChartOffsetForRegion(
                "M",
                decade.teeth.length,
                toothChartVisibleCount,
              );
            }
            return next;
          });
        }}
      >
        M
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title="한 칸 오른쪽"
        className="h-8 w-8 text-slate-500"
        onClick={() => {
          setToothChartOffsets((prev) => {
            const next = { ...prev };
            for (const decade of TOOTH_CHART_ROWS) {
              const maxOffset = Math.max(0, decade.teeth.length - toothChartVisibleCount);
              const cur = next[decade.key] ?? 0;
              next[decade.key] = Math.min(maxOffset, cur + 1);
            }
            return next;
          });
        }}
      >
        <ChevronRight className="h-5 w-5" strokeWidth={2.25} />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        title="왼쪽 · 20/30번대"
        className="h-8 w-10 px-0 text-sm font-semibold tabular-nums"
        onClick={() => {
          setToothChartOffsets(() => {
            const next: Record<string, number> = {};
            for (const decade of TOOTH_CHART_ROWS) {
              next[decade.key] = toothChartOffsetForRegion(
                "L",
                decade.teeth.length,
                toothChartVisibleCount,
              );
            }
            return next;
          });
        }}
      >
        L
      </Button>
    </div>
  );

  return (
    <div className={cn("space-y-2", className)}>
      {!toothChartEnlargeOpen ? (
        <>
          <div className="relative flex min-h-8 items-center">
            <p className="text-sm font-medium text-slate-700">
              보철물{" "}
              <span className="font-normal text-muted-foreground">({selectedTeeth.size}개)</span>
            </p>
            {regionNav}
            <div className="absolute right-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs"
                onClick={() => {
                  setToothChartOffsets(initialToothChartOffsets(selectedTeeth, 16));
                  setToothChartEnlargeOpen(true);
                }}
              >
                크게 보기
              </Button>
            </div>
          </div>
          {chartBody}
        </>
      ) : null}

      <Dialog open={toothChartEnlargeOpen} onOpenChange={setToothChartEnlargeOpen}>
        {/* Above parent 의뢰 상세 dialog (z-[100]); z-[60] hid the chart behind it. */}
        <DialogContent
          overlayClassName="z-[110]"
          className="z-[110] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] gap-3 p-4 sm:p-5"
        >
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="text-base">
              보철물{" "}
              <span className="font-normal text-muted-foreground">({selectedTeeth.size}개)</span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              보철물 치식 차트를 가로로 크게 봅니다.
            </DialogDescription>
          </DialogHeader>
          {toothChartEnlargeOpen ? chartBody : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};
