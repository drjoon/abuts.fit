// change-log:
// - 2026-08-17: 관리자「사업영역」— 기공사업 · 어벗사업 · 플랫폼사업.
// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/admin/partners/LabBusinessTab.tsx
// - web/frontend/src/pages/admin/partners/AbutmentBusinessTab.tsx
// - web/frontend/src/pages/admin/partners/PlatformBusinessTab.tsx
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  SettingsScaffold,
  type SettingsTabDef,
} from "@/features/components/SettingsScaffold";
import { FlaskConical, Hexagon, Layers } from "lucide-react";
import { PartnerShareProvider } from "./PartnerShareContext";
import { LabBusinessTab } from "./LabBusinessTab";
import { AbutmentBusinessTab } from "./AbutmentBusinessTab";
import { PlatformBusinessTab } from "./PlatformBusinessTab";

type TabKey = "lab" | "abutment" | "platform";

const LEGACY_TAB_REDIRECT: Record<string, TabKey> = {
  share: "lab",
  labUnit: "lab",
  salesUnit: "lab",
  labPartner: "lab",
  salesPartner: "lab",
};

export const AdminPartnersPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs: SettingsTabDef[] = useMemo(
    () => [
      {
        key: "lab",
        label: "기공사업",
        icon: FlaskConical,
        content: <LabBusinessTab />,
      },
      {
        key: "abutment",
        label: "어벗사업",
        icon: Hexagon,
        content: <AbutmentBusinessTab />,
      },
      {
        key: "platform",
        label: "플랫폼사업",
        icon: Layers,
        content: <PlatformBusinessTab />,
      },
    ],
    [],
  );

  const rawTab = searchParams.get("tab") || "";
  const tabFromUrl = (LEGACY_TAB_REDIRECT[rawTab] || rawTab) as TabKey;
  const allowed = new Set(tabs.map((t) => t.key));
  const activeTab = allowed.has(tabFromUrl)
    ? tabFromUrl
    : (tabs[0]?.key as TabKey);

  return (
    <PartnerShareProvider>
      <SettingsScaffold
        tabs={tabs}
        activeTab={activeTab}
        contentMaxClassName="max-w-5xl"
        onTabChange={(next) => {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.set("tab", next);
          setSearchParams(nextParams, { replace: true });
        }}
      />
    </PartnerShareProvider>
  );
};
