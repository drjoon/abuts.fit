// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/controllers/practiceTransfers/practiceTransferSettings.controller.js
// - web/backend/utils/practiceTransferAutoMatchBudget.js
// - web/frontend/src/shared/practice/practiceLabRating.ts
// - web/frontend/src/shared/components/practice/PracticeLabRatingControl.tsx
// - 2026-08-14: 치과→기공소 rating(1~3)·메모. 기록 치과·관리자만. 자동매칭 최소 별(1회는 2nd chance).
// - 2026-08-14: rating 기공소 10곳 이상일 때만 자동매칭 별 제한 적용.
// - 2026-08-14: 동일 기공소 평가 2회 이하(3회부터 차단)는 매칭 참여 허용.
// - 2026-08-16: 10곳 게이트 제거. 평가 5회 이하(6회부터 별 제한)는 매칭 참여 허용.
// - 2026-08-16: 자동매칭 별점은 주문 치과만이 아니라 전체 치과 평가 합산·평균.

import { Types } from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import { requestorKindCapableAnchorFilter } from "./requestorCapabilities.js";

export const PRACTICE_LAB_RATING_MIN = 1;
export const PRACTICE_LAB_RATING_MAX = 3;
export const PRACTICE_LAB_RATING_MEMO_MAX = 500;
export const DEFAULT_AUTO_MATCH_MIN_LAB_RATING = 1;
/** 이 횟수 이하 평가면 최소 별 제한에서 제외(미평가 포함). 초과 시 별점 게이트 적용. */
export const AUTO_MATCH_RATING_COUNT_GRACE = 5;

/** 별점 1~3. 범위 밖·비숫자면 null. */
export function normalizePracticeLabStars(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const stars = Math.round(n);
  if (stars < PRACTICE_LAB_RATING_MIN || stars > PRACTICE_LAB_RATING_MAX) {
    return null;
  }
  return stars;
}

/** 자동매칭 최소 별. 미설정·범위 밖 → 1(필터 없음에 가깝게). */
export function normalizeAutoMatchMinLabRating(value) {
  const stars = normalizePracticeLabStars(value);
  return stars == null ? DEFAULT_AUTO_MATCH_MIN_LAB_RATING : stars;
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
 * 자동매칭 차단(인증 풀은 별도):
 * - 미평가(기록 없음)면 false
 * - 전체 치과 합산 평가 5회 이하면 false
 * - 6회 이상이고 평균 별 < 최소 별이면 true
 *
 * `aggregated`가 있으면 전체 치과 합산 행을 쓰고, 없으면 레거시 단일 치과 list.
 */
export function isLabBlockedByPracticeRating({
  ratings,
  aggregated = null,
  labAnchorId,
  minStars,
} = {}) {
  const min = normalizeAutoMatchMinLabRating(minStars);
  if (min <= PRACTICE_LAB_RATING_MIN) return false;
  const labId = String(labAnchorId || "").trim();
  if (!labId) return false;

  let stars = null;
  let ratingCount = 0;
  if (aggregated && typeof aggregated === "object") {
    const row =
      aggregated instanceof Map
        ? aggregated.get(labId)
        : aggregated[labId] || null;
    if (!row) return false;
    stars = Number(row.stars);
    ratingCount = Math.max(0, Math.floor(Number(row.ratingCount) || 0));
  } else {
    const row = findPracticeLabRating(ratings, labId);
    if (!row) return false;
    stars = row.stars;
    ratingCount = row.ratingCount;
  }
  if (!Number.isFinite(stars) || ratingCount <= 0) return false;
  if (ratingCount <= AUTO_MATCH_RATING_COUNT_GRACE) return false;
  return stars < min;
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
