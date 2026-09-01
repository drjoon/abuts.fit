// related files:
// - web/backend/utils/practiceTransferProsthesisFollowUp.js
// - web/frontend/src/shared/practice/transferMemo.ts
// - web/frontend/src/shared/components/practice/PracticeProsthesisFollowUpDialog.tsx
// - 2026-09-01: 임시치아 배송 후 동일 건 크라운/브리지 후속 추가(프론트 SSOT).
import {
  type ToothWorkSelection,
  isCustomAbutmentProsthesisType,
  isTemporaryToothProsthesisType,
  serializeToothWorks,
} from "./transferMemo";

export type PracticeAbutmentDeliveryInfo = {
  deliveredAt?: string | null;
  shippedAt?: string | null;
  pickedUpAt?: string | null;
};

export type ProsthesisFollowUpEligibility = {
  ok: boolean;
  reason?: string;
  message?: string;
};

const FOLLOW_UP_PHASE = "followUp";

export const isFollowUpProsthesisPhase = (
  row?: Partial<ToothWorkSelection> & { prosthesisPhase?: string },
) => String(row?.prosthesisPhase || "").trim() === FOLLOW_UP_PHASE;

export const isFinalProsthesisType = (prosthesisType: string) => {
  const type = String(prosthesisType || "").trim();
  return type === "크라운" || type === "브리지" || type === "인레이";
};

const toToothDecadeSortNumber = (toothNumber: string) => {
  const raw = String(toothNumber || "").trim();
  if (!/^[1-4][1-8]$/.test(raw)) return Number.MAX_SAFE_INTEGER;
  const tens = Number(raw[0]);
  const ones = Number(raw[1]);
  const decadeBase = (tens - 1) * 10;
  if (tens === 1 || tens === 3) return decadeBase + (8 - ones);
  return decadeBase + (ones - 1);
};

const sortTeethFdi = (teeth: string[]) =>
  [...teeth].sort((a, b) => toToothDecadeSortNumber(a) - toToothDecadeSortNumber(b));

const linkedTeethOf = (row: Partial<ToothWorkSelection>) => {
  const self = String(row?.toothNumber || "").trim();
  const linked = Array.isArray(row?.bridgeLinkedTeeth)
    ? row.bridgeLinkedTeeth.map((t) => String(t || "").trim()).filter(Boolean)
    : [];
  if (!self) return sortTeethFdi(linked);
  return sortTeethFdi(Array.from(new Set([self, ...linked])));
};

export const hasFollowUpProsthesisForTooth = (
  toothWorks: Partial<ToothWorkSelection>[],
  toothNumber: string,
) => {
  const tooth = String(toothNumber || "").trim();
  if (!tooth) return false;
  return toothWorks.some((row) => {
    if (!isFollowUpProsthesisPhase(row)) return false;
    if (!isFinalProsthesisType(String(row.prosthesisType || ""))) return false;
    const linked = linkedTeethOf(row);
    return linked.includes(tooth) || String(row?.toothNumber || "").trim() === tooth;
  });
};

export const listPendingFollowUpTempSpans = (
  toothWorks: Partial<ToothWorkSelection>[],
) => {
  const tempRows = toothWorks.filter(
    (row) =>
      isTemporaryToothProsthesisType(String(row.prosthesisType || "")) &&
      !isFollowUpProsthesisPhase(row) &&
      String(row.toothNumber || "").trim(),
  );
  const seen = new Set<string>();
  const spans: Array<{ teeth: string[]; sourceRow: Partial<ToothWorkSelection> }> =
    [];
  for (const row of tempRows) {
    const teeth = linkedTeethOf(row);
    const key = teeth.join("-");
    if (seen.has(key)) continue;
    if (teeth.some((t) => hasFollowUpProsthesisForTooth(toothWorks, t))) continue;
    seen.add(key);
    spans.push({ teeth, sourceRow: row });
  }
  return spans;
};

const cloneRowForFollowUp = (
  sourceRow: Partial<ToothWorkSelection>,
  prosthesisType: string,
  bridgeLinkedTeeth: string[],
): ToothWorkSelection & { prosthesisPhase: string } => {
  const sorted = sortTeethFdi(
    bridgeLinkedTeeth.map((t) => String(t || "").trim()).filter(Boolean),
  );
  return {
    toothNumber: sorted[0] || String(sourceRow?.toothNumber || "").trim(),
    prosthesisType,
    customAbutment: Boolean(sourceRow?.customAbutment),
    bridgeLinkedTeeth: sorted,
    prosthesisPhase: FOLLOW_UP_PHASE,
    abutmentProductMode: sourceRow?.abutmentProductMode,
    implantManufacturer: sourceRow?.implantManufacturer,
    implantBrand: sourceRow?.implantBrand,
    implantFamily: sourceRow?.implantFamily,
    implantType: sourceRow?.implantType,
    implantAddRequest: sourceRow?.implantAddRequest,
    abutmentManufacturer: sourceRow?.abutmentManufacturer,
    abutmentDiameter: sourceRow?.abutmentDiameter,
    abutmentHeight: sourceRow?.abutmentHeight,
  };
};

/** 임시치아 → 후속 크라운/브리지 초안 */
export const buildFollowUpToothWorksDraft = (
  toothWorks: Partial<ToothWorkSelection>[],
): Array<ToothWorkSelection & { prosthesisPhase: string }> => {
  const pending = listPendingFollowUpTempSpans(toothWorks);
  return pending.map(({ teeth, sourceRow }) => {
    const prosthesisType = teeth.length >= 2 ? "브리지" : "크라운";
    return cloneRowForFollowUp(sourceRow, prosthesisType, teeth);
  });
};

export const summarizeFollowUpToothWorks = (
  rows: Partial<ToothWorkSelection>[],
) => {
  return rows
    .map((row) => {
      const type = String(row.prosthesisType || "").trim();
      const teeth = Array.isArray(row.bridgeLinkedTeeth)
        ? row.bridgeLinkedTeeth.join("-")
        : String(row.toothNumber || "").trim();
      return teeth && type ? `${teeth} ${type}` : "";
    })
    .filter(Boolean)
    .join(", ");
};

export const canAppendProsthesisFollowUp = (input: {
  toothWorks?: Partial<ToothWorkSelection>[] | null;
  toothWorksSummary?: string | null;
  requestorDownloadedAt?: string | null;
  resultFileCount?: number | null;
  resultFiles?: unknown[] | null;
  abutmentDeliveryInfo?: PracticeAbutmentDeliveryInfo | null;
  status?: string | null;
  hasCustomAbutment?: boolean | null;
}): ProsthesisFollowUpEligibility => {
  const status = String(input.status || "").trim();
  if (status === "취소" || status === "작업취소") {
    return { ok: false, reason: "canceled", message: "취소된 의뢰입니다." };
  }
  const preAcceptStatuses = new Set([
    "발송완료",
    "수신완료",
    "자동매칭",
    "하청대기",
    "의뢰",
    "거부",
  ]);
  const accepted =
    Boolean(String(input.requestorDownloadedAt || "").trim()) ||
    (Boolean(status) && !preAcceptStatuses.has(status));
  if (!accepted) {
    return {
      ok: false,
      reason: "not_accepted",
      message: "기공소 수락 후에 최종 보철 제작을 의뢰할 수 있습니다.",
    };
  }

  let toothWorks = Array.isArray(input.toothWorks) ? input.toothWorks : [];
  if (toothWorks.length === 0 && input.toothWorksSummary) {
    // summary-only fallback — eligibility only checks temp presence loosely
    const summary = String(input.toothWorksSummary || "");
    if (!summary.includes("임시치아")) {
      return {
        ok: false,
        reason: "no_temp_teeth",
        message: "임시치아 의뢰가 없어 후속 보철을 추가할 수 없습니다.",
      };
    }
  }

  const hasTemp = toothWorks.some((row) =>
    isTemporaryToothProsthesisType(String(row.prosthesisType || "")),
  );
  if (toothWorks.length > 0 && !hasTemp) {
    return {
      ok: false,
      reason: "no_temp_teeth",
      message: "임시치아 의뢰가 없어 후속 보철을 추가할 수 없습니다.",
    };
  }

  if (toothWorks.length > 0) {
    const pending = listPendingFollowUpTempSpans(toothWorks);
    if (pending.length === 0) {
      return {
        ok: false,
        reason: "already_appended",
        message: "이미 모든 임시치아에 대한 후속 보철이 의뢰되었습니다.",
      };
    }
  }

  return { ok: true };
};

export const buildFollowUpSummaryFromTransfer = (input: {
  toothWorks?: Partial<ToothWorkSelection>[] | null;
  toothWorksSummary?: string | null;
}) => {
  const toothWorks = Array.isArray(input.toothWorks) ? input.toothWorks : [];
  if (toothWorks.length > 0) {
    return summarizeFollowUpToothWorks(buildFollowUpToothWorksDraft(toothWorks));
  }
  return String(input.toothWorksSummary || "").trim();
};

export const serializeFollowUpDraft = (rows: Partial<ToothWorkSelection>[]) =>
  serializeToothWorks(rows as ToothWorkSelection[]);

export type ProsthesisFollowUpRecord = {
  appendedAt?: string | null;
  arrivalYmd?: string | null;
  orderYmd?: string | null;
  toothNumbers?: string[];
  followUpIndex?: number;
  previousArrivalYmd?: string | null;
  previousOrderYmd?: string | null;
  labAcceptedAt?: string | null;
  canceledAt?: string | null;
  billingDelta?: { labFeeTotal?: number; total?: number } | null;
};

export const isPendingProsthesisFollowUpRecord = (
  record?: ProsthesisFollowUpRecord | null,
  requestorDownloadedAt?: string | null,
) => {
  if (!record) return false;
  if (record.canceledAt) return false;
  if (!record.labAcceptedAt) return true;
  const mainAcceptedAt = String(requestorDownloadedAt || "").trim();
  const appendedAt = record.appendedAt;
  if (!mainAcceptedAt || !appendedAt) return false;
  const mainMs = new Date(mainAcceptedAt).getTime();
  const appendMs = new Date(appendedAt).getTime();
  if (!Number.isFinite(mainMs) || !Number.isFinite(appendMs)) return false;
  return appendMs >= mainMs;
};

export const getPendingProsthesisFollowUps = (
  followUps?: ProsthesisFollowUpRecord[] | null,
  requestorDownloadedAt?: string | null,
) =>
  (Array.isArray(followUps) ? followUps : []).filter((row) =>
    isPendingProsthesisFollowUpRecord(row, requestorDownloadedAt),
  );

export const canManagePendingProsthesisFollowUp = (input: {
  prosthesisFollowUps?: ProsthesisFollowUpRecord[] | null;
  status?: string | null;
  requestorDownloadedAt?: string | null;
}) => {
  const status = String(input.status || "").trim();
  if (status === "취소" || status === "작업취소") {
    return { ok: false as const, reason: "canceled", message: "취소된 의뢰입니다." };
  }
  const pending = getPendingProsthesisFollowUps(
    input.prosthesisFollowUps,
    input.requestorDownloadedAt,
  );
  if (pending.length === 0) {
    return {
      ok: false as const,
      reason: "no_pending",
      message: "취소·변경할 수 있는 후속 제작이 없습니다.",
    };
  }
  return { ok: true as const, pending };
};

export const getLatestPendingProsthesisFollowUp = (
  followUps?: ProsthesisFollowUpRecord[] | null,
  requestorDownloadedAt?: string | null,
) => {
  const pending = getPendingProsthesisFollowUps(
    followUps,
    requestorDownloadedAt,
  );
  if (pending.length === 0) return null;
  return [...pending].sort(
    (a, b) => Number(b.followUpIndex || 0) - Number(a.followUpIndex || 0),
  )[0];
};
