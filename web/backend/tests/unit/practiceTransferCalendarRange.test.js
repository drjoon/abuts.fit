import { describe, expect, it } from "@jest/globals";

import {
  buildPracticeTransferCalendarDateRangeFilter,
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
  it("builds orderDate memo filter", () => {
    const filter = buildPracticeTransferCalendarDateRangeFilter({
      fromYmd: "2026-08-01",
      toYmd: "2026-08-31",
      dateKey: "orderDate",
    });
    expect(filter).toBeTruthy();
    expect(filter.$expr).toBeTruthy();
  });

  it("builds arrivalDate memo filter", () => {
    const filter = buildPracticeTransferCalendarDateRangeFilter({
      fromYmd: "2026-08-01",
      toYmd: "2026-08-31",
      dateKey: "arrivalDate",
    });
    expect(filter).toBeTruthy();
    expect(String(JSON.stringify(filter))).toContain("치과도착일");
  });
});
