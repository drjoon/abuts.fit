// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/practice/practiceLabRating.ts
// - web/backend/utils/practiceLabRating.js
// - 2026-08-14: 자동매칭 최소 별(클릭으로 채움). 1회 rating은 차단하지 않음.
import { Star } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PRACTICE_LAB_RATING_MAX,
  normalizeAutoMatchMinLabRating,
} from "@/shared/practice/practiceLabRating";
import { cn } from "@/shared/ui/cn";

const TOOLTIP_LINES = [
  "선택한 별 이상인 기공소만 자동매칭에 참여합니다.",
  "이 치과에서 남긴 rating 기준이며, 기공소에는 보이지 않습니다.",
  "rating이 1회뿐인 기공소는 차단되지 않습니다(2nd chance).",
] as const;

type AutoMatchMinLabRatingStarsProps = {
  value?: number | null;
  onChange?: (next: number) => void;
  className?: string;
  disabled?: boolean;
};

export function AutoMatchMinLabRatingStars({
  value = 1,
  onChange,
  className,
  disabled = false,
}: AutoMatchMinLabRatingStarsProps) {
  const current = normalizeAutoMatchMinLabRating(value);

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "inline-flex items-center gap-0.5 rounded-md px-1 py-0.5",
              disabled && "opacity-50",
              className,
            )}
            role="radiogroup"
            aria-label="자동매칭 최소 별점"
          >
            {Array.from({ length: PRACTICE_LAB_RATING_MAX }, (_, i) => {
              const stars = i + 1;
              const filled = stars <= current;
              return (
                <button
                  key={stars}
                  type="button"
                  role="radio"
                  aria-checked={current === stars}
                  aria-label={`최소 ${stars}점`}
                  disabled={disabled}
                  className="rounded p-0.5 text-amber-500 transition-colors hover:text-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
                  onClick={() => onChange?.(stars)}
                >
                  <Star
                    className={cn(
                      "h-4 w-4",
                      filled ? "fill-current" : "fill-none",
                    )}
                    strokeWidth={1.75}
                  />
                </button>
              );
            })}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs space-y-1 text-xs leading-relaxed">
          {TOOLTIP_LINES.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
