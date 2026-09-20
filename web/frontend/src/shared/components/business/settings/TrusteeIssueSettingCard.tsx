// related files:
// - web/frontend/src/shared/components/business/settings/BusinessTab.tsx
// - web/frontend/src/pages/devops/components/DevopsDepositAccountTab.tsx
// - web/backend/controllers/businesses/business.update.controller.js
// change-log:
// - 2026-09-21: 딜러사(salesman) 위수탁 카드는 설정>사업자에서 PayoutAccountCard와 함께 노출.
// - 2026-09-20: 위수탁 대신발행 옵트아웃 토글(기본 ON).
import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import {
  invalidateBusinessMeCache,
  loadBusinessMeCached,
} from "@/shared/components/business/settings/business/businessMeCache";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";

type Props = {
  /** override when role resolution is ambiguous */
  businessTypeOverride?: string;
};

export function TrusteeIssueSettingCard({ businessTypeOverride }: Props) {
  const { token, user } = useAuthStore();
  const { toast } = useToast();
  const businessType = resolveBusinessType(
    user?.role,
    businessTypeOverride || "requestor",
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await loadBusinessMeCached({
        token,
        businessType,
        force: true,
      });
      setEnabled(data?.taxInvoice?.trusteeIssueEnabled !== false);
    } catch {
      setEnabled(true);
    } finally {
      setLoading(false);
    }
  }, [token, businessType]);

  useEffect(() => {
    void load();
  }, [load]);

  const onToggle = async (next: boolean) => {
    if (!token || saving) return;
    const prev = enabled;
    setEnabled(next);
    setSaving(true);
    try {
      const res = await request({
        path: `/api/businesses/me?businessType=${encodeURIComponent(businessType)}`,
        method: "PATCH",
        token,
        jsonBody: { taxInvoice: { trusteeIssueEnabled: next } },
      });
      if (!res.ok) {
        setEnabled(prev);
        throw new Error(
          (res.data as { message?: string } | undefined)?.message ||
            "저장 실패",
        );
      }
      invalidateBusinessMeCache({ token, businessType });
      toast({
        title: next
          ? "어벗츠 위수탁 발행을 사용합니다"
          : "직접 발행으로 변경했습니다",
        description: next
          ? "정산 확정 시 어벗츠가 위탁자 명의로 (세금)계산서를 대신 발행합니다."
          : "어벗츠는 계산서를 만들지 않습니다. 직접 발행한 뒤 지급을 요청하세요.",
        duration: 4000,
      });
    } catch (error) {
      toast({
        title: "설정 저장 실패",
        description:
          error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
        duration: 4000,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-muted p-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium">어벗츠 위수탁 (세금)계산서 발행</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            기본값: 켜짐. 어벗츠가 수탁자로 귀사 명의 월합 (세금)계산서를 대신
            발행합니다. 끄면 귀사가 직접 발행하고, 어벗츠는 지급 시 수취만
            합니다.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 pl-11">
        <Label htmlFor="trustee-issue-enabled" className="text-sm">
          {enabled ? "대신 발행 사용" : "직접 발행"}
        </Label>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Switch
            id="trustee-issue-enabled"
            checked={enabled}
            disabled={saving}
            onCheckedChange={(v) => void onToggle(Boolean(v))}
          />
        )}
      </div>
    </div>
  );
}
