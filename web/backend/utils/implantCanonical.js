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
  "bg/esprit-addin/AcroDent/2_Connection",
);

export const IMPLANT_MANUFACTURER_DEFS = IMPLANT_MANUFACTURER_CATALOG;

function normalizeSystemToken(raw) {
  return normalizeKeyToken(raw)
    .toUpperCase()
    .replace(/[_\-]+/g, "")
    .replace(/\s+/g, "");
}

function readConnectionCatalog() {
  const manufacturerByPrcKor = new Map();
  const prcKorByManufacturer = new Map();
  const systemsByManufacturer = new Map();

  try {
    const entries = fs.readdirSync(PRC_CONNECTION_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fileName = String(entry.name || "").trim();
      const match = /^(.+?)_([^_]+?)_[A-Z]{2}_Connection\.prc$/i.exec(fileName);
      if (!match) continue;

      const manufacturerKor = normalizeKeyToken(match[1]);
      const system = normalizeKeyToken(match[2]);
      if (!manufacturerKor || !system) continue;

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

      const systems = systemsByManufacturer.get(manufacturer) || [];
      if (!systems.includes(system)) {
        systems.push(system);
        systemsByManufacturer.set(manufacturer, systems);
      }
    }
  } catch {}

  return {
    manufacturerByPrcKor,
    prcKorByManufacturer,
    systemsByManufacturer,
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

export function normalizeImplantSystem(raw, manufacturer) {
  const sys = normalizeKeyToken(raw);
  const m = normalizeImplantManufacturer(manufacturer);
  if (!sys) return "";

  const systems = CONNECTION_CATALOG.systemsByManufacturer.get(m) || [];
  if (!systems.length) return sys;

  const normalizedRaw = normalizeSystemToken(sys);
  const exact = systems.find((candidate) => candidate === sys);
  if (exact) return exact;

  const tokenMatched = systems.find(
    (candidate) => normalizeSystemToken(candidate) === normalizedRaw,
  );
  if (tokenMatched) return tokenMatched;

  if (
    (normalizedRaw === "REGULAR" || normalizedRaw === "MINI") &&
    systems.length === 1
  ) {
    return systems[0];
  }

  return sys;
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
  if (upper === "MINI") return "Mini";
  if (upper === "REGULAR") return "Regular";
  return s;
}

export function normalizeImplantFields(caseInfos) {
  const ci = caseInfos && typeof caseInfos === "object" ? { ...caseInfos } : {};
  const implantManufacturer = normalizeImplantManufacturer(
    ci.implantManufacturer,
  );
  const implantSystem = normalizeImplantSystem(
    ci.implantSystem,
    implantManufacturer,
  );
  const implantFamily = normalizeImplantFamily(ci.implantFamily) || "Regular";
  const implantType = normalizeImplantType(ci.implantType);
  return {
    ...ci,
    implantManufacturer,
    implantSystem,
    implantFamily,
    implantType,
  };
}

export function getCanonicalManufacturerSystemKey(manufacturer, system) {
  const m = normalizeImplantManufacturer(manufacturer);
  const sys = normalizeImplantSystem(system, m);
  if (!m || !sys) return "";
  return `${m}_${sys}`;
}

export function getPrcManufacturerToken(manufacturer) {
  return normalizeImplantManufacturer(manufacturer);
}
