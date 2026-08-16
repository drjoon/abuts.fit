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

import { Types } from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import { requestorKindCapableAnchorFilter } from "./requestorCapabilities.js";

export const PRACTICE_LAB_RATING_MIN = 1;
export const PRACTICE_LAB_RATING_MAX = 5;
export const PRACTICE_LAB_RATING_MEMO_MAX = 500;
/** 자동매칭 최소 별 기본값. */
export const DEFAULT_AUTO_MATCH_MIN_LAB_RATING = 3;
/** 자동매칭 최소 별 선택 하한. */
export const AUTO_MATCH_MIN_SELECTABLE = 1;
/** 이 횟수 이하 평가면 유효 별점=3(미평가 포함). 3회 이하→3, 4회부터 실평균. */
export const AUTO_MATCH_RATING_COUNT_GRACE = 3;
/** 3회 이하일 때 적용하는 초기 유효 별점. */
export const DEFAULT_EFFECTIVE_LAB_STARS = 3;

const FEE_MULTIPLIER_BY_STARS = Object.freeze({
  1: 0.8,
  2: 0.9,
  3: 1,
  4: 1.1,
  5: 1.2,
});

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

/** 자동매칭 최소 별. 미설정·범위 밖 → 기본 3. 선택 가능은 1~5. */
export function normalizeAutoMatchMinLabRating(value) {
  const stars = normalizePracticeLabStars(value);
  if (stars == null) return DEFAULT_AUTO_MATCH_MIN_LAB_RATING;
  return Math.max(AUTO_MATCH_MIN_SELECTABLE, stars);
}

/** 선택 별점(1~5) → 기공비 배수. */
export function feeMultiplierForStars(stars) {
  const n = normalizeAutoMatchMinLabRating(stars);
  return FEE_MULTIPLIER_BY_STARS[n] ?? 1;
}

/**
 * 매칭 참여·필터용 유효 별점.
 * - 평가 3회 이하(미평가 포함): 3
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
  const ratingCount = Math.max(1, Math.floor(Number(row.ratingCount) || 1));
  return {
    labAnchorId,
    stars,
    memo: normalizePracticeLabRatingMemo(row.memo),
    ratingCount,
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
 * 유효 별점(3회 이하→3) < 최소 별이면 true
 *
 * 참여 조건: 인증 AND 유효별≥설정(하한 1; 3회 이하→3)
 *
 * `aggregated`가 있으면 전체 치과 합산 행을 쓰고, 없으면 레거시 단일 치과 list.
 */
export function isLabBlockedByPracticeRating({
  ratings,
  aggregated = null,
  labAnchorId,
  minStars,
} = {}) {
  const labId = String(labAnchorId || "").trim();
  if (!labId) return false;

  const min = normalizeAutoMatchMinLabRating(minStars);

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
  return effective < min;
}

/**
 * 가입 치과(practice) 전체의 기공소 평가를 합산·평균.
 * - ratingCount: 각 치과 ratingCount 합
 * - stars: ratingCount 가중 평균
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
  pipeline.push({
    $group: {
      _id: "$practiceLabRatings.labAnchorId",
      ratingCount: {
        $sum: {
          $max: [{ $ifNull: ["$practiceLabRatings.ratingCount", 1] }, 1],
        },
      },
      weightedStars: {
        $sum: {
          $multiply: [
            { $ifNull: ["$practiceLabRatings.stars", 0] },
            {
              $max: [{ $ifNull: ["$practiceLabRatings.ratingCount", 1] }, 1],
            },
          ],
        },
      },
    },
  });

  const rows = await BusinessAnchor.aggregate(pipeline);
  const map = new Map();
  for (const row of rows) {
    const labAnchorId = String(row?._id || "").trim();
    if (!labAnchorId) continue;
    const ratingCount = Math.max(0, Math.floor(Number(row.ratingCount) || 0));
    if (ratingCount <= 0) continue;
    const weighted = Number(row.weightedStars) || 0;
    const stars = weighted / ratingCount;
    if (!Number.isFinite(stars)) continue;
    map.set(labAnchorId, {
      labAnchorId,
      stars,
      ratingCount,
    });
  }
  return map;
}

/** upsert. 신규=1, 별점이 바뀌면 ratingCount +1 (메모만 수정은 횟수 유지). */
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
    const prevStars = normalizePracticeLabStars(prev.stars);
    const prevCount = Math.max(1, Math.floor(Number(prev.ratingCount) || 1));
    const starsChanged = prevStars !== nextStars;
    rows[idx] = {
      labAnchorId: prev.labAnchorId || labId,
      stars: nextStars,
      memo: nextMemo,
      ratingCount: starsChanged ? prevCount + 1 : prevCount,
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
