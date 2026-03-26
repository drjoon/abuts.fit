import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, ShieldCheck } from "lucide-react";
import { BusinessData, LicenseExtracted, LicenseStatus } from "./types";

interface BusinessMemberViewProps {
  currentBusinessName: string;
  licenseStatus: LicenseStatus;
  isVerified: boolean;
  extracted: LicenseExtracted;
  businessData: BusinessData;
  isPending?: boolean;
}

export const BusinessMemberView = ({
  currentBusinessName,
  licenseStatus,
  isVerified,
  extracted,
  businessData,
  isPending = false,
}: BusinessMemberViewProps) => {
  if (isPending) {
    return (
      <div className="space-y-4">
        <div className="app-surface app-surface--panel space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
            <Clock className="h-4 w-4 shrink-0" />
            승인 대기 중
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {currentBusinessName || "사업자"}
            </span>
            의 대표자 승인을 기다리고 있습니다.
          </p>
          <p className="text-xs text-muted-foreground">
            승인이 완료되면 플랫폼을 정상적으로 이용하실 수 있습니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="app-surface app-surface--panel text-xs text-muted-foreground">
        사업자 정보는 대표자만 수정할 수 있어요. 여기서는 확인만 가능합니다.
      </div>

      <div className="app-surface app-surface--panel space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium">사업자 식별 정보</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <ShieldCheck className="h-4 w-4" />
            {licenseStatus === "ready"
              ? isVerified
                ? "검증 완료"
                : "검증 대기"
              : "등록 필요"}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>대표자명</Label>
            <Input value={extracted.representativeName || ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label>사업자명</Label>
            <Input value={businessData.companyName || ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label>전화번호</Label>
            <Input value={businessData.phone || ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label>사업자등록번호</Label>
            <Input value={businessData.businessNumber || ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label>업태</Label>
            <Input value={extracted.businessType || ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label>종목</Label>
            <Input value={extracted.businessItem || ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label>세금계산서 이메일</Label>
            <Input value={extracted.email || ""} readOnly />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2 md:col-span-1">
            <Label>주소1</Label>
            <Input value={businessData.address || ""} readOnly />
          </div>
          <div className="space-y-2 md:col-span-1">
            <Label>주소2</Label>
            <Input value={businessData.addressDetail || ""} readOnly />
          </div>
          <div className="space-y-2 md:col-span-1">
            <Label>우편번호</Label>
            <Input value={businessData.zipCode || ""} readOnly />
          </div>
        </div>
      </div>
    </div>
  );
};
