// related files:
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// change-log:
// - 2026-10-08: 관리자 대시보드 타일(벤토) 공통. 높이는 행 단위로 고정하고 내용은 타일 안에서만 스크롤한다.
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/shared/ui/cn";

/** 12열 벤토. 행 높이 고정 → 타일이 내용 때문에 세로로 늘어나지 않는다. */
export const DASH_GRID_CLASS =
  "grid grid-cols-2 auto-rows-[6.5rem] gap-3 lg:grid-cols-12";

/** 타일 크기(열×행). 모바일은 작은 타일 1열, 큰 타일 2열. */
export const DASH_SPAN = {
  c2: "col-span-1 lg:col-span-2",
  c3: "col-span-1 lg:col-span-3",
  c4: "col-span-1 lg:col-span-4",
  c3r2: "col-span-2 row-span-2 lg:col-span-3",
  c4r2: "col-span-2 row-span-2 lg:col-span-4",
  c5r2: "col-span-2 row-span-2 lg:col-span-5",
} as const;

type Tone = "default" | "warn" | "danger";

const TONE_CLASS: Record<Tone, string> = {
  default: "",
  warn: "border-amber-300 bg-amber-50/60",
  danger: "border-rose-300 bg-rose-50/60",
};

type TileProps = {
  title: ReactNode;
  icon?: ReactNode;
  /** 헤더 오른쪽(아이콘 대신 버튼 등). */
  extra?: ReactNode;
  onClick?: () => void;
  tone?: Tone;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
};

export function DashTile({
  title,
  icon,
  extra,
  onClick,
  tone = "default",
  className,
  bodyClassName,
  children,
}: TileProps) {
  const interactive = Boolean(onClick);
  return (
    <div
      className={cn(
        "app-glass-card app-glass-card--lg flex h-full min-h-0 flex-col gap-1.5 rounded-2xl",
        interactive && "cursor-pointer transition hover:bg-slate-50/70",
        TONE_CLASS[tone],
        className,
      )}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (event: KeyboardEvent<HTMLDivElement>) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-xs font-medium text-muted-foreground">
          {title}
        </span>
        {extra ?? icon}
      </div>
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </div>
  );
}

/** 타일 안 숫자 칩. */
export function DashStat({
  label,
  value,
  tone,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: "warn" | "danger" | "primary" | "muted";
  className?: string;
}) {
  const valueTone =
    tone === "warn"
      ? "text-amber-700"
      : tone === "danger"
        ? "text-rose-700"
        : tone === "primary"
          ? "text-primary-strong"
          : tone === "muted"
            ? "text-muted-foreground"
            : "text-slate-900";
  return (
    <div className={cn("min-w-0 rounded-lg bg-slate-50 px-2 py-1.5", className)}>
      <div className="truncate text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("truncate text-base font-semibold leading-tight", valueTone)}>
        {value}
      </div>
    </div>
  );
}

/** 타일 큰 숫자. */
export function DashBigNumber({
  value,
  unit,
  className,
}: {
  value: ReactNode;
  unit?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline gap-1", className)}>
      <span className="text-2xl font-bold leading-none">{value}</span>
      {unit ? <span className="text-xs text-muted-foreground">{unit}</span> : null}
    </div>
  );
}
