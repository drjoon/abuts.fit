// related files:
// - web/frontend/src/shared/business/requestorCapabilities.ts
// - web/frontend/src/shared/components/business/settings/BusinessTab.tsx
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  REQUESTOR_CAPABILITY_LABEL,
  REQUESTOR_CAPABILITY_OPTIONS,
  type RequestorCapabilities,
  normalizeRequestorCapabilities,
} from "@/shared/business/requestorCapabilities";
import { cn } from "@/shared/ui/cn";

type Props = {
  value: RequestorCapabilities;
  onChange: (next: RequestorCapabilities) => void;
  disabled?: boolean;
  className?: string;
  /** 수신자(lab) 선택 시 미검증이면 안내 */
  labRequiresLicenseHint?: boolean;
  /** 드롭존 최소 가입자 등: practice 고정, lab 선택 불가 */
  forcePracticeOnly?: boolean;
};

export const RequestorCapabilitiesPicker = ({
  value,
  onChange,
  disabled = false,
  className,
  labRequiresLicenseHint = false,
  forcePracticeOnly = false,
}: Props) => {
  const caps = forcePracticeOnly
    ? { practice: true, lab: false }
    : normalizeRequestorCapabilities(value);

  const toggle = (key: keyof RequestorCapabilities, checked: boolean) => {
    if (forcePracticeOnly) return;
    onChange(
      normalizeRequestorCapabilities({
        ...caps,
        [key]: checked,
      }),
    );
  };

  return (
    <div className={cn("space-y-4", className)}>
      <p className="text-xs leading-relaxed text-slate-500">
        {forcePracticeOnly
          ? "드롭존으로 가입한 계정은 의뢰 발신자(치과)로 고정됩니다. 수신(lab)은 나중에 설정에서 추가할 수 있습니다."
          : "해당하는 항목을 모두 선택하세요."}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {REQUESTOR_CAPABILITY_OPTIONS.map((opt) => {
          const checked = caps[opt.key];
          const id = `requestor-cap-${opt.key}`;
          const optionLocked =
            forcePracticeOnly && (opt.key === "practice" || opt.key === "lab");
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
              <Checkbox
                id={id}
                checked={checked}
                disabled={disabled || optionLocked}
                onCheckedChange={(v) => toggle(opt.key, v === true)}
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
      {labRequiresLicenseHint && caps.lab && (
        <p className="text-xs text-amber-700">
          {REQUESTOR_CAPABILITY_LABEL.lab}을 선택한 경우 사업자등록증을
          등록·검증해야 합니다.
        </p>
      )}
      {!caps.practice && !caps.lab && (
        <p className="text-xs text-destructive">
          {REQUESTOR_CAPABILITY_LABEL.practice} 또는{" "}
          {REQUESTOR_CAPABILITY_LABEL.lab} 중 하나 이상 선택해주세요.
        </p>
      )}
    </div>
  );
};
