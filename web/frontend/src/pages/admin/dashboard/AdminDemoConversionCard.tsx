// related files:
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// - web/frontend/src/shared/demo/AdminDemoConversionConfirmModal.tsx
// - web/backend/controllers/admin/adminCredit.controller.js
// change-log:
// - 2026-10-04: 관리자 대시보드 — 어벗츠(하청·자체) 데모 전환 지급 확인 카드.
import { useCallback, useEffect, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { DashBigNumber, DashTile } from "@/shared/ui/dashboard/DashTile";
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
    <DashTile
      title="데모 전환 확인"
      icon={<ArrowRightLeft className="h-4 w-4 text-muted-foreground" />}
      tone={count > 0 ? "warn" : "default"}
      className={className}
      onClick={
        count > 0 ? () => openAdminDemoConversionConfirm(pending[0].invoiceId) : undefined
      }
    >
      <div className="flex h-full flex-col justify-end gap-0.5">
        <DashBigNumber value={count.toLocaleString("ko-KR")} unit="대기" />
        <p className="truncate text-[11px] text-muted-foreground">
          {pending[0]
            ? `${pending[0].practiceName || "치과"} · ${pending[0].amount.toLocaleString("ko-KR")}원${count > 1 ? ` 외 ${count - 1}건` : ""}`
            : loading
              ? "불러오는 중…"
              : "확인할 전환 없음"}
        </p>
      </div>
    </DashTile>
  );
}
