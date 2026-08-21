// related files:
// - web/backend/models/roundBarAbutmentRequest.model.js
// - web/backend/controllers/practiceTransfers/roundBarAbutmentRequest.controller.js
// - web/backend/controllers/admin/admin.roundBarAbutment.controller.js
// - web/frontend/src/shared/practice/roundBarAbutment.ts
// - 2026-08-14: 관리자 수정 시 type 허용. 치과 신규 요청은 헥스(사이즈 미정) 고정.
export const ROUND_BAR_HEX_TYPE = "헥스(사이즈 미정)";
export const ROUND_BAR_INQUIRY_TYPE = "manufacturer_add_request";
/** 「임플란트 추가 요청」옵션 SSOT — pending 판별은 헥스 타입이 아니라 이 옵션·플래그 */
export const IMPLANT_ADD_REQUEST_OPTION = "임플란트 추가 요청";
export const MANUFACTURER_ADD_REQUEST_BRAND = "추가요청";
export const MANUFACTURER_ADD_REQUEST_FAMILY = "미정";
export const ABUTMENT_ADOPTED_KIND = {
  CNC: "cnc",
  ROUND_BAR: "round_bar",
};

export const isImplantAddRequest = (row) => {
  if (!row || typeof row !== "object") return false;
  if (Boolean(row.implantAddRequest)) return true;
  const brand = String(row.brand || row.implantBrand || "").trim();
  if (brand === MANUFACTURER_ADD_REQUEST_BRAND) return true;
  const type = String(row.type || row.implantType || "").trim();
  return type === IMPLANT_ADD_REQUEST_OPTION;
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

export const normalizeRoundBarSpec = (raw, options = {}) => {
  const row = raw && typeof raw === "object" ? raw : {};
  const allowType = Boolean(options.allowType);
  const implantAddRequest = Boolean(
    options.implantAddRequest || isImplantAddRequest(row),
  );
  const defaultType = implantAddRequest
    ? IMPLANT_ADD_REQUEST_OPTION
    : ROUND_BAR_HEX_TYPE;
  return {
    manufacturer: String(row.manufacturer || "").trim(),
    brand: String(row.brand || "").trim(),
    family: String(row.family || "").trim(),
    type: allowType
      ? String(row.type || "").trim() || defaultType
      : defaultType,
    implantAddRequest,
  };
};
