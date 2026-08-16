// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/practice/practiceLabRating.ts
// - web/backend/utils/practiceLabRating.js
// - 2026-08-14: 자동매칭 최소 별(클릭으로 채움). 1회 rating은 차단하지 않음.
// - 2026-08-14: rating 기공소 10곳 이상일 때만 제한. 툴팁 문구 정리.
// - 2026-08-14: 툴팁·차단 기준 — 2회 이하 평가는 참여 허용.
// - 2026-08-16: 툴팁·차단 기준 — 인증 기공소 + 전체 치과 평가 평균/합산(5회 이하 유예).
import { Star } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AUTO_MATCH_RATING_COUNT_GRACE,
  PRACTICE_LAB_RATING_MAX,
  normalizeAutoMatchMinLabRating,
} from "@/shared/practice/practiceLabRating";
import { cn } from "@/shared/ui/cn";

const TOOLTIP_LINES = [
  "자동 매칭에 참여할 수 있는 기공소는 어벗츠 인증 기공소 중,",
  "1. 전체 치과 평가 평균이 설정 점수 이상인 기공소",
  `2. 전체 치과 평가 합산이 ${AUTO_MATCH_RATING_COUNT_GRACE}회 이하인 기공소`,
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
