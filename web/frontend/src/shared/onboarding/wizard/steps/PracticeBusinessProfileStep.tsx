// related files:
// - web/frontend/rules.md
// - web/frontend/src/shared/onboarding/wizard/steps/BusinessStep.tsx
// - web/frontend/src/pages/practice/PracticeSettingsPage.tsx
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/shared/components/business/settings/business/BusinessAddressFields.tsx
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BusinessAddressFields } from "@/shared/components/business/settings/business/BusinessAddressFields";
import {
  formatPhoneNumberInput,
  isValidMobilePhone,
  isValidPhoneNumber,
} from "@/shared/components/business/settings/business/validations";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/shared/ui/cn";

type PracticeForm = {
  clinicName: string;
  directorName: string;
  staffName: string;
  phone: string;
  clinicPhone: string;
  address: string;
  addressDetail: string;
  zipCode: string;
};

type PracticeField = keyof PracticeForm;

interface PracticeBusinessProfileStepProps {
  registerGoNextAction?: (action: (() => Promise<boolean>) | null) => void;
  registerBusyState?: (busy: boolean) => void;
  registerValidationState?: (state: {
    passed: boolean;
    validating: boolean;
  }) => void;
}

const emptyForm = (): PracticeForm => ({
  clinicName: "",
  directorName: "",
  staffName: "",
  phone: "",
  clinicPhone: "",
  address: "",
  addressDetail: "",
  zipCode: "",
});

/** E.164(+82) / 82 시작 번호를 국내 0 시작으로 맞춘 뒤 표시 포맷 */
const toDisplayPhone = (value: string) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  const domestic =
    digits.startsWith("82") && digits.length >= 10
      ? `0${digits.slice(2)}`
      : digits;
  return formatPhoneNumberInput(domestic);
};

/**
 * 담당직원명 초기값.
 * practice_dropzone 가입은 계정 name을 메일 local-part로 임시 저장하므로,
 * practiceProfile.staffName이 없으면 빈 값으로 두고 실제 이름을 입력받는다.
 */
const resolveStaffNamePrefill = ({
  profileStaffName,
  accountName,
  email,
  signupChannel,
}: {
  profileStaffName?: string | null;
  accountName?: string | null;
  email?: string | null;
  signupChannel?: string | null;
}) => {
  const fromProfile = String(profileStaffName || "").trim();
  if (fromProfile) return fromProfile;

  if (String(signupChannel || "").trim() === "practice_dropzone") {
    return "";
  }

  const fromAccount = String(accountName || "").trim();
  if (!fromAccount) return "";

  const emailLocal = String(email || "")
    .split("@")[0]
    ?.trim()
    .toLowerCase();
  if (emailLocal && fromAccount.toLowerCase() === emailLocal) {
    return "";
  }

  return fromAccount;
};

const isFormComplete = (form: PracticeForm) => {
  const clinicName = form.clinicName.trim();
  const directorName = form.directorName.trim();
  const staffName = form.staffName.trim();
  const phone = form.phone.trim();
  const clinicPhone = form.clinicPhone.trim();
  const address = form.address.trim();
  const zipCode = form.zipCode.trim();
  return Boolean(
    clinicName &&
      directorName &&
      staffName &&
      phone &&
      isValidMobilePhone(phone) &&
      clinicPhone &&
      isValidPhoneNumber(clinicPhone) &&
      address &&
      zipCode,
  );
};

export const PracticeBusinessProfileStep = ({
  registerGoNextAction,
  registerBusyState,
  registerValidationState,
}: PracticeBusinessProfileStepProps) => {
  const { token, user, setUser } = useAuthStore();
  const { toast } = useToast();
  const [form, setForm] = useState<PracticeForm>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<PracticeField, string>>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const profile = user?.practiceProfile;
        let phoneFromProfile = String(profile?.phone || "").trim();
        let staffName = resolveStaffNamePrefill({
          profileStaffName: profile?.staffName,
          accountName: user?.name,
          email: user?.email,
          signupChannel: user?.signupChannel,
        });
        let directorName = String(profile?.directorName || "").trim();
        let clinicName = String(
          profile?.clinicName || user?.companyName || "",
        ).trim();
        let clinicPhone = String(profile?.clinicPhone || "").trim();
        let address = String(profile?.address || "").trim();
        let addressDetail = String(profile?.addressDetail || "").trim();
        let zipCode = String(profile?.zipCode || "").trim();

        if (token) {
          const res = await request<{
            data?: {
              phoneNumber?: string;
              name?: string;
              email?: string;
              business?: string;
              signupChannel?: string;
              practiceProfile?: Record<string, unknown>;
            };
          }>({
            path: "/api/users/profile",
            method: "GET",
            token,
          });
          if (res.ok && !cancelled) {
            const data = (res.data as any)?.data || res.data || {};
            const pp =
              data.practiceProfile && typeof data.practiceProfile === "object"
                ? data.practiceProfile
                : {};
            phoneFromProfile =
              String(pp.phone || data.phoneNumber || phoneFromProfile).trim();
            staffName = resolveStaffNamePrefill({
              profileStaffName: pp.staffName
                ? String(pp.staffName)
                : profile?.staffName,
              accountName: data.name || user?.name,
              email: data.email || user?.email,
              signupChannel: data.signupChannel || user?.signupChannel,
            });
            directorName = String(pp.directorName || directorName).trim();
            clinicName = String(
              pp.clinicName || data.business || clinicName,
            ).trim();
            clinicPhone = String(pp.clinicPhone || clinicPhone).trim();
            address = String(pp.address || address).trim();
            addressDetail = String(pp.addressDetail || addressDetail).trim();
            zipCode = String(pp.zipCode || zipCode).trim();
          }
        }

        if (!cancelled) {
          setForm({
            clinicName,
            directorName,
            staffName,
            phone: toDisplayPhone(phoneFromProfile),
            clinicPhone: toDisplayPhone(clinicPhone),
            address,
            addressDetail,
            zipCode,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  const passed = useMemo(() => isFormComplete(form), [form]);

  useEffect(() => {
    registerValidationState?.({ passed, validating: false });
  }, [passed, registerValidationState]);

  useEffect(() => {
    registerBusyState?.(loading || saving);
  }, [loading, registerBusyState, saving]);

  const setField = useCallback((field: PracticeField, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const validate = useCallback(() => {
    const nextErrors: Partial<Record<PracticeField, string>> = {};
    if (!form.clinicName.trim()) nextErrors.clinicName = "필수";
    if (!form.directorName.trim()) nextErrors.directorName = "필수";
    if (!form.staffName.trim()) nextErrors.staffName = "필수";
    if (!form.phone.trim()) nextErrors.phone = "필수";
    else if (!isValidMobilePhone(form.phone))
      nextErrors.phone = "휴대폰 형식을 확인해주세요";
    if (!form.clinicPhone.trim()) nextErrors.clinicPhone = "필수";
    else if (!isValidPhoneNumber(form.clinicPhone))
      nextErrors.clinicPhone = "전화번호 형식을 확인해주세요";
    if (!form.address.trim()) nextErrors.address = "필수";
    if (!form.zipCode.trim()) nextErrors.zipCode = "필수";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [form]);

  const save = useCallback(async () => {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
      });
      return false;
    }
    if (!validate()) {
      toast({
        title: "필수값을 확인해주세요",
        description:
          "치과명, 대표원장님 성함, 담당직원명, 치과 전화, 담당자 휴대폰, 주소, 우편번호는 필수입니다.",
        variant: "destructive",
      });
      return false;
    }

    setSaving(true);
    try {
      const clinicName = form.clinicName.trim();
      const directorName = form.directorName.trim();
      const staffName = form.staffName.trim();
      const phone = form.phone.trim();
      const clinicPhone = form.clinicPhone.trim();
      const address = form.address.trim();
      const addressDetail = form.addressDetail.trim();
      const zipCode = form.zipCode.trim();

      const res = await request<{
        data?: Record<string, unknown>;
        message?: string;
      }>({
        path: "/api/users/profile",
        method: "PUT",
        token,
        jsonBody: {
          name: staffName,
          business: clinicName,
          phoneNumber: phone,
          practiceProfile: {
            clinicName,
            directorName,
            staffName,
            phone,
            clinicPhone,
            address,
            addressDetail,
            zipCode,
            updatedAt: new Date().toISOString(),
          },
        },
      });

      if (!res.ok) {
        const body = (res.data as any) || {};
        throw new Error(body?.message || "치과 정보 저장에 실패했습니다.");
      }

      const updated = ((res.data as any)?.data || res.data || {}) as Record<
        string,
        unknown
      >;
      const updatedProfile =
        updated.practiceProfile && typeof updated.practiceProfile === "object"
          ? (updated.practiceProfile as Record<string, unknown>)
          : null;

      if (user) {
        setUser({
          ...user,
          name: String(updated.name || staffName),
          companyName: String(updated.business || clinicName),
          businessAnchorId: updated.businessAnchorId
            ? String(updated.businessAnchorId)
            : user.businessAnchorId,
          practiceProfile: {
            clinicName: String(updatedProfile?.clinicName || clinicName),
            directorName: String(updatedProfile?.directorName || directorName),
            staffName: String(updatedProfile?.staffName || staffName),
            phone: String(updatedProfile?.phone || phone),
            clinicPhone: String(updatedProfile?.clinicPhone || clinicPhone),
            address: String(updatedProfile?.address || address),
            addressDetail: String(
              updatedProfile?.addressDetail || addressDetail,
            ),
            zipCode: String(updatedProfile?.zipCode || zipCode),
            updatedAt: String(
              updatedProfile?.updatedAt || new Date().toISOString(),
            ),
          },
        });
      }

      return true;
    } catch (error) {
      toast({
        title: "저장 실패",
        description:
          error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [form, setUser, toast, token, user, validate]);

  useEffect(() => {
    registerGoNextAction?.(save);
    return () => registerGoNextAction?.(null);
  }, [registerGoNextAction, save]);

  if (loading) {
    return (
      <p className="text-sm text-slate-500">치과 정보를 불러오는 중...</p>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-slate-500">
        기공의뢰서 이용을 위해 주소·전화번호·담당자명 등 기본 정보를 입력해주세요.
      </p>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-2.5">
          <Label htmlFor="practice-clinic-name">
            치과명 <span className="text-destructive">*</span>
            {errors.clinicName ? (
              <span className="ml-2 text-xs text-destructive">
                {errors.clinicName}
              </span>
            ) : null}
          </Label>
          <Input
            id="practice-clinic-name"
            value={form.clinicName}
            onChange={(e) => setField("clinicName", e.target.value)}
            placeholder="예: OO치과의원"
            className={errors.clinicName ? "border-destructive" : ""}
          />
        </div>

        <div className="space-y-2.5">
          <Label htmlFor="practice-director-name">
            대표원장님 성함 <span className="text-destructive">*</span>
            {errors.directorName ? (
              <span className="ml-2 text-xs text-destructive">
                {errors.directorName}
              </span>
            ) : null}
          </Label>
          <Input
            id="practice-director-name"
            value={form.directorName}
            onChange={(e) => setField("directorName", e.target.value)}
            placeholder="예: 김원장"
            className={errors.directorName ? "border-destructive" : ""}
          />
        </div>

        <div className="space-y-2.5">
          <Label htmlFor="practice-clinic-phone">
            치과 전화번호 <span className="text-destructive">*</span>
            {errors.clinicPhone ? (
              <span className="ml-2 text-xs text-destructive">
                {errors.clinicPhone}
              </span>
            ) : null}
          </Label>
          <Input
            id="practice-clinic-phone"
            value={form.clinicPhone}
            onChange={(e) =>
              setField("clinicPhone", formatPhoneNumberInput(e.target.value))
            }
            placeholder="예: 02-123-4567"
            className={errors.clinicPhone ? "border-destructive" : ""}
          />
        </div>

        <div className="space-y-2.5">
          <Label htmlFor="practice-staff-name">
            담당직원명 <span className="text-destructive">*</span>
            {errors.staffName ? (
              <span className="ml-2 text-xs text-destructive">
                {errors.staffName}
              </span>
            ) : null}
          </Label>
          <Input
            id="practice-staff-name"
            value={form.staffName}
            onChange={(e) => setField("staffName", e.target.value)}
            placeholder="예: 김담당"
            className={errors.staffName ? "border-destructive" : ""}
          />
        </div>

        <div className="space-y-2.5">
          <Label htmlFor="practice-staff-phone">
            담당자 휴대폰 <span className="text-destructive">*</span>
            {errors.phone ? (
              <span className="ml-2 text-xs text-destructive">{errors.phone}</span>
            ) : null}
          </Label>
          <div className="relative">
            <Input
              id="practice-staff-phone"
              value={form.phone}
              disabled
              readOnly
              placeholder="예: 010-1234-5678"
              className={cn(
                "pr-20 bg-slate-50 text-slate-600",
                errors.phone ? "border-destructive" : "",
              )}
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 text-xs font-medium text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              인증됨
            </span>
          </div>
        </div>
      </div>

      <BusinessAddressFields
        address={form.address}
        addressDetail={form.addressDetail}
        zipCode={form.zipCode}
        onChangeAddress={(next) => setField("address", next)}
        onChangeAddressDetail={(next) => setField("addressDetail", next)}
        onChangeZipCode={(next) => setField("zipCode", next)}
        addressLabel={errors.address ? "치과 주소 * (필수)" : "치과 주소 *"}
        addressError={Boolean(errors.address)}
        zipCodeError={Boolean(errors.zipCode)}
        openMode="popup"
      />
    </div>
  );
};
