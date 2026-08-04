// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
// - web/frontend/src/pages/requestor/new_request/components/NewRequestAttachmentsPanel.tsx
// - web/backend/controllers/requests/shippingPriority.utils.js

export type ShippingMode = "normal" | "express";

export function resolveShippingMode(
  source?: {
    shippingMode?: string | null;
    finalShipping?: { mode?: string | null } | null;
    originalShipping?: { mode?: string | null } | null;
  } | null,
): ShippingMode {
  const mode =
    source?.finalShipping?.mode ||
    source?.originalShipping?.mode ||
    source?.shippingMode;
  return mode === "express" ? "express" : "normal";
}

export function getBulkExpressShippingLabel(mode: ShippingMode): string {
  return mode === "express" ? "신속" : "묶음";
}
