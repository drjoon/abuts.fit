// related files:
// - web/frontend/src/shared/components/business/settings/BusinessTab.tsx
// - web/frontend/src/pages/devops/components/DevopsDepositAccountTab.tsx
// - web/backend/controllers/businesses/business.update.controller.js
// change-log:
// - 2026-10-27: 기본값·발행 방식 안내 문단 삭제.
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
import { cn } from "@/shared/ui/cn";

type Props = {
  /** override when role resolution is ambiguous */
  businessTypeOverride?: string;
  className?: string;
};

export function TrusteeIssueSettingCard({
  businessTypeOverride,
  className,
}: Props) {
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
    <div
      className={cn(
        "flex h-full flex-col rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5",
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200/80">
          <FileText className="h-4 w-4 text-primary-strong" />
        </span>
        <p className="text-sm font-semibold leading-snug text-slate-900">
          어벗츠 위수탁 (세금)계산서 발행
        </p>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5">
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
