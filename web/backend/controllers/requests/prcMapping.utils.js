/**
 * 임플란트 정보(manufacturer/system/type)를 기반으로
 * Esprit CAM 공정에 필요한 PRC 파일명을 자동 결정
 *
 * 참조: 구글 스프레드시트 "PRC를 CAM NC에 위임"
 * - 1_Face Hole file naming
 * - 2_Connection file naming
 */

function normalizeKeyToken(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  try {
    return s.normalize("NFC");
  } catch {
    return s;
  }
}

function normalizeImplantManufacturer(raw) {
  const s = normalizeKeyToken(raw).toUpperCase();
  if (s === "OSSTEM" || s === "오스템") return "OSSTEM";
  if (s === "DENTIUM" || s === "덴티움") return "DENTIUM";
  if (s === "DIO" || s === "디오") return "DIO";
  if (s === "MEGAGEN" || s === "메가젠") return "MEGAGEN";
  if (s === "NEOBIOTECH" || s === "NEO" || s === "네오") return "NEO";
  if (s === "DENTIS" || s === "덴티스") return "DENTIS";
  return normalizeKeyToken(raw);
}

function normalizeImplantSystem(raw) {
  const s = normalizeKeyToken(raw);
  if (!s) return "";
  // UI 입력값 그대로 SSOT로 사용 (스프레드시트 표기와 맞춰야 함)
  // 예: Regular, SuperLine, UF, AnyOne, IS, SQ
  return s;
}

function normalizeImplantType(raw) {
  const s = normalizeKeyToken(raw);
  if (!s) return "";
  const upper = s.toUpperCase().replaceAll("_", "-").replaceAll(" ", "");
  if (upper === "HEX") return "Hex";
  if (upper === "NONHEX" || upper === "NON-HEX") return "Non-Hex";
  // 다른 타입은 일단 원문 유지
  return s;
}

// 실제 로컬 PRC 폴더( bg/esprit-addin/AcroDent/1_Face Hole, 2_Connection )에 존재하는 파일명과 동일해야 함
// (addon에서 정규화 탐색을 하지만, 백엔드 응답도 스프레드시트/폴더명과 1:1 매칭되도록 유지)
const FACE_HOLE_PRC_MAP = {
  "OSSTEM|Regular|Hex": "오스템_TS_RH_FaceHole.prc",
  "DENTIUM|SuperLine|Hex": "덴티움_SuperLine_RH_FaceHole.prc",
  "DIO|UF|Hex": "디오_UF_RH_FaceHole.prc",
  "MEGAGEN|AnyOne|Hex": "메가젠_AnyOne_RH_FaceHole.prc",
  "NEO|IS|Hex": "네오_IS_RH_FaceHole.prc",
  "DENTIS|SQ|Hex": "덴티스_SQ_RH_FaceHole.prc",
};

const CONNECTION_PRC_MAP = {
  "OSSTEM|Regular|Hex": "오스템_TS_RH_Connection.prc",
  "DENTIUM|SuperLine|Hex": "덴티움_SuperLine_RH_Connection.prc",
  "DIO|UF|Hex": "디오_UF_RH_Connection.prc",
  "MEGAGEN|AnyOne|Hex": "메가젠_AnyOne_RH_Connection.prc",
  "NEO|IS|Hex": "네오_IS_RH_Connection.prc",
  "DENTIS|SQ|Hex": "덴티스_SQ_RH_Connection.prc",
};

/**
 * 임플란트 정보로 PRC 파일명 조회
 * @param {string} manufacturer - 제조사 (e.g. "OSSTEM", "DENTIS")
 * @param {string} system - 시스템 (e.g. "Regular", "SuperLine")
 * @param {string} type - 타입 (e.g. "Hex", "Non-Hex", "Mini Hex")
 * @returns {{ faceHolePrcFileName: string, connectionPrcFileName: string }}
 */
export function getPrcFileNamesByImplant(manufacturer, system, type) {
  const m = normalizeImplantManufacturer(manufacturer);
  const sys = normalizeImplantSystem(system);
  const t = normalizeImplantType(type);
  const key = `${m}|${sys}|${t}`;

  const faceHolePrcFileName = FACE_HOLE_PRC_MAP[key] || "";
  const connectionPrcFileName = CONNECTION_PRC_MAP[key] || "";

  return {
    faceHolePrcFileName,
    connectionPrcFileName,
  };
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

  const manufacturer = normalizeImplantManufacturer(
    caseInfos.implantManufacturer,
  );
  const system = normalizeImplantSystem(caseInfos.implantSystem);
  const type = normalizeImplantType(caseInfos.implantType);

  if (!manufacturer || !system || !type) {
    return { faceHolePrcFileName: "", connectionPrcFileName: "" };
  }

  return getPrcFileNamesByImplant(manufacturer, system, type);
}
