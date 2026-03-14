import { useState, useEffect } from "react";
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
  defaultWelcomeBonusCredit: number;
  defaultFreeShippingCredit: number;
}

export const AdminCreditSettingsTab = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<CreditSettings>({
    ...CREDIT_SETTINGS_DEFAULTS,
  });
  const [originalSettings, setOriginalSettings] =
    useState<CreditSettings>(settings);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await apiFetch<any>({
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
        defaultWelcomeBonusCredit: Number(
          data.defaultWelcomeBonusCredit ??
            CREDIT_SETTINGS_DEFAULTS.defaultWelcomeBonusCredit,
        ),
        defaultFreeShippingCredit: Number(
          data.defaultFreeShippingCredit ??
            CREDIT_SETTINGS_DEFAULTS.defaultFreeShippingCredit,
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
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const res = await apiFetch<any>({
        path: "/api/admin/settings/credits",
        method: "PATCH",
        token,
        jsonBody: settings,
      });

      if (!res.ok) {
        throw new Error("설정 저장 실패");
      }

      setOriginalSettings(settings);
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
          <CardTitle>최소 요구 크레딧</CardTitle>
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
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>가입 시 지급 무료 크레딧</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="defaultWelcomeBonusCredit">
                의뢰비 무료 크레딧 (원)
              </Label>
              <Input
                id="defaultWelcomeBonusCredit"
                type="number"
                min="0"
                value={settings.defaultWelcomeBonusCredit}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    defaultWelcomeBonusCredit: Math.max(
                      0,
                      Number(e.target.value),
                    ),
                  })
                }
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultFreeShippingCredit">
                배송비 무료 크레딧 (원)
              </Label>
              <Input
                id="defaultFreeShippingCredit"
                type="number"
                min="0"
                value={settings.defaultFreeShippingCredit}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    defaultFreeShippingCredit: Math.max(
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
