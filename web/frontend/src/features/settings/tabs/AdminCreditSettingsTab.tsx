// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/admin/settings/SettingsPage.tsx
// - web/frontend/src/pages/devops/DevopsSettingsPage.tsx
// - web/backend/controllers/admin/admin.settings.controller.js
// - web/backend/models/systemSettings.model.js
// - web/backend/utils/creditSettingsDefaults.js
import { useCallback, useState, useEffect } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { CREDIT_SETTINGS_DEFAULTS } from "@/hooks/useSystemSettings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface CreditSettings {
  minCreditForRequest: number;
  shippingFee: number;
  expressFee: number;
  defaultRequestFreeCredit: number;
  defaultShippingFreeCredit: number;
}

type CreditSettingsApiResponse = {
  success?: boolean;
  data?: {
    creditSettings?: Partial<CreditSettings>;
  };
};

export const AdminCreditSettingsTab = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<CreditSettings>({
    ...CREDIT_SETTINGS_DEFAULTS,
  });
  const [originalSettings, setOriginalSettings] =
    useState<CreditSettings>(settings);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch<CreditSettingsApiResponse>({
        path: "/api/credits/settings",
        method: "GET",
        token,
      });

      if (!res.ok) {
        throw new Error("설정 조회 실패");
      }

      const data = res.data?.data?.creditSettings || CREDIT_SETTINGS_DEFAULTS;
      const normalized: CreditSettings = {
        minCreditForRequest: Number(
          data.minCreditForRequest ??
            CREDIT_SETTINGS_DEFAULTS.minCreditForRequest,
        ),
        shippingFee: Number(
          data.shippingFee ?? CREDIT_SETTINGS_DEFAULTS.shippingFee,
        ),
        expressFee: Number(
          data.expressFee ?? CREDIT_SETTINGS_DEFAULTS.expressFee,
        ),
        defaultRequestFreeCredit: Number(
          data.defaultRequestFreeCredit ??
            CREDIT_SETTINGS_DEFAULTS.defaultRequestFreeCredit,
        ),
        defaultShippingFreeCredit: Number(
          data.defaultShippingFreeCredit ??
            CREDIT_SETTINGS_DEFAULTS.defaultShippingFreeCredit,
        ),
      };

      setSettings(normalized);
      setOriginalSettings(normalized);
    } catch (error) {
      toast({
        title: "설정 조회 실패",
        description: error instanceof Error ? error.message : "알 수 없는 오류",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    try {
      setLoading(true);
      const res = await apiFetch<CreditSettingsApiResponse>({
        path: "/api/admin/settings/credits",
        method: "PATCH",
        token,
        jsonBody: settings,
      });

      if (!res.ok) {
        throw new Error("설정 저장 실패");
      }

      const saved = res.data?.data?.creditSettings;
      if (saved) {
        const normalized: CreditSettings = {
          minCreditForRequest: Number(
            saved.minCreditForRequest ?? settings.minCreditForRequest,
          ),
          shippingFee: Number(saved.shippingFee ?? settings.shippingFee),
          expressFee: Number(saved.expressFee ?? settings.expressFee),
          defaultRequestFreeCredit: Number(
            saved.defaultRequestFreeCredit ?? settings.defaultRequestFreeCredit,
          ),
          defaultShippingFreeCredit: Number(
            saved.defaultShippingFreeCredit ??
              settings.defaultShippingFreeCredit,
          ),
        };
        setSettings(normalized);
        setOriginalSettings(normalized);
      } else {
        setOriginalSettings(settings);
      }
      toast({
        title: "설정이 저장되었습니다",
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: "설정 저장 실패",
        description: error instanceof Error ? error.message : "알 수 없는 오류",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setSettings(originalSettings);
  };

  const hasChanges =
    JSON.stringify(settings) !== JSON.stringify(originalSettings);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>최소 요구 크레딧 / 배송 요금</CardTitle>
          <CardDescription>
            전역 설정입니다. 신속 배송 추가비(
            <code className="text-xs">creditSettings.expressFee</code>)는 의뢰
            생성·표시·차감에 동일하게 적용됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="minCreditForRequest">
                신규의뢰 최소 크레딧 (원)
              </Label>
              <Input
                id="minCreditForRequest"
                type="number"
                min="0"
                value={settings.minCreditForRequest}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    minCreditForRequest: Math.max(0, Number(e.target.value)),
                  })
                }
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shippingFee">배송비 (원)</Label>
              <Input
                id="shippingFee"
                type="number"
                min="0"
                value={settings.shippingFee}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    shippingFee: Math.max(0, Number(e.target.value)),
                  })
                }
                disabled={loading}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="expressFee">신속 배송 추가 의뢰크레딧 (원)</Label>
              <Input
                id="expressFee"
                type="number"
                min="0"
                value={settings.expressFee}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    expressFee: Math.max(0, Number(e.target.value)),
                  })
                }
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                신속배송 건당 가공비에 더해지는 추가 의뢰크레딧입니다. 기본값{" "}
                {CREDIT_SETTINGS_DEFAULTS.expressFee.toLocaleString("ko-KR")}원.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>환영 무료 크레딧 지급 설정</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="defaultRequestFreeCredit">
                의뢰비 무료 크레딧 (원)
              </Label>
              <Input
                id="defaultRequestFreeCredit"
                type="number"
                min="0"
                value={settings.defaultRequestFreeCredit}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    defaultRequestFreeCredit: Math.max(
                      0,
                      Number(e.target.value),
                    ),
                  })
                }
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultShippingFreeCredit">
                배송비 무료 크레딧 (원)
              </Label>
              <Input
                id="defaultShippingFreeCredit"
                type="number"
                min="0"
                value={settings.defaultShippingFreeCredit}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    defaultShippingFreeCredit: Math.max(
                      0,
                      Number(e.target.value),
                    ),
                  })
                }
                disabled={loading}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 justify-end">
        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={loading || !hasChanges}
        >
          취소
        </Button>
        <Button onClick={handleSave} disabled={loading || !hasChanges}>
          {loading ? "저장 중..." : "저장"}
        </Button>
      </div>
    </div>
  );
};
