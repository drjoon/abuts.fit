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

/**
 * 임플란트 정보로 PRC 파일명 조회
 * @param {string} manufacturer - 제조사 (e.g. "OSSTEM", "DENTIS")
 * @param {string} brand - 브랜드 (e.g. "TS", "SuperLine")
 * @param {string} family - 패밀리 (e.g. "Regular", "Mini")
 * @param {string} type - 타입 (e.g. "Hex", "Non-Hex")
 * @returns {{ faceHolePrcFileName: string, connectionPrcFileName: string }}
 */
export function getPrcFileNamesByImplant(manufacturer, brand, family, type) {
  return buildPrcFileNamesFromCatalog(manufacturer, brand, type, family);
}

/**
 * caseInfos 객체로부터 PRC 파일명 자동 결정
 * @param {object} caseInfos - Request.caseInfos
 * @returns {{ faceHolePrcFileName: string, connectionPrcFileName: string }}
 */
export function resolvePrcFileNames(caseInfos) {
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

  return getPrcFileNamesByImplant(manufacturer, brand, family, type);
}
