// related files:
// - web/frontend/src/shared/practice/prosthesisFollowUp.ts
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersAllModal.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - 2026-09-15: Stage SSOT — 같은 날=temp만(지르는 채팅). 다른 날 재도착만 zir 칩.
// - 2026-09-15: latest-zir same-day fallback 제거. prosthesisStageKey 명시.
import {
  PROSTHESIS_FEE_STAGE_TEMP_KEY,
  zirconiaProsthesisFeeStageKey,
  type ProsthesisFollowUpRecord,
} from "@/shared/practice/prosthesisFollowUp";

export type ProsthesisFollowUpCalendarChipFields = {
  id: string;
  arrivalDate?: string | null;
  orderDate?: string | null;
  /** 칩 호환 alias — Stage SSOT는 prosthesisStageKey */
  focusFollowUpIndex?: number | null;
  /** `temp` | `zirconia-N` */
  prosthesisStageKey?: string | null;
  isPriorArrival?: boolean;
  canDelete?: boolean;
};

export type ProsthesisFollowUpCalendarDateKey = "orderDate" | "arrivalDate";

const chipTransferBaseId = (chipId: string) =>
  String(chipId || "")
    .replace(/:fu:\d+$/, "")
    .replace(/:stage:temp$/, "")
    .replace(/:(arr|ord):.*$/, "");

const activeFollowUpsSorted = (
  followUps: ReadonlyArray<ProsthesisFollowUpRecord> | null | undefined,
) =>
  (Array.isArray(followUps) ? followUps : [])
    .filter((row) => !String(row?.canceledAt || "").trim())
    .slice()
    .sort(
      (a, b) => Number(a.followUpIndex || 0) - Number(b.followUpIndex || 0),
    );

const followUpYmdOnChip = (
  row: ProsthesisFollowUpRecord,
  dateKey: ProsthesisFollowUpCalendarDateKey,
) =>
  dateKey === "orderDate"
    ? String(row?.orderYmd || row?.arrivalYmd || "").trim()
    : String(row?.arrivalYmd || "").trim();

const previousStageYmd = (
  row: ProsthesisFollowUpRecord | undefined,
  dateKey: ProsthesisFollowUpCalendarDateKey,
  fallbackYmd: string,
) => {
  if (dateKey === "orderDate") {
    return (
      String(row?.previousOrderYmd || "").trim() ||
      String(row?.previousArrivalYmd || "").trim() ||
      fallbackYmd
    );
  }
  return String(row?.previousArrivalYmd || "").trim() || fallbackYmd;
};

const chipDayYmd = (
  chip: ProsthesisFollowUpCalendarChipFields,
  dateKey: ProsthesisFollowUpCalendarDateKey,
) =>
  dateKey === "orderDate"
    ? String(chip.orderDate || "").trim()
    : String(chip.arrivalDate || "").trim();

const withTempStage = <T extends ProsthesisFollowUpCalendarChipFields>(
  chip: T,
): T => ({
  ...chip,
  focusFollowUpIndex: -1,
  prosthesisStageKey: PROSTHESIS_FEE_STAGE_TEMP_KEY,
});

const withZirStage = <T extends ProsthesisFollowUpCalendarChipFields>(
  chip: T,
  followUpIndex: number,
): T => {
  const idx = Math.max(0, Math.floor(Number(followUpIndex) || 0));
  return {
    ...chip,
    focusFollowUpIndex: idx,
    prosthesisStageKey: zirconiaProsthesisFeeStageKey(idx),
  };
};

/**
 * 도착일·의뢰일 확장 칩에 후속 단계 포커스(Stage key)를 붙인다.
 * - 원 임시일과 같은 날 → 칩 1개 = temp만 (지르는 채팅)
 * - 다른 날 후속(재도착) → 그날 최신 zir
 * - 원 임시일과 다른 날에만 temp 칩을 별도 삽입
 */
export const attachProsthesisFollowUpFocusToCalendarChips = <
  T extends ProsthesisFollowUpCalendarChipFields,
>(input: {
  chips: readonly T[];
  getFollowUps: (
    transferBaseId: string,
  ) => ReadonlyArray<ProsthesisFollowUpRecord> | null | undefined;
  /** 기본 arrivalDate. 의뢰일 캘린더에서도 단계 칩을 붙인다. */
  dateKey?: ProsthesisFollowUpCalendarDateKey;
}): T[] => {
  const dateKey = input.dateKey === "orderDate" ? "orderDate" : "arrivalDate";
  const out: T[] = [];

  for (const chip of input.chips) {
    const baseId = chipTransferBaseId(chip.id);
    const ymd = chipDayYmd(chip, dateKey);
    const allFollowUps = activeFollowUpsSorted(input.getFollowUps(baseId));

    if (allFollowUps.length === 0) {
      out.push(chip);
      continue;
    }

    const records = allFollowUps.filter(
      (r) => followUpYmdOnChip(r, dateKey) === ymd,
    );
    const originalYmd = previousStageYmd(allFollowUps[0], dateKey, "");

    if (records.length === 0) {
      // 이 날에는 후속 없음 — 원 임시일이면 temp, 아니면 칩 그대로(포커스 null)
      if (originalYmd && originalYmd === ymd) {
        out.push(withTempStage(chip));
      } else {
        out.push(chip);
      }
      continue;
    }

    // 원 의뢰일과 같은 날 → 칩 1개 = 원 임시치아. 지르는 채팅 전용.
    if (!originalYmd || originalYmd === ymd) {
      out.push(withTempStage(chip));
      continue;
    }

    // 다른 날 후속(재도착형) → 그 날 최신 지르 단계
    const last = records[records.length - 1];
    out.push(
      withZirStage(chip, Math.max(0, Math.floor(Number(last?.followUpIndex || 0)))),
    );
  }

  const withTempStageChips: T[] = [];
  const tempStageInserted = new Set<string>();
  const existingYmdsByBase = new Map<string, Set<string>>();
  for (const chip of out) {
    const baseId = chipTransferBaseId(chip.id);
    const ymd = chipDayYmd(chip, dateKey);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue;
    const set = existingYmdsByBase.get(baseId) || new Set<string>();
    set.add(ymd);
    existingYmdsByBase.set(baseId, set);
  }

  for (const chip of out) {
    const baseId = chipTransferBaseId(chip.id);
    const fus = activeFollowUpsSorted(input.getFollowUps(baseId));
    if (fus.length > 0 && !tempStageInserted.has(baseId)) {
      tempStageInserted.add(baseId);
      const alreadyHasTemp = out.some(
        (c) =>
          chipTransferBaseId(c.id) === baseId &&
          (c.prosthesisStageKey === PROSTHESIS_FEE_STAGE_TEMP_KEY ||
            c.focusFollowUpIndex === -1),
      );
      if (!alreadyHasTemp) {
        const chipYmd = chipDayYmd(chip, dateKey);
        const prevYmd = previousStageYmd(fus[0], dateKey, chipYmd);
        const existing = existingYmdsByBase.get(baseId) || new Set<string>();
        // 같은 날이면 임시 칩을 추가하지 않음(오늘 임시→지르 = 목록 1건=temp)
        if (/^\d{4}-\d{2}-\d{2}$/.test(prevYmd) && !existing.has(prevYmd)) {
          const stagePrefix = dateKey === "orderDate" ? "ord" : "arr";
          withTempStageChips.push(
            withTempStage({
              ...chip,
              id: `${baseId}:${stagePrefix}:${prevYmd}:stage:temp`,
              ...(dateKey === "orderDate"
                ? { orderDate: prevYmd }
                : { arrivalDate: prevYmd }),
              isPriorArrival: true,
              canDelete: false,
            }),
          );
          existing.add(prevYmd);
          existingYmdsByBase.set(baseId, existing);
        }
      }
    }
    withTempStageChips.push(chip);
  }
  return withTempStageChips;
};

export const calendarChipTransferBaseId = chipTransferBaseId;
