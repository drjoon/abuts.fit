// change-log:
// - 2026-08-09: 디자인 작업영역은 비워두고, 상단 헤더(기간 필터)만 DashboardLayout에서 표시.
// - 2026-08-09: 제조사 사이드메뉴 "디자인" 진입점.
// related files:
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/App.tsx

/** 제조사 디자인 작업 화면. 헤더는 DashboardLayout, 본문은 추후 구현. */
export const ManufacturerDesignPage = () => {
  return (
    <div className="w-full h-full min-h-[12rem]" aria-label="디자인 작업영역" />
  );
};
