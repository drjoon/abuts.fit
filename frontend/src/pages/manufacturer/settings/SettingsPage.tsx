import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import {
  SettingsScaffold,
  type SettingsTabDef,
} from "@/features/components/SettingsScaffold";
import { AccountTab } from "./components/AccountTab";
import { BusinessTab } from "./components/BusinessTab";
import { PricingTab } from "@/components/settings/PricingTab";
import { PaymentTab } from "@/components/settings/PaymentTab";
import { NotificationsTab } from "@/components/settings/NotificationsTab";
import { ShippingTab } from "@/components/settings/ShippingTab";
import { User, Building2, CreditCard, Bell, Truck } from "lucide-react";

type TabKey =
  | "account"
  | "business"
  | "shipping"
  | "pricing"
  | "payment"
  | "notifications";

export const ManufacturerSettingsPage = () => {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs: SettingsTabDef[] = useMemo(
    () => [
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
      {
        key: "shipping",
        label: "배송 옵션",
        icon: Truck,
        content: <ShippingTab userData={user} />,
      },
      {
        key: "pricing",
        label: "가격",
        icon: CreditCard,
        content: <PricingTab />,
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
    ],
    [user]
  );

  const tabFromUrl =
    (searchParams.get("tab") as TabKey | null) || (tabs[0]?.key as TabKey);
  const allowed = new Set(tabs.map((t) => t.key));
  const activeTab = allowed.has(tabFromUrl)
    ? tabFromUrl
    : (tabs[0]?.key as TabKey);

  return (
    <SettingsScaffold
      title="설정"
      subtitle="계정 정보와 비즈니스 설정을 관리하세요"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(next) => setSearchParams({ tab: next })}
    />
  );
};
