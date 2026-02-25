import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import {
  SettingsScaffold,
  type SettingsTabDef,
} from "@/features/components/SettingsScaffold";
import { SettingsTabsSkeleton } from "@/features/components/SettingsSkeletons";
import { AccountTab } from "@/features/settings/tabs/AccountTab";
import { BusinessTab } from "./components/BusinessTab";
import { StaffTab } from "@/features/settings/tabs/StaffTab";
import { PaymentTab } from "@/features/settings/tabs/CreditPaymentTab";
import { NotificationsTab } from "@/features/settings/tabs/NotificationsTab";
import { ShippingTab } from "./components/ShippingTab";
import { User, Building2, CreditCard, Bell, Truck, Users } from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { RequestorSecurity } from "./Security";
import { Shield } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";

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
  const { toast } = useToast();

  const [membership, setMembership] = useState<
    "owner" | "member" | "pending" | "none" | "unknown"
  >(token ? "unknown" : "none");
  const [canManageStaff, setCanManageStaff] = useState(false);
  const [loadingMembership, setLoadingMembership] = useState(Boolean(token));

  const mockHeaders = useMemo(() => {
    return {} as Record<string, string>;
  }, []);

  const organizationType = useMemo(() => {
    const role = String(user?.role || "requestor").trim();
    return role || "requestor";
  }, [user?.role]);

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
          path: `/api/organizations/me?organizationType=${encodeURIComponent(
            organizationType,
          )}`,
          method: "GET",
          token,
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
  }, [organizationType, token]);

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
        label: "사업자",
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

  return (
    <>
      <SettingsScaffold
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(next) => {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.set("tab", next);
          setSearchParams(nextParams, { replace: true });
        }}
      />
    </>
  );
};
