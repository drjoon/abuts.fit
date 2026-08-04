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

export function getBulkExpressShippingLabel(mode: ShippingMode): string {
  return mode === "express" ? "신속배송" : "묶음배송";
}

export function getShippingModeBadgeClassName(mode: ShippingMode): string {
  return mode === "express"
    ? "border-amber-400 text-amber-700 bg-amber-50"
    : "border-sky-300 text-sky-700 bg-sky-50";
}
