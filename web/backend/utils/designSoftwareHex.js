// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/hexRotation.ts
// - web/backend/controllers/requests/creation.from-draft.controller.js
// - web/backend/services/practiceTransferProduction.service.js
// - web/frontend/src/features/requestSettings/DesignSoftwareSettingsDialog.tsx
// - web/backend/controllers/admin/admin.hexVerification.controller.js
// change-log:
// - 2026-08-25: 확정 후 우선순위 관리자 > 제조사. pending은 디자인SW 강제(제조사는 의뢰 단위 변경 가능).
// - 2026-08-21: 헥스 확인 pending SSOT = ExoCAD && 관리자 hexVerificationResultHex 없음
// - 2026-08-21: resolveExoCadManufacturerHexRotation — 제조사 > 관리자 확정 > 디자인SW
// - 2026-08-21: ExoCAD 버전(3.0 이하 / 3.2 이상)별 헥스 기본값 + 첫의뢰 확인용 샘플 라벨 SSOT

/** ExoCAD 3.0 이하 (STL 내보내기 시 헥스 30도 틀어짐) */
export const EXOCAD_VERSION_LE_3_0 = "le_3_0";
/** ExoCAD 3.2 이상 (헥스 정렬 수정됨) */
export const EXOCAD_VERSION_GE_3_2 = "ge_3_2";

export const HEX_VERIFICATION_SAMPLE_LABEL = "헥스 확인용 무료 샘플";

/** 관리자 헥스 확인 완료 시 허용값 */
export const HEX_VERIFICATION_RESULT_VALUES = ["STL모델대로", "헥스30도회전"];

export const normalizeExoCadVersion = (value) => {
  const raw = String(value || "").trim();
  if (raw === EXOCAD_VERSION_LE_3_0 || raw === "3.0" || raw === "<=3.0") {
    return EXOCAD_VERSION_LE_3_0;
  }
  if (raw === EXOCAD_VERSION_GE_3_2 || raw === "3.2" || raw === ">=3.2") {
    return EXOCAD_VERSION_GE_3_2;
  }
  return null;
};

/**
 * 관리자 확정 헥스(STL/30도)만 허용. 그 외 null.
 */
export const normalizeHexVerificationResultHex = (value) => {
  const raw = String(value || "").trim();
  if (raw === "STL모델대로" || raw === "0") return "STL모델대로";
  if (raw === "헥스30도회전" || raw === "30") return "헥스30도회전";
  return null;
};

/**
 * 디자인 SW(+ExoCAD 버전) → pending 기간의 시드 헥스(관리자 확정 전).
 * - ExoCAD 3.0 이하(또는 버전 미지정 레거시): 헥스30도회전
 * - ExoCAD 3.2 이상: STL모델대로
 * - 그 외(3Shape/custom): STL모델대로
 * 주의: 3.2+라도 실제 계측/샘플 결과에 따라 헥스30도회전일 수 있다.
 * 최종 SSOT는 관리자 hexVerificationResultHex(샘플 테스트 후 확정).
 */
export const resolveHexRotationByDesignSoftware = (
  designSoftwareRaw,
  exoCadVersionRaw = null,
) => {
  const designSoftware = String(designSoftwareRaw || "").trim();
  if (!designSoftware) return "STL모델대로";
  if (designSoftware !== "ExoCAD") return "STL모델대로";

  const version = normalizeExoCadVersion(exoCadVersionRaw);
  if (version === EXOCAD_VERSION_GE_3_2) return "STL모델대로";
  return "헥스30도회전";
};

/**
 * User → BusinessAnchor 순으로 관리자 확정 헥스를 읽는다.
 * @param {object|null|undefined} userRequestSettings
 * @param {object|null|undefined} anchorRequestSettings
 * @returns {"STL모델대로"|"헥스30도회전"|null}
 */
export const resolveAdminVerifiedHexFromSettings = (
  userRequestSettings = null,
  anchorRequestSettings = null,
) =>
  normalizeHexVerificationResultHex(
    userRequestSettings?.hexVerificationResultHex,
  ) ||
  normalizeHexVerificationResultHex(
    anchorRequestSettings?.hexVerificationResultHex,
  );

/**
 * 헥스 확인 pending SSOT.
 * ExoCAD 이고 관리자 hexVerificationResultHex 가 아직 없으면 true.
 * (별도 hexVerificationSamplePending 플래그를 쓰지 않는다)
 */
export const isHexVerificationPending = ({
  designSoftware = null,
  adminVerifiedHex = null,
} = {}) => {
  if (String(designSoftware || "").trim() !== "ExoCAD") return false;
  return !normalizeHexVerificationResultHex(adminVerifiedHex);
};

/**
 * ExoCAD 제조사 헥스 해석 SSOT.
 * 우선순위:
 * 1) 관리자 미확정(pending) → designSoftware(+version) 시드만 강제
 *    (3.2+ 시드=STL이어도 샘플 결과에 따라 30도일 수 있음 → 제조사가 준비 단계에서 의뢰 단위 변경)
 * 2) 관리자 hexVerificationResultHex (샘플 테스트 후 확정 — 최종 SSOT, 이후 제조사 변경 불가)
 * 3) 제조사 defaultManufacturerHexRotation
 * 4) designSoftware(+version)
 * 비-ExoCAD: manufacturerDefault || designSoftware 폴백(관리자 필드 무시).
 *
 * hexVerificationPending 인자는 하위 호환용. 생략 시 adminVerifiedHex로 판정.
 *
 * @returns {string} canonical hex mode
 */
export const resolveExoCadManufacturerHexRotation = ({
  designSoftware,
  exoCadVersion = null,
  manufacturerDefault = null,
  adminVerifiedHex = null,
  hexVerificationPending = null,
} = {}) => {
  const sw = String(designSoftware || "").trim();
  const designFallback = resolveHexRotationByDesignSoftware(sw, exoCadVersion);
  const mfg = String(manufacturerDefault || "").trim() || null;
  const admin = normalizeHexVerificationResultHex(adminVerifiedHex);
  const pending =
    hexVerificationPending == null
      ? isHexVerificationPending({ designSoftware: sw, adminVerifiedHex: admin })
      : Boolean(hexVerificationPending);

  if (sw !== "ExoCAD") {
    return mfg || designFallback;
  }

  if (pending) {
    return designFallback;
  }
  if (admin) return admin;
  if (mfg) return mfg;
  return designFallback;
};

/** 원본 헥스의 반대(첫의뢰 확인용 복사샘플) */
export const resolveOppositeHexRotation = (hexRaw) => {
  const v = String(hexRaw || "").trim();
  if (v === "헥스30도회전" || v === "30") return "STL모델대로";
  return "헥스30도회전";
};

export const isHexVerificationSampleCase = (caseInfos) =>
  Boolean(caseInfos?.hexVerificationSample === true);
