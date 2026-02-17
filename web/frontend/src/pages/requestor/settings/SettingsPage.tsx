import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { useGuideTour } from "@/features/guidetour/GuideTourProvider";
import {
  SettingsScaffold,
  type SettingsTabDef,
} from "@/features/components/SettingsScaffold";
import { SettingsTabsSkeleton } from "@/features/components/SettingsSkeletons";
import { AccountTab } from "./components/AccountTab";
import { BusinessTab } from "./components/BusinessTab";
import { StaffTab } from "./components/StaffTab";
import { PaymentTab } from "@/features/settings/tabs/CreditPaymentTab";
import { NotificationsTab } from "@/features/settings/tabs/NotificationsTab";
import { ShippingTab } from "./components/ShippingTab";
import { User, Building2, CreditCard, Bell, Truck, Users } from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { RequestorSecurity } from "./Security";
import { Shield } from "lucide-react";

type TabKey =
  | "account"
  | "business"
  | "staff"
  | "shipping"
  | "payment"
  | "notifications"
  | "security";

export const RequestorSettingsPage = () => {
  const { user, token } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    active: guideActive,
    activeTourId,
    steps: guideSteps,
    currentStepIndex,
  } = useGuideTour();

  const guideHighlightTab = useMemo((): TabKey | undefined => {
    if (!guideActive) return undefined;
    if (activeTourId !== "requestor-onboarding") return undefined;
    const stepId = guideSteps[currentStepIndex]?.id;
    if (!stepId) return undefined;
    if (stepId.startsWith("requestor.business")) return "business";
    if (
      stepId.startsWith("requestor.account") ||
      stepId.startsWith("requestor.phone")
    ) {
      return "account";
    }
    return undefined;
  }, [activeTourId, currentStepIndex, guideActive, guideSteps]);

  const [membership, setMembership] = useState<
    "owner" | "member" | "pending" | "none" | "unknown"
  >(token ? "unknown" : "none");
  const [canManageStaff, setCanManageStaff] = useState(false);
  const [loadingMembership, setLoadingMembership] = useState(Boolean(token));

  const mockHeaders = useMemo(() => {
    if (token !== "MOCK_DEV_TOKEN") return {} as Record<string, string>;
    return {
      "x-mock-role": (user?.role || "requestor") as string,
      "x-mock-email": user?.email || "mock@abuts.fit",
      "x-mock-name": user?.name || "사용자",
      "x-mock-organization":
        (user as any)?.organization || user?.companyName || "",
      "x-mock-phone": (user as any)?.phoneNumber || "",
    };
  }, [token, user?.companyName, user?.email, user?.name, user?.role, user]);

  useEffect(() => {
    const load = async () => {
      if (!token) {
        setMembership("none");
        setCanManageStaff(false);
        setLoadingMembership(false);
        return;
      }

      setLoadingMembership(true);
      try {
        const res = await request<any>({
          path: "/api/requestor-organizations/me",
          method: "GET",
          token,
          headers: mockHeaders,
        });
        if (!res.ok) {
          setMembership("none");
          setCanManageStaff(false);
          return;
        }
        const body: any = res.data || {};
        const data = body.data || body;
        const next = String(data?.membership || "none") as
          | "owner"
          | "member"
          | "pending"
          | "none";
        setMembership(next);
        setCanManageStaff(next === "owner");
      } catch {
        setMembership("none");
        setCanManageStaff(false);
      } finally {
        setLoadingMembership(false);
      }
    };

    void load();
  }, [mockHeaders, token]);

  useEffect(() => {
    return;
  }, [
    activeTourId,
    currentStepIndex,
    guideActive,
    guideSteps,
    searchParams,
    setSearchParams,
  ]);

  const tabs: SettingsTabDef[] = useMemo(() => {
    const base: SettingsTabDef[] = [
      {
        key: "account",
        label: "계정",
        icon: User,
        content: <AccountTab userData={user} />,
      },
      {
        key: "business",
        label: "기공소",
        icon: Building2,
        content: <BusinessTab userData={user} />,
      },
    ];

    if (canManageStaff) {
      base.push({
        key: "staff",
        label: "임직원",
        icon: Users,
        content: <StaffTab userData={user} />,
      });
    }

    base.push(
      {
        key: "shipping",
        label: "배송",
        icon: Truck,
        content: <ShippingTab userData={user} />,
      },
      {
        key: "payment",
        label: "결제",
        icon: CreditCard,
        content: <PaymentTab userData={user} />,
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
        content: <RequestorSecurity />,
      },
    );

    return base;
  }, [canManageStaff, user]);

  const tabFromUrl =
    (searchParams.get("tab") as TabKey | null) || (tabs[0]?.key as TabKey);
  const allowed = new Set(tabs.map((t) => t.key));
  const activeTab = allowed.has(tabFromUrl)
    ? tabFromUrl
    : (tabs[0]?.key as TabKey);

  if (loadingMembership) {
    return <SettingsTabsSkeleton />;
  }

  const highlightTabKey =
    guideHighlightTab && guideHighlightTab === activeTab
      ? guideHighlightTab
      : undefined;

  return (
    <>
      <SettingsScaffold
        tabs={tabs}
        activeTab={activeTab}
        highlightTabKey={highlightTabKey}
        onTabChange={(next) => {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.set("tab", next);
          setSearchParams(nextParams, { replace: true });
        }}
      />
    </>
  );
};
