// change-log:
// - 2026-08-13: 관리자 크레딧 페이지 공통 패널/스탯/섹션 헤더.
// related files:
// - web/frontend/src/pages/admin/credits/AdminCreditPage.tsx
// - web/frontend/src/features/settings/tabs/AdminCreditSettingsTab.tsx
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/ui/cn";

export function CreditSectionHeader({
  icon: Icon,
  title,
  description,
  trailing,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft/60 ring-1 ring-primary-muted/70">
          <Icon className="h-5 w-5 text-primary-strong" />
        </span>
        <div className="min-w-0 space-y-1">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">
            {title}
          </h3>
          {description ? (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {trailing}
    </div>
  );
}

export function CreditStatTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "accent";
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-sm sm:p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div
        className={cn(
          "mt-1.5 text-2xl font-bold tabular-nums tracking-tight",
          tone === "accent" ? "text-accent-strong" : "text-slate-900",
        )}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-1.5 space-y-0.5 text-xs leading-relaxed text-muted-foreground">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export function CreditPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CreditFilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center rounded-full px-3 text-xs font-medium transition-colors ring-1",
        active
          ? "bg-slate-900 text-white ring-slate-900"
          : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
      )}
    >
      {children}
    </button>
  );
}
