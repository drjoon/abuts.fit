// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Clock, Info, MapPin, ShieldCheck } from "lucide-react";
import { cn } from "@/shared/ui/cn";
import { BusinessData, BusinessMetadata, LicenseStatus } from "./types";

interface BusinessMemberViewProps {
  currentBusinessName: string;
  licenseStatus: LicenseStatus;
  isVerified: boolean;
  metadata: BusinessMetadata;
  businessData: BusinessData;
  isPending?: boolean;
}

export const BusinessMemberView = ({
  currentBusinessName,
  licenseStatus,
  isVerified,
  metadata,
  businessData,
  isPending = false,
}: BusinessMemberViewProps) => {
  const statusLabel =
    licenseStatus === "ready"
      ? isVerified
        ? "검증 완료"
        : "검증 대기"
      : "등록 필요";

  if (isPending) {
    return (
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-amber-200/80">
            <Clock className="h-[18px] w-[18px] text-amber-700" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <p className="text-sm font-semibold text-amber-900">승인 대기 중</p>
            <p className="text-[13px] leading-relaxed text-slate-700">
              <span className="font-medium">{currentBusinessName || "사업자"}</span>
              의 대표자 승인을 기다리고 있습니다.
            </p>
            <p className="text-xs text-muted-foreground">
              승인 후 플랫폼을 정상적으로 이용할 수 있습니다.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/60 px-4 py-3.5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          사업자 정보는 대표자만 수정할 수 있습니다. 여기서는 확인만 가능합니다.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200/80">
              <Building2 className="h-4 w-4 text-primary-strong" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">사업자 정보</p>
              <p className="text-xs text-muted-foreground">등록된 사업자 식별 정보</p>
            </div>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
              isVerified
                ? "bg-primary-soft text-primary-strong ring-primary-muted"
                : "bg-slate-100 text-slate-600 ring-slate-200",
            )}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {statusLabel}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "대표자명", value: metadata.representativeName },
            { label: "사업자명", value: businessData.companyName },
            { label: "전화번호", value: businessData.phone },
            { label: "사업자등록번호", value: businessData.businessNumber },
            { label: "업태", value: metadata.businessType },
            { label: "종목", value: metadata.businessItem },
            { label: "세금계산서 이메일", value: metadata.email, className: "sm:col-span-2" },
          ].map(({ label, value, className }) => (
            <div key={label} className={cn("space-y-1.5", className)}>
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <Input
                value={value || ""}
                readOnly
                className="h-10 rounded-xl bg-white/80"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200/80">
            <MapPin className="h-4 w-4 text-primary-strong" />
          </span>
          <p className="text-sm font-semibold text-slate-900">사업장 주소</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            { label: "주소", value: businessData.address },
            { label: "상세 주소", value: businessData.addressDetail },
            { label: "우편번호", value: businessData.zipCode },
          ].map(({ label, value }) => (
            <div key={label} className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <Input
                value={value || ""}
                readOnly
                className="h-10 rounded-xl bg-white/80"
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
