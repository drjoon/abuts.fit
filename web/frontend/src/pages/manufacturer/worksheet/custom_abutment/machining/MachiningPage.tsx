// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/backend/controllers/requests/common.review.controller.js
import { RequestPage } from "../RequestPage";

// 가공 공정 전용 페이지 (RequestPage 래퍼)
export const MachiningPage = () => {
  return <RequestPage showQueueBar={true} />;
};
