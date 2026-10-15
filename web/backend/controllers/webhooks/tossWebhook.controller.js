// change-log:
// - 2026-10-15: 토스 결제 상태 웹훅(스토어 카드결제 PG 취소 동기화).
// related files:
// - web/backend/services/storeSale.service.js
// - web/backend/modules/webhooks/webhook.routes.js
import { syncStoreCardPaymentFromWebhook } from "../../services/storeSale.service.js";

/**
 * POST /api/webhooks/toss — eventType=PAYMENT_STATUS_CHANGED.
 * 본문은 신뢰하지 않고 paymentKey로 토스에 재조회한다. 항상 200(재전송 폭주 방지).
 */
export async function handleTossWebhook(req, res) {
  try {
    const eventType = String(req.body?.eventType || "");
    const paymentKey = req.body?.data?.paymentKey;
    if (eventType === "PAYMENT_STATUS_CHANGED" && paymentKey) {
      await syncStoreCardPaymentFromWebhook({ paymentKey });
    }
  } catch (error) {
    console.warn("[tossWebhook] 처리 실패:", error?.message || error);
  }
  return res.status(200).json({ success: true });
}
