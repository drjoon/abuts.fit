import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Bell } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

type NotificationSettingsV2 = {
  methods: {
    emailNotifications: boolean;
    smsNotifications: boolean;
    pushNotifications: boolean;
    marketingEmails: boolean;
  };
  types: {
    newRequests: boolean;
    statusUpdates: boolean;
    payments: boolean;
  };
};

const defaultSettings: NotificationSettingsV2 = {
  methods: {
    emailNotifications: true,
    smsNotifications: true,
    pushNotifications: true,
    marketingEmails: true,
  },
  types: {
    newRequests: true,
    statusUpdates: true,
    payments: true,
  },
};

export const NotificationsTab = () => {
  const { toast } = useToast();
  const { token } = useAuthStore();

  const [settings, setSettings] =
    useState<NotificationSettingsV2>(defaultSettings);
  const [isLoading, setIsLoading] = useState(false);

  const mockHeaders = useMemo(() => {
    return {} as Record<string, string>;
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      setIsLoading(true);
      try {
        const res = await request<any>({
          path: "/api/users/notification-settings",
          method: "GET",
          token,
        });
        if (!res.ok) {
          return;
        }
        const body: any = res.data || {};
        const data = body.data || body;

        if (data?.methods && data?.types) {
          setSettings({
            methods: {
              emailNotifications:
                typeof data.methods.emailNotifications === "boolean"
                  ? data.methods.emailNotifications
                  : defaultSettings.methods.emailNotifications,
              smsNotifications:
                typeof data.methods.smsNotifications === "boolean"
                  ? data.methods.smsNotifications
                  : defaultSettings.methods.smsNotifications,
              pushNotifications:
                typeof data.methods.pushNotifications === "boolean"
                  ? data.methods.pushNotifications
                  : defaultSettings.methods.pushNotifications,
              marketingEmails:
                typeof data.methods.marketingEmails === "boolean"
                  ? data.methods.marketingEmails
                  : defaultSettings.methods.marketingEmails,
            },
            types: {
              newRequests:
                typeof data.types.newRequests === "boolean"
                  ? data.types.newRequests
                  : defaultSettings.types.newRequests,
              statusUpdates:
                typeof data.types.statusUpdates === "boolean"
                  ? data.types.statusUpdates
                  : defaultSettings.types.statusUpdates,
              payments:
                typeof data.types.payments === "boolean"
                  ? data.types.payments
                  : defaultSettings.types.payments,
            },
          });
        }
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [mockHeaders, token]);

  const saveSettings = async (nextSettings: NotificationSettingsV2) => {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        description: "알림 설정을 저장하려면 로그인해주세요.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = await request<any>({
        path: "/api/users/notification-settings",
        method: "PUT",
        token,
        headers: mockHeaders,
        jsonBody: nextSettings,
      });
      if (!res.ok) {
        toast({
          title: "저장에 실패했습니다",
          description:
            (res.data as any)?.message ||
            "알림 설정 저장 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMethod = (key: keyof NotificationSettingsV2["methods"]) => {
    setSettings((prev) => {
      const next = {
        ...prev,
        methods: { ...prev.methods, [key]: !prev.methods[key] },
      };
      void saveSettings(next);
      return next;
    });
  };

  const toggleType = (key: keyof NotificationSettingsV2["types"]) => {
    setSettings((prev) => {
      const next = {
        ...prev,
        types: { ...prev.types, [key]: !prev.types[key] },
      };
      void saveSettings(next);
      return next;
    });
  };

  return (
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          알림 설정
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-20 lg:grid-cols-2 m-6">
          {/* Notification Methods */}
          <div>
            <h3 className="text-lg font-medium mb-4">알림 수신 방법</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="emailNotifications" className="font-medium">
                    이메일 알림
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    중요 알림을 이메일로 받습니다
                  </p>
                </div>
                <Switch
                  id="emailNotifications"
                  checked={settings.methods.emailNotifications}
                  onCheckedChange={() => toggleMethod("emailNotifications")}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="smsNotifications" className="font-medium">
                    SMS 알림
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    중요 알림을 SMS로 받습니다
                  </p>
                </div>
                <Switch
                  id="smsNotifications"
                  checked={settings.methods.smsNotifications}
                  onCheckedChange={() => toggleMethod("smsNotifications")}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="marketingEmails" className="font-medium">
                    마케팅 이메일
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    프로모션 및 마케팅 정보를 받습니다
                  </p>
                </div>
                <Switch
                  id="marketingEmails"
                  checked={settings.methods.marketingEmails}
                  onCheckedChange={() => toggleMethod("marketingEmails")}
                />
              </div>
            </div>
          </div>

          {/* Notification Types */}
          <div>
            <h3 className="text-lg font-medium mb-4">알림 유형</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="newRequests" className="font-medium">
                    새 의뢰 알림
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    새로운 의뢰가 접수되면 알림을 받습니다
                  </p>
                </div>
                <Switch
                  id="newRequests"
                  checked={settings.types.newRequests}
                  onCheckedChange={() => toggleType("newRequests")}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="statusUpdates" className="font-medium">
                    상태 업데이트 알림
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    의뢰 상태가 변경되면 알림을 받습니다
                  </p>
                </div>
                <Switch
                  id="statusUpdates"
                  checked={settings.types.statusUpdates}
                  onCheckedChange={() => toggleType("statusUpdates")}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="payments" className="font-medium">
                    결제 알림
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    결제 관련 정보를 알림으로 받습니다
                  </p>
                </div>
                <Switch
                  id="payments"
                  checked={settings.types.payments}
                  onCheckedChange={() => toggleType("payments")}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="hidden" aria-hidden />
      </CardContent>
    </Card>
  );
};
