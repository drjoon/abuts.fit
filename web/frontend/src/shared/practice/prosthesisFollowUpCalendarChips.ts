// related files:
// - web/frontend/src/shared/practice/prosthesisFollowUp.ts
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersAllModal.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - 2026-09-15: 후속 지르 단계별 캘린더 칩 + 원 임시치아(focus=-1) 칩.
// - 2026-09-15: 의뢰일·도착일 모두 단계 칩. 같은 날 후속도 원본(임시) 칩 분리.
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
 * - 같은 날 후속 여러 건 → fu:0, fu:1 …
 * - 후속이 있으면 원 임시치아 칩(focus=-1)을 항상 둔다(같은 날이어도 분리)
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

    if (records.length === 1) {
      out.push({
        ...chip,
        focusFollowUpIndex: Math.max(
          0,
          Math.floor(Number(records[0]?.followUpIndex || 0)),
        ),
      });
      continue;
    }

    const lastIdx = Number(records[records.length - 1]?.followUpIndex || 0);
    for (const rec of records) {
      const fuIdx = Math.max(0, Math.floor(Number(rec.followUpIndex || 0)));
      out.push({
        ...chip,
        id: `${chip.id}:fu:${fuIdx}`,
        focusFollowUpIndex: fuIdx,
        isPriorArrival: Boolean(chip.isPriorArrival) || fuIdx < lastIdx,
        canDelete: fuIdx < lastIdx ? false : chip.canDelete,
      });
    }
  }

  const withTempStage: T[] = [];
  const tempStageInserted = new Set<string>();
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
        if (/^\d{4}-\d{2}-\d{2}$/.test(prevYmd)) {
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
        }
      }
    }
    withTempStage.push(chip);
  }
  return withTempStage;
};

export const calendarChipTransferBaseId = chipTransferBaseId;
