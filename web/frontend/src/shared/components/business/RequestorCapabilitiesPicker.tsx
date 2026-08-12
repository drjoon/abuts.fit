// related files:
// - web/frontend/src/shared/business/requestorCapabilities.ts
// - web/frontend/src/shared/components/business/settings/BusinessTab.tsx
import { Label } from "@/components/ui/label";
import {
  REQUESTOR_KIND_LABEL,
  REQUESTOR_KIND_OPTIONS,
  type RequestorKind,
  type RequestorProfile,
  type RequestorServices,
  hasAnyRequestorService,
  normalizeRequestorKind,
  normalizeRequestorServices,
} from "@/shared/business/requestorCapabilities";
import { cn } from "@/shared/ui/cn";

const DEFAULT_SERVICES: RequestorServices = { free: true, paid: false };

type Props = {
  value: RequestorProfile;
  onChange: (next: RequestorProfile) => void;
  disabled?: boolean;
  className?: string;
  /** 드롭존 최소 가입자 등: practice + free 고정 */
  forcePracticeOnly?: boolean;
};

export const RequestorCapabilitiesPicker = ({
  value,
  onChange,
  disabled = false,
  className,
  forcePracticeOnly = false,
}: Props) => {
  const kind: RequestorKind | null = forcePracticeOnly
    ? "practice"
    : normalizeRequestorKind(value.kind);
  const services: RequestorServices = (() => {
    const normalized = normalizeRequestorServices(value.services);
    return hasAnyRequestorService(normalized)
      ? normalized
      : DEFAULT_SERVICES;
  })();

  const setKind = (nextKind: RequestorKind) => {
    if (forcePracticeOnly) return;
    onChange({
      kind: nextKind,
      services,
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
                  "flex h-full cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3.5 transition-all shadow-sm",
                  checked
                    ? "border-primary-muted/70 bg-primary-soft/35"
                    : "border-slate-200/80 bg-white/70 hover:border-primary-muted/50 hover:bg-primary-soft/10",
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
    </div>
  );
};
