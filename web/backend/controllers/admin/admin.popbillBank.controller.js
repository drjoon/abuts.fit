// related files:
// - web/backend/services/easyFinBankSync.service.js
// - web/backend/modules/admin/admin.routes.js
// - web/frontend/src/pages/admin/dashboard/AdminPopbillBankCard.tsx
// change-log:
// - 2026-10-14: 관리자 하나은행 잔액 조회·즉시 수집.
import { isPopbillTestMode } from "../../utils/popbill.util.js";
import {
  getEasyFinBankSnapshot,
  syncEasyFinBankOnce,
} from "../../services/easyFinBankSync.service.js";

function maskAccount(accountNumber) {
  const digits = String(accountNumber || "").replace(/\D/g, "");
  if (digits.length < 4) return "";
  return digits.slice(-4);
}

function toPublic(doc, account, configured) {
  const number = doc?.accountNumber || account?.accountNumber || "";
  return {
    configured,
    testMode: isPopbillTestMode(),
    bankName: doc?.bankName || account?.bankName || "하나은행",
    accountTail: maskAccount(number),
    balance: doc?.balance == null ? null : Number(doc.balance),
    lastScrapAt: doc?.lastScrapAt ? new Date(doc.lastScrapAt).toISOString() : null,
    syncedAt: doc?.syncedAt ? new Date(doc.syncedAt).toISOString() : null,
    depositCount: Number(doc?.depositCount || 0),
    error: String(doc?.error || ""),
  };
}

/** @route GET /api/admin/popbill/bank */
export async function adminGetPopbillBank(req, res) {
  const { doc, account, configured } = await getEasyFinBankSnapshot();
  return res.json({
    success: true,
    data: toPublic(doc, account, configured),
  });
}

/** @route POST /api/admin/popbill/bank/sync */
export async function adminSyncPopbillBank(req, res) {
  try {
    const { snapshot } = await syncEasyFinBankOnce();
    const { account, configured } = await getEasyFinBankSnapshot();
    return res.json({
      success: true,
      data: toPublic(snapshot, account, configured),
    });
  } catch (e) {
    const status = e?.statusCode || 502;
    return res.status(status).json({
      success: false,
      message: String(e?.message || "계좌 조회에 실패했습니다."),
    });
  }
}
