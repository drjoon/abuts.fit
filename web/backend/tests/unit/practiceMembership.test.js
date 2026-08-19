// related files:
// - web/backend/services/practiceMembership.helpers.js
import {
  addCalendarMonthsKst,
  resolveNextBillingAt,
} from "../../services/practiceMembership.helpers.js";

describe("KST calendar month helpers", () => {
  test("addCalendarMonthsKst preserves day when possible (KST)", () => {
    const from = new Date("2026-01-15T00:00:00+09:00");
    const next = addCalendarMonthsKst(from, 1);
    expect(next.toISOString()).toBe(
      new Date("2026-02-15T00:00:00+09:00").toISOString(),
    );
  });

  test("addCalendarMonthsKst clamps end-of-month", () => {
    const from = new Date("2026-01-31T00:00:00+09:00");
    const next = addCalendarMonthsKst(from, 1);
    expect(next.toISOString()).toBe(
      new Date("2026-02-28T00:00:00+09:00").toISOString(),
    );
  });

  test("resolveNextBillingAt skips past dues", () => {
    const from = new Date("2026-01-15T00:00:00+09:00");
    const now = new Date("2026-03-20T12:00:00+09:00");
    const next = resolveNextBillingAt({ from, now });
    expect(next.toISOString()).toBe(
      new Date("2026-04-15T00:00:00+09:00").toISOString(),
    );
  });
});
