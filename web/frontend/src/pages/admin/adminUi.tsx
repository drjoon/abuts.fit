// related files:
// - web/frontend/src/pages/salesTeam/salesUi.tsx
// - web/frontend/src/pages/admin/AdminMembersPage.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// change-log:
// - 2026-09-06: 페이지 제목/설명 헤더 제거(사이드·탭만으로 맥락).
// - 2026-09-06: 관리자 허브용 Sales 패턴 셸·세그먼트 탭·스플릿.
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";

export function AdminPageShell({
  actions,
  children,
  className,
  wide,
  /** Drop outer padding when parent work area already pads (fillHeight hubs). */
  flush,
}: {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  wide?: boolean;
  flush?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full space-y-4",
        flush
          ? "p-0 pb-4 sm:space-y-5 sm:pb-6 lg:space-y-6"
          : "p-3 pb-24 sm:space-y-5 sm:p-4 sm:pb-10 md:p-5 lg:space-y-6 lg:p-6 lg:pb-12",
        wide === false ? "max-w-3xl" : "max-w-7xl",
        className,
      )}
    >
      {actions ? (
        <header className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        </header>
      ) : null}
      {children}
    </div>
  );
}

export function AdminSplit({
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

export function AdminPanel({
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

export function AdminEmptyState({
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

export function AdminSegmentTabs<T extends string>({
  value,
  onChange,
  options,
  className,
  fit,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: string; hint?: string; badge?: number }>;
  className?: string;
  fit?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex gap-1 rounded-2xl border border-slate-200/80 bg-slate-100/80 p-1",
        fit ? "w-full md:w-auto md:min-w-[16rem]" : "w-full",
        className,
      )}
      role="tablist"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const badge = Number(opt.badge || 0);
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative min-w-0 flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors md:px-4 md:py-2.5",
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
            {badge > 0 ? (
              <span className="absolute right-1.5 top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                {badge > 99 ? "99+" : badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function AdminToolbar({
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

/** Shared ?tab= helpers for admin hub pages. */
export function setHubTabParam(
  searchParams: URLSearchParams,
  next: string,
  defaultTab: string,
): URLSearchParams {
  const nextParams = new URLSearchParams(searchParams);
  if (next === defaultTab) nextParams.delete("tab");
  else nextParams.set("tab", next);
  return nextParams;
}
