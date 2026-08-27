// change-log:
// - 2026-08-27: 계정(개인) 사이드바 펼침 정규화 (default: true/open)
// related files:
// - web/backend/models/user.model.js
// - web/backend/controllers/users/user.controller.js
// - web/frontend/src/shared/layout/sidebarOpen.ts

export const DEFAULT_SIDEBAR_OPEN = true;

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
export function normalizeSidebarOpen(raw) {
  if (raw === true || raw === false) return raw;
  if (raw === "true" || raw === 1 || raw === "1") return true;
  if (raw === "false" || raw === 0 || raw === "0") return false;
  return DEFAULT_SIDEBAR_OPEN;
}
