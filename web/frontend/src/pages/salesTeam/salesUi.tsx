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
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-5xl space-y-4 p-3 pb-24 sm:space-y-5 sm:p-4 sm:pb-8",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
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
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </header>
      {children}
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
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  selected?: boolean;
  onClick?: () => void;
  to?: string;
  tone?: "default" | "alert" | "ok";
}) {
  const highlight = Boolean(selected);
  const className = cn(
    "flex min-h-[6.5rem] w-full flex-col justify-between rounded-2xl border px-4 py-3.5 text-left shadow-sm transition-colors",
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
          "mt-2 text-2xl font-semibold tabular-nums tracking-tight sm:text-[1.65rem]",
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
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
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
      <div className="p-4 sm:p-5">{children}</div>
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
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionTo?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-12 text-center">
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
        <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
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
}: {
  ymd: string;
  today: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/90 p-2 shadow-sm">
      <Button
        size="icon"
        variant="ghost"
        className="h-9 w-9"
        onClick={() => onChange(addDaysYmd(ymd, -1))}
        aria-label="이전 날"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Input
        type="date"
        value={ymd}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
      />
      <Button
        size="icon"
        variant="ghost"
        className="h-9 w-9"
        onClick={() => onChange(addDaysYmd(ymd, 1))}
        aria-label="다음 날"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button
        size="sm"
        variant={ymd === today ? "default" : "secondary"}
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
}: {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: string; hint?: string }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-1 rounded-2xl border border-slate-200/80 bg-slate-100/80 p-1",
        className,
      )}
      role="tablist"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "min-w-0 flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800",
            )}
          >
            <span className="block truncate">{opt.label}</span>
            {opt.hint ? (
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
