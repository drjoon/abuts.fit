// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { forwardRef, useImperativeHandle, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, ShieldCheck, RotateCcw, FileBadge } from "lucide-react";
import type { LicenseStatus, MembershipStatus } from "./types";

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
      licenseFileName,
      licenseDeleteLoading,
      onFileUpload,
      onDeleteLicense,
    },
    ref,
  ) => {
    const licenseInputRef = useRef<HTMLInputElement | null>(null);
    const uploadButtonRef = useRef<HTMLButtonElement | null>(null);
    const canEdit = membership === "owner" || membership === "none";

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200/80">
            <FileBadge className="h-4 w-4 text-primary-strong" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">사업자등록증</p>
            {licenseFileName &&
            licenseStatus !== "uploading" &&
            licenseStatus !== "processing" ? (
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-600">
                {licenseStatus === "ready" ? (
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary-strong" />
                ) : null}
                <span className="truncate">{licenseFileName}</span>
                <button
                  type="button"
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-50"
                  onClick={onDeleteLicense}
                  disabled={licenseDeleteLoading || !canEdit}
                  aria-label="사업자등록증 삭제"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-slate-400">
                JPG, PNG · 최대 10MB
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {licenseStatus === "ready" ? (
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
          ) : null}
          <Button
            ref={uploadButtonRef}
            type="button"
            variant={licenseStatus === "missing" ? "default" : "outline"}
            size="sm"
            className="px-5"
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
        </div>
      </div>
    );
  },
);

BusinessLicenseUpload.displayName = "BusinessLicenseUpload";
