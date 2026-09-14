// related files:
// - web/frontend/src/shared/practice/prosthesisFollowUp.ts
// - web/frontend/src/shared/practice/practiceTransferFeeQuote.ts
// - web/frontend/src/shared/components/practice/PracticeTransferFeeEstimate.tsx
// - 2026-09-15: 임시치아 단계 / 지르 보철 단계별 원래 기공비 섹션.
import {
  baseToothWorksForDetailChart,
  hasPartialProsthesisFollowUp,
  isFinalProsthesisType,
  isFollowUpProsthesisPhase,
  pickSourceTempRowsForFollowUpCredit,
  type ProsthesisFollowUpRecord,
} from "@/shared/practice/prosthesisFollowUp";
import {
  buildFeeQuoteFromContext,
  type PracticeTransferFeeQuote,
  type PracticeTransferQuoteContext,
} from "@/shared/practice/practiceTransferFeeQuote";
import type { PracticeTransferFeeLine } from "@/shared/practice/labFeeSchedule";
import type { ToothWorkSelection } from "@/shared/practice/transferMemo";

export type PracticeFeeStageSection = {
  key: string;
  /** 예: 임시치아 단계 · 지르 보철 단계 */
  title: string;
  lines: PracticeTransferFeeLine[];
  /** 단계 소계(지르는 차감 후 순증분) */
  subtotal: number;
  /** 지르 단계 — 원 임시치아 기공비 차감 */
  tempCreditLabFeeTotal?: number;
};

const activeFollowUpRecords = (
  followUps: ReadonlyArray<ProsthesisFollowUpRecord> | null | undefined,
) =>
  (Array.isArray(followUps) ? followUps : []).filter(
    (row) => !String(row?.canceledAt || "").trim(),
  );

const followUpRowsFromToothWorks = (
  toothWorks: ReadonlyArray<Partial<ToothWorkSelection>>,
) =>
  toothWorks.filter(
    (row) =>
      isFollowUpProsthesisPhase(row) &&
      isFinalProsthesisType(String(row.prosthesisType || "")),
  ) as ToothWorkSelection[];

const rowsForFollowUpRecord = (
  followUpRows: ToothWorkSelection[],
  record: ProsthesisFollowUpRecord,
): ToothWorkSelection[] => {
  const teeth = new Set(
    (Array.isArray(record.toothNumbers) ? record.toothNumbers : [])
      .map((t) => String(t || "").trim())
      .filter(Boolean),
  );
  if (teeth.size === 0) return followUpRows;
  return followUpRows.filter((row) => {
    const anchor = String(row.toothNumber || "").trim();
    if (teeth.has(anchor)) return true;
    const linked = Array.isArray(row.bridgeLinkedTeeth)
      ? row.bridgeLinkedTeeth
      : [];
    return linked.some((t) => teeth.has(String(t || "").trim()));
  });
};

/**
 * 후속 지르가 있으면 단계별 원래 기공비 섹션을 만든다.
 * - 임시치아 단계: 원 임시치아(+CA) 전체 견적
 * - 지르 보철 단계(건별): 브리지/크라운 수가 − 해당 임시치아 차감 = 순증분
 * 없으면 null → 기존 단일 테이블 유지.
 */
export const buildProsthesisFollowUpFeeStages = (input: {
  toothWorks?: ReadonlyArray<Partial<ToothWorkSelection>> | null;
  prosthesisFollowUps?: ReadonlyArray<ProsthesisFollowUpRecord> | null;
  context?: PracticeTransferQuoteContext | null;
}): PracticeFeeStageSection[] | null => {
  const toothWorks = Array.isArray(input.toothWorks) ? [...input.toothWorks] : [];
  if (toothWorks.length === 0) return null;

  const followUpRows = followUpRowsFromToothWorks(toothWorks);
  const records = activeFollowUpRecords(input.prosthesisFollowUps);
  if (followUpRows.length === 0 && records.length === 0) return null;

  const baseRows = baseToothWorksForDetailChart(toothWorks);
  const stage1Quote = buildFeeQuoteFromContext({
    toothWorks: baseRows as ToothWorkSelection[],
    context: input.context,
  });

  const stages: PracticeFeeStageSection[] = [
    {
      key: "temp",
      title: "임시치아 단계",
      lines: Array.isArray(stage1Quote.lines) ? stage1Quote.lines : [],
      subtotal: Math.max(0, Math.round(Number(stage1Quote.total || 0))),
    },
  ];

  const recordsToRender =
    records.length > 0
      ? records
      : [
          {
            followUpIndex: 0,
            toothNumbers: followUpRows.flatMap((row) => {
              const linked = Array.isArray(row.bridgeLinkedTeeth)
                ? row.bridgeLinkedTeeth
                : [];
              if (linked.length > 0) {
                return linked.map((t) => String(t || "").trim()).filter(Boolean);
              }
              return [String(row.toothNumber || "").trim()].filter(Boolean);
            }),
            billingDelta: null,
          } satisfies ProsthesisFollowUpRecord,
        ];

  for (const record of recordsToRender) {
    const rows = rowsForFollowUpRecord(followUpRows, record);
    if (rows.length === 0) continue;
    const creditRows = pickSourceTempRowsForFollowUpCredit(baseRows, rows);
    const grossQuote = buildFeeQuoteFromContext({
      toothWorks: rows,
      context: input.context,
      skipAbutmentFees: true,
      creditToothWorks: creditRows as ToothWorkSelection[],
    });

    const delta = record.billingDelta;
    const tempCredit =
      delta?.tempCreditLabFeeTotal != null
        ? Math.max(0, Math.round(Number(delta.tempCreditLabFeeTotal)))
        : Math.max(0, Math.round(Number(grossQuote.tempCreditLabFeeTotal || 0)));
    const subtotal =
      delta?.labFeeTotal != null
        ? Math.max(0, Math.round(Number(delta.labFeeTotal)))
        : Math.max(0, Math.round(Number(grossQuote.total || 0)));

    const idx =
      record.followUpIndex != null && Number.isFinite(Number(record.followUpIndex))
        ? Number(record.followUpIndex)
        : stages.length - 1;
    stages.push({
      key: `zirconia-${idx}`,
      title: recordsToRender.length > 1 ? `지르 보철 단계 ${idx + 1}` : "지르 보철 단계",
      lines: Array.isArray(grossQuote.lines) ? grossQuote.lines : [],
      subtotal,
      tempCreditLabFeeTotal: tempCredit > 0 ? tempCredit : undefined,
    });
  }

  return stages.length > 1 ? stages : null;
};

export const feeStagesConfirmedLabel = (
  toothWorks?: ReadonlyArray<Partial<ToothWorkSelection>> | null,
) => (hasPartialProsthesisFollowUp(toothWorks) ? "변경 기공비" : null);

/** 단계 소계 합이 케이스 total과 맞는지(표시용, 느슨한 검증) */
export const sumFeeStageSubtotals = (
  stages: ReadonlyArray<PracticeFeeStageSection> | null | undefined,
) =>
  (Array.isArray(stages) ? stages : []).reduce(
    (sum, stage) => sum + Math.max(0, Math.round(Number(stage.subtotal || 0))),
    0,
  );

export const mergeCaseTotalWithStages = (
  quote: PracticeTransferFeeQuote | null | undefined,
  stages: ReadonlyArray<PracticeFeeStageSection> | null | undefined,
) => {
  const fromQuote = Math.max(0, Math.round(Number(quote?.total || 0)));
  if (fromQuote > 0) return fromQuote;
  return sumFeeStageSubtotals(stages);
};
