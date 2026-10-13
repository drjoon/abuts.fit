// related files:
// - web/backend/utils/requestorReferralWindow.util.js
import {
  ABUTS_ADMIN_REFERRAL_CODE,
  REQUESTOR_REFERRAL_SELF_SET_DAYS,
  canSelfRegisterReferralCode,
  isReservedReferralCode,
  isWithinReferralSelfSetWindow,
  resolveReferralSelfSetExpiresAt,
  shouldAssignAbutsAdminReferral,
} from "../../utils/requestorReferralWindow.util.js";

describe("requestor referral self-set window", () => {
  const signupAt = new Date("2026-10-01T03:00:00+09:00");

  test("admin code is AAA and the window is 14 days", () => {
    expect(ABUTS_ADMIN_REFERRAL_CODE).toBe("AAA");
    expect(REQUESTOR_REFERRAL_SELF_SET_DAYS).toBe(14);
    expect(isReservedReferralCode("aaa")).toBe(true);
    expect(isReservedReferralCode("AAB")).toBe(false);
  });

  test("expires exactly 14 days after signup", () => {
    const expiresAt = resolveReferralSelfSetExpiresAt(signupAt);
    expect(expiresAt.toISOString()).toBe(
      new Date("2026-10-15T03:00:00+09:00").toISOString(),
    );
    expect(isWithinReferralSelfSetWindow(signupAt, new Date(expiresAt.getTime() - 1))).toBe(
      true,
    );
    expect(isWithinReferralSelfSetWindow(signupAt, expiresAt)).toBe(false);
  });

  test("unowned requestor can register only inside the window", () => {
    expect(
      canSelfRegisterReferralCode({
        signupAt,
        now: new Date("2026-10-10T00:00:00+09:00"),
      }),
    ).toBe(true);
    expect(
      canSelfRegisterReferralCode({
        signupAt,
        now: new Date("2026-10-20T00:00:00+09:00"),
      }),
    ).toBe(false);
  });

  test("past the window, unowned requestors take the admin code", () => {
    expect(
      shouldAssignAbutsAdminReferral({
        signupAt,
        now: new Date("2026-10-20T00:00:00+09:00"),
      }),
    ).toBe(true);
    expect(
      shouldAssignAbutsAdminReferral({
        signupAt,
        now: new Date("2026-10-10T00:00:00+09:00"),
      }),
    ).toBe(false);
  });

  test("an existing referrer or a reset reclaim is not overwritten", () => {
    const later = new Date("2026-10-20T00:00:00+09:00");
    expect(
      shouldAssignAbutsAdminReferral({
        hasReferrer: true,
        signupAt,
        now: later,
      }),
    ).toBe(false);
    expect(
      shouldAssignAbutsAdminReferral({
        hasPriorDefault: true,
        signupAt,
        now: later,
      }),
    ).toBe(false);
    expect(
      canSelfRegisterReferralCode({
        hasPriorDefault: true,
        signupAt,
        now: later,
      }),
    ).toBe(true);
    expect(
      canSelfRegisterReferralCode({
        hasReferrer: true,
        signupAt,
        now: new Date("2026-10-02T00:00:00+09:00"),
      }),
    ).toBe(false);
  });
});
