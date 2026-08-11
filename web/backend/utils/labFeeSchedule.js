// related files:
// - web/backend/rules.md
// - web/backend/models/businessAnchor.model.js
// - web/backend/utils/creditSettingsDefaults.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js

export const LAB_FEE_SCHEDULE_DEFAULTS = {
  crown: 60000,
  bridge: 60000,
  inlay: 50000,
  pontic: 40000,
};

export const LAB_TRADING_PARTNER_WINDOW_DAYS = 60;

/** 보철 형태 → labFeeSchedule 키 */
export function resolveLabFeeKeyFromProsthesisType(prosthesisType) {
  const raw = String(prosthesisType || "").trim();
  if (!raw) return "crown";
  if (/^pontic$/i.test(raw)) return "pontic";
  if (raw.includes("인레이") || /^inlay$/i.test(raw)) return "inlay";
  if (raw.includes("브리지") || /^bridge$/i.test(raw)) return "bridge";
  if (raw.includes("크라운") || /^crown$/i.test(raw)) return "crown";
  return "crown";
}

export function prosthesisIncludesCustomAbutment(prosthesisType) {
  const raw = String(prosthesisType || "").trim();
  return raw.includes("커스텀어벗") || /custom\s*abut/i.test(raw);
}

export function normalizeLabFeeSchedule(input) {
  const src = input && typeof input === "object" ? input : {};
  const pick = (key) => {
    const n = Math.round(Number(src[key] ?? LAB_FEE_SCHEDULE_DEFAULTS[key]));
    return Number.isFinite(n) && n >= 0 ? n : LAB_FEE_SCHEDULE_DEFAULTS[key];
  };
  return {
    crown: pick("crown"),
    bridge: pick("bridge"),
    inlay: pick("inlay"),
    pontic: pick("pontic"),
  };
}

/**
 * toothWorks 행 기준 기공비·어벗 소매가 합산.
 * @returns {{ labFeeTotal, abutmentRetailTotal, abutmentQty, total, lines }}
 */
export function computePracticeTransferRetailFees({
  toothWorks,
  labFeeSchedule,
  abutmentRetailPrice,
}) {
  const schedule = normalizeLabFeeSchedule(labFeeSchedule);
  const retailUnit = Math.max(
    0,
    Math.round(Number(abutmentRetailPrice || 0)) || 0,
  );
  const rows = Array.isArray(toothWorks) ? toothWorks : [];
  const lines = [];
  let labFeeTotal = 0;
  let abutmentRetailTotal = 0;
  let abutmentQty = 0;

  for (const row of rows) {
    const prosthesisType = String(
      row?.prosthesisType || row?.type || "",
    ).trim();
    if (!prosthesisType) continue;
    // Pontic은 기공비만 (어벗 없음)
    const feeKey = resolveLabFeeKeyFromProsthesisType(prosthesisType);
    const labFee = Math.max(0, Math.round(Number(schedule[feeKey] || 0)));
    const hasAbutment =
      prosthesisIncludesCustomAbutment(prosthesisType) ||
      Boolean(row?.hasCustomAbutment) ||
      Boolean(row?.customAbutment);
    const abutmentFee = hasAbutment && !/^pontic$/i.test(prosthesisType)
      ? retailUnit
      : 0;

    labFeeTotal += labFee;
    if (abutmentFee > 0) {
      abutmentRetailTotal += abutmentFee;
      abutmentQty += 1;
    }
    lines.push({
      toothNumber: String(row?.toothNumber || row?.tooth || "").trim(),
      prosthesisType,
      labFee,
      abutmentRetail: abutmentFee,
    });
  }

  return {
    labFeeTotal,
    abutmentRetailTotal,
    abutmentQty,
    total: labFeeTotal + abutmentRetailTotal,
    lines,
  };
}
