// related files:
// - web/backend/models/user.model.js
// - web/backend/controllers/users/user.controller.js
// - web/frontend/src/shared/navigation/lastDashboardPath.ts

/**
 * 최근 대시보드 경로 정규화/검증.
 * pathname + search만 허용. 외부 URL·상대경로 탈출 차단.
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normalizeLastDashboardPath(raw) {
  const s = String(raw || "").trim();
  if (!s || s.length > 300) return null;
  if (s.includes("://") || s.includes("\\") || s.includes("..")) return null;
  if (!s.startsWith("/dashboard") && !s.startsWith("/practice")) return null;

  try {
    const u = new URL(s, "http://local.invalid");
    const pathname = String(u.pathname || "");
    if (!pathname.startsWith("/dashboard") && !pathname.startsWith("/practice")) {
      return null;
    }
    if (pathname.includes("//")) return null;
    // 온보딩/가입 완료 등 일회성 경로는 저장하지 않음
    if (pathname.startsWith("/dashboard/wizard")) return null;
    if (pathname.includes("social_complete")) return null;
    return `${pathname}${u.search || ""}`;
  } catch {
    return null;
  }
}
