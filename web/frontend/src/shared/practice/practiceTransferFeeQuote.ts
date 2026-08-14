// related files:
// - web/frontend/src/shared/practice/labFeeSchedule.ts
// - web/frontend/src/shared/components/practice/PracticeTransferFeeEstimate.tsx
// - 2026-08-13: 저장된 견적 라인도 치아번호 10→20→30→40번대 순.
// - 2026-08-14: 환봉 단가 0원(별도 고지) 라인도 파싱.
// - 2026-08-14: 환봉 요청중은 기공소 어벗 라인(labAbutmentFee)으로 파싱.
import {
  attachLabFeeMinToLines,
  computePracticeTransferRetailFees,
  DEFAULT_ABUTMENT_RETAIL_PRICE,
  LAB_FEE_SCHEDULE_ZEROS,
  normalizeLabFeeItems,
  normalizeLabFeeMultiplier,
  normalizeLabFeeRemakeSchedule,
  normalizeLabFeeSchedule,
  sortPracticeTransferFeeLines,
  splitPracticeTransferSettlement,
  type LabFeeItem,
  type LabFeeSchedule,
  type PracticeTransferFeeLine,
  type PracticeTransferRetailFees,
} from "@/shared/practice/labFeeSchedule";
import {
  normalizeAbutsAbutmentCreditPrices,
  type AbutsAbutmentCreditPrices,
  type AbutsAbutmentPricingTier,
} from "@/shared/pricing/abutsAbutmentService";

import {
  normalizePracticeTransferAutoMatchBudget,
  resolveAutoMatchBudgetOrDefaults,
  AUTO_MATCH_BUDGET_KEYS,
  type PracticeTransferAutoMatchBudget,
} from "@/shared/practice/autoMatchBudget";

export {
  normalizePracticeTransferAutoMatchBudget,
  type PracticeTransferAutoMatchBudget,
} from "@/shared/practice/autoMatchBudget";

export { sortPracticeTransferFeeLines };

export type PracticeTransferRelationshipKind = "active" | "referred" | "none";

export type PracticeTransferFeeQuote = PracticeTransferRetailFees & {
  relationshipKind: PracticeTransferRelationshipKind;
  feeRateApplied: number;
  labSettlementAmount: number;
  abutsRevenueAmount: number;
  labFeeMultiplier?: number;
  billed?: boolean;
  usedDefaultSchedule?: boolean;
  /** 지정 기공소 마스터 스위치. 자동매칭(기공소 없음)은 true */
  labFeeConfigured?: boolean;
  isRemake?: boolean;
  remakeFeeQuote?: PracticeTransferFeeQuote | null;
  /** 자동매칭 기공비 예산(항목별). 합산 minLabFee/maxLabFee가 있으면 구간 표시 */
  autoMatchBudget?: PracticeTransferAutoMatchBudget | null;
};

export type PracticeTransferFeeQuoteViewer = "practice" | "lab";

export type PracticeTransferQuoteContext = {
  schedule: LabFeeSchedule;
  remakeSchedule: LabFeeSchedule;
  items: LabFeeItem[];
  abutmentRetailPrice: number;
  abutmentPricingTier: AbutsAbutmentPricingTier;
  abutmentPrices: AbutsAbutmentCreditPrices;
  relationshipKind: PracticeTransferRelationshipKind;
  feeRateApplied: number;
  labFeeMultiplier: number;
  usedDefaultSchedule: boolean;
  labFeeConfigured: boolean;
  autoMatchBudget?: PracticeTransferAutoMatchBudget | null;
};

export const DEFAULT_QUOTE_CONTEXT: PracticeTransferQuoteContext = {
  schedule: LAB_FEE_SCHEDULE_ZEROS,
  remakeSchedule: LAB_FEE_SCHEDULE_ZEROS,
  items: normalizeLabFeeItems(LAB_FEE_SCHEDULE_ZEROS),
  abutmentRetailPrice: 0,
  abutmentPricingTier: "regular",
  abutmentPrices: normalizeAbutsAbutmentCreditPrices(),
  relationshipKind: "none",
  feeRateApplied: 0,
  labFeeMultiplier: 1,
  usedDefaultSchedule: true,
  labFeeConfigured: true,
  autoMatchBudget: null,
};

const toRelationshipKind = (value: unknown): PracticeTransferRelationshipKind =>
  value === "active" || value === "referred" ? value : "none";

export const parsePracticeTransferFeeQuote = (
  raw: unknown,
): PracticeTransferFeeQuote | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const total = Math.max(0, Math.round(Number(r.total || 0)));
  const labFeeTotal = Math.max(0, Math.round(Number(r.labFeeTotal || 0)));
  const labAbutmentTotal = Math.max(
    0,
    Math.round(Number(r.labAbutmentTotal || 0)),
  );
  const abutmentRetailTotal = Math.max(
    0,
    Math.round(Number(r.abutmentRetailTotal || 0)),
  );
  const feeRateApplied = Number(r.feeRateApplied || 0);
  const labSettlementAmount = Math.max(
    0,
    Math.round(Number(r.labSettlementAmount || 0)),
  );
  const abutsRevenueAmount = Math.max(
    0,
    Math.round(
      Number(
        r.abutsRevenueAmount != null
          ? r.abutsRevenueAmount
          : total - labSettlementAmount,
      ),
    ),
  );
  const linesRaw = Array.isArray(r.lines) ? r.lines : [];
  const lines: PracticeTransferFeeLine[] = sortPracticeTransferFeeLines(
    linesRaw
      .map((row) => {
        const item = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
        const labAbutmentFee = Math.max(
          0,
          Math.round(Number(item.labAbutmentFee || 0)),
        );
        const abutmentRetailNote =
          item.abutmentRetailNote === "quote" ? ("quote" as const) : undefined;
        const labFeeMinRaw = item.labFeeMin;
        const labFeeMin =
          labFeeMinRaw != null && Number.isFinite(Number(labFeeMinRaw))
            ? Math.max(0, Math.round(Number(labFeeMinRaw)))
            : undefined;
        return {
          toothNumber: String(item.toothNumber || item.tooth || "").trim(),
          prosthesisType: String(item.prosthesisType || item.type || "").trim(),
          labFee: Math.max(0, Math.round(Number(item.labFee || 0))),
          ...(labFeeMin != null ? { labFeeMin } : {}),
          labAbutmentFee,
          labAbutmentPending: Boolean(item.labAbutmentPending) || labAbutmentFee > 0,
          abutmentRetail: Math.max(0, Math.round(Number(item.abutmentRetail || 0))),
          abutmentRetailNote,
        };
      })
      .filter(
        (line) =>
          line.prosthesisType ||
          line.labFee > 0 ||
          line.labAbutmentFee > 0 ||
          line.labAbutmentPending ||
          line.abutmentRetail > 0 ||
          line.abutmentRetailNote === "quote",
      ),
  );

  return {
    labFeeTotal,
    labAbutmentTotal,
    labAbutmentPending:
      Boolean(r.labAbutmentPending) ||
      labAbutmentTotal > 0 ||
      lines.some((line) => line.labAbutmentPending),
    abutmentQuotePending:
      Boolean(r.abutmentQuotePending) ||
      lines.some((line) => line.abutmentRetailNote === "quote"),
    abutmentRetailTotal,
    abutmentQty: Math.max(0, Math.round(Number(r.abutmentQty || 0))),
    total,
    lines,
    relationshipKind: toRelationshipKind(r.relationshipKind),
    feeRateApplied: Number.isFinite(feeRateApplied) ? Math.min(1, Math.max(0, feeRateApplied)) : 0,
    labFeeMultiplier: normalizeLabFeeMultiplier(r.labFeeMultiplier),
    labSettlementAmount,
    abutsRevenueAmount,
    billed: Boolean(r.billed),
    usedDefaultSchedule: Boolean(r.usedDefaultSchedule),
    labFeeConfigured: r.labFeeConfigured !== false,
    isRemake: Boolean(r.isRemake),
    remakeFeeQuote:
      r.remakeFeeQuote && typeof r.remakeFeeQuote === "object"
        ? parsePracticeTransferFeeQuote(r.remakeFeeQuote)
        : null,
    autoMatchBudget: normalizePracticeTransferAutoMatchBudget(r.autoMatchBudget),
  };
};

export const parsePracticeTransferQuoteContext = (
  raw: unknown,
): PracticeTransferQuoteContext => {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const scheduleRaw =
    r.schedule && typeof r.schedule === "object"
      ? (r.schedule as Partial<LabFeeSchedule>)
      : null;
  const feeRateApplied = Number(r.feeRateApplied);
  const usedDefaultSchedule = Boolean(r.usedDefaultSchedule);
  const abutmentPricingTier: AbutsAbutmentPricingTier =
    r.abutmentPricingTier === "membership" ? "membership" : "regular";
  const remakeRaw =
    r.remakeSchedule && typeof r.remakeSchedule === "object"
      ? (r.remakeSchedule as Partial<LabFeeSchedule>)
      : r.remake && typeof r.remake === "object"
        ? (r.remake as Partial<LabFeeSchedule>)
        : null;
  return {
    schedule: usedDefaultSchedule
      ? LAB_FEE_SCHEDULE_ZEROS
      : normalizeLabFeeSchedule(scheduleRaw),
    remakeSchedule: usedDefaultSchedule
      ? LAB_FEE_SCHEDULE_ZEROS
      : normalizeLabFeeRemakeSchedule(remakeRaw),
    items: usedDefaultSchedule
      ? normalizeLabFeeItems(LAB_FEE_SCHEDULE_ZEROS)
      : normalizeLabFeeItems(
          scheduleRaw && typeof scheduleRaw === "object" && "items" in scheduleRaw
            ? scheduleRaw
            : { ...(scheduleRaw || {}), remake: remakeRaw, items: (r as { items?: LabFeeItem[] }).items },
        ),
    abutmentRetailPrice: usedDefaultSchedule
      ? 0
      : Math.max(
          0,
          Math.round(
            Number(r.abutmentRetailPrice ?? DEFAULT_ABUTMENT_RETAIL_PRICE),
          ) || DEFAULT_ABUTMENT_RETAIL_PRICE,
        ),
    abutmentPricingTier,
    abutmentPrices: normalizeAbutsAbutmentCreditPrices(
      r.abutmentPrices && typeof r.abutmentPrices === "object"
        ? (r.abutmentPrices as Partial<AbutsAbutmentCreditPrices>)
        : null,
    ),
    relationshipKind: toRelationshipKind(r.relationshipKind),
    feeRateApplied: usedDefaultSchedule
      ? 0
      : Number.isFinite(feeRateApplied)
        ? Math.min(1, Math.max(0, feeRateApplied))
        : 0,
    labFeeMultiplier: usedDefaultSchedule
      ? 1
      : normalizeLabFeeMultiplier(r.labFeeMultiplier),
    usedDefaultSchedule,
    labFeeConfigured: usedDefaultSchedule ? true : r.labFeeConfigured !== false,
    autoMatchBudget: normalizePracticeTransferAutoMatchBudget(r.autoMatchBudget),
  };
};

export const buildFeeQuoteFromContext = (params: {
  toothWorks?: Parameters<typeof computePracticeTransferRetailFees>[0]["toothWorks"];
  implantFavorites?: Parameters<typeof computePracticeTransferRetailFees>[0]["implantFavorites"];
  context?: PracticeTransferQuoteContext | null;
  autoMatchBudget?: PracticeTransferAutoMatchBudget | null;
}): PracticeTransferFeeQuote => {
  const context = params.context || DEFAULT_QUOTE_CONTEXT;
  const zeroed = Boolean(context.usedDefaultSchedule);
  const labFeeMultiplier = normalizeLabFeeMultiplier(context.labFeeMultiplier);
  const budgetRaw =
    params.autoMatchBudget !== undefined
      ? params.autoMatchBudget
      : context.autoMatchBudget || null;
  const budget = zeroed
    ? resolveAutoMatchBudgetOrDefaults(budgetRaw)
    : normalizePracticeTransferAutoMatchBudget(budgetRaw);

  const scheduleFromBudget = (side: "min" | "max") => {
    const schedule: Partial<LabFeeSchedule> = {};
    if (!budget) return LAB_FEE_SCHEDULE_ZEROS;
    for (const key of AUTO_MATCH_BUDGET_KEYS) {
      const band = budget.items[key];
      schedule[key] = side === "min" ? band.min : band.max;
    }
    return schedule as LabFeeSchedule;
  };

  const fees = computePracticeTransferRetailFees({
    toothWorks: params.toothWorks,
    implantFavorites: params.implantFavorites,
    labFeeSchedule: zeroed
      ? scheduleFromBudget("max")
      : { ...context.schedule, remake: context.remakeSchedule, items: context.items },
    abutmentPricingTier: context.abutmentPricingTier,
    abutmentPrices: context.abutmentPrices,
    labFeeMultiplier: zeroed ? 1 : labFeeMultiplier,
  });
  const feeRateApplied = Number(context.feeRateApplied || 0);
  let autoMatchBudgetOut: PracticeTransferAutoMatchBudget | null = null;
  let lines = fees.lines;
  if (zeroed && budget) {
    const minFees = computePracticeTransferRetailFees({
      toothWorks: params.toothWorks,
      implantFavorites: params.implantFavorites,
      labFeeSchedule: scheduleFromBudget("min"),
      abutmentPricingTier: context.abutmentPricingTier,
      abutmentPrices: context.abutmentPrices,
      skipAbutmentFees: true,
      labFeeMultiplier: 1,
    });
    lines = attachLabFeeMinToLines(fees.lines, minFees.lines);
    autoMatchBudgetOut = {
      ...budget,
      minLabFee: minFees.labFeeTotal,
      maxLabFee: fees.labFeeTotal,
    };
  }
  const settlement = splitPracticeTransferSettlement({
    labFeeTotal: fees.labFeeTotal,
    abutmentRetailTotal: fees.abutmentRetailTotal,
    feeRateApplied,
  });
  return {
    ...fees,
    lines,
    relationshipKind: context.relationshipKind,
    feeRateApplied,
    labFeeMultiplier: zeroed ? 1 : labFeeMultiplier,
    labSettlementAmount: settlement.labSettlementAmount,
    abutsRevenueAmount: settlement.abutsRevenueAmount,
    billed: false,
    usedDefaultSchedule: zeroed,
    labFeeConfigured: context.labFeeConfigured !== false,
    autoMatchBudget: autoMatchBudgetOut,
  };
};

export const formatWon = (value: number) =>
  `${Math.max(0, Math.round(Number(value || 0))).toLocaleString("ko-KR")}원`;

export const formatFeeRatePct = (rate: number) => {
  const pct = Math.round(Number(rate || 0) * 1000) / 10;
  return `${pct}%`;
};
