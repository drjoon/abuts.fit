import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  getCanonicalManufacturerBrandKey,
  getPrcManufacturerKor,
  getManufacturerByPrcKor,
  normalizeImplantManufacturer,
  normalizeImplantBrand,
  normalizeImplantType,
} from "./implantCanonical.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PRC_FACE_HOLE_DIR = path.resolve(
  __dirname,
  "../../..",
  "bg/esprit-addin/AcroDent/1_Face Hole",
);

export const PRC_CONNECTION_DIR = path.resolve(
  __dirname,
  "../../..",
  "bg/esprit-addin/AcroDent/2_Connection",
);

function normalizeCodeChar(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase();
}

export function parsePrcTypeCode(typeCode) {
  const code = normalizeCodeChar(typeCode);
  if (!/^[RM][HN]$/.test(code)) return null;
  const familyChar = code[0];
  const implantTypeChar = code[1];
  return {
    family: familyChar === "M" ? "Mini" : "Regular",
    implantType: implantTypeChar === "N" ? "Non-Hex" : "Hex",
    familyChar,
    implantTypeChar,
    code,
  };
}

export function getPrcTypeCode(brand, type) {
  const normalizedBrand = normalizeImplantBrand(brand, "");
  const normalizedType = normalizeImplantType(type);
  const familyChar = /mini/i.test(String(normalizedBrand || "")) ? "M" : "R";
  const implantTypeChar = normalizedType === "Non-Hex" ? "N" : "H";
  return `${familyChar}${implantTypeChar}`;
}

export function getPrcTypeCodeByFamily(family, type) {
  const normalizedFamily = String(family || "")
    .trim()
    .toLowerCase();
  const normalizedType = normalizeImplantType(type);
  const familyChar = normalizedFamily === "mini" ? "M" : "R";
  const implantTypeChar = normalizedType === "Non-Hex" ? "N" : "H";
  return `${familyChar}${implantTypeChar}`;
}

function parsePrcBaseFileName(fileName, suffix) {
  const baseName = path.basename(String(fileName || ""));
  const escapedSuffix = suffix.replace(".", "\\.");
  const match = new RegExp(
    `^(.+?)_([^_]+?)_([A-Z]{2})_${escapedSuffix}$`,
    "i",
  ).exec(baseName);
  if (!match) return null;

  const manufacturerKor = String(match[1] || "").trim();
  const rawBrand = String(match[2] || "").trim();
  const typeCode = String(match[3] || "")
    .trim()
    .toUpperCase();
  const parsedType = parsePrcTypeCode(typeCode);
  const manufacturer = getManufacturerByPrcKor(manufacturerKor);
  const brand = normalizeImplantBrand(rawBrand, manufacturer);
  const implantType = parsedType?.implantType || "";
  const family = parsedType?.family || "";
  const canonicalKey = getCanonicalManufacturerBrandKey(manufacturer, brand);

  if (!manufacturer || !brand || !family || !implantType || !canonicalKey)
    return null;

  return {
    canonicalKey,
    manufacturer: normalizeImplantManufacturer(manufacturer),
    manufacturerKor,
    brand,
    family,
    type: implantType,
    typeCode,
    fileName: baseName,
  };
}

export function parseConnectionPrcFileName(fileName) {
  return parsePrcBaseFileName(fileName, "Connection.prc");
}

export function parseFaceHolePrcFileName(fileName) {
  return parsePrcBaseFileName(fileName, "FaceHole.prc");
}

function safeReadDirNames(dirPath) {
  try {
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, "ko"));
  } catch {
    return [];
  }
}

export function loadPrcCatalog() {
  const connectionNames = safeReadDirNames(PRC_CONNECTION_DIR).filter((name) =>
    /_Connection\.prc$/i.test(name),
  );
  const faceHoleNames = safeReadDirNames(PRC_FACE_HOLE_DIR).filter((name) =>
    /_FaceHole\.prc$/i.test(name),
  );

  const connectionMap = new Map();
  const faceHoleMap = new Map();

  for (const fileName of connectionNames) {
    const parsed = parseConnectionPrcFileName(fileName);
    if (!parsed) continue;
    connectionMap.set(
      `${parsed.canonicalKey}|${parsed.family}|${parsed.type}`,
      parsed.fileName,
    );
  }

  for (const fileName of faceHoleNames) {
    const parsed = parseFaceHolePrcFileName(fileName);
    if (!parsed) continue;
    faceHoleMap.set(`${parsed.canonicalKey}|${parsed.type}`, parsed.fileName);
  }

  return {
    connectionNames,
    faceHoleNames,
    connectionMap,
    faceHoleMap,
  };
}

export function buildPrcFileNamesFromCatalog(
  manufacturer,
  brand,
  type,
  family,
) {
  const canonicalKey = getCanonicalManufacturerBrandKey(manufacturer, brand);
  const normalizedType = normalizeImplantType(type);
  const normalizedFamily = String(family || "").trim();
  const catalog = loadPrcCatalog();
  const key = `${canonicalKey}|${normalizedFamily}|${normalizedType}`;
  return {
    faceHolePrcFileName: catalog.faceHoleMap.get(key) || "",
    connectionPrcFileName: catalog.connectionMap.get(key) || "",
  };
}

export function buildExpectedPrcFileName(
  kind,
  manufacturer,
  brand,
  type,
  family,
) {
  const manufacturerKor = getPrcManufacturerKor(manufacturer);
  const normalizedBrand = normalizeImplantBrand(brand, manufacturer);
  const normalizedFamily = String(family || "").trim();
  const prcTypeCode = getPrcTypeCodeByFamily(normalizedFamily, type);
  if (!manufacturerKor || !normalizedBrand || !normalizedFamily || !prcTypeCode)
    return "";
  const suffix = kind === "faceHole" ? "FaceHole" : "Connection";
  return `${manufacturerKor}_${normalizedBrand}_${prcTypeCode}_${suffix}.prc`;
}
