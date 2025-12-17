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

  const mockHeaders = useMemo(() => {
    if (token !== "MOCK_DEV_TOKEN") return {} as Record<string, string>;
    return {
      "x-mock-role": (user?.role || "requestor") as string,
      "x-mock-position": (user?.position || "staff") as string,
      "x-mock-email": user?.email || "mock@abuts.fit",
      "x-mock-name": user?.name || "사용자",
      "x-mock-organization":
        (user as any)?.organization || user?.companyName || "",
      "x-mock-phone": (user as any)?.phoneNumber || "",
    };
  }, [
    token,
    user?.companyName,
    user?.email,
    user?.name,
    user?.role,
    user?.position,
    user,
  ]);

  useEffect(() => {
    const load = async () => {
      try {
        if (!token) {
          setMembership("none");
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
      } catch {
        setMembership("none");
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
    ];

    // 직원은 비즈니스, 임직원, 배송, 결제 탭 접근 불가
    // 주대표/부대표만 접근 가능
    const position = user?.position || "staff";
    const canManageBusiness =
      position === "principal" || position === "vice_principal";

    if (canManageBusiness) {
      base.push({
        key: "business",
        label: "기공소",
        icon: Building2,
        content: <BusinessTab userData={user} />,
      });
    }

    base.push({
      key: "notifications",
      label: "알림",
      icon: Bell,
      content: <NotificationsTab />,
    });

    if (membership !== "owner") return base;
    if (!canManageBusiness) return base;

    // 중간 삽입을 위해 재구성
    const extendedTabs: SettingsTabDef[] = [
      base[0], // Account
      base[1], // Business
    ];

    extendedTabs.push({
      key: "staff",
      label: "임직원",
      icon: Users,
      content: <StaffTab userData={user} />,
    });

    extendedTabs.push({
      key: "shipping",
      label: "배송 옵션",
      icon: Truck,
      content: <ShippingTab userData={user} />,
    });

    extendedTabs.push({
      key: "payment",
      label: "결제",
      icon: CreditCard,
      content: <PaymentTab userData={user} />,
    });

    extendedTabs.push(base[2]); // Notifications

    return extendedTabs;
  }, [membership, user]);

  const tabFromUrl =
    (searchParams.get("tab") as TabKey | null) || (tabs[0]?.key as TabKey);
  const allowed = new Set(tabs.map((t) => t.key));
  const activeTab = allowed.has(tabFromUrl)
    ? tabFromUrl
    : (tabs[0]?.key as TabKey);

  const subtitle = useMemo(() => {
    if (membership === "owner") {
      return "계정과 기공소 설정, 임직원/배송/결제 정보를 관리하세요";
    }
    if (membership === "member") {
      return "계정 설정을 변경하고, 기공소 정보는 읽기 전용으로 확인할 수 있어요";
    }
    if (membership === "pending") {
      return "기공소 승인 대기 중입니다. 진행 상태는 '기공소' 탭에서 확인하세요";
    }
    if (membership === "none") {
      return "기공소 소속을 설정하면 의뢰 제출을 진행할 수 있어요";
    }
    return "계정 정보와 비즈니스 설정을 관리하세요";
  }, [membership]);

  return (
    <SettingsScaffold
      title="설정"
      subtitle={subtitle}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(next) => setSearchParams({ tab: next })}
    />
  );
};
