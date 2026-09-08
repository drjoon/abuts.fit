// related files:
// - web/backend/utils/practiceTransferProsthesisFollowUp.js
// - web/frontend/src/shared/practice/transferMemo.ts
// - web/frontend/src/shared/components/practice/PracticeProsthesisFollowUpDialog.tsx
// - 2026-09-01: 임시치아 배송 후 동일 건 크라운/브리지 후속 추가(프론트 SSOT).
// - 2026-09-08: 후속 제작 견적에 원 임시치아 기공비 차감.
// - 2026-09-08: 치식 표시 — 후속 보철+원 임시치아 병존 시 형태는 후속, CA·어벗 스펙은 원치아 행.
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

/** 후속 보철 1단위(크라운·브리지 스팬) 식별 키 */
export const followUpRowSpanKey = (row: Partial<ToothWorkSelection>) =>
  linkedTeethOf(row).join("-");

/** 선택 UI 라벨 — 예: "34, 33 브리지" */
export const formatFollowUpRowLabel = (row: Partial<ToothWorkSelection>) => {
  const teeth = linkedTeethOf(row);
  const type = String(row?.prosthesisType || "").trim();
  if (teeth.length === 0) return type || "보철";
  return `${teeth.join(", ")} ${type}`;
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

/** 어벗·임플란트 표시 필드 — 후속 행이 덮어도 원치아(임시치아) 입력을 유지 */
const DISPLAY_ABUTMENT_SPEC_KEYS = [
  "customAbutment",
  "abutmentProductMode",
  "implantManufacturer",
  "implantBrand",
  "implantFamily",
  "implantType",
  "implantAddRequest",
  "abutmentManufacturer",
  "abutmentDiameter",
  "abutmentHeight",
] as const;

/**
 * 같은 치아에 원 행+후속 행이 있으면:
 * - 보철 형태·연결·phase → 후속 최종 보철
 * - CA 여부·어벗/임플란트 스펙 → 원 행(사용자가 입력한 임시치아 등)
 */
export const mergeToothWorkRowsForChartDisplay = (
  rows: ReadonlyArray<Partial<ToothWorkSelection>>,
): ToothWorkSelection | null => {
  const list = (Array.isArray(rows) ? rows : []).filter((row) => {
    const tooth = String(row?.toothNumber || "").trim();
    return Boolean(row) && /^[1-4][1-8]$/.test(tooth);
  });
  if (list.length === 0) return null;
  if (list.length === 1) return { ...(list[0] as ToothWorkSelection) };

  const followUps = list.filter(
    (row) =>
      isFollowUpProsthesisPhase(row) &&
      isFinalProsthesisType(String(row.prosthesisType || "")),
  );
  const bases = list.filter((row) => !isFollowUpProsthesisPhase(row));
  const followUp = followUps.length > 0 ? followUps[followUps.length - 1] : null;
  const base = bases.length > 0 ? bases[bases.length - 1] : null;

  if (followUp && base) {
    const merged: ToothWorkSelection = {
      ...(followUp as ToothWorkSelection),
      toothNumber: String(base.toothNumber || followUp.toothNumber || "").trim(),
    };
    for (const key of DISPLAY_ABUTMENT_SPEC_KEYS) {
      if (key === "customAbutment") {
        merged.customAbutment = Boolean(base.customAbutment);
        continue;
      }
      const value = base[key as keyof ToothWorkSelection];
      if (value != null && String(value).trim() !== "") {
        (merged as Record<string, unknown>)[key] = value;
      }
    }
    return merged;
  }
  if (followUp) return { ...(followUp as ToothWorkSelection) };
  if (base) return { ...(base as ToothWorkSelection) };
  return { ...(list[list.length - 1] as ToothWorkSelection) };
};

/** 치식별 차트 표시용 맵. 후속이 원 CA를 덮어쓰지 않는다. */
export const buildToothWorkDisplayByTooth = (
  toothWorks: ReadonlyArray<Partial<ToothWorkSelection>> | null | undefined,
): Map<string, ToothWorkSelection> => {
  const ownByTooth = new Map<string, Partial<ToothWorkSelection>[]>();
  for (const row of Array.isArray(toothWorks) ? toothWorks : []) {
    const anchor = String(row?.toothNumber || "").trim();
    if (!/^[1-4][1-8]$/.test(anchor)) continue;
    const bucket = ownByTooth.get(anchor) || [];
    bucket.push(row);
    ownByTooth.set(anchor, bucket);
  }

  const map = new Map<string, ToothWorkSelection>();
  for (const [tooth, rows] of ownByTooth) {
    const merged = mergeToothWorkRowsForChartDisplay(rows);
    if (merged) map.set(tooth, { ...merged, toothNumber: tooth });
  }

  // 본인 행이 없는 연결치만 스팬 행을 빌려 쓰되, 이후에도 원 행이 있으면 위에서 이김
  for (const row of Array.isArray(toothWorks) ? toothWorks : []) {
    const linked = Array.isArray(row?.bridgeLinkedTeeth)
      ? row.bridgeLinkedTeeth.map((t) => String(t || "").trim()).filter(Boolean)
      : [];
    for (const tooth of linked) {
      if (!/^[1-4][1-8]$/.test(tooth) || map.has(tooth)) continue;
      const borrowed = mergeToothWorkRowsForChartDisplay([
        { ...row, toothNumber: tooth },
      ]);
      if (borrowed) map.set(tooth, { ...borrowed, toothNumber: tooth });
    }
  }
  return map;
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
  billingDelta?: {
    labFeeTotal?: number;
    total?: number;
    finalLabFeeTotal?: number;
    finalTotal?: number;
    tempCreditLabFeeTotal?: number;
  } | null;
};

/** 후속 선택 스팬에 대응하는 원 임시치아 행(견적 차감용) */
export const pickSourceTempRowsForFollowUpCredit = (
  sourceToothWorks: Partial<ToothWorkSelection>[] | null | undefined,
  followUpRows: Partial<ToothWorkSelection>[] | null | undefined,
): Partial<ToothWorkSelection>[] => {
  const source = Array.isArray(sourceToothWorks) ? sourceToothWorks : [];
  const followUps = Array.isArray(followUpRows) ? followUpRows : [];
  if (source.length === 0 || followUps.length === 0) return [];

  const followKeys = new Set(
    followUps
      .filter(
        (row) =>
          isFollowUpProsthesisPhase(row) &&
          isFinalProsthesisType(String(row.prosthesisType || "")),
      )
      .map((row) => followUpRowSpanKey(row))
      .filter(Boolean),
  );
  if (followKeys.size === 0) return [];

  const out: Partial<ToothWorkSelection>[] = [];
  const seen = new Set<string>();
  for (const row of source) {
    if (!isTemporaryToothProsthesisType(String(row.prosthesisType || ""))) continue;
    if (isFollowUpProsthesisPhase(row)) continue;
    const teeth = linkedTeethOf(row);
    const key = teeth.join("-");
    if (!key || !followKeys.has(key)) continue;
    const dedupe = `${String(row.toothNumber || "").trim()}:${key}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(row);
  }
  return out;
};

/** 후속 최종 보철 견적 − 임시치아 기공비 = 순증분 */
export const applyProsthesisFollowUpTempCredit = (input: {
  finalLabFeeTotal?: number;
  finalTotal?: number;
  tempCreditLabFeeTotal?: number;
}) => {
  const finalLab = Math.max(0, Math.round(Number(input.finalLabFeeTotal || 0)));
  const finalTot = Math.max(
    0,
    Math.round(
      Number(
        input.finalTotal != null ? input.finalTotal : input.finalLabFeeTotal || 0,
      ),
    ),
  );
  const credit = Math.max(0, Math.round(Number(input.tempCreditLabFeeTotal || 0)));
  const appliedCredit = Math.min(credit, finalLab);
  return {
    finalLabFeeTotal: finalLab,
    finalTotal: finalTot,
    tempCreditLabFeeTotal: appliedCredit,
    labFeeTotal: Math.max(0, finalLab - appliedCredit),
    total: Math.max(0, finalTot - appliedCredit),
  };
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
  if (!appendedAt) return false;
  if (!mainAcceptedAt) {
    // 수락 시각 미동기화 — labAcceptedAt만 있으면 재수락 오염 가능성, pending 유지
    return true;
  }
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
