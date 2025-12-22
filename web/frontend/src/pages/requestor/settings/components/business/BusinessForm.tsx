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
  isValidAddress,
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
  const { isStepActive, completeStep, setStepCompleted } = useGuideTour();
  const repNameRef = useRef<HTMLInputElement | null>(null);
  const companyNameRef = useRef<HTMLInputElement | null>(null);
  const phoneRef = useRef<HTMLInputElement | null>(null);
  const bizNoRef = useRef<HTMLInputElement | null>(null);
  const bizTypeRef = useRef<HTMLInputElement | null>(null);
  const bizItemRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const addressRef = useRef<HTMLInputElement | null>(null);

  const focusNext = (next: React.RefObject<HTMLInputElement | null>) => {
    next.current?.focus();
  };

  useEffect(() => {
    if (!isStepActive("requestor.business.phoneNumber")) return;
    if (String(businessData.phone || "").trim()) return;
    requestAnimationFrame(() => {
      phoneRef.current?.focus();
    });
  }, [businessData.phone, isStepActive]);

  useEffect(() => {
    if (!isStepActive("requestor.business.email")) return;
    if (String(extracted.email || "").trim()) return;
    requestAnimationFrame(() => {
      emailRef.current?.focus();
    });
  }, [extracted.email, isStepActive]);

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
                ref={repNameRef}
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
                onKeyDown={(e) => {
                  if ((e.nativeEvent as any)?.isComposing) return;
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (isStepActive("requestor.business.representativeName")) {
                    const v = String(extracted.representativeName || "").trim();
                    if (v.length < 2) return;
                    completeStep("requestor.business.representativeName");
                  }
                  focusNext(companyNameRef);
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
                ref={companyNameRef}
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
                  if ((e.nativeEvent as any)?.isComposing) return;
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (isStepActive("requestor.business.companyName")) {
                    const v = String(businessData.companyName || "").trim();
                    if (v.length < 2) return;
                    completeStep("requestor.business.companyName");
                  }
                  focusNext(repNameRef);
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
                ref={phoneRef}
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
                  const hasValue = Boolean(nextValue.trim());
                  const invalid = hasValue && !isValidPhoneNumber(nextValue);
                  setErrors((prev) => ({
                    ...prev,
                    phone: invalid,
                  }));
                  setStepCompleted(
                    "requestor.business.phoneNumber",
                    hasValue && !invalid
                  );
                }}
                onKeyDown={(e) => {
                  if ((e.nativeEvent as any)?.isComposing) return;
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (isStepActive("requestor.business.phoneNumber")) {
                    const v = String(businessData.phone || "").trim();
                    if (!isValidPhoneNumber(v)) return;
                    completeStep("requestor.business.phoneNumber");
                  }
                  const hasBusinessNumber = Boolean(
                    String(businessData.businessNumber || "").trim()
                  );
                  focusNext(hasBusinessNumber ? emailRef : bizNoRef);
                }}
                onBlur={() => {
                  if (disabled) return;

                  if (isStepActive("requestor.business.phoneNumber")) {
                    const v = String(businessData.phone || "").trim();
                    if (!v) {
                      phoneRef.current?.focus();
                      return;
                    }
                    if (!isValidPhoneNumber(v)) {
                      phoneRef.current?.focus();
                      return;
                    }
                    completeStep("requestor.business.phoneNumber");
                    const hasBusinessNumber = Boolean(
                      String(businessData.businessNumber || "").trim()
                    );
                    setTimeout(() => {
                      focusNext(hasBusinessNumber ? emailRef : bizNoRef);
                    }, 0);
                  }

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
                  if ((e.nativeEvent as any)?.isComposing) return;
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (isStepActive("requestor.business.businessNumber")) {
                    const v = String(businessData.businessNumber || "").trim();
                    if (!isValidBusinessNumber(v)) return;
                    completeStep("requestor.business.businessNumber");
                  }
                  focusNext(bizTypeRef);
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
                ref={bizTypeRef}
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
                onKeyDown={(e) => {
                  if ((e.nativeEvent as any)?.isComposing) return;
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (isStepActive("requestor.business.businessType")) {
                    const v = String(extracted.businessType || "").trim();
                    if (v.length < 2) return;
                    completeStep("requestor.business.businessType");
                  }
                  focusNext(bizItemRef);
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
                ref={bizItemRef}
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
                onKeyDown={(e) => {
                  if ((e.nativeEvent as any)?.isComposing) return;
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (isStepActive("requestor.business.businessItem")) {
                    const v = String(extracted.businessItem || "").trim();
                    if (v.length < 2) return;
                    completeStep("requestor.business.businessItem");
                  }
                  focusNext(emailRef);
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
                ref={emailRef}
                className={cn(
                  errors.email &&
                    "border-destructive focus-visible:ring-destructive"
                )}
                value={extracted.email || ""}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setExtracted((prev) => ({
                    ...prev,
                    email: e.target.value,
                  }));
                  const invalid = !isValidEmail(e.target.value);
                  setErrors((prev) => ({ ...prev, email: invalid }));
                  setStepCompleted("requestor.business.email", !invalid);
                }}
                onKeyDown={(e) => {
                  if ((e.nativeEvent as any)?.isComposing) return;
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (isStepActive("requestor.business.email")) {
                    const v = String(extracted.email || "").trim();
                    if (!isValidEmail(v)) return;
                    completeStep("requestor.business.email");
                  }
                  focusNext(addressRef);
                }}
                onBlur={() => {
                  if (disabled) return;

                  if (isStepActive("requestor.business.email")) {
                    const v = String(extracted.email || "").trim();
                    if (!v || !isValidEmail(v)) {
                      setStepCompleted("requestor.business.email", false);
                      emailRef.current?.focus();
                      return;
                    }
                    completeStep("requestor.business.email");
                    setTimeout(() => {
                      focusNext(addressRef);
                    }, 0);
                  }

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
            ref={addressRef}
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
            onKeyDown={(e) => {
              if ((e.nativeEvent as any)?.isComposing) return;
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (isStepActive("requestor.business.address")) {
                const v = String(businessData.address || "").trim();
                if (v.length < 5) return;
                completeStep("requestor.business.address");
              }
              addressRef.current?.blur();
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
