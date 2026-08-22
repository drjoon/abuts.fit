// change-log:
// - 2026-08-22: resolveMachiningHoldAmountFromPrice — 견적 amount 기준 hold(디자인비 재가산 금지).
// - 2026-08-09: 디자인+생산 신속비도 커스텀어벗 수만큼 배수.
// - 2026-08-09: 과금 어벗= customAbutment(임플란트) 치아만. Pontic 등 제외.
// - 2026-08-09: Pontic은 커스텀어벗 디자인·생산 대상이 아니므로 과금 어벗 수에서 제외.
// - 2026-08-13: 작업X(상실치)도 보철이 아니므로 과금 어벗 수에서 제외.
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

/** Pontic: 커스텀어벗 디자인·생산 없음 → 과금 제외 */
export function isPonticProsthesisType(prosthesisType) {
  return /^pontic$/i.test(String(prosthesisType || "").trim());
}

/** 작업X(상실치): 보철 아님 → 기공비·디자인·생산 과금 제외 */
export function isMissingToothProsthesisType(prosthesisType) {
  const raw = String(prosthesisType || "").trim();
  const compact = raw.replace(/\s+/g, "");
  return (
    raw === "결손치" ||
    raw === "작업X" ||
    raw === "상실치" ||
    compact.toLowerCase() === "작업x" ||
    /^missing(?:tooth)?$/i.test(compact)
  );
}

function hasImplantSpec(row) {
  return Boolean(
    String(row?.implantManufacturer || "").trim() ||
      String(row?.implantBrand || "").trim() ||
      String(row?.implantFamily || "").trim() ||
      String(row?.implantType || "").trim(),
  );
}

/**
 * 디자인+생산에서 실제로 디자인·생산하는 커스텀어벗 치아.
 * - customAbutment === true, 또는 임플란트 스펙이 채워진 행
 * - Pontic·작업X 제외
 */
export function isBillableDesignAbutmentRow(row) {
  const toothNumber = String(row?.toothNumber || "").trim();
  const prosthesisType = String(row?.prosthesisType || "").trim();
  if (!/^[1-4][1-8]$/.test(toothNumber) || !prosthesisType) return false;
  if (isPonticProsthesisType(prosthesisType)) return false;
  if (isMissingToothProsthesisType(prosthesisType)) return false;
  if (row?.customAbutment === true) return true;
  return hasImplantSpec(row);
}

/** 과금 대상 커스텀어벗 치아번호 (정렬) */
export function listDesignAbutmentToothNumbers(caseInfos) {
  const works = Array.isArray(caseInfos?.toothWorks) ? caseInfos.toothWorks : [];
  const nums = works
    .filter((row) => isBillableDesignAbutmentRow(row))
    .map((row) => String(row?.toothNumber || "").trim())
    .filter(Boolean);
  return Array.from(new Set(nums)).sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(a).localeCompare(String(b), "ko");
  });
}

/**
 * 디자인+생산 어벗 수 SSOT.
 * - productMode !== design_custom_abutment → 0
 * - toothWorks 중 커스텀어벗(임플란트) 치아만. Pontic·작업X·단순 보철 제외
 * - 유효 toothWorks가 있는데 과금 행이 없으면 0
 * - toothWorks 유효 행이 없으면 tooth 문자열 파싱, 최소 1
 */
export function countDesignAbutmentQty(caseInfos) {
  if (!caseInfos || typeof caseInfos !== "object") return 0;
  if (String(caseInfos.productMode || "").trim() !== "design_custom_abutment") {
    return 0;
  }

  const works = Array.isArray(caseInfos.toothWorks) ? caseInfos.toothWorks : [];
  const validWorks = works.filter((row) => {
    const toothNumber = String(row?.toothNumber || "").trim();
    const prosthesisType = String(row?.prosthesisType || "").trim();
    return /^[1-4][1-8]$/.test(toothNumber) && Boolean(prosthesisType);
  });
  if (validWorks.length > 0) {
    return validWorks.filter((row) => isBillableDesignAbutmentRow(row)).length;
  }

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
 * 견적/표시용 금액 SSOT (디자인+생산):
 * - design_custom_abutment이면 `(생산단가 + designFee) × 어벗수`
 * - price.designFee = 디자인 총액, price.abutmentQty = 적용 어벗 수
 * - 무상/0원 견적에는 붙이지 않는다
 * - 이중 합산 방지: designFee·abutmentQty·expressFee를 걷어 생산 단가 복원 후 재적용
 *
 * 적용 순서: 본 함수 → resolveQuotedPriceWithExpressFee
 */
export function resolveQuotedPriceWithDesignFee({
  price,
  productMode,
  toothCount = 0,
  designFeePerTooth = 5000,
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

  if (mode === "design_custom_abutment") {
    // 과금 어벗 0(Pontic-only 등): 생산·디자인 미부과 (신속비만 다음 단계에서 처리)
    if (!(qty > 0)) {
      return {
        ...src,
        amount: recordedExpressFee,
        designFee: null,
        abutmentQty: 0,
      };
    }
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

/** 디자인+생산 배수 → 신속비(디자인+생산은 어벗 수 배수) 순으로 견적 합산 */
export function resolveQuotedPriceWithExtras({
  price,
  caseInfos,
  shippingMode,
  expressFee = 2000,
  designFeePerTooth = 5000,
}) {
  const mode = String(caseInfos?.productMode || "").trim();
  const qty = countDesignAbutmentQty(caseInfos);
  const withDesign = resolveQuotedPriceWithDesignFee({
    price,
    productMode: mode,
    toothCount: qty,
    designFeePerTooth,
  });
  const expressQty =
    mode === "design_custom_abutment" ? Math.max(0, qty) : 1;
  return resolveQuotedPriceWithExpressFee({
    price: withDesign,
    shippingMode,
    expressFee,
    expressQty,
  });
}

/**
 * CAM machining_spend / 잔액 체크용: 신속비 제외한 가공+디자인 총액.
 * 무상 견적이면 0.
 */
export function resolveMachiningSpendAmount({
  price,
  caseInfos,
  designFeePerTooth = 5000,
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

/**
 * 의뢰비 hold 금액 = 견적 amount − 신속비(별도 hold).
 * 디자인비를 productMode로 재가산하지 않는다.
 * (PTX CA: design_custom_abutment + designFee null 이어도 생산만 1.5만 유지)
 */
export function resolveMachiningHoldAmountFromPrice(price) {
  const amount = Math.max(0, Math.round(Number(price?.amount || 0)));
  if (!(amount > 0)) return 0;
  if (String(price?.expressFeeStatus || "") === "cancelled") {
    return amount;
  }
  const expressFee = Math.max(0, Math.round(Number(price?.expressFee || 0)));
  return Math.max(0, amount - expressFee);
}

export { toPlainRequestPrice };
