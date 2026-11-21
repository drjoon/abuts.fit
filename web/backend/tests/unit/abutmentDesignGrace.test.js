import {
  ABUTMENT_DESIGN_GRACE_MS,
  abutmentDesignGraceDeadline,
  isAbutmentGraceOpen,
} from "../../services/abutmentDesignRoute.js";

describe("abutment design grace", () => {
  test("deadline is five minutes after confirm", () => {
    const from = new Date("2026-11-21T08:00:00.000Z");
    const deadline = abutmentDesignGraceDeadline(from);
    expect(deadline.getTime() - from.getTime()).toBe(ABUTMENT_DESIGN_GRACE_MS);
    expect(ABUTMENT_DESIGN_GRACE_MS).toBe(5 * 60 * 1000);
  });

  test("grace stays open until the deadline and closes after lab confirm", () => {
    const now = new Date("2026-11-21T08:01:00.000Z");
    const open = {
      abutmentGracePromoteAt: "2026-11-21T08:05:00.000Z",
      labDesignConfirmedAt: null,
    };
    expect(isAbutmentGraceOpen(open, now)).toBe(true);
    expect(
      isAbutmentGraceOpen(
        { ...open, labDesignConfirmedAt: "2026-11-21T08:00:30.000Z" },
        now,
      ),
    ).toBe(false);
    expect(
      isAbutmentGraceOpen(
        { abutmentGracePromoteAt: "2026-11-21T08:00:30.000Z" },
        now,
      ),
    ).toBe(false);
    expect(isAbutmentGraceOpen({}, now)).toBe(false);
  });
});
