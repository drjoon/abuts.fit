import { describe, expect, it } from "@jest/globals";

import {
  addCivilDaysYmd,
  appendPracticeArrivalDate,
  compactPracticeArrivalDatesToSingleFuture,
  PRACTICE_ARRIVAL_SHADE_EXTEND_CIVIL_DAYS,
  resolvePracticeArrivalDates,
  syncArrivalDatesWithMemoYmd,
} from "../../utils/practiceTransferArrivalDates.js";

describe("practiceTransferArrivalDates", () => {
  it("adds civil days", () => {
    expect(addCivilDaysYmd("2026-08-27", 7)).toBe("2026-09-03");
    expect(PRACTICE_ARRIVAL_SHADE_EXTEND_CIVIL_DAYS).toBe(7);
  });

  it("seeds from memo when arrivalDates empty", () => {
    expect(
      resolvePracticeArrivalDates({
        arrivalDates: [],
        transferMemo: "[치과도착일: 2026-08-27]\n환자",
      }),
    ).toEqual(["2026-08-27"]);
  });

  it("appends new arrival and updates memo current tag", () => {
    const result = appendPracticeArrivalDate({
      transferMemo: "[주문일: 2026-08-19]\n[치과도착일: 2026-08-27]\n메모",
      arrivalDates: ["2026-08-27"],
      nextYmd: "2026-09-03",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.arrivalDates).toEqual(["2026-08-27", "2026-09-03"]);
    expect(result.previousYmd).toBe("2026-08-27");
    expect(result.nextYmd).toBe("2026-09-03");
    expect(result.transferMemo).toContain("[도착일: 2026-09-03]");
    expect(result.unchanged).toBe(false);
  });

  it("defaults next to today+7 civil days", () => {
    const result = appendPracticeArrivalDate({
      transferMemo: "[치과도착일: 2026-08-20]",
      arrivalDates: ["2026-08-20"],
      now: new Date("2026-08-27T07:00:00+09:00"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextYmd).toBe("2026-09-03");
    expect(result.arrivalDates).toEqual(["2026-08-20", "2026-09-03"]);
  });

  it("replaces future re-arrival instead of stacking (keep only past/today history)", () => {
    const result = appendPracticeArrivalDate({
      transferMemo: "[치과도착일: 2026-09-10]",
      arrivalDates: ["2026-08-27", "2026-09-03", "2026-09-10"],
      nextYmd: "2026-09-03",
      now: new Date("2026-08-27T07:00:00+09:00"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 09-03·09-10은 모두 오늘(08-27) 이후 → 최종 09-03만 남고 잘못 고른 09-10은 제거
    expect(result.arrivalDates).toEqual(["2026-08-27", "2026-09-03"]);
    expect(result.previousYmd).toBe("2026-09-10");
    expect(result.nextYmd).toBe("2026-09-03");
  });

  it("keeps a single future slot when changing from one future day to another", () => {
    const result = appendPracticeArrivalDate({
      transferMemo: "[치과도착일: 2026-09-03]",
      arrivalDates: ["2026-08-27", "2026-09-03"],
      nextYmd: "2026-09-10",
      now: new Date("2026-08-27T07:00:00+09:00"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.arrivalDates).toEqual(["2026-08-27", "2026-09-10"]);
    expect(result.previousYmd).toBe("2026-09-03");
  });

  it("rejects dates before today", () => {
    const result = appendPracticeArrivalDate({
      transferMemo: "[치과도착일: 2026-09-10]",
      arrivalDates: ["2026-09-10"],
      nextYmd: "2026-08-20",
      now: new Date("2026-08-27T07:00:00+09:00"),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("arrival_before_today");
  });

  it("syncs create memo into single arrivalDates entry", () => {
    expect(
      syncArrivalDatesWithMemoYmd({
        previousArrivalDates: [],
        previousMemo: "",
        nextMemo: "[치과도착일: 2026-08-27]",
      }),
    ).toEqual(["2026-08-27"]);
  });

  it("compacts stacked future dates down to current + past/today history", () => {
    expect(
      compactPracticeArrivalDatesToSingleFuture(
        ["2026-08-27", "2026-09-10", "2026-09-03"],
        new Date("2026-08-27T07:00:00+09:00"),
      ),
    ).toEqual(["2026-08-27", "2026-09-03"]);
  });
});
