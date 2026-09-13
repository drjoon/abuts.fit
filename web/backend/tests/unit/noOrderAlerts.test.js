// related files:
// - web/backend/utils/noOrderAlerts.js
import {
  classifyNoOrderTier,
  NO_ORDER_TIER_3M,
  NO_ORDER_TIER_6M,
} from "../../utils/noOrderAlerts.js";

const dayMs = 24 * 60 * 60 * 1000;
const now = new Date("2026-09-13T12:00:00+09:00");

describe("classifyNoOrderTier", () => {
  test("null / invalid → 제외", () => {
    expect(classifyNoOrderTier(null, now)).toBeNull();
    expect(classifyNoOrderTier(undefined, now)).toBeNull();
    expect(classifyNoOrderTier("not-a-date", now)).toBeNull();
  });

  test("89일 → 제외", () => {
    const last = new Date(now.getTime() - 89 * dayMs);
    expect(classifyNoOrderTier(last, now)).toBeNull();
  });

  test("90일 → 3m", () => {
    const last = new Date(now.getTime() - 90 * dayMs);
    expect(classifyNoOrderTier(last, now)).toEqual({
      tier: NO_ORDER_TIER_3M,
      daysSinceCompletion: 90,
    });
  });

  test("179일 → 3m (6m과 중복 없음)", () => {
    const last = new Date(now.getTime() - 179 * dayMs);
    expect(classifyNoOrderTier(last, now)).toEqual({
      tier: NO_ORDER_TIER_3M,
      daysSinceCompletion: 179,
    });
  });

  test("180일 → 6m", () => {
    const last = new Date(now.getTime() - 180 * dayMs);
    expect(classifyNoOrderTier(last, now)).toEqual({
      tier: NO_ORDER_TIER_6M,
      daysSinceCompletion: 180,
    });
  });

  test("ISO 문자열도 분류", () => {
    const last = new Date(now.getTime() - 200 * dayMs).toISOString();
    expect(classifyNoOrderTier(last, now)).toEqual({
      tier: NO_ORDER_TIER_6M,
      daysSinceCompletion: 200,
    });
  });
});
