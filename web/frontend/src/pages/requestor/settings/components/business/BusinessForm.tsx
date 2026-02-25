import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/shared/ui/cn";
import { GuideFocus } from "@/shared/ui/GuideFocus";
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
            <GuideFocus className="rounded-xl p-1">
              <Input
                id="repName"
                ref={repNameRef}
                className={cn(
                  errors.representativeName &&
                    "border-destructive focus-visible:ring-destructive",
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
                  "border-destructive focus-visible:ring-destructive",
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
                onAutoSave?.();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="orgName">사업자명</Label>
            <GuideFocus className="rounded-xl p-1">
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
            </GuideFocus>
          </div>
          <div className="space-y-2">
            <Label htmlFor="orgPhone">전화번호</Label>
            <GuideFocus className="rounded-xl p-1">
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
            </GuideFocus>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bizNo">사업자등록번호</Label>
            <GuideFocus className="rounded-xl p-1">
              <Input
                ref={bizNoRef}
                id="bizNo"
                className={cn(
                  errors.businessNumber &&
                    "border-destructive focus-visible:ring-destructive",
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
                  if (disabled) return;
                  onAutoSave?.();
                }}
              />
            </GuideFocus>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bizType">업태</Label>
            <GuideFocus className="rounded-xl p-1">
              <Input
                id="bizType"
                ref={bizTypeRef}
                className={cn(
                  errors.businessType &&
                    "border-destructive focus-visible:ring-destructive",
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
            <GuideFocus className="rounded-xl p-1">
              <Input
                id="bizItem"
                ref={bizItemRef}
                className={cn(
                  errors.businessItem &&
                    "border-destructive focus-visible:ring-destructive",
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
            <GuideFocus className="rounded-xl p-1">
              <Input
                id="taxEmail"
                type="email"
                ref={emailRef}
                className={cn(
                  errors.email &&
                    "border-destructive focus-visible:ring-destructive",
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
                }}
                onKeyDown={(e) => {
                  if ((e.nativeEvent as any)?.isComposing) return;
                  const v = String(extracted.email || "").trim();
                  const isNav =
                    e.key === "Enter" || (e.key === "Tab" && !e.shiftKey);
                  if (isNav && v) {
                    if (e.key === "Enter") {
                      if (focusNextEmptyAndMaybeSubmit("email")) {
                        e.preventDefault();
                        return;
                      }
                    } else {
                      if (handleNav(e, "email")) return;
                    }
                  }
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  // 이메일이 마지막 빈 칸이면 submit 실행, 아니면 다음으로 이동
                  if (focusNextEmptyAndMaybeSubmit("email")) return;
                  focusNext(addressRef);
                }}
                onBlur={() => {
                  if (disabled) return;
                  onAutoSave?.();
                }}
              />
            </GuideFocus>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">주소</Label>
        <GuideFocus className="rounded-xl p-1">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-3">
              <Input
                id="address"
                ref={addressRef}
                className={cn(
                  errors.address &&
                    "border-destructive focus-visible:ring-destructive",
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
