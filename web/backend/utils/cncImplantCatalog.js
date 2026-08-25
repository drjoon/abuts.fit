// related files:
// - web/frontend/src/shared/practice/cncImplantCatalog.ts
// - web/backend/scripts/db/data/connections.seed.js
export const MEGAGEN_ANYONE_REGULAR_DISPLAY_FAMILY = "Regular (Ø3.5 이상)";

const tokenKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

export const isMegagenAnyOneMiniSpec = (manufacturer, brand, family) => {
  const mfr = tokenKey(manufacturer);
  const brandKey = tokenKey(brand);
  const familyKey = tokenKey(family);
  if (!mfr.includes("megagen") && mfr !== "메가젠") return false;
  if (brandKey.includes("miniinternal")) return false;
  if (!brandKey.includes("anyone")) return false;
  return familyKey === "mini";
};

export const sanitizeCncImplantConnection = (row) => {
  const manufacturer = String(row?.manufacturer || "").trim();
  const brand = String(row?.brand || "").trim();
  const family = String(row?.family || "").trim();
  if (!manufacturer || !brand) return null;
  if (isMegagenAnyOneMiniSpec(manufacturer, brand, family)) return null;
  if (
    tokenKey(manufacturer).includes("megagen") &&
    tokenKey(brand).includes("anyone") &&
    !tokenKey(brand).includes("miniinternal") &&
    tokenKey(family) === "regular"
  ) {
    return {
      ...row,
      family: "Regular",
      displayFamily: MEGAGEN_ANYONE_REGULAR_DISPLAY_FAMILY,
    };
  }
  return row;
};

export const sanitizeCncImplantConnections = (rows) =>
  (Array.isArray(rows) ? rows : [])
    .map((row) => sanitizeCncImplantConnection(row))
    .filter(Boolean);
