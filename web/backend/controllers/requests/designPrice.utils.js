// related files:
// - web/backend/controllers/requests/expressPrice.utils.js
// - web/backend/controllers/requests/creation.from-draft.controller.js
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/utils/creditSettingsDefaults.js
// - web/backend/rules.md
// - .cursor/rules/design-fee.mdc
import {
  resolveQuotedPriceWithExpressFee,
  toPlainRequestPrice,
} from "./expressPrice.utils.js";

/**
 * 디자인+가공 어벗 수 SSOT.
 * - productMode !== design_custom_abutment → 0
 * - toothWorks 유효 행 우선, 없으면 tooth 문자열 파싱, 최소 1
 */
export function countDesignAbutmentQty(caseInfos) {
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

/** @deprecated use countDesignAbutmentQty */
export const countDesignFeeTeeth = countDesignAbutmentQty;

/**
 * 견적/표시용 금액 SSOT (디자인+가공):
 * - design_custom_abutment이면 `(가공단가 + designFee) × 어벗수`
 * - price.designFee = 디자인 총액, price.abutmentQty = 적용 어벗 수
 * - 무상/0원 견적에는 붙이지 않는다
 * - 이중 합산 방지: designFee·abutmentQty·expressFee를 걷어 가공 단가 복원 후 재적용
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
  const feePerUnit = Math.max(0, Number(designFeePerTooth) || 0);
  const qty = Math.max(0, Math.floor(Number(toothCount) || 0));
  const recordedDesignFee = Math.max(0, Number(src.designFee) || 0);
  const recordedExpressFee = Math.max(0, Number(src.expressFee) || 0);
  const recordedQtyRaw = Math.floor(Number(src.abutmentQty) || 0);
  const recordedQty = recordedQtyRaw > 0 ? recordedQtyRaw : 1;

  const amountRaw = Number(src.amount);
  const amount =
    Number.isFinite(amountRaw) && amountRaw > 0
      ? amountRaw
      : Math.max(0, amountRaw || 0);

  // amount = unitFab * recordedQty + designFee + expressFee (재견적 시)
  const amountSansFees = Math.max(
    0,
    amount - recordedDesignFee - recordedExpressFee,
  );
  const unitFab = amountSansFees / recordedQty;

  if (!(unitFab > 0)) {
    const next = { ...src, amount: 0 };
    next.designFee = null;
    next.abutmentQty = null;
    return next;
  }

  const shouldApply = mode === "design_custom_abutment" && qty > 0;

  if (shouldApply) {
    const designTotal = feePerUnit * qty;
    const fabTotal = unitFab * qty;
    return {
      ...src,
      // express는 다음 단계에서 재적용하므로 여기선 제외한 채 둔다
      // (이미 포함된 expressFee가 있으면 express resolver가 이중제거하지 않도록 잔액에 유지)
      amount: fabTotal + designTotal + recordedExpressFee,
      designFee: designTotal > 0 ? designTotal : null,
      abutmentQty: qty,
    };
  }

  const next = {
    ...src,
    amount: unitFab + recordedExpressFee,
  };
  next.designFee = null;
  next.abutmentQty = null;
  return next;
}

/** 디자인+가공 배수 → 신속비 순으로 견적 합산 */
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
    toothCount: countDesignAbutmentQty(caseInfos),
    designFeePerTooth,
  });
  return resolveQuotedPriceWithExpressFee({
    price: withDesign,
    shippingMode,
    expressFee,
  });
}

/**
 * CAM machining_spend / 잔액 체크용: 신속비 제외한 가공+디자인 총액.
 * 무상 견적이면 0.
 */
export function resolveMachiningSpendAmount({
  price,
  caseInfos,
  designFeePerTooth = 15000,
}) {
  const withDesign = resolveQuotedPriceWithDesignFee({
    price,
    productMode: caseInfos?.productMode,
    toothCount: countDesignAbutmentQty(caseInfos),
    designFeePerTooth,
  });
  const recordedExpress = Math.max(0, Number(withDesign?.expressFee) || 0);
  const amount = Math.max(0, Number(withDesign?.amount) || 0);
  return Math.max(0, amount - recordedExpress);
}

export { toPlainRequestPrice };
