// related files:
// - web/backend/utils/lastDashboardPath.util.js
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/features/dashboard/DashboardHome.tsx
// - web/frontend/src/store/useAuthStore.ts
// - 2026-08-18: 치과 requestor `/dashboard` last path는 구강스캔으로 보정(대시보드 메뉴 제거).
// - 2026-08-17: internalLab `/dashboard` = 대기보드 허용(기본 랜딩은 lab-work).

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
    case "internalLab":
      return "/dashboard/lab-work";
    case "practice":
      return "/practice/dashboard";
    case "devops":
      return "/dashboard/settings";
    case "labTeam":
    case "salesTeam":
      return "/dashboard/settings";
    default:
      return "/dashboard";
  }
}

/**
 * 로그인·/dashboard 허브 진입용.
 * 저장된 최근 사이드바 경로를 우선하고, 역할에 맞지 않는 bare `/dashboard`는 역할 기본값으로 보정한다.
 */
export function resolveEntryDashboardPath(user: {
  role?: string | null;
  lastDashboardPath?: string | null;
} | null | undefined): string {
  const role = user?.role;
  const roleDefault = getRoleDefaultDashboardPath(role);
  const last = normalizeLastDashboardPath(user?.lastDashboardPath);
  if (!last) return roleDefault;

  // manufacturer/practice/devops/기공팀/영업팀은 `/dashboard`에 콘텐츠가 없음.
  // internalLab은 `/dashboard` = 대기보드(RequestorDashboardPage).
  if (
    (role === "manufacturer" ||
      role === "practice" ||
      role === "devops" ||
      role === "labTeam" ||
      role === "salesTeam") &&
    (last === "/dashboard" || last === "/dashboard/")
  ) {
    return roleDefault;
  }

  const lastPathname = last.split("?")[0];

  // 어벗츠기공소: 구 어벗디자인·대시보드 경로 → 기공의뢰수신
  if (
    role === "internalLab" &&
    (lastPathname === "/dashboard/abut-design" ||
      lastPathname.startsWith("/dashboard/abut-design/"))
  ) {
    return "/dashboard/lab-work";
  }

  // 디자인 큐는 지정 의뢰자 전용 (제조사 last path 호환)
  if (
    role === "manufacturer" &&
    (lastPathname === "/dashboard/design" ||
      lastPathname.startsWith("/dashboard/design/"))
  ) {
    return roleDefault;
  }

  // 의뢰자 디자인 메뉴 제거 → 의뢰수신으로 통합
  if (
    role === "requestor" &&
    (lastPathname === "/dashboard/design" ||
      lastPathname.startsWith("/dashboard/design/"))
  ) {
    return "/dashboard/practice-transfers?mode=receive";
  }

  return last;
}
