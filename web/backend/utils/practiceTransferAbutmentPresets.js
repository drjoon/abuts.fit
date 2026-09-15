// related files:
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/frontend/src/shared/practice/transferMemo.ts
// change-log:
// - 2026-09-15: 어벗 라디오는 임플란트만 필수(심플·직접입력 규격 선택). 스캔바디·단독 CA는 임플란트+규격.
// - 2026-08-25: 심플어벗(종류·직경·높이)을 스캔바디와 XOR로 인정. 임플란트+(스캔바디|심플어벗).
// - 2026-08-13: 어벗 치아에 임플란트·스캔바디 프리셋이 없으면 기공소 전송을 거절.

import { isCustomAbutmentProsthesisType } from "./labFeeSchedule.js";

const SIMPLE_ABUTMENT_KINDS = new Set(["심플어벗", "심플밀링"]);
const SIMPLE_HEALING_KIND = "심플힐링";
const CUSTOM_ABUTMENT_SELECTION = {
  ABUTMENT: "abutment",
  SCANBODY: "scanbody",
};

const isSupportedCustomAbutmentProsthesis = (prosthesisType) => {
  const type = String(prosthesisType || "").trim();
  if (isCustomAbutmentProsthesisType(type)) return true;
  return type === "크라운" || type === "브리지" || type === "임시치아";
};

const isSimpleAbutmentKind = (value) =>
  SIMPLE_ABUTMENT_KINDS.has(String(value || "").trim());

const isSimpleHealingKind = (value) =>
  String(value || "").trim() === SIMPLE_HEALING_KIND;

/** FE resolveCustomAbutmentSelection과 동일(레거시 추론 포함). */
const resolveCustomAbutmentSelection = (row) => {
  if (!row?.customAbutment) return null;
  const raw = String(row?.customAbutmentSelection || "").trim();
  if (
    raw === CUSTOM_ABUTMENT_SELECTION.ABUTMENT ||
    raw === CUSTOM_ABUTMENT_SELECTION.SCANBODY
  ) {
    return raw;
  }
  if (isSimpleHealingKind(row.abutmentManufacturer)) {
    return CUSTOM_ABUTMENT_SELECTION.SCANBODY;
  }
  if (isSimpleAbutmentKind(row.abutmentManufacturer)) {
    return CUSTOM_ABUTMENT_SELECTION.ABUTMENT;
  }
  if (
    String(row.abutmentManufacturer || "").trim() ||
    String(row.abutmentDiameter || "").trim() ||
    String(row.abutmentHeight || "").trim()
  ) {
    return CUSTOM_ABUTMENT_SELECTION.SCANBODY;
  }
  return CUSTOM_ABUTMENT_SELECTION.ABUTMENT;
};

/**
 * FE isAbutmentPresetRequired와 동일.
 * - 단독 커스텀어벗·크라운/브리지/임시치아+체크: 프리셋 검사 대상
 */
export const isAbutmentPresetRequired = (row) => {
  const type = String(row?.prosthesisType || "");
  if (isCustomAbutmentProsthesisType(type)) return true;
  return Boolean(row?.customAbutment) && isSupportedCustomAbutmentProsthesis(type);
};

const listCustomAbutmentRows = (toothWorks) =>
  (Array.isArray(toothWorks) ? toothWorks : []).filter(
    (row) => Boolean(row?.customAbutment) && String(row?.toothNumber || "").trim(),
  );

const hasImplantPreset = (row) =>
  [
    row?.implantManufacturer,
    row?.implantBrand,
    row?.implantFamily,
    row?.implantType,
  ].every((value) => String(value || "").trim());

const hasScanbodyOrSimpleAbutment = (row) => {
  const manufacturer = String(row?.abutmentManufacturer || "").trim();
  const diameter = String(row?.abutmentDiameter || "").trim();
  const height = String(row?.abutmentHeight || "").trim();
  // 심플어벗/밀링: 종류 고정, 직경·높이는 BA 카탈로그 커스텀 허용(비어 있지 않으면 OK)
  if (SIMPLE_ABUTMENT_KINDS.has(manufacturer)) {
    return Boolean(diameter && height);
  }
  return Boolean(manufacturer && diameter && height);
};

export const hasCompleteAbutmentPresets = (row) =>
  hasImplantPreset(row) && hasScanbodyOrSimpleAbutment(row);

/** FE isAbutmentPresetMissing과 동일 — 어벗 라디오는 임플란트만. */
export const isAbutmentPresetMissing = (row) => {
  if (!isAbutmentPresetRequired(row)) return false;
  if (
    !isCustomAbutmentProsthesisType(String(row?.prosthesisType || "")) &&
    resolveCustomAbutmentSelection(row) === CUSTOM_ABUTMENT_SELECTION.ABUTMENT
  ) {
    return !hasImplantPreset(row);
  }
  return !hasCompleteAbutmentPresets(row);
};

export const listIncompleteAbutmentPresetTeeth = (toothWorks) =>
  listCustomAbutmentRows(toothWorks)
    .filter((row) => isAbutmentPresetMissing(row))
    .map((row) => String(row.toothNumber || "").trim());

export const assertAbutmentPresetsComplete = (toothWorks) => {
  const teeth = listIncompleteAbutmentPresetTeeth(toothWorks);
  if (teeth.length === 0) return;
  const error = new Error(
    `어벗 프리셋(임플란트·스캔바디/심플어벗)을 선택해주세요. (#${teeth.join(", #")})`,
  );
  error.statusCode = 400;
  throw error;
};
