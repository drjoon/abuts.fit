// related files:
// - web/frontend/src/features/dashboard/SettingsPage.tsx
// - web/frontend/src/pages/admin/settings/SettingsPage.tsx
// change-log:
// - 2026-09-06: 영업본부 설정 — 어벗츠(admin) 사업자. 직원(member)은 사업자/임직원 탭 숨김.
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Bell, Building2, Shield, User, Users } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import {
  SettingsScaffold,
  type SettingsTabDef,
} from "@/features/components/SettingsScaffold";
import { AccountTab } from "@/features/settings/tabs/AccountTab";
import { StaffTab } from "@/features/settings/tabs/StaffTab";
import { NotificationsTab } from "@/features/settings/tabs/NotificationsTab";
import { RequestorSecurity } from "@/pages/requestor/settings/Security";
import { BusinessTab } from "@/shared/components/business/settings/BusinessTab";
import { useMembershipManagement } from "@/shared/components/business/settings/business/useMembershipManagement";

type TabKey = "account" | "business" | "staff" | "notifications" | "security";

/** 어벗츠 법인(BA type=admin) 기준. 대표만 사업자·임직원. */
export const SalesTeamSettingsPage = () => {
  const { user, token } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const membershipMgmt = useMembershipManagement({
    token: token || undefined,
    businessType: "admin",
  });
  const isOwner = membershipMgmt.membership === "owner";
  const membershipReady = membershipMgmt.joinRequestsLoaded;

  const tabs: SettingsTabDef[] = useMemo(() => {
    const next: SettingsTabDef[] = [
      {
        key: "account",
        label: "계정",
        icon: User,
        content: <AccountTab userData={user} />,
      },
    ];

    // 직원(member/pending)은 사업자·임직원 숨김. 로딩 중에도 숨겨 의뢰자 UI 깜빡임 방지.
    if (membershipReady && isOwner) {
      next.push(
        {
          key: "business",
          label: "사업자",
          icon: Building2,
          content: (
            <BusinessTab userData={user} businessTypeOverride="admin" />
          ),
        },
        {
          key: "staff",
          label: "임직원",
          icon: Users,
          content: <StaffTab userData={user} businessTypeOverride="admin" />,
        },
      );
    }

    next.push(
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
        content: <RequestorSecurity />,
      },
    );

    return next;
  }, [user, membershipReady, isOwner]);

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
