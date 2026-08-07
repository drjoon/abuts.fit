// related files:
// - web/backend/controllers/admin/admin.dashboard.controller.js
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx

/**
 * 해피콜 사유 코드 판정 (순수 함수).
 * 온보딩 사유는 하한+상한 구간을 함께 적용한다.
 * - new_signup_no_first_request_14d: 가입 후 14~30일
 * - no_completion_30d_from_join: 가입 후 30~60일
 */
export function collectHappyCallReasonCodes({
  anchorCreatedAt,
  firstCompletedAt,
  lastCompletedAt,
  completedCount = 0,
  totalRequestsByAnchor = 0,
  recent30Total = 0,
  recent30Canceled = 0,
  recent30Completed = 0,
  recent14UnmachinableJudged = 0,
  isCustomDesignSoftware = false,
  weekStartUtc,
  weekEndUtc,
  sevenDaysAgo,
  fourteenDaysAgo,
  twentyOneDaysAgo,
  thirtyDaysAgo,
  sixtyDaysAgo,
} = {}) {
  const reasons = [];

  if (
    firstCompletedAt &&
    weekStartUtc &&
    weekEndUtc &&
    firstCompletedAt >= weekStartUtc &&
    firstCompletedAt < weekEndUtc
  ) {
    reasons.push("first_completion_this_week");
  }

  if (
    firstCompletedAt &&
    sevenDaysAgo &&
    twentyOneDaysAgo &&
    firstCompletedAt <= sevenDaysAgo &&
    firstCompletedAt >= twentyOneDaysAgo
  ) {
    reasons.push("first_completion_after_signup");
  }

  // 온보딩 구간(가입 후 30~60일)
  if (
    anchorCreatedAt &&
    thirtyDaysAgo &&
    sixtyDaysAgo &&
    anchorCreatedAt <= thirtyDaysAgo &&
    anchorCreatedAt > sixtyDaysAgo &&
    Number(completedCount || 0) === 0 &&
    Number(recent30Total || 0) === 0
  ) {
    reasons.push("no_completion_30d_from_join");
  }

  if (lastCompletedAt && sixtyDaysAgo && lastCompletedAt <= sixtyDaysAgo) {
    reasons.push("dormant_60d_since_last_completion");
  }

  const recent30 = Number(recent30Total || 0);
  if (recent30 >= 3 && Number(recent30Canceled || 0) / recent30 >= 0.5) {
    reasons.push("high_cancel_rate_30d");
  }

  if (Number(recent14UnmachinableJudged || 0) > 0) {
    reasons.push("recent_unmachinable_14d");
  }

  if (
    Number(completedCount || 0) > 0 &&
    recent30 >= 2 &&
    Number(recent30Completed || 0) === 0
  ) {
    reasons.push("active_but_no_completion_30d");
  }

  // 온보딩 구간(가입 후 14~30일)
  if (
    anchorCreatedAt &&
    fourteenDaysAgo &&
    thirtyDaysAgo &&
    anchorCreatedAt <= fourteenDaysAgo &&
    anchorCreatedAt > thirtyDaysAgo &&
    Number(totalRequestsByAnchor || 0) === 0
  ) {
    reasons.push("new_signup_no_first_request_14d");
  }

  if (isCustomDesignSoftware) {
    reasons.push("custom_design_software");
  }

  return reasons;
}
