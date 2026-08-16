// related files:
// - web/backend/utils/practiceLabRating.js

import {
  AUTO_MATCH_RATING_COUNT_GRACE,
  DEFAULT_AUTO_MATCH_MAX_LAB_RATING,
  DEFAULT_AUTO_MATCH_MIN_LAB_RATING,
  DEFAULT_EFFECTIVE_LAB_STARS,
  effectiveLabStars,
  feeMultiplierForStars,
  findPracticeLabRating,
  isLabBlockedByOwnOneStar,
  isLabBlockedByPracticeRating,
  normalizeAutoMatchMaxLabRating,
  normalizeAutoMatchMinLabRating,
  resolveAutoMatchEligibleStarBand,
  resolveStarDowngrade,
  toPracticeLabRatingApi,
  upsertPracticeLabRatingList,
} from "../../utils/practiceLabRating.js";

describe("practiceLabRating auto-match gate", () => {
  const labId = "64b000000000000000000001";

  test("own 1-star no longer hard-blocks; minStars gate only", () => {
    const ratings = [{ labAnchorId: labId, stars: 1, ratingCount: 1 }];
    expect(isLabBlockedByOwnOneStar({ ratings, labAnchorId: labId })).toBe(
      false,
    );
    expect(
      isLabBlockedByPracticeRating({
        ratings,
        labAnchorId: labId,
        minStars: 3,
        maxStars: 4,
      }),
    ).toBe(false);
  });

  test("defaults are min 3 / max 4", () => {
    expect(DEFAULT_AUTO_MATCH_MIN_LAB_RATING).toBe(3);
    expect(DEFAULT_AUTO_MATCH_MAX_LAB_RATING).toBe(4);
    expect(normalizeAutoMatchMinLabRating(null)).toBe(3);
    expect(normalizeAutoMatchMaxLabRating(null)).toBe(4);
    expect(resolveAutoMatchEligibleStarBand({})).toEqual({
      minStars: 3,
      maxStars: 4,
    });
  });

  test("band uses practice min/max; clamps max >= min", () => {
    expect(
      resolveAutoMatchEligibleStarBand({ minStars: 2, maxStars: 5 }),
    ).toEqual({ minStars: 2, maxStars: 5 });
    expect(
      resolveAutoMatchEligibleStarBand({ minStars: 4, maxStars: 2 }),
    ).toEqual({ minStars: 4, maxStars: 4 });
  });

  test("blocks outside [min, max]", () => {
    expect(
      isLabBlockedByPracticeRating({
        ratings: [],
        aggregated: new Map([
          [
            labId,
            { stars: 5, ratingCount: AUTO_MATCH_RATING_COUNT_GRACE + 1 },
          ],
        ]),
        labAnchorId: labId,
        minStars: 2,
        maxStars: 4,
      }),
    ).toBe(true);
    expect(
      isLabBlockedByPracticeRating({
        ratings: [],
        aggregated: new Map([
          [
            labId,
            { stars: 3, ratingCount: AUTO_MATCH_RATING_COUNT_GRACE + 1 },
          ],
        ]),
        labAnchorId: labId,
        minStars: 2,
        maxStars: 4,
      }),
    ).toBe(false);
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
        maxStars: 4,
      }),
    ).toBe(true);
  });

  test("fee multipliers", () => {
    expect(feeMultiplierForStars(1)).toBe(0.8);
    expect(feeMultiplierForStars(2)).toBe(0.9);
    expect(feeMultiplierForStars(3)).toBe(1);
    expect(feeMultiplierForStars(4)).toBe(1.1);
    expect(feeMultiplierForStars(5)).toBe(1.2);
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
        matchingMode: "direct",
        labEffectiveStars: 5,
        autoMatchStars: 3,
        offeredLabFee: 100000,
      }),
    ).toBeNull();
  });
});

describe("practiceLabRating one-per-practice-lab", () => {
  const labId = "64b000000000000000000001";
  const otherLabId = "64b000000000000000000002";

  test("upsert creates one row with ratingCount 1", () => {
    const next = upsertPracticeLabRatingList([], labId, 4, "첫 평가");
    expect(next).toHaveLength(1);
    expect(next[0].stars).toBe(4);
    expect(next[0].memo).toBe("첫 평가");
    expect(next[0].ratingCount).toBe(1);
    expect(String(next[0].labAnchorId)).toBe(labId);
  });

  test("re-rate replaces previous stars/memo and keeps ratingCount 1", () => {
    const existing = [
      {
        labAnchorId: labId,
        stars: 2,
        memo: "이전",
        ratingCount: 7,
        updatedAt: new Date("2026-01-01"),
      },
      {
        labAnchorId: otherLabId,
        stars: 5,
        memo: "다른 기공소",
        ratingCount: 1,
        updatedAt: new Date("2026-01-01"),
      },
    ];
    const next = upsertPracticeLabRatingList(existing, labId, 5, "새 평가");
    expect(next).toHaveLength(2);
    const updated = next.find((r) => String(r.labAnchorId) === labId);
    const other = next.find((r) => String(r.labAnchorId) === otherLabId);
    expect(updated).toMatchObject({
      stars: 5,
      memo: "새 평가",
      ratingCount: 1,
    });
    expect(other).toMatchObject({
      stars: 5,
      memo: "다른 기공소",
      ratingCount: 1,
    });
  });

  test("API view normalizes legacy ratingCount > 1 to 1", () => {
    expect(
      toPracticeLabRatingApi({
        labAnchorId: labId,
        stars: 3,
        memo: "x",
        ratingCount: 9,
      }),
    ).toMatchObject({ stars: 3, ratingCount: 1 });
    expect(
      findPracticeLabRating(
        [{ labAnchorId: labId, stars: 4, ratingCount: 5 }],
        labId,
      ),
    ).toMatchObject({ stars: 4, ratingCount: 1 });
  });
});
