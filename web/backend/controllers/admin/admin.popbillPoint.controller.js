// related files:
// - web/backend/services/popbillPointAlert.service.js
// - web/backend/utils/popbill.util.js
// - web/frontend/src/pages/admin/dashboard/AdminPopbillPointCard.tsx
// change-log:
// - 2026-10-13: 잔액 응답에 테스트 모드 표시. 로컬은 테스트 잔액, 충전 창은 운영 파트너.
// - 2026-10-13: 팝빌 파트너 잔여포인트 조회·충전 URL 발급(관리자).
// - 2026-11-25: 잔액은 5분 캐시. fresh=1(충전 중)만 팝빌을 다시 호출한다.
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

const BALANCE_OK_TTL_MS = 5 * 60 * 1000;
const BALANCE_ERR_TTL_MS = 15 * 1000;

/** @type {{ at: number, balance: number | null, error: string } | null} */
let balanceCache = null;
/** @type {Promise<{ balance: number | null, error: string }> | null} */
let balanceInflight = null;

function shortagePayload() {
  const current = getPopbillPointShortage();
  if (!current) return null;
  return {
    at: current.at.toISOString(),
    count: current.count,
    message: current.message,
  };
}

async function readPartnerBalance(force) {
  const now = Date.now();
  if (!force && balanceCache) {
    const ttl = balanceCache.error ? BALANCE_ERR_TTL_MS : BALANCE_OK_TTL_MS;
    if (now - balanceCache.at < ttl) return balanceCache;
  }
  if (!force && balanceInflight) return balanceInflight;

  const task = (async () => {
    let balance = null;
    let error = "";
    try {
      balance = await getPopbillPartnerBalance();
      if (Number.isFinite(balance) && balance > 0 && getPopbillPointShortage()) {
        clearPopbillPointShortage();
      }
    } catch (e) {
      error = String(e?.message || e || "");
    }
    balanceCache = {
      at: Date.now(),
      balance: Number.isFinite(balance) ? balance : null,
      error,
    };
    return balanceCache;
  })().finally(() => {
    if (balanceInflight === task) balanceInflight = null;
  });
  if (!force) balanceInflight = task;
  return task;
}

/** @route GET /api/admin/popbill/point */
export async function adminGetPopbillPoint(req, res) {
  const testMode = isPopbillTestMode();
  if (!isPopbillAccountCheckConfigured()) {
    return res.json({
      success: true,
      data: { configured: false, balance: null, shortage: null, testMode },
    });
  }
  const force = String(req.query?.fresh || "") === "1";
  const read = await readPartnerBalance(force);
  return res.json({
    success: true,
    data: {
      configured: true,
      balance: read.balance,
      testMode,
      error: read.error,
      shortage: shortagePayload(),
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
