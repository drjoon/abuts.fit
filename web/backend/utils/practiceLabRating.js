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

export const PRACTICE_LAB_RATING_MIN = 1;
export const PRACTICE_LAB_RATING_MAX = 3;
export const PRACTICE_LAB_RATING_MEMO_MAX = 500;
export const DEFAULT_AUTO_MATCH_MIN_LAB_RATING = 1;
/** 자동매칭 별 제한을 켜려면 이 치과가 rating한 서로 다른 기공소 수 */
export const AUTO_MATCH_RATING_FILTER_MIN_LABS = 10;

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
 * 자동매칭 차단:
 * - rating한 기공소가 10곳 미만이면 제한 없음
 * - 해당 기공소를 3회 이상 rating했고 현재 별 < 최소 별이면 true
 * - 2회 이하·미평가·이상이면 false (2nd chance)
 */
export function isLabBlockedByPracticeRating({
  ratings,
  labAnchorId,
  minStars,
} = {}) {
  const min = normalizeAutoMatchMinLabRating(minStars);
  if (min <= PRACTICE_LAB_RATING_MIN) return false;
  if (countRatedLabAnchors(ratings) < AUTO_MATCH_RATING_FILTER_MIN_LABS) {
    return false;
  }
  const row = findPracticeLabRating(ratings, labAnchorId);
  if (!row) return false;
  if (row.ratingCount <= 2) return false;
  return row.stars < min;
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
