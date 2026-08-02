// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/backend/controllers/requests/common.review.controller.js
import { RequestPage } from "../RequestPage";
import { deriveStageForFilter } from "../utils/request";
import type { ManufacturerRequest } from "../utils/request";

// 웹소켓 실시간 업데이트(무플리커/부분갱신)는
// ShippingPage -> RequestPage -> useWorksheetRealtimeStatus 경로에서 공통 처리한다.
// 포장.발송 공정 전용 페이지 (RequestPage 래퍼)
export const ShippingPage = () => {
  const filterByShippingStage = (req: ManufacturerRequest) => {
    return deriveStageForFilter(req) === "포장.발송";
  };

  return <RequestPage showQueueBar={false} filterRequests={filterByShippingStage} />;
};
