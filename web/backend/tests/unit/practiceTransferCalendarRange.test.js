import { describe, expect, it } from "@jest/globals";

import {
  buildPracticeTransferCalendarDateRangeFilter,
  filterTransferDocsToCalendarRange,
  mergeCalendarRangeWithUnreadFilter,
  parsePracticeTransferCalendarRangeQuery,
  practiceTransferIntersectsCalendarRange,
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
  it("builds orderDate filter with orderDates elemMatch OR legacy createdAt", () => {
    const filter = buildPracticeTransferCalendarDateRangeFilter({
      fromYmd: "2026-08-01",
      toYmd: "2026-08-31",
      dateKey: "orderDate",
    });
    expect(filter).toBeTruthy();
    expect(Array.isArray(filter.$or)).toBe(true);
    const json = JSON.stringify(filter);
    expect(json).toContain("orderDates");
    expect(json).toContain("$elemMatch");
    expect(json).toContain("createdAt");
    expect(json).not.toContain("$regexFind");
    expect(json).not.toContain("주문일");
  });

  it("builds arrivalDate filter with arrivalDates elemMatch OR legacy createdAt", () => {
    const filter = buildPracticeTransferCalendarDateRangeFilter({
      fromYmd: "2026-08-01",
      toYmd: "2026-08-31",
      dateKey: "arrivalDate",
    });
    expect(filter).toBeTruthy();
    expect(Array.isArray(filter.$or)).toBe(true);
    const json = JSON.stringify(filter);
    expect(json).toContain("arrivalDates");
    expect(json).toContain("$elemMatch");
    expect(json).not.toContain("$regexFind");
  });
});

describe("practiceTransferIntersectsCalendarRange", () => {
  it("matches orderDates inside range", () => {
    expect(
      practiceTransferIntersectsCalendarRange(
        { orderDates: ["2026-07-01", "2026-08-15"] },
        { fromYmd: "2026-08-01", toYmd: "2026-08-31", dateKey: "orderDate" },
      ),
    ).toBe(true);
  });

  it("falls back to createdAt KST when no orderDates", () => {
    expect(
      practiceTransferIntersectsCalendarRange(
        { createdAt: new Date("2026-08-10T12:00:00.000+09:00") },
        { fromYmd: "2026-08-01", toYmd: "2026-08-31", dateKey: "orderDate" },
      ),
    ).toBe(true);
    expect(
      practiceTransferIntersectsCalendarRange(
        { createdAt: new Date("2026-07-01T12:00:00.000+09:00") },
        { fromYmd: "2026-08-01", toYmd: "2026-08-31", dateKey: "orderDate" },
      ),
    ).toBe(false);
  });
});

describe("filterTransferDocsToCalendarRange", () => {
  it("keeps extra docs even outside range", () => {
    const docs = [
      { _id: "in", orderDates: ["2026-08-10"] },
      { _id: "out", orderDates: ["2026-07-01"] },
    ];
    const filtered = filterTransferDocsToCalendarRange(
      docs,
      { fromYmd: "2026-08-01", toYmd: "2026-08-31", dateKey: "orderDate" },
      { keepExtra: (doc) => String(doc._id) === "out" },
    );
    expect(filtered.map((d) => d._id).sort()).toEqual(["in", "out"]);
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
