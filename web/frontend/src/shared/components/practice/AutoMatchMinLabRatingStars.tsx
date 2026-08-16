// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/practice/practiceLabRating.ts
// - web/backend/utils/practiceLabRating.js
// - 2026-08-14: 자동매칭 최소 별(클릭으로 채움).
// - 2026-08-16: 5점제. 선택 2~5. 기공비=평균×배수(2=0.9). 안내 문구 단순화.
// - 2026-08-16: 매칭 조건 툴팁은 도움말 아이콘에만(별 포커스로 Dialog 오픈 시 동시 표시 방지).
import { CircleHelp, Star } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AUTO_MATCH_MIN_SELECTABLE,
  DEFAULT_AUTO_MATCH_MIN_LAB_RATING,
  PRACTICE_LAB_RATING_MAX,
  feeMultiplierForStars,
  normalizeAutoMatchMinLabRating,
} from "@/shared/practice/practiceLabRating";
import { cn } from "@/shared/ui/cn";

const TOOLTIP_LINES = [
  "기공소 매칭 참여 조건",
  "- 어벗츠 인증 통과",
  "- 별점 2점 이상 (평가 3회 미만은 3점 적용)",
  "- 우리 치과가 1점 준 곳은 제외",
  "기공비: 2점=×0.9 · 3점=평균 · 4점=×1.1 · 5점=×1.2",
] as const;

type AutoMatchMinLabRatingStarsProps = {
  value?: number | null;
  onChange?: (next: number) => void;
  className?: string;
  disabled?: boolean;
};

export function AutoMatchMinLabRatingStars({
  value = DEFAULT_AUTO_MATCH_MIN_LAB_RATING,
  onChange,
  className,
  disabled = false,
}: AutoMatchMinLabRatingStarsProps) {
  const current = normalizeAutoMatchMinLabRating(value);

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <div
        className={cn(
          "inline-flex items-center gap-1 rounded-lg border border-slate-200/80 bg-white px-1.5 py-0.5 shadow-sm",
          disabled && "opacity-50",
        )}
        role="radiogroup"
        aria-label="자동매칭 최소 별점"
      >
        {Array.from({ length: PRACTICE_LAB_RATING_MAX }, (_, i) => {
          const stars = i + 1;
          const selectable = stars >= AUTO_MATCH_MIN_SELECTABLE;
          const filled = stars <= current;
          return (
            <button
              key={stars}
              type="button"
              role="radio"
              aria-checked={current === stars}
              aria-label={
                selectable
                  ? `최소 ${stars}점 (${feeMultiplierForStars(stars) === 1 ? "평균" : `×${feeMultiplierForStars(stars)}`})`
                  : `${stars}점 (선택 불가)`
              }
              disabled={disabled || !selectable}
              className={cn(
                "rounded p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none",
                selectable
                  ? "text-amber-500 hover:text-amber-600"
                  : "text-slate-300",
              )}
              onClick={() => {
                if (selectable) onChange?.(stars);
              }}
            >
              <Star
                className={cn(
                  "h-4 w-4",
                  filled && selectable ? "fill-current" : "fill-none",
                )}
                strokeWidth={1.75}
              />
            </button>
          );
        })}
      </div>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="기공소 매칭 참여 조건 안내"
            >
              <CircleHelp className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className="z-[210] w-max max-w-[min(100vw-2rem,28rem)] space-y-1 text-xs leading-relaxed"
          >
            {TOOLTIP_LINES.map((line) => (
              <p
                key={line}
                className={line.startsWith("기공비:") ? "whitespace-nowrap" : undefined}
              >
                {line}
              </p>
            ))}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
