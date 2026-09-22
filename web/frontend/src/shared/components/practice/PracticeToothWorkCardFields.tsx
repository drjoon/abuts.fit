/**
 * 신규의뢰 보철 카드와 동일한 형태·어벗·쉐이드·복사 UI (intake SSOT).
 * related files:
 * - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
 * - web/frontend/src/shared/components/practice/PracticeToothWorkChartReadOnly.tsx
 * change-log:
 * - 2026-09-23: 라디오 라벨 — 어벗→직접어벗, 스캔바디→간접어벗.
 * - 2026-09-22: 신규의뢰 intake 본문 이관 — 커스텀 형태 삭제·missing tooltip·어벗 상세 툴팁·즐겨찾기 삭제.
 * - 2026-09-22: 어벗·스캔바디 선택 시 onOpenSpecs(신규의뢰 규격 모달과 동일).
 * - 2026-09-22: 신규의뢰 카드 필드 공통화 — 라디오 형태·어벗·쉐이드·복사.
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronsUpDown, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import {
  CUSTOM_ABUTMENT_SELECTION,
  emptyToothWorkAbutment,
  emptyToothWorkCustomSpecs,
  formatAbutmentCompact,
  formatAbutmentSummary,
  formatImplantCompact,
  formatImplantSummary,
  isCustomAbutmentProsthesisType,
  isSimpleAbutmentKind,
  isSimpleAbutmentMode,
  isSimpleHealingKind,
  isToothShadePreset,
  normalizeShadeFavorites,
  normalizeToothShade,
  resolveCustomAbutmentSelection,
  SIMPLE_HEALING_LABEL,
  TOOTH_SHADE_PRESETS,
  type CustomAbutmentSelection,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";
import { isCustomAbutmentSupportedProsthesisType } from "@/shared/practice/usePracticeToothWorkEditor";

const TOOTH_TYPE_CUSTOM_OPTION = "__custom_type__";
const TOOTH_SHADE_CUSTOM_OPTION = "__custom__";

type TypeMenuProps = {
  toothNumber: string;
  value: string;
  options: readonly string[];
  disabled?: boolean;
  allowCustom?: boolean;
  /** builtin이면 삭제 버튼 없음. 미지정 시 전부 builtin 취급(삭제 UI 없음). */
  isBuiltinType?: (type: string) => boolean;
  onChange: (nextType: string) => void;
  /** 직접 입력 Enter 시. 없으면 onChange만 호출. */
  onCommitCustomType?: (nextType: string) => void;
  onRemoveCustomType?: (type: string) => void;
  className?: string;
  missingToothTooltip?: string | null;
};

export function PracticeToothTypeMenu({
  toothNumber,
  value,
  options,
  disabled = false,
  allowCustom = false,
  isBuiltinType,
  onChange,
  onCommitCustomType,
  onRemoveCustomType,
  className,
  missingToothTooltip,
}: TypeMenuProps) {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const customInputRef = useRef<HTMLInputElement | null>(null);
  const typeLabel = String(value || "").trim() || "종류";
  const isCustom =
    Boolean(typeLabel) &&
    typeLabel !== "종류" &&
    !options.some((opt) => opt === typeLabel);
  const radioValue = customOpen
    ? TOOTH_TYPE_CUSTOM_OPTION
    : options.includes(typeLabel)
      ? typeLabel
      : isCustom
        ? typeLabel
        : "";
  const builtinTypes = isBuiltinType
    ? options.filter((type) => isBuiltinType(type))
    : [...options];
  const customTypes = isBuiltinType
    ? options.filter((type) => !isBuiltinType(type))
    : [];

  const typeButton = (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        if (disabled) return;
        if (next) {
          setOpen(true);
          setCustomDraft(isCustom ? typeLabel : "");
          setCustomOpen(isCustom);
          return;
        }
        setOpen(false);
        setCustomOpen(false);
        setCustomDraft("");
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          data-no-tooth-marquee=""
          data-prosthesis-type-toggle=""
          data-tooth-number={toothNumber}
          className={cn(
            "relative mt-1 flex h-6 w-full min-w-0 shrink-0 cursor-pointer items-center justify-center gap-0.5 truncate rounded-md px-0.5 text-center text-[11px] text-slate-600 hover:bg-primary-soft hover:text-primary-strong",
            disabled && "pointer-events-none opacity-50",
            className,
          )}
          title="보철물 형태 선택"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="min-w-0 truncate">{typeLabel}</span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        className="z-[400] w-max min-w-[6rem] p-1"
        data-no-tooth-marquee=""
        onCloseAutoFocus={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuRadioGroup
          value={radioValue}
          onValueChange={(next) => {
            if (next === TOOTH_TYPE_CUSTOM_OPTION) {
              setCustomOpen(true);
              setCustomDraft(isCustom ? typeLabel : "");
              window.setTimeout(() => customInputRef.current?.focus(), 0);
              return;
            }
            onChange(next);
            setCustomOpen(false);
            setCustomDraft("");
            setOpen(false);
          }}
        >
          {builtinTypes.map((type) => (
            <DropdownMenuRadioItem
              key={type}
              value={type}
              className="text-xs"
              data-no-tooth-marquee=""
            >
              {type}
            </DropdownMenuRadioItem>
          ))}
          {customTypes.map((type) => (
            <DropdownMenuRadioItem
              key={`type-custom-${type}`}
              value={type}
              className="pr-1 text-xs"
              data-no-tooth-marquee=""
            >
              <span className="min-w-0 flex-1 truncate">{type}</span>
              {onRemoveCustomType ? (
                <button
                  type="button"
                  className="ml-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  title="계정에서 삭제"
                  aria-label={`${type} 삭제`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemoveCustomType(type);
                    if (typeLabel.toLowerCase() === type.toLowerCase()) {
                      const fallback = builtinTypes[0];
                      if (fallback) onChange(fallback);
                    }
                  }}
                >
                  <X className="h-3 w-3" strokeWidth={2.5} />
                </button>
              ) : null}
            </DropdownMenuRadioItem>
          ))}
          {isCustom && !options.includes(typeLabel) ? (
            <DropdownMenuRadioItem
              value={typeLabel}
              className="text-xs"
              data-no-tooth-marquee=""
            >
              {typeLabel}
            </DropdownMenuRadioItem>
          ) : null}
          {allowCustom ? (
            <DropdownMenuRadioItem
              value={TOOTH_TYPE_CUSTOM_OPTION}
              className="text-xs"
              data-no-tooth-marquee=""
              onSelect={(e) => e.preventDefault()}
            >
              입력
            </DropdownMenuRadioItem>
          ) : null}
        </DropdownMenuRadioGroup>
        {allowCustom && customOpen ? (
          <>
            <DropdownMenuSeparator />
            <div
              className="flex items-center gap-1 px-1.5 pb-1.5 pt-0.5"
              data-no-tooth-marquee=""
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Input
                ref={customInputRef}
                value={customDraft}
                maxLength={24}
                placeholder="예: 비니어"
                className="h-7 flex-1 text-xs"
                onChange={(e) => setCustomDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const nextType = String(customDraft || "").trim();
                  if (!nextType) return;
                  if (onCommitCustomType) onCommitCustomType(nextType);
                  else onChange(nextType);
                  setCustomOpen(false);
                  setCustomDraft("");
                  setOpen(false);
                }}
              />
              {customDraft ? (
                <button
                  type="button"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  title="입력 지우기"
                  aria-label="입력 지우기"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCustomDraft("");
                    window.setTimeout(() => customInputRef.current?.focus(), 0);
                  }}
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (!missingToothTooltip) return typeButton;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{typeButton}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
        {missingToothTooltip}
      </TooltipContent>
    </Tooltip>
  );
}

type AbutmentRadiosProps = {
  row: ToothWorkSelection;
  toothNumber: string;
  disabled?: boolean;
  onPatch: (patch: Partial<ToothWorkSelection>) => void;
  /** 어벗|스캔바디 선택 시 규격 모달 오픈(신규의뢰와 동일) */
  onOpenSpecs?: (selection: CustomAbutmentSelection) => void;
  /** false면 선택만 하고 모달을 열지 않음(투어 abutment 스텝) */
  openSpecsOnSelect?: boolean;
  onClear?: () => void;
  onSelectionPointerDown?: (selection: CustomAbutmentSelection) => void;
  missingPreset?: boolean;
  className?: string;
  title?: string;
  /** intake: 임플란트/스캔바디 요약 툴팁 */
  detailTooltips?: boolean;
};

function abutmentSidePlaceholder(row: ToothWorkSelection): string {
  const selectionKind = resolveCustomAbutmentSelection(row);
  const isCustomType = isCustomAbutmentProsthesisType(row.prosthesisType);
  if (selectionKind === CUSTOM_ABUTMENT_SELECTION.ABUTMENT) {
    return isSimpleAbutmentKind(row.abutmentManufacturer) ? "심플어벗" : "직접 입력";
  }
  if (!isCustomType && isSimpleHealingKind(row.abutmentManufacturer)) {
    return SIMPLE_HEALING_LABEL;
  }
  if (!isCustomType && isSimpleAbutmentMode(row)) return "심플어벗";
  return "스캔바디";
}

function abutmentSideHint(row: ToothWorkSelection): string {
  const selectionKind = resolveCustomAbutmentSelection(row);
  const isCustomType = isCustomAbutmentProsthesisType(row.prosthesisType);
  if (selectionKind === CUSTOM_ABUTMENT_SELECTION.ABUTMENT) {
    return isSimpleAbutmentKind(row.abutmentManufacturer)
      ? "심플어벗 규격을 선택해주세요"
      : "직접 입력을 선택해주세요";
  }
  if (!isCustomType && isSimpleHealingKind(row.abutmentManufacturer)) {
    return "심플 힐링 규격을 선택해주세요";
  }
  if (!isCustomType && isSimpleAbutmentMode(row)) {
    return "심플어벗 규격을 선택해주세요";
  }
  return "스캔바디를 선택해주세요";
}

function abutmentSideEmptyHint(row: ToothWorkSelection): string {
  const selectionKind = resolveCustomAbutmentSelection(row);
  const isCustomType = isCustomAbutmentProsthesisType(row.prosthesisType);
  if (selectionKind === CUSTOM_ABUTMENT_SELECTION.ABUTMENT) {
    return isSimpleAbutmentKind(row.abutmentManufacturer)
      ? "심플어벗 선택"
      : "직접 입력 선택";
  }
  if (!isCustomType && isSimpleHealingKind(row.abutmentManufacturer)) {
    return "심플 힐링 선택";
  }
  if (!isCustomType && isSimpleAbutmentMode(row)) return "심플어벗 선택";
  return "스캔바디 선택";
}

export function PracticeToothAbutmentRadios({
  row,
  toothNumber,
  disabled = false,
  onPatch,
  onOpenSpecs,
  openSpecsOnSelect = true,
  onClear,
  onSelectionPointerDown,
  missingPreset = false,
  className,
  title,
  detailTooltips = false,
}: AbutmentRadiosProps) {
  if (!isCustomAbutmentSupportedProsthesisType(row.prosthesisType)) return null;
  const selectionKind = resolveCustomAbutmentSelection(row);
  const showDetails = Boolean(row.customAbutment);
  const implantCompact = formatImplantCompact(row);
  const abutmentCompact = formatAbutmentCompact(row);
  const implantSummary = formatImplantSummary(row);
  const abutmentSummary = formatAbutmentSummary(row);

  const details = showDetails ? (
    <div className="flex w-full flex-col items-stretch gap-0.5 pt-0.5">
      {detailTooltips ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                className={cn(
                  "h-5 w-full truncate px-0.5 text-center text-[10px] leading-none hover:underline",
                  implantCompact
                    ? "text-primary-strong hover:bg-primary-soft/70"
                    : missingPreset
                      ? "font-semibold text-destructive hover:bg-destructive-soft"
                      : "text-primary-strong hover:bg-primary-soft/70",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  const selection =
                    selectionKind || CUSTOM_ABUTMENT_SELECTION.ABUTMENT;
                  onOpenSpecs?.(selection);
                }}
              >
                {implantCompact || "임플란트"}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[16rem] text-xs">
              {implantSummary ||
                (missingPreset ? "임플란트를 선택해주세요" : "임플란트 선택")}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                className={cn(
                  "h-5 w-full truncate px-0.5 text-center text-[10px] leading-none hover:underline",
                  abutmentCompact
                    ? "text-service-abut hover:bg-service-abut-soft"
                    : missingPreset
                      ? "font-semibold text-destructive hover:bg-destructive-soft"
                      : "text-service-abut hover:bg-service-abut-soft",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  const selection =
                    selectionKind || CUSTOM_ABUTMENT_SELECTION.ABUTMENT;
                  onOpenSpecs?.(selection);
                }}
              >
                {abutmentCompact || abutmentSidePlaceholder(row)}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[16rem] text-xs">
              {abutmentSummary ||
                (missingPreset
                  ? abutmentSideHint(row)
                  : abutmentSideEmptyHint(row))}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <>
          <button
            type="button"
            disabled={disabled}
            className="min-h-4 w-full truncate px-0.5 text-center text-[10px] leading-none text-primary-strong hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              const selection =
                selectionKind || CUSTOM_ABUTMENT_SELECTION.ABUTMENT;
              onOpenSpecs?.(selection);
            }}
          >
            {implantCompact || "임플란트"}
          </button>
          <button
            type="button"
            disabled={disabled}
            className="min-h-4 w-full truncate px-0.5 text-center text-[10px] leading-none text-service-abut hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              const selection =
                selectionKind || CUSTOM_ABUTMENT_SELECTION.ABUTMENT;
              onOpenSpecs?.(selection);
            }}
          >
            {abutmentCompact ||
              (selectionKind === CUSTOM_ABUTMENT_SELECTION.ABUTMENT
                ? "직접 입력"
                : "스캔바디")}
          </button>
        </>
      )}
    </div>
  ) : null;

  return (
    <div
      data-no-tooth-marquee=""
      role="radiogroup"
      aria-label="직접어벗 또는 간접어벗"
      title={title}
      className={cn(
        "mt-1 flex shrink-0 flex-col items-stretch gap-0.5 px-0.5",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {(
        [
          { value: CUSTOM_ABUTMENT_SELECTION.ABUTMENT, label: "직접어벗" },
          { value: CUSTOM_ABUTMENT_SELECTION.SCANBODY, label: "간접어벗" },
        ] as const
      ).map((option) => {
        const checked =
          Boolean(row.customAbutment) && selectionKind === option.value;
        return (
          <label
            key={option.value}
            className={cn(
              "inline-flex min-h-6 cursor-pointer items-center justify-center gap-0.5 px-0.5 py-0.5 text-[10px] leading-none",
              missingPreset && checked
                ? "text-destructive"
                : checked
                  ? "text-slate-800"
                  : "text-slate-600",
              disabled && "pointer-events-none opacity-50",
            )}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (!checked) onSelectionPointerDown?.(option.value);
            }}
          >
            <input
              type="radio"
              name={`custom-abut-selection-${toothNumber}`}
              className="h-3.5 w-3.5 shrink-0 accent-primary-strong"
              checked={checked}
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                if (!checked) return;
                e.preventDefault();
                onPatch({
                  customAbutment: false,
                  customAbutmentSelection: undefined,
                  abutmentProductMode: undefined,
                  ...emptyToothWorkCustomSpecs(),
                });
                onClear?.();
              }}
              onChange={(e) => {
                e.stopPropagation();
                if (!e.target.checked) return;
                const prev = resolveCustomAbutmentSelection(row);
                const selectionChanged = prev != null && prev !== option.value;
                const selection = option.value as CustomAbutmentSelection;
                onPatch({
                  ...(selectionChanged ? emptyToothWorkAbutment() : {}),
                  customAbutment: true,
                  customAbutmentSelection: selection,
                });
                if (openSpecsOnSelect) onOpenSpecs?.(selection);
              }}
            />
            <span className="whitespace-nowrap">{option.label}</span>
          </label>
        );
      })}
      {details}
    </div>
  );
}

type ShadeBadgeProps = {
  toothNumber: string;
  shade?: string;
  disabled?: boolean;
  shadeFavorites?: string[] | null;
  onChange: (shade: string) => void;
  onRemoveFavorite?: (shade: string) => void;
};

export function PracticeToothShadeBadge({
  toothNumber,
  shade: shadeRaw,
  disabled = false,
  shadeFavorites = null,
  onChange,
  onRemoveFavorite,
}: ShadeBadgeProps) {
  const shade = normalizeToothShade(shadeRaw);
  const isCustom = Boolean(shade) && !isToothShadePreset(shade);
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const customInputRef = useRef<HTMLInputElement | null>(null);
  const radioValue = customOpen ? TOOTH_SHADE_CUSTOM_OPTION : shade;
  const savedCustoms = normalizeShadeFavorites(shadeFavorites).filter(
    (item) => !isToothShadePreset(item),
  );

  return (
    <div className="relative z-20 flex max-w-full items-center justify-center gap-0.5">
      <DropdownMenu
        open={open}
        onOpenChange={(next) => {
          if (disabled) return;
          if (next) {
            setOpen(true);
            setCustomDraft(isCustom ? shade : "");
            setCustomOpen(isCustom);
            return;
          }
          setOpen(false);
          setCustomOpen(false);
          setCustomDraft("");
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            data-no-tooth-marquee=""
            data-tooth-shade-toggle={toothNumber}
            className={cn(
              "inline-flex max-w-full shrink-0 select-none items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none tracking-tight transition-colors",
              shade
                ? "border border-amber-300/90 bg-amber-50 text-amber-900 shadow-sm hover:border-amber-400 hover:bg-amber-100"
                : "border border-slate-200/90 bg-white/90 text-slate-500 hover:border-primary/50 hover:bg-primary-soft/60 hover:text-primary-strong",
              disabled && "pointer-events-none opacity-50",
            )}
            title="쉐이드 선택"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className="truncate">{shade || "쉐이드"}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="center"
          className="z-[400] w-max min-w-[5.5rem] p-1"
          data-no-tooth-marquee=""
          onCloseAutoFocus={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenuRadioGroup
            value={radioValue}
            onValueChange={(next) => {
              if (next === TOOTH_SHADE_CUSTOM_OPTION) {
                setCustomOpen(true);
                setCustomDraft(isCustom ? shade : "");
                window.setTimeout(() => customInputRef.current?.focus(), 0);
                return;
              }
              onChange(normalizeToothShade(next));
              setCustomOpen(false);
              setCustomDraft("");
              setOpen(false);
            }}
          >
            {TOOTH_SHADE_PRESETS.map((preset) => (
              <DropdownMenuRadioItem
                key={preset}
                value={preset}
                className="text-xs"
                data-no-tooth-marquee=""
              >
                {preset}
              </DropdownMenuRadioItem>
            ))}
            {savedCustoms.map((favorite) => (
              <DropdownMenuRadioItem
                key={`shade-fav-${favorite}`}
                value={favorite}
                className="pr-1 text-xs"
                data-no-tooth-marquee=""
              >
                <span className="min-w-0 flex-1 truncate">{favorite}</span>
                {onRemoveFavorite ? (
                  <button
                    type="button"
                    className="ml-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="계정에서 삭제"
                    aria-label={`${favorite} 삭제`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onRemoveFavorite(favorite);
                      if (shade.toLowerCase() === favorite.toLowerCase()) {
                        onChange("");
                      }
                    }}
                  >
                    <X className="h-3 w-3" strokeWidth={2.5} />
                  </button>
                ) : null}
              </DropdownMenuRadioItem>
            ))}
            {isCustom &&
            !savedCustoms.some(
              (item) => item.toLowerCase() === shade.toLowerCase(),
            ) ? (
              <DropdownMenuRadioItem
                value={shade}
                className="text-xs"
                data-no-tooth-marquee=""
              >
                {shade}
              </DropdownMenuRadioItem>
            ) : null}
            <DropdownMenuRadioItem
              value={TOOTH_SHADE_CUSTOM_OPTION}
              className="text-xs"
              data-no-tooth-marquee=""
              onSelect={(e) => e.preventDefault()}
            >
              입력
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          {customOpen ? (
            <>
              <DropdownMenuSeparator />
              <div
                className="flex items-center gap-1 px-1.5 pb-1.5 pt-0.5"
                data-no-tooth-marquee=""
                onPointerDown={(e) => e.stopPropagation()}
              >
                <Input
                  ref={customInputRef}
                  value={customDraft}
                  maxLength={24}
                  placeholder="예: B2"
                  className="h-7 flex-1 text-xs"
                  onChange={(e) => setCustomDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const next = normalizeToothShade(customDraft);
                    if (!next) return;
                    onChange(next);
                    setCustomOpen(false);
                    setCustomDraft("");
                    setOpen(false);
                  }}
                />
                {customDraft ? (
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="입력 지우기"
                    aria-label="입력 지우기"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCustomDraft("");
                      window.setTimeout(() => customInputRef.current?.focus(), 0);
                    }}
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {shade ? (
        <button
          type="button"
          disabled={disabled}
          data-no-tooth-marquee=""
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-amber-800/70 hover:bg-amber-100 hover:text-amber-950"
          title="쉐이드 지우기"
          aria-label="쉐이드 지우기"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange("");
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <X className="h-3 w-3" strokeWidth={2.5} />
        </button>
      ) : null}
    </div>
  );
}

type CopyHandleProps = {
  toothNumber: string;
  canDrag?: boolean;
  isSource?: boolean;
  className?: string;
  onPointerDown?: (event: ReactPointerEvent<HTMLSpanElement>) => void;
};

export function PracticeToothCopyHandle({
  toothNumber,
  canDrag = false,
  isSource = false,
  className,
  onPointerDown,
}: CopyHandleProps) {
  return (
    <span
      data-no-tooth-marquee=""
      data-tooth-copy-handle={toothNumber}
      className={cn(
        "relative z-20 inline-flex shrink-0 select-none items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none tracking-tight transition-colors",
        canDrag
          ? "cursor-grab border border-primary-muted/80 bg-primary-soft text-primary-strong shadow-sm hover:border-primary/70 hover:bg-primary/15 hover:text-primary-strong active:cursor-grabbing"
          : "cursor-default border border-transparent bg-slate-100/70 text-slate-400",
        isSource && "opacity-40",
        className,
      )}
      title={canDrag ? "드래그해서 다른 치아에 복사" : undefined}
      onPointerDown={canDrag ? onPointerDown : undefined}
    >
      복사
    </span>
  );
}

type FooterProps = {
  toothNumber: string;
  shade?: string;
  showShade?: boolean;
  shadeDisabled?: boolean;
  shadeFavorites?: string[] | null;
  onChangeShade?: (shade: string) => void;
  onRemoveShadeFavorite?: (shade: string) => void;
  canDragCopy?: boolean;
  copyIsSource?: boolean;
  copyClassName?: string;
  onCopyPointerDown?: (event: ReactPointerEvent<HTMLSpanElement>) => void;
};

export function PracticeToothCardFooter({
  toothNumber,
  shade,
  showShade = true,
  shadeDisabled = false,
  shadeFavorites = null,
  onChangeShade,
  onRemoveShadeFavorite,
  canDragCopy = false,
  copyIsSource = false,
  copyClassName,
  onCopyPointerDown,
}: FooterProps) {
  return (
    <div className="relative z-20 mt-auto mb-0.5 flex w-full flex-col items-center gap-0.5">
      {showShade && onChangeShade ? (
        <PracticeToothShadeBadge
          toothNumber={toothNumber}
          shade={shade}
          disabled={shadeDisabled}
          shadeFavorites={shadeFavorites}
          onChange={onChangeShade}
          onRemoveFavorite={onRemoveShadeFavorite}
        />
      ) : null}
      <PracticeToothCopyHandle
        toothNumber={toothNumber}
        canDrag={canDragCopy}
        isSource={copyIsSource}
        className={copyClassName}
        onPointerDown={onCopyPointerDown}
      />
    </div>
  );
}
