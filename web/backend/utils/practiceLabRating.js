// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/controllers/practiceTransfers/practiceTransferSettings.controller.js
// - web/backend/utils/practiceTransferAutoMatchBudget.js
// - web/frontend/src/shared/practice/practiceLabRating.ts
// - web/frontend/src/shared/components/practice/PracticeLabRatingControl.tsx
// - 2026-08-14: 치과→기공소 rating·메모. 기록 치과·관리자만. 자동매칭 최소 별.
// - 2026-08-16: 자동매칭 별점은 전체 치과 평가 합산·평균. 주문 치과 1점 제외.
// - 2026-08-16: 5점제. 자동매칭 최소 선택 2~5. 평가 3회 미만은 유효 3점. 기공비 배수 2/3/4/5→0.9/1/1.1/1.2.
// - 2026-08-16: 1점도 참여 가능(하한 1). 기공비 배수 1→×0.8. 우리치과 1점 하드 차단 제거.
// - 2026-08-16: 평가 3회 이하→유효 3점(유예 상수 3).
// - 2026-08-16: 별점 다운그레이드 — 유효별 수가배수 > 의뢰 별점배수일 때 표시 페이로드.
// - 2026-08-16: 공개 대역 — 치과가 하한·상한 직접 설정(기본 3~4).
// - 2026-08-16: 치과·기공소 쌍당 평가 1건. 재평가 시 덮어쓰기. 집계 ratingCount=평가 치과 수.
// - 2026-08-19: 신규 지정 의뢰는 평가만. 별점 배수는 레거시 자동매칭 청구용.
// - 2026-08-19: 별점 기공비 배수 폐지(항상 ×1). 청구 할증은 기공소 치과별 labFeeMultiplier만.
// - 2026-08-20: 치과 평가는 별점만. 자동매칭·별점 기공비 할인/할증 없음.
- 2026-08-20: 별점은 수행 기공소(하청 포함). 하한·상한은 지정·하청 수신 게이트.
// - 2026-08-16: scaleAutoMatchFeeToLabStars — 기공소 수신·수락 견적 별점 확정 단일가.

import { Types } from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import { requestorKindCapableAnchorFilter } from "./requestorCapabilities.js";

export const PRACTICE_LAB_RATING_MIN = 1;
export const PRACTICE_LAB_RATING_MAX = 5;
export const PRACTICE_LAB_RATING_MEMO_MAX = 500;
/** 자동매칭 별점 하한 기본값. */
export const DEFAULT_AUTO_MATCH_MIN_LAB_RATING = 3;
/** 자동매칭 별점 상한 기본값. */
export const DEFAULT_AUTO_MATCH_MAX_LAB_RATING = 4;
/** 자동매칭 별 선택 하한. */
export const AUTO_MATCH_MIN_SELECTABLE = 1;
/** 이 치과 수 이하 평가면 유효 별점=3(미평가 포함). 3곳 이하→3, 4곳부터 실평균. */
export const AUTO_MATCH_RATING_COUNT_GRACE = 3;
/** 3회 이하일 때 적용하는 초기 유효 별점. */
export const DEFAULT_EFFECTIVE_LAB_STARS = 3;

/** 별점 1~5. 범위 밖·비숫자면 null. */
export function normalizePracticeLabStars(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const stars = Math.round(n);
  if (stars < PRACTICE_LAB_RATING_MIN || stars > PRACTICE_LAB_RATING_MAX) {
    return null;
  }
  return stars;
}

/** 자동매칭 별점 하한. 미설정·범위 밖 → 기본 3. */
export function normalizeAutoMatchMinLabRating(value) {
  const stars = normalizePracticeLabStars(value);
  if (stars == null) return DEFAULT_AUTO_MATCH_MIN_LAB_RATING;
  return Math.max(AUTO_MATCH_MIN_SELECTABLE, stars);
}

/** 자동매칭 별점 상한. 미설정·범위 밖 → 기본 4. */
export function normalizeAutoMatchMaxLabRating(value) {
  const stars = normalizePracticeLabStars(value);
  if (stars == null) return DEFAULT_AUTO_MATCH_MAX_LAB_RATING;
  return Math.max(AUTO_MATCH_MIN_SELECTABLE, stars);
}

/**
 * 공개 대역. 하한·상한은 치과 설정.
 * max < min이면 max를 min으로 맞춤.
 */
export function resolveAutoMatchEligibleStarBand({
  minStars,
  maxStars,
} = {}) {
  const min = normalizeAutoMatchMinLabRating(minStars);
  const maxRaw = normalizeAutoMatchMaxLabRating(maxStars);
  const max = Math.max(min, maxRaw);
  return { minStars: min, maxStars: max };
}

export const LAB_OUTSIDE_STAR_BAND_REASON = "lab_outside_star_band";
export const LAB_OUTSIDE_STAR_BAND_MESSAGE =
  "선택한 기공소의 별점이 설정 구간 밖이라 이 의뢰를 보낼 수 없습니다.";

/**
 * 검증 기공소 ID 중 유효 별점이 [하한, 상한] 안인 것만.
 * 평가 3곳 이하·미평가는 유효 3점.
 */
export async function filterLabAnchorIdsByStarBand({
  labAnchorIds,
  minStars,
  maxStars,
} = {}) {
  const ids = (Array.isArray(labAnchorIds) ? labAnchorIds : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  if (!ids.length) return [];
  const aggregated = await loadGlobalLabRatingAggregates({ labAnchorIds: ids });
  return ids.filter(
    (id) =>
      !isLabBlockedByPracticeRating({
        aggregated,
        labAnchorId: id,
        minStars,
        maxStars,
      }),
  );
}

export async function assertLabWithinPracticeStarBand({
  labAnchorId,
  minStars,
  maxStars,
} = {}) {
  const labId = String(labAnchorId || "").trim();
  if (!labId) return;
  const kept = await filterLabAnchorIdsByStarBand({
    labAnchorIds: [labId],
    minStars,
    maxStars,
  });
  if (kept.length) return;
  const err = new Error(LAB_OUTSIDE_STAR_BAND_MESSAGE);
  err.statusCode = 409;
  err.code = LAB_OUTSIDE_STAR_BAND_REASON;
  throw err;
}

/** 치과 별점은 평가 전용. 기공비 할인/할증에 쓰지 않음(항상 ×1). */
export function feeMultiplierForStars(_stars) {
  return 1;
}

/** 기공소 유효 별점을 의뢰 공개 대역 안으로 clamp. 미지정이면 기본 3(대역 내). */
export function clampLabStarsToAutoMatchBand(
  labStars,
  { minStars, maxStars } = {},
) {
  const band = resolveAutoMatchEligibleStarBand({ minStars, maxStars });
  const labRaw = Number(labStars);
  const fallback = Math.min(
    band.maxStars,
    Math.max(band.minStars, DEFAULT_EFFECTIVE_LAB_STARS),
  );
  if (!Number.isFinite(labRaw) || labRaw <= 0) return fallback;
  return Math.min(band.maxStars, Math.max(band.minStars, labRaw));
}

/**
 * 자동매칭 상한 수가 → 기공소 유효 별점 배수 단일가.
 * 라인·합산 labFee(max)에 적용. 의뢰 별점 대역 안으로 clamp.
 */
export function scaleAutoMatchFeeToLabStars({
  feeAtMax,
  feeAtMin,
  budgetStars,
  budgetMaxStars,
  labStars,
} = {}) {
  const maxFee = Math.max(0, Math.round(Number(feeAtMax) || 0));
  if (!(maxFee > 0)) return 0;
  const band = resolveAutoMatchEligibleStarBand({
    minStars: budgetStars,
    maxStars: budgetMaxStars ?? budgetStars,
  });
  const minM = feeMultiplierForStars(band.minStars);
  const maxM = feeMultiplierForStars(band.maxStars);
  const labEff = clampLabStarsToAutoMatchBand(labStars, band);
  const labM = feeMultiplierForStars(labEff);
  if (!(maxM > 0) || labM === maxM) return maxFee;
  if (
    labM === minM &&
    feeAtMin != null &&
    Number.isFinite(Number(feeAtMin))
  ) {
    return Math.max(0, Math.round(Number(feeAtMin)));
  }
  return Math.max(0, Math.round((maxFee * labM) / maxM));
}

/**
 * 매칭 참여·필터용 유효 별점.
 * - 평가 치과 3곳 이하(미평가 포함): 3
 * - 그 외: 합산 평균(소수 유지)
 */
export function effectiveLabStars({ stars, ratingCount } = {}) {
  const count = Math.max(0, Math.floor(Number(ratingCount) || 0));
  if (count <= AUTO_MATCH_RATING_COUNT_GRACE) {
    return DEFAULT_EFFECTIVE_LAB_STARS;
  }
  const n = Number(stars);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_EFFECTIVE_LAB_STARS;
  return n;
}

export function normalizePracticeLabRatingMemo(value) {
  return String(value || "")
    .trim()
    .slice(0, PRACTICE_LAB_RATING_MEMO_MAX);
}

export function toPracticeLabRatingApi(row) {
  if (!row || typeof row !== "object") return null;
  const labAnchorId = String(row.labAnchorId || "").trim();
  const stars = normalizePracticeLabStars(row.stars);
  if (!labAnchorId || stars == null) return null;
  // 치과·기공소 쌍당 1건. 레거시 ratingCount>1도 1로 정규화.
  return {
    labAnchorId,
    stars,
    memo: normalizePracticeLabRatingMemo(row.memo),
    ratingCount: 1,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

/** API/FE용: 기공소 ID 비노출 버전(자동매칭 치과 뷰). */
export function toPracticeLabRatingPublicApi(row) {
  const full = toPracticeLabRatingApi(row);
  if (!full) return null;
  return {
    stars: full.stars,
    memo: full.memo,
    ratingCount: full.ratingCount,
    updatedAt: full.updatedAt,
  };
}

/** 기공소 본인에게 공개: 수치·횟수·유효별만(치과 정보 없음). */
export function toLabRatingSummaryApi(aggregatedRow) {
  if (!aggregatedRow || typeof aggregatedRow !== "object") {
    return {
      stars: null,
      ratingCount: 0,
      effectiveStars: DEFAULT_EFFECTIVE_LAB_STARS,
    };
  }
  const ratingCount = Math.max(
    0,
    Math.floor(Number(aggregatedRow.ratingCount) || 0),
  );
  const starsRaw = Number(aggregatedRow.stars);
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
 * 가격 차이는 제시 기공비 × (내배수/의뢰배수) 추정.
 */
export function resolveStarDowngrade({
  matchingMode,
  labEffectiveStars,
  autoMatchStars,
  offeredLabFee = 0,
} = {}) {
  if (String(matchingMode || "").trim() !== "auto") return null;
  const requestStars = normalizePracticeLabStars(autoMatchStars);
  if (requestStars == null) return null;

  const labEffRaw = Number(labEffectiveStars);
  const labEff = Number.isFinite(labEffRaw) && labEffRaw > 0
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

export function findPracticeLabRating(list, labAnchorId) {
  const labId = String(labAnchorId || "").trim();
  if (!labId) return null;
  const rows = Array.isArray(list) ? list : [];
  for (const row of rows) {
    if (String(row?.labAnchorId || "").trim() === labId) {
      return toPracticeLabRatingApi(row);
    }
  }
  return null;
}

/** 이 치과가 rating을 남긴 서로 다른 기공소 수 */
export function countRatedLabAnchors(ratings) {
  const rows = Array.isArray(ratings) ? ratings : [];
  const seen = new Set();
  for (const row of rows) {
    const labId = String(row?.labAnchorId || "").trim();
    if (!labId) continue;
    if (normalizePracticeLabStars(row?.stars) == null) continue;
    seen.add(labId);
  }
  return seen.size;
}

/**
 * @deprecated 1점도 매칭 참여 가능. 항상 false(레거시 호출 호환).
 */
export function isLabBlockedByOwnOneStar() {
  return false;
}

/**
 * 자동매칭 차단(인증 풀은 별도):
 * 유효 별점(3회 이하→3)이 [하한, 상한] 밖이면 true.
 * 하한·상한은 치과 설정(기본 3~4).
 *
 * `aggregated`가 있으면 전체 치과 합산 행을 쓰고, 없으면 레거시 단일 치과 list.
 */
export function isLabBlockedByPracticeRating({
  ratings,
  aggregated = null,
  labAnchorId,
  minStars,
  maxStars = null,
} = {}) {
  const labId = String(labAnchorId || "").trim();
  if (!labId) return false;

  const band = resolveAutoMatchEligibleStarBand({ minStars, maxStars });
  const min = band.minStars;
  const max = band.maxStars;

  let stars = null;
  let ratingCount = 0;
  if (aggregated && typeof aggregated === "object") {
    const row =
      aggregated instanceof Map
        ? aggregated.get(labId)
        : aggregated[labId] || null;
    if (row) {
      stars = Number(row.stars);
      ratingCount = Math.max(0, Math.floor(Number(row.ratingCount) || 0));
    }
  } else {
    const row = findPracticeLabRating(ratings, labId);
    if (row) {
      stars = row.stars;
      ratingCount = row.ratingCount;
    }
  }

  const effective = effectiveLabStars({ stars, ratingCount });
  return effective < min || effective > max;
}

/**
 * 가입 치과(practice) 전체의 기공소 평가를 합산·평균.
 * - ratingCount: 해당 기공소를 평가한 치과 수(쌍당 1건)
 * - stars: 치과별 최신 별점의 단순 평균
 * @returns {Map<string, { labAnchorId: string, stars: number, ratingCount: number }>}
 */
export async function loadGlobalLabRatingAggregates({
  labAnchorIds = null,
} = {}) {
  const practiceFilter = requestorKindCapableAnchorFilter("practice");
  const match = {
    businessType: "requestor",
    ...(practiceFilter || {}),
    "practiceLabRatings.0": { $exists: true },
  };

  const labIds = Array.isArray(labAnchorIds)
    ? labAnchorIds
        .map((id) => String(id || "").trim())
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id))
    : null;

  const pipeline = [
    { $match: match },
    { $project: { practiceLabRatings: 1 } },
    { $unwind: "$practiceLabRatings" },
  ];
  if (labIds && labIds.length > 0) {
    pipeline.push({
      $match: { "practiceLabRatings.labAnchorId": { $in: labIds } },
    });
  }
  // 치과 문서당 unwind 1행 = 그 치과의 최신 평가 1건(레거시 ratingCount 무시).
  pipeline.push({
    $group: {
      _id: "$practiceLabRatings.labAnchorId",
      ratingCount: { $sum: 1 },
      starsSum: { $sum: { $ifNull: ["$practiceLabRatings.stars", 0] } },
    },
  });

  const rows = await BusinessAnchor.aggregate(pipeline);
  const map = new Map();
  for (const row of rows) {
    const labAnchorId = String(row?._id || "").trim();
    if (!labAnchorId) continue;
    const ratingCount = Math.max(0, Math.floor(Number(row.ratingCount) || 0));
    if (ratingCount <= 0) continue;
    const starsSum = Number(row.starsSum) || 0;
    const stars = starsSum / ratingCount;
    if (!Number.isFinite(stars)) continue;
    map.set(labAnchorId, {
      labAnchorId,
      stars,
      ratingCount,
    });
  }
  return map;
}

/**
 * upsert. 치과·기공소 쌍당 1건.
 * 재평가(별점·메모) 시 이전 행을 덮어쓰고 ratingCount는 항상 1.
 */
export function upsertPracticeLabRatingList(existing, labAnchorId, stars, memo) {
  const labId = String(labAnchorId || "").trim();
  const nextStars = normalizePracticeLabStars(stars);
  if (!labId || nextStars == null) {
    return Array.isArray(existing) ? existing.slice() : [];
  }
  const nextMemo = normalizePracticeLabRatingMemo(memo);
  const rows = Array.isArray(existing) ? existing.slice() : [];
  const idx = rows.findIndex(
    (row) => String(row?.labAnchorId || "").trim() === labId,
  );
  const now = new Date();
  if (idx >= 0) {
    const prev = rows[idx] || {};
    rows[idx] = {
      labAnchorId: prev.labAnchorId || labId,
      stars: nextStars,
      memo: nextMemo,
      ratingCount: 1,
      updatedAt: now,
    };
    return rows;
  }
  rows.push({
    labAnchorId: labId,
    stars: nextStars,
    memo: nextMemo,
    ratingCount: 1,
    updatedAt: now,
  });
  return rows;
}
