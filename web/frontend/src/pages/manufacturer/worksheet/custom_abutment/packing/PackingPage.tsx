// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/backend/controllers/requests/common.review.controller.js
import { PackingPageContent } from "./components/PackingPageContent";

export const PackingPage = ({
  showQueueBar = true,
}: {
  showQueueBar?: boolean;
}) => {
  return <PackingPageContent showQueueBar={showQueueBar} />;
};
