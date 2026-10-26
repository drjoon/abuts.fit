// related files:
// - web/frontend/src/shared/business/requestorCapabilities.ts
// - web/frontend/src/shared/components/business/settings/BusinessTab.tsx
import { Building2, Check, FlaskConical, Microscope } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  PRACTICE_IN_HOUSE_LAB_LABEL,
  REQUESTOR_KIND_LABEL,
  type RequestorProfile,
  PAID_ONLY_SERVICES,
  type RequestorServices,
  hasAnyRequestorService,
  normalizeRequestorKind,
  normalizeRequestorServices,
} from "@/shared/business/requestorCapabilities";
import { cn } from "@/shared/ui/cn";

type Props = {
  value: RequestorProfile;
  onChange: (next: RequestorProfile) => void;
  disabled?: boolean;
  className?: string;
  /** 드롭존 최소 가입자 등: practice 고정 */
  forcePracticeOnly?: boolean;
  /** 이미 정해진 역할이면 그 역할의 카드만 보인다(치과=2장, 기공소=1장). */
  restrictToKind?: boolean;
  /** 가입 정보 옆 칸. 선택지를 세로로 쌓아 칸 높이를 채운다. */
  stackChoices?: boolean;
};

type ChoiceKey = "without" | "with" | "lab";

type Choice = {
  key: ChoiceKey;
  label: string;
  description: string;
  icon: LucideIcon;
};

const CHOICES: readonly Choice[] = [
  {
    key: "without",
    label: PRACTICE_IN_HOUSE_LAB_LABEL.without,
    description: "보철을 기공소에 의뢰합니다.",
    icon: Building2,
  },
  {
    key: "with",
    label: PRACTICE_IN_HOUSE_LAB_LABEL.with,
    description: "어벗 생산은 커스텀어벗 의뢰하기에서 합니다.",
    icon: Microscope,
  },
  {
    key: "lab",
    label: REQUESTOR_KIND_LABEL.lab,
    description: "치과 의뢰를 받아 작업합니다.",
    icon: FlaskConical,
  },
];

export const RequestorCapabilitiesPicker = ({
  value,
  onChange,
  disabled = false,
  className,
  forcePracticeOnly = false,
  restrictToKind = false,
  stackChoices = false,
}: Props) => {
  const kind = normalizeRequestorKind(value.kind);
  const services: RequestorServices = (() => {
    const normalized = normalizeRequestorServices(value.services);
    return hasAnyRequestorService(normalized)
      ? normalized
      : { ...PAID_ONLY_SERVICES };
  })();
  const selected: ChoiceKey | null =
    kind === "lab"
      ? "lab"
      : kind === "practice"
        ? value.practiceHasInHouseLab === true
          ? "with"
          : "without"
        : null;

  const choose = (next: ChoiceKey) => {
    if (disabled || next === selected) return;
    if (next === "lab") {
      if (forcePracticeOnly) return;
      onChange({ kind: "lab", services, practiceHasInHouseLab: null });
      return;
    }
    onChange({
      kind: "practice",
      services,
      practiceHasInHouseLab: next === "with",
    });
  };

  // 설정: 치과는 앞의 2개, 기공소는 기공소만. 온보딩(미선택)은 전체에서 고른다.
  const choices =
    forcePracticeOnly || (restrictToKind && kind === "practice")
      ? CHOICES.filter((c) => c.key !== "lab")
      : restrictToKind && kind === "lab"
        ? CHOICES.filter((c) => c.key === "lab")
        : CHOICES;

  const hint = forcePracticeOnly
    ? "드롭존 가입 계정은 치과로 고정됩니다."
    : null;

  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5",
        className,
      )}
    >
      <div className="space-y-0.5">
        <p className="text-sm font-semibold text-slate-900">역할</p>
        {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      </div>
      <div
        role="radiogroup"
        aria-label="역할 선택"
        className={cn(
          "grid min-h-0 flex-1 grid-cols-1 gap-3",
          stackChoices
            ? choices.length === 2
              ? "h-full grid-rows-2"
              : "h-full"
            : choices.length === 3
              ? "md:grid-cols-3"
              : choices.length === 2
                ? "md:grid-cols-2"
                : "",
        )}
      >
        {choices.map((opt) => {
          const checked = selected === opt.key;
          const Icon = opt.icon;
          return (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={disabled}
              onClick={() => choose(opt.key)}
              className={cn(
                "group relative flex items-start gap-3 rounded-2xl border p-3.5 text-left shadow-sm outline-none transition-all",
                stackChoices || choices.length === 1
                  ? "h-full flex-row items-center"
                  : "min-h-[5.5rem] flex-col",
                "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2",
                checked
                  ? "border-primary/60 bg-primary-soft/40 ring-1 ring-primary/30"
                  : "border-slate-200/80 bg-white/80 hover:-translate-y-px hover:border-primary-muted/60 hover:bg-primary-soft/10 hover:shadow-md",
                disabled && "cursor-not-allowed opacity-60 hover:translate-y-0",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
                  checked
                    ? "bg-primary text-primary-foreground"
                    : "bg-slate-100 text-slate-500 group-hover:bg-primary-soft/60 group-hover:text-primary-strong",
                )}
              >
                <Icon className="h-4.5 w-4.5" aria-hidden />
              </span>
              <span className="space-y-0.5">
                <span className="block text-sm font-semibold text-slate-900">
                  {opt.label}
                </span>
                <span className="block text-xs leading-snug text-slate-500">
                  {opt.description}
                </span>
              </span>
              <span
                aria-hidden
                className={cn(
                  "absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border transition-all",
                  checked
                    ? "scale-100 border-primary bg-primary text-primary-foreground"
                    : "scale-90 border-slate-300 bg-white text-transparent",
                )}
              >
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
            </button>
          );
        })}
      </div>
      {!selected && (
        <p className="text-xs text-destructive">역할을 선택해주세요.</p>
      )}
    </div>
  );
};
