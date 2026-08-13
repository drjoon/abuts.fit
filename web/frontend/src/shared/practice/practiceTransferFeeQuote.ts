// related files:
// - web/frontend/src/shared/practice/labFeeSchedule.ts
// - web/frontend/src/shared/components/practice/PracticeTransferFeeEstimate.tsx
import {
  computePracticeTransferRetailFees,
  DEFAULT_ABUTMENT_RETAIL_PRICE,
  LAB_FEE_SCHEDULE_ZEROS,
  normalizeLabFeeSchedule,
  type LabFeeSchedule,
  type PracticeTransferFeeLine,
  type PracticeTransferRetailFees,
} from "@/shared/practice/labFeeSchedule";

export type PracticeTransferRelationshipKind = "active" | "referred" | "none";

export type PracticeTransferFeeQuote = PracticeTransferRetailFees & {
  relationshipKind: PracticeTransferRelationshipKind;
  feeRateApplied: number;
  labSettlementAmount: number;
  abutsRevenueAmount: number;
  billed?: boolean;
  usedDefaultSchedule?: boolean;
};

export type PracticeTransferFeeQuoteViewer = "practice" | "lab";

export type PracticeTransferQuoteContext = {
  schedule: LabFeeSchedule;
  abutmentRetailPrice: number;
  relationshipKind: PracticeTransferRelationshipKind;
  feeRateApplied: number;
  usedDefaultSchedule: boolean;
};

export const DEFAULT_QUOTE_CONTEXT: PracticeTransferQuoteContext = {
  schedule: LAB_FEE_SCHEDULE_ZEROS,
  abutmentRetailPrice: 0,
  relationshipKind: "none",
  feeRateApplied: 0,
  usedDefaultSchedule: true,
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
  const lines: PracticeTransferFeeLine[] = linesRaw
    .map((row) => {
      const item = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      return {
        toothNumber: String(item.toothNumber || item.tooth || "").trim(),
        prosthesisType: String(item.prosthesisType || item.type || "").trim(),
        labFee: Math.max(0, Math.round(Number(item.labFee || 0))),
        abutmentRetail: Math.max(0, Math.round(Number(item.abutmentRetail || 0))),
      };
    })
    .filter((line) => line.prosthesisType || line.labFee > 0 || line.abutmentRetail > 0);

  return {
    labFeeTotal,
    abutmentRetailTotal,
    abutmentQty: Math.max(0, Math.round(Number(r.abutmentQty || 0))),
    total,
    lines,
    relationshipKind: toRelationshipKind(r.relationshipKind),
    feeRateApplied: Number.isFinite(feeRateApplied) ? Math.min(1, Math.max(0, feeRateApplied)) : 0,
    labSettlementAmount,
    abutsRevenueAmount,
    billed: Boolean(r.billed),
    usedDefaultSchedule: Boolean(r.usedDefaultSchedule),
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
  return {
    schedule: usedDefaultSchedule
      ? LAB_FEE_SCHEDULE_ZEROS
      : normalizeLabFeeSchedule(scheduleRaw),
    abutmentRetailPrice: usedDefaultSchedule
      ? 0
      : Math.max(
          0,
          Math.round(
            Number(r.abutmentRetailPrice ?? DEFAULT_ABUTMENT_RETAIL_PRICE),
          ) || DEFAULT_ABUTMENT_RETAIL_PRICE,
        ),
    relationshipKind: toRelationshipKind(r.relationshipKind),
    feeRateApplied: usedDefaultSchedule
      ? 0
      : Number.isFinite(feeRateApplied)
        ? Math.min(1, Math.max(0, feeRateApplied))
        : 0,
    usedDefaultSchedule,
  };
};

export const buildFeeQuoteFromContext = (params: {
  toothWorks?: Parameters<typeof computePracticeTransferRetailFees>[0]["toothWorks"];
  context?: PracticeTransferQuoteContext | null;
}): PracticeTransferFeeQuote => {
  const context = params.context || DEFAULT_QUOTE_CONTEXT;
  const zeroed = Boolean(context.usedDefaultSchedule);
  const fees = computePracticeTransferRetailFees({
    toothWorks: params.toothWorks,
    labFeeSchedule: zeroed ? LAB_FEE_SCHEDULE_ZEROS : context.schedule,
    abutmentRetailPrice: zeroed ? 0 : context.abutmentRetailPrice,
  });
  const feeRateApplied = Number(context.feeRateApplied || 0);
  const abutsRevenueAmount = Math.round(fees.total * feeRateApplied);
  return {
    ...fees,
    relationshipKind: context.relationshipKind,
    feeRateApplied,
    labSettlementAmount: Math.max(0, fees.total - abutsRevenueAmount),
    abutsRevenueAmount,
    billed: false,
    usedDefaultSchedule: Boolean(context.usedDefaultSchedule),
  };
};

export const formatWon = (value: number) =>
  `${Math.max(0, Math.round(Number(value || 0))).toLocaleString("ko-KR")}원`;

export const formatFeeRatePct = (rate: number) => {
  const pct = Math.round(Number(rate || 0) * 1000) / 10;
  return `${pct}%`;
};
