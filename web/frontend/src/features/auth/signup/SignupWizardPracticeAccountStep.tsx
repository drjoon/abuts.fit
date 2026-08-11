// related files:
// - web/frontend/rules.md
// - web/frontend/src/features/auth/SignupPage.tsx
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/shared/components/business/settings/business/BusinessAddressFields.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";
import { BusinessAddressFields } from "@/shared/components/business/settings/business/BusinessAddressFields";

export type PracticeSignupFormData = {
  clinicName: string;
  staffName: string;
  phone: string;
  address: string;
  addressDetail: string;
  zipCode: string;
  password: string;
};

type PracticeSignupField = keyof PracticeSignupFormData;

interface SignupWizardPracticeAccountStepProps {
  formData: PracticeSignupFormData;
  errors?: Partial<Record<PracticeSignupField, string>>;
  focusField?: PracticeSignupField | null;
  isLoading: boolean;
  onChangeField: (field: PracticeSignupField, value: string) => void;
  onPrevious: () => void;
  onSubmit: () => void;
}

export const SignupWizardPracticeAccountStep = ({
  formData,
  errors,
  focusField,
  isLoading,
  onChangeField,
  onPrevious,
  onSubmit,
}: SignupWizardPracticeAccountStepProps) => {
  const [showPassword, setShowPassword] = useState(false);

  const clinicNameRef = useRef<HTMLInputElement | null>(null);
  const staffNameRef = useRef<HTMLInputElement | null>(null);
  const phoneRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const addressRef = useRef<HTMLInputElement | null>(null);
  const addressDetailRef = useRef<HTMLInputElement | null>(null);
  const zipCodeRef = useRef<HTMLInputElement | null>(null);

  const activeErrorField = useMemo(() => focusField || null, [focusField]);

  useEffect(() => {
    if (!activeErrorField) return;
    const target =
      activeErrorField === "clinicName"
        ? clinicNameRef.current
        : activeErrorField === "staffName"
          ? staffNameRef.current
          : activeErrorField === "phone"
            ? phoneRef.current
            : activeErrorField === "password"
              ? passwordRef.current
              : activeErrorField === "address"
                ? addressRef.current
                : activeErrorField === "addressDetail"
                  ? addressDetailRef.current
                  : zipCodeRef.current;
    target?.focus();
  }, [activeErrorField]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isLoading) onSubmit();
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="clinicName" className="text-sm font-medium text-white/80">
            치과명
            {errors?.clinicName && (
              <span className="ml-2 text-xs font-medium text-destructive-muted">
                {errors.clinicName}
              </span>
            )}
          </Label>
          <Input
            id="clinicName"
            type="text"
            placeholder="예: 압구정 스마트치과"
            value={formData.clinicName}
            onChange={(e) => onChangeField("clinicName", e.target.value)}
            ref={clinicNameRef}
            disabled={isLoading}
            className={`h-10 border-white/10 bg-white/5 text-white placeholder:text-white/40 ${errors?.clinicName ? "border-destructive/80" : ""}`}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="staffName" className="text-sm font-medium text-white/80">
            담당자명
            {errors?.staffName && (
              <span className="ml-2 text-xs font-medium text-destructive-muted">
                {errors.staffName}
              </span>
            )}
          </Label>
          <Input
            id="staffName"
            type="text"
            placeholder="예: 홍길동"
            value={formData.staffName}
            onChange={(e) => onChangeField("staffName", e.target.value)}
            ref={staffNameRef}
            disabled={isLoading}
            className={`h-10 border-white/10 bg-white/5 text-white placeholder:text-white/40 ${errors?.staffName ? "border-destructive/80" : ""}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone" className="text-sm font-medium text-white/80">
            전화번호
            {errors?.phone && (
              <span className="ml-2 text-xs font-medium text-destructive-muted">{errors.phone}</span>
            )}
          </Label>
          <Input
            id="phone"
            type="tel"
            placeholder="예: 010-1234-5678"
            value={formData.phone}
            onChange={(e) => onChangeField("phone", e.target.value)}
            ref={phoneRef}
            disabled={isLoading}
            className={`h-10 border-white/10 bg-white/5 text-white placeholder:text-white/40 ${errors?.phone ? "border-destructive/80" : ""}`}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="practicePassword" className="text-sm font-medium text-white/80">
            접속 비밀번호
            {errors?.password && (
              <span className="ml-2 text-xs font-medium text-destructive-muted">
                {errors.password}
              </span>
            )}
          </Label>
          <div className="relative">
            <Input
              id="practicePassword"
              type={showPassword ? "text" : "password"}
              placeholder="10자 이상, 특수문자 포함"
              value={formData.password}
              onChange={(e) => onChangeField("password", e.target.value)}
              ref={passwordRef}
              disabled={isLoading}
              autoComplete="new-password"
              className={`h-10 border-white/10 bg-white/5 pr-10 text-white placeholder:text-white/40 ${errors?.password ? "border-destructive/80" : ""}`}
            />
            <button
              type="button"
              aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
              onClick={() => setShowPassword((prev) => !prev)}
              disabled={isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-white/60 hover:text-white disabled:opacity-40"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      <BusinessAddressFields
        address={formData.address}
        addressDetail={formData.addressDetail}
        zipCode={formData.zipCode}
        onChangeAddress={(next) => onChangeField("address", next)}
        onChangeAddressDetail={(next) => onChangeField("addressDetail", next)}
        onChangeZipCode={(next) => onChangeField("zipCode", next)}
        addressInputRef={addressRef}
        addressDetailInputRef={addressDetailRef}
        zipCodeInputRef={zipCodeRef}
        addressError={Boolean(errors?.address)}
        zipCodeError={Boolean(errors?.zipCode)}
        inputClassName="border-white/10 bg-white/5 text-white placeholder:text-white/40"
        disabled={isLoading}
        openMode="popup"
      />

      <div className="grid grid-cols-2 gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          disabled={isLoading}
          onClick={onPrevious}
          className="h-11 border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
        >
          이전
        </Button>
        <Button type="submit" variant="hero" disabled={isLoading} className="h-11">
          {isLoading ? "가입 중..." : "가입하기"}
        </Button>
      </div>
    </form>
  );
};
