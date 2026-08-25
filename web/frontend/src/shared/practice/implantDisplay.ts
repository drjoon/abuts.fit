// related files:
// - web/frontend/src/shared/practice/cncImplantCatalog.ts
// - web/frontend/src/shared/practice/roundBarAbutment.ts
// - web/frontend/src/shared/components/practice/PracticeToothImplantFields.tsx
/**
 * 임플란트 UI 표시 라벨 SSOT (저장·PRC 매칭 값과 분리).
 * - CNC 프리셋: 카탈로그 display* 우선 (Osstem, NeoBiotech 등).
 * - 환봉(관리자 도입): 관리자 입력값 그대로 (표기 수정 없음).
 */
import {
  ROUND_BAR_OR_JOIN,
  splitOrValues,
  isManufacturerAddRequestFavorite,
  isRoundBarFavorite,
  type ImplantFavoriteLabelParts,
} from "@/shared/practice/roundBarAbutment";

export type ImplantDisplayCatalogRow = {
  manufacturer: string;
  brand?: string;
  family?: string;
  type?: string;
  displayManufacturer?: string | null;
  displayBrand?: string | null;
  displayFamily?: string | null;
  displayType?: string | null;
};

const fieldKey = (value: string) => String(value || "").trim().toLowerCase();

export const sameImplantManufacturer = (a: string, b: string) => {
  const left = fieldKey(a);
  const right = fieldKey(b);
  return Boolean(left) && left === right;
};

const hasMixedCase = (text: string) => {
  const letters = String(text || "").replace(/[^a-zA-Z]/g, "");
  if (!letters) return false;
  return /[a-z]/.test(letters) && /[A-Z]/.test(letters);
};

const isAllCapsToken = (text: string) => {
  const t = String(text || "").trim();
  if (!t) return false;
  const letters = t.replace(/[^a-zA-Z]/g, "");
  return letters.length > 0 && letters === letters.toUpperCase();
};

/** IS2, TS3, ALX, HEX 등 — 무작정 Title case 하지 않음 */
const isLikelyAcronym = (text: string) => {
  const t = String(text || "").trim();
  if (!t) return false;
  if (/[0-9]/.test(t)) return true;
  if (t.length <= 4 && t === t.toUpperCase() && /^[A-Z]+$/.test(t)) return true;
  return false;
};

const softenAllCapsDisplay = (text: string) => {
  const t = String(text || "").trim();
  if (!t || !isAllCapsToken(t)) return t;
  return t
    .split(/(\s+|[-/])/)
    .map((part) => {
      if (!part || /^[\s\-/]+$/.test(part)) return part;
      if (!isAllCapsToken(part) || isLikelyAcronym(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("");
};

/** 혼합 대소문자(NeoBiotech, SuperLine)는 유지. ALL_CAPS만 완화. */
export const implantDisplayFallback = (raw: string) => {
  const text = String(raw || "").trim();
  if (!text) return "";
  if (hasMixedCase(text)) return text;
  if (isLikelyAcronym(text)) return text;
  if (isAllCapsToken(text)) return softenAllCapsDisplay(text);
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const findCatalogRow = (
  catalog: ImplantDisplayCatalogRow[],
  predicate: (row: ImplantDisplayCatalogRow) => boolean,
) => catalog.find(predicate);

export const resolveImplantManufacturerDisplay = (
  manufacturer: string,
  catalog: ImplantDisplayCatalogRow[],
) => {
  const token = String(manufacturer || "").trim();
  if (!token) return "";
  const sample = findCatalogRow(catalog, (c) =>
    sameImplantManufacturer(c.manufacturer, token),
  );
  return (
    String(sample?.displayManufacturer || "").trim() ||
    implantDisplayFallback(token)
  );
};

export const resolveImplantBrandDisplay = (
  manufacturer: string,
  brand: string,
  catalog: ImplantDisplayCatalogRow[],
) => {
  const token = String(brand || "").trim();
  if (!token) return "";
  const sample = findCatalogRow(
    catalog,
    (c) =>
      sameImplantManufacturer(c.manufacturer, manufacturer) &&
      fieldKey(String(c.brand || "")) === fieldKey(token),
  );
  return String(sample?.displayBrand || "").trim() || implantDisplayFallback(token);
};

export const resolveImplantFamilyDisplay = (
  manufacturer: string,
  brand: string,
  family: string,
  catalog: ImplantDisplayCatalogRow[],
) => {
  const token = String(family || "").trim();
  if (!token) return "";
  const brandKey = fieldKey(splitOrValues(brand)[0] || brand);
  const sample = findCatalogRow(
    catalog,
    (c) =>
      sameImplantManufacturer(c.manufacturer, manufacturer) &&
      (!brandKey || fieldKey(String(c.brand || "")) === brandKey) &&
      fieldKey(String(c.family || "")) === fieldKey(token),
  );
  return String(sample?.displayFamily || "").trim() || implantDisplayFallback(token);
};

export const resolveImplantTypeDisplay = (
  manufacturer: string,
  brand: string,
  family: string,
  type: string,
  catalog: ImplantDisplayCatalogRow[],
) => {
  const token = String(type || "").trim();
  if (!token) return "";
  const brandKey = fieldKey(splitOrValues(brand)[0] || brand);
  const familyKey = fieldKey(splitOrValues(family)[0] || family);
  const sample = findCatalogRow(
    catalog,
    (c) =>
      sameImplantManufacturer(c.manufacturer, manufacturer) &&
      (!brandKey || fieldKey(String(c.brand || "")) === brandKey) &&
      (!familyKey || fieldKey(String(c.family || "")) === familyKey) &&
      fieldKey(String(c.type || "")) === fieldKey(token),
  );
  return String(sample?.displayType || "").trim() || implantDisplayFallback(token);
};

export const formatImplantOrDisplay = (
  value: string,
  formatPart: (part: string) => string,
) => {
  const parts = splitOrValues(value);
  if (!parts.length) return "";
  return parts.map(formatPart).join(ROUND_BAR_OR_JOIN);
};

const formatStoredOrField = (value: string) => {
  const parts = splitOrValues(value);
  if (!parts.length) return "";
  return parts.join(ROUND_BAR_OR_JOIN);
};

/** 프리셋 카드 표시용. 저장값(manufacturer/brand/…)은 그대로 두고 라벨만 변환. */
export const implantFavoriteDisplayParts = (
  row: {
    manufacturer?: string;
    brand?: string;
    family?: string;
    type?: string;
    roundBar?: boolean;
    roundBarRequestId?: string;
    adopted?: boolean;
    isPublic?: boolean;
  },
  catalog: ImplantDisplayCatalogRow[] = [],
): ImplantFavoriteLabelParts => {
  const manufacturer = String(row?.manufacturer || "").trim();
  if (isManufacturerAddRequestFavorite(row)) {
    return {
      line1: manufacturer || "임플란트 추가 요청",
      line2: "",
      memoOnly: true,
    };
  }
  const brand = String(row?.brand || "").trim();
  const family = String(row?.family || "").trim();
  const type = String(row?.type || "").trim();

  if (isRoundBarFavorite(row)) {
    const mfgDisplay = manufacturer;
    const brandDisplay = formatStoredOrField(brand);
    const familyDisplay = formatStoredOrField(family);
    const typeDisplay = formatStoredOrField(type);
    return {
      line1: [mfgDisplay, brandDisplay].filter(Boolean).join(" / ") || "임플란트",
      line2: [familyDisplay, typeDisplay].filter(Boolean).join(" / "),
      memoOnly: false,
    };
  }

  const mfgDisplay = resolveImplantManufacturerDisplay(manufacturer, catalog);
  const brandDisplay = formatImplantOrDisplay(brand, (part) =>
    resolveImplantBrandDisplay(manufacturer, part, catalog),
  );
  const familyDisplay = formatImplantOrDisplay(family, (part) =>
    resolveImplantFamilyDisplay(manufacturer, brand, part, catalog),
  );
  const typeDisplay = formatImplantOrDisplay(type, (part) =>
    resolveImplantTypeDisplay(manufacturer, brand, family, part, catalog),
  );

  return {
    line1: [mfgDisplay, brandDisplay].filter(Boolean).join(" / ") || "임플란트",
    line2: [familyDisplay, typeDisplay].filter(Boolean).join(" / "),
    memoOnly: false,
  };
};
