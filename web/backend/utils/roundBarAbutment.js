// related files:
// - web/backend/models/roundBarAbutmentRequest.model.js
// - web/backend/controllers/practiceTransfers/roundBarAbutmentRequest.controller.js
// - web/backend/controllers/admin/admin.roundBarAbutment.controller.js
// - web/frontend/src/shared/practice/roundBarAbutment.ts
// change-log:
// - 2026-08-26: brand/family/type OR(` | `) 다중값 파싱·조인·카탈로그 전개.
// - 2026-08-14: 관리자 수정 시 type 허용. 치과 신규 요청은 헥스(사이즈 미정) 고정.
export const ROUND_BAR_HEX_TYPE = "헥스(사이즈 미정)";
export const ROUND_BAR_INQUIRY_TYPE = "manufacturer_add_request";
/** 「임플란트 추가 요청」옵션 SSOT — pending 판별은 헥스 타입이 아니라 이 옵션·플래그 */
export const IMPLANT_ADD_REQUEST_OPTION = "임플란트 추가 요청";
export const MANUFACTURER_ADD_REQUEST_BRAND = "추가요청";
export const MANUFACTURER_ADD_REQUEST_FAMILY = "미정";
/** brand/family/type 다중 옵션 저장 구분자 (OR) */
export const ROUND_BAR_OR_JOIN = " | ";
export const ABUTMENT_ADOPTED_KIND = {
  CNC: "cnc",
  ROUND_BAR: "round_bar",
};

/** brand/family/type OR 문자열 → 고유 토큰 배열 */
export const splitOrValues = (value) => {
  if (Array.isArray(value)) {
    const seen = new Set();
    const out = [];
    for (const item of value) {
      for (const part of splitOrValues(item)) {
        const key = part.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(part);
      }
    }
    return out;
  }
  const text = String(value || "").trim();
  if (!text) return [];
  const seen = new Set();
  const out = [];
  for (const part of text.split(/\s*\|\s*/)) {
    const token = String(part || "").trim();
    if (!token) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out;
};

export const isImplantAddRequest = (row) => {
  if (!row || typeof row !== "object") return false;
  if (Boolean(row.implantAddRequest)) return true;
  const brand = String(row.brand || row.implantBrand || "").trim();
  if (brand === MANUFACTURER_ADD_REQUEST_BRAND) return true;
  // OR 조인 문자열이면 첫 토큰만 비교
  const brandFirst = splitOrValues(brand)[0] || "";
  if (brandFirst === MANUFACTURER_ADD_REQUEST_BRAND) return true;
  const type = String(row.type || row.implantType || "").trim();
  const typeFirst = splitOrValues(type)[0] || type;
  return typeFirst === IMPLANT_ADD_REQUEST_OPTION;
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

export const joinOrValues = (values, uppercase = false) => {
  const parts = splitOrValues(values).map((v) =>
    uppercase ? String(v).toUpperCase() : String(v),
  );
  return parts.join(ROUND_BAR_OR_JOIN);
};

export const firstOrValue = (value, fallback = "") => {
  const parts = splitOrValues(value);
  return parts[0] || String(fallback || "").trim();
};

/**
 * 어벗 추가 요청 상태 SSOT.
 * - requesting(요청중): 치과 요청, 관리자 미공개
 * - adopting(도입중): 공개됨·미도입 → 기공소 자체 처리, 제조사/견적 제외
 * - adopted(도입): 뱃지 없음, 제조사·견적 정상
 */
export const resolveAbutmentAdoptionStatus = (row) => {
  if (!row || typeof row !== "object") return "";
  const roundBar =
    Boolean(row.roundBar) ||
    Boolean(String(row.roundBarRequestId || "").trim()) ||
    Boolean(row.isPublic) ||
    isImplantAddRequest(row);
  if (!roundBar) return "";
  if (row.roundBarAdopted === true || row.adopted === true) return "adopted";
  if (Boolean(row.isPublic)) return "adopting";
  return "requesting";
};

export const isPendingAbutmentAdoption = (row) => {
  const status = resolveAbutmentAdoptionStatus(row);
  return status === "requesting" || status === "adopting";
};

/** OR 스펙을 카탈로그용 manufacturer×brand×family×type 조합으로 전개 */
export const expandRoundBarOrCombos = ({
  manufacturer,
  brand,
  family,
  type,
  defaultType = ROUND_BAR_HEX_TYPE,
} = {}) => {
  const mfr = String(manufacturer || "").trim();
  if (!mfr) return [];
  const brands = splitOrValues(brand);
  const families = splitOrValues(family);
  const types = splitOrValues(type);
  const brandList = brands.length ? brands : [""];
  const familyList = families.length ? families : [""];
  const typeList = types.length ? types : [defaultType];
  const out = [];
  const seen = new Set();
  for (const b of brandList) {
    for (const f of familyList) {
      for (const t of typeList) {
        const typeValue = String(t || "").trim() || defaultType;
        const key = `${mfr}|${b}|${f}|${typeValue}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          manufacturer: mfr,
          brand: b,
          family: f,
          type: typeValue,
        });
      }
    }
  }
  return out;
};

export const buildRoundBarSpecKey = ({ manufacturer, brand, family, type }) =>
  [manufacturer, brand, family, type || ROUND_BAR_HEX_TYPE]
    .map((v) => String(v || "").trim().toLowerCase())
    .join("|");

export const normalizeRoundBarSpec = (raw, options = {}) => {
  const row = raw && typeof raw === "object" ? raw : {};
  const allowType = Boolean(options.allowType);
  const uppercase = Boolean(options.uppercase);
  const allowOr = options.allowOr !== false;
  const implantAddRequest = Boolean(
    options.implantAddRequest || isImplantAddRequest(row),
  );
  const defaultType = implantAddRequest
    ? IMPLANT_ADD_REQUEST_OPTION
    : ROUND_BAR_HEX_TYPE;
  const normalizeText = (value) => {
    const text = String(value || "").trim();
    return uppercase ? text.toUpperCase() : text;
  };
  const normalizeField = (value, { single = false } = {}) => {
    if (single || !allowOr) return normalizeText(value);
    const joined = joinOrValues(value, uppercase);
    return joined;
  };
  const typeRaw = allowType
    ? normalizeField(row.type)
    : normalizeField(defaultType);
  return {
    manufacturer: normalizeField(row.manufacturer, { single: true }),
    brand: normalizeField(row.brand),
    family: normalizeField(row.family),
    type: typeRaw || defaultType,
    implantAddRequest,
  };
};
