// related files:
// - web/backend/utils/labFeeSchedule.js
// - web/frontend/src/shared/practice/practiceTransferFeeQuote.ts
// - web/frontend/src/features/settings/tabs/LabFeeScheduleTab.tsx

export const LAB_FEE_SCHEDULE_KEYS = [
  "crown",
  "bridge",
  "inlay",
  "pontic",
  "customAbutmentDesign",
  "customAbutmentDesignAndProduction",
] as const;

export type LabFeeScheduleKey = (typeof LAB_FEE_SCHEDULE_KEYS)[number];

export type LabFeeSchedule = Record<LabFeeScheduleKey, number>;

export const LAB_FEE_SCHEDULE_DEFAULTS: LabFeeSchedule = {
  crown: 60000,
  bridge: 60000,
  inlay: 50000,
  pontic: 40000,
  customAbutmentDesign: 10000,
  customAbutmentDesignAndProduction: 35000,
};

/** 기공소 미지정(자동매칭) 견적 — 기본수가 없음 */
export const LAB_FEE_SCHEDULE_ZEROS: LabFeeSchedule = {
  crown: 0,
  bridge: 0,
  inlay: 0,
  pontic: 0,
  customAbutmentDesign: 0,
  customAbutmentDesignAndProduction: 0,
};

export const DEFAULT_ABUTMENT_RETAIL_PRICE = 40000;

export const isMissingToothProsthesisType = (prosthesisType: string) => {
  const raw = String(prosthesisType || "").trim();
  const compact = raw.replace(/\s+/g, "");
  return (
    raw === "작업X" ||
    raw === "상실치" ||
    compact.toLowerCase() === "작업x" ||
    /^missing(?:tooth)?$/i.test(compact)
  );
};

export const resolveLabFeeKeyFromProsthesisType = (
  prosthesisType: string,
): LabFeeScheduleKey | null => {
  const raw = String(prosthesisType || "").trim();
  if (!raw) return "crown";
  if (isMissingToothProsthesisType(raw)) return null;
  if (/어벗\s*디자인/i.test(raw) || /custom\s*abut(?:ment)?\s*design/i.test(raw)) {
    return "customAbutmentDesign";
  }
  if (/^pontic$/i.test(raw)) return "pontic";
  if (raw.includes("인레이") || /^inlay$/i.test(raw)) return "inlay";
  if (raw.includes("브리지") || /^bridge$/i.test(raw)) return "bridge";
  if (raw.includes("크라운") || /^crown$/i.test(raw)) return "crown";
  return "crown";
};

export const prosthesisIncludesCustomAbutment = (prosthesisType: string) => {
  const raw = String(prosthesisType || "").trim();
  if (resolveLabFeeKeyFromProsthesisType(raw) === "customAbutmentDesign") return false;
  return raw.includes("커스텀어벗") || /custom\s*abut/i.test(raw);
};

export const normalizeLabFeeSchedule = (input?: Partial<LabFeeSchedule> | null): LabFeeSchedule => {
  const src = input && typeof input === "object" ? input : {};
  const pick = (key: LabFeeScheduleKey) => {
    const n = Math.round(Number(src[key] ?? LAB_FEE_SCHEDULE_DEFAULTS[key]));
    return Number.isFinite(n) && n >= 0 ? n : LAB_FEE_SCHEDULE_DEFAULTS[key];
  };
  return {
    crown: pick("crown"),
    bridge: pick("bridge"),
    inlay: pick("inlay"),
    pontic: pick("pontic"),
    customAbutmentDesign: pick("customAbutmentDesign"),
    customAbutmentDesignAndProduction: pick("customAbutmentDesignAndProduction"),
  };
};

export type PracticeTransferFeeLine = {
  toothNumber: string;
  prosthesisType: string;
  labFee: number;
  abutmentRetail: number;
};

export type PracticeTransferRetailFees = {
  labFeeTotal: number;
  abutmentRetailTotal: number;
  abutmentQty: number;
  total: number;
  lines: PracticeTransferFeeLine[];
};

export const computePracticeTransferRetailFees = (params: {
  toothWorks?: ReadonlyArray<{
    toothNumber?: string;
    tooth?: string;
    prosthesisType?: string;
    type?: string;
    customAbutment?: boolean;
    hasCustomAbutment?: boolean;
  }> | null;
  labFeeSchedule?: Partial<LabFeeSchedule> | null;
  abutmentRetailPrice?: number | null;
}): PracticeTransferRetailFees => {
  const schedule = normalizeLabFeeSchedule(params.labFeeSchedule);
  const retailUnit = Math.max(0, Math.round(Number(params.abutmentRetailPrice || 0)) || 0);
  const rows = Array.isArray(params.toothWorks) ? params.toothWorks : [];
  const lines: PracticeTransferFeeLine[] = [];
  let labFeeTotal = 0;
  let abutmentRetailTotal = 0;
  let abutmentQty = 0;

  for (const row of rows) {
    const prosthesisType = String(row?.prosthesisType || row?.type || "").trim();
    if (!prosthesisType) continue;
    if (isMissingToothProsthesisType(prosthesisType)) continue;
    const feeKey = resolveLabFeeKeyFromProsthesisType(prosthesisType);
    if (!feeKey) continue;
    const labFee = Math.max(0, Math.round(Number(schedule[feeKey] || 0)));
    const isDesignOnly = feeKey === "customAbutmentDesign";
    const hasAbutment =
      !isDesignOnly &&
      (prosthesisIncludesCustomAbutment(prosthesisType) ||
        Boolean(row?.hasCustomAbutment) ||
        Boolean(row?.customAbutment));
    const abutmentFee =
      hasAbutment && !/^pontic$/i.test(prosthesisType) ? retailUnit : 0;

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
};
