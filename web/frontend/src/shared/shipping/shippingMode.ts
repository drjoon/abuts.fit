// related files:
// - web/frontend/src/shared/shipping/ShippingModeBadge.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
// - web/frontend/src/pages/requestor/new_request/components/NewRequestAttachmentsPanel.tsx
// - web/backend/controllers/requests/shippingPriority.utils.js

export type ShippingMode = "normal" | "express";

export type ShippingModeSource = {
  shippingMode?: string | null;
  finalShipping?: { mode?: string | null } | null;
  originalShipping?: { mode?: string | null } | null;
} | null;

export function resolveShippingMode(
  source?: ShippingModeSource,
): ShippingMode {
  const mode =
    source?.finalShipping?.mode ||
    source?.originalShipping?.mode ||
    source?.shippingMode;
  return mode === "express" ? "express" : "normal";
}

/**
 * 표시용 금액 SSOT: 신속배송이면 expressFee(기본 1,000)를 합산한다.
 * 백엔드가 이미 amount에 합산해 내려준 경우(expressFee 기록 있음)는 이중 합산하지 않는다.
 */
export function resolveQuotedPriceAmount(params: {
  price?: {
    amount?: number | null;
    expressFee?: number | null;
    expressFeeStatus?: string | null;
  } | null;
  shippingMode?: ShippingModeSource | ShippingMode | null;
  expressFee?: number;
}): number | null {
  const price = params.price;
  if (!price || price.amount == null) return null;

  const amountRaw = Number(price.amount);
  if (!Number.isFinite(amountRaw)) return null;

  const recordedFee = Math.max(0, Number(price.expressFee) || 0);
  const baseAmount = Math.max(0, amountRaw - recordedFee);
  const status = String(price.expressFeeStatus || "").trim();
  const mode =
    typeof params.shippingMode === "string"
      ? params.shippingMode === "express"
        ? "express"
        : "normal"
      : resolveShippingMode(params.shippingMode);
  const feeSetting = Math.max(0, Number(params.expressFee ?? 1000) || 1000);

  if (mode === "express" && status !== "cancelled" && feeSetting > 0) {
    return baseAmount > 0 ? baseAmount + feeSetting : amountRaw;
  }
  return baseAmount > 0 || amountRaw === 0 ? baseAmount : amountRaw;
}

export function getBulkExpressShippingLabel(mode: ShippingMode): string {
  return mode === "express" ? "신속배송" : "묶음배송";
}

export function getShippingModeBadgeClassName(mode: ShippingMode): string {
  return mode === "express"
    ? "border-amber-400 text-amber-700 bg-amber-50"
    : "border-sky-300 text-sky-700 bg-sky-50";
}
