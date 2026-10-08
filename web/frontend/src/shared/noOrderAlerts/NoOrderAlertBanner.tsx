// related files:
// - web/frontend/src/shared/noOrderAlerts/NoOrderAlertDialog.tsx
// - web/frontend/src/shared/noOrderAlerts/useNoOrderAlerts.ts
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/shared/ui/cn";
import type { NoOrderAlertsData } from "./types";
import { NoOrderAlertDialog } from "./NoOrderAlertDialog";
import { DashBigNumber, DashTile } from "@/shared/ui/dashboard/DashTile";

type Props = {
  data?: NoOrderAlertsData | null;
  loading?: boolean;
  className?: string;
  /** sales home uses rose panel tone */
  variant?: "card" | "sales" | "tile";
};

export function NoOrderAlertBanner({
  data,
  loading = false,
  className,
  variant = "card",
}: Props) {
  const [open, setOpen] = useState(false);
  const summary = data?.summary;
  const total = Number(summary?.total || 0);
  const count3m = Number(summary?.count3m || 0);
  const count6m = Number(summary?.count6m || 0);

  if (variant === "tile") {
    const hasAlert = total > 0;
    return (
      <>
        <DashTile
          title="무주문 의뢰자"
          icon={
            <AlertTriangle
              className={cn("h-4 w-4", hasAlert ? "text-amber-600" : "text-muted-foreground")}
            />
          }
          tone={hasAlert ? "warn" : "default"}
          className={className}
          onClick={hasAlert ? () => setOpen(true) : undefined}
        >
          <div className="flex h-full flex-col justify-end gap-0.5">
            <DashBigNumber
              value={loading && !data ? "—" : total.toLocaleString()}
              unit="곳"
              className={hasAlert ? "text-amber-900" : undefined}
            />
            <p className="truncate text-[11px] text-muted-foreground">
              3개월 {count3m.toLocaleString()} · 6개월 {count6m.toLocaleString()}
            </p>
          </div>
        </DashTile>
        <NoOrderAlertDialog open={open} onOpenChange={setOpen} data={data} />
      </>
    );
  }

  if (loading && !data) return null;
  if (total <= 0) return null;

  const isSales = variant === "sales";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "w-full text-left transition",
          isSales
            ? "rounded-2xl border border-rose-200/80 bg-rose-50/40 px-3.5 py-3 shadow-sm hover:bg-rose-50/70 sm:px-4"
            : "rounded-lg border border-amber-200/80 bg-amber-50/50 px-3 py-2.5 hover:bg-amber-50/80",
          className,
        )}
      >
        <div className="flex items-start gap-2.5">
          <span
            className={cn(
              "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
              isSales ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-700",
            )}
          >
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                "text-sm font-semibold",
                isSales ? "text-slate-900" : "text-amber-950",
              )}
            >
              무주문 의뢰자 알람
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
              3개월 {count3m.toLocaleString()}건 · 6개월{" "}
              {count6m.toLocaleString()}건
            </div>
          </div>
        </div>
      </button>
      <NoOrderAlertDialog open={open} onOpenChange={setOpen} data={data} />
    </>
  );
}
