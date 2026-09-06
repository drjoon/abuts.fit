// related files:
// - web/frontend/src/pages/admin/adminUi.tsx
// - web/frontend/src/pages/admin/support/AdminRemoteSupportPage.tsx
// - web/frontend/src/pages/admin/support/AdminBusinessRegistrationInquiryPage.tsx
// - web/frontend/src/shared/hooks/useAdminCommBadges.ts
// change-log:
// - 2026-09-06: 원격지원·문의 허브(?tab=remote|inquiries).
import { useSearchParams } from "react-router-dom";
import AdminRemoteSupportPage from "@/pages/admin/support/AdminRemoteSupportPage";
import AdminInquiriesPage from "@/pages/admin/support/AdminBusinessRegistrationInquiryPage";
import { useAdminCommBadges } from "@/shared/hooks/useAdminCommBadges";
import {
  AdminPageShell,
  AdminSegmentTabs,
  setHubTabParam,
} from "@/pages/admin/adminUi";

type SupportTab = "remote" | "inquiries";

function parseTab(raw: string | null): SupportTab {
  return raw === "inquiries" ? "inquiries" : "remote";
}

export default function AdminSupportHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const { counts } = useAdminCommBadges();

  const setTab = (next: SupportTab) => {
    const nextParams = setHubTabParam(searchParams, next, "remote");
    // Preserve remote deep-link params when staying on remote.
    if (next !== "remote") {
      nextParams.delete("sessionId");
    }
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <AdminPageShell
      title="지원"
      subtitle="원격 지원과 문의를 처리합니다."
      flush
      className="flex min-h-0 flex-1 flex-col"
    >
      <AdminSegmentTabs
        value={tab}
        onChange={setTab}
        options={[
          {
            value: "remote",
            label: "원격 지원",
            badge: counts.remoteSupport,
          },
          {
            value: "inquiries",
            label: "문의",
            badge: counts.inquiry,
          },
        ]}
      />
      <div className="min-h-0 flex-1">
        {tab === "remote" ? (
          <AdminRemoteSupportPage embedded />
        ) : (
          <AdminInquiriesPage embedded />
        )}
      </div>
    </AdminPageShell>
  );
}
