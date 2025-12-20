import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { GuideFocus } from "@/features/guidetour/GuideFocus";
import { useGuideTour } from "@/features/guidetour/GuideTourProvider";
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
  renderActions?: (props: { disabled: boolean }) => React.ReactNode;
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
  renderActions,
}: BusinessFormProps) => {
  const { isStepActive, completeStep } = useGuideTour();
  const bizNoRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isStepActive("requestor.business.companyName")) return;
    if (String(businessData.companyName || "").trim()) {
      completeStep("requestor.business.companyName");
    }
  }, [businessData.companyName, completeStep, isStepActive]);

  useEffect(() => {
    if (!isStepActive("requestor.business.businessNumber")) return;
    if (String(businessData.businessNumber || "").trim()) {
      completeStep("requestor.business.businessNumber");
    }
  }, [businessData.businessNumber, completeStep, isStepActive]);

  useEffect(() => {
    if (!isStepActive("requestor.business.representativeName")) return;
    if (String(extracted.representativeName || "").trim()) {
      completeStep("requestor.business.representativeName");
    }
  }, [completeStep, extracted.representativeName, isStepActive]);

  useEffect(() => {
    if (!isStepActive("requestor.business.phoneNumber")) return;
    if (String(businessData.phone || "").trim()) {
      completeStep("requestor.business.phoneNumber");
    }
  }, [businessData.phone, completeStep, isStepActive]);

  useEffect(() => {
    if (!isStepActive("requestor.business.address")) return;
    if (String(businessData.address || "").trim()) {
      completeStep("requestor.business.address");
    }
  }, [businessData.address, completeStep, isStepActive]);

  useEffect(() => {
    if (!isStepActive("requestor.business.email")) return;
    if (String(extracted.email || "").trim()) {
      completeStep("requestor.business.email");
    }
  }, [completeStep, extracted.email, isStepActive]);

  useEffect(() => {
    if (!isStepActive("requestor.business.businessType")) return;
    if (String(extracted.businessType || "").trim()) {
      completeStep("requestor.business.businessType");
    }
  }, [completeStep, extracted.businessType, isStepActive]);

  useEffect(() => {
    if (!isStepActive("requestor.business.businessItem")) return;
    if (String(extracted.businessItem || "").trim()) {
      completeStep("requestor.business.businessItem");
    }
  }, [completeStep, extracted.businessItem, isStepActive]);

  const disabled =
    licenseDeleteLoading ||
    licenseStatus === "uploading" ||
    licenseStatus === "processing" ||
    (membership !== "owner" && membership !== "none");

  return (
    <div className="space-y-6">
      {renderActions ? (
        <div className="flex justify-end gap-2">
          {renderActions({ disabled })}
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="repName">대표자명</Label>
            <GuideFocus
              stepId="requestor.business.representativeName"
              className="rounded-xl p-1"
            >
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
                onBlur={() => {
                  if (disabled) return;
                  onSave();
                }}
              />
            </GuideFocus>
          </div>
          <div className="space-y-2">
            <Label htmlFor="orgName">기공소명</Label>
            <GuideFocus
              stepId="requestor.business.companyName"
              className="rounded-xl p-1"
            >
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
                onKeyDown={(e) => {
                  if (!isStepActive("requestor.business.companyName")) return;
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (!String(businessData.companyName || "").trim()) return;
                  completeStep("requestor.business.companyName");
                  bizNoRef.current?.focus();
                }}
                onBlur={() => {
                  if (disabled) return;
                  onSave();
                }}
              />
            </GuideFocus>
          </div>
          <div className="space-y-2">
            <Label htmlFor="orgPhone">전화번호</Label>
            <GuideFocus
              stepId="requestor.business.phoneNumber"
              className="rounded-xl p-1"
            >
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
                onBlur={() => {
                  if (disabled) return;
                  onSave();
                }}
              />
            </GuideFocus>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bizNo">사업자등록번호</Label>
            <GuideFocus
              stepId="requestor.business.businessNumber"
              className="rounded-xl p-1"
            >
              <Input
                ref={bizNoRef}
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
                onKeyDown={(e) => {
                  if (!isStepActive("requestor.business.businessNumber"))
                    return;
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (!String(businessData.businessNumber || "").trim()) return;
                  completeStep("requestor.business.businessNumber");
                }}
                onBlur={() => {
                  if (disabled) return;
                  onSave();
                }}
              />
            </GuideFocus>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bizType">업태</Label>
            <GuideFocus
              stepId="requestor.business.businessType"
              className="rounded-xl p-1"
            >
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
                onBlur={() => {
                  if (disabled) return;
                  onSave();
                }}
              />
            </GuideFocus>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bizItem">종목</Label>
            <GuideFocus
              stepId="requestor.business.businessItem"
              className="rounded-xl p-1"
            >
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
                onBlur={() => {
                  if (disabled) return;
                  onSave();
                }}
              />
            </GuideFocus>
          </div>
          <div className="space-y-2">
            <Label htmlFor="taxEmail">세금계산서 이메일</Label>
            <GuideFocus
              stepId="requestor.business.email"
              className="rounded-xl p-1"
            >
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
                onBlur={() => {
                  if (disabled) return;
                  onSave();
                }}
              />
            </GuideFocus>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">주소</Label>
        <GuideFocus
          stepId="requestor.business.address"
          className="rounded-xl p-1"
        >
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
            onBlur={() => {
              if (disabled) return;
              onSave();
            }}
          />
        </GuideFocus>
      </div>
    </div>
  );
};
