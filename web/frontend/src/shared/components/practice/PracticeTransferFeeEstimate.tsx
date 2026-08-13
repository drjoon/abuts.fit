// related files:
// - web/frontend/src/shared/practice/practiceTransferFeeQuote.ts
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/components/practice/PracticeToothWorkChartReadOnly.tsx
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

export function PracticeTransferFeeEstimate({
  quote,
  viewer,
  className,
  density = "chart",
}: PracticeTransferFeeEstimateProps) {
  const isLab = viewer === "lab";
  const amount = isLab ? quote.labSettlementAmount : quote.total;
  const title = isLab ? "기공비 총액" : "견적";
  const keepRate =
    isLab && quote.total > 0 ? quote.labSettlementAmount / quote.total : 1;
  const simple = isLab
    ? null
    : quote.abutmentRetailTotal > 0
      ? `기공비 ${formatWon(quote.labFeeTotal)} · 어벗 ${formatWon(quote.abutmentRetailTotal)}`
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
        <TooltipContent side={isCard ? "top" : "bottom"} className="max-w-xs space-y-1.5 p-3 text-xs leading-relaxed">
          {quote.lines.length > 0 ? (
            <ul className="space-y-0.5 tabular-nums">
              {quote.lines.map((line, idx) => {
                const labFee = scaleWon(line.labFee, keepRate);
                const abutment = scaleWon(line.abutmentRetail, keepRate);
                const parts = [formatWon(labFee)];
                if (line.abutmentRetail > 0) parts.push(`어벗 ${formatWon(abutment)}`);
                return (
                  <li key={`${line.toothNumber}:${idx}`}>
                    {line.toothNumber ? `${line.toothNumber} ` : ""}
                    {line.prosthesisType || "보철"} · {parts.join(" + ")}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground">선택된 보철물이 없습니다.</p>
          )}
          <div className="space-y-0.5 border-t border-white/20 pt-1.5 tabular-nums">
            {isLab ? (
              <p className="font-medium">기공비 총액 {formatWon(quote.labSettlementAmount)}</p>
            ) : (
              <p className="font-medium">크레딧 소비 총액 {formatWon(quote.total)}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
