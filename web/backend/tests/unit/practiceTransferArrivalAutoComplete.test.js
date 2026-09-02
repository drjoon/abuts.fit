import { describe, expect, it } from "@jest/globals";

import {
  isPracticeArrivalDatePast,
  isPracticeTransferDueForArrivalAutoComplete,
  resolvePracticeTransferCurrentArrivalYmd,
} from "../../utils/practiceTransferArrivalAutoComplete.js";

describe("practiceTransfer arrival auto-complete eligibility", () => {
  it("treats arrival day itself as not past (reschedule window)", () => {
    expect(isPracticeArrivalDatePast("2026-09-02", "2026-09-02")).toBe(false);
    expect(isPracticeArrivalDatePast("2026-09-03", "2026-09-02")).toBe(false);
    expect(isPracticeArrivalDatePast("2026-09-01", "2026-09-02")).toBe(true);
  });

  it("resolves current arrival from arrivalDates last entry", () => {
    expect(
      resolvePracticeTransferCurrentArrivalYmd({
        arrivalDates: ["2026-08-20", "2026-09-05"],
        transferMemo: "[치과도착일: 2026-08-20]",
      }),
    ).toBe("2026-09-05");
  });

  it("does not auto-complete on arrival day; does after it passes", () => {
    const base = {
      status: "active",
      requestorDownloadedAt: new Date("2026-08-28T01:00:00.000Z"),
      arrivalDates: ["2026-09-02"],
      autoMatch: { completedAt: null },
    };
    expect(
      isPracticeTransferDueForArrivalAutoComplete(base, "2026-09-02"),
    ).toBe(false);
    expect(
      isPracticeTransferDueForArrivalAutoComplete(base, "2026-09-03"),
    ).toBe(true);
  });

  it("extends deadline when arrival is rescheduled before auto-complete", () => {
    const before = {
      status: "active",
      requestorDownloadedAt: new Date("2026-08-28T01:00:00.000Z"),
      arrivalDates: ["2026-09-02"],
      autoMatch: { completedAt: null },
    };
    expect(
      isPracticeTransferDueForArrivalAutoComplete(before, "2026-09-03"),
    ).toBe(true);

    const extended = {
      ...before,
      arrivalDates: ["2026-09-02", "2026-09-10"],
    };
    expect(
      isPracticeTransferDueForArrivalAutoComplete(extended, "2026-09-03"),
    ).toBe(false);
  });

  it("skips already completed or unaccepted transfers", () => {
    expect(
      isPracticeTransferDueForArrivalAutoComplete(
        {
          status: "active",
          requestorDownloadedAt: null,
          arrivalDates: ["2026-09-01"],
        },
        "2026-09-03",
      ),
    ).toBe(false);
    expect(
      isPracticeTransferDueForArrivalAutoComplete(
        {
          status: "active",
          requestorDownloadedAt: new Date(),
          arrivalDates: ["2026-09-01"],
          autoMatch: { completedAt: new Date() },
        },
        "2026-09-03",
      ),
    ).toBe(false);
  });
});
