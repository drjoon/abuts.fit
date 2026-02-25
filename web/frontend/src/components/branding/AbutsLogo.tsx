import { useId } from "react";
import { cn } from "@/shared/ui/cn";

type LogoVariant = "dark" | "light";

interface AbutsLogoProps {
  showWordmark?: boolean;
  wordmark?: string;
  className?: string;
  iconClassName?: string;
  wordmarkClassName?: string;
  variant?: LogoVariant;
}

const LOGO_VARIANTS: Record<
  LogoVariant,
  {
    outerFill: string;
    outerFillOpacity: number;
    innerFillOpacity: number;
    gradientStops: [string, string, string];
    addShadow?: boolean;
  }
> = {
  dark: {
    outerFill: "#050b1d",
    outerFillOpacity: 0.55,
    innerFillOpacity: 0.18,
    gradientStops: ["#6E8BFF", "#A278FF", "#FF9D62"],
  },
  light: {
    outerFill: "#f4f7ff",
    outerFillOpacity: 0.95,
    innerFillOpacity: 0.55,
    gradientStops: ["#4C6CFF", "#8D6BFF", "#FF8656"],
    addShadow: true,
  },
};

export const AbutsLogo = ({
  showWordmark = true,
  wordmark = "abuts.fit",
  className,
  iconClassName,
  wordmarkClassName,
  variant = "dark",
}: AbutsLogoProps) => {
  const gradientId = useId();
  const shadowId = `${gradientId}-shadow`;
  const tokens = LOGO_VARIANTS[variant];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 64 64"
        role="img"
        aria-label="abuts.fit hexagon mark"
        className={cn("h-10 w-10", iconClassName)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={tokens.gradientStops[0]} />
            <stop offset="50%" stopColor={tokens.gradientStops[1]} />
            <stop offset="100%" stopColor={tokens.gradientStops[2]} />
          </linearGradient>
          {tokens.addShadow && (
            <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow
                dx="0"
                dy="4"
                stdDeviation="4"
                floodColor="#8d9bff"
                floodOpacity="0.25"
              />
            </filter>
          )}
        </defs>
        <path
          d="M32 4.5 56.5 18v28L32 59.5 7.5 46V18z"
          fill={tokens.outerFill}
          fillOpacity={tokens.outerFillOpacity}
          stroke={`url(#${gradientId})`}
          strokeWidth="2.5"
          strokeLinejoin="round"
          filter={tokens.addShadow ? `url(#${shadowId})` : undefined}
        />
        <path
          d="M32 13 48.5 22.5v19L32 51 15.5 41.5v-19z"
          fill={`url(#${gradientId})`}
          fillOpacity={tokens.innerFillOpacity}
          stroke={`url(#${gradientId})`}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
      {showWordmark && (
        <span
          className={cn(
            "font-semibold tracking-tight bg-gradient-to-r from-[#6E8BFF] via-[#A278FF] to-[#FF9D62] bg-clip-text text-transparent",
            wordmarkClassName,
          )}
        >
          {wordmark}
        </span>
      )}
    </div>
  );
};
