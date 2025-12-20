import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BusinessData,
  LicenseExtracted,
  LicenseStatus,
  MembershipStatus,
} from "./types";
import {
  formatBusinessNumberInput,
  formatPhoneNumberInput,
  isValidBusinessNumber,
  isValidPhoneNumber,
  isValidEmail,
} from "./validations";

interface BusinessFormProps {
  businessData: BusinessData;
  extracted: LicenseExtracted;
  errors: Record<string, boolean>;
  licenseStatus: LicenseStatus;
  membership: MembershipStatus;
  licenseDeleteLoading: boolean;
  setBusinessData: React.Dispatch<React.SetStateAction<BusinessData>>;
  setExtracted: React.Dispatch<React.SetStateAction<LicenseExtracted>>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setCompanyNameTouched: (touched: boolean) => void;
  onSave: () => void;
  onReset: () => void;
}

export const BusinessForm = ({
  businessData,
  extracted,
  errors,
  licenseStatus,
  membership,
  licenseDeleteLoading,
  setBusinessData,
  setExtracted,
  setErrors,
  setCompanyNameTouched,
  onSave,
  onReset,
}: BusinessFormProps) => {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="repName">대표자명</Label>
            <Input
              id="repName"
              className={cn(
                errors.representativeName &&
                  "border-destructive focus-visible:ring-destructive"
              )}
              value={extracted.representativeName || ""}
              onChange={(e) => {
                setExtracted((prev) => ({
                  ...prev,
                  representativeName: e.target.value,
                }));
                setErrors((prev) => ({
                  ...prev,
                  representativeName: false,
                }));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="orgName">기공소명</Label>
            <Input
              id="orgName"
              className={cn(
                errors.companyName &&
                  "border-destructive focus-visible:ring-destructive"
              )}
              value={businessData.companyName}
              onChange={(e) => {
                setBusinessData((prev) => ({
                  ...prev,
                  companyName: e.target.value,
                }));
                setCompanyNameTouched(true);
                setErrors((prev) => ({ ...prev, companyName: false }));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="orgPhone">전화번호</Label>
            <Input
              id="orgPhone"
              className={cn(
                errors.phone &&
                  "border-destructive focus-visible:ring-destructive"
              )}
              value={businessData.phone}
              onChange={(e) => {
                const nextValue = formatPhoneNumberInput(e.target.value);
                setBusinessData((prev) => ({
                  ...prev,
                  phone: nextValue,
                }));
                setErrors((prev) => ({
                  ...prev,
                  phone: nextValue
                    ? !isValidPhoneNumber(nextValue)
                    : prev.phone,
                }));
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bizNo">사업자등록번호</Label>
            <Input
              id="bizNo"
              className={cn(
                errors.businessNumber &&
                  "border-destructive focus-visible:ring-destructive"
              )}
              value={businessData.businessNumber}
              onChange={(e) => {
                const nextValue = formatBusinessNumberInput(e.target.value);
                setBusinessData((prev) => ({
                  ...prev,
                  businessNumber: nextValue,
                }));
                setErrors((prev) => ({
                  ...prev,
                  businessNumber: nextValue
                    ? !isValidBusinessNumber(nextValue)
                    : prev.businessNumber,
                }));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bizType">업태</Label>
            <Input
              id="bizType"
              className={cn(
                errors.businessType &&
                  "border-destructive focus-visible:ring-destructive"
              )}
              value={extracted.businessType || ""}
              onChange={(e) => {
                setExtracted((prev) => ({
                  ...prev,
                  businessType: e.target.value,
                }));
                setErrors((prev) => ({
                  ...prev,
                  businessType: false,
                }));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bizItem">종목</Label>
            <Input
              id="bizItem"
              className={cn(
                errors.businessItem &&
                  "border-destructive focus-visible:ring-destructive"
              )}
              value={extracted.businessItem || ""}
              onChange={(e) => {
                setExtracted((prev) => ({
                  ...prev,
                  businessItem: e.target.value,
                }));
                setErrors((prev) => ({
                  ...prev,
                  businessItem: false,
                }));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="taxEmail">세금계산서 이메일</Label>
            <Input
              id="taxEmail"
              type="email"
              className={cn(
                errors.email &&
                  "border-destructive focus-visible:ring-destructive"
              )}
              value={extracted.email || ""}
              onChange={(e) => {
                const nextValue = e.target.value;
                setExtracted((prev) => ({
                  ...prev,
                  email: nextValue,
                }));
                setErrors((prev) => ({
                  ...prev,
                  email: nextValue ? !isValidEmail(nextValue) : false,
                }));
              }}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">주소</Label>
        <Input
          id="address"
          className={cn(
            errors.address &&
              "border-destructive focus-visible:ring-destructive"
          )}
          value={businessData.address}
          onChange={(e) => {
            setBusinessData((prev) => ({
              ...prev,
              address: e.target.value,
            }));
            setErrors((prev) => ({ ...prev, address: false }));
          }}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onReset}
          disabled={
            licenseDeleteLoading ||
            licenseStatus === "uploading" ||
            licenseStatus === "processing" ||
            membership !== "owner"
          }
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          초기화
        </Button>
        <Button type="button" onClick={onSave}>
          <Save className="mr-2 h-4 w-4" />
          저장하기
        </Button>
      </div>
    </div>
  );
};
