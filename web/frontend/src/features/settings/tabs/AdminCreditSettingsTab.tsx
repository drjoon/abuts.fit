import { useState, useEffect } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
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
  defaultFreeShippingCredit: number;
}

export const AdminCreditSettingsTab = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<CreditSettings>({
    minCreditForRequest: 10000,
    shippingFee: 3500,
    defaultFreeShippingCredit: 3500,
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

      const data = res.data?.data?.creditSettings || settings;
      setSettings(data);
      setOriginalSettings(data);
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
          <CardTitle>신규의뢰 크레딧 설정</CardTitle>
          <CardDescription>
            신규의뢰 생성 시 필요한 최소 크레딧 금액을 설정합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="minCreditForRequest">최소 크레딧 (원)</Label>
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
            <p className="text-sm text-slate-500">
              신규의뢰 생성 시 유/무료 크레딧 합계가 이 금액 이상이어야 합니다.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>배송비 설정</CardTitle>
          <CardDescription>
            배송비 및 배송비 무료 크레딧 기본값을 설정합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
            <p className="text-sm text-slate-500">
              택배 접수 시 차감되는 배송비입니다. 유료 크레딧으로만 결제
              가능합니다.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="defaultFreeShippingCredit">
              기본 배송비 무료 크레딧 (원)
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
            <p className="text-sm text-slate-500">
              신규 가입 시 지급되는 배송비 무료 크레딧 기본값입니다.
            </p>
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
