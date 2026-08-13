// related files:
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/frontend/src/shared/practice/transferMemo.ts
// change-log:
// - 2026-08-13: 어벗 치아에 임플란트·스캔바디 프리셋이 없으면 기공소 전송을 거절.

const listCustomAbutmentRows = (toothWorks) =>
  (Array.isArray(toothWorks) ? toothWorks : []).filter(
    (row) => Boolean(row?.customAbutment) && String(row?.toothNumber || "").trim(),
  );

export const hasCompleteAbutmentPresets = (row) => {
  const implantOk = [
    row?.implantManufacturer,
    row?.implantBrand,
    row?.implantFamily,
    row?.implantType,
  ].every((value) => String(value || "").trim());
  const scanbodyOk = [
    row?.abutmentManufacturer,
    row?.abutmentDiameter,
    row?.abutmentHeight,
  ].every((value) => String(value || "").trim());
  return implantOk && scanbodyOk;
};

export const listIncompleteAbutmentPresetTeeth = (toothWorks) =>
  listCustomAbutmentRows(toothWorks)
    .filter((row) => !hasCompleteAbutmentPresets(row))
    .map((row) => String(row.toothNumber || "").trim());

export const assertAbutmentPresetsComplete = (toothWorks) => {
  const teeth = listIncompleteAbutmentPresetTeeth(toothWorks);
  if (teeth.length === 0) return;
  const error = new Error(
    `어벗 프리셋(임플란트·스캔바디)을 선택해주세요. (#${teeth.join(", #")})`,
  );
  error.statusCode = 400;
  throw error;
};
