// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/shared/ui/cn";
import { BusinessAddressFields } from "./BusinessAddressFields";
// SSOT: metadata 사용 (metadata 레거시 제거)
import {
  BusinessData,
  BusinessMetadata,
  LicenseStatus,
  MembershipStatus,
  FieldKey,
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
  metadata: BusinessMetadata;
  errors: Record<string, boolean>;
  licenseStatus: LicenseStatus;
  membership: MembershipStatus;
  licenseDeleteLoading: boolean;
  setBusinessData: React.Dispatch<React.SetStateAction<BusinessData>>;
  setMetadata: React.Dispatch<React.SetStateAction<BusinessMetadata>>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setCompanyNameTouched: (touched: boolean) => void;
  onSave: () => void | Promise<void>; // 제출(서버 저장)
  onAutoSave?: () => void; // 블러/탭 시 로컬 draft 저장만
  autoOpenAddressSearchSignal?: number;
  focusFirstMissingSignal?: number;
  focusFieldKey?: FieldKey | null;
  renderActions?: (props: { disabled: boolean }) => React.ReactNode;
  successNote?: string;
  businessNumberLocked?: boolean;
  validationSucceeded?: boolean;
  isVerified?: boolean;
}

export const BusinessForm = ({
  businessData,
  metadata,
  errors,
  licenseStatus,
  membership,
  licenseDeleteLoading,
  setBusinessData,
  setMetadata,
  setErrors,
  setCompanyNameTouched,
  onSave,
  onAutoSave,
  autoOpenAddressSearchSignal,
  focusFirstMissingSignal,
  focusFieldKey,
  renderActions,
  successNote,
  businessNumberLocked = false,
  validationSucceeded = false,
  isVerified = false,
}: BusinessFormProps) => {
  const [isModified, setIsModified] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // validationSucceeded 또는 isVerified가 변경되면 isModified 초기화
  useEffect(() => {
    if (validationSucceeded || isVerified) {
      setIsModified(false);
    }
  }, [validationSucceeded, isVerified]);

  // 사업자등록증 업로드 시 isModified를 true로 설정 (AI 인식 실패 시도 포함)
  useEffect(() => {
    if (licenseStatus === "ready" || licenseStatus === "error") {
      setIsModified(true);
    }
  }, [licenseStatus]);

  const repNameRef = useRef<HTMLInputElement | null>(null);
  const startDateRef = useRef<HTMLInputElement | null>(null);
  const companyNameRef = useRef<HTMLInputElement | null>(null);
  const phoneRef = useRef<HTMLInputElement | null>(null);
  const bizNoRef = useRef<HTMLInputElement | null>(null);
  const bizTypeRef = useRef<HTMLInputElement | null>(null);
  const bizItemRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const addressRef = useRef<HTMLInputElement | null>(null);
  const addressDetailRef = useRef<HTMLInputElement | null>(null);
  const zipCodeRef = useRef<HTMLInputElement | null>(null);
  const submitRef = useRef<HTMLButtonElement | null>(null);

  const focusNextEmpty = (current: FieldKey) => {
    const fields: {
      key: FieldKey;
      ref: React.RefObject<HTMLInputElement | HTMLButtonElement | null>;
      value: string | undefined;
    }[] = [
      {
        key: "repName",
        ref: repNameRef,
        value: businessData.owner || metadata.representativeName,
      },
      { key: "startDate", ref: startDateRef, value: metadata.startDate },
      {
        key: "companyName",
        ref: companyNameRef,
        value: businessData.companyName,
      },
      { key: "phone", ref: phoneRef, value: businessData.phone },
      { key: "bizNo", ref: bizNoRef, value: businessData.businessNumber },
      { key: "bizType", ref: bizTypeRef, value: metadata.businessType },
      { key: "bizItem", ref: bizItemRef, value: metadata.businessItem },
      { key: "email", ref: emailRef, value: metadata.email },
      { key: "address", ref: addressRef, value: businessData.address },
      {
        key: "addressDetail",
        ref: addressDetailRef,
        value: businessData.addressDetail,
      },
      { key: "zipCode", ref: zipCodeRef, value: businessData.zipCode },
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

  const focusNextEmptyAndMaybeSubmit = (current: FieldKey) => {
    const moved = focusNextEmpty(current);
    if (!moved) return false;
    // 마지막 입력칸에서 submit으로 이동한 경우 Enter로 바로 실행
    requestAnimationFrame(() => {
      if (document.activeElement === submitRef.current) {
        submitRef.current?.click();
      }
    });
    return true;
  };

  const handleNav = (
    e: React.KeyboardEvent<HTMLInputElement>,
    current: FieldKey,
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

  const focusField = (field: FieldKey) => {
    const refMap: Record<
      FieldKey,
      React.RefObject<HTMLInputElement | HTMLButtonElement | null>
    > = {
      repName: repNameRef,
      startDate: startDateRef,
      companyName: companyNameRef,
      phone: phoneRef,
      bizNo: bizNoRef,
      bizType: bizTypeRef,
      bizItem: bizItemRef,
      email: emailRef,
      address: addressRef,
      addressDetail: addressDetailRef,
      zipCode: zipCodeRef,
      submit: submitRef,
    };
    refMap[field]?.current?.focus();
  };

  const disabled =
    licenseDeleteLoading ||
    licenseStatus === "uploading" ||
    licenseStatus === "processing" ||
    (membership !== "owner" && membership !== "none");

  useEffect(() => {
    if (!focusFirstMissingSignal) return;
    requestAnimationFrame(() => {
      if (focusFieldKey) {
        focusField(focusFieldKey);
        return;
      }
      focusNextEmpty("repName");
    });
  }, [focusFieldKey, focusFirstMissingSignal]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="repName">대표자명</Label>
            <div className="relative rounded-xl p-1">
              <Input
                id="repName"
                ref={repNameRef}
                className={cn(
                  errors.representativeName &&
                    "border-destructive focus-visible:ring-destructive",
                )}
                value={businessData.owner || metadata.representativeName || ""}
                onChange={(e) => {
                  setBusinessData((prev) => ({
                    ...prev,
                    owner: e.target.value,
                  }));
                  setMetadata((prev) => ({
                    ...prev,
                    representativeName: e.target.value,
                  }));
                  setErrors((prev) => ({ ...prev, repName: false }));
                  setIsModified(true);
                }}
                onKeyDown={(e) => {
                  if ((e.nativeEvent as any)?.isComposing) return;
                  const v = String(
                    businessData.owner || metadata.representativeName || "",
                  ).trim();
                  const isNav =
                    e.key === "Enter" || (e.key === "Tab" && !e.shiftKey);
                  if (isNav && v) {
                    if (handleNav(e, "repName")) return;
                  }
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  focusNext(startDateRef);
                }}
                onBlur={() => {
                  if (disabled) return;
                  onAutoSave?.();
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="startDate">개업연월일</Label>
            <Input
              id="startDate"
              ref={startDateRef}
              inputMode="numeric"
              className={cn(
                errors.startDate &&
                  "border-destructive focus-visible:ring-destructive",
              )}
              value={metadata.startDate || ""}
              onChange={(e) => {
                const nextValue = normalizeStartDate(e.target.value);
                setMetadata((prev) => ({
                  ...prev,
                  startDate: nextValue,
                }));
                const invalid =
                  Boolean(nextValue) && !isValidStartDate(nextValue || "");
                setErrors((prev) => ({
                  ...prev,
                  startDate: invalid,
                }));
                setIsModified(true);
              }}
              onKeyDown={(e) => {
                if ((e.nativeEvent as any)?.isComposing) return;
                const v = String(metadata.startDate || "").trim();
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
                onAutoSave?.();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="orgName">사업자명</Label>
            <div className="relative rounded-xl p-1">
              <Input
                id="orgName"
                ref={companyNameRef}
                className={cn(
                  errors.companyName &&
                    "border-destructive focus-visible:ring-destructive",
                )}
                value={businessData.companyName}
                onChange={(e) => {
                  setBusinessData((prev) => ({
                    ...prev,
                    companyName: e.target.value,
                  }));
                  setCompanyNameTouched(true);
                  setErrors((prev) => ({ ...prev, companyName: false }));
                  setIsModified(true);
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
                  focusNext(phoneRef);
                }}
                onBlur={() => {
                  if (disabled) return;
                  onAutoSave?.();
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="orgPhone">전화번호</Label>
            <div className="relative rounded-xl p-1">
              <Input
                id="orgPhone"
                ref={phoneRef}
                className={cn(
                  errors.phone &&
                    "border-destructive focus-visible:ring-destructive",
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
                  setIsModified(true);
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
                  focusNextEmpty("phone");
                }}
                onBlur={() => {
                  if (disabled) return;
                  onAutoSave?.();
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bizNo">사업자등록번호</Label>
            <div className="relative rounded-xl p-1">
              <Input
                ref={bizNoRef}
                id="bizNo"
                disabled={businessNumberLocked || disabled}
                className={cn(
                  !businessNumberLocked &&
                    errors.businessNumber &&
                    "border-destructive focus-visible:ring-destructive",
                )}
                value={businessData.businessNumber}
                onChange={(e) => {
                  if (businessNumberLocked) return;
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
                  setIsModified(true);
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
                  focusNext(bizTypeRef);
                }}
                onBlur={() => {
                  if (disabled || businessNumberLocked) return;
                  onAutoSave?.();
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bizType">업태</Label>
            <div className="relative rounded-xl p-1">
              <Input
                id="bizType"
                ref={bizTypeRef}
                className={cn(
                  errors.businessType &&
                    "border-destructive focus-visible:ring-destructive",
                )}
                value={metadata.businessType || ""}
                onChange={(e) => {
                  setMetadata((prev) => ({
                    ...prev,
                    businessType: e.target.value,
                  }));
                  setErrors((prev) => ({
                    ...prev,
                    businessType: false,
                  }));
                  setIsModified(true);
                }}
                onKeyDown={(e) => {
                  if ((e.nativeEvent as any)?.isComposing) return;
                  const v = String(metadata.businessType || "").trim();
                  const isNav =
                    e.key === "Enter" || (e.key === "Tab" && !e.shiftKey);
                  if (isNav && v) {
                    if (handleNav(e, "bizType")) return;
                  }
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  focusNext(bizItemRef);
                }}
                onBlur={() => {
                  if (disabled) return;
                  onAutoSave?.();
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bizItem">종목</Label>
            <div className="relative rounded-xl p-1">
              <Input
                id="bizItem"
                ref={bizItemRef}
                className={cn(
                  errors.businessItem &&
                    "border-destructive focus-visible:ring-destructive",
                )}
                value={metadata.businessItem || ""}
                onChange={(e) => {
                  setMetadata((prev) => ({
                    ...prev,
                    businessItem: e.target.value,
                  }));
                  setErrors((prev) => ({
                    ...prev,
                    businessItem: false,
                  }));
                  setIsModified(true);
                }}
                onKeyDown={(e) => {
                  if ((e.nativeEvent as any)?.isComposing) return;
                  const v = String(metadata.businessItem || "").trim();
                  const isNav =
                    e.key === "Enter" || (e.key === "Tab" && !e.shiftKey);
                  if (isNav && v) {
                    if (handleNav(e, "bizItem")) return;
                  }
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  focusNext(emailRef);
                }}
                onBlur={() => {
                  if (disabled) return;
                  onAutoSave?.();
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="taxEmail">세금계산서 이메일</Label>
            <div className="relative rounded-xl p-1">
              <Input
                id="taxEmail"
                type="email"
                ref={emailRef}
                className={cn(
                  errors.email &&
                    "border-destructive focus-visible:ring-destructive",
                )}
                value={metadata.email || ""}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setMetadata((prev) => ({
                    ...prev,
                    email: e.target.value,
                  }));
                  const invalid = !isValidEmail(e.target.value);
                  setErrors((prev) => ({ ...prev, email: invalid }));
                  setIsModified(true);
                }}
                onKeyDown={(e) => {
                  if ((e.nativeEvent as any)?.isComposing) return;
                  const v = String(metadata.email || "").trim();
                  const isNav =
                    e.key === "Enter" || (e.key === "Tab" && !e.shiftKey);
                  if (isNav && v) {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (focusNextEmptyAndMaybeSubmit("email")) return;
                      focusNext(addressRef);
                      return;
                    } else {
                      if (handleNav(e, "email")) return;
                    }
                  }
                }}
                onBlur={() => {
                  if (disabled) return;
                  onAutoSave?.();
                }}
              />
            </div>
          </div>
        </div>

        <BusinessAddressFields
          className="relative rounded-xl p-1"
          address={businessData.address}
          addressDetail={businessData.addressDetail}
          zipCode={businessData.zipCode}
          disabled={disabled}
          autoOpenAddressSearchSignal={autoOpenAddressSearchSignal}
          addressInputRef={addressRef}
          addressDetailInputRef={addressDetailRef}
          zipCodeInputRef={zipCodeRef}
          addressError={Boolean(errors.address)}
          zipCodeError={Boolean(errors.zipCode)}
          onChangeAddress={(next) => {
            setBusinessData((prev) => ({ ...prev, address: next }));
            setErrors((prev) => ({ ...prev, address: false }));
            setIsModified(true);
          }}
          onChangeAddressDetail={(next) => {
            setBusinessData((prev) => ({ ...prev, addressDetail: next }));
            setIsModified(true);
          }}
          onChangeZipCode={(next) => {
            setBusinessData((prev) => ({ ...prev, zipCode: next }));
            setErrors((prev) => ({ ...prev, zipCode: false }));
            setIsModified(true);
          }}
          onAddressSelected={() => {
            setErrors((prev) => ({
              ...prev,
              address: false,
              zipCode: false,
            }));
            setIsModified(true);
            requestAnimationFrame(() => {
              addressDetailRef.current?.focus();
            });
          }}
          onAddressKeyDown={(e) => {
            if ((e.nativeEvent as any)?.isComposing) return;
            const v = String(businessData.address || "").trim();
            const isNav =
              e.key === "Enter" || (e.key === "Tab" && !e.shiftKey);
            if (isNav && v) {
              if (e.key === "Enter") {
                e.preventDefault();
                focusNext(addressDetailRef);
                return;
              }
              if (handleNav(e, "address")) return;
            }
          }}
          onAddressDetailKeyDown={(e) => {
            if ((e.nativeEvent as any)?.isComposing) return;
            const v = String(businessData.addressDetail || "").trim();
            const isNav =
              e.key === "Enter" || (e.key === "Tab" && !e.shiftKey);
            if (isNav && v) {
              if (e.key === "Enter") {
                e.preventDefault();
                focusNext(zipCodeRef);
                return;
              }
              if (handleNav(e, "addressDetail")) return;
            }
          }}
          onZipCodeKeyDown={(e) => {
            if ((e.nativeEvent as any)?.isComposing) return;
            const v = String(businessData.zipCode || "").trim();
            const isNav =
              e.key === "Enter" || (e.key === "Tab" && !e.shiftKey);
            if (isNav && v) {
              if (e.key === "Enter") {
                e.preventDefault();
                onSave();
                return;
              }
              if (handleNav(e, "zipCode")) return;
            }
          }}
          onAddressBlur={() => {
            if (disabled) return;
            onAutoSave?.();
          }}
          onAddressDetailBlur={() => {
            if (disabled) return;
            onAutoSave?.();
          }}
          onZipCodeBlur={() => {
            if (disabled) return;
            onAutoSave?.();
          }}
        />
      </div>

      <div className="space-y-2">
        <div className="relative rounded-xl p-1">
          {(() => {
            const actionsNode = renderActions?.({ disabled }) ?? null;
            const submitBtn = (
              <Button
                type="button"
                variant="default"
                disabled={
                  disabled ||
                  isSaving ||
                  (!isModified && (validationSucceeded || isVerified))
                }
                ref={submitRef}
                className={actionsNode ? "w-full" : undefined}
                onClick={async () => {
                  setIsSaving(true);
                  setIsModified(false);
                  try {
                    await onSave();
                  } finally {
                    setIsSaving(false);
                  }
                }}
              >
                {isSaving ? "저장 중..." : "검증 후 제출"}
              </Button>
            );
            return actionsNode ? (
              <div className="grid grid-cols-2 gap-2">
                {actionsNode}
                {submitBtn}
              </div>
            ) : (
              <div className="flex justify-end">{submitBtn}</div>
            );
          })()}
          {successNote && (
            <p className="text-center text-xs font-semibold text-primary-strong flex justify-end mt-2">
              {successNote}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
