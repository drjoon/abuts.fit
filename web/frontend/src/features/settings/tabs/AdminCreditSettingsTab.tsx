// change-log:
// - 2026-08-10: 레이아웃·여백 정리, 긴 도움말은 툴팁으로 이동.
// - 2026-08-09: 디자인비 도움말에 출고 +1영업일(묶음·신속) 안내 추가.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/admin/settings/SettingsPage.tsx
// - web/frontend/src/pages/devops/DevopsPartnerPage.tsx
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CircleHelp, CreditCard } from "lucide-react";

interface CreditSettings {
  minCreditForRequest: number;
  shippingFee: number;
  expressFee: number;
  designFee: number;
  abutmentRetailPrice: number;
  defaultRequestFreeCredit: number;
  defaultShippingFreeCredit: number;
}

type CreditSettingsApiResponse = {
  success?: boolean;
  data?: {
    creditSettings?: Partial<CreditSettings>;
  };
};

const amountInputClassName =
  "h-9 w-full max-w-[10rem] tabular-nums tracking-tight";

function FieldHelp({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex text-muted-foreground/80 transition-colors hover:text-foreground"
          aria-label="도움말"
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-left leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function AmountField({
  id,
  label,
  value,
  onChange,
  disabled,
  help,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  help?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        {help ? <FieldHelp text={help} /> : null}
      </div>
      <Input
        id={id}
        type="number"
        min="0"
        className={amountInputClassName}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        disabled={disabled}
      />
    </div>
  );
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
        designFee: Number(data.designFee ?? CREDIT_SETTINGS_DEFAULTS.designFee),
        abutmentRetailPrice: Number(
          data.abutmentRetailPrice ??
            CREDIT_SETTINGS_DEFAULTS.abutmentRetailPrice ??
            40000,
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
          designFee: Number(saved.designFee ?? settings.designFee),
          abutmentRetailPrice: Number(
            saved.abutmentRetailPrice ?? settings.abutmentRetailPrice,
          ),
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

  const expressHelp = `생산 의뢰는 건당, 디자인+생산은 커스텀어벗 수만큼 곱합니다. 기본 ${CREDIT_SETTINGS_DEFAULTS.expressFee.toLocaleString("ko-KR")}원.`;
  const designHelp = `디자인+생산 시 생산비에 별도 추가됩니다. 출고일은 묶음·신속 모두 +1영업일. 기본 ${CREDIT_SETTINGS_DEFAULTS.designFee.toLocaleString("ko-KR")}원.`;
  const abutmentRetailHelp =
    "치과 기공의뢰에 포함되는 커스텀어벗 소매가(1어벗당). 치과 유료크레딧 차감·기공소 기공크레딧 분배에 사용됩니다.";

  return (
    <TooltipProvider delayDuration={0}>
      <Card className="app-glass-card app-glass-card--lg">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CreditCard className="h-5 w-5" />
            요금 · 크레딧
          </CardTitle>
          <CardDescription>
            전역 요금입니다. 의뢰 생성·표시·차감에 동일하게 적용됩니다.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <section className="rounded-xl border border-border/80 bg-background/60 p-4 sm:p-5 space-y-4">
            <h3 className="text-sm font-semibold tracking-tight">의뢰 · 배송</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <AmountField
                id="minCreditForRequest"
                label="신규의뢰 최소 크레딧 (원)"
                value={settings.minCreditForRequest}
                onChange={(next) =>
                  setSettings({ ...settings, minCreditForRequest: next })
                }
                disabled={loading}
              />
              <AmountField
                id="shippingFee"
                label="배송비 (원)"
                value={settings.shippingFee}
                onChange={(next) =>
                  setSettings({ ...settings, shippingFee: next })
                }
                disabled={loading}
              />
              <AmountField
                id="expressFee"
                label="신속 배송 추가 (원)"
                value={settings.expressFee}
                onChange={(next) =>
                  setSettings({ ...settings, expressFee: next })
                }
                disabled={loading}
                help={expressHelp}
              />
            </div>
          </section>

          <section className="rounded-xl border border-border/80 bg-background/60 p-4 sm:p-5 space-y-4">
            <h3 className="text-sm font-semibold tracking-tight">디자인</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <AmountField
                id="designFee"
                label="디자인비 (1어벗당, 원)"
                value={settings.designFee}
                onChange={(next) =>
                  setSettings({ ...settings, designFee: next })
                }
                disabled={loading}
                help={designHelp}
              />
              <AmountField
                id="abutmentRetailPrice"
                label="치과 납품 어벗 소매가 (1어벗당, 원)"
                value={settings.abutmentRetailPrice}
                onChange={(next) =>
                  setSettings({ ...settings, abutmentRetailPrice: next })
                }
                disabled={loading}
                help={abutmentRetailHelp}
              />
            </div>
          </section>

          <section className="rounded-xl border border-border/80 bg-background/60 p-4 sm:p-5 space-y-4">
            <h3 className="text-sm font-semibold tracking-tight">
              환영 무료 크레딧
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <AmountField
                id="defaultRequestFreeCredit"
                label="의뢰비 무료 크레딧 (원)"
                value={settings.defaultRequestFreeCredit}
                onChange={(next) =>
                  setSettings({ ...settings, defaultRequestFreeCredit: next })
                }
                disabled={loading}
              />
              <AmountField
                id="defaultShippingFreeCredit"
                label="배송비 무료 크레딧 (원)"
                value={settings.defaultShippingFreeCredit}
                onChange={(next) =>
                  setSettings({ ...settings, defaultShippingFreeCredit: next })
                }
                disabled={loading}
              />
            </div>
          </section>

          <div className="flex justify-end gap-2 border-t border-border/70 pt-4">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={loading || !hasChanges}
            >
              취소
            </Button>
            <Button onClick={handleSave} disabled={loading || !hasChanges}>
              {loading ? "저장 중…" : "저장"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};
