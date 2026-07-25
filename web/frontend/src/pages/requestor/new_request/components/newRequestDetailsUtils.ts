// related files:
// - web/frontend/src/pages/requestor/new_request/hooks/useLeadTimeForecast.ts
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// Rhino의 align 기능이 구성정보를 대체하므로, 신규의뢰 유틸에서도 구성정보 파일 분기 로직을 유지하지 않는다.

export const WEEKDAY_TO_KST_INDEX: Record<string, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
};
