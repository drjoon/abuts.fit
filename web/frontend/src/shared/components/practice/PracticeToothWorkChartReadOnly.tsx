// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/shared/practice/transferMemo.ts
// - 2026-08-19: 수가 Off면 live quote-context로 기공비 미설정·어벗 단가 표시.
// - 2026-08-19: 치아 옆 스크롤·R/M/L 제거. 견적 바에 << < > >>(1칸·5칸).
// - 2026-09-02: 가로폭 부족 시 overflow-x 스크롤(<< < > >> 버튼 제거) + custom-scrollbar-x.
// - 2026-09-01: 후속 제작 모달 — 보철물 카드에서 크라운·브리지 단위 선택.
// - 2026-09-01: 컨테이너 폭에 따라 inline 칸 수 4~8, 카드 폭 5rem 고정(→ 2026-09-02 overflow-x 스크롤).
// - 2026-09-02: 모바일 — 스팬 단위 세로 목록(전폭 균등 분할), 크게 보기 생략.
// - 2026-09-02: 모바일 5연결+ 브리지 — 치아당 5rem 고정폭 + 가로 스와이프.
// - 2026-08-25: 구강스캔(기공의뢰)은 디자인+생산 고정 — 치식 카드 모드 라벨 제거(작성 UI와 동일).
// - 2026-09-02: full 치식 슬롯 래퍼 contents 복구 — shrink-0이 flex-1 전폭 분할을 막던 문제.
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  collectAdjacentBridgeLinks,
  getAdjacentTeeth,
  isCustomAbutmentSupportedProsthesisType,
  isMissingToothProsthesisType,
  isTemporaryToothProsthesisType,
  NO_WORK_PROSTHESIS_TYPE,
  NO_WORK_PROSTHESIS_TOOLTIP,
} from "@/shared/practice/usePracticeToothWorkEditor";
import { PracticeTransferFeeEstimate } from "@/shared/components/practice/PracticeTransferFeeEstimate";
import { PracticeToothChartHorizontalScroll } from "@/shared/components/practice/PracticeToothChartHorizontalScroll";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { usePracticeTransferFeeQuote } from "@/shared/practice/usePracticeTransferFeeQuote";
import type {
  PracticeTransferFeeQuote,
  PracticeTransferFeeQuoteViewer,
} from "@/shared/practice/practiceTransferFeeQuote";

const TOOTH_CARD_WIDTH_CLASS = "w-[5rem] max-w-[5rem] shrink-0";
const SCROLL_TOOTH_SLOT_CLASS = "relative w-[5rem] max-w-[5rem] shrink-0 snap-start";
const TOOTH_CARD_HEIGHT_CLASS = "h-[12rem]";
const TOOTH_SLOT_CLASS = TOOTH_CARD_WIDTH_CLASS;
/** full(16칸) — 전폭 균등 분할 */
const TOOTH_SLOT_FULL_CLASS = "min-w-0 flex-1 basis-0";
const BRIDGE_GAP_MIDLINE_CLASS = "w-2.5 shrink-0";

const toToothDecadeSortNumber = (toothNumber: string) => {
  const raw = String(toothNumber || "").trim();
  if (!/^[1-4][1-8]$/.test(raw)) return Number.MAX_SAFE_INTEGER;
  const tens = Number(raw[0]);
  const ones = Number(raw[1]);
  const decadeBase = (tens - 1) * 10;
  if (tens === 1 || tens === 3) return decadeBase + (8 - ones);
  return decadeBase + (ones - 1);
};

const isUpperArchTooth = (toothNumber: string) =>
  /^[12]/.test(String(toothNumber || "").trim());

/** 인접 브리지 연결을 묶어 스팬 단위 치아 목록으로 합친다 (44-45 / 44-45-46 중복 방지). */
const buildBridgeSpanTeethList = (rows: ToothWorkSelection[]): string[][] => {
  const allTeeth = new Set<string>();
  for (const row of rows) {
    const anchor = String(row.toothNumber || "").trim();
    if (/^[1-4][1-8]$/.test(anchor)) allTeeth.add(anchor);
    for (const linked of Array.isArray(row.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : []) {
      const tooth = String(linked || "").trim();
      if (/^[1-4][1-8]$/.test(tooth)) allTeeth.add(tooth);
    }
  }

  const adjacency = new Map<string, Set<string>>();
  const linkTeeth = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  };

  for (const tooth of allTeeth) {
    for (const linked of collectAdjacentBridgeLinks(rows, tooth)) {
      linkTeeth(tooth, linked);
    }
  }

  const visited = new Set<string>();
  const spans: string[][] = [];
  const sortedTeeth = [...allTeeth].sort(
    (a, b) => toToothDecadeSortNumber(a) - toToothDecadeSortNumber(b),
  );

  for (const tooth of sortedTeeth) {
    if (visited.has(tooth)) continue;
    const component: string[] = [];
    const queue = [tooth];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      for (const neighbor of adjacency.get(current) || []) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
    spans.push(
      component.sort((a, b) => toToothDecadeSortNumber(a) - toToothDecadeSortNumber(b)),
    );
  }

  return spans.sort(
    (a, b) => toToothDecadeSortNumber(a[0] || "") - toToothDecadeSortNumber(b[0] || ""),
  );
};

type MobileSpanEntry = {
  teeth: string[];
  row: ToothWorkSelection;
  spanKey: string;
};

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
  /** embedded 안의 크게 보기 — 부모 Dialog 위 z-index */
  enlargeOverlayClassName?: string;
  enlargeDialogClassName?: string;
  /** 기공소 뷰 — 자동매칭 기공비 별점 확정가 */
  labEffectiveStars?: number | null;
  /** 크라운·브리지 단위 선택 (후속 제작 모달) */
  selectable?: boolean;
  selectedSpanKeys?: ReadonlySet<string>;
  onToggleSpanKey?: (spanKey: string, selected: boolean) => void;
  spanKeyOf?: (row: ToothWorkSelection) => string;
  /** 선택 모드 — 견적·헤더 개수용 (미전달 시 선택된 스팬만 toothWorks에서 유도) */
  feeToothWorks?: ToothWorkSelection[];
  selectionDisabled?: boolean;
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
  enlargeOverlayClassName,
  enlargeDialogClassName,
  labEffectiveStars = null,
  selectable = false,
  selectedSpanKeys,
  onToggleSpanKey,
  spanKeyOf,
  feeToothWorks,
  selectionDisabled = false,
}: PracticeToothWorkChartReadOnlyProps) => {
  const isMobile = useIsMobile();
  const [toothChartEnlargeOpen, setToothChartEnlargeOpen] = useState(false);

  const resolveSpanKey = (row: ToothWorkSelection) =>
    spanKeyOf?.(row) || String(row.toothNumber || "").trim();

  const isSpanSelected = (row: ToothWorkSelection) => {
    if (!selectable) return true;
    return selectedSpanKeys?.has(resolveSpanKey(row)) ?? false;
  };

  const quoteToothWorks = useMemo(() => {
    if (feeToothWorks) return feeToothWorks;
    if (!selectable) return toothWorks;
    return toothWorks.filter((row) => isSpanSelected(row));
  }, [feeToothWorks, selectable, toothWorks, selectedSpanKeys, spanKeyOf]);
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

  const allDisplayTeeth = useMemo(() => new Set(byTooth.keys()), [byTooth]);

  const selectedTeeth = useMemo(() => {
    if (!selectable) return allDisplayTeeth;
    const next = new Set<string>();
    for (const [tooth, row] of byTooth.entries()) {
      if (isSpanSelected(row)) next.add(tooth);
    }
    return next;
  }, [allDisplayTeeth, byTooth, selectable, selectedSpanKeys, spanKeyOf]);

  const chartTeeth = selectable ? allDisplayTeeth : selectedTeeth;

  const mobileSpanEntries = useMemo((): MobileSpanEntry[] => {
    const spans = buildBridgeSpanTeethList(toothWorks);
    const entries: MobileSpanEntry[] = [];
    for (const teeth of spans) {
      const anchor = teeth[0] || "";
      if (!anchor) continue;
      const row =
        byTooth.get(anchor) ||
        toothWorks.find((candidate) => String(candidate.toothNumber || "").trim() === anchor);
      if (!row) continue;
      const spanKey =
        spanKeyOf?.({
          ...row,
          toothNumber: anchor,
          bridgeLinkedTeeth: teeth.slice(1),
        }) || teeth.join("-");
      entries.push({ teeth, row, spanKey });
    }
    return entries;
  }, [toothWorks, byTooth, spanKeyOf]);

  const upperSpanEntries = useMemo(
    () => mobileSpanEntries.filter((entry) => isUpperArchTooth(entry.teeth[0] || "")),
    [mobileSpanEntries],
  );
  const lowerSpanEntries = useMemo(
    () => mobileSpanEntries.filter((entry) => !isUpperArchTooth(entry.teeth[0] || "")),
    [mobileSpanEntries],
  );
  /** 크게 보기 — 상·하악 16칸 전체 */
  const fullChartRows = useMemo(
    () =>
      TOOTH_CHART_ROWS.map((decade) => ({
        key: decade.key,
        label: decade.label,
        chartTeeth: decade.teeth,
        teeth: [...decade.teeth],
      })),
    [],
  );
  /** 상·하악별로 FDI 순 치료할 치아만 (빈 칸 제외) */
  const treatedChartRows = useMemo(
    () =>
      TOOTH_CHART_ROWS.map((decade) => ({
        key: decade.key,
        label: decade.label,
        /** 전체 치식(브리지 인접 판별용) */
        chartTeeth: decade.teeth,
        teeth: treatedTeethInRow(decade.teeth, chartTeeth),
      })).filter((row) => row.teeth.length > 0),
    [chartTeeth],
  );
  /** embedded — 좁은 영역이라 치아 수와 무관하게 크게 보기 제공 (모바일은 전폭 스팬 목록으로 생략) */
  const showEnlargeButton = isMobile
    ? false
    : embedded
      ? allDisplayTeeth.size > 0
      : treatedChartRows.some((row) => row.teeth.length > 6);
  const enlargeButtonLabel = embedded ? "보철물 크게 보기" : "크게 보기";

  const { quote: feeQuote } = usePracticeTransferFeeQuote({
    enabled:
      !storedFeeQuote ||
      storedFeeQuote.labFeeConfigured === false ||
      storedFeeQuote.total <= 0,
    labAnchorId,
    toothWorks: quoteToothWorks,
    storedQuote: storedFeeQuote,
    skipAbutmentFees,
  });

  const enlargeOverlayClass =
    enlargeOverlayClassName || (embedded ? "z-[350]" : "z-[110]");
  const enlargeDialogClass =
    enlargeDialogClassName || (embedded ? "z-[360]" : "z-[110]");

  if (allDisplayTeeth.size === 0) {
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
  const fullToothCardShellClass = cn(
    "relative flex w-full min-w-0 flex-col items-center justify-start overflow-hidden border px-0.5 pb-1 pt-1.5 shadow-sm",
    TOOTH_CARD_HEIGHT_CLASS,
  );

  const renderBridgeGap = (
    toothNumber: string,
    chartNext: string | null,
    bridgeLinked: boolean,
    adjacentVisible: boolean,
    fullLayout: boolean,
    hasNextInRow: boolean,
  ) => {
    if (bridgeLinked && adjacentVisible) {
      return (
        <div className="relative z-20 flex w-1.5 shrink-0 items-center justify-center self-stretch border-y border-primary bg-gradient-to-b from-primary-soft via-primary-soft to-white">
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
      );
    }
    if (!hasNextInRow) return null;
    const isMidlinePair =
      (toothNumber === "11" && chartNext === "21") ||
      (toothNumber === "41" && chartNext === "31");
    if (fullLayout) {
      return (
        <div
          className={cn(
            "shrink-0 self-stretch",
            isMidlinePair ? BRIDGE_GAP_MIDLINE_CLASS : "w-1.5",
          )}
          aria-hidden
        />
      );
    }
    return <div className="w-2 shrink-0" aria-hidden />;
  };

  const mobileToothCardShellClass =
    "relative flex w-full min-w-0 flex-1 basis-0 flex-col items-center justify-start overflow-hidden border px-1 pb-2 pt-1.5 shadow-sm min-h-[10rem]";

  const renderMobileSpanBridgeGap = () => (
    <div
      className="relative z-20 flex w-3 shrink-0 items-center justify-center self-stretch border-y border-primary bg-gradient-to-b from-primary-soft via-primary-soft to-white"
      aria-hidden
    >
      <span
        className="pointer-events-none absolute inset-y-3 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-primary/70"
      />
      <span
        className="relative z-10 flex h-5 w-5 items-center justify-center rounded-full border border-primary bg-primary text-white ring-2 ring-primary-soft"
      >
        <span className="h-0.5 w-2.5 rounded-full bg-white" />
      </span>
    </div>
  );

  const renderMobileToothCard = (
    row: ToothWorkSelection,
    toothNumber: string,
    spanIndex: number,
    spanLength: number,
  ) => {
    const isMissingTooth = isMissingToothProsthesisType(row.prosthesisType);
    const spanKey = resolveSpanKey(row);
    const spanSelected = isSpanSelected(row);
    const isFirst = spanIndex === 0;
    const isLast = spanIndex === spanLength - 1;
    const isLinked = spanLength > 1;

    const canShowCustom =
      !isMissingTooth &&
      isCustomAbutmentSupportedProsthesisType(row.prosthesisType) &&
      Boolean(row.customAbutment);
    const implantCompact = formatImplantCompact(row);
    const abutmentCompact = formatAbutmentCompact(row);

    return (
      <div key={`mobile-tooth-${spanKey}-${toothNumber}`} className={SCROLL_TOOTH_SLOT_CLASS}>
        <div
          className={cn(
            mobileToothCardShellClass,
            !spanSelected && selectable && "opacity-55 saturate-50",
            isMissingTooth
              ? isLinked
                ? "border-primary bg-slate-50"
                : "rounded-xl border-slate-300 bg-slate-50"
              : spanSelected
                ? isLinked
                  ? "border-primary bg-gradient-to-b from-primary-soft via-primary-soft/95 to-white ring-1 ring-primary/40"
                  : "rounded-xl border-primary/90 bg-gradient-to-b from-primary-soft via-white to-primary-soft/40 ring-1 ring-primary-muted/40"
                : isLinked
                  ? "border-slate-300 bg-slate-50"
                  : "rounded-xl border-slate-300 bg-slate-50",
            isLinked && spanSelected && isFirst && isLast && "rounded-xl",
            isLinked && spanSelected && isFirst && !isLast && "rounded-l-xl rounded-r-none",
            isLinked && spanSelected && !isFirst && isLast && "rounded-r-xl rounded-l-none",
            isLinked && spanSelected && !isFirst && !isLast && "rounded-none",
            isLinked && spanSelected && !isFirst && "border-l-0",
            isLinked && spanSelected && !isLast && "border-r-0",
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
            {toothNumber}
          </span>

          {isMissingTooth ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative z-20 mt-1.5 flex h-7 w-full min-w-0 items-center justify-center self-stretch rounded-md bg-transparent px-0.5 text-center text-[11px] text-slate-500">
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
            <div className="relative z-[1] mt-1.5 flex h-7 w-full min-w-0 items-center justify-center self-stretch rounded-md border border-primary-muted/80 bg-white/80 px-0.5 text-center text-[11px] text-slate-600">
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
              <div className="flex w-full flex-col items-stretch gap-0.5 px-0.5">
                <span className="min-h-5 w-full px-0.5 text-center text-[10px] leading-snug text-primary-strong [overflow-wrap:anywhere]">
                  {implantCompact || "임플란트"}
                </span>
                <span className="min-h-5 w-full px-0.5 text-center text-[10px] leading-snug text-service-abut [overflow-wrap:anywhere]">
                  {abutmentCompact || "스캔바디"}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const renderMobileSpanRow = (entry: MobileSpanEntry) => {
    const { teeth, row, spanKey } = entry;
    if (teeth.length === 0) return null;
    const spanSelected = selectable ? (selectedSpanKeys?.has(spanKey) ?? false) : true;

    return (
      <div key={`mobile-span-${spanKey}`} className="flex items-stretch gap-2">
        {selectable ? (
          <div
            className="flex shrink-0 items-start pt-2"
            onClick={(event) => event.stopPropagation()}
          >
            <Checkbox
              checked={spanSelected}
              disabled={selectionDisabled}
              onCheckedChange={(checked) =>
                onToggleSpanKey?.(spanKey, checked === true)
              }
              aria-label={`${row.prosthesisType || "보철"} ${spanKey} 선택`}
            />
          </div>
        ) : null}
        <PracticeToothChartHorizontalScroll
          className="min-w-0 w-full max-w-full flex-1"
          ariaLabel={`${spanKey} 브리지 — 가로로 스크롤`}
        >
          <div className="inline-flex w-max items-stretch">
            {teeth.map((toothNumber, index) => (
              <div
                key={`mobile-span-tooth-${spanKey}-${toothNumber}`}
                className="flex shrink-0 items-stretch"
              >
                {renderMobileToothCard(row, toothNumber, index, teeth.length)}
                {index < teeth.length - 1 ? renderMobileSpanBridgeGap() : null}
              </div>
            ))}
          </div>
        </PracticeToothChartHorizontalScroll>
      </div>
    );
  };

  const renderMobileArchSection = (
    label: string,
    entries: MobileSpanEntry[],
  ) => {
    if (entries.length === 0) return null;
    return (
      <div className="space-y-2">
        {upperSpanEntries.length > 0 && lowerSpanEntries.length > 0 ? (
          <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        ) : null}
        {entries.map((entry) => renderMobileSpanRow(entry))}
      </div>
    );
  };

  const buildChartRows = (
    decades: typeof treatedChartRows,
    options: { fullLayout: boolean },
  ) => {
    const { fullLayout } = options;
    const slotClass = fullLayout ? TOOTH_SLOT_FULL_CLASS : TOOTH_SLOT_CLASS;
    const cardShellClass = fullLayout ? fullToothCardShellClass : toothCardShellClass;

    return decades.map((decade) => {
      const visible = decade.teeth;

      const rowTrack = (
        <div
          className={cn(
            "items-stretch gap-0.5",
            fullLayout ? "flex w-full min-w-0" : "inline-flex w-max",
          )}
        >
          {visible.map((toothNumber, visibleIndex) => {
              const row = byTooth.get(toothNumber);
              if (!row && !fullLayout) return null;

              const chartIdx = decade.chartTeeth.indexOf(toothNumber);
              const chartNext =
                chartIdx >= 0 && chartIdx < decade.chartTeeth.length - 1
                  ? decade.chartTeeth[chartIdx + 1]
                  : null;
              const chartPrev = chartIdx > 0 ? decade.chartTeeth[chartIdx - 1] : null;
              const nextVisible = visible[visibleIndex + 1];
              const adjacentVisible = Boolean(chartNext) && nextVisible === chartNext;

              if (!row) {
                return (
                  <div
                    key={`ro-tooth-slot-${toothNumber}`}
                    className={
                      fullLayout ? "contents" : "flex shrink-0 items-stretch"
                    }
                  >
                    <div className={cn("relative", slotClass)}>
                      <div
                        className={cn(
                          cardShellClass,
                          "rounded-xl border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80",
                        )}
                      >
                        <span className="flex h-10 items-center text-xl font-bold tabular-nums tracking-tight text-slate-300">
                          {toothNumber}
                        </span>
                      </div>
                    </div>
                    {renderBridgeGap(
                      toothNumber,
                      chartNext,
                      false,
                      adjacentVisible,
                      fullLayout,
                      visibleIndex < visible.length - 1,
                    )}
                  </div>
                );
              }

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
              const showBridgeConnector = adjacentVisible && bridgeLinked;

              const isMissingTooth = isMissingToothProsthesisType(row.prosthesisType);
              const spanKey = resolveSpanKey(row);
              const spanSelected = isSpanSelected(row);
              const isAnchorTooth =
                String(row.toothNumber || "").trim() === toothNumber;
              const canToggleSpan =
                selectable && Boolean(onToggleSpanKey) && !selectionDisabled;

              const toggleSpanSelection = () => {
                if (!canToggleSpan) return;
                onToggleSpanKey?.(spanKey, !spanSelected);
              };
              const canShowCustom =
                !isMissingTooth &&
                isCustomAbutmentSupportedProsthesisType(row.prosthesisType) &&
                Boolean(row.customAbutment);
              const implantSummary = formatImplantSummary(row);
              const abutmentSummary = formatAbutmentSummary(row);
              const implantCompact = formatImplantCompact(row);
              const abutmentCompact = formatAbutmentCompact(row);

              return (
                <div
                  key={`ro-tooth-slot-${toothNumber}`}
                  className={
                    fullLayout ? "contents" : "flex shrink-0 items-stretch"
                  }
                >
                  <div className={cn("relative", slotClass)}>
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
                      role={canToggleSpan ? "button" : undefined}
                      tabIndex={canToggleSpan ? 0 : undefined}
                      onClick={canToggleSpan ? toggleSpanSelection : undefined}
                      onKeyDown={
                        canToggleSpan
                          ? (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                toggleSpanSelection();
                              }
                            }
                          : undefined
                      }
                      className={cn(
                        cardShellClass,
                        canToggleSpan && "cursor-pointer",
                        !spanSelected && selectable && "opacity-55 saturate-50",
                        isMissingTooth
                          ? isLinked
                            ? "border-primary bg-slate-50"
                            : "rounded-xl border-slate-300 bg-slate-50"
                          : spanSelected
                            ? isLinked
                              ? "border-primary bg-gradient-to-b from-primary-soft via-primary-soft/95 to-white ring-1 ring-primary/40"
                              : "rounded-xl border-primary/90 bg-gradient-to-b from-primary-soft via-white to-primary-soft/40 ring-1 ring-primary-muted/40"
                            : isLinked
                              ? "border-slate-300 bg-slate-50"
                              : "rounded-xl border-slate-300 bg-slate-50",
                        isLinked && spanSelected && !linkedChartPrev && !linkedChartNext && "rounded-xl",
                        isLinked && spanSelected && linkedChartPrev && linkedChartNext && "rounded-none",
                        isLinked && spanSelected && linkedChartPrev && !linkedChartNext && "rounded-r-xl rounded-l-none",
                        isLinked && spanSelected && !linkedChartPrev && linkedChartNext && "rounded-l-xl rounded-r-none",
                        isLinked && spanSelected && linkedChartPrev && "border-l-0",
                        isLinked && spanSelected && linkedChartNext && "border-r-0",
                      )}
                    >
                      {selectable && isAnchorTooth ? (
                        <div
                          className="absolute left-1 top-1 z-30"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Checkbox
                            checked={spanSelected}
                            disabled={selectionDisabled}
                            onCheckedChange={(checked) =>
                              onToggleSpanKey?.(spanKey, checked === true)
                            }
                            aria-label={`${row.prosthesisType || "보철"} ${spanKey} 선택`}
                          />
                        </div>
                      ) : null}
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
                        {toothNumber}
                      </span>

                      {isMissingTooth ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="relative z-20 mt-1.5 flex h-7 w-full min-w-0 max-w-full items-center justify-center self-stretch rounded-md bg-transparent px-0.5 text-center text-[11px] text-slate-500">
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
                        <div className="relative z-[1] mt-1.5 flex h-7 w-full min-w-0 max-w-full items-center justify-center self-stretch rounded-md border border-primary-muted/80 bg-white/80 px-0.5 text-center text-[11px] text-slate-600">
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
                          {embedded && !fullLayout ? (
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
                  {renderBridgeGap(
                    toothNumber,
                    chartNext,
                    showBridgeConnector,
                    adjacentVisible,
                    fullLayout,
                    visibleIndex < visible.length - 1,
                  )}
                </div>
              );
            })}
        </div>
      );

      return (
        <div
          key={`ro-decade-${decade.key}-${fullLayout ? "full" : "compact"}`}
          className="w-full min-w-0 max-w-full"
        >
          {fullLayout ? (
            rowTrack
          ) : (
            <PracticeToothChartHorizontalScroll
              ariaLabel={`${decade.label} 치식 가로 스크롤`}
            >
              {rowTrack}
            </PracticeToothChartHorizontalScroll>
          )}
        </div>
      );
    });
  };

  const inlineChartRows = buildChartRows(treatedChartRows, {
    fullLayout: false,
  });
  const enlargeChartRows = buildChartRows(fullChartRows, {
    fullLayout: true,
  });

  const upperInlineRow = (() => {
    const idx = treatedChartRows.findIndex((row) => row.key === "upper");
    return idx >= 0 ? inlineChartRows[idx] : null;
  })();
  const lowerInlineRow = (() => {
    const idx = treatedChartRows.findIndex((row) => row.key === "lower");
    return idx >= 0 ? inlineChartRows[idx] : null;
  })();
  const upperEnlargeRow = enlargeChartRows[0] ?? null;
  const lowerEnlargeRow = enlargeChartRows[1] ?? null;

  const feeEstimate = (
    <PracticeTransferFeeEstimate
      quote={feeQuote}
      viewer={feeViewer}
      skipJig={skipJig}
      labEffectiveStars={labEffectiveStars}
      className={
        embedded ? "border-0 bg-transparent px-0 py-1 shadow-none" : undefined
      }
    />
  );

  const inlineChartBody = isMobile ? (
    <div className="space-y-3">
      {renderMobileArchSection("상악", upperSpanEntries)}
      <PracticeTransferFeeEstimate
        quote={feeQuote}
        viewer={feeViewer}
        skipJig={skipJig}
        labEffectiveStars={labEffectiveStars}
        className={
          embedded ? "border-0 bg-transparent px-0 py-1 shadow-none" : undefined
        }
      />
      {renderMobileArchSection("하악", lowerSpanEntries)}
    </div>
  ) : (
    <div className="space-y-2">
      {upperInlineRow}
      {feeEstimate}
      {lowerInlineRow}
    </div>
  );

  const enlargeChartBody = isMobile ? (
    inlineChartBody
  ) : (
    <div className="space-y-2">
      {upperEnlargeRow}
      <PracticeTransferFeeEstimate
        quote={feeQuote}
        viewer={feeViewer}
        skipJig={skipJig}
        labEffectiveStars={labEffectiveStars}
        className={embedded ? "border-0 bg-transparent px-0 py-1 shadow-none" : undefined}
      />
      {lowerEnlargeRow}
    </div>
  );

  const openEnlargeDialog = () => {
    setToothChartEnlargeOpen(true);
  };

  const enlargeButton = showEnlargeButton ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 px-2.5 text-xs"
      onClick={openEnlargeDialog}
    >
      {enlargeButtonLabel}
    </Button>
  ) : null;

  return (
    <div className={cn("min-w-0 max-w-full space-y-2", className)}>
      {!toothChartEnlargeOpen ? (
        <>
          {showHeader ? (
            <div className="relative flex min-h-8 items-center">
              <p className="text-sm font-medium text-slate-700">
                보철물{" "}
                <span className="font-normal text-muted-foreground">
                  ({selectable ? selectedTeeth.size : allDisplayTeeth.size}개)
                </span>
              </p>
              {enlargeButton ? <div className="absolute right-0">{enlargeButton}</div> : null}
            </div>
          ) : enlargeButton ? (
            <div className="flex justify-end">{enlargeButton}</div>
          ) : null}
          {inlineChartBody}
        </>
      ) : null}

      <Dialog open={toothChartEnlargeOpen} onOpenChange={setToothChartEnlargeOpen}>
        <DialogContent
          overlayClassName={enlargeOverlayClass}
          className={cn(
            enlargeDialogClass,
            "w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] gap-3 p-4 sm:max-w-[calc(100vw-1rem)] sm:p-5",
          )}
        >
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="text-base">
              보철물{" "}
              <span className="font-normal text-muted-foreground">
                ({selectable ? selectedTeeth.size : allDisplayTeeth.size}개)
              </span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              보철물 치식 차트를 가로로 크게 봅니다.
            </DialogDescription>
          </DialogHeader>
          {toothChartEnlargeOpen ? enlargeChartBody : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};
