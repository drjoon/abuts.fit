import { forwardRef, useImperativeHandle, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { GuideFocus } from "@/features/guidetour/GuideFocus";
import { LicenseStatus, MembershipStatus } from "./types";
import { useToast } from "@/hooks/use-toast";

interface BusinessLicenseUploadProps {
  membership: MembershipStatus;
  licenseStatus: LicenseStatus;
  isVerified: boolean;
  licenseFileName: string;
  licenseDeleteLoading: boolean;
  onFileUpload: (file: File) => void;
  onDeleteLicense: () => void;
}

export type BusinessLicenseUploadHandle = {
  focusUpload: () => void;
};

export const BusinessLicenseUpload = forwardRef<
  BusinessLicenseUploadHandle,
  BusinessLicenseUploadProps
>(
  (
    {
      membership,
      licenseStatus,
      isVerified,
      licenseFileName,
      licenseDeleteLoading,
      onFileUpload,
      onDeleteLicense,
    },
    ref,
  ) => {
    const { toast } = useToast();
    const licenseInputRef = useRef<HTMLInputElement | null>(null);
    const uploadButtonRef = useRef<HTMLButtonElement | null>(null);
    const canEdit = membership === "owner" || membership === "none";
    const hasExistingLicense = Boolean(licenseFileName);
    const canUploadNew = canEdit && !hasExistingLicense;

    useImperativeHandle(
      ref,
      () => ({
        focusUpload: () => {
          uploadButtonRef.current?.focus();
        },
      }),
      [],
    );

    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {licenseStatus === "ready" && (
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="h-4 w-4" />
                  {isVerified ? "검증 완료" : "검증 대기"}
                </span>
              )}
            </div>
          </div>
          <GuideFocus
            stepId="requestor.business.licenseUpload"
            className="rounded-xl p-1"
          >
            <div
              className={cn(
                "app-surface app-surface--panel border-2 border-dashed rounded-lg p-4",
                licenseStatus === "missing"
                  ? "border-orange-300 bg-orange-50/80"
                  : "border-border bg-white/60",
              )}
            >
              <div className="text-center">
                <Button
                  ref={uploadButtonRef}
                  type="button"
                  variant={licenseStatus === "missing" ? "default" : "outline"}
                  disabled={
                    licenseStatus === "uploading" ||
                    licenseStatus === "processing" ||
                    !canEdit
                  }
                  onClick={() => {
                    if (
                      licenseStatus === "uploading" ||
                      licenseStatus === "processing" ||
                      !canEdit
                    ) {
                      return;
                    }
                    if (!canUploadNew) {
                      toast({
                        title: "이미 업로드되어 있습니다",
                        description:
                          "사업자등록증을 재업로드하려면 먼저 삭제하거나 [초기화]를 진행해주세요.",
                        duration: 3000,
                      });
                      return;
                    }
                    licenseInputRef.current?.click();
                  }}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {licenseStatus === "uploading"
                    ? "업로드 중..."
                    : licenseStatus === "processing"
                      ? "분석 중..."
                      : "사업자등록증 업로드"}
                </Button>
                <input
                  ref={licenseInputRef}
                  type="file"
                  className="hidden"
                  accept=".jpg,.jpeg,.png"
                  disabled={!canEdit || !canUploadNew}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFileUpload(f);
                    e.target.value = "";
                  }}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  JPG, PNG 파일만 가능 (최대 10MB)
                </p>
                {licenseFileName && (
                  <div className="mt-2 flex items-center justify-center gap-2">
                    <p className="text-xs text-foreground/80">
                      업로드됨: {licenseFileName}
                    </p>
                    <button
                      type="button"
                      className="app-surface inline-flex h-6 w-6 items-center justify-center rounded-md border bg-white/60 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                      onClick={onDeleteLicense}
                      disabled={
                        licenseDeleteLoading ||
                        licenseStatus === "uploading" ||
                        licenseStatus === "processing" ||
                        !canEdit
                      }
                      aria-label="사업자등록증 삭제"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </GuideFocus>
        </div>
      </div>
    );
  },
);

BusinessLicenseUpload.displayName = "BusinessLicenseUpload";
