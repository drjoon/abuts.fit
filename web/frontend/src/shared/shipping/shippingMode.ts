// change-log:
// - 2026-08-11: 출고 뱃지 색 — semantic Primary(묶음) / Attention(신속).
// - 2026-08-09: 표시 금액 — 기록된 expressFee 총액(어벗 배수)을 feeSetting으로 덮어쓰지 않음.
// - 2026-08-06: 표시 라벨 신속배송/묶음배송 → 신속출고/묶음출고 (제조사 출발일 의미).
// related files:
// - web/frontend/src/shared/ui/semanticStatus.ts
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
 * 표시용 금액 SSOT: 신속배송이면 expressFee를 합산한다.
 * 백엔드가 이미 amount에 합산해 내려준 경우(expressFee·designFee 기록 있음)는
 * 이중 합산하지 않는다. designFee는 amount에 포함된 채 유지한다.
 * expressFee는 총액일 수 있다(디자인+생산=단가×어벗수).
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
  const feeSetting = Math.max(0, Number(params.expressFee ?? 2000) || 2000);

  if (status === "cancelled") {
    return baseAmount > 0 || amountRaw === 0 ? baseAmount : amountRaw;
  }

  if (mode === "express") {
    // 백엔드가 기록한 총액(어벗 배수 포함)을 우선 사용
    if (recordedFee > 0) return amountRaw;
    if (feeSetting > 0 && baseAmount > 0) return baseAmount + feeSetting;
  }

  return baseAmount > 0 || amountRaw === 0 ? baseAmount : amountRaw;
}

export function getBulkExpressShippingLabel(mode: ShippingMode): string {
  return mode === "express" ? "신속출고" : "묶음출고";
}

export function getShippingModeBadgeClassName(mode: ShippingMode): string {
  // Semantic: express → Attention; normal(묶음) → Primary soft
  return mode === "express"
    ? "border-accent-muted text-accent-strong bg-accent-soft"
    : "border-primary-muted text-primary-strong bg-primary-soft";
}
