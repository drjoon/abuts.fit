// related files:
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/App.tsx
// - web/frontend/src/pages/devops/DevopsSettingsPage.tsx
// - web/frontend/src/pages/devops/components/DevopsPayoutAccountTab.tsx
// - web/frontend/src/pages/devops/components/DesignerAssignmentTab.tsx
// - web/frontend/src/pages/devops/components/DevopsDesignDeadlineTab.tsx
// - web/frontend/src/features/settings/tabs/AdminCreditSettingsTab.tsx
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  SettingsScaffold,
  type SettingsTabDef,
} from "@/features/components/SettingsScaffold";
import { DevopsPayoutAccountTab } from "./components/DevopsPayoutAccountTab";
import { AdminCreditSettingsTab } from "@/features/settings/tabs/AdminCreditSettingsTab";
import { DesignerAssignmentTab } from "./components/DesignerAssignmentTab";
import { DevopsDesignDeadlineTab } from "./components/DevopsDesignDeadlineTab";
import { Landmark, CreditCard, PenTool, Clock } from "lucide-react";

type TabKey = "payment" | "credits" | "design" | "deadline";

export const DevopsPartnerPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs: SettingsTabDef[] = useMemo(
    () => [
      {
        key: "payment",
        label: "입금",
        icon: Landmark,
        content: <DevopsPayoutAccountTab />,
      },
      {
        key: "credits",
        label: "요금 · 크레딧",
        icon: CreditCard,
        content: <AdminCreditSettingsTab />,
      },
      {
        key: "design",
        label: "디자이너 지정",
        icon: PenTool,
        content: <DesignerAssignmentTab />,
      },
      {
        key: "deadline",
        label: "마감 설정",
        icon: Clock,
        content: <DevopsDesignDeadlineTab />,
      },
    ],
    [],
  );

  const tabFromUrl =
    (searchParams.get("tab") as TabKey | null) || (tabs[0]?.key as TabKey);
  const allowed = new Set(tabs.map((t) => t.key));
  const activeTab = allowed.has(tabFromUrl)
    ? tabFromUrl
    : (tabs[0]?.key as TabKey);

  return (
    <SettingsScaffold
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(next) => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set("tab", next);
        setSearchParams(nextParams, { replace: true });
      }}
    />
  );
};
