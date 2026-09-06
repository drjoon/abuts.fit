// related files:
// - web/frontend/src/pages/salesTeam/SalesHomePage.tsx
// - web/frontend/src/pages/salesTeam/salesDay.ts
// - web/frontend/src/shared/settlement/settlementUi.tsx
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/shared/ui/cn";
import { addDaysYmd } from "./salesDay";

export function SalesPageShell({
  title,
  subtitle,
  actions,
  children,
  className,
  wide,
}: {
  /** Omit to hide the page header (e.g. today toolbar-only layout). */
  title?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * true: 거래처·요구사항 등 2열 작업용(최대 ~64rem).
   * 기본(false): 핸드폰·태블릿·PC에서 읽기 편한 폭(~48rem).
   */
  wide?: boolean;
}) {
  const showHeader = Boolean(title) || Boolean(actions);
  return (
    <div
      className={cn(
        "mx-auto w-full space-y-4 px-0 pb-20 pt-0 sm:space-y-5 sm:pb-10 lg:space-y-5 lg:pb-8",
        wide ? "max-w-5xl" : "max-w-3xl",
        className,
      )}
    >
      {showHeader ? (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 pb-3 sm:pb-4">
          {title ? (
            <div className="min-w-0 space-y-1">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                {title}
              </h1>
              {subtitle ? (
                <div className="text-sm leading-relaxed text-muted-foreground">
                  {subtitle}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="min-w-0" />
          )}
          {actions ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-none">
              {actions}
            </div>
          ) : null}
        </header>
      ) : null}
      {children}
    </div>
  );
}

/** Master–detail / two-pane workspace for tablet+. */
export function SalesSplit({
  primary,
  secondary,
  secondaryEmpty,
  className,
  primaryClassName,
  secondaryClassName,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  secondaryEmpty?: ReactNode;
  className?: string;
  primaryClassName?: string;
  secondaryClassName?: string;
}) {
  const hasSecondary = Boolean(secondary);
  const showAside = hasSecondary || Boolean(secondaryEmpty);
  return (
    <div
      className={cn(
        "grid gap-4 lg:gap-5",
        showAside
          ? "lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.95fr)] xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,1fr)]"
          : "lg:grid-cols-1",
        className,
      )}
    >
      <div className={cn("min-w-0", primaryClassName)}>{primary}</div>
      {hasSecondary ? (
        <div
          className={cn(
            "min-w-0 lg:sticky lg:top-4 lg:self-start",
            secondaryClassName,
          )}
        >
          {secondary}
        </div>
      ) : secondaryEmpty ? (
        <div
          className={cn(
            "hidden min-w-0 lg:sticky lg:top-4 lg:block lg:self-start",
            secondaryClassName,
          )}
        >
          {secondaryEmpty}
        </div>
      ) : null}
    </div>
  );
}

export function SalesStatCard({
  label,
  value,
  hint,
  icon: Icon,
  selected,
  onClick,
  to,
  tone = "default",
  compact,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  selected?: boolean;
  onClick?: () => void;
  to?: string;
  tone?: "default" | "alert" | "ok";
  compact?: boolean;
}) {
  const highlight = Boolean(selected);
  const className = cn(
    "flex w-full flex-col justify-between rounded-2xl border text-left shadow-sm transition-colors",
    compact
      ? "min-h-[5.25rem] px-3.5 py-3 lg:min-h-0 lg:px-4 lg:py-3.5"
      : "min-h-[6.25rem] px-4 py-3.5",
    highlight
      ? "border-primary-muted bg-primary-soft/50 ring-1 ring-primary-muted/70"
      : "border-slate-200/80 bg-white/90 hover:border-slate-300 hover:bg-white",
    (onClick || to) && "cursor-pointer",
    tone === "alert" && !highlight && "border-rose-200/80 bg-rose-50/40",
    tone === "ok" && !highlight && "border-emerald-200/80 bg-emerald-50/30",
  );

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium text-slate-500">{label}</span>
        {Icon ? (
          <span
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-xl",
              highlight
                ? "bg-primary/15 text-primary-strong"
                : tone === "alert"
                  ? "bg-rose-100 text-rose-600"
                  : tone === "ok"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-500",
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <div
        className={cn(
          "mt-2 font-semibold tabular-nums tracking-tight",
          compact ? "text-xl lg:text-2xl" : "text-2xl sm:text-[1.65rem]",
          highlight ? "text-primary-strong" : "text-slate-900",
        )}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-[11px] leading-relaxed text-slate-500 sm:text-xs">
          {hint}
        </div>
      ) : null}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={className}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

export function SalesPanel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm",
        className,
      )}
    >
      {(title || actions || description) && (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="min-w-0 space-y-0.5">
            {title ? (
              <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            ) : null}
            {description ? (
              <p className="text-xs text-muted-foreground sm:text-sm">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
          ) : null}
        </div>
      )}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function SalesEmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionTo,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionTo?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-12 text-center",
        className,
      )}
    >
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200/80">
        <Icon className="h-5 w-5" />
      </span>
      <div className="space-y-1">
        <p className="font-medium text-slate-800">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {actionLabel && actionTo ? (
        <Button asChild size="sm" className="mt-1">
          <Link to={actionTo}>{actionLabel}</Link>
        </Button>
      ) : null}
      {actionLabel && onAction ? (
        <Button size="sm" className="mt-1" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function SalesListRow({
  title,
  meta,
  trailing,
  onClick,
  selected,
}: {
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  selected?: boolean;
}) {
  const className = cn(
    "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
    selected
      ? "border-primary-muted bg-primary-soft/40 ring-1 ring-primary-muted/50"
      : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/80",
    onClick && "cursor-pointer",
  );

  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-slate-900">{title}</div>
        {meta ? (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {meta}
          </div>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

export function SalesProgressBar({
  value,
  label,
}: {
  value: number;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="space-y-1.5">
      {label ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <span className="tabular-nums font-medium text-slate-700">{pct}%</span>
        </div>
      ) : null}
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function SalesQuickLink({
  to,
  icon: Icon,
  label,
  description,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3.5 shadow-sm transition-colors hover:border-primary-muted hover:bg-primary-soft/30"
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-colors group-hover:bg-primary/15 group-hover:text-primary-strong">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="block font-medium text-slate-900">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
    </Link>
  );
}

export function SalesDayPicker({
  ymd,
  today,
  onChange,
  className,
  compact,
}: {
  ymd: string;
  today: string;
  onChange: (next: string) => void;
  className?: string;
  /** Tighter control for toolbars that share a row. */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-nowrap items-center rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm",
        compact
          ? "gap-0.5 p-1"
          : "gap-1.5 p-1.5 sm:gap-2 sm:p-2",
        className,
      )}
    >
      <Button
        size="icon"
        variant="ghost"
        className={cn("shrink-0", compact ? "h-8 w-8" : "h-9 w-9")}
        onClick={() => onChange(addDaysYmd(ymd, -1))}
        aria-label="이전 날"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Input
        type="date"
        value={ymd}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "min-w-0 border-0 bg-transparent shadow-none focus-visible:ring-0",
          compact ? "h-8 w-[9.75rem] px-1" : "h-9 flex-1 sm:w-[10.5rem] sm:flex-none",
        )}
      />
      <Button
        size="icon"
        variant="ghost"
        className={cn("shrink-0", compact ? "h-8 w-8" : "h-9 w-9")}
        onClick={() => onChange(addDaysYmd(ymd, 1))}
        aria-label="다음 날"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button
        size="sm"
        variant={ymd === today ? "default" : "secondary"}
        className={cn("shrink-0", compact && "h-8 px-2.5")}
        onClick={() => onChange(today)}
      >
        오늘
      </Button>
    </div>
  );
}

export function SalesSegmentTabs<T extends string>({
  value,
  onChange,
  options,
  className,
  fit,
  compact,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: string; hint?: string }>;
  className?: string;
  /** Shrink to content width on tablet+ (toolbar use). */
  fit?: boolean;
  /** Single-line label only (tighter padding, no truncate). */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex gap-1 rounded-2xl border border-slate-200/80 bg-slate-100/80 p-1",
        fit ? "w-full md:w-auto md:min-w-0" : "w-full",
        className,
      )}
      role="tablist"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const showHint = !compact && Boolean(opt.hint);
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-xl text-sm font-medium transition-colors",
              compact
                ? "flex-1 whitespace-nowrap px-3 py-1.5 md:flex-none md:px-3.5 md:py-2"
                : "min-w-0 flex-1 px-3 py-2 md:px-4 md:py-2.5",
              active
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800",
            )}
          >
            <span
              className={cn(
                "block",
                compact ? "whitespace-nowrap" : "truncate",
              )}
            >
              {opt.label}
            </span>
            {showHint ? (
              <span
                className={cn(
                  "mt-0.5 block truncate text-[11px] font-normal",
                  active ? "text-slate-500" : "text-slate-400",
                )}
              >
                {opt.hint}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function SalesToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
