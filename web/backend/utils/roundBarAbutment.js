// related files:
// - web/backend/models/roundBarAbutmentRequest.model.js
// - web/backend/controllers/practiceTransfers/roundBarAbutmentRequest.controller.js
// - web/backend/controllers/admin/admin.roundBarAbutment.controller.js
// - web/frontend/src/shared/practice/roundBarAbutment.ts
export const ROUND_BAR_HEX_TYPE = "헥스(사이즈 미정)";
export const ROUND_BAR_INQUIRY_TYPE = "manufacturer_add_request";
export const ABUTMENT_ADOPTED_KIND = {
  CNC: "cnc",
  ROUND_BAR: "round_bar",
};

export const normalizeAdoptedKind = (value) => {
  const raw = String(value || "").trim().toLowerCase().replace(/-/g, "_");
  if (raw === ABUTMENT_ADOPTED_KIND.CNC || raw === "cnc어벗" || raw === "cnc") {
    return ABUTMENT_ADOPTED_KIND.CNC;
  }
  if (
    raw === ABUTMENT_ADOPTED_KIND.ROUND_BAR ||
    raw === "roundbar" ||
    raw === "환봉" ||
    raw === "환봉어벗"
  ) {
    return ABUTMENT_ADOPTED_KIND.ROUND_BAR;
  }
  return "";
};

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
