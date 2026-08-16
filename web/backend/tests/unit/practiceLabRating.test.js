// related files:
// - web/backend/utils/practiceLabRating.js

import {
  AUTO_MATCH_RATING_COUNT_GRACE,
  isLabBlockedByOwnOneStar,
  isLabBlockedByPracticeRating,
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
        minStars: 1,
      }),
    ).toBe(true);
    expect(
      isLabBlockedByPracticeRating({
        ratings,
        aggregated: new Map([
          [labId, { stars: 3, ratingCount: AUTO_MATCH_RATING_COUNT_GRACE }],
        ]),
        labAnchorId: labId,
        minStars: 2,
      }),
    ).toBe(true);
  });

  test("own 2+ stars does not hard-block; grace still applies", () => {
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
        minStars: 2,
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
            { stars: 1.5, ratingCount: AUTO_MATCH_RATING_COUNT_GRACE + 1 },
          ],
        ]),
        labAnchorId: labId,
        minStars: 2,
      }),
    ).toBe(true);
  });
});
