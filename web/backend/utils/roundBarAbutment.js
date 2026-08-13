// related files:
// - web/backend/models/roundBarAbutmentRequest.model.js
// - web/backend/controllers/practiceTransfers/roundBarAbutmentRequest.controller.js
// - web/backend/controllers/admin/admin.roundBarAbutment.controller.js
// - web/frontend/src/shared/practice/roundBarAbutment.ts
export const ROUND_BAR_HEX_TYPE = "헥스(사이즈 미정)";
export const ROUND_BAR_INQUIRY_TYPE = "manufacturer_add_request";

export const buildRoundBarSpecKey = ({ manufacturer, brand, family, type }) =>
  [manufacturer, brand, family, type || ROUND_BAR_HEX_TYPE]
    .map((v) => String(v || "").trim().toLowerCase())
    .join("|");

export const normalizeRoundBarSpec = (raw) => {
  const row = raw && typeof raw === "object" ? raw : {};
  return {
    manufacturer: String(row.manufacturer || "").trim(),
    brand: String(row.brand || "").trim(),
    family: String(row.family || "").trim(),
    type: ROUND_BAR_HEX_TYPE,
  };
};
