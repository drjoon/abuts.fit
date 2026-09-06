// related files:
// - web/frontend/src/pages/admin/adminUi.tsx
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
// - web/frontend/src/pages/admin/partners/AdminPartnersPage.tsx
// - web/frontend/src/pages/admin/settings/SettingsPage.tsx
// change-log:
// - 2026-09-06: 플랫폼·사업영역·계정설정 허브(?tab=platform|partners|account).
import { useSearchParams } from "react-router-dom";
import { AdminPlatformSettingsPage } from "@/pages/admin/system/AdminPlatformSettingsPage";
import { AdminPartnersPage } from "@/pages/admin/partners/AdminPartnersPage";
import { AdminSettingsPage } from "@/pages/admin/settings/SettingsPage";
import {
  AdminPageShell,
  AdminSegmentTabs,
  setHubTabParam,
} from "@/pages/admin/adminUi";

type SettingsHubTab = "platform" | "partners" | "account";

function parseTab(raw: string | null): SettingsHubTab {
  if (raw === "partners" || raw === "account") return raw;
  return "platform";
}

export default function AdminSettingsHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const setTab = (next: SettingsHubTab) => {
    const nextParams = setHubTabParam(searchParams, next, "platform");
    // Drop nested tab params when leaving a section.
    if (next !== "platform") nextParams.delete("platformTab");
    if (next !== "partners") nextParams.delete("partnersTab");
    if (next !== "account") nextParams.delete("accountTab");
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <AdminPageShell
      title="설정"
      subtitle="플랫폼 · 사업영역 · 계정"
      flush
      className="flex min-h-0 flex-1 flex-col"
    >
      <AdminSegmentTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "platform", label: "플랫폼" },
          { value: "partners", label: "사업영역" },
          { value: "account", label: "계정" },
        ]}
      />
      <div className="min-h-0 flex-1">
        {tab === "platform" ? (
          <AdminPlatformSettingsPage embedded />
        ) : null}
        {tab === "partners" ? <AdminPartnersPage embedded /> : null}
        {tab === "account" ? <AdminSettingsPage embedded /> : null}
      </div>
    </AdminPageShell>
  );
}
