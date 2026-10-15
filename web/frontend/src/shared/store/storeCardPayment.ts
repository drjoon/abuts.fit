// change-log:
// - 2026-10-15: 스토어 카드결제(토스 결제창). 크레딧과 분리.
// related files:
// - web/backend/controllers/store/storeOrder.controller.js (createStoreOrder · confirm)
// - web/frontend/src/pages/requestor/store/RequestorStorePaymentResultPage.tsx
import { loadTossPayments, ANONYMOUS } from "@tosspayments/tosspayments-sdk";

export type StoreCardPgInfo = {
  provider: "toss";
  clientKey: string;
  orderId: string;
  orderName: string;
  amount: number;
};

export const STORE_PAYMENT_SUCCESS_PATH = "/dashboard/store/payment/success";
export const STORE_PAYMENT_FAIL_PATH = "/dashboard/store/payment/fail";

/** 토스 결제창으로 이동(리다이렉트). 성공 시 success 경로로 돌아온다. */
export async function requestStoreCardPayment({
  pg,
  storeOrderId,
  customerEmail,
  customerName,
}: {
  pg: StoreCardPgInfo;
  storeOrderId: string;
  customerEmail?: string;
  customerName?: string;
}): Promise<void> {
  const tossPayments = await loadTossPayments(pg.clientKey);
  const payment = tossPayments.payment({ customerKey: ANONYMOUS });
  const origin = window.location.origin;
  const q = `id=${encodeURIComponent(storeOrderId)}`;
  await payment.requestPayment({
    method: "CARD",
    amount: { currency: "KRW", value: pg.amount },
    orderId: pg.orderId,
    orderName: pg.orderName,
    successUrl: `${origin}${STORE_PAYMENT_SUCCESS_PATH}?${q}`,
    failUrl: `${origin}${STORE_PAYMENT_FAIL_PATH}?${q}`,
    customerEmail: customerEmail || undefined,
    customerName: customerName || undefined,
  });
}
