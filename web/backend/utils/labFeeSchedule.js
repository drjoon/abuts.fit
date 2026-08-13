// related files:
// - web/backend/rules.md
// - web/backend/models/businessAnchor.model.js
// - web/backend/utils/creditSettingsDefaults.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js

export const LAB_FEE_SCHEDULE_KEYS = [
  "crown",
  "bridge",
  "inlay",
  "pontic",
  "customAbutmentDesign",
  "customAbutmentDesignAndProduction",
];

export const LAB_FEE_SCHEDULE_DEFAULTS = {
  crown: 60000,
  bridge: 60000,
  inlay: 50000,
  pontic: 40000,
  customAbutmentDesign: 10000,
  customAbutmentDesignAndProduction: 35000,
};

/** 기공소 미지정(자동매칭) 견적 — 기본수가 없음(0원). 기공소 스케줄이 있을 때만 청구. */
export const LAB_FEE_SCHEDULE_ZEROS = Object.fromEntries(
  LAB_FEE_SCHEDULE_KEYS.map((key) => [key, 0]),
);

/** 항목별 서비스 제공 여부. 미설정 시 전부 제공(true) */
export const LAB_FEE_SCHEDULE_ENABLED_DEFAULTS = Object.fromEntries(
  LAB_FEE_SCHEDULE_KEYS.map((key) => [key, true]),
);

export const LAB_TRADING_PARTNER_WINDOW_DAYS = 60;

export function isMissingToothProsthesisType(prosthesisType) {
  const raw = String(prosthesisType || "").trim();
  const compact = raw.replace(/\s+/g, "");
  return (
    raw === "작업X" ||
    raw === "상실치" ||
    compact.toLowerCase() === "작업x" ||
    /^missing(?:tooth)?$/i.test(compact)
  );
}

/** 보철 형태 → labFeeSchedule 키. 작업X(상실치)는 과금 대상이 아니므로 null */
export function resolveLabFeeKeyFromProsthesisType(prosthesisType) {
  const raw = String(prosthesisType || "").trim();
  if (!raw) return "crown";
  if (isMissingToothProsthesisType(raw)) return null;
  // 디자인만 — 크라운/브리지 포함 문자열보다 먼저
  if (
    /어벗\s*디자인/i.test(raw) ||
    /custom\s*abut(?:ment)?\s*design/i.test(raw)
  ) {
    return "customAbutmentDesign";
  }
  if (/^pontic$/i.test(raw)) return "pontic";
  if (raw.includes("인레이") || /^inlay$/i.test(raw)) return "inlay";
  if (raw.includes("브리지") || /^bridge$/i.test(raw)) return "bridge";
  if (raw.includes("크라운") || /^crown$/i.test(raw)) return "crown";
  return "crown";
}

export function prosthesisIncludesCustomAbutment(prosthesisType) {
  const raw = String(prosthesisType || "").trim();
  // 커스텀어벗 디자인만: 어벗 소매가 미부과
  if (resolveLabFeeKeyFromProsthesisType(raw) === "customAbutmentDesign") {
    return false;
  }
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
    customAbutmentDesign: pick("customAbutmentDesign"),
    customAbutmentDesignAndProduction: pick(
      "customAbutmentDesignAndProduction",
    ),
  };
}

/** labFeeSchedule.enabled — 제공하지 않는 항목은 false */
export function normalizeLabFeeScheduleEnabled(input) {
  const src =
    input && typeof input === "object"
      ? input.enabled && typeof input.enabled === "object"
        ? input.enabled
        : input
      : {};
  const out = {};
  for (const key of LAB_FEE_SCHEDULE_KEYS) {
    if (typeof src[key] === "boolean") {
      out[key] = src[key];
    } else if (src[key] === 0 || src[key] === "0" || src[key] === "false") {
      out[key] = false;
    } else if (src[key] === 1 || src[key] === "1" || src[key] === "true") {
      out[key] = true;
    } else {
      out[key] = LAB_FEE_SCHEDULE_ENABLED_DEFAULTS[key];
    }
  }
  return out;
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
    // 작업X(상실치): 보철 아님 → 기공비·어벗 소매가 모두 제외
    if (isMissingToothProsthesisType(prosthesisType)) continue;
    // Pontic은 기공비만 (어벗 없음)
    const feeKey = resolveLabFeeKeyFromProsthesisType(prosthesisType);
    if (!feeKey) continue;
    const labFee = Math.max(0, Math.round(Number(schedule[feeKey] || 0)));
    // 어벗 디자인: 기공비만. customAbutment 스펙 체크와 무관하게 소매가 미부과
    const isDesignOnly = feeKey === "customAbutmentDesign";
    const hasAbutment =
      !isDesignOnly &&
      (prosthesisIncludesCustomAbutment(prosthesisType) ||
        Boolean(row?.hasCustomAbutment) ||
        Boolean(row?.customAbutment));
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
