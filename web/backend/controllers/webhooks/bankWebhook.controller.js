// BANK_WEBHOOK은 큐/워커를 거치지 않고 웹 백엔드에서 바로 처리
// EasyFin 등 은행 웹훅으로 전달된 거래를 즉시 저장/업서트한다.
import { upsertBankTransaction } from "../../utils/creditBPlanMatching.js";
import { autoMatchBankTransactionsOnce } from "../../utils/creditBPlanMatching.js";

export async function handleBankWebhook(req, res) {
  try {
    const payload = req.body || {};

    const doc = await upsertBankTransaction({
      externalId: payload.bankTxId || payload.receiptNo || payload.id,
      bankCode: payload.bankCode || payload.bankcode,
      accountNumber: payload.accountNumber || payload.acctNo,
      tranAmt: payload.tranAmt || payload.amount,
      printedContent:
        payload.printedContent ||
        payload.tranDesc ||
        payload.content ||
        payload.memo,
      occurredAt: payload.occurredAt || payload.tranDate || payload.date,
      raw: payload,
    });

    const matchResult = await autoMatchBankTransactionsOnce({
      limit: 50,
    }).catch(() => null);

    return res.json({ success: true, data: doc, matchResult });
  } catch (error) {
    console.error("[bankWebhook] error:", error);
    const status = error.statusCode || 500;
    return res.status(500).json({
      success: false,
      message: error.message || "BANK_WEBHOOK 처리 중 오류가 발생했습니다.",
    });
  }
}

export default { handleBankWebhook };
