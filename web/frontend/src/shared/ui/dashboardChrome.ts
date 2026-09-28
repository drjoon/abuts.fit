/**
 * 대시보드 공통 크롬(사이드바 로고 줄·상단바)과 작업영역 여백.
 *
 * 전 역할(치과·기공소·제조사·관리자·영업팀·딜러·개발운영) 공통이다.
 * 여백은 `DashboardLayout`이 한 번만 준다. 페이지 셸(`AdminPageShell`, `DashboardShell` 등)은
 * 바깥 padding을 더하지 않는다(이중·삼중 여백 금지).
 *
 * 넓은 화면 확대는 index.css 루트 font-size만 따른다. 모두 rem이라 같이 커진다(2xl: 개별 확대 금지).
 *
 * SSOT: `.cursor/rules/dashboard-chrome.mdc`, `web/frontend/rules.md`
 */

/** xl+ 사이드바 로고 줄. 전폭 작업영역 헤더와 하단 경계선 높이가 같다(4rem). */
export const DASHBOARD_SIDEBAR_BRAND_CLASS =
  "flex h-16 shrink-0 items-center border-b border-border px-4 lg:px-6";

/** 사이드바 접기 버튼 — 로고 줄 경계선(4rem) 위 가운데. */
export const DASHBOARD_SIDEBAR_TOGGLE_TOP_CLASS = "top-12";

/** xl 미만 상단바(햄버거·로고). */
export const DASHBOARD_TOPBAR_CLASS = "h-12 px-3";

/** 카드형 작업영역 바깥 여백(카드와 화면 가장자리 사이). */
export const DASHBOARD_WORK_OUTER_PAD_CLASS = "p-3 lg:p-4";

/** 카드형 작업영역 카드 안쪽 여백. 하단은 플로팅 채팅 버튼 높이만큼 남긴다. */
export const DASHBOARD_WORK_INNER_PAD_CLASS =
  "px-3 pb-8 pt-3 sm:px-4 sm:pb-12 sm:pt-4 lg:px-5 lg:pt-5";

/** 전폭 작업영역(기공의뢰 발신·수신) 래퍼. 좌우·위는 페이지 헤더·본문이 직접 준다. */
export const DASHBOARD_FULL_BLEED_PAD_CLASS = "pb-3 sm:pb-4";

/** 전폭 작업영역 좌우 여백. 헤더·툴바·본문이 같은 값을 써서 끝선을 맞춘다. */
export const DASHBOARD_FULL_BLEED_GUTTER_CLASS = "px-3 sm:px-4";

/**
 * 전폭 작업영역 첫 줄(상태 뱃지·액션).
 * xl+는 사이드바 로고 줄과 같은 4rem. xl 미만은 상단바 아래라 3.5rem.
 * 내용이 줄바꿈되면 min-h라 늘어난다.
 */
export const DASHBOARD_FULL_BLEED_HEADER_ROW_CLASS =
  "flex min-h-14 flex-col justify-center py-2 xl:min-h-16";
