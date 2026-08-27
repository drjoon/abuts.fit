// change-log:
// - 2026-08-27: 계정(개인) 사이드바 펼침 SSOT. 기본값 open(첫 가입·미설정)
// related files:
// - web/backend/utils/sidebarOpen.util.js
// - web/frontend/src/store/useAuthStore.ts
// - web/frontend/src/features/layout/DashboardLayout.tsx

export const DEFAULT_SIDEBAR_OPEN = true;

export const normalizeSidebarOpen = (raw: unknown): boolean => {
  if (raw === true || raw === false) return raw;
  if (raw === "true" || raw === 1 || raw === "1") return true;
  if (raw === "false" || raw === 0 || raw === "0") return false;
  return DEFAULT_SIDEBAR_OPEN;
};
