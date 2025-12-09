import { useAuthStore } from "@/store/useAuthStore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// 탭 컴포넌트 import
import { AccountTab } from "@/components/settings/AccountTab";
import { BusinessTab } from "@/components/settings/BusinessTab";
import { PricingTab } from "@/components/settings/PricingTab";
import { PaymentTab } from "@/components/settings/PaymentTab";
import { NotificationsTab } from "@/components/settings/NotificationsTab";
import { ShippingTab } from "@/components/settings/ShippingTab";

import { User, Building2, CreditCard, Bell, Truck } from "lucide-react";

export const SettingsPage = () => {
  const { user } = useAuthStore();

  const isManufacturer = user?.role === "manufacturer";
  const baseTabs = 4; // account, business, payment, notifications
  const pricingTabs = isManufacturer ? 1 : 0;
  const shippingTabs = 1; // 배송 옵션 탭
  const totalTabs = baseTabs + pricingTabs + shippingTabs;

  return (
    <div className="min-h-screen bg-gradient-subtle p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-hero bg-clip-text text-transparent">
            설정
          </h1>
          <p className="text-muted-foreground text-lg">
            계정 정보와 비즈니스 설정을 관리하세요
          </p>
        </div>

        {/* Settings Tabs */}
        <Tabs defaultValue="account" className="space-y-6">
          <TabsList className={`grid w-full ${`grid-cols-${totalTabs}`}`}>
            <TabsTrigger value="account" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              계정
            </TabsTrigger>
            <TabsTrigger value="business" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              사업자
            </TabsTrigger>
            <TabsTrigger value="shipping" className="flex items-center gap-2">
              <Truck className="h-4 w-4" />
              배송 옵션
            </TabsTrigger>
            {user?.role === "manufacturer" && (
              <TabsTrigger value="pricing" className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                가격
              </TabsTrigger>
            )}
            <TabsTrigger value="payment" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              결제
            </TabsTrigger>
            <TabsTrigger
              value="notifications"
              className="flex items-center gap-2"
            >
              <Bell className="h-4 w-4" />
              알림
            </TabsTrigger>
          </TabsList>

          {/* Account Settings */}
          <TabsContent value="account">
            <AccountTab userData={user} />
          </TabsContent>

          {/* Business Settings */}
          <TabsContent value="business">
            <BusinessTab userData={user} />
          </TabsContent>

          {/* Shipping Settings */}
          <TabsContent value="shipping">
            <ShippingTab userData={user} />
          </TabsContent>

          {/* Pricing Settings (for manufacturers) */}
          {user?.role === "manufacturer" && (
            <TabsContent value="pricing">
              <PricingTab />
            </TabsContent>
          )}

          {/* Payment Settings */}
          <TabsContent value="payment">
            <PaymentTab userData={user} />
          </TabsContent>

          {/* Notification Settings */}
          <TabsContent value="notifications">
            <NotificationsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
