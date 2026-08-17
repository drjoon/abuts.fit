// change-log:
// - 2026-08-17: 관리자「파트너」페이지 — 수익분배·기공사업부·영업부·기공파트너·영업파트너.
// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/features/components/SettingsScaffold.tsx
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
// - web/frontend/src/pages/admin/partners/RevenueShareTab.tsx
// - web/frontend/src/pages/admin/partners/SectorShareTab.tsx
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  SettingsScaffold,
  type SettingsTabDef,
} from "@/features/components/SettingsScaffold";
import {
  Briefcase,
  FlaskConical,
  Handshake,
  Megaphone,
  PieChart,
} from "lucide-react";
import { PartnerShareProvider } from "./PartnerShareContext";
import { RevenueShareTab } from "./RevenueShareTab";
import { SectorShareTab } from "./SectorShareTab";

type TabKey =
  | "share"
  | "labUnit"
  | "salesUnit"
  | "labPartner"
  | "salesPartner";

export const AdminPartnersPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs: SettingsTabDef[] = useMemo(
    () => [
      {
        key: "share",
        label: "수익분배",
        icon: PieChart,
        content: <RevenueShareTab />,
      },
      {
        key: "labUnit",
        label: "기공사업부",
        icon: FlaskConical,
        content: <SectorShareTab sectorKey="labUnit" />,
      },
      {
        key: "salesUnit",
        label: "영업부",
        icon: Briefcase,
        content: <SectorShareTab sectorKey="salesUnit" />,
      },
      {
        key: "labPartner",
        label: "기공파트너",
        icon: Handshake,
        content: <SectorShareTab sectorKey="labPartner" />,
      },
      {
        key: "salesPartner",
        label: "영업파트너",
        icon: Megaphone,
        content: <SectorShareTab sectorKey="salesPartner" />,
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
    <PartnerShareProvider>
      <SettingsScaffold
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(next) => {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.set("tab", next);
          setSearchParams(nextParams, { replace: true });
        }}
      />
    </PartnerShareProvider>
  );
};
