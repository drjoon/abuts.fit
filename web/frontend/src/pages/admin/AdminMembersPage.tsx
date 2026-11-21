// related files:
// - web/frontend/src/pages/admin/adminUi.tsx
// - web/frontend/src/pages/admin/businesses/AdminBusinessPage.tsx
// - web/frontend/src/pages/admin/users/AdminUserManagement.tsx
// - web/frontend/src/shared/hooks/useAdminCommBadges.ts
// change-log:
// - 2026-09-18: 사용자 탭 승인대기 unread 배지.
// - 2026-09-06: 사업자·사용자 허브(?tab=businesses|users).
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import AdminBusinessPage from "@/pages/admin/businesses/AdminBusinessPage";
import { AdminUserManagement } from "@/pages/admin/users/AdminUserManagement";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { useAdminCommBadges } from "@/shared/hooks/useAdminCommBadges";
import {
  AdminPageShell,
  AdminSegmentTabs,
  setHubTabParam,
  useHubUnreadTabRedirect,
} from "@/pages/admin/adminUi";

type MembersTab = "businesses" | "users";

function parseTab(raw: string | null): MembersTab {
  return raw === "users" ? "users" : "businesses";
}

export default function AdminMembersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const { counts } = useAdminCommBadges();
  const { token } = useAuthStore();
  const { toast } = useToast();

  const copyManufacturerSignupLink = () => {
    void request<{ data?: { path?: string } }>({
      path: "/api/admin/manufacturer-signup-link",
      method: "GET",
      token,
    }).then(async (res) => {
      const path = String(res.data?.data?.path || "").trim();
      if (!res.ok || !path) {
        toast({
          title: "가입 링크를 만들지 못했습니다",
          variant: "destructive",
        });
        return;
      }
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      toast({ title: "제조사 가입 링크를 복사했습니다" });
    });
  };

  useHubUnreadTabRedirect("businesses", [
    { value: "users", badge: counts.member },
  ]);

  const setTab = (next: MembersTab) => {
    setSearchParams(setHubTabParam(searchParams, next, "businesses"), {
      replace: true,
    });
  };

  return (
    <AdminPageShell flush className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AdminSegmentTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "businesses", label: "사업자" },
            { value: "users", label: "사용자", badge: counts.member },
          ]}
        />
        <Button
          type="button"
          size="sm"
          className="bg-blue-600 text-white hover:bg-blue-700"
          onClick={copyManufacturerSignupLink}
        >
          제조사 가입 링크
        </Button>
      </div>
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
