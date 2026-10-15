// change-log:
// - 2026-10-15: 스토어 카드결제 성공(승인)·실패(주문 정리) 복귀 페이지.
// related files:
// - web/frontend/src/shared/store/storeCardPayment.ts
// - web/backend/controllers/store/storeOrder.controller.js
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { apiFetch, invalidateApiGetCache } from "@/shared/api/apiClient";
import { STORE_SHELL_CLASS } from "@/pages/requestor/store/storeOrderUi";

type Props = { mode: "success" | "fail" };

export default function RequestorStorePaymentResultPage({ mode }: Props) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const storeOrderId = params.get("id") || "";
  const ran = useRef(false);
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (ran.current || !storeOrderId) return;
    ran.current = true;

    if (mode === "fail") {
      setMessage(params.get("message") || "결제가 취소되었거나 실패했습니다.");
      // 결제 대기 주문 정리(재고 예약 해제). 실패해도 만료 처리됨.
      void apiFetch({
        path: `/api/store/orders/${storeOrderId}/cancel`,
        method: "POST",
        skipCache: true,
      }).finally(() => {
        invalidateApiGetCache("/api/store/orders");
        setState("error");
      });
      return;
    }

    const paymentKey = params.get("paymentKey") || "";
    const orderId = params.get("orderId") || "";
    const amount = Number(params.get("amount") || 0);
    void (async () => {
      try {
        const res = await apiFetch<{ success: boolean; message?: string }>({
          path: `/api/store/orders/${storeOrderId}/card/confirm`,
          method: "POST",
          jsonBody: { paymentKey, orderId, amount },
          skipCache: true,
        });
        if (!res.ok || !res.data?.success) {
          throw new Error(res.data?.message || "결제 승인에 실패했습니다.");
        }
        invalidateApiGetCache("/api/store/orders");
        navigate(`/dashboard/store/orders/${storeOrderId}`, { replace: true });
      } catch (err: unknown) {
        setMessage(
          err instanceof Error ? err.message : "결제 승인에 실패했습니다.",
        );
        setState("error");
      }
    })();
  }, [mode, navigate, params, storeOrderId]);

  if (!storeOrderId) {
    return <Navigate to="/dashboard/store/orders" replace />;
  }

  return (
    <div className="custom-scrollbar workspace-nested-scroll h-full min-h-0 overflow-auto">
      <div className={STORE_SHELL_CLASS}>
        {state === "working" ? (
          <p className="text-sm text-muted-foreground">
            결제를 확인하고 있습니다.
            <br />
            이 화면을 닫지 마세요.
          </p>
        ) : (
          <div className="space-y-3">
            <h1 className="text-xl font-semibold tracking-tight">
              결제가 완료되지 않았습니다
            </h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/dashboard/store/orders">주문 내역</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/dashboard/store">스토어</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
