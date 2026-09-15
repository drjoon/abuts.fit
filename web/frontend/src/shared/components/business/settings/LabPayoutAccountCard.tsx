// related files:
// - web/frontend/src/shared/settlement/labPayoutBankbook.ts
// - web/frontend/src/shared/components/business/settings/BusinessTab.tsx
// - web/backend/controllers/businesses/business.update.controller.js
// change-log:
// - 2026-09-16: 기공소 정산 입금 계좌·통장 사본 등록(설정>사업자).
import { useCallback, useEffect, useState } from "react";
import { Landmark, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { useUploadWithProgressToast } from "@/shared/hooks/useUploadWithProgressToast";
import {
  invalidateBusinessMeCache,
  loadBusinessMeCached,
} from "@/shared/components/business/settings/business/businessMeCache";
import {
  hasLabPayoutBankbook,
  isLabPayoutReady,
  type LabPayoutAccountSnapshot,
} from "@/shared/settlement/labPayoutBankbook";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";

type Props = {
  /** 저장 후 부모 갱신 */
  onSaved?: (account: LabPayoutAccountSnapshot) => void;
};

export function LabPayoutAccountCard({ onSaved }: Props) {
  const { token, user } = useAuthStore();
  const { toast } = useToast();
  const { uploadFilesWithToast } = useUploadWithProgressToast({ token });
  const businessType = resolveBusinessType(user?.role, "requestor");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [holderName, setHolderName] = useState("");
  const [bankbook, setBankbook] = useState<
    LabPayoutAccountSnapshot["bankbook"]
  >(null);

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
      const pa = (data?.payoutAccount || {}) as LabPayoutAccountSnapshot;
      setBankName(String(pa.bankName || ""));
      setAccountNumber(String(pa.accountNumber || ""));
      setHolderName(String(pa.holderName || ""));
      setBankbook(pa.bankbook || null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [token, businessType]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleBankbookUpload = async (file: File) => {
    if (!token) return;
    const allowed = new Set(["image/jpeg", "image/png", "application/pdf"]);
    if (!allowed.has(file.type)) {
      toast({
        title: "파일 형식 오류",
        description: "JPG·PNG·PDF만 업로드할 수 있어요.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "파일이 너무 큽니다",
        description: "통장 사본은 최대 10MB까지 가능합니다.",
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadFilesWithToast([file]);
      const first = uploaded?.[0];
      if (!first?._id) {
        throw new Error("upload_failed");
      }
      setBankbook({
        s3Key: String(first.key || ""),
        fileId: String(first._id || ""),
        originalName: String(first.originalName || file.name),
        uploadedAt: new Date().toISOString(),
      });
      toast({
        title: "통장 사본 업로드 완료",
        description: "아래 저장을 눌러 등록을 완료하세요.",
      });
    } catch {
      toast({
        title: "업로드 실패",
        description: "통장 사본 업로드에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!token) return;
    const next: LabPayoutAccountSnapshot = {
      bankName: bankName.trim(),
      accountNumber: accountNumber.replace(/\s/g, "").trim(),
      holderName: holderName.trim(),
      bankbook: hasLabPayoutBankbook({ bankbook })
        ? bankbook
        : {
            s3Key: "",
            fileId: "",
            originalName: "",
            uploadedAt: null,
          },
    };
    if (
      !next.bankName ||
      !next.accountNumber ||
      !next.holderName
    ) {
      toast({
        title: "계좌 정보 필요",
        description: "은행·계좌번호·예금주를 모두 입력해주세요.",
        variant: "destructive",
      });
      return;
    }
    if (!hasLabPayoutBankbook(next)) {
      toast({
        title: "통장 사본 필요",
        description: "사업자 통장 사본을 업로드해주세요.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await request({
        path: "/api/businesses/me",
        method: "PATCH",
        token,
        jsonBody: { payoutAccount: next },
      });
      if (!res.ok) {
        throw new Error(
          (res.data as { message?: string } | undefined)?.message ||
            "저장 실패",
        );
      }
      invalidateBusinessMeCache({ token, businessType });
      onSaved?.(next);
      toast({
        title: "입금 계좌 저장 완료",
        description: isLabPayoutReady(next)
          ? "월 정산 지급에 이 계좌를 사용합니다."
          : undefined,
      });
      await load();
    } catch (err: unknown) {
      toast({
        title: "저장 실패",
        description: err instanceof Error ? err.message : "저장에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 text-sm text-muted-foreground sm:p-5">
        입금 계좌 정보를 불러오는 중…
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5">
      <div className="mb-3 flex items-start gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200/80">
          <Landmark className="h-4 w-4 text-primary-strong" />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">
            정산 입금 계좌 · 통장 사본
          </p>
          <p className="text-xs text-muted-foreground">
            기공크레딧 월 지급에 사용합니다. 사업자 명의 통장 사본이 필요합니다.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="lab-payout-bank">은행</Label>
          <Input
            id="lab-payout-bank"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="예: 국민은행"
            className="h-9 rounded-xl"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lab-payout-account">계좌번호</Label>
          <Input
            id="lab-payout-account"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="숫자만 입력"
            className="h-9 rounded-xl"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lab-payout-holder">예금주</Label>
          <Input
            id="lab-payout-holder"
            value={holderName}
            onChange={(e) => setHolderName(e.target.value)}
            placeholder="사업자 명의"
            className="h-9 rounded-xl"
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <Label>통장 사본</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={hasLabPayoutBankbook({ bankbook }) ? "outline" : "default"}
            size="sm"
            disabled={uploading || saving}
            className="relative"
            onClick={() => {
              const input = document.getElementById(
                "lab-payout-bankbook-input",
              ) as HTMLInputElement | null;
              input?.click();
            }}
          >
            <Upload className="mr-1.5 h-4 w-4" />
            {uploading
              ? "업로드 중…"
              : hasLabPayoutBankbook({ bankbook })
                ? "통장 사본 변경"
                : "통장 사본 업로드"}
          </Button>
          <input
            id="lab-payout-bankbook-input"
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void handleBankbookUpload(file);
            }}
          />
          {hasLabPayoutBankbook({ bankbook }) ? (
            <span className="inline-flex items-center gap-1 text-xs text-slate-600">
              {bankbook?.originalName || "등록됨"}
              <button
                type="button"
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="통장 사본 제거"
                onClick={() => setBankbook(null)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ) : (
            <span className="text-xs text-accent-strong">
              미등록 — 정산 지급에 필요합니다
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={saving || uploading}
          onClick={() => void save()}
        >
          {saving ? "저장 중…" : "저장"}
        </Button>
      </div>
    </div>
  );
}
