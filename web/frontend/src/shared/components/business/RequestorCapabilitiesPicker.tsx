// related files:
// - web/frontend/src/shared/business/requestorCapabilities.ts
// - web/frontend/src/shared/components/business/settings/BusinessTab.tsx
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
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
  /** 기공소 선택 시 미검증이면 안내 */
  labRequiresLicenseHint?: boolean;
};

export const RequestorCapabilitiesPicker = ({
  value,
  onChange,
  disabled = false,
  className,
  labRequiresLicenseHint = false,
}: Props) => {
  const caps = normalizeRequestorCapabilities(value);

  const toggle = (key: keyof RequestorCapabilities, checked: boolean) => {
    onChange(
      normalizeRequestorCapabilities({
        ...caps,
        [key]: checked,
      }),
    );
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div>
        <p className="text-sm font-medium text-slate-900">사업자 유형</p>
        <p className="mt-1 text-xs text-slate-500">
          해당하는 항목을 모두 선택하세요. 유료 서비스는 사업자등록증 검증 후
          이용할 수 있습니다.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {REQUESTOR_CAPABILITY_OPTIONS.map((opt) => {
          const checked = caps[opt.key];
          const id = `requestor-cap-${opt.key}`;
          return (
            <label
              key={opt.key}
              htmlFor={id}
              className={cn(
                "flex h-full cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-colors",
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
                onCheckedChange={(v) => toggle(opt.key, v === true)}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <Label
                  htmlFor={id}
                  className="cursor-pointer text-sm font-medium text-slate-900"
                >
                  {opt.label}
                </Label>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                  {opt.description}
                </p>
              </div>
            </label>
          );
        })}
      </div>
      {labRequiresLicenseHint && caps.lab && (
        <p className="text-xs text-amber-700">
          기공소 혹은 원내 기공실을 선택한 경우 사업자등록증을 등록·검증해야
          합니다.
        </p>
      )}
      {!caps.practice && !caps.lab && (
        <p className="text-xs text-destructive">
          원내 기공실 없는 치과 또는 기공소 혹은 원내 기공실 중 하나 이상
          선택해주세요.
        </p>
      )}
    </div>
  );
};
