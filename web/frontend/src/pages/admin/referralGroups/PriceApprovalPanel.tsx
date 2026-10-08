// related files:
// - web/backend/controllers/admin/admin.priceApproval.controller.js
// - web/frontend/src/shared/sales/CustomerPriceDialog.tsx
// change-log:
// - 2026-10-08: 영업팀이 입력한 거래처 가격을 본사가 승인/반려. 승인 후 거래 가능.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { formatRequestorWon } from "@/shared/pricing/requestorUnitPricePolicy";

type Item = {
  anchorId: string;
  name: string;
  requestorKind: "practice" | "lab" | null;
  referrerName: string;
  currentPrice: number | null;
  requestedPrice: number | null;
};

const KIND_LABEL: Record<string, string> = { practice: "치과", lab: "기공소" };

export function PriceApprovalPanel() {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    const res = await request<any>({
      path: "/api/admin/price-approvals",
      method: "GET",
      token,
      skipCache: true,
    });
    const body: any = res.data || {};
    if (res.ok && body?.success) setItems(body.data?.items || []);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (anchorId: string, approve: boolean) => {
    if (busyId) return;
    setBusyId(anchorId);
    try {
      const res = await request<any>({
        path: `/api/admin/price-approvals/${encodeURIComponent(anchorId)}`,
        method: "POST",
        token,
        jsonBody: { approve },
      });
      const body: any = res.data || {};
      if (!res.ok || !body?.success) throw new Error(body?.message || "처리에 실패했습니다.");
      setItems((prev) => prev.filter((i) => i.anchorId !== anchorId));
      toast({ title: approve ? "승인했습니다." : "반려했습니다.", duration: 2000 });
    } catch (e: any) {
      toast({ title: "처리 실패", description: e?.message, variant: "destructive" });
    } finally {
      setBusyId("");
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="shrink-0 rounded-2xl border border-amber-200/80 bg-amber-50/60 px-4 py-3 shadow-sm sm:px-5">
      <h2 className="mb-2 text-sm font-bold tracking-tight text-slate-900">
        영업팀 거래처 가격 승인 대기 {items.length}건
      </h2>
      <div className="space-y-1.5 px-1.5 py-1.5">
        {items.map((i) => (
          <div
            key={i.anchorId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="truncate font-medium text-slate-900">{i.name}</span>
              {i.requestorKind ? (
                <Badge variant="outline" className="text-[10px]">
                  {KIND_LABEL[i.requestorKind]}
                </Badge>
              ) : null}
              <span className="text-xs text-slate-500">{i.referrerName}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm tabular-nums text-slate-700">
                {formatRequestorWon(i.requestedPrice ?? 0)}원
              </span>
              <Button size="sm" disabled={Boolean(busyId)} onClick={() => void decide(i.anchorId, true)}>
                승인
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={Boolean(busyId)}
                onClick={() => void decide(i.anchorId, false)}
              >
                반려
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
