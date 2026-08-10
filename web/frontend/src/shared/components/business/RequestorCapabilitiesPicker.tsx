// related files:
// - web/frontend/src/shared/business/requestorCapabilities.ts
// - web/frontend/src/shared/components/business/settings/BusinessTab.tsx
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  REQUESTOR_KIND_LABEL,
  REQUESTOR_KIND_OPTIONS,
  REQUESTOR_SERVICE_LABEL,
  REQUESTOR_SERVICE_OPTIONS,
  type RequestorKind,
  type RequestorProfile,
  type RequestorServices,
  hasAnyRequestorService,
  normalizeRequestorKind,
  normalizeRequestorServices,
} from "@/shared/business/requestorCapabilities";
import { cn } from "@/shared/ui/cn";

const FREE_ONLY_SERVICES: RequestorServices = { free: true, paid: false };

type Props = {
  value: RequestorProfile;
  onChange: (next: RequestorProfile) => void;
  disabled?: boolean;
  className?: string;
  /** 생산의뢰(유료) 선택 시 미검증이면 안내 */
  paidRequiresLicenseHint?: boolean;
  /** @deprecated paidRequiresLicenseHint 사용 */
  labRequiresLicenseHint?: boolean;
  /** 드롭존 최소 가입자 등: practice + free 고정 */
  forcePracticeOnly?: boolean;
  /**
   * 가입/온보딩: 이용 서비스 UI 숨김, 기공의뢰서(무료) 고정.
   * 유료는 이후 사업자등록증 검증으로 연다.
   */
  forceFreeServices?: boolean;
};

export const RequestorCapabilitiesPicker = ({
  value,
  onChange,
  disabled = false,
  className,
  paidRequiresLicenseHint,
  labRequiresLicenseHint = false,
  forcePracticeOnly = false,
  forceFreeServices = false,
}: Props) => {
  const showPaidHint = paidRequiresLicenseHint ?? labRequiresLicenseHint;
  const lockServices = forcePracticeOnly || forceFreeServices;
  const kind: RequestorKind | null = forcePracticeOnly
    ? "practice"
    : normalizeRequestorKind(value.kind);
  const services: RequestorServices = lockServices
    ? FREE_ONLY_SERVICES
    : normalizeRequestorServices(value.services);

  const setKind = (nextKind: RequestorKind) => {
    if (forcePracticeOnly) return;
    onChange({
      kind: nextKind,
      services: lockServices ? FREE_ONLY_SERVICES : services,
    });
  };

  const toggleService = (key: keyof RequestorServices, checked: boolean) => {
    if (lockServices) return;
    onChange({
      kind,
      services: normalizeRequestorServices({
        ...services,
        [key]: checked,
      }),
    });
  };

  return (
    <div className={cn("space-y-6", className)}>
      <div className="space-y-3">
        {forcePracticeOnly ? (
          <p className="text-xs leading-relaxed text-slate-500">
            드롭존으로 가입한 계정은 치과(기공실)로 고정됩니다.
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {REQUESTOR_KIND_OPTIONS.map((opt) => {
            const checked = kind === opt.key;
            const id = `requestor-kind-${opt.key}`;
            const optionLocked = forcePracticeOnly;
            return (
              <label
                key={opt.key}
                htmlFor={id}
                className={cn(
                  "flex h-full cursor-pointer items-start gap-3 rounded-xl border px-5 py-3 transition-colors",
                  checked
                    ? "border-primary/40 bg-primary/5"
                    : "border-slate-200 bg-white hover:bg-slate-50",
                  (disabled || optionLocked) && "cursor-not-allowed opacity-60",
                )}
              >
                <input
                  id={id}
                  type="radio"
                  name="requestor-kind"
                  className="mt-1"
                  checked={checked}
                  disabled={disabled || optionLocked}
                  onChange={() => setKind(opt.key)}
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label
                    htmlFor={id}
                    className="cursor-pointer text-sm font-medium text-slate-900"
                  >
                    {opt.label}
                  </Label>
                  <p className="whitespace-pre-line text-xs leading-relaxed text-slate-500">
                    {opt.description}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
        {!kind && (
          <p className="text-xs text-destructive">
            {REQUESTOR_KIND_LABEL.practice} 또는 {REQUESTOR_KIND_LABEL.lab} 중
            하나를 선택해주세요.
          </p>
        )}
      </div>

      {!lockServices ? (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-slate-500">
            이용할 서비스를 선택하세요. 생산의뢰(유료)는 사업자등록증 검증이
            필요합니다.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {REQUESTOR_SERVICE_OPTIONS.map((opt) => {
              const checked = services[opt.key];
              const id = `requestor-service-${opt.key}`;
              return (
                <label
                  key={opt.key}
                  htmlFor={id}
                  className={cn(
                    "flex h-full cursor-pointer items-start gap-3 rounded-xl border px-5 py-3 transition-colors",
                    checked
                      ? "border-primary/40 bg-primary/5"
                      : "border-slate-200 bg-white hover:bg-slate-50",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <Checkbox
                    id={id}
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={(v) => toggleService(opt.key, v === true)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Label
                      htmlFor={id}
                      className="cursor-pointer text-sm font-medium text-slate-900"
                    >
                      {opt.label}
                    </Label>
                    <p className="whitespace-pre-line text-xs leading-relaxed text-slate-500">
                      {opt.description}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
          {!hasAnyRequestorService(services) && (
            <p className="text-xs text-destructive">
              {REQUESTOR_SERVICE_LABEL.free} 또는 {REQUESTOR_SERVICE_LABEL.paid}{" "}
              중 하나 이상 선택해주세요.
            </p>
          )}
        </div>
      ) : null}

      {showPaidHint && services.paid && (
        <p className="text-xs text-amber-700">
          {REQUESTOR_SERVICE_LABEL.paid}를 선택한 경우 사업자등록증을
          등록·검증해야 합니다.
        </p>
      )}
    </div>
  );
};
