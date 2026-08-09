// related files:
// - web/backend/utils/lastDashboardPath.util.js
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/features/dashboard/DashboardHome.tsx
// - web/frontend/src/store/useAuthStore.ts

/**
 * 최근 대시보드 경로 정규화/검증 (프론트 ↔ 백엔드 SSOT 규칙 동기).
 * pathname + search만 허용.
 */
export function normalizeLastDashboardPath(
  raw: unknown,
): string | null {
  const s = String(raw || "").trim();
  if (!s || s.length > 300) return null;
  if (s.includes("://") || s.includes("\\") || s.includes("..")) return null;
  if (!s.startsWith("/dashboard") && !s.startsWith("/practice")) return null;

  try {
    const u = new URL(s, "http://local.invalid");
    const pathname = String(u.pathname || "");
    if (
      !pathname.startsWith("/dashboard") &&
      !pathname.startsWith("/practice")
    ) {
      return null;
    }
    if (pathname.includes("//")) return null;
    if (pathname.startsWith("/dashboard/wizard")) return null;
    if (pathname.includes("social_complete")) return null;
    return `${pathname}${u.search || ""}`;
  } catch {
    return null;
  }
}

/** 역할별 기본 랜딩 (last path 없을 때) */
export function getRoleDefaultDashboardPath(role: string | null | undefined): string {
  switch (role) {
    case "manufacturer":
      return "/dashboard/worksheet";
    case "practice":
      return "/practice/dashboard";
    default:
      return "/dashboard";
  }
}
