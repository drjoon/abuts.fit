// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/backend/controllers/requests/common.review.controller.js
import { PackingPageContent } from "./components/PackingPageContent";

// 웹소켓 실시간 업데이트(무플리커/부분갱신)는
// PackingPageContent -> RequestPage -> useWorksheetRealtimeStatus 경로에서 공통 처리한다.

export const PackingPage = ({
  showQueueBar = true,
}: {
  showQueueBar?: boolean;
}) => {
  return <PackingPageContent showQueueBar={showQueueBar} />;
};
