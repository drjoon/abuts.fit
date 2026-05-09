/**
 * 임플란트 정보(manufacturer/brand/family/type)를 기반으로
 * Esprit CAM 공정에 필요한 PRC 파일명을 자동 결정
 *
 * 참조: 구글 스프레드시트 "PRC를 CAM NC에 위임"
 * - 1_Face Hole file naming
 * - 2_Connection file naming
 */
import {
  normalizeImplantFields,
  normalizeImplantManufacturer,
  normalizeImplantBrand,
  normalizeImplantType,
} from "../../utils/implantCanonical.js";
import { buildPrcFileNamesFromCatalog } from "../../utils/prcFilenameCatalog.js";
import Connection from "../../models/connection.model.js";

/**
 * 임플란트 브랜드별 커넥션 직경 정적 맵 (DB 조회 실패 시 폴백)
 * connections.seed.js 의 값을 기준으로 유지 — DB 시드 갱신 시 함께 업데이트할 것.
 * key 형식: "MANUFACTURER/brand/family/type"
 */
export const STATIC_CONNECTION_DIAMETER_MAP = {
  "NEOBIOTECH/IS/Regular/Hex": 3.35,
  "NEOBIOTECH/IS/Regular/Non-Hex": 3.35,
  "DENTIS/Mini/Mini/Hex": 2.8,
  "DENTIS/Mini/Mini/Non-Hex": 2.8,
  "DENTIS/SQ/Regular/Hex": 3.35,
  "DENTIS/SQ/Regular/Non-Hex": 3.35,
  "DENTIUM/SuperLine/Regular/Hex": 3.33,
  "DENTIUM/SuperLine/Regular/Non-Hex": 3.33,
  "DIO/Mini/Mini/Hex": 2.3,
  "DIO/Mini/Mini/Non-Hex": 2.3,
  "DIO/UF/Regular/Hex": 3.35,
  "DIO/UF/Regular/Non-Hex": 3.35,
  "MEGAGEN/AnyOne/Regular/Hex": 3.3,
  "MEGAGEN/AnyOne/Regular/Non-Hex": 3.3,
  "OSSTEM/Mini/Mini/Hex": 2.6,
  "OSSTEM/Mini/Mini/Non-Hex": 2.6,
  "OSSTEM/TS/Regular/Hex": 3.35,
  "OSSTEM/TS/Regular/Non-Hex": 3.35,
};

/**
 * 임플란트 정보로 PRC 파일명 조회 (DB 우선)
 * @param {string} manufacturer - 제조사 (e.g. "OSSTEM", "DENTIS")
 * @param {string} brand - 브랜드 (e.g. "TS", "SuperLine")
 * @param {string} family - 패밀리 (e.g. "Regular", "Mini")
 * @param {string} type - 타입 (e.g. "Hex", "Non-Hex")
 * @returns {Promise<{ faceHolePrcFileName: string, connectionPrcFileName: string }>}
 */
export async function getPrcFileNamesByImplant(
  manufacturer,
  brand,
  family,
  type,
) {
  return await buildPrcFileNamesFromCatalog(manufacturer, brand, type, family);
}

/**
 * caseInfos 객체로부터 PRC 파일명 자동 결정 (DB 우선)
 * @param {object} caseInfos - Request.caseInfos
 * @returns {Promise<{ faceHolePrcFileName: string, connectionPrcFileName: string }>}
 */
export async function resolvePrcFileNames(caseInfos) {
  if (!caseInfos) {
    return { faceHolePrcFileName: "", connectionPrcFileName: "" };
  }

  const normalized = normalizeImplantFields(caseInfos);
  const manufacturer = normalizeImplantManufacturer(
    normalized.implantManufacturer,
  );
  const brand = normalizeImplantBrand(normalized.implantBrand, manufacturer);
  const family = String(normalized.implantFamily || "").trim();
  const type = normalizeImplantType(normalized.implantType);

  if (!manufacturer || !brand || !family || !type) {
    return { faceHolePrcFileName: "", connectionPrcFileName: "" };
  }

  return await getPrcFileNamesByImplant(manufacturer, brand, family, type);
}

export async function getConnectionTargetDiameterByImplant(
  manufacturer,
  brand,
  family,
  type,
) {
  const normalizedManufacturer = normalizeImplantManufacturer(manufacturer);
  const normalizedBrand = normalizeImplantBrand(brand, normalizedManufacturer);
  const normalizedFamily = String(family || "").trim();
  const normalizedType = normalizeImplantType(type);

  if (
    !normalizedManufacturer ||
    !normalizedBrand ||
    !normalizedFamily ||
    !normalizedType
  ) {
    return null;
  }

  const connection = await Connection.findOne({
    manufacturer: normalizedManufacturer,
    brand: normalizedBrand,
    family: normalizedFamily,
    type: normalizedType,
    category: "hanhwa-connection",
  })
    .select({ diameter: 1 })
    .lean();

  const diameter = Number(connection?.diameter);
  if (Number.isFinite(diameter) && diameter > 0) {
    return diameter;
  }

  // DB 조회 실패 시 정적 맵으로 폴백
  const staticKey = `${normalizedManufacturer}/${normalizedBrand}/${normalizedFamily}/${normalizedType}`;
  const staticDiameter = STATIC_CONNECTION_DIAMETER_MAP[staticKey];
  if (typeof staticDiameter === "number" && staticDiameter > 0) {
    console.warn(
      `[connectionDiameter] DB lookup returned null/0, using static fallback: ${staticKey} → ${staticDiameter}mm`,
    );
    return staticDiameter;
  }

  return null;
}

export async function getConnectionTargetDiameterByPrcFileName(
  connectionPrcFileName,
) {
  const fileName = String(connectionPrcFileName || "").trim();
  if (!fileName) return null;

  const connection = await Connection.findOne({
    fileName,
    category: "hanhwa-connection",
  })
    .select({ diameter: 1 })
    .lean();

  const diameter = Number(connection?.diameter);
  return Number.isFinite(diameter) ? diameter : null;
}

export async function resolveConnectionTargetDiameter(caseInfos, options = {}) {
  if (!caseInfos) return null;

  const normalized = normalizeImplantFields(caseInfos);
  const diameterByImplant = await getConnectionTargetDiameterByImplant(
    normalized.implantManufacturer,
    normalized.implantBrand,
    normalized.implantFamily,
    normalized.implantType,
  );

  if (diameterByImplant !== null) {
    return diameterByImplant;
  }

  const prcFileName =
    options.connectionPrcFileName || normalized.connectionPrcFileName || "";
  return await getConnectionTargetDiameterByPrcFileName(prcFileName);
}
