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
  resolveStarDowngrade,
} from "../../utils/practiceLabRating.js";

describe("practiceLabRating auto-match gate", () => {
  const labId = "64b000000000000000000001";

  test("own 1-star no longer hard-blocks; minStars gate only", () => {
    const ratings = [{ labAnchorId: labId, stars: 1, ratingCount: 1 }];
    expect(isLabBlockedByOwnOneStar({ ratings, labAnchorId: labId })).toBe(
      false,
    );
    // grace(≤2) → effective 3, so min 3 passes even with own 1-star
    expect(
      isLabBlockedByPracticeRating({
        ratings,
        labAnchorId: labId,
        minStars: 3,
      }),
    ).toBe(false);
    expect(
      isLabBlockedByPracticeRating({
        ratings,
        aggregated: new Map([
          [labId, { stars: 5, ratingCount: AUTO_MATCH_RATING_COUNT_GRACE }],
        ]),
        labAnchorId: labId,
        minStars: 3,
      }),
    ).toBe(false);
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

  test("min 1 allows low effective stars; fee multipliers", () => {
    expect(normalizeAutoMatchMinLabRating(1)).toBe(1);
    expect(normalizeAutoMatchMinLabRating(2)).toBe(2);
    expect(normalizeAutoMatchMinLabRating(5)).toBe(5);
    expect(feeMultiplierForStars(1)).toBe(0.8);
    expect(feeMultiplierForStars(2)).toBe(0.9);
    expect(feeMultiplierForStars(3)).toBe(1);
    expect(feeMultiplierForStars(4)).toBe(1.1);
    expect(feeMultiplierForStars(5)).toBe(1.2);
    expect(
      isLabBlockedByPracticeRating({
        ratings: [],
        aggregated: new Map([
          [
            labId,
            { stars: 1.2, ratingCount: AUTO_MATCH_RATING_COUNT_GRACE + 1 },
          ],
        ]),
        labAnchorId: labId,
        minStars: 1,
      }),
    ).toBe(false);
  });

  test("effectiveLabStars grace includes 3 ratings", () => {
    expect(effectiveLabStars({ stars: 1, ratingCount: 0 })).toBe(
      DEFAULT_EFFECTIVE_LAB_STARS,
    );
    expect(effectiveLabStars({ stars: 1, ratingCount: 3 })).toBe(
      DEFAULT_EFFECTIVE_LAB_STARS,
    );
    expect(effectiveLabStars({ stars: 4.5, ratingCount: 4 })).toBe(4.5);
  });

  test("resolveStarDowngrade when lab fee tier above request", () => {
    expect(
      resolveStarDowngrade({
        matchingMode: "auto",
        labEffectiveStars: 5,
        autoMatchStars: 3,
        offeredLabFee: 100000,
      }),
    ).toEqual({
      labEffectiveStars: 5,
      autoMatchStars: 3,
      labFeeMultiplier: 1.2,
      autoMatchFeeMultiplier: 1,
      offeredLabFee: 100000,
      expectedLabFeeAtOwnStars: 120000,
      labFeeDeltaWon: 20000,
    });
    expect(
      resolveStarDowngrade({
        matchingMode: "auto",
        labEffectiveStars: 3,
        autoMatchStars: 3,
        offeredLabFee: 100000,
      }),
    ).toBeNull();
    expect(
      resolveStarDowngrade({
        matchingMode: "direct",
        labEffectiveStars: 5,
        autoMatchStars: 3,
        offeredLabFee: 100000,
      }),
    ).toBeNull();
    expect(
      resolveStarDowngrade({
        matchingMode: "auto",
        labEffectiveStars: 4.2,
        autoMatchStars: 3,
        offeredLabFee: 90000,
      })?.labFeeDeltaWon,
    ).toBe(9000);
  });
});
