// related files:
// - web/backend/controllers/businesses/business.demoMode.util.js
import {
  DEMO_MODE_DURATION_DAYS,
  resolveDemoModeExpiresAt,
  isDemoModeExpired,
} from "../../controllers/businesses/business.demoMode.util.js";

describe("demo mode expiry helpers", () => {
  test("resolveDemoModeExpiresAt is startedAt + DEMO_MODE_DURATION_DAYS", () => {
    const started = new Date("2026-08-06T00:00:00+09:00");
    const expires = resolveDemoModeExpiresAt(started);
    expect(expires).toBeInstanceOf(Date);
    const expected =
      started.getTime() + DEMO_MODE_DURATION_DAYS * 24 * 60 * 60 * 1000;
    expect(expires.getTime()).toBe(expected);
  });

  test("isDemoModeExpired false before duration, true after", () => {
    const started = new Date("2026-08-06T00:00:00+09:00");
    const mid = new Date(started.getTime() + 10 * 24 * 60 * 60 * 1000);
    const after = new Date(
      started.getTime() + DEMO_MODE_DURATION_DAYS * 24 * 60 * 60 * 1000,
    );
    expect(isDemoModeExpired(started, mid)).toBe(false);
    expect(isDemoModeExpired(started, after)).toBe(true);
  });
});
