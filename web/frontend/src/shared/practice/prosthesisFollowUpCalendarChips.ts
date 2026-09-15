// related files:
// - web/frontend/src/shared/practice/prosthesisFollowUp.ts
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersAllModal.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - 2026-09-15: 후속 지르 단계별 캘린더 칩 + 원 임시치아(focus=-1) 칩.
// - 2026-09-15: 의뢰일·도착일 모두 단계 칩. 같은 날 후속도 원본(임시) 칩 분리.
// - 2026-09-15: 같은 날 후속 여러 건 → 칩 1개(최신 focus). 다른 날만 재도착처럼 분리.
import {
  resolveProsthesisFollowUpFocusIndex,
  type ProsthesisFollowUpRecord,
} from "@/shared/practice/prosthesisFollowUp";

export type ProsthesisFollowUpCalendarChipFields = {
  id: string;
  arrivalDate?: string | null;
  orderDate?: string | null;
  focusFollowUpIndex?: number | null;
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

/**
 * 도착일·의뢰일 확장 칩에 후속 단계 포커스를 붙인다.
 * - 같은 날 후속 여러 건 → 칩 1개(최신 followUpIndex)
 * - 원 임시치아 칩(focus=-1)은 후속과 **다른 날**일 때만 추가
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

    if (records.length === 0) {
      const prevYmd = previousStageYmd(allFollowUps[0], dateKey, "");
      out.push({
        ...chip,
        focusFollowUpIndex:
          prevYmd && prevYmd === ymd
            ? -1
            : resolveProsthesisFollowUpFocusIndex({
                arrivalYmd:
                  dateKey === "arrivalDate"
                    ? ymd
                    : String(chip.arrivalDate || "").trim() || undefined,
                prosthesisFollowUps: allFollowUps,
              }),
      });
      continue;
    }

    // 같은 날 후속 N건 → 목록 1칩(최신 단계). 재도착처럼 날짜가 다를 때만 분리.
    const last = records[records.length - 1];
    out.push({
      ...chip,
      focusFollowUpIndex: Math.max(
        0,
        Math.floor(Number(last?.followUpIndex || 0)),
      ),
    });
  }

  const withTempStage: T[] = [];
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
          chipTransferBaseId(c.id) === baseId && c.focusFollowUpIndex === -1,
      );
      if (!alreadyHasTemp) {
        const chipYmd = chipDayYmd(chip, dateKey);
        const prevYmd = previousStageYmd(fus[0], dateKey, chipYmd);
        const existing = existingYmdsByBase.get(baseId) || new Set<string>();
        // 같은 날이면 임시 칩을 추가하지 않음(오늘 임시→지르 = 목록 1건)
        if (
          /^\d{4}-\d{2}-\d{2}$/.test(prevYmd) &&
          !existing.has(prevYmd)
        ) {
          const stagePrefix = dateKey === "orderDate" ? "ord" : "arr";
          withTempStage.push({
            ...chip,
            id: `${baseId}:${stagePrefix}:${prevYmd}:stage:temp`,
            ...(dateKey === "orderDate"
              ? { orderDate: prevYmd }
              : { arrivalDate: prevYmd }),
            focusFollowUpIndex: -1,
            isPriorArrival: true,
            canDelete: false,
          });
          existing.add(prevYmd);
          existingYmdsByBase.set(baseId, existing);
        }
      }
    }
    withTempStage.push(chip);
  }
  return withTempStage;
};

export const calendarChipTransferBaseId = chipTransferBaseId;
