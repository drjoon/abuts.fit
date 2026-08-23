// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/backend/controllers/requests/common.review.controller.js
import type { ReactNode } from "react";

type MailboxStickyHeaderProps = {
  children: ReactNode;
};

export const MailboxStickyHeader = ({ children }: MailboxStickyHeaderProps) => {
  return (
    <div className="flex-shrink-0 w-full sticky top-0 z-40 -mx-3 px-3 sm:-mx-6 sm:px-6">
      {children}
    </div>
  );
};
