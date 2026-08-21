// related files:
// - web/backend/models/request.model.js
// - web/backend/controllers/bg/bg.controller.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/request.ts
// change-log:
// - 2026-08-21: Rhino filled STL SSOT를 caseInfos.stlFile로 개명. camFile은 레거시 미러/폴백.
//
// 필드 의미 SSOT:
// - caseInfos.stlFile  = Rhino(2-filled) 결과 filled STL  ← 신규 SSOT
// - caseInfos.camFile  = 동일 의미의 레거시 필드명(읽기 폴백·쓰기 미러). CAM/NC가 아님.
// - caseInfos.ncFile   = Esprit(3-nc) 결과 NC 파일

const hasFileMeta = (file) => {
  if (!file || typeof file !== "object") return false;
  return Boolean(
    String(file.s3Key || "").trim() ||
      String(file.filePath || "").trim() ||
      String(file.fileName || "").trim(),
  );
};

/**
 * filled STL 메타 조회. stlFile 우선, 없으면 레거시 camFile.
 * @param {object|null|undefined} caseInfos
 */
export function resolveFilledStlFile(caseInfos) {
  const stl = caseInfos?.stlFile;
  if (hasFileMeta(stl)) return stl;
  const legacy = caseInfos?.camFile;
  if (hasFileMeta(legacy)) return legacy;
  return stl || legacy || null;
}

/**
 * caseInfos 객체에 filled STL을 기록한다(stlFile + 레거시 camFile 미러).
 * @param {object} caseInfos
 * @param {object|null|undefined} fileMeta
 */
export function applyFilledStlFileToCaseInfos(caseInfos, fileMeta) {
  if (!caseInfos || typeof caseInfos !== "object") return caseInfos;
  if (fileMeta == null) {
    caseInfos.stlFile = undefined;
    caseInfos.camFile = undefined;
    return caseInfos;
  }
  caseInfos.stlFile = fileMeta;
  // legacy mirror — 구 클라/스크립트가 camFile만 읽어도 filled STL을 보도록
  caseInfos.camFile = fileMeta;
  return caseInfos;
}

/**
 * Mongo $set용 dual-write 페이로드.
 * @param {object|null} fileMeta
 * @returns {Record<string, unknown>}
 */
export function mongoSetFilledStlFile(fileMeta) {
  return {
    "caseInfos.stlFile": fileMeta,
    "caseInfos.camFile": fileMeta, // legacy mirror
  };
}

/**
 * caseInfos에서 filled STL 필드를 비운다(stlFile + camFile).
 * @param {object} caseInfos
 */
export function clearFilledStlFileOnCaseInfos(caseInfos) {
  if (!caseInfos || typeof caseInfos !== "object") return caseInfos;
  caseInfos.stlFile = undefined;
  caseInfos.camFile = undefined;
  return caseInfos;
}

/**
 * clone/spread용 — 소스에서 filled STL을 읽어 새 caseInfos에 dual 키로 넣는다.
 * @param {object|null|undefined} sourceCaseInfos
 * @returns {{ stlFile: object|null, camFile: object|null }}
 */
export function pickFilledStlFileForClone(sourceCaseInfos) {
  const file = resolveFilledStlFile(sourceCaseInfos) || null;
  return {
    stlFile: file,
    camFile: file, // legacy mirror
  };
}

/** Mongo: filled STL(s3Key)이 있는 문서. stlFile 또는 레거시 camFile. */
export function mongoHasFilledStlFileClause() {
  return {
    $or: [
      { "caseInfos.stlFile.s3Key": { $exists: true, $nin: [null, ""] } },
      { "caseInfos.camFile.s3Key": { $exists: true, $nin: [null, ""] } },
    ],
  };
}

/** Mongo: filled STL이 아직 없는 문서(둘 다 없음). */
export function mongoMissingFilledStlFileClause() {
  return {
    $and: [
      {
        $or: [
          { "caseInfos.stlFile": { $exists: false } },
          { "caseInfos.stlFile.s3Key": { $exists: false } },
          { "caseInfos.stlFile.s3Key": null },
          { "caseInfos.stlFile.s3Key": "" },
        ],
      },
      {
        $or: [
          { "caseInfos.camFile": { $exists: false } },
          { "caseInfos.camFile.s3Key": { $exists: false } },
          { "caseInfos.camFile.s3Key": null },
          { "caseInfos.camFile.s3Key": "" },
        ],
      },
    ],
  };
}

/** caseInfos에서 filePath 후보 문자열 목록(조회·매칭용). */
export function collectFilledStlFilePathCandidates(caseInfos) {
  const out = [];
  for (const f of [caseInfos?.stlFile, caseInfos?.camFile]) {
    const p = String(f?.filePath || "").trim();
    if (p) out.push(p);
  }
  return out;
}
