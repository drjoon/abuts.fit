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
  normalizeStartDate,
  isValidStartDate,
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
  onSave: () => void; // 제출(서버 저장)
  onAutoSave?: () => void; // 블러/탭 시 로컬 draft 저장만
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
  onAutoSave,
  renderActions,
}: BusinessFormProps) => {
  const { isStepActive, completeStep, setStepCompleted } = useGuideTour();
  const repNameRef = useRef<HTMLInputElement | null>(null);
  const startDateRef = useRef<HTMLInputElement | null>(null);
  const companyNameRef = useRef<HTMLInputElement | null>(null);
  const phoneRef = useRef<HTMLInputElement | null>(null);
  const bizNoRef = useRef<HTMLInputElement | null>(null);
  const bizTypeRef = useRef<HTMLInputElement | null>(null);
  const bizItemRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const addressRef = useRef<HTMLInputElement | null>(null);
  const submitRef = useRef<HTMLButtonElement | null>(null);

  type FieldKey =
    | "repName"
    | "startDate"
    | "companyName"
    | "phone"
    | "bizNo"
    | "bizType"
    | "bizItem"
    | "email"
    | "address"
    | "submit";

  const focusNextEmpty = (current: FieldKey) => {
    const fields: {
      key: FieldKey;
      ref: React.RefObject<HTMLInputElement | HTMLButtonElement | null>;
      value: string | undefined;
    }[] = [
      { key: "repName", ref: repNameRef, value: extracted.representativeName },
      { key: "startDate", ref: startDateRef, value: extracted.startDate },
      {
        key: "companyName",
        ref: companyNameRef,
        value: businessData.companyName,
      },
      { key: "phone", ref: phoneRef, value: businessData.phone },
      { key: "bizNo", ref: bizNoRef, value: businessData.businessNumber },
      { key: "bizType", ref: bizTypeRef, value: extracted.businessType },
      { key: "bizItem", ref: bizItemRef, value: extracted.businessItem },
      { key: "email", ref: emailRef, value: extracted.email },
      { key: "address", ref: addressRef, value: businessData.address },
      // submit 버튼은 항상 마지막으로 포커스
      { key: "submit", ref: submitRef, value: "" },
    ];
    const idx = fields.findIndex((f) => f.key === current);
    if (idx === -1) return false;
    for (let i = idx + 1; i < fields.length; i += 1) {
      const f = fields[i];
      const filled = Boolean(String(f.value || "").trim());
      if (!filled || f.key === "submit") {
        f.ref.current?.focus();
        return true;
      }
    }
    return false;
  };

  const handleNav = (
    e: React.KeyboardEvent<HTMLInputElement>,
    current: FieldKey
  ) => {
    if ((e.nativeEvent as any)?.isComposing) return false;
    const isNav = e.key === "Enter" || (e.key === "Tab" && !e.shiftKey);
    if (!isNav) return false;
    const moved = focusNextEmpty(current);
    if (moved) {
      e.preventDefault();
    }
    return moved;
  };

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

  // 초기값이 이미 있으면 가이드 포커스를 완료 상태로 설정
  useEffect(() => {
    const name = String(businessData.companyName || "").trim();
    if (name.length >= 2) {
      setStepCompleted("requestor.business.companyName", true);
    }
  }, [businessData.companyName, setStepCompleted]);

  // 채워진 칸은 가이드 포커스 완료 처리하여 이동하지 않도록
  useEffect(() => {
    const fields: { step: string; value: string; valid: boolean }[] = [
      {
        step: "requestor.business.representativeName",
        value: String(extracted.representativeName || "").trim(),
        valid: String(extracted.representativeName || "").trim().length >= 2,
      },
      {
        step: "requestor.business.startDate",
        value: String(extracted.startDate || "").trim(),
        valid: Boolean(
          extracted.startDate && isValidStartDate(extracted.startDate)
        ),
      },
      {
        step: "requestor.business.companyName",
        value: String(businessData.companyName || "").trim(),
        valid: String(businessData.companyName || "").trim().length >= 2,
      },
      {
        step: "requestor.business.phoneNumber",
        value: String(businessData.phone || "").trim(),
        valid: Boolean(
          businessData.phone && isValidPhoneNumber(businessData.phone)
        ),
      },
      {
        step: "requestor.business.businessNumber",
        value: String(businessData.businessNumber || "").trim(),
        valid: Boolean(
          businessData.businessNumber &&
            isValidBusinessNumber(businessData.businessNumber)
        ),
      },
      {
        step: "requestor.business.businessType",
        value: String(extracted.businessType || "").trim(),
        valid: String(extracted.businessType || "").trim().length >= 2,
      },
      {
        step: "requestor.business.businessItem",
        value: String(extracted.businessItem || "").trim(),
        valid: String(extracted.businessItem || "").trim().length >= 2,
      },
      {
        step: "requestor.business.email",
        value: String(extracted.email || "").trim(),
        valid: Boolean(extracted.email && isValidEmail(extracted.email)),
      },
      {
        step: "requestor.business.address",
        value: String(businessData.address || "").trim(),
        valid: String(businessData.address || "").trim().length >= 5,
      },
    ];

    fields.forEach(({ step, valid, value }) => {
      if (value && valid) {
        setStepCompleted(step, true);
      }
    });
  }, [
    businessData.address,
    businessData.businessNumber,
    businessData.companyName,
    businessData.phone,
    extracted.businessItem,
    extracted.businessType,
    extracted.email,
    extracted.representativeName,
    extracted.startDate,
    setStepCompleted,
  ]);

  const disabled =
    licenseDeleteLoading ||
    licenseStatus === "uploading" ||
    licenseStatus === "processing" ||
    (membership !== "owner" && membership !== "none");

  const guideMuted =
    licenseStatus === "uploading" || licenseStatus === "processing";

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
              muted={guideMuted}
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
                  const v = String(extracted.representativeName || "").trim();
                  const isNav =
                    e.key === "Enter" || (e.key === "Tab" && !e.shiftKey);
                  if (isNav && v) {
                    if (handleNav(e, "repName")) return;
                  }
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (isStepActive("requestor.business.representativeName")) {
                    if (v.length < 2) return;
                    completeStep("requestor.business.representativeName");
                  }
                  focusNext(startDateRef);
                }}
                onBlur={() => {
                  if (disabled) return;
                  onAutoSave?.();
                }}
              />
            </GuideFocus>
          </div>
          <div className="space-y-2">
            <Label htmlFor="startDate">개업연월일</Label>
            <Input
              id="startDate"
              ref={startDateRef}
              inputMode="numeric"
              className={cn(
                errors.startDate &&
                  "border-destructive focus-visible:ring-destructive"
              )}
              value={extracted.startDate || ""}
              onChange={(e) => {
                const nextValue = normalizeStartDate(e.target.value);
                setExtracted((prev) => ({
                  ...prev,
                  startDate: nextValue,
                }));
                const invalid =
                  Boolean(nextValue) && !isValidStartDate(nextValue || "");
                setErrors((prev) => ({
                  ...prev,
                  startDate: invalid,
                }));
              }}
              onKeyDown={(e) => {
                if ((e.nativeEvent as any)?.isComposing) return;
                const v = String(extracted.startDate || "").trim();
                const isNav =
                  e.key === "Enter" || (e.key === "Tab" && !e.shiftKey);
                if (isNav && v) {
                  if (handleNav(e, "startDate")) return;
                }
                if (e.key !== "Enter") return;
                e.preventDefault();
                focusNext(companyNameRef);
              }}
              onBlur={() => {
                if (disabled) return;
                if (isStepActive("requestor.business.representativeName")) {
                  const v = String(extracted.startDate || "").trim();
                  if (v && !isValidStartDate(v)) {
                    setErrors((prev) => ({ ...prev, startDate: true }));
                    startDateRef.current?.focus();
                    return;
                  }
                }
                onAutoSave?.();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="orgName">기공소명</Label>
            <GuideFocus
              stepId="requestor.business.companyName"
              className="rounded-xl p-1"
              muted={guideMuted}
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
                  const v = String(businessData.companyName || "").trim();
                  const isNav =
                    e.key === "Enter" || (e.key === "Tab" && !e.shiftKey);
                  if (isNav && v) {
                    if (handleNav(e, "companyName")) return;
                  }
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (isStepActive("requestor.business.companyName")) {
                    if (v.length < 2) return;
                    completeStep("requestor.business.companyName");
                  }
                  focusNext(phoneRef);
                }}
                onBlur={() => {
                  if (disabled) return;
                  onAutoSave?.();
                }}
              />
            </GuideFocus>
          </div>
          <div className="space-y-2">
            <Label htmlFor="orgPhone">전화번호</Label>
            <GuideFocus
              stepId="requestor.business.phoneNumber"
              className="rounded-xl p-1"
              muted={guideMuted}
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
                  const v = String(businessData.phone || "").trim();
                  const isNav =
                    e.key === "Enter" || (e.key === "Tab" && !e.shiftKey);
                  if (isNav && v) {
                    if (handleNav(e, "phone")) return;
                  }
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (isStepActive("requestor.business.phoneNumber")) {
                    if (!isValidPhoneNumber(v)) return;
                    completeStep("requestor.business.phoneNumber");
                  }
                  focusNext(bizNoRef);
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
                    setTimeout(() => {
                      focusNext(bizNoRef);
                    }, 0);
                  }

                  onAutoSave?.();
                }}
              />
            </GuideFocus>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bizNo">사업자등록번호</Label>
            <GuideFocus
              stepId="requestor.business.businessNumber"
              className="rounded-xl p-1"
              muted={guideMuted}
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
                      : false,
                  }));
                  setStepCompleted(
                    "requestor.business.businessNumber",
                    !!nextValue && isValidBusinessNumber(nextValue)
                  );
                }}
                onKeyDown={(e) => {
                  if ((e.nativeEvent as any)?.isComposing) return;
                  const v = String(businessData.businessNumber || "").trim();
                  const isNav =
                    e.key === "Enter" || (e.key === "Tab" && !e.shiftKey);
                  if (isNav && v) {
                    if (handleNav(e, "bizNo")) return;
                  }
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (isStepActive("requestor.business.businessNumber")) {
                    if (!isValidBusinessNumber(v)) return;
                    completeStep("requestor.business.businessNumber");
                  }
                  focusNext(bizTypeRef);
                }}
                onBlur={() => {
                  if (disabled) return;
                  onAutoSave?.();
                }}
              />
            </GuideFocus>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bizType">업태</Label>
            <GuideFocus
              stepId="requestor.business.businessType"
              className="rounded-xl p-1"
              muted={guideMuted}
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
                  const v = String(extracted.businessType || "").trim();
                  const isNav =
                    e.key === "Enter" || (e.key === "Tab" && !e.shiftKey);
                  if (isNav && v) {
                    if (handleNav(e, "bizType")) return;
                  }
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (isStepActive("requestor.business.businessType")) {
                    if (v.length < 2) return;
                    completeStep("requestor.business.businessType");
                  }
                  focusNext(bizItemRef);
                }}
                onBlur={() => {
                  if (disabled) return;
                  onAutoSave?.();
                }}
              />
            </GuideFocus>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bizItem">종목</Label>
            <GuideFocus
              stepId="requestor.business.businessItem"
              className="rounded-xl p-1"
              muted={guideMuted}
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
                  const v = String(extracted.businessItem || "").trim();
                  const isNav =
                    e.key === "Enter" || (e.key === "Tab" && !e.shiftKey);
                  if (isNav && v) {
                    if (handleNav(e, "bizItem")) return;
                  }
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (isStepActive("requestor.business.businessItem")) {
                    if (v.length < 2) return;
                    completeStep("requestor.business.businessItem");
                  }
                  focusNext(emailRef);
                }}
                onBlur={() => {
                  if (disabled) return;
                  onAutoSave?.();
                }}
              />
            </GuideFocus>
          </div>
          <div className="space-y-2">
            <Label htmlFor="taxEmail">세금계산서 이메일</Label>
            <GuideFocus
              stepId="requestor.business.email"
              className="rounded-xl p-1"
              muted={guideMuted}
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
                  const v = String(extracted.email || "").trim();
                  const isNav =
                    e.key === "Enter" || (e.key === "Tab" && !e.shiftKey);
                  if (isNav && v) {
                    if (handleNav(e, "email")) return;
                  }
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (isStepActive("requestor.business.email")) {
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

                  onAutoSave?.();
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
          muted={guideMuted}
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-3">
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
                  const v = String(businessData.address || "").trim();
                  const isNav =
                    e.key === "Enter" || (e.key === "Tab" && !e.shiftKey);
                  if (isNav && v) {
                    // 주소는 Enter 시 바로 제출
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (isStepActive("requestor.business.address")) {
                        if (v.length < 5) return;
                        completeStep("requestor.business.address");
                      }
                      onSave();
                      return;
                    }
                    if (handleNav(e, "address")) return;
                  }
                }}
                onBlur={() => {
                  if (disabled) return;
                  onAutoSave?.();
                }}
              />
            </div>
            <div className="md:col-span-1">
              <Button
                type="button"
                variant="default"
                className="w-full"
                disabled={disabled}
                ref={submitRef}
                onClick={() => {
                  onSave();
                }}
              >
                검증 후 제출
              </Button>
            </div>
          </div>
        </GuideFocus>
      </div>
    </div>
  );
};
