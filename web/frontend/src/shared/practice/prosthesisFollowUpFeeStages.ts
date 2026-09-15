// related files:
// - web/frontend/src/shared/practice/prosthesisFollowUp.ts
// - web/frontend/src/shared/practice/practiceTransferFeeQuote.ts
// - web/frontend/src/shared/components/practice/PracticeTransferFeeEstimate.tsx
// - 2026-09-15: prosthesisFeeStages 스냅샷 우선 — live 재계산으로 최종 견적에 덮지 않음.
// - 2026-09-15: 임시치아 단계 / 지르 보철 단계별 원래 기공비 섹션.
// - 2026-09-15: 지르 단계는 차감 없이 브리지/크라운 수가(표시). 최종=지르+CA.
import {
  baseToothWorksForDetailChart,
  hasPartialProsthesisFollowUp,
  isFinalProsthesisType,
  isFollowUpProsthesisPhase,
  type ProsthesisFeeStageRecord,
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
  /** 단계 소계(지르=브리지/크라운 수가, 차감 없음) */
  subtotal: number;
  /** @deprecated 표시에서 임시치아 차감 제거. 하위 호환용 */
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

const normalizeStageLines = (
  lines: ProsthesisFeeStageRecord["lines"] | PracticeTransferFeeLine[] | null | undefined,
): PracticeTransferFeeLine[] =>
  (Array.isArray(lines) ? lines : [])
    .map((line) => {
      if (!line || typeof line !== "object") return null;
      const toothNumber = String(line.toothNumber || "").trim();
      const prosthesisType = String(line.prosthesisType || "").trim();
      if (!toothNumber && !prosthesisType) return null;
      return {
        toothNumber,
        prosthesisType,
        labFee: Math.max(0, Math.round(Number(line.labFee || 0))),
        ...(line.labFeeMin != null && Number.isFinite(Number(line.labFeeMin))
          ? { labFeeMin: Math.max(0, Math.round(Number(line.labFeeMin))) }
          : {}),
        labAbutmentFee: Math.max(0, Math.round(Number(line.labAbutmentFee || 0))),
        ...(line.labAbutmentPending ? { labAbutmentPending: true } : {}),
        abutmentRetail: Math.max(0, Math.round(Number(line.abutmentRetail || 0))),
        ...(line.abutmentRetailNote
          ? {
              abutmentRetailNote: line.abutmentRetailNote as PracticeTransferFeeLine["abutmentRetailNote"],
            }
          : {}),
      } satisfies PracticeTransferFeeLine;
    })
    .filter(Boolean) as PracticeTransferFeeLine[];

/** 저장된 단계 스냅샷 → UI 섹션. 라인·소계가 있으면 live 재계산을 쓰지 않는다. */
export const sectionsFromStoredProsthesisFeeStages = (
  stages: ReadonlyArray<ProsthesisFeeStageRecord> | null | undefined,
): PracticeFeeStageSection[] | null => {
  const list = (Array.isArray(stages) ? stages : [])
    .map((row) => {
      const key = String(row?.key || "").trim();
      if (!key) return null;
      const lines = normalizeStageLines(row.lines);
      const subtotal = Math.max(
        0,
        Math.round(Number(row.total ?? row.labFeeTotal ?? 0)),
      );
      if (subtotal <= 0 && lines.length === 0) return null;
      return {
        key,
        title:
          String(row.title || "").trim() ||
          (key === "temp"
            ? "임시치아 단계"
            : key.startsWith("zirconia-")
              ? "지르 보철 단계"
              : key),
        lines,
        subtotal: subtotal > 0 ? subtotal : lines.reduce(
          (sum, line) =>
            sum +
            Math.max(0, Math.round(Number(line.labFee || 0))) +
            Math.max(0, Math.round(Number(line.labAbutmentFee || 0))) +
            Math.max(0, Math.round(Number(line.abutmentRetail || 0))),
          0,
        ),
        tempCreditLabFeeTotal: Math.max(
          0,
          Math.round(Number(row.tempCreditLabFeeTotal || 0)),
        ),
      } satisfies PracticeFeeStageSection;
    })
    .filter(Boolean) as PracticeFeeStageSection[];
  return list.length > 1 ? list : null;
};

/**
 * 후속 지르가 있으면 단계별 기공비 섹션을 만든다.
 * - 저장된 prosthesisFeeStages가 있으면 SSOT(최종 견적으로 덮지 않음)
 * - 없으면 live: 임시치아 단계 = 원 임시치아(+CA), 지르 = 브리지/크라운 수가
 */
export const buildProsthesisFollowUpFeeStages = (input: {
  toothWorks?: ReadonlyArray<Partial<ToothWorkSelection>> | null;
  prosthesisFollowUps?: ReadonlyArray<ProsthesisFollowUpRecord> | null;
  prosthesisFeeStages?: ReadonlyArray<ProsthesisFeeStageRecord> | null;
  context?: PracticeTransferQuoteContext | null;
}): PracticeFeeStageSection[] | null => {
  const fromStored = sectionsFromStoredProsthesisFeeStages(
    input.prosthesisFeeStages,
  );
  if (fromStored) return fromStored;

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

    const storedDeltaLines = normalizeStageLines(record.billingDelta?.lines);
    const grossQuote = buildFeeQuoteFromContext({
      toothWorks: rows,
      context: input.context,
      skipAbutmentFees: true,
    });

    const delta = record.billingDelta;
    // 표시는 차감 전 지르 수가. billingDelta.finalLabFeeTotal 우선.
    const subtotal =
      delta?.finalLabFeeTotal != null
        ? Math.max(0, Math.round(Number(delta.finalLabFeeTotal)))
        : Math.max(
            0,
            Math.round(
              Number(
                grossQuote.finalLabFeeTotal != null
                  ? grossQuote.finalLabFeeTotal
                  : grossQuote.labFeeTotal || grossQuote.total || 0,
              ),
            ),
          );

    const idx =
      record.followUpIndex != null && Number.isFinite(Number(record.followUpIndex))
        ? Number(record.followUpIndex)
        : stages.length - 1;
    stages.push({
      key: `zirconia-${idx}`,
      title: recordsToRender.length > 1 ? `지르 보철 단계 ${idx + 1}` : "지르 보철 단계",
      lines:
        storedDeltaLines.length > 0
          ? storedDeltaLines
          : Array.isArray(grossQuote.lines)
            ? grossQuote.lines
            : [],
      subtotal,
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
