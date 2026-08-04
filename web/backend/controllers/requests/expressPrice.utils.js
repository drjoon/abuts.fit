// related files:
// - web/backend/controllers/requests/shippingPriority.utils.js
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/controllers/requests/creation.from-draft.controller.js
// - web/backend/controllers/requests/shipping.Requestor.controller.js
// - web/backend/rules.md

function normalizeShippingMode(value) {
  return value === "express" ? "express" : "normal";
}

/**
 * 견적/표시용 금액 SSOT:
 * - 신속(express)이면 `creditSettings.expressFee`(기본 1,000)를 amount에 합산하고 expressFee에 기록
 * - 실제 차감은 CAM 승인 시 express_surcharge 저널로 분리 처리
 * - expressFeeStatus === "cancelled" 이면 표시 금액에서 추가비를 제외
 *
 * 이중 합산 방지: 기존 price.expressFee 만큼을 base에서 제거한 뒤 다시 적용한다.
 */
export function resolveQuotedPriceWithExpressFee({
  price,
  shippingMode,
  expressFee = 1000,
}) {
  const src = price && typeof price === "object" ? { ...price } : {};
  const mode = normalizeShippingMode(shippingMode);
  const feeSetting = Math.max(0, Number(expressFee) || 0);
  const recordedFee = Math.max(0, Number(src.expressFee) || 0);
  const amountRaw = Number(src.amount);
  const amount =
    Number.isFinite(amountRaw) && amountRaw > 0
      ? amountRaw
      : Math.max(0, amountRaw || 0);
  const status = String(src.expressFeeStatus || "").trim();
  const baseAmount = Math.max(0, amount - recordedFee);

  // 무상/0원 견적은 신속 추가비도 붙이지 않는다.
  if (!(baseAmount > 0)) {
    const next = { ...src, amount: baseAmount };
    if (mode !== "express" || status === "cancelled") {
      next.expressFee =
        recordedFee > 0 && status === "cancelled" ? recordedFee : null;
    }
    return next;
  }

  if (mode === "express" && status !== "cancelled" && feeSetting > 0) {
    return {
      ...src,
      amount: baseAmount + feeSetting,
      expressFee: feeSetting,
    };
  }

  const next = {
    ...src,
    amount: baseAmount,
  };

  if (status === "cancelled") {
    next.expressFee = recordedFee > 0 ? recordedFee : feeSetting || null;
    next.expressFeeStatus = "cancelled";
  } else {
    next.expressFee = null;
    if (next.expressFeeStatus && next.expressFeeStatus !== "charged") {
      delete next.expressFeeStatus;
    }
  }

  return next;
}
