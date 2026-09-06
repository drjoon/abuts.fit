// related files:
// - web/frontend/src/pages/admin/adminUi.tsx
// - web/frontend/src/pages/admin/businesses/AdminBusinessPage.tsx
// - web/frontend/src/pages/admin/users/AdminUserManagement.tsx
// change-log:
// - 2026-09-06: 사업자·사용자 허브(?tab=businesses|users).
import { useSearchParams } from "react-router-dom";
import AdminBusinessPage from "@/pages/admin/businesses/AdminBusinessPage";
import { AdminUserManagement } from "@/pages/admin/users/AdminUserManagement";
import {
  AdminPageShell,
  AdminSegmentTabs,
  setHubTabParam,
} from "@/pages/admin/adminUi";

type MembersTab = "businesses" | "users";

function parseTab(raw: string | null): MembersTab {
  return raw === "users" ? "users" : "businesses";
}

export default function AdminMembersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const setTab = (next: MembersTab) => {
    setSearchParams(setHubTabParam(searchParams, next, "businesses"), {
      replace: true,
    });
  };

  return (
    <AdminPageShell
      title="회원"
      subtitle="사업자와 사용자를 한곳에서 관리합니다."
      className="flex min-h-0 flex-1 flex-col"
      flush
    >
      <AdminSegmentTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "businesses", label: "사업자" },
          { value: "users", label: "사용자" },
        ]}
      />
      <div className="min-h-0 flex-1">
        {tab === "businesses" ? (
          <AdminBusinessPage embedded />
        ) : (
          <AdminUserManagement embedded />
        )}
      </div>
    </AdminPageShell>
  );
}
