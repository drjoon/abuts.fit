// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import {
  SettingsScaffold,
  type SettingsTabDef,
} from "@/features/components/SettingsScaffold";
import { AccountTab } from "@/features/settings/tabs/AccountTab";
import { StaffTab } from "@/features/settings/tabs/StaffTab";
import { NotificationsTab } from "@/features/settings/tabs/NotificationsTab";
import { User, Users, Bell, Shield, Building2 } from "lucide-react";
import { ManufacturerSecurity } from "./Security";
import { BusinessTab } from "./components/BusinessTab";
import { apiFetch } from "@/shared/api/apiClient";
import { Button } from "@/components/ui/button";

type TabKey =
  | "account"
  | "business"
  | "staff"
  | "notifications"
  | "security";

export const ManufacturerSettingsPage = () => {
  const { user, token } = useAuthStore();
  const [operatingStatus, setOperatingStatus] = useState(
    user?.operatingStatus === "paused" ? "paused" : "running",
  );
  const [savingOperating, setSavingOperating] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs: SettingsTabDef[] = useMemo(
    () => [
      {
        key: "account",
        label: "계정",
        icon: User,
        content: <AccountTab userData={user} />,
      },
      {
        key: "business",
        label: "사업자",
        icon: Building2,
        content: <BusinessTab userData={user} />,
      },
      {
        key: "staff",
        label: "임직원",
        icon: Users,
        content: <StaffTab userData={user} businessTypeOverride="manufacturer" />,
      },
      {
        key: "notifications",
        label: "알림",
        icon: Bell,
        content: <NotificationsTab />,
      },
      {
        key: "security",
        label: "보안",
        icon: Shield,
        content: <ManufacturerSecurity />,
      },
    ],
    [user],
  );

  const tabFromUrl =
    (searchParams.get("tab") as TabKey | null) || (tabs[0]?.key as TabKey);
  const allowed = new Set(tabs.map((t) => t.key));
  const activeTab = allowed.has(tabFromUrl)
    ? tabFromUrl
    : (tabs[0]?.key as TabKey);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {user?.productionControl === "self" && user?.subRole === "owner" ? (
        <div className="mx-3 mt-3 flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <span className="text-sm text-slate-700">
            {operatingStatus === "paused" ? "가동 중단" : "가동 중"}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={savingOperating}
            onClick={() => {
              const next = operatingStatus === "paused" ? "running" : "paused";
              setSavingOperating(true);
              void apiFetch({
                path: "/api/manufacturer/operating-status",
                method: "PUT",
                token,
                jsonBody: { operatingStatus: next },
              }).then((res) => {
                setSavingOperating(false);
                if (res.ok) setOperatingStatus(next);
              });
            }}
          >
            {operatingStatus === "paused" ? "가동" : "중단"}
          </Button>
        </div>
      ) : null}
    <SettingsScaffold
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(next) => setSearchParams({ tab: next })}
    />
    </div>
  );
};
