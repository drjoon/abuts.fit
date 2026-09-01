// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/shared/practice/transferMemo.ts
// - 2026-08-19: 수가 Off면 live quote-context로 기공비 미설정·어벗 단가 표시.
// - 2026-08-19: 치아 옆 스크롤·R/M/L 제거. 견적 바에 << < > >>(1칸·5칸).
// - 2026-08-24: 의뢰상세 — 치료할 치아만 표시. 상·하 각 6개 이하면 크게보기·스크롤 숨김.
// - 2026-08-25: 구강스캔(기공의뢰)은 디자인+생산 고정 — 치식 카드 모드 라벨 제거(작성 UI와 동일).
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
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
  isMissingToothProsthesisType,
  isTemporaryToothProsthesisType,
  NO_WORK_PROSTHESIS_TYPE,
  NO_WORK_PROSTHESIS_TOOLTIP,
} from "@/shared/practice/usePracticeToothWorkEditor";
import { PracticeTransferFeeEstimate } from "@/shared/components/practice/PracticeTransferFeeEstimate";
import { usePracticeTransferFeeQuote } from "@/shared/practice/usePracticeTransferFeeQuote";
import type {
  PracticeTransferFeeQuote,
  PracticeTransferFeeQuoteViewer,
} from "@/shared/practice/practiceTransferFeeQuote";

const TOOTH_CHART_VISIBLE = 6;
const TOOTH_CHART_SCROLL_STEP = 1;
const TOOTH_CHART_SCROLL_JUMP = 5;
const TOOTH_CARD_HEIGHT_CLASS = "h-[12rem]";
const TOOTH_SLOT_CLASS = "min-w-[3.5rem] flex-1";

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

/** 치식 순서 유지한 채 치료할 치아만. 빈 칸(미치료)은 의뢰상세에서 숨긴다. */
const treatedTeethInRow = (
  teeth: readonly string[],
  selected: ReadonlySet<string>,
): string[] => teeth.filter((tooth) => selected.has(tooth));

const initialToothChartOffsets = (
  rows: ReadonlyArray<{ key: string; teeth: readonly string[] }>,
) => {
  const next: Record<string, number> = {};
  for (const row of rows) {
    // 치료할 치아만 나열하므로 시작은 항상 왼쪽(0).
    next[row.key] = 0;
  }
  return next;
};

type PracticeToothWorkChartReadOnlyProps = {
  toothWorks: ToothWorkSelection[];
  className?: string;
  feeQuote?: PracticeTransferFeeQuote | null;
  feeViewer?: PracticeTransferFeeQuoteViewer;
  labAnchorId?: string | null;
  skipJig?: boolean;
  /** 후속 제작 등 — 어벗·디자인비 견적 제외 */
  skipAbutmentFees?: boolean;
  /** 상단「보철물 (N개)」헤더 */
  showHeader?: boolean;
  /** 모달 등 좁은 영역 — 카드 클립·이중 테두리 완화 */
  embedded?: boolean;
  /** 기공소 뷰 — 자동매칭 기공비 별점 확정가 */
  labEffectiveStars?: number | null;
};

export const PracticeToothWorkChartReadOnly = ({
  toothWorks,
  className,
  feeQuote: storedFeeQuote = null,
  feeViewer = "practice",
  labAnchorId = null,
  skipJig = false,
  skipAbutmentFees = false,
  showHeader = true,
  embedded = false,
  labEffectiveStars = null,
}: PracticeToothWorkChartReadOnlyProps) => {
  const byTooth = useMemo(() => {
    const map = new Map<string, ToothWorkSelection>();
    for (const row of toothWorks) {
      const anchor = String(row.toothNumber || "").trim();
      const linked = Array.isArray(row.bridgeLinkedTeeth)
        ? row.bridgeLinkedTeeth.map((t) => String(t || "").trim()).filter(Boolean)
        : [];
      const teeth = Array.from(
        new Set([anchor, ...linked].filter((t) => /^[1-4][1-8]$/.test(t))),
      );
      for (const tooth of teeth) {
        if (!map.has(tooth)) map.set(tooth, row);
      }
    }
    return map;
  }, [toothWorks]);

  const selectedTeeth = useMemo(() => new Set(byTooth.keys()), [byTooth]);
  /** 상·하악별로 FDI 순 치료할 치아만 (빈 칸 제외) */
  const treatedChartRows = useMemo(
    () =>
      TOOTH_CHART_ROWS.map((decade) => ({
        key: decade.key,
        label: decade.label,
        /** 전체 치식(브리지 인접 판별용) */
        chartTeeth: decade.teeth,
        teeth: treatedTeethInRow(decade.teeth, selectedTeeth),
      })).filter((row) => row.teeth.length > 0),
    [selectedTeeth],
  );
  /** compact(6칸) 영역을 넘는 악궁이 있으면 크게보기·스크롤 노출 */
  const needsOverflowControls = treatedChartRows.some(
    (row) => row.teeth.length > TOOTH_CHART_VISIBLE,
  );

  const { quote: feeQuote } = usePracticeTransferFeeQuote({
    enabled:
      !storedFeeQuote ||
      storedFeeQuote.labFeeConfigured === false ||
      storedFeeQuote.total <= 0,
    labAnchorId,
    toothWorks,
    storedQuote: storedFeeQuote,
    skipAbutmentFees,
  });

  const [toothChartOffsets, setToothChartOffsets] = useState<Record<string, number>>(() =>
    initialToothChartOffsets(
      treatedChartRows.map((row) => ({ key: row.key, teeth: row.teeth })),
    ),
  );
  const [toothChartEnlargeOpen, setToothChartEnlargeOpen] = useState(false);
  const embeddedMaxTeeth = embedded
    ? Math.max(0, ...treatedChartRows.map((row) => row.teeth.length))
    : 0;
  const toothChartVisibleCount = toothChartEnlargeOpen
    ? 16
    : embedded && embeddedMaxTeeth > 0
      ? Math.max(embeddedMaxTeeth, TOOTH_CHART_VISIBLE)
      : TOOTH_CHART_VISIBLE;

  if (selectedTeeth.size === 0) {
    return (
      <div className={cn("rounded-lg border border-dashed border-slate-200 px-3 py-4", className)}>
        <p className="text-center text-sm text-slate-400">선택된 보철물이 없습니다</p>
      </div>
    );
  }

  const toothCardShellClass = embedded
    ? "relative flex w-full min-w-0 flex-col items-center justify-start overflow-visible border px-0.5 pb-2 pt-1.5 min-h-[12rem]"
    : cn(
        "relative flex w-full min-w-0 flex-col items-center justify-start overflow-hidden border px-0.5 pb-1 pt-1.5 shadow-sm",
        TOOTH_CARD_HEIGHT_CLASS,
      );

  const chartRows = treatedChartRows.map((decade) => {
    const maxOffset = Math.max(0, decade.teeth.length - toothChartVisibleCount);
    const offset = Math.min(maxOffset, toothChartOffsets[decade.key] ?? 0);
    const visible = decade.teeth.slice(offset, offset + toothChartVisibleCount);

    return (
      <div key={`ro-decade-${decade.key}`} className="flex items-stretch gap-0.5">
        <div
          className="flex min-w-0 items-stretch"
          style={{
            width:
              visible.length >= toothChartVisibleCount
                ? "100%"
                : `calc(${(visible.length / toothChartVisibleCount) * 100}%)`,
            maxWidth: "100%",
          }}
        >
          {visible.map((toothNumber, visibleIndex) => {
            const row = byTooth.get(toothNumber);
            if (!row) return null;

            const chartIdx = decade.chartTeeth.indexOf(toothNumber);
            const chartNext =
              chartIdx >= 0 && chartIdx < decade.chartTeeth.length - 1
                ? decade.chartTeeth[chartIdx + 1]
                : null;
            const chartPrev = chartIdx > 0 ? decade.chartTeeth[chartIdx - 1] : null;
            const nextVisible = visible[visibleIndex + 1];
            const adjacentVisible =
              Boolean(chartNext) && nextVisible === chartNext;

            const nextRow = chartNext ? byTooth.get(chartNext) : undefined;
            const prevRow = chartPrev ? byTooth.get(chartPrev) : undefined;
            const linkedTeeth = (
              Array.isArray(row.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : []
            ).filter((t) => getAdjacentTeeth(row.toothNumber).includes(t));
            const linkedChartNext = Boolean(
              chartNext &&
                (linkedTeeth.includes(chartNext) ||
                  (nextRow &&
                    Array.isArray(nextRow.bridgeLinkedTeeth) &&
                    nextRow.bridgeLinkedTeeth.includes(toothNumber))),
            );
            const linkedChartPrev = Boolean(
              chartPrev &&
                (linkedTeeth.includes(chartPrev) ||
                  (prevRow &&
                    Array.isArray(prevRow.bridgeLinkedTeeth) &&
                    prevRow.bridgeLinkedTeeth.includes(toothNumber))),
            );
            const isLinked = linkedTeeth.length > 0 || linkedChartPrev || linkedChartNext;
            const bridgeLinked = linkedChartNext;
            // Read-only: no + control — only show connector when actually bridged.
            const showBridgeConnector = adjacentVisible && bridgeLinked;

            const bridgeSlot = showBridgeConnector ? (
              <div
                className="relative z-20 flex w-1.5 shrink-0 items-center justify-center self-stretch border-y border-primary bg-gradient-to-b from-primary-soft via-primary-soft to-white"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-3 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-primary/70"
                />
                <span
                  className="relative z-10 flex h-5 w-5 items-center justify-center rounded-full border border-primary bg-primary text-white ring-2 ring-primary-soft"
                  title={`${toothNumber}–${chartNext} 연결`}
                >
                  <span className="h-0.5 w-2.5 rounded-full bg-white" />
                </span>
              </div>
            ) : visibleIndex < visible.length - 1 ? (
              <div className="w-2 shrink-0" aria-hidden />
            ) : null;

            const isMissingTooth = isMissingToothProsthesisType(row.prosthesisType);
            const canShowCustom =
              !isMissingTooth &&
              isCustomAbutmentSupportedProsthesisType(row.prosthesisType) &&
              Boolean(row.customAbutment);
            const implantSummary = formatImplantSummary(row);
            const abutmentSummary = formatAbutmentSummary(row);
            const implantCompact = formatImplantCompact(row);
            const abutmentCompact = formatAbutmentCompact(row);

            return (
              <div key={`ro-tooth-slot-${toothNumber}`} className="contents">
                <div className={cn("relative", TOOTH_SLOT_CLASS)}>
                  {linkedChartNext && !showBridgeConnector ? (
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
                      toothCardShellClass,
                      isMissingTooth
                        ? isLinked
                          ? "border-primary bg-slate-50"
                          : "rounded-xl border-slate-300 bg-slate-50"
                        : isLinked
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
                    {isMissingTooth ? (
                      <svg
                        aria-hidden
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        className="pointer-events-none absolute inset-x-2 top-9 bottom-3 z-[5] text-slate-300/40"
                      >
                        <line
                          x1="8"
                          y1="8"
                          x2="92"
                          y2="92"
                          stroke="currentColor"
                          strokeWidth="10"
                          strokeLinecap="round"
                        />
                        <line
                          x1="92"
                          y1="8"
                          x2="8"
                          y2="92"
                          stroke="currentColor"
                          strokeWidth="10"
                          strokeLinecap="round"
                        />
                      </svg>
                    ) : null}

                    <span className="relative z-[1] flex h-10 items-center text-xl font-bold tabular-nums tracking-tight text-slate-800">
                      {row.toothNumber}
                    </span>

                    {isMissingTooth ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="relative z-20 mt-1.5 flex h-7 w-full min-w-0 max-w-full items-center justify-center self-stretch rounded-md bg-transparent px-0.5 text-center text-[11px] text-slate-500"
                          >
                            <span className="block w-full truncate px-0.5">
                              {NO_WORK_PROSTHESIS_TYPE}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                          {NO_WORK_PROSTHESIS_TOOLTIP}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <div
                        className="relative z-[1] mt-1.5 flex h-7 w-full min-w-0 max-w-full items-center justify-center self-stretch rounded-md border border-primary-muted/80 bg-white/80 px-0.5 text-center text-[11px] text-slate-600"
                      >
                        <span className="block w-full truncate px-0.5">
                          {row.prosthesisType || "-"}
                        </span>
                      </div>
                    )}

                    {canShowCustom ? (
                      <div className="mt-2 flex w-full flex-col items-center gap-0.5 leading-none">
                        <span className="inline-flex h-5 items-center text-[11px] leading-none text-primary-strong">
                          {row.prosthesisType === "크라운" ||
                          row.prosthesisType === "브리지" ||
                          isTemporaryToothProsthesisType(row.prosthesisType)
                            ? "어벗"
                            : "커스텀"}
                        </span>
                        {embedded ? (
                          <div className="flex w-full flex-col items-stretch gap-0.5 px-0.5">
                            <span className="h-5 w-full truncate px-0.5 text-center text-[10px] leading-none text-primary-strong">
                              {implantCompact || "임플란트"}
                            </span>
                            <span className="h-5 w-full truncate px-0.5 text-center text-[10px] leading-none text-service-abut">
                              {abutmentCompact || "스캔바디"}
                            </span>
                          </div>
                        ) : (
                          <TooltipProvider>
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
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
                {bridgeSlot}
              </div>
            );
          })}
        </div>
      </div>
    );
  });

  const shiftAllDecades = (delta: number) => {
    setToothChartOffsets((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const decade of treatedChartRows) {
        const maxOffset = Math.max(0, decade.teeth.length - toothChartVisibleCount);
        const cur = next[decade.key] ?? 0;
        const value = Math.min(maxOffset, Math.max(0, cur + delta));
        if (value !== cur) changed = true;
        next[decade.key] = value;
      }
      return changed ? next : prev;
    });
  };

  const canScrollLeft = treatedChartRows.some((decade) => {
    const maxOffset = Math.max(0, decade.teeth.length - toothChartVisibleCount);
    const offset = Math.min(maxOffset, toothChartOffsets[decade.key] ?? 0);
    return offset > 0;
  });
  const canScrollRight = treatedChartRows.some((decade) => {
    const maxOffset = Math.max(0, decade.teeth.length - toothChartVisibleCount);
    const offset = Math.min(maxOffset, toothChartOffsets[decade.key] ?? 0);
    return offset < maxOffset;
  });
  /** 현재 표시 칸 수를 넘는 악궁이 있을 때만 스크롤 */
  const showChartScroll = treatedChartRows.some(
    (decade) => decade.teeth.length > toothChartVisibleCount,
  );

  const scrollBtnClass =
    "h-7 w-7 shrink-0 rounded-md text-slate-500 hover:bg-white/80 hover:text-primary-strong disabled:opacity-30";

  const upperChartRow = chartRows.find((_, i) => treatedChartRows[i]?.key === "upper") ?? null;
  const lowerChartRow = chartRows.find((_, i) => treatedChartRows[i]?.key === "lower") ?? null;

  const feeEstimate = (
    <PracticeTransferFeeEstimate
      quote={feeQuote}
      viewer={feeViewer}
      skipJig={skipJig}
      labEffectiveStars={labEffectiveStars}
      className={
        embedded ? "border-0 bg-transparent px-0 py-1 shadow-none" : undefined
      }
      leadingAction={
        showChartScroll ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="5칸 왼쪽"
              className={scrollBtnClass}
              disabled={!canScrollLeft}
              onClick={() => shiftAllDecades(-TOOTH_CHART_SCROLL_JUMP)}
              aria-label="치식 5칸 이전"
            >
              <ChevronsLeft className="h-5 w-5" strokeWidth={2.25} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="1칸 왼쪽"
              className={scrollBtnClass}
              disabled={!canScrollLeft}
              onClick={() => shiftAllDecades(-TOOTH_CHART_SCROLL_STEP)}
              aria-label="치식 1칸 이전"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2.25} />
            </Button>
          </>
        ) : null
      }
      trailingAction={
        showChartScroll ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="1칸 오른쪽"
              className={scrollBtnClass}
              disabled={!canScrollRight}
              onClick={() => shiftAllDecades(TOOTH_CHART_SCROLL_STEP)}
              aria-label="치식 1칸 다음"
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2.25} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="5칸 오른쪽"
              className={scrollBtnClass}
              disabled={!canScrollRight}
              onClick={() => shiftAllDecades(TOOTH_CHART_SCROLL_JUMP)}
              aria-label="치식 5칸 다음"
            >
              <ChevronsRight className="h-5 w-5" strokeWidth={2.25} />
            </Button>
          </>
        ) : null
      }
    />
  );

  const chartBody = (
    <div className="space-y-2">
      {upperChartRow}
      {feeEstimate}
      {lowerChartRow}
    </div>
  );

  return (
    <div className={cn("space-y-2", className)}>
      {!toothChartEnlargeOpen ? (
        <>
          {showHeader ? (
            <div className="relative flex min-h-8 items-center">
              <p className="text-sm font-medium text-slate-700">
                보철물{" "}
                <span className="font-normal text-muted-foreground">({selectedTeeth.size}개)</span>
              </p>
              {needsOverflowControls ? (
                <div className="absolute right-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 text-xs"
                    onClick={() => {
                      setToothChartOffsets(
                        initialToothChartOffsets(
                          treatedChartRows.map((row) => ({ key: row.key, teeth: row.teeth })),
                        ),
                      );
                      setToothChartEnlargeOpen(true);
                    }}
                  >
                    크게 보기
                  </Button>
                </div>
              ) : null}
            </div>
          ) : needsOverflowControls ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs"
                onClick={() => {
                  setToothChartOffsets(
                    initialToothChartOffsets(
                      treatedChartRows.map((row) => ({ key: row.key, teeth: row.teeth })),
                    ),
                  );
                  setToothChartEnlargeOpen(true);
                }}
              >
                크게 보기
              </Button>
            </div>
          ) : null}
          {chartBody}
        </>
      ) : null}

      <Dialog open={toothChartEnlargeOpen} onOpenChange={setToothChartEnlargeOpen}>
        <DialogContent
          overlayClassName={embedded ? "z-[330]" : "z-[110]"}
          className={cn(
            embedded
              ? "z-[330]"
              : "z-[110]",
            "w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] gap-3 p-4 sm:max-w-[calc(100vw-1rem)] sm:p-5",
          )}
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
