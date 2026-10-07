// related files:
// - web/frontend/src/shared/pricing/requestorUnitPricePolicy.ts
// - web/backend/services/pricingReferralSnapshot.service.js
// - web/backend/utils/creditSettingsDefaults.js
// - web/backend/rules.md
// change-log:
// - 2026-10-08: 기공소 전용(치과는 기존 단일가). 제조사 매입 49.5%.
// - 2026-10-08: 의뢰비 = 매일 자정 30일 주문량 스냅샷 단가(하루 고정). 가입 90일 1만원 고정.

/**
 * 기공소 커스텀어벗 건당 의뢰비 정책 (SSOT). 치과는 해당 없음(기존 단일가·런칭 이벤트).
 * - 기본 15,000원.
 * - 가입 후 90일간 10,000원 고정.
 * - 91일부터: 소개 그룹 지난 30일 합산 주문 1건당 50원 할인, 100건 이상이면 최대 5,000원(=10,000원).
 * - 단가는 매일 자정(KST) 스냅샷으로 정하고 그날 하루 동안 쓴다. 배송비는 별도.
 */
export const REQUESTOR_UNIT_PRICE_BASE = 15_000;
export const REQUESTOR_UNIT_PRICE_PER_ORDER_DISCOUNT = 50;
export const REQUESTOR_UNIT_PRICE_MAX_DISCOUNT = 5_000;
export const REQUESTOR_UNIT_PRICE_INTRO_DAYS = 90;
export const REQUESTOR_UNIT_PRICE_INTRO_PRICE = 10_000;
/** 제조사 정산 규칙: 판매가의 49.5%(부가세 포함) 고정. */
export const REQUESTOR_UNIT_PRICE_MANUFACTURER_SHARE_PCT = 49.5;
export const REQUESTOR_UNIT_PRICE_FLOOR =
  REQUESTOR_UNIT_PRICE_BASE - REQUESTOR_UNIT_PRICE_MAX_DISCOUNT;

const DAY_MS = 24 * 60 * 60 * 1000;

const KST_YMD_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toKstYmd(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return KST_YMD_FMT.format(d);
}

function ymdToCivilDayNumber(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
  if (!m) return null;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS);
}

/**
 * 가입일(KST)부터 90일(가입일 포함)이면 이벤트. 91일째부터 주문량 할인.
 * @returns {{ inIntro: boolean, introEndsYmd: string|null }}
 */
export function resolveRequestorIntroWindow(startedAt, ymd) {
  const startYmd = startedAt ? toKstYmd(startedAt) : "";
  const startDay = ymdToCivilDayNumber(startYmd);
  const todayDay = ymdToCivilDayNumber(ymd);
  if (startDay == null || todayDay == null) {
    return { inIntro: false, introEndsYmd: null };
  }
  const endDay = startDay + REQUESTOR_UNIT_PRICE_INTRO_DAYS - 1;
  const end = new Date(endDay * DAY_MS);
  return {
    inIntro: todayDay <= endDay,
    introEndsYmd: end.toISOString().slice(0, 10),
  };
}

export function computeRequestorVolumeDiscount(groupOrders30d) {
  const orders = Math.max(0, Math.floor(Number(groupOrders30d) || 0));
  return Math.min(
    orders * REQUESTOR_UNIT_PRICE_PER_ORDER_DISCOUNT,
    REQUESTOR_UNIT_PRICE_MAX_DISCOUNT,
  );
}

/**
 * @param {{ groupOrders30d?: number, startedAt?: Date|string|null, ymd: string }} input
 * @returns {{ unitPrice: number, discountAmount: number, rule: "intro_fixed"|"volume_discount"|"base_price", introEndsYmd: string|null }}
 */
export function resolveRequestorUnitPrice({ groupOrders30d, startedAt, ymd }) {
  const { inIntro, introEndsYmd } = resolveRequestorIntroWindow(startedAt, ymd);
  if (inIntro) {
    return {
      unitPrice: REQUESTOR_UNIT_PRICE_INTRO_PRICE,
      discountAmount: REQUESTOR_UNIT_PRICE_BASE - REQUESTOR_UNIT_PRICE_INTRO_PRICE,
      rule: "intro_fixed",
      introEndsYmd,
    };
  }
  const discountAmount = computeRequestorVolumeDiscount(groupOrders30d);
  return {
    unitPrice: REQUESTOR_UNIT_PRICE_BASE - discountAmount,
    discountAmount,
    rule: discountAmount > 0 ? "volume_discount" : "base_price",
    introEndsYmd,
  };
}
