import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { IMPLANT_MANUFACTURER_CATALOG } from "./implantManufacturerCatalog.js";

export function normalizeKeyToken(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  try {
    return s.normalize("NFC");
  } catch {
    return s;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRC_CONNECTION_DIR = path.resolve(
  __dirname,
  "../../..",
  "bg/pc1/esprit-addin/AcroDent/2_Connection",
);

const IMPLANT_BRAND_CANONICAL_ALIASES = {
  // 버전 표기 브랜드를 SSOT로 유지한다.
  // 레거시 입력(TS, SuperLine, UF, IS)은 버전 표기 브랜드로 정규화한다.
  OSSTEM: {
    TS: "TS3",
  },
  DENTIUM: {
    SuperLine: "SuperLine2",
  },
  DIO: {
    UF: "UF2",
  },
  NEOBIOTECH: {
    IS: "IS2",
  },
};

export const IMPLANT_MANUFACTURER_DEFS = IMPLANT_MANUFACTURER_CATALOG;

function normalizeBrandToken(raw) {
  return normalizeKeyToken(raw)
    .toUpperCase()
    .replace(/[_\-]+/g, "")
    .replace(/\s+/g, "");
}

function readConnectionCatalog() {
  const manufacturerByPrcKor = new Map();
  const prcKorByManufacturer = new Map();
  const brandsByManufacturer = new Map();

  try {
    const entries = fs.readdirSync(PRC_CONNECTION_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fileName = String(entry.name || "").trim();
      const match = /^(.+?)_([^_]+?)_[A-Z]{2,3}_Connection\.prc$/i.exec(
        fileName,
      );
      if (!match) continue;

      const manufacturerKor = normalizeKeyToken(match[1]);
      const brand = normalizeKeyToken(match[2]);
      if (!manufacturerKor || !brand) continue;

      const manufacturer = Object.entries(IMPLANT_MANUFACTURER_DEFS).find(
        ([, def]) =>
          (def.aliases || []).some(
            (alias) =>
              normalizeKeyToken(alias).toUpperCase() ===
              manufacturerKor.toUpperCase(),
          ),
      )?.[0];
      if (!manufacturer) continue;

      manufacturerByPrcKor.set(manufacturerKor, manufacturer);
      prcKorByManufacturer.set(manufacturer, manufacturerKor);

      const brands = brandsByManufacturer.get(manufacturer) || [];
      if (!brands.includes(brand)) {
        brands.push(brand);
        brandsByManufacturer.set(manufacturer, brands);
      }
    }
  } catch {}

  return {
    manufacturerByPrcKor,
    prcKorByManufacturer,
    brandsByManufacturer,
  };
}

const CONNECTION_CATALOG = readConnectionCatalog();

export function normalizeImplantManufacturer(raw) {
  const s = normalizeKeyToken(raw).toUpperCase();
  for (const [canonical, def] of Object.entries(IMPLANT_MANUFACTURER_DEFS)) {
    if ((def.aliases || []).some((alias) => alias.toUpperCase() === s)) {
      return canonical;
    }
  }
  return normalizeKeyToken(raw);
}

export function getPrcManufacturerKor(manufacturer) {
  const canonical = normalizeImplantManufacturer(manufacturer);
  return CONNECTION_CATALOG.prcKorByManufacturer.get(canonical) || "";
}

export function getManufacturerByPrcKor(prcKor) {
  const target = normalizeKeyToken(prcKor);
  return CONNECTION_CATALOG.manufacturerByPrcKor.get(target) || "";
}

export function normalizeImplantBrand(raw, manufacturer) {
  const brand = normalizeKeyToken(raw);
  const m = normalizeImplantManufacturer(manufacturer);
  if (!brand) return "";

  const aliasMap = IMPLANT_BRAND_CANONICAL_ALIASES[m] || null;
  if (aliasMap) {
    const aliasKey = normalizeBrandToken(brand);
    const aliasResolved = Object.entries(aliasMap).find(
      ([alias]) => normalizeBrandToken(alias) === aliasKey,
    )?.[1];
    if (aliasResolved) {
      return aliasResolved;
    }
  }

  const brands = CONNECTION_CATALOG.brandsByManufacturer.get(m) || [];
  if (!brands.length) return brand;

  const normalizedRaw = normalizeBrandToken(brand);
  const exact = brands.find((candidate) => candidate === brand);
  if (exact) return exact;

  const tokenMatched = brands.find(
    (candidate) => normalizeBrandToken(candidate) === normalizedRaw,
  );
  if (tokenMatched) return tokenMatched;

  if (
    (normalizedRaw === "REGULAR" || normalizedRaw === "MINI") &&
    brands.length === 1
  ) {
    return brands[0];
  }

  return brand;
}

export function normalizeImplantType(raw) {
  const s = normalizeKeyToken(raw);
  if (!s) return "";
  const upper = s.toUpperCase().replaceAll("_", "-").replaceAll(" ", "");
  if (upper === "HEX") return "Hex";
  if (upper === "NONHEX" || upper === "NON-HEX") return "Non-Hex";
  return s;
}

export function normalizeImplantFamily(raw) {
  const s = normalizeKeyToken(raw);
  if (!s) return "";
  const upper = s.toUpperCase().replaceAll("_", "-").replaceAll(" ", "");

  if (upper === "REGULAR") return "Regular";

  // 제조사별 표기 차이를 canonical family로 통일
  // - Mini 계열: MINI, SMALL
  // - Narrow 계열: NARROW
  // - Small Narrow 계열: SMALLNARROW, SMALL-NARROW, SN
  if (upper === "MINI" || upper === "SMALL") return "Mini";
  if (upper === "NARROW") return "Narrow";
  if (upper === "SMALLNARROW" || upper === "SMALL-NARROW" || upper === "SN") {
    return "Small Narrow";
  }

  return s;
}

export function normalizeImplantFields(caseInfos) {
  const ci = caseInfos && typeof caseInfos === "object" ? { ...caseInfos } : {};
  const implantManufacturer = normalizeImplantManufacturer(
    ci.implantManufacturer,
  );
  const implantBrand = normalizeImplantBrand(
    ci.implantBrand,
    implantManufacturer,
  );
  const implantFamily = normalizeImplantFamily(ci.implantFamily);
  const implantType = normalizeImplantType(ci.implantType);
  return {
    ...ci,
    implantManufacturer,
    implantBrand,
    implantFamily,
    implantType,
  };
}

export function getCanonicalManufacturerBrandKey(manufacturer, brand) {
  const m = normalizeImplantManufacturer(manufacturer);
  const normalizedBrand = normalizeImplantBrand(brand, m);
  if (!m || !normalizedBrand) return "";
  return `${m}_${normalizedBrand}`;
}

export function getPrcManufacturerToken(manufacturer) {
  return normalizeImplantManufacturer(manufacturer);
}
