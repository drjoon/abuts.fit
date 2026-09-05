// related files:
// - web/backend/utils/guideTour.util.js
import {
  applyGuideTourAlwaysOnToUserPayload,
  isGuideTourAlwaysOnBusiness,
  normalizeGuideTour,
} from "../../utils/guideTour.util.js";

describe("guideTour.util", () => {
  test("isGuideTourAlwaysOnBusiness matches test BA names only", () => {
    expect(isGuideTourAlwaysOnBusiness("테스트치과")).toBe(true);
    expect(isGuideTourAlwaysOnBusiness("테스트기공소")).toBe(true);
    expect(isGuideTourAlwaysOnBusiness(" 테스트치과 ")).toBe(true);
    expect(isGuideTourAlwaysOnBusiness("향기로운치과")).toBe(false);
    expect(isGuideTourAlwaysOnBusiness("")).toBe(false);
    expect(isGuideTourAlwaysOnBusiness(null)).toBe(false);
  });

  test("normalizeGuideTour forces completed false when alwaysOn", () => {
    expect(
      normalizeGuideTour(
        { completed: true, resumeStepId: "intro" },
        { alwaysOn: true },
      ),
    ).toEqual({ completed: false, resumeStepId: "intro" });
    expect(
      normalizeGuideTour({ completed: true, resumeStepId: null }),
    ).toEqual({ completed: true, resumeStepId: null });
  });

  test("applyGuideTourAlwaysOnToUserPayload clamps test businesses", () => {
    const clamped = applyGuideTourAlwaysOnToUserPayload({
      business: "테스트기공소",
      guideTour: { completed: true, resumeStepId: null },
    });
    expect(clamped.guideTour).toEqual({
      completed: false,
      resumeStepId: null,
    });

    const kept = applyGuideTourAlwaysOnToUserPayload({
      business: "향기로운치과",
      guideTour: { completed: true, resumeStepId: null },
    });
    expect(kept.guideTour).toEqual({
      completed: true,
      resumeStepId: null,
    });
  });
});
