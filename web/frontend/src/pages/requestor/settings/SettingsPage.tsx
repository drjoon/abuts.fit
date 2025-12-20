import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import {
  SettingsScaffold,
  type SettingsTabDef,
} from "@/features/components/SettingsScaffold";
import { AccountTab } from "./components/AccountTab";
import { BusinessTab } from "./components/BusinessTab";
import { StaffTab } from "./components/StaffTab";
import { PaymentTab } from "./components/PaymentTab";
import { NotificationsTab } from "./components/NotificationsTab";
import { ShippingTab } from "./components/ShippingTab";
import { User, Building2, CreditCard, Bell, Truck, Users } from "lucide-react";
import { request } from "@/lib/apiClient";

type TabKey =
  | "account"
  | "business"
  | "staff"
  | "shipping"
  | "payment"
  | "notifications";

export const RequestorSettingsPage = () => {
  const { user, token } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const [membership, setMembership] = useState<
    "owner" | "member" | "pending" | "none" | "unknown"
  >(token ? "unknown" : "none");
  const [canManageStaff, setCanManageStaff] = useState(false);

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
      try {
        if (!token) {
          setMembership("none");
          setCanManageStaff(false);
          return;
        }
        const res = await request<any>({
          path: "/api/requestor-organizations/me",
          method: "GET",
          token,
          headers: mockHeaders,
        });
        if (!res.ok) {
          setMembership("none");
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
      }
    };

    load();
  }, [mockHeaders, token]);

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
      }
    );

    return base;
  }, [canManageStaff, user]);

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
      onTabChange={(next) => setSearchParams({ tab: next })}
    />
  );
};
