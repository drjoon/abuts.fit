import { describe, expect, it } from "@jest/globals";

import {
  buildPracticeTransferCalendarDateRangeFilter,
  mergeCalendarRangeWithUnreadFilter,
  parsePracticeTransferCalendarRangeQuery,
} from "../../utils/practiceTransferCalendarRange.util.js";

describe("parsePracticeTransferCalendarRangeQuery", () => {
  it("parses fromYmd/toYmd/dateKey", () => {
    expect(
      parsePracticeTransferCalendarRangeQuery({
        fromYmd: "2026-08-01",
        toYmd: "2026-08-31",
        dateKey: "orderDate",
      }),
    ).toEqual({
      fromYmd: "2026-08-01",
      toYmd: "2026-08-31",
      dateKey: "orderDate",
    });
  });

  it("accepts from/to aliases", () => {
    expect(
      parsePracticeTransferCalendarRangeQuery({
        from: "2026-08-01",
        to: "2026-08-31",
        dateKey: "arrivalDate",
      }),
    ).toEqual({
      fromYmd: "2026-08-01",
      toYmd: "2026-08-31",
      dateKey: "arrivalDate",
    });
  });

  it("returns null when range invalid", () => {
    expect(parsePracticeTransferCalendarRangeQuery({ fromYmd: "bad" })).toBeNull();
    expect(
      parsePracticeTransferCalendarRangeQuery({
        fromYmd: "2026-09-01",
        toYmd: "2026-08-01",
      }),
    ).toBeNull();
  });
});

describe("buildPracticeTransferCalendarDateRangeFilter", () => {
  it("builds orderDate filter with orderDates OR memo fallback", () => {
    const filter = buildPracticeTransferCalendarDateRangeFilter({
      fromYmd: "2026-08-01",
      toYmd: "2026-08-31",
      dateKey: "orderDate",
    });
    expect(filter).toBeTruthy();
    expect(Array.isArray(filter.$or)).toBe(true);
    expect(String(JSON.stringify(filter))).toContain("orderDates");
    expect(String(JSON.stringify(filter))).toContain("주문일");
  });

  it("builds arrivalDate filter with arrivalDates OR memo fallback", () => {
    const filter = buildPracticeTransferCalendarDateRangeFilter({
      fromYmd: "2026-08-01",
      toYmd: "2026-08-31",
      dateKey: "arrivalDate",
    });
    expect(filter).toBeTruthy();
    expect(Array.isArray(filter.$or)).toBe(true);
    expect(String(JSON.stringify(filter))).toContain("arrivalDates");
    expect(String(JSON.stringify(filter))).toContain("치과도착일");
  });
});

describe("mergeCalendarRangeWithUnreadFilter", () => {
  it("ORs date-range filter with unread match so out-of-window unread stays listed", () => {
    const calendarFilter = { createdAt: { $gte: "x" } };
    const unreadFilter = { $and: [{ requestorReadAt: null }] };
    expect(mergeCalendarRangeWithUnreadFilter(calendarFilter, unreadFilter)).toEqual({
      $or: [calendarFilter, unreadFilter],
    });
  });
});
