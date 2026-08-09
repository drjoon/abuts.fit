// related files:
// - web/backend/controllers/requests/expressPrice.utils.js
// - web/backend/controllers/requests/creation.from-draft.controller.js
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/utils/creditSettingsDefaults.js
// - web/backend/rules.md
import {
  resolveQuotedPriceWithExpressFee,
  toPlainRequestPrice,
} from "./expressPrice.utils.js";

/**
 * 디자인비 적용 치아 수 SSOT.
 * - productMode !== design_custom_abutment → 0
 * - toothWorks 유효 행 우선, 없으면 tooth 문자열 파싱, 최소 1
 */
export function countDesignFeeTeeth(caseInfos) {
  if (!caseInfos || typeof caseInfos !== "object") return 0;
  if (String(caseInfos.productMode || "").trim() !== "design_custom_abutment") {
    return 0;
  }

  const works = Array.isArray(caseInfos.toothWorks) ? caseInfos.toothWorks : [];
  const fromWorks = works.filter((row) => {
    const toothNumber = String(row?.toothNumber || "").trim();
    const prosthesisType = String(row?.prosthesisType || "").trim();
    return /^[1-4][1-8]$/.test(toothNumber) && Boolean(prosthesisType);
  }).length;
  if (fromWorks > 0) return fromWorks;

  const tooth = String(caseInfos.tooth || "").trim();
  if (tooth) {
    const parts = tooth
      .split(/[,/·\s]+/)
      .map((p) => p.trim())
      .filter((p) => /^[1-4][1-8]$/.test(p) || /^\d{1,2}$/.test(p));
    if (parts.length > 0) return parts.length;
  }

  return 1;
}

/**
 * 견적/표시용 금액 SSOT:
 * - design_custom_abutment이면 1치아당 designFee × 치아 수를 amount에 합산하고 designFee에 총액 기록
 * - 무상/0원 견적에는 붙이지 않는다
 * - 이중 합산 방지: 기존 price.designFee 만큼을 base에서 제거한 뒤 다시 적용
 *
 * 적용 순서: 본 함수 → resolveQuotedPriceWithExpressFee
 */
export function resolveQuotedPriceWithDesignFee({
  price,
  productMode,
  toothCount = 0,
  designFeePerTooth = 15000,
}) {
  const src = toPlainRequestPrice(price);
  const mode = String(productMode || "").trim();
  const feePerTooth = Math.max(0, Number(designFeePerTooth) || 0);
  const teeth = Math.max(0, Math.floor(Number(toothCount) || 0));
  const recordedFee = Math.max(0, Number(src.designFee) || 0);
  const amountRaw = Number(src.amount);
  const amount =
    Number.isFinite(amountRaw) && amountRaw > 0
      ? amountRaw
      : Math.max(0, amountRaw || 0);
  const baseAmount = Math.max(0, amount - recordedFee);

  if (!(baseAmount > 0)) {
    const next = { ...src, amount: baseAmount };
    next.designFee = null;
    return next;
  }

  const shouldApply =
    mode === "design_custom_abutment" && teeth > 0 && feePerTooth > 0;
  const designTotal = shouldApply ? feePerTooth * teeth : 0;

  if (designTotal > 0) {
    return {
      ...src,
      amount: baseAmount + designTotal,
      designFee: designTotal,
    };
  }

  const next = {
    ...src,
    amount: baseAmount,
  };
  next.designFee = null;
  return next;
}

/** 디자인비 → 신속비 순으로 견적 합산 */
export function resolveQuotedPriceWithExtras({
  price,
  caseInfos,
  shippingMode,
  expressFee = 1000,
  designFeePerTooth = 15000,
}) {
  const withDesign = resolveQuotedPriceWithDesignFee({
    price,
    productMode: caseInfos?.productMode,
    toothCount: countDesignFeeTeeth(caseInfos),
    designFeePerTooth,
  });
  return resolveQuotedPriceWithExpressFee({
    price: withDesign,
    shippingMode,
    expressFee,
  });
}

export { toPlainRequestPrice };
