// related files:
// - web/frontend/src/shared/practice/cncImplantCatalog.ts
// - web/backend/scripts/db/data/connections.seed.js
export const MEGAGEN_ANYONE_REGULAR_DISPLAY_FAMILY = "Regular (Ø3.5 이상)";

const tokenKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

/** 첨1 표. 관리자 매칭 행과 의뢰 선택 표가 이 브랜드·패밀리를 같이 쓴다. */
export const CNC_IMPLANT_CATALOG = [
  { manufacturer: "OSSTEM", brand: "TS3", family: "Regular", displayManufacturer: "Osstem", displayBrand: "TS3", displayFamily: "Regular" },
  { manufacturer: "OSSTEM", brand: "TS3", family: "Mini", displayManufacturer: "Osstem", displayBrand: "TS3", displayFamily: "Mini" },
  { manufacturer: "DENTIUM", brand: "Superline2", family: "Regular", displayManufacturer: "Dentium", displayBrand: "SuperLine", displayFamily: "Regular" },
  { manufacturer: "DENTIUM", brand: "Implantium", family: "Regular", displayManufacturer: "Dentium", displayBrand: "Implantium", displayFamily: "Regular" },
  { manufacturer: "NEOBIOTECH", brand: "IS2", family: "Regular", displayManufacturer: "NeoBiotech", displayBrand: "IS2", displayFamily: "Regular" },
  { manufacturer: "NEOBIOTECH", brand: "IS3", family: "Regular", displayManufacturer: "NeoBiotech", displayBrand: "IS3", displayFamily: "Regular" },
  { manufacturer: "NEOBIOTECH", brand: "ALX", family: "Regular", displayManufacturer: "NeoBiotech", displayBrand: "ALX", displayFamily: "Regular" },
  { manufacturer: "NEOBIOTECH", brand: "IS2", family: "Small Narrow", displayManufacturer: "NeoBiotech", displayBrand: "IS2", displayFamily: "Small Narrow" },
  { manufacturer: "NEOBIOTECH", brand: "IS3", family: "Small Narrow", displayManufacturer: "NeoBiotech", displayBrand: "IS3", displayFamily: "Small Narrow" },
  { manufacturer: "NEOBIOTECH", brand: "ALX", family: "Small Narrow", displayManufacturer: "NeoBiotech", displayBrand: "ALX", displayFamily: "Small Narrow" },
  { manufacturer: "DIO", brand: "UF", family: "Regular", displayManufacturer: "Dio", displayBrand: "UF", displayFamily: "Regular" },
  { manufacturer: "DIO", brand: "UF", family: "Narrow", displayManufacturer: "Dio", displayBrand: "UF", displayFamily: "Narrow" },
  { manufacturer: "MEGAGEN", brand: "AnyOne Internal", family: "Regular", displayManufacturer: "Megagen", displayBrand: "AnyOne", displayFamily: "Regular (Ø3.5 이상)" },
  { manufacturer: "MEGAGEN", brand: "MiNi Internal", family: "Mini", displayManufacturer: "Megagen", displayBrand: "Mini internal", displayFamily: "Mini" },
  { manufacturer: "DENTIS", brand: "SQ", family: "Regular", displayManufacturer: "Dentis", displayBrand: "SQ", displayFamily: "Regular" },
  { manufacturer: "DENTIS", brand: "SQ", family: "Mini", displayManufacturer: "Dentis", displayBrand: "SQ", displayFamily: "Mini" },
  { manufacturer: "DENTIS", brand: "SQ", family: "Narrow", displayManufacturer: "Dentis", displayBrand: "SQ", displayFamily: "Narrow" },
  { manufacturer: "DENTIS", brand: "One-Q", family: "Regular", displayManufacturer: "Dentis", displayBrand: "One-Q", displayFamily: "Regular" },
  { manufacturer: "DENTIS", brand: "One-Q", family: "Mini", displayManufacturer: "Dentis", displayBrand: "One-Q", displayFamily: "Mini" },
  { manufacturer: "DENTIS", brand: "One-Q", family: "Narrow", displayManufacturer: "Dentis", displayBrand: "One-Q", displayFamily: "Narrow" },
];

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
