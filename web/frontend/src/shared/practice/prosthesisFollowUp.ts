// related files:
// - web/backend/utils/practiceTransferProsthesisFollowUp.js
// - web/frontend/src/shared/practice/transferMemo.ts
// - web/frontend/src/shared/components/practice/PracticeProsthesisFollowUpDialog.tsx
// - 2026-09-01: 임시치아 배송 후 동일 건 크라운/브리지 후속 추가(프론트 SSOT).
// - 2026-09-08: 후속 제작 견적에 원 임시치아 기공비 차감.
// - 2026-09-08: 치식 표시 — 후속 보철+원 임시치아 병존 시 형태는 후속, CA·어벗 스펙은 원치아 행.
// - 2026-09-15: ProsthesisFeeStageRecord — 단계별 견적 스냅샷 타입.
// - 2026-09-15: 부분 후속(남은 임시치아) — 변경 기공비 라벨·지르 CTA 유지용 hasPartialProsthesisFollowUp.
// - 2026-09-15: 부분 후속 포커스 — 해당 단계 지르만(미전환 임시를 섞지 않음). 원본은 focus=-1.
// - 2026-09-15: 캘린더 칩 포커스 — 해당 단계 치아만(누적 브리지 표시 금지). 견적 표시는 차감 없음.
// - 2026-09-15: focus=null + 후속 있음 → 원 임시치아 단계(-1). 지르는 칩·append 직후 focus로만.
// - 2026-09-15: followUps 배열 없이도 toothWorks 후속 행이 있으면 focus=null → -1(원 스냅샷 보호).
// - 2026-09-15: 후속-only(지르 다이얼로그 초안·채팅)는 focus=null 유지 — 원 행이 있을 때만 -1.
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

const getAdjacentTeeth = (toothNumber: string) => {
  const raw = String(toothNumber || "").trim();
  if (!/^[1-4][1-8]$/.test(raw)) return [] as string[];
  const tens = Number(raw[0]);
  const ones = Number(raw[1]);
  const out: string[] = [];
  if (ones > 1) out.push(`${tens}${ones - 1}`);
  if (ones < 8) out.push(`${tens}${ones + 1}`);
  if (ones === 1) {
    if (tens === 1) out.push("21");
    if (tens === 2) out.push("11");
    if (tens === 3) out.push("41");
    if (tens === 4) out.push("31");
  }
  return Array.from(new Set(out));
};

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

const collectAdjacentLinksAmongRows = (
  rows: Partial<ToothWorkSelection>[],
  toothNumber: string,
) => {
  const tooth = String(toothNumber || "").trim();
  const adjacent = new Set(getAdjacentTeeth(tooth));
  const byTooth = new Map<string, Partial<ToothWorkSelection>>();
  for (const row of rows) {
    const other = String(row?.toothNumber || "").trim();
    if (other && !byTooth.has(other)) byTooth.set(other, row);
  }
  const links = new Set<string>();
  const self = byTooth.get(tooth);
  for (const linked of Array.isArray(self?.bridgeLinkedTeeth)
    ? self.bridgeLinkedTeeth
    : []) {
    const other = String(linked || "").trim();
    if (adjacent.has(other) && byTooth.has(other)) links.add(other);
  }
  for (const [other, row] of byTooth) {
    if (!other || other === tooth || !adjacent.has(other)) continue;
    const otherLinks = Array.isArray(row?.bridgeLinkedTeeth)
      ? row.bridgeLinkedTeeth
      : [];
    if (otherLinks.some((value) => String(value || "").trim() === tooth)) {
      links.add(other);
    }
  }
  return [...links];
};

/** 임시치아 인접 연결 → 연결요소 스팬 (44-45 / 45-46 쪼개짐 방지) */
const buildConnectedTempSpans = (tempRows: Partial<ToothWorkSelection>[]) => {
  const byTooth = new Map<string, Partial<ToothWorkSelection>>();
  for (const row of tempRows) {
    const tooth = String(row?.toothNumber || "").trim();
    if (!/^[1-4][1-8]$/.test(tooth) || byTooth.has(tooth)) continue;
    byTooth.set(tooth, row);
  }
  const visited = new Set<string>();
  const spans: Array<{ teeth: string[]; sourceRow: Partial<ToothWorkSelection> }> =
    [];
  for (const start of sortTeethFdi([...byTooth.keys()])) {
    if (visited.has(start)) continue;
    const component: string[] = [];
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      for (const neighbor of collectAdjacentLinksAmongRows(tempRows, current)) {
        if (!visited.has(neighbor) && byTooth.has(neighbor)) queue.push(neighbor);
      }
    }
    const teeth = sortTeethFdi(component);
    const sourceRow = byTooth.get(teeth[0] || "") || byTooth.get(start)!;
    spans.push({ teeth, sourceRow });
  }
  return spans;
};

/** 의뢰상세 치식 차트 — 후속 지르 행을 제외해 원 임시치아 라벨을 유지 */
export const baseToothWorksForDetailChart = <T extends Partial<ToothWorkSelection>>(
  toothWorks: ReadonlyArray<T> | null | undefined,
): T[] =>
  (Array.isArray(toothWorks) ? toothWorks : []).filter(
    (row) => !isFollowUpProsthesisPhase(row),
  );

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

  // 후속 스팬 연결치는 원 임시치아 행이 있어도 후속 형태(브리지/크라운)로 맞춘다.
  // (앵커만 브리지·연결치는 임시치아로 남는 표시 섞임 방지)
  for (const row of Array.isArray(toothWorks) ? toothWorks : []) {
    if (
      !isFollowUpProsthesisPhase(row) ||
      !isFinalProsthesisType(String(row?.prosthesisType || ""))
    ) {
      continue;
    }
    for (const tooth of linkedTeethOf(row)) {
      if (!/^[1-4][1-8]$/.test(tooth)) continue;
      const existing = map.get(tooth);
      const baseRows = existing
        ? [existing, { ...row, toothNumber: tooth }]
        : [{ ...row, toothNumber: tooth }];
      const borrowed = mergeToothWorkRowsForChartDisplay(baseRows);
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
  return buildConnectedTempSpans(tempRows).filter(
    ({ teeth }) => !teeth.some((t) => hasFollowUpProsthesisForTooth(toothWorks, t)),
  );
};

/** 일부만 후속 지르·아직 임시치아 스팬 남음(기공비=변경, 지르 CTA 유지) */
export const hasPartialProsthesisFollowUp = (
  toothWorks: ReadonlyArray<Partial<ToothWorkSelection>> | null | undefined,
) => {
  const rows = Array.isArray(toothWorks) ? [...toothWorks] : [];
  const hasFollowUp = rows.some(
    (row) =>
      isFollowUpProsthesisPhase(row) &&
      isFinalProsthesisType(String(row.prosthesisType || "")),
  );
  if (!hasFollowUp) return false;
  return listPendingFollowUpTempSpans(rows).length > 0;
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
      message: "기공소 작업시작 후에 최종 보철 제작을 의뢰할 수 있습니다.",
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
    /** 지르 단계 스냅샷 라인(차감 전). 최종 case feeQuote와 별개 */
    lines?: Array<{
      toothNumber?: string;
      prosthesisType?: string;
      labFee?: number;
      labFeeMin?: number;
      labAbutmentFee?: number;
      labAbutmentPending?: boolean;
      abutmentRetail?: number;
      abutmentRetailNote?: string;
    }>;
  } | null;
};

/**
 * PracticeTransfer.prosthesisFeeStages — 단계별 견적 스냅샷.
 * case billing / feeQuote(최종 합)와 분리. 후속 추가 시 기존 단계를 덮지 않음.
 */
export type ProsthesisFeeStageRecord = {
  key: string;
  followUpIndex?: number;
  title?: string;
  /** 이 단계 차트용 치식 스냅샷(불변). 있으면 focus 필터 대신 이걸 표시 */
  toothWorks?: Partial<ToothWorkSelection>[];
  labFeeTotal?: number;
  total?: number;
  lines?: NonNullable<ProsthesisFollowUpRecord["billingDelta"]>["lines"];
  quotedAt?: string | null;
  netLabFeeTotal?: number;
  netTotal?: number;
  tempCreditLabFeeTotal?: number;
  orderYmd?: string | null;
  arrivalYmd?: string | null;
  previousOrderYmd?: string | null;
  previousArrivalYmd?: string | null;
};

export const PROSTHESIS_FEE_STAGE_TEMP_KEY = "temp";

export const zirconiaProsthesisFeeStageKey = (followUpIndex: number) =>
  `zirconia-${Math.max(0, Math.floor(Number(followUpIndex) || 0))}`;

export const getProsthesisFeeStageByKey = (
  stages: ReadonlyArray<ProsthesisFeeStageRecord> | null | undefined,
  key: string | null | undefined,
): ProsthesisFeeStageRecord | null => {
  const want = String(key || "").trim();
  if (!want) return null;
  const list = Array.isArray(stages) ? stages : [];
  return list.find((row) => String(row?.key || "").trim() === want) || null;
};

/** focusFollowUpIndex → stage key (칩 호환) */
export const prosthesisStageKeyFromFocusIndex = (
  focusIndex: ProsthesisFollowUpFocusIndex,
): string | null => {
  if (focusIndex == null) return null;
  if (focusIndex < 0) return PROSTHESIS_FEE_STAGE_TEMP_KEY;
  return zirconiaProsthesisFeeStageKey(focusIndex);
};

/**
 * 단계 표시용 toothWorks — Stage 스냅샷 우선, 없으면 focus 필터 fallback.
 */
export const toothWorksForProsthesisStage = <T extends Partial<ToothWorkSelection>>(
  input: {
    toothWorks?: ReadonlyArray<T> | null;
    prosthesisFollowUps?: ReadonlyArray<ProsthesisFollowUpRecord> | null;
    prosthesisFeeStages?: ReadonlyArray<ProsthesisFeeStageRecord> | null;
    stageKey?: string | null;
    focusFollowUpIndex?: ProsthesisFollowUpFocusIndex;
  },
): T[] => {
  const stageKey =
    String(input.stageKey || "").trim() ||
    prosthesisStageKeyFromFocusIndex(input.focusFollowUpIndex ?? null) ||
    "";
  if (stageKey) {
    const stage = getProsthesisFeeStageByKey(input.prosthesisFeeStages, stageKey);
    if (Array.isArray(stage?.toothWorks) && stage!.toothWorks!.length > 0) {
      return stage!.toothWorks as T[];
    }
  }
  return toothWorksUpToFollowUpFocus(
    input.toothWorks,
    input.prosthesisFollowUps,
    input.focusFollowUpIndex ??
      (stageKey === PROSTHESIS_FEE_STAGE_TEMP_KEY
        ? -1
        : stageKey.startsWith("zirconia-")
          ? Math.max(0, Math.floor(Number(stageKey.slice("zirconia-".length)) || 0))
          : null),
  );
};

/**
 * 캘린더 칩·의뢰상세 단계 포커스.
 * - `-1` 원 임시치아만
 * - `0..n` 해당 followUpIndex 단계만(누적 아님)
 * - `null` 전체(최종 상태)
 * Stage SSOT: 가능하면 stageKey/`prosthesisFeeStages[].toothWorks`를 쓰고,
 * focus는 칩 호환 alias로만 유지한다.
 */
export type ProsthesisFollowUpFocusIndex = number | null;

const activeFollowUpRecordsSorted = (
  followUps: ReadonlyArray<ProsthesisFollowUpRecord> | null | undefined,
) =>
  (Array.isArray(followUps) ? followUps : [])
    .filter((row) => !String(row?.canceledAt || "").trim())
    .slice()
    .sort(
      (a, b) => Number(a.followUpIndex || 0) - Number(b.followUpIndex || 0),
    );

/** 원 도착일 후보 — arrivalDates에 빠진 previousArrivalYmd 복원용 */
export const collectProsthesisFollowUpArrivalYmds = (input: {
  arrivalDates?: string[] | null;
  arrivalDate?: string | null;
  prosthesisFollowUps?: ReadonlyArray<ProsthesisFollowUpRecord> | null;
}) => {
  const out: string[] = [];
  const push = (raw: unknown) => {
    const ymd = String(raw || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || out.includes(ymd)) return;
    out.push(ymd);
  };
  const records = activeFollowUpRecordsSorted(input.prosthesisFollowUps);
  if (records[0]?.previousArrivalYmd) push(records[0].previousArrivalYmd);
  for (const ymd of Array.isArray(input.arrivalDates) ? input.arrivalDates : []) {
    push(ymd);
  }
  push(input.arrivalDate);
  for (const row of records) push(row.arrivalYmd);
  return out;
};

/**
 * 칩 도착일·후속 인덱스로 표시 단계 결정.
 * 같은 도착일에 후속이 여러 건이면 focusFollowUpIndex를 우선한다.
 * Stage SSOT: 같은 날(원 임시일)은 항상 -1(temp). latest-zir fallback 없음.
 */
export const resolveProsthesisFollowUpFocusIndex = (input: {
  arrivalYmd?: string | null;
  focusFollowUpIndex?: number | null;
  prosthesisFollowUps?: ReadonlyArray<ProsthesisFollowUpRecord> | null;
}): ProsthesisFollowUpFocusIndex => {
  const records = activeFollowUpRecordsSorted(input.prosthesisFollowUps);
  if (records.length === 0) return null;

  if (
    input.focusFollowUpIndex != null &&
    Number.isFinite(Number(input.focusFollowUpIndex))
  ) {
    const idx = Math.floor(Number(input.focusFollowUpIndex));
    if (idx < 0) return -1;
    return Math.min(idx, Number(records[records.length - 1]?.followUpIndex || 0));
  }

  const ymd = String(input.arrivalYmd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;

  const firstPrev = String(records[0]?.previousArrivalYmd || "").trim();
  if (firstPrev && firstPrev === ymd) return -1;

  const matching = records.filter(
    (row) => String(row.arrivalYmd || "").trim() === ymd,
  );
  if (matching.length > 0) {
    return Math.max(...matching.map((row) => Number(row.followUpIndex || 0)));
  }

  // 후속 도착일이 아닌 과거 칩 → 원 임시치아
  const followArrivals = new Set(
    records.map((row) => String(row.arrivalYmd || "").trim()).filter(Boolean),
  );
  if (!followArrivals.has(ymd)) return -1;
  return null;
};

/**
 * 캘린더 칩 단계에 해당하는 toothWorks (차트 표시).
 * - null: 후속 없으면 전체. 후속 있으면 원 임시치아 단계(-1) — 1단계 스냅샷 유지
 * - -1: 원 임시치아만(후속 지르 행 제외 — 원본 스냅샷 보호)
 * - N: 해당 후속 건의 지르 치아만(미전환 임시치아를 섞지 않음 — 원본과 혼동 방지)
 */
export const toothWorksUpToFollowUpFocus = <T extends Partial<ToothWorkSelection>>(
  toothWorks: ReadonlyArray<T> | null | undefined,
  followUps: ReadonlyArray<ProsthesisFollowUpRecord> | null | undefined,
  focusIndex: ProsthesisFollowUpFocusIndex,
): T[] => {
  const rows = Array.isArray(toothWorks) ? [...toothWorks] : [];
  const hasFollowUpRowsInToothWorks = rows.some(
    (row) =>
      isFollowUpProsthesisPhase(row) &&
      isFinalProsthesisType(String(row.prosthesisType || "")),
  );
  const hasBaseRowsInToothWorks = rows.some(
    (row) => !isFollowUpProsthesisPhase(row),
  );
  const effectiveFocus =
    focusIndex == null
      ? (() => {
          const records = activeFollowUpRecordsSorted(followUps);
          // 원 임시치아+후속 지르가 함께 있을 때만 기본을 원 스냅샷(-1)으로.
          // 후속 초안만 넘기는 지르 제작 다이얼로그·채팅 카드는 그대로 표시.
          if (records.length > 0) return -1;
          if (hasFollowUpRowsInToothWorks && hasBaseRowsInToothWorks) return -1;
          return null;
        })()
      : focusIndex;
  if (effectiveFocus == null) return rows;
  if (effectiveFocus < 0) {
    return rows.filter((row) => !isFollowUpProsthesisPhase(row));
  }

  const record = activeFollowUpRecordsSorted(followUps).find(
    (row) =>
      Number(row.followUpIndex || 0) === Math.floor(Number(effectiveFocus)),
  );
  const stageTeeth = new Set<string>();
  for (const tooth of Array.isArray(record?.toothNumbers)
    ? record!.toothNumbers
    : []) {
    const t = String(tooth || "").trim();
    if (t) stageTeeth.add(t);
  }
  if (stageTeeth.size === 0) {
    // 레거시(치아 목록 없음): 단일 후속이면 전체 지르, 아니면 해당 단계 표시 불가
    const allFollowUpRecords = activeFollowUpRecordsSorted(followUps);
    if (allFollowUpRecords.length <= 1) {
      for (const row of rows) {
        if (
          !isFollowUpProsthesisPhase(row) ||
          !isFinalProsthesisType(String(row.prosthesisType || ""))
        ) {
          continue;
        }
        for (const tooth of linkedTeethOf(row)) stageTeeth.add(tooth);
      }
    }
  }

  if (stageTeeth.size === 0) return [];

  const touchesSet = (row: T, set: Set<string>) => {
    const anchor = String(row?.toothNumber || "").trim();
    if (anchor && set.has(anchor)) return true;
    return linkedTeethOf(row).some((tooth) => set.has(tooth));
  };

  return rows.filter((row) => {
    if (!touchesSet(row, stageTeeth)) return false;
    if (!isFollowUpProsthesisPhase(row)) return true;
    return isFinalProsthesisType(String(row.prosthesisType || ""));
  });
};

export const followUpsUpToFocus = (
  followUps: ReadonlyArray<ProsthesisFollowUpRecord> | null | undefined,
  focusIndex: ProsthesisFollowUpFocusIndex,
) => {
  const records = activeFollowUpRecordsSorted(followUps);
  if (focusIndex == null) return records;
  if (focusIndex < 0) return [];
  return records.filter((row) => Number(row.followUpIndex || 0) <= focusIndex);
};

/** 후속 선택 스팬에 대응하는 원 임시치아 행(견적 차감용) */
export const pickSourceTempRowsForFollowUpCredit = (
  sourceToothWorks: Partial<ToothWorkSelection>[] | null | undefined,
  followUpRows: Partial<ToothWorkSelection>[] | null | undefined,
): Partial<ToothWorkSelection>[] => {
  const source = Array.isArray(sourceToothWorks) ? sourceToothWorks : [];
  const followUps = Array.isArray(followUpRows) ? followUpRows : [];
  if (source.length === 0 || followUps.length === 0) return [];

  const followTeeth = new Set<string>();
  for (const row of followUps) {
    if (!isFollowUpProsthesisPhase(row)) continue;
    if (!isFinalProsthesisType(String(row.prosthesisType || ""))) continue;
    for (const tooth of linkedTeethOf(row)) followTeeth.add(tooth);
  }
  if (followTeeth.size === 0) return [];

  const out: Partial<ToothWorkSelection>[] = [];
  const seen = new Set<string>();
  for (const row of source) {
    if (!isTemporaryToothProsthesisType(String(row.prosthesisType || ""))) continue;
    if (isFollowUpProsthesisPhase(row)) continue;
    const tooth = String(row.toothNumber || "").trim();
    if (!tooth || !followTeeth.has(tooth) || seen.has(tooth)) continue;
    seen.add(tooth);
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
  _requestorDownloadedAt?: string | null,
) => {
  if (!record) return false;
  if (record.canceledAt) return false;
  if (!record.labAcceptedAt) return true;
  const appendedAt = record.appendedAt;
  if (!appendedAt) {
    // appendedAt 없는 레거시 — labAcceptedAt만으로 작업시작 완료
    return false;
  }
  const acceptMs = new Date(record.labAcceptedAt).getTime();
  const appendMs = new Date(appendedAt).getTime();
  if (!Number.isFinite(acceptMs) || !Number.isFinite(appendMs)) return false;
  // 지르 작업시작이 후속 추가 시각 이상이면 pending 해제
  if (acceptMs >= appendMs) return false;
  void _requestorDownloadedAt;
  return true;
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

/** 기공소 — pending 지르 후속 「지르 작업 시작」 */
export const canLabStartProsthesisFollowUpWork = (input: {
  prosthesisFollowUps?: ProsthesisFollowUpRecord[] | null;
  toothWorks?: ReadonlyArray<Partial<ToothWorkSelection>> | null;
  status?: string | null;
  manufacturerStage?: string | null;
  requestorDownloadedAt?: string | null;
  requestorAcceptedAt?: string | null;
  isAccepted?: boolean | null;
  isDownloaded?: boolean | null;
}) => {
  const status = String(input.status || "").trim();
  const stage = String(input.manufacturerStage || "").trim();
  if (
    status === "취소" ||
    status === "작업취소" ||
    stage === "취소" ||
    stage === "작업취소"
  ) {
    return { ok: false as const, reason: "canceled", message: "취소된 의뢰입니다." };
  }
  const mainAccepted = Boolean(
    input.isAccepted ||
      input.isDownloaded ||
      String(input.requestorDownloadedAt || "").trim() ||
      String(input.requestorAcceptedAt || "").trim() ||
      stage === "의뢰수락" ||
      stage === "다운로드완료" ||
      stage === "작업완료" ||
      stage === "생산진행" ||
      stage === "포장.발송",
  );
  if (!mainAccepted) {
    return {
      ok: false as const,
      reason: "not_accepted",
      message: "본건 작업시작 후에 지르 작업을 시작할 수 있습니다.",
    };
  }
  const pending = getPendingProsthesisFollowUps(
    input.prosthesisFollowUps,
    input.requestorDownloadedAt,
  );
  if (pending.length > 0) {
    return { ok: true as const, pending };
  }
  // 목록에 followUps가 비어도 toothWorks에 후속 지르 행이 있으면 시작 대상으로 표시(API는 DB 기준)
  const hasFollowUpRows = (Array.isArray(input.toothWorks) ? input.toothWorks : []).some(
    (row) =>
      isFollowUpProsthesisPhase(row) &&
      isFinalProsthesisType(String(row?.prosthesisType || "")),
  );
  const activeFollowUps = (Array.isArray(input.prosthesisFollowUps)
    ? input.prosthesisFollowUps
    : []
  ).filter((row) => !String(row?.canceledAt || "").trim());
  const anyLabStarted = activeFollowUps.some((row) =>
    Boolean(String(row?.labAcceptedAt || "").trim()),
  );
  if (hasFollowUpRows && !anyLabStarted) {
    return { ok: true as const, pending: activeFollowUps };
  }
  return {
    ok: false as const,
    reason: "no_pending",
    message: "시작할 지르 보철 후속이 없습니다.",
  };
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

/**
 * 완료된 후속 지르 행만(원 임시치아 제외) — 최종 보철 카드·최종 기공비 견적용.
 */
export const listCompletedFollowUpToothWorks = <
  T extends Partial<ToothWorkSelection>,
>(
  toothWorks: ReadonlyArray<T> | null | undefined,
): T[] => {
  const rows = Array.isArray(toothWorks) ? [...toothWorks] : [];
  return rows.filter(
    (row) =>
      isFollowUpProsthesisPhase(row) &&
      isFinalProsthesisType(String(row.prosthesisType || "")),
  );
};

/**
 * 제작 변경용 — 기공소 작업시작 전(pending) 후속 지르 행.
 * toothWorks의 followUp 행을 우선하고, 없으면 pending toothNumbers로 복원.
 */
export const listEditablePendingFollowUpToothWorks = (
  toothWorks: ReadonlyArray<Partial<ToothWorkSelection>> | null | undefined,
  followUps?: ReadonlyArray<ProsthesisFollowUpRecord> | null,
  requestorDownloadedAt?: string | null,
): Array<ToothWorkSelection & { prosthesisPhase: string }> => {
  const rows = Array.isArray(toothWorks) ? [...toothWorks] : [];
  const pending = getPendingProsthesisFollowUps(
    followUps,
    requestorDownloadedAt,
  );
  const followUpRows = rows.filter(
    (row) =>
      isFollowUpProsthesisPhase(row) &&
      isFinalProsthesisType(String(row.prosthesisType || "")),
  ) as Array<ToothWorkSelection & { prosthesisPhase: string }>;

  if (pending.length === 0) return followUpRows;

  const pendingTeeth = new Set<string>();
  for (const rec of pending) {
    for (const tooth of Array.isArray(rec.toothNumbers) ? rec.toothNumbers : []) {
      const t = String(tooth || "").trim();
      if (t) pendingTeeth.add(t);
    }
  }
  if (pendingTeeth.size === 0) return followUpRows;

  const matched = followUpRows.filter((row) => {
    const anchor = String(row.toothNumber || "").trim();
    if (anchor && pendingTeeth.has(anchor)) return true;
    return linkedTeethOf(row).some((tooth) => pendingTeeth.has(tooth));
  });
  if (matched.length > 0) return matched;

  // followUp 행이 목록에 없으면 원 임시치아 스팬으로 초안 복원(표시·도착일 변경용)
  const baseTemps = rows.filter(
    (row) =>
      isTemporaryToothProsthesisType(String(row.prosthesisType || "")) &&
      !isFollowUpProsthesisPhase(row),
  );
  const pendingTempRows = baseTemps.filter((row) =>
    pendingTeeth.has(String(row.toothNumber || "").trim()),
  );
  if (pendingTempRows.length === 0) return [];
  return buildConnectedTempSpans(pendingTempRows).map(({ teeth, sourceRow }) => {
    const prosthesisType = teeth.length >= 2 ? "브리지" : "크라운";
    return cloneRowForFollowUp(sourceRow, prosthesisType, teeth);
  });
};
