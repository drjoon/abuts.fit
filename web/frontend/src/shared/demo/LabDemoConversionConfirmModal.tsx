// related files:
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/demo/DemoConversionDialog.tsx
// - web/backend/controllers/credits/conversionInvoice.controller.js
// change-log:
// - 2026-10-04: 데모 치과 실사용 전환 요청 -> 기공소가 직접 지급 수령을 확인.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";
import { isCreditEventForBusiness } from "@/shared/realtime/creditBalanceEvent";

type PendingConversion = {
  invoiceId: string;
  practiceName: string;
  amount: number;
};

export function LabDemoConversionConfirmModal() {
  const businessAnchorId = useAuthStore((s) => s.user?.businessAnchorId);
  const [pending, setPending] = useState<PendingConversion[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!businessAnchorId) return;
    try {
      const res = await request<{
        success?: boolean;
        data?: { pending?: PendingConversion[] };
      }>({ path: "/api/credits/lab-demo-conversions", method: "GET" });
      if (res.ok) setPending(res.data?.data?.pending || []);
    } catch {
      /* 조회 실패는 조용히 무시 */
    }
  }, [businessAnchorId]);

  useEffect(() => {
    void load();
  }, [load]);

  useAppEventListener({
    eventTypes: ["credit:balance-updated"],
    enabled: Boolean(businessAnchorId),
    onMatch: (evt) => {
      if (!isCreditEventForBusiness(evt, businessAnchorId)) return;
      void load();
    },
  });

  const current = pending.find((row) => !dismissed.has(row.invoiceId));
  if (!current) return null;

  return (
    <ConfirmDialog
      open
      title="미정산 잔액을 받으셨나요?"
      panelClassName="max-w-sm"
      description={
        <p className="text-sm leading-relaxed text-slate-700">
          {current.practiceName || "치과"}가 실사용 전환을 요청했습니다.
          <br />
          미정산 잔액{" "}
          <span className="font-semibold tabular-nums">
            {current.amount.toLocaleString("ko-KR")}원
          </span>
          을 치과에서 직접 지급받으세요.
          <br />
          받으셨다면 지급 완료를 확인해 주세요.
        </p>
      }
      confirmLabel="지급 완료 확인"
      cancelLabel="나중에"
      confirmTone="primary"
      busy={busy}
      onCancel={() =>
        setDismissed((prev) => new Set(prev).add(current.invoiceId))
      }
      onConfirm={async () => {
        setBusy(true);
        try {
          const res = await request({
            path: `/api/credits/lab-demo-conversions/${encodeURIComponent(
              current.invoiceId,
            )}/confirm`,
            method: "POST",
          });
          if (!res.ok) {
            toast.error("지급 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
            return;
          }
          toast.success("지급 완료를 확인했습니다.");
          setPending((prev) =>
            prev.filter((row) => row.invoiceId !== current.invoiceId),
          );
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
