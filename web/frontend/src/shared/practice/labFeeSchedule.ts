// related files:
// - web/backend/utils/labFeeSchedule.js
// - web/frontend/src/shared/pricing/abutsAbutmentService.ts
// - web/frontend/src/shared/practice/practiceTransferFeeQuote.ts
// - web/frontend/src/features/settings/tabs/LabFeeScheduleTab.tsx
import {
  ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE,
  ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  ABUTS_ABUTMENT_REGULAR_DESIGN_AND_PRODUCTION_PRICE,
  ABUTS_ABUTMENT_REGULAR_PRODUCTION_PRICE,
  type AbutsAbutmentPricingTier,
} from "@/shared/pricing/abutsAbutmentService";

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

/** 리메이크 수가. 미설정 시 0원 */
export const LAB_FEE_REMAKE_SCHEDULE_DEFAULTS: LabFeeSchedule = {
  ...LAB_FEE_SCHEDULE_ZEROS,
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

export const isCustomAbutmentProsthesisType = (prosthesisType: string) => {
  const raw = String(prosthesisType || "").trim();
  const compact = raw.replace(/\s+/g, "");
  return (
    compact === "커스텀어벗" ||
    /^(?:커스텀)?어벗디자인$/i.test(compact) ||
    /^custom\s*abut(?:ment)?$/i.test(raw)
  );
};

export const isCustomAbutmentWork = (row?: {
  prosthesisType?: string;
  type?: string;
  customAbutment?: boolean;
  hasCustomAbutment?: boolean;
} | null) => {
  const prosthesisType = String(row?.prosthesisType || row?.type || "").trim();
  if (!prosthesisType || isMissingToothProsthesisType(prosthesisType)) return false;
  if (/^pontic$/i.test(prosthesisType)) return false;
  return (
    isCustomAbutmentProsthesisType(prosthesisType) ||
    Boolean(row?.hasCustomAbutment) ||
    Boolean(row?.customAbutment)
  );
};

/** 보철 형태 → labFeeSchedule 키. 작업X·커스텀어벗(어벗츠 단가)은 null */
export const resolveLabFeeKeyFromProsthesisType = (
  prosthesisType: string,
): LabFeeScheduleKey | null => {
  const raw = String(prosthesisType || "").trim();
  if (!raw) return "crown";
  if (isMissingToothProsthesisType(raw)) return null;
  if (isCustomAbutmentProsthesisType(raw)) return null;
  if (/^pontic$/i.test(raw)) return "pontic";
  if (raw.includes("인레이") || /^inlay$/i.test(raw)) return "inlay";
  if (raw.includes("브리지") || /^bridge$/i.test(raw)) return "bridge";
  if (raw.includes("크라운") || /^crown$/i.test(raw)) return "crown";
  return "crown";
};

export const prosthesisIncludesCustomAbutment = (prosthesisType: string) =>
  isCustomAbutmentProsthesisType(prosthesisType);

export const resolveRemakeLabFeeKey = (row?: {
  prosthesisType?: string;
  type?: string;
  customAbutment?: boolean;
  hasCustomAbutment?: boolean;
  abutmentProductMode?: string;
  productMode?: string;
} | null): LabFeeScheduleKey | null => {
  const prosthesisType = String(row?.prosthesisType || row?.type || "").trim();
  if (!prosthesisType || isMissingToothProsthesisType(prosthesisType)) return null;
  if (isCustomAbutmentWork(row)) {
    const mode = String(row?.abutmentProductMode || row?.productMode || "").trim();
    if (mode === "design_custom_abutment" || /어벗\s*디자인/i.test(prosthesisType)) {
      return "customAbutmentDesign";
    }
    return "customAbutmentDesignAndProduction";
  }
  return resolveLabFeeKeyFromProsthesisType(prosthesisType);
};

export const resolveAbutsAbutmentUnitPrice = (args: {
  productMode?: string | null;
  pricingTier?: AbutsAbutmentPricingTier | null;
}) => {
  const isDesign = String(args.productMode || "").trim() === "design_custom_abutment";
  const membership = args.pricingTier === "membership";
  if (isDesign) {
    return membership
      ? ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE
      : ABUTS_ABUTMENT_REGULAR_DESIGN_AND_PRODUCTION_PRICE;
  }
  return membership
    ? ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE
    : ABUTS_ABUTMENT_REGULAR_PRODUCTION_PRICE;
};

export const splitPracticeTransferSettlement = (args: {
  labFeeTotal: number;
  abutmentRetailTotal: number;
  feeRateApplied: number;
}) => {
  const labFees = Math.max(0, Math.round(Number(args.labFeeTotal || 0)));
  const abutment = Math.max(0, Math.round(Number(args.abutmentRetailTotal || 0)));
  const rate = Number(args.feeRateApplied || 0);
  const clampedRate = Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : 0;
  const abutsFromLab = Math.round(labFees * clampedRate);
  return {
    labSettlementAmount: Math.max(0, labFees - abutsFromLab),
    abutsRevenueAmount: abutsFromLab + abutment,
    total: labFees + abutment,
  };
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

export const normalizeLabFeeRemakeSchedule = (
  input?: Partial<LabFeeSchedule> | { remake?: Partial<LabFeeSchedule> | null } | null,
): LabFeeSchedule => {
  const raw = input && typeof input === "object" ? input : {};
  const src =
    "remake" in raw && raw.remake && typeof raw.remake === "object"
      ? raw.remake
      : ("enabled" in raw || "updatedAt" in raw
          ? {}
          : (raw as Partial<LabFeeSchedule>));
  const pick = (key: LabFeeScheduleKey) => {
    const n = Math.round(Number(src[key] ?? LAB_FEE_REMAKE_SCHEDULE_DEFAULTS[key]));
    return Number.isFinite(n) && n >= 0 ? n : LAB_FEE_REMAKE_SCHEDULE_DEFAULTS[key];
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
    abutmentProductMode?: string;
    productMode?: string;
  }> | null;
  labFeeSchedule?: Partial<LabFeeSchedule> | null;
  abutmentPricingTier?: AbutsAbutmentPricingTier | null;
  remake?: boolean;
  skipAbutmentFees?: boolean;
}): PracticeTransferRetailFees => {
  const useRemake = Boolean(params.remake);
  const schedule = useRemake
    ? normalizeLabFeeRemakeSchedule(params.labFeeSchedule)
    : normalizeLabFeeSchedule(params.labFeeSchedule);
  const waiveAbutment = Boolean(useRemake || params.skipAbutmentFees);
  const pricingTier: AbutsAbutmentPricingTier =
    params.abutmentPricingTier === "membership" ? "membership" : "regular";
  const rows = Array.isArray(params.toothWorks) ? params.toothWorks : [];
  const lines: PracticeTransferFeeLine[] = [];
  let labFeeTotal = 0;
  let abutmentRetailTotal = 0;
  let abutmentQty = 0;

  for (const row of rows) {
    const prosthesisType = String(row?.prosthesisType || row?.type || "").trim();
    if (!prosthesisType) continue;
    if (isMissingToothProsthesisType(prosthesisType)) continue;

    let labFee = 0;
    let abutmentFee = 0;
    if (useRemake) {
      const feeKey = resolveRemakeLabFeeKey(row);
      if (!feeKey) continue;
      labFee = Math.max(0, Math.round(Number(schedule[feeKey] || 0)));
    } else if (isCustomAbutmentWork(row)) {
      abutmentFee = waiveAbutment
        ? 0
        : resolveAbutsAbutmentUnitPrice({
            productMode: row?.abutmentProductMode || row?.productMode,
            pricingTier,
          });
    } else {
      const feeKey = resolveLabFeeKeyFromProsthesisType(prosthesisType);
      if (!feeKey) continue;
      labFee = Math.max(0, Math.round(Number(schedule[feeKey] || 0)));
    }

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
