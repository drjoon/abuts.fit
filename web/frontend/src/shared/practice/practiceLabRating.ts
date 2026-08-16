// related files:
// - web/backend/utils/practiceLabRating.js
// - web/frontend/src/shared/components/practice/PracticeLabRatingControl.tsx
// - web/frontend/src/shared/components/practice/AutoMatchMinLabRatingStars.tsx
// - 2026-08-14: 치과→기공소 rating·자동매칭 최소 별.
// - 2026-08-16: 자동매칭 별점은 전체 치과 평가 합산·평균. 우리 치과 1점 제외.
// - 2026-08-16: 5점제. 자동매칭 최소 2~5. 평가 3회 미만은 유효 3점. 기공비 배수 2/3/4/5→0.9/1/1.1/1.2.
// - 2026-08-16: 1점도 참여 가능(하한 1). 기공비 배수 1→×0.8. 우리치과 1점 하드 차단 제거.
// - 2026-08-16: 평가 3회 이하→유효 3점(유예 상수 3).
// - 2026-08-16: 별점 다운그레이드 — 유효별 수가배수 > 의뢰 별점배수일 때 표시 페이로드.

export const PRACTICE_LAB_RATING_MIN = 1;
export const PRACTICE_LAB_RATING_MAX = 5;
export const PRACTICE_LAB_RATING_MEMO_MAX = 500;
/** 평가 모달 최초 작성 시 기본 별점(기존 평가 없을 때). */
export const DEFAULT_PRACTICE_LAB_RATING_STARS = 3;
export const DEFAULT_AUTO_MATCH_MIN_LAB_RATING = 3;
export const AUTO_MATCH_MIN_SELECTABLE = 1;
/** 이 횟수 이하 평가면 유효 별점=3(미평가 포함). 3회 이하→3, 4회부터 실평균. */
export const AUTO_MATCH_RATING_COUNT_GRACE = 3;
export const DEFAULT_EFFECTIVE_LAB_STARS = 3;

const FEE_MULTIPLIER_BY_STARS: Record<number, number> = {
  1: 0.8,
  2: 0.9,
  3: 1,
  4: 1.1,
  5: 1.2,
};

export type PracticeLabRatingPublic = {
  stars: number;
  memo: string;
  ratingCount: number;
  updatedAt?: string | null;
};

export type LabRatingSummary = {
  stars: number | null;
  ratingCount: number;
  effectiveStars: number;
};

/** 자동매칭 별점 다운그레이드(기공소 수신 카드). */
export type StarDowngradeInfo = {
  labEffectiveStars: number;
  autoMatchStars: number;
  labFeeMultiplier: number;
  autoMatchFeeMultiplier: number;
  offeredLabFee: number;
  expectedLabFeeAtOwnStars: number;
  labFeeDeltaWon: number;
};

export function normalizePracticeLabStars(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const stars = Math.round(n);
  if (stars < PRACTICE_LAB_RATING_MIN || stars > PRACTICE_LAB_RATING_MAX) {
    return null;
  }
  return stars;
}

export function normalizeAutoMatchMinLabRating(value: unknown): number {
  const stars = normalizePracticeLabStars(value);
  if (stars == null) return DEFAULT_AUTO_MATCH_MIN_LAB_RATING;
  return Math.max(AUTO_MATCH_MIN_SELECTABLE, stars);
}

export function feeMultiplierForStars(stars: unknown): number {
  const n = normalizeAutoMatchMinLabRating(stars);
  return FEE_MULTIPLIER_BY_STARS[n] ?? 1;
}

export function effectiveLabStars({
  stars,
  ratingCount,
}: {
  stars?: unknown;
  ratingCount?: unknown;
} = {}): number {
  const count = Math.max(0, Math.floor(Number(ratingCount) || 0));
  if (count <= AUTO_MATCH_RATING_COUNT_GRACE) {
    return DEFAULT_EFFECTIVE_LAB_STARS;
  }
  const n = Number(stars);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_EFFECTIVE_LAB_STARS;
  return n;
}

export function normalizePracticeLabRatingMemo(value: unknown): string {
  return String(value || "")
    .trim()
    .slice(0, PRACTICE_LAB_RATING_MEMO_MAX);
}

export function parsePracticeLabRatingPublic(
  raw: unknown,
): PracticeLabRatingPublic | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const stars = normalizePracticeLabStars(row.stars);
  if (stars == null) return null;
  return {
    stars,
    memo: normalizePracticeLabRatingMemo(row.memo),
    ratingCount: Math.max(1, Math.floor(Number(row.ratingCount) || 1)),
    updatedAt: row.updatedAt ? String(row.updatedAt) : null,
  };
}

export function parseLabRatingSummary(raw: unknown): LabRatingSummary {
  if (!raw || typeof raw !== "object") {
    return {
      stars: null,
      ratingCount: 0,
      effectiveStars: DEFAULT_EFFECTIVE_LAB_STARS,
    };
  }
  const row = raw as Record<string, unknown>;
  const ratingCount = Math.max(0, Math.floor(Number(row.ratingCount) || 0));
  const starsRaw = Number(row.stars);
  const stars =
    ratingCount > 0 && Number.isFinite(starsRaw) ? starsRaw : null;
  return {
    stars,
    ratingCount,
    effectiveStars: effectiveLabStars({ stars: starsRaw, ratingCount }),
  };
}

/**
 * 자동매칭 별점 다운그레이드.
 * 기공소 유효 별점의 수가배수 > 의뢰(자동매칭) 별점 배수이면 표시용 페이로드.
 */
export function resolveStarDowngrade({
  matchingMode,
  labEffectiveStars,
  autoMatchStars,
  offeredLabFee = 0,
}: {
  matchingMode?: unknown;
  labEffectiveStars?: unknown;
  autoMatchStars?: unknown;
  offeredLabFee?: unknown;
} = {}): StarDowngradeInfo | null {
  if (String(matchingMode || "").trim() !== "auto") return null;
  const requestStars = normalizePracticeLabStars(autoMatchStars);
  if (requestStars == null) return null;

  const labEffRaw = Number(labEffectiveStars);
  const labEff =
    Number.isFinite(labEffRaw) && labEffRaw > 0
      ? labEffRaw
      : DEFAULT_EFFECTIVE_LAB_STARS;
  const labMult = feeMultiplierForStars(labEff);
  const requestMult = feeMultiplierForStars(requestStars);
  if (!(labMult > requestMult)) return null;

  const offered = Math.max(0, Math.round(Number(offeredLabFee) || 0));
  const expected =
    offered > 0 && requestMult > 0
      ? Math.max(0, Math.round((offered * labMult) / requestMult))
      : 0;
  const delta = Math.max(0, expected - offered);

  return {
    labEffectiveStars: labEff,
    autoMatchStars: requestStars,
    labFeeMultiplier: labMult,
    autoMatchFeeMultiplier: requestMult,
    offeredLabFee: offered,
    expectedLabFeeAtOwnStars: expected,
    labFeeDeltaWon: delta,
  };
}

export function parseStarDowngrade(raw: unknown): StarDowngradeInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  return resolveStarDowngrade({
    matchingMode: "auto",
    labEffectiveStars: row.labEffectiveStars,
    autoMatchStars: row.autoMatchStars,
    offeredLabFee: row.offeredLabFee,
  });
}

/** 별점 숫자 라벨(4 → "4", 4.25 → "4.3"). */
export function formatLabStarsLabel(stars: unknown): string {
  const n = Number(stars);
  if (!Number.isFinite(n) || n <= 0) return String(DEFAULT_EFFECTIVE_LAB_STARS);
  if (n % 1 !== 0) return n.toFixed(1);
  return String(Math.round(n * 10) / 10);
}
