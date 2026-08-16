// related files:
// - web/backend/utils/practiceLabRating.js

import {
  AUTO_MATCH_RATING_COUNT_GRACE,
  DEFAULT_EFFECTIVE_LAB_STARS,
  effectiveLabStars,
  feeMultiplierForStars,
  isLabBlockedByOwnOneStar,
  isLabBlockedByPracticeRating,
  normalizeAutoMatchMinLabRating,
} from "../../utils/practiceLabRating.js";

describe("practiceLabRating auto-match gate", () => {
  const labId = "64b000000000000000000001";

  test("own 1-star blocks regardless of grace or minStars", () => {
    const ratings = [{ labAnchorId: labId, stars: 1, ratingCount: 1 }];
    expect(isLabBlockedByOwnOneStar({ ratings, labAnchorId: labId })).toBe(
      true,
    );
    expect(
      isLabBlockedByPracticeRating({
        ratings,
        labAnchorId: labId,
        minStars: 3,
      }),
    ).toBe(true);
    expect(
      isLabBlockedByPracticeRating({
        ratings,
        aggregated: new Map([
          [labId, { stars: 5, ratingCount: AUTO_MATCH_RATING_COUNT_GRACE }],
        ]),
        labAnchorId: labId,
        minStars: 3,
      }),
    ).toBe(true);
  });

  test("own 2+ stars does not hard-block; grace uses effective 3", () => {
    const ratings = [{ labAnchorId: labId, stars: 2, ratingCount: 1 }];
    expect(isLabBlockedByOwnOneStar({ ratings, labAnchorId: labId })).toBe(
      false,
    );
    expect(
      isLabBlockedByPracticeRating({
        ratings,
        aggregated: new Map([
          [labId, { stars: 1.5, ratingCount: AUTO_MATCH_RATING_COUNT_GRACE }],
        ]),
        labAnchorId: labId,
        minStars: 3,
      }),
    ).toBe(false);
  });

  test("global average below min blocks only after grace", () => {
    expect(
      isLabBlockedByPracticeRating({
        ratings: [],
        aggregated: new Map([
          [
            labId,
            { stars: 2.5, ratingCount: AUTO_MATCH_RATING_COUNT_GRACE + 1 },
          ],
        ]),
        labAnchorId: labId,
        minStars: 3,
      }),
    ).toBe(true);
    expect(
      isLabBlockedByPracticeRating({
        ratings: [],
        aggregated: new Map([
          [
            labId,
            { stars: 4.2, ratingCount: AUTO_MATCH_RATING_COUNT_GRACE + 1 },
          ],
        ]),
        labAnchorId: labId,
        minStars: 4,
      }),
    ).toBe(false);
  });

  test("unrated lab uses effective 3 and passes min 3", () => {
    expect(
      isLabBlockedByPracticeRating({
        ratings: [],
        aggregated: new Map(),
        labAnchorId: labId,
        minStars: 3,
      }),
    ).toBe(false);
    expect(
      isLabBlockedByPracticeRating({
        ratings: [],
        aggregated: new Map(),
        labAnchorId: labId,
        minStars: 4,
      }),
    ).toBe(true);
  });

  test("feeMultiplierForStars and normalize min", () => {
    expect(normalizeAutoMatchMinLabRating(1)).toBe(2);
    expect(normalizeAutoMatchMinLabRating(2)).toBe(2);
    expect(normalizeAutoMatchMinLabRating(5)).toBe(5);
    expect(feeMultiplierForStars(2)).toBe(0.9);
    expect(feeMultiplierForStars(3)).toBe(1);
    expect(feeMultiplierForStars(4)).toBe(1.1);
    expect(feeMultiplierForStars(5)).toBe(1.2);
  });

  test("effectiveLabStars grace", () => {
    expect(effectiveLabStars({ stars: 1, ratingCount: 0 })).toBe(
      DEFAULT_EFFECTIVE_LAB_STARS,
    );
    expect(effectiveLabStars({ stars: 1, ratingCount: 2 })).toBe(
      DEFAULT_EFFECTIVE_LAB_STARS,
    );
    expect(effectiveLabStars({ stars: 4.5, ratingCount: 3 })).toBe(4.5);
  });
});
