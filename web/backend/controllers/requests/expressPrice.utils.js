// change-log:
// - 2026-08-09: expressQty 지원 — 디자인+생산은 커스텀어벗 수만큼 신속비 배수.
// related files:
// - web/backend/controllers/requests/shippingPriority.utils.js
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/controllers/requests/creation.from-draft.controller.js
// - web/backend/controllers/requests/shipping.Requestor.controller.js
// - web/backend/controllers/requests/designPrice.utils.js
// - web/backend/rules.md

function normalizeShippingMode(value) {
  return value === "express" ? "express" : "normal";
}

/**
 * Mongoose nested `price`를 plain object로 정규화한다.
 * `{ ...request.price }` spread는 discountMeta를 `MongooseDocument { undefined }`로
 * 오염시켜 Cast to Object 검증 실패를 일으킨다. 반드시 toObject()/본 헬퍼를 쓴다.
 */
export function toPlainRequestPrice(price) {
  if (!price || typeof price !== "object") return {};

  const raw =
    typeof price.toObject === "function" ? price.toObject() : { ...price };

  // mongoose nested spread 잔여물 제거
  delete raw.$__;
  delete raw.$__parent;
  delete raw.$basePath;
  delete raw._doc;

  if (raw.discountMeta != null && typeof raw.discountMeta === "object") {
    const meta =
      typeof raw.discountMeta.toObject === "function"
        ? raw.discountMeta.toObject()
        : { ...raw.discountMeta };
    const cleanedMeta = {};
    for (const [key, value] of Object.entries(meta)) {
      if (value !== undefined) cleanedMeta[key] = value;
    }
    if (Object.keys(cleanedMeta).length > 0) {
      raw.discountMeta = cleanedMeta;
    } else {
      delete raw.discountMeta;
    }
  } else {
    delete raw.discountMeta;
  }

  for (const key of Object.keys(raw)) {
    if (raw[key] === undefined) delete raw[key];
  }

  return raw;
}

/**
 * 견적/표시용 금액 SSOT:
 * - 신속(express)이면 `creditSettings.expressFee`(기본 2,000) × expressQty 를 amount에 합산하고 expressFee에 총액 기록
 * - expressQty 기본 1(생산 건당). 디자인+생산은 커스텀어벗 수
 * - 실제 차감은 CAM 승인 시 express_surcharge 저널로 분리 처리
 * - expressFeeStatus === "cancelled" 이면 표시 금액에서 추가비를 제외
 *
 * 이중 합산 방지: 기존 price.expressFee 만큼을 base에서 제거한 뒤 다시 적용한다.
 */
export function resolveQuotedPriceWithExpressFee({
  price,
  shippingMode,
  expressFee = 2000,
  expressQty = 1,
}) {
  const src = toPlainRequestPrice(price);
  const mode = normalizeShippingMode(shippingMode);
  const qty = Math.max(0, Math.floor(Number(expressQty) || 0));
  const feeTotal = Math.max(0, Number(expressFee) || 0) * qty;
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

  if (mode === "express" && status !== "cancelled" && feeTotal > 0) {
    return {
      ...src,
      amount: baseAmount + feeTotal,
      expressFee: feeTotal,
    };
  }

  const next = {
    ...src,
    amount: baseAmount,
  };

  if (status === "cancelled") {
    next.expressFee = recordedFee > 0 ? recordedFee : feeTotal || null;
    next.expressFeeStatus = "cancelled";
  } else {
    next.expressFee = null;
    if (next.expressFeeStatus && next.expressFeeStatus !== "charged") {
      delete next.expressFeeStatus;
    }
  }

  return next;
}
