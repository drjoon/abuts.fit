// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { forwardRef, useImperativeHandle, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, ShieldCheck, RotateCcw, Info } from "lucide-react";
import type { LicenseStatus, MembershipStatus } from "./types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface BusinessLicenseUploadProps {
  membership: MembershipStatus;
  licenseStatus: LicenseStatus;
  isVerified: boolean;
  validationSucceeded?: boolean; // 사업자등록번호 검증 완료 여부
  licenseFileName: string;
  licenseDeleteLoading: boolean;
  onFileUpload: (file: File) => void;
  onDeleteLicense: () => void;
  /** 온보딩 등에서 업로드를 건너뛸 수 있을 때 안내/툴팁 표시 */
  isOptional?: boolean;
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
      licenseFileName,
      licenseDeleteLoading,
      onFileUpload,
      onDeleteLicense,
      isOptional = false,
    },
    ref,
  ) => {
    const licenseInputRef = useRef<HTMLInputElement | null>(null);
    const uploadButtonRef = useRef<HTMLButtonElement | null>(null);
    const canEdit = membership === "owner" || membership === "none";
    const showOptionalHint =
      isOptional &&
      licenseStatus !== "ready" &&
      licenseStatus !== "uploading" &&
      licenseStatus !== "processing";

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
        <div className="flex items-center justify-end">
          {licenseStatus === "ready" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onDeleteLicense}
              disabled={licenseDeleteLoading}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              초기화
            </Button>
          )}
        </div>
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
            {showOptionalHint && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
                    >
                      <Info className="h-3.5 w-3.5 shrink-0" />
                      업로드하지 않아도 다음으로 진행할 수 있습니다
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    className="max-w-xs text-left leading-relaxed"
                  >
                    사업자등록증을 등록하지 않으면 유료 서비스 이용이 제한되며,
                    무료 서비스만 사용할 수 있습니다.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          {licenseFileName &&
            licenseStatus !== "uploading" &&
            licenseStatus !== "processing" && (
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
                  disabled={licenseDeleteLoading || !canEdit}
                  aria-label="사업자등록증 삭제"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
        </div>
      </div>
    );
  },
);

BusinessLicenseUpload.displayName = "BusinessLicenseUpload";
