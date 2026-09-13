// related files:
// - web/frontend/src/pages/salesTeam/SalesHomePage.tsx
// - web/frontend/src/pages/salesTeam/salesDay.ts
// - web/frontend/src/shared/settlement/settlementUi.tsx
// - web/frontend/src/components/ui/calendar.tsx
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { ko } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/shared/ui/cn";
import { kstStartOfMonth, toKstYmd, ymdToKstDate } from "@/shared/date/kst";
import { addDaysYmd } from "./salesDay";

function formatPickerLabel(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [y, m, d] = ymd.split("-");
  return `${y}. ${m}. ${d}.`;
}

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
        "mx-auto w-full space-y-4 px-0.5 pb-20 pt-0.5 sm:space-y-5 sm:px-0 sm:pb-10 sm:pt-0 lg:space-y-5 lg:pb-8",
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
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5 sm:px-4 sm:py-3">
          <div className="min-w-0 space-y-0.5">
            {title ? (
              <h2 className="text-sm font-semibold text-slate-900 sm:text-base">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
          ) : null}
        </div>
      )}
      <div className={cn("p-3.5 sm:p-4", bodyClassName)}>{children}</div>
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
        "flex flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center",
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
    "flex w-full items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors sm:items-center sm:gap-3",
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
  countsByYmd,
  onVisibleMonthChange,
}: {
  ymd: string;
  today: string;
  onChange: (next: string) => void;
  className?: string;
  /** Tighter control for toolbars that share a row. */
  compact?: boolean;
  /** KST YMD → 그날 예약(취소·연기 제외) 건수 */
  countsByYmd?: Record<string, number>;
  /** 달력에 보이는 월(1일 YMD). 월 이동 시 카운트 조회용 */
  onVisibleMonthChange?: (monthStartYmd: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = useMemo(() => ymdToKstDate(ymd) || undefined, [ymd]);
  const [displayMonth, setDisplayMonth] = useState<Date>(
    () => selectedDate || ymdToKstDate(today) || new Date(),
  );

  useEffect(() => {
    if (selectedDate) setDisplayMonth(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    if (!onVisibleMonthChange) return;
    const monthYmd = toKstYmd(displayMonth);
    const start = monthYmd ? kstStartOfMonth(monthYmd) : null;
    if (start) onVisibleMonthChange(start);
  }, [displayMonth, onVisibleMonthChange]);

  return (
    // 바깥 여백: overflow clip 시 border·shadow가 잘리지 않게
    <div className={cn("shrink-0 p-0.5", className)}>
      <div
        className={cn(
          "flex flex-nowrap items-center rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm",
          compact
            ? "gap-0.5 p-1"
            : "gap-1.5 p-1.5 sm:gap-2 sm:p-2",
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
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className={cn(
                "min-w-0 justify-start gap-1.5 px-2 font-normal tabular-nums text-slate-900 hover:bg-slate-100",
                compact ? "h-8" : "h-9",
              )}
              aria-label="날짜 선택 캘린더 열기"
            >
              <CalendarIcon className="h-4 w-4 shrink-0 text-slate-500" />
              <span className="truncate">{formatPickerLabel(ymd)}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={8}
            className="w-auto max-w-[calc(100vw-1.5rem)] rounded-2xl border-slate-200/80 p-3 shadow-lg sm:p-4"
          >
            <Calendar
              mode="single"
              locale={ko}
              selected={selectedDate}
              month={displayMonth}
              onMonthChange={setDisplayMonth}
              onSelect={(date) => {
                if (!date) return;
                const next = toKstYmd(date);
                if (!next) return;
                onChange(next);
                setOpen(false);
              }}
              className="p-0"
              classNames={{
                months: "flex flex-col",
                month: "w-full space-y-3",
                caption:
                  "relative flex items-center justify-center px-10 pb-1 pt-0.5",
                caption_label: "text-base font-semibold text-slate-900",
                nav: "flex items-center",
                nav_button:
                  "absolute top-0 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-700 opacity-100 hover:bg-slate-50",
                nav_button_previous: "left-0",
                nav_button_next: "right-0",
                table: "w-full border-collapse",
                head_row: "flex w-full",
                head_cell:
                  "w-12 flex-1 pb-1 text-center text-[0.7rem] font-medium text-muted-foreground sm:w-14",
                row: "mt-1 flex w-full",
                cell: "relative h-14 flex-1 p-0.5 text-center text-sm sm:h-16",
                day: cn(
                  "relative flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-xl p-0 font-normal hover:bg-slate-100",
                  "aria-selected:opacity-100",
                ),
                day_selected:
                  "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                day_today:
                  "bg-slate-100 text-slate-900 aria-selected:bg-primary aria-selected:text-primary-foreground",
                day_outside: "text-muted-foreground/50 opacity-60",
                day_disabled: "text-muted-foreground opacity-40",
                day_hidden: "invisible",
              }}
              components={{
                IconLeft: () => <ChevronLeft className="h-4 w-4" />,
                IconRight: () => <ChevronRight className="h-4 w-4" />,
                DayContent: ({ date }) => {
                  const dayYmd = toKstYmd(date) || "";
                  const count = countsByYmd?.[dayYmd] || 0;
                  const isSelected = dayYmd === ymd;
                  const dayNum = Number(dayYmd.slice(8, 10)) || date.getDate();
                  return (
                    <>
                      <span className="text-sm font-medium leading-none sm:text-[0.95rem]">
                        {dayNum}
                      </span>
                      <span
                        className={cn(
                          "min-h-[0.85rem] text-[10px] font-semibold leading-none tabular-nums",
                          count > 0
                            ? isSelected
                              ? "text-primary-foreground/90"
                              : "text-primary"
                            : "text-transparent",
                        )}
                        aria-hidden={count === 0}
                      >
                        {count > 0 ? count : "·"}
                      </span>
                    </>
                  );
                },
              }}
            />
            <p className="mt-2 border-t border-slate-100 pt-2 text-center text-[11px] text-muted-foreground">
              숫자 = 그날 잡은 예약 수
            </p>
          </PopoverContent>
        </Popover>
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
