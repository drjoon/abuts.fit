// related files:
// - web/backend/services/practiceMembership.helpers.js
import {
  addCalendarMonthsKst,
  buildJoinSet,
  buildExpireSet,
  buildPracticeMembershipChargeIdempotencyKey,
  resolvePracticeMembershipMonthlyFee,
  resolveNextBillingAt,
} from "../../services/practiceMembership.helpers.js";

describe("practiceMembership helpers", () => {
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

  test("buildJoinSet sets next billing +1 month and active", () => {
    const now = new Date("2026-08-15T12:00:00+09:00");
    const set = buildJoinSet(now);
    expect(set.practiceMembershipActive).toBe(true);
    expect(set.practiceMembershipCancelAtPeriodEnd).toBe(false);
    expect(set.practiceMembershipNextBillingAt.toISOString()).toBe(
      new Date("2026-09-15T00:00:00+09:00").toISOString(),
    );
  });

  test("buildExpireSet clears billing", () => {
    expect(buildExpireSet()).toEqual({
      practiceMembershipActive: false,
      practiceMembershipCancelAtPeriodEnd: false,
      practiceMembershipNextBillingAt: null,
    });
  });

  test("resolvePracticeMembershipMonthlyFee rounds supply amount", () => {
    expect(
      resolvePracticeMembershipMonthlyFee({ practiceMembershipMonthlyFee: 50000 }),
    ).toBe(50000);
    expect(
      resolvePracticeMembershipMonthlyFee({ practiceMembershipMonthlyFee: -1 }),
    ).toBe(0);
    expect(resolvePracticeMembershipMonthlyFee({})).toBe(0);
  });

  test("idempotency key uses KST billing ymd", () => {
    const key = buildPracticeMembershipChargeIdempotencyKey({
      businessAnchorId: "abc123",
      dueAt: new Date("2026-09-15T00:00:00+09:00"),
    });
    expect(key).toBe("gl:practice_membership:abc123:2026-09-15");
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
