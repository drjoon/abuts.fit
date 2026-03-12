import { forwardRef, useImperativeHandle, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, ShieldCheck } from "lucide-react";
import { GuideFocus } from "@/shared/ui/GuideFocus";
import type { LicenseStatus, MembershipStatus } from "./types";
import { useToast } from "@/shared/hooks/use-toast";

interface BusinessLicenseUploadProps {
  membership: MembershipStatus;
  licenseStatus: LicenseStatus;
  isVerified: boolean;
  validationSucceeded?: boolean; // 사업자등록번호 검증 완료 여부
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
      validationSucceeded,
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
    // 항상 업로드 가능 (검증 후에도 재업로드 가능)
    const canUploadNew = canEdit;

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
      <div className="space-y-3">
        <GuideFocus
          stepId="requestor.business.licenseUpload"
          className="rounded-lg"
        >
          <div className="space-y-3">
            <div className="text-center">
              <Button
                ref={uploadButtonRef}
                type="button"
                variant={licenseStatus === "missing" ? "default" : "outline"}
                size="sm"
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
                disabled={!canEdit}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFileUpload(f);
                  e.target.value = "";
                }}
              />
              <p className="mt-2 text-xs text-slate-400">
                JPG, PNG 파일만 가능 (최대 10MB)
              </p>
            </div>
            {licenseFileName && (
              <div className="flex w-fit max-w-xs items-center justify-between gap-2 rounded-md border bg-slate-50 px-3 py-2 mx-auto">
                <div className="flex items-center gap-2">
                  {licenseStatus === "ready" && (
                    <ShieldCheck className="h-4 w-4 text-green-600" />
                  )}
                  <p className="text-xs text-slate-700">{licenseFileName}</p>
                </div>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 disabled:opacity-50"
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
        </GuideFocus>
      </div>
    );
  },
);

BusinessLicenseUpload.displayName = "BusinessLicenseUpload";
