// change-log:
// - 2026-08-17: 의뢰자 크레딧/기공크레딧 정산 최신 스타일을 역할 정산 페이지 공통 UI로 추출.
// related files:
// - web/frontend/src/shared/components/CreditLedgerModal.tsx
// - web/frontend/src/features/settings/tabs/LabSettlementPayoutTab.tsx
// - web/frontend/src/pages/manufacturer/payments/PaymentsPage.tsx
import type { ReactNode, Ref } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import { formatWon } from "@/shared/settlement/affiliateVat";

export type SettlementStatTone = "default" | "primary";
export type SettlementSortDirection = "asc" | "desc";

export function SettlementStatCard({
  label,
  value,
  hint,
  hintTooltip,
  footer,
  tone = "default",
  selected,
  onClick,
}: {
  label: string;
  value: number | string;
  hint?: ReactNode;
  hintTooltip?: string;
  footer?: ReactNode;
  tone?: SettlementStatTone;
  selected?: boolean;
  onClick?: () => void;
}) {
  const selectedTone = Boolean(onClick) && selected;
  const hintNode =
    hint && hintTooltip ? (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              role="note"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              className="mx-auto inline-block cursor-help border-b border-dotted border-slate-400 text-[11px] text-slate-500 sm:text-xs"
            >
              {hint}
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className="max-w-xs text-xs leading-relaxed"
          >
            <p>{hintTooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ) : hint ? (
      <div className="text-center text-[11px] leading-relaxed text-slate-500 sm:text-xs">
        {hint}
      </div>
    ) : null;

  const className = cn(
    "flex min-h-[7.25rem] w-full flex-col justify-center rounded-2xl border px-4 py-3.5 shadow-sm transition-colors",
    selectedTone
      ? "border-primary-muted bg-primary-soft/40 ring-1 ring-primary-muted/70"
      : tone === "primary"
        ? "border-primary-muted bg-primary-soft/40 ring-1 ring-primary-muted/70"
        : "border-slate-200/80 bg-white/80",
    onClick && !selectedTone
      ? "hover:border-slate-300 hover:bg-white"
      : null,
    onClick ? "cursor-pointer text-left" : null,
  );

  const inner = (
    <>
      <div className="text-center text-[13px] font-medium text-slate-500">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-center text-2xl font-semibold tabular-nums tracking-tight sm:text-[1.65rem]",
          selectedTone || tone === "primary"
            ? "text-primary-strong"
            : "text-slate-900",
        )}
      >
        {typeof value === "number" ? formatWon(value) : value}
      </div>
      {hintNode || footer ? (
        <div className="mt-2.5 border-t border-slate-100/80 pt-2.5 text-center">
          {hintNode}
          {footer}
        </div>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={Boolean(selected)}
        className={className}
      >
        {inner}
      </button>
    );
  }

  return <div className={className}>{inner}</div>;
}

export function SettlementPolicySection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl bg-slate-50 px-4 py-3.5">
      <h3 className="text-sm font-semibold tracking-tight text-slate-900">
        {title}
      </h3>
      <div className="mt-2.5 space-y-2 text-sm leading-relaxed text-slate-600">
        {children}
      </div>
    </section>
  );
}

export function SettlementPolicyDialog({
  title,
  description,
  children,
  triggerLabel = "정산규칙",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  triggerLabel?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto h-9 rounded-xl"
        >
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogHeader className="border-b border-slate-100 px-6 pb-4 pt-6">
          <DialogTitle className="text-xl font-semibold tracking-tight text-slate-900">
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription className="text-sm text-slate-500">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="max-h-[calc(85vh-5.5rem)] space-y-3 overflow-y-auto px-6 py-5">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SettlementTableFrame({
  children,
  className,
  scrollRef,
}: {
  children: ReactNode;
  className?: string;
  scrollRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={scrollRef}
      className={cn(
        "overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/70 shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SettlementSortIcon({
  active,
  direction,
}: {
  active: boolean;
  direction: SettlementSortDirection;
}) {
  if (!active) {
    return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />;
  }
  return direction === "asc" ? (
    <ArrowUp className="h-3.5 w-3.5 text-foreground" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5 text-foreground" />
  );
}

export function SettlementVatNotice({
  children,
}: {
  children?: ReactNode;
}) {
  return (
    <p className="text-xs leading-relaxed text-slate-500">
      {children ||
        "장부 금액은 공급가입니다. 부가세 10%는 지급 시 합산하며 세금계산서를 수취합니다."}
    </p>
  );
}

export function SettlementFilterChip({
  active,
  onClick,
  children,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 items-center rounded-full px-3 text-xs font-medium transition-colors ring-1",
        active
          ? "bg-slate-900 text-white ring-slate-900"
          : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
        disabled ? "opacity-50" : null,
      )}
    >
      {children}
    </button>
  );
}
