import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { LicenseStatus, MembershipStatus } from "./types";

interface BusinessLicenseUploadProps {
  membership: MembershipStatus;
  licenseStatus: LicenseStatus;
  isVerified: boolean;
  licenseFileName: string;
  licenseDeleteLoading: boolean;
  onFileUpload: (file: File) => void;
  onDeleteLicense: () => void;
}

export const BusinessLicenseUpload = ({
  membership,
  licenseStatus,
  isVerified,
  licenseFileName,
  licenseDeleteLoading,
  onFileUpload,
  onDeleteLicense,
}: BusinessLicenseUploadProps) => {
  const licenseInputRef = useRef<HTMLInputElement | null>(null);
  const canEdit = membership === "owner" || membership === "none";

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
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-4",
            licenseStatus === "missing"
              ? "border-orange-300 bg-orange-50/80"
              : "border-border bg-white/60"
          )}
        >
          <div className="text-center">
            <Button
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
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border bg-white/60 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
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
      </div>
    </div>
  );
};
