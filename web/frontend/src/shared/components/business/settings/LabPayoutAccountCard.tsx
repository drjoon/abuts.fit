// related files:
// - web/frontend/src/shared/settlement/labPayoutBankbook.ts
// - web/frontend/src/shared/components/business/settings/BusinessTab.tsx
// - web/backend/controllers/ai/ai.controller.js
// change-log:
// - 2026-09-16: 기공소 정산 입금 계좌·통장 사본 등록(설정>사업자). focus=payout 시 카드로 스크롤.
// - 2026-09-16: 통장 사본 업로드 시 Gemini OCR 자동입력 + 팝빌 예금주조회.
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Landmark,
  Upload,
  X,
  Loader2,
  ShieldCheck,
  ShieldX,
  ShieldQuestion,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { useUploadWithProgressToast } from "@/shared/hooks/useUploadWithProgressToast";
import {
  invalidateBusinessMeCache,
  loadBusinessMeCached,
} from "@/shared/components/business/settings/business/businessMeCache";
import {
  LAB_PAYOUT_ACCOUNT_CARD_ID,
  hasLabPayoutBankbook,
  isLabPayoutReady,
  type LabPayoutAccountSnapshot,
} from "@/shared/settlement/labPayoutBankbook";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";

type AccountCheck = {
  verified: boolean;
  skipped?: boolean;
  method?: string | null;
  message?: string;
  accountName?: string;
  bankCode?: string;
  bankName?: string;
};

type Props = {
  /** 저장 후 부모 갱신 */
  onSaved?: (account: LabPayoutAccountSnapshot) => void;
};

type UploadStatus = "idle" | "uploading" | "ocr" | "validating";

const isImageFile = (file: File) =>
  ["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
  /\.(jpe?g|png|webp)$/i.test(file.name);

export function LabPayoutAccountCard({ onSaved }: Props) {
  const { token, user } = useAuthStore();
  const { toast } = useToast();
  const { uploadFilesWithToast } = useUploadWithProgressToast({ token });
  const businessType = resolveBusinessType(user?.role, "requestor");
  const [searchParams, setSearchParams] = useSearchParams();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const shouldFocusPayout = searchParams.get("focus") === "payout";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [verifying, setVerifying] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [holderName, setHolderName] = useState("");
  const [bankbook, setBankbook] = useState<
    LabPayoutAccountSnapshot["bankbook"]
  >(null);
  const [accountCheck, setAccountCheck] = useState<AccountCheck | null>(null);

  const busy = uploadStatus !== "idle" || saving || verifying;

  const clearAccountCheck = () => setAccountCheck(null);

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
      setAccountCheck(null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [token, businessType]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading || !shouldFocusPayout) return;
    const timer = window.setTimeout(() => {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      const next = new URLSearchParams(searchParams);
      if (next.has("focus")) {
        next.delete("focus");
        setSearchParams(next, { replace: true });
      }
    }, 80);
    return () => window.clearTimeout(timer);
  }, [loading, shouldFocusPayout, searchParams, setSearchParams]);

  const applyAccountCheck = (check: AccountCheck | null | undefined) => {
    if (!check) {
      setAccountCheck(null);
      return;
    }
    setAccountCheck(check);
    if (check.bankName) setBankName(check.bankName);
    // 팝빌 확인 성공 시 은행 등록 예금주를 우선 반영.
    if (check.verified && check.accountName) {
      setHolderName(check.accountName);
    } else if (check.accountName) {
      setHolderName((prev) => prev.trim() || check.accountName || "");
    }
  };

  const verifyAccount = async (fields?: {
    bankName: string;
    accountNumber: string;
    holderName: string;
  }) => {
    if (!token) return null;
    const payload = {
      bankName: (fields?.bankName ?? bankName).trim(),
      accountNumber: (fields?.accountNumber ?? accountNumber)
        .replace(/\s/g, "")
        .trim(),
      holderName: (fields?.holderName ?? holderName).trim(),
    };
    if (!payload.bankName || !payload.accountNumber || !payload.holderName) {
      toast({
        title: "계좌 정보 필요",
        description: "은행·계좌번호·예금주를 모두 입력한 뒤 확인해주세요.",
        variant: "destructive",
      });
      return null;
    }
    setVerifying(true);
    try {
      const res = await request<{
        data?: {
          accountCheck?: AccountCheck;
          suggested?: { bankName?: string; holderName?: string };
        };
      }>({
        path: "/api/businesses/me/verify-payout-account",
        method: "POST",
        token,
        jsonBody: payload,
      });
      if (!res.ok) {
        throw new Error(
          (res.data as { message?: string } | undefined)?.message ||
            "계좌 확인 실패",
        );
      }
      const check = res.data?.data?.accountCheck || null;
      const suggested = res.data?.data?.suggested;
      if (suggested?.bankName) setBankName(suggested.bankName);
      if (check?.verified && check.accountName) {
        setHolderName(check.accountName);
      } else if (suggested?.holderName) {
        setHolderName(suggested.holderName);
      }
      setAccountCheck(check);
      if (check?.verified) {
        toast({
          title: "계좌 확인 완료",
          description: check.message || "예금주가 확인되었습니다.",
        });
      } else if (check && !check.skipped) {
        toast({
          title: "계좌 확인 실패",
          description: check.message || "계좌 정보를 다시 확인해주세요.",
          variant: "destructive",
        });
      } else if (check?.skipped) {
        toast({
          title: "계좌 확인 생략",
          description: check.message,
        });
      }
      return check;
    } catch (err: unknown) {
      toast({
        title: "계좌 확인 실패",
        description:
          err instanceof Error ? err.message : "계좌 확인에 실패했습니다.",
        variant: "destructive",
      });
      return null;
    } finally {
      setVerifying(false);
    }
  };

  const handleBankbookUpload = async (file: File) => {
    if (!token) return;
    const allowed = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]);
    if (!allowed.has(file.type) && !/\.(jpe?g|png|webp|pdf)$/i.test(file.name)) {
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
    setUploadStatus("uploading");
    clearAccountCheck();
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

      if (!isImageFile(file)) {
        setUploadStatus("idle");
        toast({
          title: "통장 사본 업로드 완료",
          description:
            "PDF는 자동 인식되지 않습니다. 계좌 정보를 입력한 뒤 「계좌 확인」을 눌러주세요.",
        });
        return;
      }

      setUploadStatus("ocr");
      const ocrRes = await request<{
        data?: {
          metadata?: {
            bankName?: string;
            accountNumber?: string;
            holderName?: string;
            bankCode?: string;
          };
          accountCheck?: AccountCheck | null;
        };
        message?: string;
      }>({
        path: "/api/ai/parse-bankbook",
        method: "POST",
        token,
        jsonBody: {
          fileId: first._id,
          s3Key: first.key,
          originalName: first.originalName || file.name,
        },
      });

      if (!ocrRes.ok) {
        setUploadStatus("idle");
        toast({
          title: "OCR 인식 실패",
          description:
            String(ocrRes.data?.message || "").trim() ||
            "이미지를 다시 업로드하거나 수동으로 입력해주세요.",
          variant: "destructive",
        });
        return;
      }

      const meta = ocrRes.data?.data?.metadata || {};
      const nextBank = String(meta.bankName || "").trim();
      const nextAcct = String(meta.accountNumber || "").replace(/\D/g, "");
      const nextHolder = String(meta.holderName || "").trim();
      if (nextBank) setBankName(nextBank);
      if (nextAcct) setAccountNumber(nextAcct);
      if (nextHolder) setHolderName(nextHolder);

      const check = ocrRes.data?.data?.accountCheck;
      if (check) {
        setUploadStatus("validating");
        applyAccountCheck(check);
        if (check.accountName && !nextHolder) {
          setHolderName(check.accountName);
        }
      }

      setUploadStatus("idle");
      if (check?.verified) {
        toast({
          title: "통장 사본 인식·계좌 확인 완료",
          description: check.message || "입력값을 확인한 뒤 저장하세요.",
        });
      } else if (nextBank || nextAcct || nextHolder) {
        toast({
          title: "통장 사본 인식 완료",
          description: check?.message
            ? `자동 입력됨 · ${check.message}`
            : "자동 입력된 내용을 확인한 뒤 「계좌 확인」·저장을 진행하세요.",
        });
      } else {
        toast({
          title: "인식 결과 없음",
          description: "수동으로 입력한 뒤 「계좌 확인」을 눌러주세요.",
          variant: "destructive",
        });
      }
    } catch {
      setUploadStatus("idle");
      toast({
        title: "업로드 실패",
        description: "통장 사본 업로드에 실패했습니다.",
        variant: "destructive",
      });
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
    if (!next.bankName || !next.accountNumber || !next.holderName) {
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

    // 저장 전 미확인이면 한 번 확인 (이미 확인됐으면 스킵).
    let check = accountCheck;
    if (!check?.verified && !check?.skipped) {
      check = await verifyAccount({
        bankName: next.bankName,
        accountNumber: next.accountNumber,
        holderName: next.holderName,
      });
      if (!check?.verified && !check?.skipped) {
        return;
      }
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
      <div
        id={LAB_PAYOUT_ACCOUNT_CARD_ID}
        ref={cardRef}
        className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 text-sm text-muted-foreground sm:p-5"
      >
        입금 계좌 정보를 불러오는 중…
      </div>
    );
  }

  const statusLabel =
    uploadStatus === "uploading"
      ? "업로드 중…"
      : uploadStatus === "ocr"
        ? "AI 인식 중…"
        : uploadStatus === "validating"
          ? "계좌 확인 중…"
          : hasLabPayoutBankbook({ bankbook })
            ? "통장 사본 변경"
            : "통장 사본 업로드";

  return (
    <div
      id={LAB_PAYOUT_ACCOUNT_CARD_ID}
      ref={cardRef}
      className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5"
    >
      <div className="mb-3 flex items-start gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200/80">
          <Landmark className="h-4 w-4 text-primary-strong" />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">
            정산 입금 계좌 · 통장 사본
          </p>
          <p className="text-xs text-muted-foreground">
            통장 사본을 올리면 AI가 계좌를 채우고, 팝빌로 예금주를 확인합니다.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="lab-payout-bank">은행</Label>
          <Input
            id="lab-payout-bank"
            value={bankName}
            onChange={(e) => {
              setBankName(e.target.value);
              clearAccountCheck();
            }}
            placeholder="예: 국민은행"
            className="h-9 rounded-xl"
            disabled={busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lab-payout-account">계좌번호</Label>
          <Input
            id="lab-payout-account"
            value={accountNumber}
            onChange={(e) => {
              setAccountNumber(e.target.value);
              clearAccountCheck();
            }}
            placeholder="숫자만 입력"
            className="h-9 rounded-xl"
            disabled={busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lab-payout-holder">예금주</Label>
          <Input
            id="lab-payout-holder"
            value={holderName}
            onChange={(e) => {
              setHolderName(e.target.value);
              clearAccountCheck();
            }}
            placeholder="사업자 명의"
            className="h-9 rounded-xl"
            disabled={busy}
          />
        </div>
      </div>

      {accountCheck ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge
            variant={
              accountCheck.verified
                ? "outline"
                : accountCheck.skipped
                  ? "secondary"
                  : "destructive"
            }
            className="flex items-center gap-1 text-xs"
          >
            {accountCheck.verified ? (
              <ShieldCheck className="h-3 w-3" />
            ) : accountCheck.skipped ? (
              <ShieldQuestion className="h-3 w-3" />
            ) : (
              <ShieldX className="h-3 w-3" />
            )}
            {accountCheck.verified
              ? "계좌 확인됨"
              : accountCheck.skipped
                ? "확인 생략"
                : "계좌 확인 실패"}
          </Badge>
          {accountCheck.message ? (
            <p
              className={`text-xs ${
                accountCheck.verified
                  ? "text-primary-strong"
                  : accountCheck.skipped
                    ? "text-muted-foreground"
                    : "text-destructive"
              }`}
            >
              {accountCheck.message}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        <Label>통장 사본</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={hasLabPayoutBankbook({ bankbook }) ? "outline" : "default"}
            size="sm"
            disabled={busy}
            className="relative"
            onClick={() => {
              const input = document.getElementById(
                "lab-payout-bankbook-input",
              ) as HTMLInputElement | null;
              input?.click();
            }}
          >
            {uploadStatus !== "idle" ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-1.5 h-4 w-4" />
            )}
            {statusLabel}
          </Button>
          <input
            id="lab-payout-bankbook-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
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
                disabled={busy}
                onClick={() => {
                  setBankbook(null);
                  clearAccountCheck();
                }}
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
        <p className="text-xs text-slate-400">
          JPG·PNG 권장(자동 인식) · PDF는 수동 입력 · 최대 10MB
        </p>
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void verifyAccount()}
        >
          {verifying ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              확인 중…
            </>
          ) : (
            "계좌 확인"
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => void save()}
        >
          {saving ? "저장 중…" : "저장"}
        </Button>
      </div>
    </div>
  );
}
