// change-log:
// - 2026-08-13: 개발운영사 파트너 페이지를 관리자「플랫폼 설정」으로 이전.
// related files:
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/App.tsx
// - web/frontend/src/features/settings/tabs/AdminCreditSettingsTab.tsx
// - web/frontend/src/pages/devops/components/PracticeTransferAutoMatchTab.tsx
// - web/frontend/src/pages/devops/components/DevopsPlatformFeeTab.tsx
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  SettingsScaffold,
  type SettingsTabDef,
} from "@/features/components/SettingsScaffold";
import { AdminCreditSettingsTab } from "@/features/settings/tabs/AdminCreditSettingsTab";
import { PracticeTransferAutoMatchTab } from "@/pages/devops/components/PracticeTransferAutoMatchTab";
import { DevopsPlatformFeeTab } from "@/pages/devops/components/DevopsPlatformFeeTab";
import { CreditCard, FlaskConical } from "lucide-react";

type TabKey = "credits" | "autoMatch";

const LEGACY_TAB_REDIRECT: Record<string, TabKey> = {
  design: "autoMatch",
  deadline: "autoMatch",
  payment: "autoMatch",
};

export const AdminPlatformSettingsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs: SettingsTabDef[] = useMemo(
    () => [
      {
        key: "credits",
        label: "커스텀어벗 요금 · 크레딧",
        icon: CreditCard,
        content: <AdminCreditSettingsTab />,
      },
      {
        key: "autoMatch",
        label: "기공소 매칭",
        icon: FlaskConical,
        content: (
          <div className="space-y-5">
            <DevopsPlatformFeeTab />
            <PracticeTransferAutoMatchTab />
          </div>
        ),
      },
    ],
    [],
  );

  const rawTab = searchParams.get("tab");
  const mapped =
    rawTab && LEGACY_TAB_REDIRECT[rawTab]
      ? LEGACY_TAB_REDIRECT[rawTab]
      : (rawTab as TabKey | null);
  const tabFromUrl = mapped || (tabs[0]?.key as TabKey);
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
