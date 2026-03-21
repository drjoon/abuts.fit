// BANK_WEBHOOK은 큐/워커를 거치지 않고 웹 백엔드에서 바로 처리
// EasyFin(팝빌) 등 은행 웹훅으로 전달된 거래를 즉시 저장/업서트한다.
import {
  upsertBankTransaction,
  autoMatchBankTransactionsOnce,
} from "../../utils/creditBPlanMatching.js";

function parsePopbillOccurredAt(transDate, transTime) {
  // Popbill TransDate: yyyyMMdd, TransTime: hhmmss
  const d = String(transDate || "").trim();
  const t = String(transTime || "")
    .trim()
    .padStart(6, "0");
  if (d.length === 8) {
    const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}+09:00`;
    const dt = new Date(iso);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  return null;
}

export async function handleBankWebhook(req, res) {
  try {
    // 선택적 시크릿 검증 (POPBILL_BANK_WEBHOOK_SECRET 설정 시 활성화)
    const expectedSecret = process.env.POPBILL_BANK_WEBHOOK_SECRET;
    if (expectedSecret) {
      const receivedSecret =
        req.headers["x-popbill-token"] ||
        req.headers["x-webhook-secret"] ||
        req.body?.secret;
      if (receivedSecret !== expectedSecret) {
        console.warn("[bankWebhook] unauthorized attempt");
        return res
          .status(401)
          .json({ success: false, message: "unauthorized" });
      }
    }

    const payload = req.body || {};

    // Popbill EasyFinBank 웹훅 필드 우선 적용, 범용 필드 폴백
    const transCode = String(
      payload.TransCode ?? payload.transCode ?? "",
    ).trim();
    // TransCode 1 = 입금, 2 = 출금. 설정된 경우 입금만 처리
    if (transCode && transCode !== "1") {
      return res.json({
        success: true,
        skipped: true,
        reason: "출금 거래 무시",
      });
    }

    const occurredAt =
      parsePopbillOccurredAt(
        payload.TransDate ?? payload.transDate,
        payload.TransTime ?? payload.transTime,
      ) ||
      payload.occurredAt ||
      payload.tranDate ||
      payload.date ||
      null;

    const doc = await upsertBankTransaction({
      externalId:
        payload.TransNo ??
        payload.transNo ??
        payload.bankTxId ??
        payload.receiptNo ??
        payload.id,
      bankCode: payload.BankCode ?? payload.bankCode ?? payload.bankcode,
      accountNumber:
        payload.AccountNumber ?? payload.accountNumber ?? payload.acctNo,
      tranAmt:
        payload.TransAmt ??
        payload.transAmt ??
        payload.tranAmt ??
        payload.amount,
      printedContent:
        payload.PrintContent ??
        payload.printContent ??
        payload.printedContent ??
        payload.tranDesc ??
        payload.content ??
        payload.memo,
      occurredAt,
      raw: payload,
    });

    const matchResult = await autoMatchBankTransactionsOnce({
      limit: 50,
    }).catch(() => null);

    return res.json({ success: true, data: doc, matchResult });
  } catch (error) {
    console.error("[bankWebhook] error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "BANK_WEBHOOK 처리 중 오류가 발생했습니다.",
    });
  }
}

export default { handleBankWebhook };
