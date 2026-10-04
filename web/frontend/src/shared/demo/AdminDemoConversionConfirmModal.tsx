// related files:
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/admin/dashboard/AdminDemoConversionCard.tsx
// - web/backend/controllers/admin/adminCredit.controller.js
// change-log:
// - 2026-10-04: 하청·어벗츠 자체 몫 지급 확인 — 기공사업부 대신 관리자.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { request } from "@/shared/api/apiClient";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";

export type AdminPendingDemoConversion = {
  invoiceId: string;
  practiceName: string;
  amount: number;
  requestedAt?: string;
};

const OPEN_EVENT = "abuts:admin-demo-conversion-open";

/** 대시보드 카드에서 닫아 둔 확인 모달을 다시 연다. */
export function openAdminDemoConversionConfirm(invoiceId?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(OPEN_EVENT, { detail: { invoiceId: invoiceId || "" } }),
  );
}

export function AdminDemoConversionConfirmModal() {
  const [pending, setPending] = useState<AdminPendingDemoConversion[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [focusInvoiceId, setFocusInvoiceId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await request<{
        success?: boolean;
        data?: { pending?: AdminPendingDemoConversion[] };
      }>({ path: "/api/admin/credits/demo-conversions", method: "GET" });
      if (res.ok) setPending(res.data?.data?.pending || []);
    } catch {
      /* 조회 실패는 조용히 무시 */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onOpen = (evt: Event) => {
      const invoiceId = String(
        (evt as CustomEvent<{ invoiceId?: string }>).detail?.invoiceId || "",
      ).trim();
      setDismissed((prev) => {
        if (!invoiceId) return new Set();
        const next = new Set(prev);
        next.delete(invoiceId);
        return next;
      });
      if (invoiceId) setFocusInvoiceId(invoiceId);
      void load();
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [load]);

  useAppEventListener({
    eventTypes: ["credit:balance-updated"],
    enabled: true,
    onMatch: (evt) => {
      const reason = String(
        (evt?.data as { reason?: string } | null)?.reason || "",
      );
      if (!reason.startsWith("demo_conversion")) return;
      void load();
    },
  });

  const focused =
    focusInvoiceId &&
    pending.find((row) => row.invoiceId === focusInvoiceId && !dismissed.has(row.invoiceId));
  const queueCurrent =
    focused || pending.find((row) => !dismissed.has(row.invoiceId)) || null;
  if (!queueCurrent) return null;

  return (
    <ConfirmDialog
      open
      title="어벗츠 미정산 잔액을 받았나요?"
      panelClassName="max-w-sm"
      description={
        <p className="text-sm leading-relaxed text-slate-700">
          {queueCurrent.practiceName || "치과"}가 실사용 전환을 요청했습니다.
          <br />
          하청·어벗츠 자체 미정산{" "}
          <span className="font-semibold tabular-nums">
            {queueCurrent.amount.toLocaleString("ko-KR")}원
          </span>
          을 치과에서 직접 지급받으세요.
          <br />
          받았다면 지급 완료를 확인해 주세요.
        </p>
      }
      confirmLabel="지급 완료 확인"
      cancelLabel="나중에"
      confirmTone="primary"
      busy={busy}
      onCancel={() => {
        setDismissed((prev) => new Set(prev).add(queueCurrent.invoiceId));
        if (focusInvoiceId === queueCurrent.invoiceId) setFocusInvoiceId(null);
      }}
      onConfirm={async () => {
        setBusy(true);
        try {
          const res = await request<{
            success?: boolean;
            data?: { completed?: boolean };
          }>({
            path: `/api/admin/credits/demo-conversions/${encodeURIComponent(
              queueCurrent.invoiceId,
            )}/confirm`,
            method: "POST",
          });
          if (!res.ok) {
            toast.error("지급 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
            return;
          }
          const completed = Boolean(res.data?.data?.completed);
          if (completed) {
            toast.success(
              "지급 완료를 확인했습니다. 치과가 실사용으로 전환됩니다.",
            );
          } else {
            toast.success(
              "지급 완료를 확인했습니다. 다른 기공소 확인이 끝나면 전환됩니다.",
            );
          }
          setPending((prev) =>
            prev.filter((row) => row.invoiceId !== queueCurrent.invoiceId),
          );
          if (focusInvoiceId === queueCurrent.invoiceId) setFocusInvoiceId(null);
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
