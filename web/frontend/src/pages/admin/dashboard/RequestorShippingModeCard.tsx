// change-log:
// - 2026-10-14: 1열·3.5행 높이·세로 스크롤 고정.
// - 2026-10-13: 의뢰자별 배송 방식(택배/딜리버리) 지정 카드. 딜리버리 지정·월 의뢰 많은 순.
// related files:
// - web/backend/controllers/admin/admin.requestorShipping.controller.js
// - web/frontend/src/shared/shipping/ShippingModeToggle.tsx
import { useCallback, useEffect, useState } from "react";
import { Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { DashTile } from "@/shared/ui/dashboard/DashTile";
import {
  ShippingModeToggle,
  type RequestorShippingMode,
} from "@/shared/shipping/ShippingModeToggle";
import {
  DELIVERY_CONDITION_LINE,
  DELIVERY_MIN_MONTHLY_REQUESTS,
} from "@/shared/shipping/shippingPolicyCopy";

type Item = {
  anchorId: string;
  name: string;
  requestorKind: "practice" | "lab" | null;
  referrerName: string;
  shippingMode: RequestorShippingMode;
  monthlyRequestCount: number;
  prevMonthRequestCount: number;
};

const KIND_LABEL: Record<string, string> = { practice: "치과", lab: "기공소" };

export function RequestorShippingModeCard({ className }: { className?: string }) {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [items, setItems] = useState<Item[] | null>(null);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(
    async (query: string) => {
      const res = await request<any>({
        path: `/api/admin/requestor-shipping${query ? `?q=${encodeURIComponent(query)}` : ""}`,
        method: "GET",
        token,
        skipCache: true,
      });
      const body: any = res.data || {};
      if (!res.ok || !body?.success) {
        setError(body?.message || "불러오지 못했습니다.");
        setItems([]);
        return;
      }
      setError("");
      setItems(body.data?.items || []);
    },
    [token],
  );

  useEffect(() => {
    const t = window.setTimeout(() => void load(q.trim()), q ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [q, load]);

  const change = async (anchorId: string, shippingMode: RequestorShippingMode) => {
    if (busyId) return;
    setBusyId(anchorId);
    try {
      const res = await request<any>({
        path: `/api/admin/requestor-shipping/${encodeURIComponent(anchorId)}`,
        method: "PUT",
        token,
        jsonBody: { shippingMode },
      });
      const body: any = res.data || {};
      if (!res.ok || !body?.success) throw new Error(body?.message || "저장에 실패했습니다.");
      setItems((prev) =>
        (prev || []).map((i) => (i.anchorId === anchorId ? { ...i, shippingMode } : i)),
      );
      toast({ title: "배송 방식을 저장했습니다.", duration: 2000 });
    } catch (e: any) {
      toast({
        title: "저장 실패",
        description: e?.message || "다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setBusyId("");
    }
  };

  const deliveryCount = (items || []).filter((i) => i.shippingMode === "express").length;

  return (
    <DashTile
      className={className}
      title="의뢰자 배송 방식"
      icon={<Truck className="h-4 w-4 text-muted-foreground" />}
      bodyClassName="flex min-h-0 flex-col gap-2 overflow-hidden"
    >
      <div className="flex shrink-0 items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="의뢰자 검색"
          className="h-8 text-xs"
        />
        <span className="shrink-0 text-[11px] text-muted-foreground">
          딜리버리 {deliveryCount.toLocaleString()}곳 · {DELIVERY_CONDITION_LINE}
        </span>
      </div>
      <div className="h-[12.25rem] shrink-0 overflow-y-scroll px-1.5 py-1.5 [scrollbar-gutter:stable]">
        {items === null ? (
          <p className="text-xs text-slate-500">불러오는 중…</p>
        ) : error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-slate-500">의뢰자가 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
          {items.map((i) => (
            <li
              key={i.anchorId}
              className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-medium text-slate-900">
                    {i.name || "이름 없음"}
                  </span>
                  {i.requestorKind ? (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {KIND_LABEL[i.requestorKind]}
                    </Badge>
                  ) : null}
                </div>
                <div className="truncate text-[11px] tabular-nums text-muted-foreground">
                  이번 달 {i.monthlyRequestCount.toLocaleString()}건 · 지난달{" "}
                  {i.prevMonthRequestCount.toLocaleString()}건
                  {i.monthlyRequestCount >= DELIVERY_MIN_MONTHLY_REQUESTS ? " · 100건 이상" : ""}
                  {i.referrerName ? ` · ${i.referrerName}` : ""}
                </div>
              </div>
              <ShippingModeToggle
                size="sm"
                value={i.shippingMode}
                disabled={busyId === i.anchorId}
                onChange={(next) => void change(i.anchorId, next)}
                ariaLabel={`${i.name} 배송 방식`}
              />
            </li>
          ))}
          </ul>
        )}
      </div>
    </DashTile>
  );
}
