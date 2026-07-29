// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { BusinessTab as SharedBusinessTab } from "@/shared/components/business/settings/BusinessTab";

interface BusinessTabProps {
  userData: {
    companyName?: string;
    role?: string;
    email?: string;
    name?: string;
  } | null;
}

export const BusinessTab = ({ userData }: BusinessTabProps) => {
  return (
    <SharedBusinessTab
      userData={userData}
      businessTypeOverride="manufacturer"
    />
  );
};
