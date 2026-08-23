// change-log:
// - 2026-08-23: SettlementPolicyDialog — flex 스크롤 + 하단 여백(pb-8).
// - 2026-08-23: SettlementEquationOperator — 정산 요약 카드 사이 = + − 부호.
// - 2026-08-20: 클릭 카드는 selected만 파란 강조. tone=primary는 비클릭 카드용.
// - 2026-08-20: SettlementStatCard compact(제조사 정산 요약 높이 축소).
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
export type SettlementEquationSymbol = "=" | "+" | "−";

export function SettlementEquationOperator({
  symbol,
  className,
}: {
  symbol: SettlementEquationSymbol;
  className?: string;
}) {
  const isEquals = symbol === "=";
  const isMinus = symbol === "−";

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center self-stretch",
        "min-h-[7.25rem] w-9 sm:w-11",
        className,
      )}
      aria-hidden
    >
      <span
        className={cn(
          "select-none font-bold leading-none tabular-nums",
          isEquals
            ? "text-3xl text-primary-strong sm:text-4xl"
            : "text-2xl sm:text-3xl",
          isMinus ? "text-destructive" : "text-slate-400",
          !isEquals && !isMinus && "text-slate-400",
        )}
      >
        {symbol}
      </span>
    </div>
  );
}

export function SettlementStatCard({
  label,
  value,
  hint,
  hintTooltip,
  footer,
  tone = "default",
  selected,
  onClick,
  compact = false,
  className: classNameProp,
}: {
  label: string;
  value: number | string;
  hint?: ReactNode;
  hintTooltip?: string;
  footer?: ReactNode;
  tone?: SettlementStatTone;
  selected?: boolean;
  onClick?: () => void;
  compact?: boolean;
  className?: string;
}) {
  const selectedTone = Boolean(onClick) && selected;
  // 클릭 가능한 카드는 선택된 칸만 강조한다. tone=primary는 정적(비클릭) 카드용.
  const highlight = onClick ? selectedTone : tone === "primary";
  const hintNode =
    hint && hintTooltip ? (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              role="note"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              className={cn(
                "mx-auto inline-block cursor-help border-b border-dotted border-slate-400 text-slate-500",
                compact ? "text-[10px]" : "text-[11px] sm:text-xs",
              )}
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
      <div
        className={cn(
          "text-center leading-relaxed text-slate-500",
          compact ? "text-[10px]" : "text-[11px] sm:text-xs",
        )}
      >
        {hint}
      </div>
    ) : null;

  const className = cn(
    "flex w-full flex-col justify-center rounded-2xl border shadow-sm transition-colors",
    compact ? "min-h-0 px-3 py-2" : "min-h-[7.25rem] px-4 py-3.5",
    highlight
      ? "border-primary-muted bg-primary-soft/40 ring-1 ring-primary-muted/70"
      : "border-slate-200/80 bg-white/80",
    onClick && !highlight
      ? "hover:border-slate-300 hover:bg-white"
      : null,
    onClick ? "cursor-pointer text-left" : null,
    classNameProp,
  );

  const inner = (
    <>
      <div
        className={cn(
          "text-center font-medium text-slate-500",
          compact ? "text-xs" : "text-[13px]",
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "text-center font-semibold tabular-nums tracking-tight",
          compact ? "mt-0.5 text-xl" : "mt-1 text-2xl sm:text-[1.65rem]",
          highlight ? "text-primary-strong" : "text-slate-900",
        )}
      >
        {typeof value === "number" ? formatWon(value) : value}
      </div>
      {hintNode || footer ? (
        <div
          className={cn(
            "border-t border-slate-100/80 text-center",
            compact ? "mt-1.5 pt-1.5" : "mt-2.5 pt-2.5",
          )}
        >
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
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-6 pb-4 pt-6">
          <DialogTitle className="text-xl font-semibold tracking-tight text-slate-900">
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription className="text-sm text-slate-500">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 pt-5 pb-8">
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
