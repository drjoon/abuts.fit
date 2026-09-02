// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/hexRotation.ts
// - web/backend/controllers/requests/creation.from-draft.controller.js
// - web/backend/services/practiceTransferProduction.service.js
// - web/frontend/src/features/requestSettings/DesignSoftwareSettingsDialog.tsx
// - web/backend/controllers/admin/admin.hexVerification.controller.js
// change-log:
// - 2026-09-03: ExoCAD 3.0 이하 × 임플란트 제조사별 헥스 맵(applyHex30/verifiedHex). 계정 단일 확정은 레거시 fallback.
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

/**
 * CNC 카탈로그 unique manufacturer (헥스 관리 UI/마이그레이션 SSOT).
 * related: web/frontend/src/shared/practice/cncImplantCatalog.ts
 */
export const CNC_HEX_IMPLANT_MANUFACTURERS = Object.freeze([
  "OSSTEM",
  "DENTIUM",
  "NEOBIOTECH",
  "DIO",
  "MEGAGEN",
  "DENTIS",
]);

const MANUFACTURER_ALIASES = Object.freeze({
  OSSTEM: ["OSSTEM", "오스템"],
  DENTIUM: ["DENTIUM", "덴티움"],
  NEOBIOTECH: ["NEOBIOTECH", "NEO", "네오", "네오바이오텍"],
  DIO: ["DIO", "디오"],
  MEGAGEN: ["MEGAGEN", "메가젠"],
  DENTIS: ["DENTIS", "덴티스"],
});

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

/** 임플란트 제조사 키 → CNC canonical (없으면 upper trim) */
export const normalizeImplantManufacturerKey = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase().replace(/\s+/g, "");
  for (const [canonical, aliases] of Object.entries(MANUFACTURER_ALIASES)) {
    for (const alias of aliases) {
      const a = String(alias || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
      if (a && (upper === a || raw === alias)) return canonical;
    }
  }
  // 한글 별칭 직접 매칭
  for (const [canonical, aliases] of Object.entries(MANUFACTURER_ALIASES)) {
    if (aliases.includes(raw)) return canonical;
  }
  return upper;
};

export const listHexByImplantManufacturer = (requestSettings = null) => {
  const rows = requestSettings?.hexByImplantManufacturer;
  return Array.isArray(rows) ? rows : [];
};

export const findHexByImplantManufacturerEntry = (
  requestSettings = null,
  implantManufacturerRaw = null,
) => {
  const key = normalizeImplantManufacturerKey(implantManufacturerRaw);
  if (!key) return null;
  const rows = listHexByImplantManufacturer(requestSettings);
  return (
    rows.find(
      (row) =>
        normalizeImplantManufacturerKey(row?.manufacturer) === key,
    ) || null
  );
};

/**
 * 디자인 SW(+ExoCAD 버전) → pending 기간의 시드 헥스(관리자 확정 전).
 * - ExoCAD 3.0 이하(또는 버전 미지정 레거시): 헥스30도회전
 * - ExoCAD 3.2 이상: STL모델대로
 * - 그 외(3Shape/custom): STL모델대로
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

/** ExoCAD 3.0 이하(또는 버전 미지정 레거시)인지 */
export const isExoCadLe30 = (designSoftwareRaw, exoCadVersionRaw = null) => {
  const designSoftware = String(designSoftwareRaw || "").trim();
  if (designSoftware !== "ExoCAD") return false;
  const version = normalizeExoCadVersion(exoCadVersionRaw);
  return version !== EXOCAD_VERSION_GE_3_2;
};

/**
 * 임플란트 제조사별 관리자 확정 헥스.
 * User.hexByImplantManufacturer[M].verifiedHex → 레거시 계정 hexVerificationResultHex.
 */
export const resolveVerifiedHexForImplantManufacturer = (
  userRequestSettings = null,
  implantManufacturerRaw = null,
  anchorRequestSettings = null,
) => {
  const entry = findHexByImplantManufacturerEntry(
    userRequestSettings,
    implantManufacturerRaw,
  );
  const fromMap = normalizeHexVerificationResultHex(entry?.verifiedHex);
  if (fromMap) return fromMap;

  // 레거시 계정 단일 확정 (마이그레이션 전 / fallback)
  return (
    normalizeHexVerificationResultHex(
      userRequestSettings?.hexVerificationResultHex,
    ) ||
    normalizeHexVerificationResultHex(
      anchorRequestSettings?.hexVerificationResultHex,
    )
  );
};

/**
 * @deprecated 계정 단일 확정. 신규 코드는 resolveVerifiedHexForImplantManufacturer 사용.
 * User → BusinessAnchor 순으로 관리자 확정 헥스를 읽는다.
 */
export const resolveAdminVerifiedHexFromSettings = (
  userRequestSettings = null,
  anchorRequestSettings = null,
  implantManufacturerRaw = null,
) => {
  if (implantManufacturerRaw != null && String(implantManufacturerRaw).trim()) {
    return resolveVerifiedHexForImplantManufacturer(
      userRequestSettings,
      implantManufacturerRaw,
      anchorRequestSettings,
    );
  }
  return (
    normalizeHexVerificationResultHex(
      userRequestSettings?.hexVerificationResultHex,
    ) ||
    normalizeHexVerificationResultHex(
      anchorRequestSettings?.hexVerificationResultHex,
    )
  );
};

/**
 * 시드용 applyHex30 (기본 true = 헥스30도회전).
 * 맵에 없으면 true.
 */
export const resolveApplyHex30ForImplantManufacturer = (
  userRequestSettings = null,
  implantManufacturerRaw = null,
) => {
  const entry = findHexByImplantManufacturerEntry(
    userRequestSettings,
    implantManufacturerRaw,
  );
  if (entry && typeof entry.applyHex30 === "boolean") return entry.applyHex30;
  return true;
};

/**
 * applyHex30 → canonical hex mode
 */
export const hexModeFromApplyHex30 = (applyHex30) =>
  applyHex30 === false ? "STL모델대로" : "헥스30도회전";

/**
 * 헥스 확인 pending SSOT.
 * ExoCAD 3.0 이하이고 해당 임플란트 제조사에 verifiedHex 가 없으면 true.
 * implantManufacturer 없으면 레거시(계정 단일) 판정.
 */
export const isHexVerificationPending = ({
  designSoftware = null,
  exoCadVersion = null,
  adminVerifiedHex = null,
  implantManufacturer = null,
  userRequestSettings = null,
  anchorRequestSettings = null,
} = {}) => {
  if (String(designSoftware || "").trim() !== "ExoCAD") return false;
  if (!isExoCadLe30(designSoftware, exoCadVersion)) return false;

  if (implantManufacturer != null && String(implantManufacturer).trim()) {
    const verified = resolveVerifiedHexForImplantManufacturer(
      userRequestSettings,
      implantManufacturer,
      anchorRequestSettings,
    );
    return !verified;
  }

  return !normalizeHexVerificationResultHex(adminVerifiedHex);
};

/**
 * ExoCAD 제조사 헥스 해석 SSOT.
 * ExoCAD 3.0 이하 + implantManufacturer:
 *   1) verifiedHex(제조사별) → 확정·잠금
 *   2) applyHex30 시드 (기본 true)
 *   3) designSoftware 폴백
 * ExoCAD 3.2+ / 비-ExoCAD: manufacturerDefault || designSoftware
 *
 * @returns {string} canonical hex mode
 */
export const resolveExoCadManufacturerHexRotation = ({
  designSoftware,
  exoCadVersion = null,
  implantManufacturer = null,
  userRequestSettings = null,
  anchorRequestSettings = null,
  manufacturerDefault = null,
  adminVerifiedHex = null,
  hexVerificationPending = null,
} = {}) => {
  const sw = String(designSoftware || "").trim();
  const designFallback = resolveHexRotationByDesignSoftware(sw, exoCadVersion);
  const mfg = String(manufacturerDefault || "").trim() || null;

  if (sw !== "ExoCAD") {
    return mfg || designFallback;
  }

  if (!isExoCadLe30(sw, exoCadVersion)) {
    return mfg || designFallback;
  }

  const hasImplant =
    implantManufacturer != null && String(implantManufacturer).trim();

  if (hasImplant) {
    const verified = resolveVerifiedHexForImplantManufacturer(
      userRequestSettings,
      implantManufacturer,
      anchorRequestSettings,
    );
    if (verified) return verified;

    const applyHex30 = resolveApplyHex30ForImplantManufacturer(
      userRequestSettings,
      implantManufacturer,
    );
    return hexModeFromApplyHex30(applyHex30);
  }

  // 레거시 경로 (implantManufacturer 미전달)
  const admin =
    normalizeHexVerificationResultHex(adminVerifiedHex) ||
    resolveAdminVerifiedHexFromSettings(
      userRequestSettings,
      anchorRequestSettings,
    );
  const pending =
    hexVerificationPending == null
      ? isHexVerificationPending({
          designSoftware: sw,
          exoCadVersion,
          adminVerifiedHex: admin,
        })
      : Boolean(hexVerificationPending);

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

/**
 * hexByImplantManufacturer 배열에서 제조사 행 upsert용 plain object.
 */
export const upsertHexByImplantManufacturerRow = (
  rows,
  manufacturerRaw,
  patch = {},
) => {
  const key = normalizeImplantManufacturerKey(manufacturerRaw);
  if (!key) return Array.isArray(rows) ? [...rows] : [];
  const list = Array.isArray(rows) ? [...rows] : [];
  const idx = list.findIndex(
    (row) => normalizeImplantManufacturerKey(row?.manufacturer) === key,
  );
  const prev = idx >= 0 ? list[idx] : { manufacturer: key, applyHex30: true };
  const next = {
    manufacturer: key,
    applyHex30:
      typeof patch.applyHex30 === "boolean"
        ? patch.applyHex30
        : typeof prev.applyHex30 === "boolean"
          ? prev.applyHex30
          : true,
    verifiedHex:
      patch.verifiedHex !== undefined
        ? patch.verifiedHex
        : prev.verifiedHex ?? null,
    verifiedAt:
      patch.verifiedAt !== undefined
        ? patch.verifiedAt
        : prev.verifiedAt ?? null,
    verifiedBy:
      patch.verifiedBy !== undefined
        ? patch.verifiedBy
        : prev.verifiedBy ?? null,
  };
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  return list;
};
