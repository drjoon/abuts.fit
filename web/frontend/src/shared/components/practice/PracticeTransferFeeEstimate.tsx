// related files:
// - web/frontend/src/shared/practice/practiceTransferFeeQuote.ts
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/components/practice/PracticeToothWorkChartReadOnly.tsx
// - 2026-08-13: 치아번호 10→20→30→40번대 순으로 표시.
import { CircleHelp } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import {
  formatWon,
  sortPracticeTransferFeeLines,
  type PracticeTransferFeeQuote,
  type PracticeTransferFeeQuoteViewer,
} from "@/shared/practice/practiceTransferFeeQuote";

type PracticeTransferFeeEstimateProps = {
  quote: PracticeTransferFeeQuote;
  viewer: PracticeTransferFeeQuoteViewer;
  className?: string;
  /** compact: 상·하악 사이 / card: 의뢰카드 */
  density?: "chart" | "card";
};

const scaleWon = (value: number, keepRate: number) =>
  Math.max(0, Math.round(Number(value || 0) * keepRate));

const formatCell = (value: number) => (value > 0 ? formatWon(value) : "—");

type FeeBreakdownLine = {
  toothNumber: string;
  prosthesisType: string;
  labFee: number;
  abutmentRetail: number;
};

function FeeBreakdownTable({
  lines,
  showLabColumn,
  showAbutmentColumn,
}: {
  lines: FeeBreakdownLine[];
  showLabColumn: boolean;
  showAbutmentColumn: boolean;
}) {
  const labTotal = lines.reduce((sum, line) => sum + line.labFee, 0);
  const abutmentTotal = lines.reduce((sum, line) => sum + line.abutmentRetail, 0);
  const colCount = 1 + Number(showLabColumn) + Number(showAbutmentColumn);
  const gridClass =
    colCount === 3
      ? "grid-cols-[minmax(6.5rem,1fr)_auto_auto]"
      : colCount === 2
        ? "grid-cols-[minmax(6.5rem,1fr)_auto]"
        : "grid-cols-1";

  return (
    <div className={cn("grid gap-x-3 gap-y-0.5 tabular-nums", gridClass)}>
      <span className="pb-0.5 text-[10px] font-medium text-muted-foreground">
        <span className="sr-only">보철물</span>
      </span>
      {showLabColumn ? (
        <span className="whitespace-nowrap pb-0.5 text-right text-[10px] font-medium text-muted-foreground">
          기공소 제공
        </span>
      ) : null}
      {showAbutmentColumn ? (
        <span className="whitespace-nowrap pb-0.5 text-right text-[10px] font-medium text-muted-foreground">
          어벗츠 제공
        </span>
      ) : null}
      {lines.map((line, idx) => (
        <div key={`${line.toothNumber}:${idx}`} className="contents">
          <span className="min-w-0 truncate">
            {line.toothNumber ? `${line.toothNumber} ` : ""}
            {line.prosthesisType || "보철"}
          </span>
          {showLabColumn ? (
            <span className="whitespace-nowrap text-right">{formatCell(line.labFee)}</span>
          ) : null}
          {showAbutmentColumn ? (
            <span className="whitespace-nowrap text-right">
              {formatCell(line.abutmentRetail)}
            </span>
          ) : null}
        </div>
      ))}
      {colCount > 1 ? (
        <>
          <span className="mt-0.5 border-t border-foreground/15 pt-1.5 font-medium">
            합계
          </span>
          {showLabColumn ? (
            <span className="mt-0.5 whitespace-nowrap border-t border-foreground/15 pt-1.5 text-right font-medium">
              {formatCell(labTotal)}
            </span>
          ) : null}
          {showAbutmentColumn ? (
            <span className="mt-0.5 whitespace-nowrap border-t border-foreground/15 pt-1.5 text-right font-medium">
              {formatCell(abutmentTotal)}
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function PracticeTransferFeeEstimate({
  quote,
  viewer,
  className,
  density = "chart",
}: PracticeTransferFeeEstimateProps) {
  const isLab = viewer === "lab";
  const amount = isLab ? quote.labSettlementAmount : quote.total;
  const title = quote.isRemake
    ? isLab
      ? "리메이크 기공비"
      : "리메이크 견적"
    : isLab
      ? "기공비 총액"
      : "견적";
  const keepRate =
    isLab && quote.total > 0 ? quote.labSettlementAmount / quote.total : 1;
  const simple = isLab
    ? null
    : quote.isRemake
      ? `리메이크 기공비 ${formatWon(quote.labFeeTotal)}`
      : quote.labFeeTotal > 0 && quote.abutmentRetailTotal > 0
        ? `기공비 ${formatWon(quote.labFeeTotal)} · 어벗 ${formatWon(quote.abutmentRetailTotal)}`
        : quote.abutmentRetailTotal > 0
          ? `어벗 ${formatWon(quote.abutmentRetailTotal)}`
          : `기공비 ${formatWon(quote.labFeeTotal)}`;

  const isCard = density === "card";

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            data-no-tooth-marquee=""
            className={cn(
              "group flex items-center justify-center gap-2 text-center",
              isCard
                ? "mt-2 justify-start gap-1.5 text-left"
                : "rounded-lg border border-primary-muted/50 bg-primary-soft/40 px-3 py-1.5",
              className,
            )}
            role="note"
            title={!isLab ? "마우스를 올리면 금액이 보입니다" : undefined}
            onClick={isCard ? (event) => event.stopPropagation() : undefined}
            onKeyDown={isCard ? (event) => event.stopPropagation() : undefined}
          >
            <div
              className={cn(
                "min-w-0",
                isCard ? "flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5" : "",
                !isLab &&
                  "select-none blur-[8px] transition-[filter] duration-150 group-hover:select-text group-hover:blur-none group-focus-within:select-text group-focus-within:blur-none",
              )}
            >
              <p
                className={cn(
                  "font-semibold tabular-nums text-slate-800",
                  isCard ? "text-sm" : "text-sm sm:text-base",
                )}
              >
                <span className="font-medium text-slate-600">{title} </span>
                {formatWon(amount)}
              </p>
              {simple ? (
                <p
                  className={cn(
                    "truncate text-[11px] text-muted-foreground",
                    isCard ? "" : "mt-0.5",
                  )}
                >
                  {simple}
                </p>
              ) : null}
            </div>
            <CircleHelp className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
          </div>
        </TooltipTrigger>
        <TooltipContent
          side={isCard ? "top" : "bottom"}
          className="max-w-[22rem] p-3 text-xs leading-relaxed"
        >
          {quote.lines.length > 0 ? (
            <FeeBreakdownTable
              lines={sortPracticeTransferFeeLines(quote.lines).map((line) => ({
                toothNumber: line.toothNumber,
                prosthesisType: line.prosthesisType,
                labFee: scaleWon(line.labFee, keepRate),
                abutmentRetail: scaleWon(line.abutmentRetail, keepRate),
              }))}
              showLabColumn={quote.lines.some((line) => line.labFee > 0)}
              showAbutmentColumn={quote.lines.some((line) => line.abutmentRetail > 0)}
            />
          ) : (
            <p className="text-muted-foreground">선택된 보철물이 없습니다.</p>
          )}
          <p className="mt-1.5 border-t border-foreground/15 pt-1.5 font-medium tabular-nums">
            {isLab
              ? `기공비 총액 ${formatWon(quote.labSettlementAmount)}`
              : `크레딧 소비 총액 ${formatWon(quote.total)}`}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
