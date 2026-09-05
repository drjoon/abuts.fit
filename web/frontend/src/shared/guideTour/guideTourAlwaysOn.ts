// related files:
// - web/frontend/src/shared/guideTour/GuideTourProvider.tsx
// - web/frontend/src/store/useAuthStore.ts
// - web/backend/utils/guideTour.util.js
//
// 테스트치과·테스트기공소 소속 유저는 가이드투어를 항시 미수료로 둔다.
// 그 외 실사용자(사업자 BA 소속 requestor)는 수료 후 재표시하지 않는다.

/** 사업자명(User.business / companyName) SSOT — 가이드투어 always-on */
export const GUIDE_TOUR_ALWAYS_ON_BUSINESS_NAMES = [
  "테스트치과",
  "테스트기공소",
] as const;

export function isGuideTourAlwaysOnBusiness(
  name: string | null | undefined,
): boolean {
  const n = String(name || "").trim();
  return (GUIDE_TOUR_ALWAYS_ON_BUSINESS_NAMES as readonly string[]).includes(n);
}
