// related files:
// - web/frontend/src/shared/noOrderAlerts/NoOrderAlertBanner.tsx
// - web/frontend/src/shared/business/requestorCapabilities.ts
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getRequestorRoleBadgeLabel } from "@/shared/business/requestorCapabilities";
import { cn } from "@/shared/ui/cn";
import {
  NO_ORDER_TIER_LABEL,
  type NoOrderAlertItem,
  type NoOrderAlertsData,
  type NoOrderTier,
} from "./types";

type FilterKey = "all" | NoOrderTier;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data?: NoOrderAlertsData | null;
};

function formatCompletedAt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
        active
          ? "border-primary-muted bg-primary-soft/60 text-primary-strong"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
      )}
    >
      {label}
      <span className="tabular-nums text-muted-foreground">{count}</span>
    </button>
  );
}

function AlertRow({ item }: { item: NoOrderAlertItem }) {
  const is6m = item.tier === "6m";
  return (
    <div className="flex flex-col gap-1 border-b border-slate-100 px-1 py-2.5 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-slate-900">
          {item.name || "(이름 없음)"}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {getRequestorRoleBadgeLabel(item.kind)} · 마지막 완료{" "}
          {formatCompletedAt(item.lastCompletedAt)} ·{" "}
          {Number(item.daysSinceCompletion || 0).toLocaleString()}일 전
        </div>
      </div>
      <Badge
        variant="outline"
        className={cn(
          "w-fit shrink-0 text-[10px]",
          is6m
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-amber-200 bg-amber-50 text-amber-800",
        )}
      >
        {NO_ORDER_TIER_LABEL[item.tier]} 무주문
      </Badge>
    </div>
  );
}

export function NoOrderAlertDialog({ open, onOpenChange, data }: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const summary = data?.summary;
  const items = Array.isArray(data?.items) ? data.items : [];
  const count3m = Number(summary?.count3m || 0);
  const count6m = Number(summary?.count6m || 0);
  const total = Number(summary?.total || items.length);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((it) => it.tier === filter);
  }, [filter, items]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>무주문 의뢰자</DialogTitle>
          <DialogDescription>
            마지막 완료 기준 3개월·6개월 이상 주문이 없는 치과·기공소입니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            label="전체"
            count={total}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          <FilterChip
            label={NO_ORDER_TIER_LABEL["3m"]}
            count={count3m}
            active={filter === "3m"}
            onClick={() => setFilter("3m")}
          />
          <FilterChip
            label={NO_ORDER_TIER_LABEL["6m"]}
            count={count6m}
            active={filter === "6m"}
            onClick={() => setFilter("6m")}
          />
        </div>

        <div className="max-h-[55vh] overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              해당 조건의 의뢰자가 없습니다.
            </p>
          ) : (
            filtered.map((item) => (
              <AlertRow key={item.businessAnchorId} item={item} />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
