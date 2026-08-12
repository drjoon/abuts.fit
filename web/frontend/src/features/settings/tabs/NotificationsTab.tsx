// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Bell,
  CreditCard,
  FileText,
  Mail,
  Megaphone,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/shared/ui/cn";
import type { LucideIcon } from "lucide-react";

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

type ToggleRowProps = {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: () => void;
};

const ToggleRow = ({
  id,
  icon: Icon,
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: ToggleRowProps) => (
  <div
    className={cn(
      "flex items-center justify-between gap-4 rounded-2xl border px-4 py-3.5 transition-colors",
      checked
        ? "border-primary-muted/70 bg-primary-soft/25"
        : "border-slate-200/80 bg-white/70",
      disabled && "opacity-60",
    )}
  >
    <div className="flex min-w-0 items-start gap-3">
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1",
          checked
            ? "bg-white text-primary-strong ring-primary-muted/60"
            : "bg-slate-100 text-slate-500 ring-slate-200/80",
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-semibold text-slate-900">
          {title}
        </Label>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
    <Switch
      id={id}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      className="shrink-0"
    />
  </div>
);

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
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-5 w-5 text-primary-strong" />
          알림 설정
        </CardTitle>
        <CardDescription className="text-[13px] leading-relaxed">
          수신 방법과 알림 유형을 선택합니다. 변경 시 자동 저장됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200/80">
              <MessageSquare className="h-4 w-4 text-primary-strong" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                알림 수신 방법
              </h3>
              <p className="text-xs text-muted-foreground">
                어떤 채널로 받을지 선택하세요
              </p>
            </div>
          </div>
          <div className="space-y-2.5">
            <ToggleRow
              id="emailNotifications"
              icon={Mail}
              title="이메일 알림"
              description="중요 알림을 이메일로 받습니다"
              checked={settings.methods.emailNotifications}
              disabled={isLoading}
              onCheckedChange={() => toggleMethod("emailNotifications")}
            />
            <ToggleRow
              id="smsNotifications"
              icon={MessageSquare}
              title="SMS 알림"
              description="중요 알림을 문자로 받습니다"
              checked={settings.methods.smsNotifications}
              disabled={isLoading}
              onCheckedChange={() => toggleMethod("smsNotifications")}
            />
            <ToggleRow
              id="marketingEmails"
              icon={Megaphone}
              title="마케팅 이메일"
              description="프로모션·이벤트 정보를 받습니다"
              checked={settings.methods.marketingEmails}
              disabled={isLoading}
              onCheckedChange={() => toggleMethod("marketingEmails")}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200/80">
              <Bell className="h-4 w-4 text-primary-strong" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                알림 유형
              </h3>
              <p className="text-xs text-muted-foreground">
                받고 싶은 알림 종류를 선택하세요
              </p>
            </div>
          </div>
          <div className="space-y-2.5">
            <ToggleRow
              id="newRequests"
              icon={FileText}
              title="새 의뢰 알림"
              description="새 의뢰가 접수되면 알려드립니다"
              checked={settings.types.newRequests}
              disabled={isLoading}
              onCheckedChange={() => toggleType("newRequests")}
            />
            <ToggleRow
              id="statusUpdates"
              icon={RefreshCw}
              title="상태 업데이트"
              description="의뢰 진행 상태가 바뀌면 알려드립니다"
              checked={settings.types.statusUpdates}
              disabled={isLoading}
              onCheckedChange={() => toggleType("statusUpdates")}
            />
            <ToggleRow
              id="payments"
              icon={CreditCard}
              title="결제 알림"
              description="결제·정산 관련 소식을 받습니다"
              checked={settings.types.payments}
              disabled={isLoading}
              onCheckedChange={() => toggleType("payments")}
            />
          </div>
        </section>
      </CardContent>
    </Card>
  );
};
