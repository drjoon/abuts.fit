import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ShippingPackageSummaryItem {
  id: string;
  shipDateYmd: string;
  requestCount: number;
  shippingFeeSupply: number;
  createdAt?: string;
}

interface ShippingPackagesSummaryResponse {
  success: boolean;
  data: {
    today: {
      shipDateYmd: string;
      packageCount: number;
      shippingFeeSupplyTotal: number;
    };
    lastNDays: {
      days: number;
      packageCount: number;
      shippingFeeSupplyTotal: number;
    };
    items: ShippingPackageSummaryItem[];
  };
}

export const RequestorShippingSummaryCard = () => {
  const { token, user } = useAuthStore();

  const canAccess = user?.role === "requestor";

  const { data, isLoading } = useQuery({
    queryKey: ["requestor-shipping-packages-summary"],
    enabled: Boolean(token && canAccess),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("days", "30");

      const res = await apiFetch<ShippingPackagesSummaryResponse>({
        path: `/api/requests/my/shipping-packages?${params.toString()}`,
        method: "GET",
        token,
      });

      if (!res.ok || !res.data?.success) {
        throw new Error("발송 패키지 요약 조회에 실패했습니다.");
      }
      return res.data.data;
    },
  });

  const memo = useMemo(() => {
    if (!data) {
      return {
        todayCount: 0,
        todayFee: 0,
        last30Fee: 0,
        last30Count: 0,
        items: [] as ShippingPackageSummaryItem[],
        todayRequests: [] as any[],
      };
    }

    const todayCount = data.today?.packageCount ?? 0;
    const todayFee = data.today?.shippingFeeSupplyTotal ?? 0;
    const last30Fee = data.lastNDays?.shippingFeeSupplyTotal ?? 0;
    const last30Count = data.lastNDays?.packageCount ?? 0;
    const items = Array.isArray(data.items) ? data.items : [];
    const todayRequests = items
      .filter((it) => it.shipDateYmd === data.today?.shipDateYmd)
      .flatMap((it) =>
        Array.isArray((it as any).requests) ? (it as any).requests : [],
      );

    return {
      todayCount,
      todayFee,
      last30Fee,
      last30Count,
      items,
      todayRequests: todayRequests ?? [],
    };
  }, [data]);

  if (!canAccess) return null;

  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Card className="app-glass-card app-glass-card--lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-foreground">
            오늘 발송 박스 요약
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2 pb-4 text-sm text-foreground space-y-2">
          {isLoading ? (
            <div className="text-xs text-slate-600">불러오는 중...</div>
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-slate-600">박스 내용</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto px-2 py-1 text-sm font-semibold text-foreground"
                  disabled={
                    memo.todayCount === 0 || memo.todayRequests.length === 0
                  }
                  onClick={() => setDialogOpen(true)}
                >
                  {`(${memo.todayRequests.length.toLocaleString()}건)`}
                </Button>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-slate-600">배송비 합계 (공급가)</span>
                <span className="text-lg font-semibold text-foreground">
                  {memo.todayFee.toLocaleString()}원
                </span>
              </div>
              <div className="flex items-baseline justify-between pt-1 border-t border-dashed border-gray-200 mt-2">
                <span className="text-slate-600">지난 30일 배송비 합계</span>
                <span className="text-sm font-semibold text-foreground">
                  {memo.last30Fee.toLocaleString()}원
                </span>
              </div>
              <div className="mt-2 space-y-1 max-h-32 overflow-auto pr-1">
                {memo.items.length === 0 ? (
                  <div className="text-[11px] text-slate-600">
                    최근 30일 이내 발송된 박스가 없습니다.
                  </div>
                ) : (
                  memo.items.slice(0, 30).map((it) => (
                    <div
                      key={it.id}
                      className="flex items-center justify-between text-[11px] text-slate-600"
                    >
                      <span>
                        {it.shipDateYmd} ({it.requestCount.toLocaleString()}건)
                      </span>
                      <span className="font-medium text-foreground">
                        {it.shippingFeeSupply.toLocaleString()}원
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>오늘 발송 박스 내용</DialogTitle>
          </DialogHeader>
          {memo.todayRequests.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              표시할 의뢰가 없습니다.
            </div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-auto pr-1">
              {memo.todayRequests.map((req: any) => {
                const ci = req?.caseInfos || {};
                const title =
                  String(req?.title || "").trim() ||
                  [ci?.patientName, ci?.tooth].filter(Boolean).join(" ") ||
                  String(req?.requestId || "");
                return (
                  <div
                    key={String(req?.id || req?._id || Math.random())}
                    className="rounded-md border border-gray-200 bg-white px-3 py-2"
                  >
                    <div className="text-sm font-semibold text-gray-900 truncate">
                      {title}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      의뢰번호: {String(req?.requestId || "")}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
