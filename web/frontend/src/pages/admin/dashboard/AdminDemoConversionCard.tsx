// related files:
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// - web/frontend/src/shared/demo/AdminDemoConversionConfirmModal.tsx
// - web/backend/controllers/admin/adminCredit.controller.js
// change-log:
// - 2026-10-04: 관리자 대시보드 — 어벗츠(하청·자체) 데모 전환 지급 확인 카드.
import { useCallback, useEffect, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/shared/ui/cn";
import { request } from "@/shared/api/apiClient";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";
import {
  openAdminDemoConversionConfirm,
  type AdminPendingDemoConversion,
} from "@/shared/demo/AdminDemoConversionConfirmModal";

type Props = {
  enabled?: boolean;
  className?: string;
};

export function AdminDemoConversionCard({ enabled = true, className }: Props) {
  const [pending, setPending] = useState<AdminPendingDemoConversion[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const res = await request<{
        success?: boolean;
        data?: { pending?: AdminPendingDemoConversion[] };
      }>({ path: "/api/admin/credits/demo-conversions", method: "GET" });
      if (res.ok) setPending(res.data?.data?.pending || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  useAppEventListener({
    eventTypes: ["credit:balance-updated"],
    enabled,
    onMatch: (evt) => {
      const reason = String(
        (evt?.data as { reason?: string } | null)?.reason || "",
      );
      if (!reason.startsWith("demo_conversion")) return;
      void load();
    },
  });

  const count = pending.length;

  return (
    <Card className={cn("app-glass-card app-glass-card--lg", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          데모 전환 · 어벗츠 확인
        </CardTitle>
        <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <button
          type="button"
          className="w-full rounded-sm px-1 py-1 text-left transition hover:bg-slate-50/70 disabled:cursor-default disabled:hover:bg-transparent"
          onClick={() => {
            if (pending[0]) openAdminDemoConversionConfirm(pending[0].invoiceId);
          }}
          disabled={count === 0}
        >
          <div className="text-2xl font-bold">
            {count.toLocaleString("ko-KR")}
            <span className="ml-1 text-sm font-medium text-muted-foreground">
              대기
            </span>
          </div>
          <div className="mt-2 space-y-1">
            {pending.slice(0, 3).map((row) => (
              <div
                key={row.invoiceId}
                className="truncate text-[11px] text-slate-700"
              >
                {row.practiceName || "치과"}
                <span className="text-muted-foreground">
                  {" "}
                  · {row.amount.toLocaleString("ko-KR")}원
                </span>
              </div>
            ))}
            {count === 0 ? (
              <div className="text-[11px] text-muted-foreground">
                {loading
                  ? "불러오는 중…"
                  : "확인할 하청·어벗츠 자체 전환이 없습니다."}
              </div>
            ) : null}
            {count > 3 ? (
              <div className="text-[11px] text-muted-foreground">
                외 {(count - 3).toLocaleString("ko-KR")}건
              </div>
            ) : null}
          </div>
          {count > 0 ? (
            <div className="mt-2 text-[11px] text-muted-foreground">
              클릭하면 지급 완료를 확인합니다.
            </div>
          ) : null}
        </button>
      </CardContent>
    </Card>
  );
}
