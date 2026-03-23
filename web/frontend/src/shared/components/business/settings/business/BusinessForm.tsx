import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";
import {
  BusinessData,
  LicenseExtracted,
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

declare global {
  interface Window {
    daum?: {
      Postcode?: new (options: {
        oncomplete: (data: {
          zonecode?: string;
          address?: string;
          roadAddress?: string;
          jibunAddress?: string;
        }) => void;
        onclose?: () => void;
      }) => { open: (options?: { popupName?: string }) => void };
    };
  }
}

const POSTCODE_SCRIPT_SRC =
  "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

let postcodeScriptPromise: Promise<void> | null = null;

const loadPostcodeScript = () => {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.daum?.Postcode) return Promise.resolve();
  if (postcodeScriptPromise) return postcodeScriptPromise;
  postcodeScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = POSTCODE_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("주소 검색 스크립트 로딩 실패"));
    document.body.appendChild(script);
  });
  return postcodeScriptPromise;
};

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
  autoOpenAddressSearchSignal,
  focusFirstMissingSignal,
  focusFieldKey,
  renderActions,
  successNote,
  businessNumberLocked = false,
  validationSucceeded = false,
  isVerified = false,
}: BusinessFormProps) => {
  const { toast } = useToast();
  const [isModified, setIsModified] = useState(false);

  // validationSucceeded 또는 isVerified가 변경되면 isModified 초기화
  useEffect(() => {
    if (validationSucceeded || isVerified) {
      setIsModified(false);
    }
  }, [validationSucceeded, isVerified]);

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
  const postcodeContainerRef = useRef<HTMLDivElement | null>(null);

  const focusNextEmpty = (current: FieldKey) => {
    const fields: {
      key: FieldKey;
      ref: React.RefObject<HTMLInputElement | HTMLButtonElement | null>;
      value: string | undefined;
    }[] = [
      {
        key: "repName",
        ref: repNameRef,
        value: businessData.owner || extracted.representativeName,
      },
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

  const [addressPromptActive, setAddressPromptActive] = useState(false);

  const handleOpenAddressSearch = async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    try {
      if (!window.daum?.Postcode) {
        await loadPostcodeScript();
      }
      setAddressPromptActive(true);
    } catch {
      if (!silent) {
        toast({
          title: "주소 검색을 불러오지 못했습니다",
          description: "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
      }
    }
  };

  useEffect(() => {
    void loadPostcodeScript().catch(() => {
      toast({
        title: "주소 검색 스크립트를 불러오지 못했습니다",
        description: "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    });
  }, []);

  useEffect(() => {
    if (!autoOpenAddressSearchSignal) return;
    requestAnimationFrame(() => {
      void handleOpenAddressSearch({ silent: true });
    });
  }, [autoOpenAddressSearchSignal, toast]);

  useEffect(() => {
    if (!addressPromptActive) return;
    if (!window.daum?.Postcode) return;
    const container = postcodeContainerRef.current;
    if (!container) return;

    container.innerHTML = "";
    const postcode = new window.daum.Postcode({
      oncomplete: (data) => {
        const nextAddress =
          data.roadAddress || data.jibunAddress || data.address || "";
        const nextZipCode = String(data.zonecode || "").trim();
        setBusinessData((prev) => ({
          ...prev,
          address: nextAddress || prev.address,
          addressDetail: prev.addressDetail,
          zipCode: nextZipCode || prev.zipCode,
        }));
        setErrors((prev) => ({
          ...prev,
          address: false,
          zipCode: false,
        }));
        setAddressPromptActive(false);
        requestAnimationFrame(() => {
          addressDetailRef.current?.focus();
        });
      },
      onclose: () => {
        setAddressPromptActive(false);
      },
    }) as { embed?: (element: HTMLElement) => void };

    if (!postcode.embed) return;
    postcode.embed(container);

    return () => {
      container.innerHTML = "";
    };
  }, [addressPromptActive, setBusinessData, setErrors]);

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
                value={businessData.owner || extracted.representativeName || ""}
                onChange={(e) => {
                  setBusinessData((prev) => ({
                    ...prev,
                    owner: e.target.value,
                  }));
                  setExtracted((prev) => ({
                    ...prev,
                    representativeName: e.target.value,
                  }));
                  setErrors((prev) => ({ ...prev, repName: false }));
                  setIsModified(true);
                }}
                onKeyDown={(e) => {
                  if ((e.nativeEvent as any)?.isComposing) return;
                  const v = String(
                    businessData.owner || extracted.representativeName || "",
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
                setIsModified(true);
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
                  setIsModified(true);
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
                  setIsModified(true);
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
                value={extracted.email || ""}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setExtracted((prev) => ({
                    ...prev,
                    email: e.target.value,
                  }));
                  const invalid = !isValidEmail(e.target.value);
                  setErrors((prev) => ({ ...prev, email: invalid }));
                  setIsModified(true);
                }}
                onKeyDown={(e) => {
                  if ((e.nativeEvent as any)?.isComposing) return;
                  const v = String(extracted.email || "").trim();
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

        <div className="space-y-2">
          <Label htmlFor="address">주소</Label>
          <div className="relative rounded-xl p-1">
            {addressPromptActive && (
              <div className="mb-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                  <div className="text-xs font-medium text-slate-600">
                    주소 검색
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setAddressPromptActive(false)}
                  >
                    닫기
                  </Button>
                </div>
                <div
                  ref={postcodeContainerRef}
                  className="min-h-[420px] w-full bg-white"
                />
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-1">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={disabled}
                  onClick={() => {
                    void handleOpenAddressSearch();
                  }}
                >
                  주소 검색
                </Button>
              </div>
              <div className="md:col-span-1">
                <Input
                  id="address"
                  ref={addressRef}
                  className={cn(
                    errors.address &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                  value={businessData.address}
                  placeholder="주소1 (정규화된 도로명 주소)"
                  onChange={(e) => {
                    setBusinessData((prev) => ({
                      ...prev,
                      address: e.target.value,
                    }));
                    setErrors((prev) => ({ ...prev, address: false }));
                    setIsModified(true);
                  }}
                  onKeyDown={(e) => {
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
                  onBlur={() => {
                    if (disabled) return;
                    onAutoSave?.();
                  }}
                />
              </div>
              <div className="md:col-span-1">
                <Input
                  id="addressDetail"
                  ref={addressDetailRef}
                  value={businessData.addressDetail}
                  placeholder="주소2 (동, 호수 등 상세주소)"
                  onChange={(e) => {
                    setBusinessData((prev) => ({
                      ...prev,
                      addressDetail: e.target.value,
                    }));
                    setIsModified(true);
                  }}
                  onKeyDown={(e) => {
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
                  onBlur={() => {
                    if (disabled) return;
                    onAutoSave?.();
                  }}
                />
              </div>
              <div className="md:col-span-1">
                <Input
                  id="zipCode"
                  ref={zipCodeRef}
                  className={cn(
                    errors.zipCode &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                  value={businessData.zipCode}
                  placeholder="우편번호"
                  onChange={(e) => {
                    setBusinessData((prev) => ({
                      ...prev,
                      zipCode: e.target.value,
                    }));
                    setErrors((prev) => ({ ...prev, zipCode: false }));
                    setIsModified(true);
                  }}
                  onKeyDown={(e) => {
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
                  onBlur={() => {
                    if (disabled) return;
                    onAutoSave?.();
                  }}
                />
              </div>
            </div>
          </div>
        </div>
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
                  (!isModified && (validationSucceeded || isVerified))
                }
                ref={submitRef}
                className={actionsNode ? "w-full" : undefined}
                onClick={() => {
                  onSave();
                  setIsModified(false);
                }}
              >
                검증 후 제출
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
            <p className="text-center text-xs font-semibold text-sky-600 flex justify-end mt-2">
              {successNote}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
