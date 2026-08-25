// related files:
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/frontend/src/shared/practice/transferMemo.ts
// change-log:
// - 2026-08-25: 심플어벗(종류·직경·높이)을 스캔바디와 XOR로 인정. 임플란트+(스캔바디|심플어벗).
// - 2026-08-13: 어벗 치아에 임플란트·스캔바디 프리셋이 없으면 기공소 전송을 거절.

const SIMPLE_ABUTMENT_KINDS = new Set(["심플어벗", "심플밀링"]);
const SIMPLE_ABUTMENT_DIAMETERS = new Set(["6", "7", "8", "9", "10"]);
const SIMPLE_ABUTMENT_HEIGHTS = new Set(["S", "M", "L"]);

const listCustomAbutmentRows = (toothWorks) =>
  (Array.isArray(toothWorks) ? toothWorks : []).filter(
    (row) => Boolean(row?.customAbutment) && String(row?.toothNumber || "").trim(),
  );

const hasScanbodyOrSimpleAbutment = (row) => {
  const manufacturer = String(row?.abutmentManufacturer || "").trim();
  const diameter = String(row?.abutmentDiameter || "").trim();
  const height = String(row?.abutmentHeight || "").trim();
  if (SIMPLE_ABUTMENT_KINDS.has(manufacturer)) {
    return (
      SIMPLE_ABUTMENT_DIAMETERS.has(diameter) &&
      SIMPLE_ABUTMENT_HEIGHTS.has(height)
    );
  }
  return Boolean(manufacturer && diameter && height);
};

export const hasCompleteAbutmentPresets = (row) => {
  const implantOk = [
    row?.implantManufacturer,
    row?.implantBrand,
    row?.implantFamily,
    row?.implantType,
  ].every((value) => String(value || "").trim());
  return implantOk && hasScanbodyOrSimpleAbutment(row);
};

export const listIncompleteAbutmentPresetTeeth = (toothWorks) =>
  listCustomAbutmentRows(toothWorks)
    .filter((row) => !hasCompleteAbutmentPresets(row))
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
