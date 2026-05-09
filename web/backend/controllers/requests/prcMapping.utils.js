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
  return Number.isFinite(diameter) ? diameter : null;
}

export async function resolveConnectionTargetDiameter(caseInfos) {
  if (!caseInfos) return null;

  const normalized = normalizeImplantFields(caseInfos);
  return await getConnectionTargetDiameterByImplant(
    normalized.implantManufacturer,
    normalized.implantBrand,
    normalized.implantFamily,
    normalized.implantType,
  );
}
