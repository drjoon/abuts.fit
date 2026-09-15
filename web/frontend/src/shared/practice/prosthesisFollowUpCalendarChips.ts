// related files:
// - web/frontend/src/shared/practice/prosthesisFollowUp.ts
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersAllModal.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - 2026-09-15: 후속 지르 단계별 캘린더 칩 + 원 임시치아(focus=-1) 칩.
import {
  resolveProsthesisFollowUpFocusIndex,
  type ProsthesisFollowUpRecord,
} from "@/shared/practice/prosthesisFollowUp";

export type ProsthesisFollowUpCalendarChipFields = {
  id: string;
  arrivalDate?: string | null;
  focusFollowUpIndex?: number | null;
  isPriorArrival?: boolean;
  canDelete?: boolean;
};

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

/**
 * 도착일 확장 칩에 후속 단계 포커스를 붙인다.
 * - 같은 도착일 후속 여러 건 → fu:0, fu:1 …
 * - 후속이 있으면 원 임시치아 칩(focus=-1)을 항상 둔다
 */
export const attachProsthesisFollowUpFocusToCalendarChips = <
  T extends ProsthesisFollowUpCalendarChipFields,
>(input: {
  chips: readonly T[];
  getFollowUps: (
    transferBaseId: string,
  ) => ReadonlyArray<ProsthesisFollowUpRecord> | null | undefined;
}): T[] => {
  const out: T[] = [];
  for (const chip of input.chips) {
    const baseId = chipTransferBaseId(chip.id);
    const ymd = String(chip.arrivalDate || "").trim();
    const allFollowUps = activeFollowUpsSorted(input.getFollowUps(baseId));
    const records = allFollowUps.filter(
      (r) => String(r?.arrivalYmd || "").trim() === ymd,
    );
    if (records.length <= 1) {
      out.push({
        ...chip,
        focusFollowUpIndex: resolveProsthesisFollowUpFocusIndex({
          arrivalYmd: ymd,
          prosthesisFollowUps: allFollowUps,
        }),
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
      const alreadyHasTemp = out.some((c) => {
        return (
          chipTransferBaseId(c.id) === baseId && c.focusFollowUpIndex === -1
        );
      });
      if (!alreadyHasTemp) {
        const prevYmd =
          String(fus[0]?.previousArrivalYmd || "").trim() ||
          String(chip.arrivalDate || "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(prevYmd)) {
          withTempStage.push({
            ...chip,
            id: `${baseId}:arr:${prevYmd}:stage:temp`,
            arrivalDate: prevYmd,
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
