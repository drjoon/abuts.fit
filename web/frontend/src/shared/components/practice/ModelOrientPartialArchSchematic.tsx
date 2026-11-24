import { cn } from "@/shared/ui/cn";

type ModelOrientPartialArchSchematicProps = {
  /** 10·30번대면 true(화면 오른쪽=근심). 20·40번대면 false. */
  rightMesial: boolean;
  className?: string;
};

/**
 * 편측 스캔 모델정렬 안내 도식.
 * 교합면 시점: 위=협측, 아래=설측. 근심·원심은 사분면에 맞게 좌우를 바꾼다.
 */
export function ModelOrientPartialArchSchematic({
  rightMesial,
  className,
}: ModelOrientPartialArchSchematicProps) {
  const leftLabel = rightMesial ? "원심" : "근심";
  const rightLabel = rightMesial ? "근심" : "원심";
  return (
    <svg
      viewBox="0 0 168 112"
      className={cn("mx-auto h-auto w-[10.5rem] text-foreground", className)}
      role="img"
      aria-label={`편측 스캔 방향: 위 협측, 아래 설측, 왼쪽 ${leftLabel}, 오른쪽 ${rightLabel}`}
    >
      <text x="84" y="14" textAnchor="middle" fill="currentColor" fontSize="11" fontWeight="600">
        협측
      </text>
      <text x="12" y="60" textAnchor="middle" fill="currentColor" fontSize="11" fontWeight="600">
        {leftLabel}
      </text>
      <text x="156" y="60" textAnchor="middle" fill="currentColor" fontSize="11" fontWeight="600">
        {rightLabel}
      </text>
      <text x="84" y="106" textAnchor="middle" fill="currentColor" fontSize="11" fontWeight="600">
        설측
      </text>

      {/* 편측 악궁(교합면). 넓은 쪽=구치(원심), 좁은 쪽=전치(근심). */}
      <g transform={rightMesial ? undefined : "translate(168 0) scale(-1 1)"}>
        <path
          d="M40 38
             C48 26 62 24 76 26
             C90 28 104 26 116 30
             C126 34 132 42 130 52
             C128 64 116 74 100 76
             C84 78 68 76 54 72
             C42 68 34 58 36 48
             C37 42 38 40 40 38 Z"
          fill="hsl(var(--primary) / 0.14)"
          stroke="hsl(var(--primary))"
          strokeWidth="1.5"
        />
        <ellipse cx="52" cy="50" rx="9" ry="13" fill="hsl(var(--primary) / 0.28)" stroke="hsl(var(--primary) / 0.7)" strokeWidth="1" />
        <ellipse cx="70" cy="48" rx="8" ry="12" fill="hsl(var(--primary) / 0.24)" stroke="hsl(var(--primary) / 0.65)" strokeWidth="1" />
        <ellipse cx="88" cy="47" rx="7.5" ry="11.5" fill="hsl(var(--primary) / 0.2)" stroke="hsl(var(--primary) / 0.6)" strokeWidth="1" />
        <ellipse cx="104" cy="48" rx="6.5" ry="10" fill="hsl(var(--primary) / 0.16)" stroke="hsl(var(--primary) / 0.55)" strokeWidth="1" />
        <ellipse cx="118" cy="50" rx="5.5" ry="8" fill="hsl(var(--primary) / 0.14)" stroke="hsl(var(--primary) / 0.5)" strokeWidth="1" />
      </g>
    </svg>
  );
}
