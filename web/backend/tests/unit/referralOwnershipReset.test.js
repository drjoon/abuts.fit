// related files:
// - web/backend/utils/referralOwnershipReset.util.js
import {
  REFERRAL_OWNERSHIP_INACTIVE_DAYS,
  isSalesReferrerBusinessType,
  resolveLastActivityAt,
  resolveReferralOwnershipCutoffAt,
  shouldResetReferralOwnership,
} from "../../utils/referralOwnershipReset.util.js";

describe("referral ownership reset helpers", () => {
  test("inactive days constant is 90", () => {
    expect(REFERRAL_OWNERSHIP_INACTIVE_DAYS).toBe(90);
  });

  test("sales referrer types only", () => {
    expect(isSalesReferrerBusinessType("salesman")).toBe(true);
    expect(isSalesReferrerBusinessType("salesTeam")).toBe(true);
    expect(isSalesReferrerBusinessType("devops")).toBe(false);
    expect(isSalesReferrerBusinessType("requestor")).toBe(false);
  });

  test("cutoff is KST today midnight minus 90 days", () => {
    const now = new Date("2026-09-21T12:00:00+09:00");
    const cutoff = resolveReferralOwnershipCutoffAt(now, 90);
    expect(cutoff.toISOString()).toBe(
      new Date("2026-06-23T00:00:00+09:00").toISOString(),
    );
  });

  test("last activity prefers newer of signup vs last request", () => {
    const createdAt = new Date("2026-01-01T00:00:00+09:00");
    const lastRequestAt = new Date("2026-03-01T00:00:00+09:00");
    expect(
      resolveLastActivityAt({ createdAt, lastRequestAt }).getTime(),
    ).toBe(lastRequestAt.getTime());
    expect(
      resolveLastActivityAt({ createdAt, lastRequestAt: null }).getTime(),
    ).toBe(createdAt.getTime());
  });

  test("code entry restarts the clock ahead of business createdAt", () => {
    const createdAt = new Date("2026-01-01T00:00:00+09:00");
    const referralAssignedAt = new Date("2026-09-01T00:00:00+09:00");
    const lastCreditSpendAt = new Date("2026-08-01T00:00:00+09:00");
    expect(
      resolveLastActivityAt({
        createdAt,
        referralAssignedAt,
        lastCreditSpendAt,
      }).getTime(),
    ).toBe(referralAssignedAt.getTime());
  });

  test("should reset only when last activity is strictly before cutoff", () => {
    const cutoff = new Date("2026-06-23T00:00:00+09:00");
    expect(
      shouldResetReferralOwnership({
        lastActivityAt: new Date("2026-06-22T23:59:59+09:00"),
        cutoffAt: cutoff,
      }),
    ).toBe(true);
    expect(
      shouldResetReferralOwnership({
        lastActivityAt: cutoff,
        cutoffAt: cutoff,
      }),
    ).toBe(false);
    expect(
      shouldResetReferralOwnership({
        lastActivityAt: new Date("2026-06-24T00:00:00+09:00"),
        cutoffAt: cutoff,
      }),
    ).toBe(false);
  });
});
