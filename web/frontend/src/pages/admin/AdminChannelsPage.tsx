// related files:
// - web/frontend/src/pages/admin/adminUi.tsx
// - web/frontend/src/pages/admin/support/AdminChatManagement.tsx
// - web/frontend/src/pages/admin/support/AdminSmsPage.tsx
// - web/frontend/src/pages/admin/support/AdminMailPage.tsx
// - web/frontend/src/shared/hooks/useAdminCommBadges.ts
// change-log:
// - 2026-09-06: 채팅·SMS·메일 허브(?tab=chat|sms|mail).
import { useSearchParams } from "react-router-dom";
import { AdminChatManagement } from "@/pages/admin/support/AdminChatManagement";
import AdminSmsPage from "@/pages/admin/support/AdminSmsPage";
import AdminMailPage from "@/pages/admin/support/AdminMailPage";
import { useAdminCommBadges } from "@/shared/hooks/useAdminCommBadges";
import {
  AdminPageShell,
  AdminSegmentTabs,
  setHubTabParam,
} from "@/pages/admin/adminUi";

type ChannelsTab = "chat" | "sms" | "mail";

function parseTab(raw: string | null): ChannelsTab {
  if (raw === "sms" || raw === "mail") return raw;
  return "chat";
}

export default function AdminChannelsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const { counts } = useAdminCommBadges();

  const setTab = (next: ChannelsTab) => {
    setSearchParams(setHubTabParam(searchParams, next, "chat"), {
      replace: true,
    });
  };

  return (
    <AdminPageShell flush className="flex min-h-0 flex-1 flex-col">
      <AdminSegmentTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "chat", label: "채팅", badge: counts.chat },
          { value: "sms", label: "메시지", badge: counts.sms },
          { value: "mail", label: "메일", badge: counts.mail },
        ]}
      />
      <div className="min-h-0 flex-1">
        {tab === "chat" ? <AdminChatManagement embedded /> : null}
        {tab === "sms" ? <AdminSmsPage embedded /> : null}
        {tab === "mail" ? <AdminMailPage embedded /> : null}
      </div>
    </AdminPageShell>
  );
}
