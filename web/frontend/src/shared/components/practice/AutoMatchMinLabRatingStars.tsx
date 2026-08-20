// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/practice/practiceLabRating.ts
// - web/backend/utils/practiceLabRating.js
// - 2026-08-20: 치과 별점 하한·상한. 지정 기공소·하청 수신 게이트(기공비 배수 없음).
import { CircleHelp, Star } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AUTO_MATCH_MIN_SELECTABLE,
  DEFAULT_AUTO_MATCH_MAX_LAB_RATING,
  DEFAULT_AUTO_MATCH_MIN_LAB_RATING,
  PRACTICE_LAB_RATING_MAX,
  resolveAutoMatchEligibleStarBand,
} from "@/shared/practice/practiceLabRating";
import { cn } from "@/shared/ui/cn";

type StarRowProps = {
  label: string;
  value: number;
  disabled?: boolean;
  onChange?: (next: number) => void;
  ariaLabel: string;
};

function StarRow({ label, value, disabled, onChange, ariaLabel }: StarRowProps) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      <div
        className={cn(
          "inline-flex items-center gap-0.5 rounded-lg border border-slate-200/80 bg-white px-1.5 py-0.5 shadow-sm",
          disabled && "opacity-50",
        )}
        role="radiogroup"
        aria-label={ariaLabel}
      >
        {Array.from({ length: PRACTICE_LAB_RATING_MAX }, (_, i) => {
          const stars = i + 1;
          const selectable = stars >= AUTO_MATCH_MIN_SELECTABLE;
          const filled = stars <= value;
          return (
            <button
              key={stars}
              type="button"
              role="radio"
              aria-checked={value === stars}
              aria-label={`${label} ${stars}점`}
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
                  "h-3.5 w-3.5",
                  filled && selectable ? "fill-current" : "fill-none",
                )}
                strokeWidth={1.75}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

type AutoMatchMinLabRatingStarsProps = {
  minValue?: number | null;
  maxValue?: number | null;
  onMinChange?: (next: number) => void;
  onMaxChange?: (next: number) => void;
  /** @deprecated 단일 값 — minValue로 매핑 */
  value?: number | null;
  /** @deprecated 단일 변경 — onMinChange로 매핑 */
  onChange?: (next: number) => void;
  className?: string;
  disabled?: boolean;
};

export function AutoMatchMinLabRatingStars({
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  value,
  onChange,
  className,
  disabled = false,
}: AutoMatchMinLabRatingStarsProps) {
  const band = resolveAutoMatchEligibleStarBand({
    minStars: minValue ?? value ?? DEFAULT_AUTO_MATCH_MIN_LAB_RATING,
    maxStars: maxValue ?? DEFAULT_AUTO_MATCH_MAX_LAB_RATING,
  });
  const minStars = band.minStars;
  const maxStars = band.maxStars;

  const handleMin = (next: number) => {
    const resolved = resolveAutoMatchEligibleStarBand({
      minStars: next,
      maxStars,
    });
    onMinChange?.(resolved.minStars);
    onChange?.(resolved.minStars);
    if (resolved.maxStars !== maxStars) onMaxChange?.(resolved.maxStars);
  };

  const handleMax = (next: number) => {
    const resolved = resolveAutoMatchEligibleStarBand({
      minStars,
      maxStars: next,
    });
    onMaxChange?.(resolved.maxStars);
    if (resolved.minStars !== minStars) {
      onMinChange?.(resolved.minStars);
      onChange?.(resolved.minStars);
    }
  };

  const tooltipLines = [
    "기공소 별점 구간",
    "- 어벗츠기공소가 처리하기 어려울 때는 협력 기공소로 재의뢰합니다",
    "- 협력 기공소로 의뢰를 넘길 때, 별점 구간의 인증 기공소만 참여할 수 있습니다",
    "- 평가 치과 3곳 이하 협력 인증 기공소는 3점으로 봅니다",
  ] as const;

  return (
    <div className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      <StarRow
        label="하한"
        value={minStars}
        disabled={disabled || !onMinChange}
        onChange={handleMin}
        ariaLabel="기공소 별점 하한"
      />
      <StarRow
        label="상한"
        value={maxStars}
        disabled={disabled || !onMaxChange}
        onChange={handleMax}
        ariaLabel="기공소 별점 상한"
      />
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="기공소 별점 구간 안내"
            >
              <CircleHelp className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className="z-[210] max-w-[min(100vw-2rem,40rem)] overflow-visible space-y-1 text-xs leading-relaxed"
          >
            {tooltipLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
