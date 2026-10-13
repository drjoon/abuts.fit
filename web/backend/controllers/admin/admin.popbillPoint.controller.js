// related files:
// - web/backend/services/popbillPointAlert.service.js
// - web/backend/utils/popbill.util.js
// - web/frontend/src/pages/admin/dashboard/AdminPopbillPointCard.tsx
// change-log:
// - 2026-10-13: 잔액 응답에 테스트 모드 표시. 로컬은 테스트 잔액, 충전 창은 운영 파트너.
// - 2026-10-13: 팝빌 파트너 잔여포인트 조회·충전 URL 발급(관리자).
import {
  getPopbillPartnerBalance,
  getPopbillPartnerChargeUrl,
  isPopbillAccountCheckConfigured,
  isPopbillTestMode,
} from "../../utils/popbill.util.js";
import {
  clearPopbillPointShortage,
  getPopbillPointShortage,
} from "../../services/popbillPointAlert.service.js";

/** @route GET /api/admin/popbill/point */
export async function adminGetPopbillPoint(req, res) {
  const shortage = getPopbillPointShortage();
  const testMode = isPopbillTestMode();
  if (!isPopbillAccountCheckConfigured()) {
    return res.json({
      success: true,
      data: { configured: false, balance: null, shortage: null, testMode },
    });
  }
  let balance = null;
  let error = "";
  try {
    balance = await getPopbillPartnerBalance();
    if (Number.isFinite(balance) && balance > 0 && shortage) {
      clearPopbillPointShortage();
    }
  } catch (e) {
    error = String(e?.message || e || "");
  }
  const current = getPopbillPointShortage();
  return res.json({
    success: true,
    data: {
      configured: true,
      balance: Number.isFinite(balance) ? balance : null,
      testMode,
      error,
      shortage: current
        ? {
            at: current.at.toISOString(),
            count: current.count,
            message: current.message,
          }
        : null,
    },
  });
}

/** @route POST /api/admin/popbill/point/charge-url */
export async function adminGetPopbillPointChargeUrl(req, res) {
  try {
    const url = await getPopbillPartnerChargeUrl();
    return res.json({ success: true, data: { url } });
  } catch (e) {
    return res.status(502).json({
      success: false,
      message: String(e?.message || "충전 페이지 주소를 받지 못했습니다."),
    });
  }
}
