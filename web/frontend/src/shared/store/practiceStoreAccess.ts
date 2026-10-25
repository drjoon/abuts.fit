// change-log:
// - 2026-10-26: 치과 스토어 비공개. 오픈 시 PRACTICE_STORE_OPEN만 true.

/**
 * 치과 스토어(`/dashboard/store`).
 * false면 사이드바에서 빼고, 주소는 대시보드로 보낸다.
 * 준비되면 true로 되돌린다. 관리자 스토어(`/dashboard/store-admin`)와는 별개.
 */
export const PRACTICE_STORE_OPEN = false;

export function isPracticeStorePath(pathname: string): boolean {
  return (
    pathname === "/dashboard/store" || pathname.startsWith("/dashboard/store/")
  );
}
