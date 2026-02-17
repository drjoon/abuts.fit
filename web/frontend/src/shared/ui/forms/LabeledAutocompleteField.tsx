import React from "react";
import AutocompleteInput, {
  type AutocompleteOption,
} from "@/shared/ui/forms/AutocompleteInput";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export interface LabeledAutocompleteFieldProps {
  value: string;
  onChange: (value: string) => void;
  options: AutocompleteOption[];
  placeholder?: string;
  disabled?: boolean;
  /** 옵션 하나를 확정 선택했을 때 호출 */
  onOptionSelect?: (label: string) => void;
  /** X 버튼 눌렀을 때 (기본: onChange("")) */
  onClear?: () => void;
  /** 휴지통 버튼 눌렀을 때 (없으면 버튼 숨김) */
  onDelete?: () => void;
  /** 인풋 className 확장 */
  inputClassName?: string;
  /** 포커스를 잃었을 때 호출 (blur 이벤트) */
  onBlur?: () => void;
}

export const LabeledAutocompleteField: React.FC<
  LabeledAutocompleteFieldProps
> = ({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  onOptionSelect,
  onClear,
  onDelete,
  inputClassName,
  onBlur,
}) => {
  const handleClear = () => {
    if (onClear) onClear();
    else onChange("");
  };

  const hasValue = Boolean(value && value.trim().length > 0);

  return (
    <div className="flex-1 relative group">
      <AutocompleteInput
        value={value}
        onValueChange={onChange}
        options={options}
        onOptionSelect={(opt) => onOptionSelect?.(opt.label)}
        placeholder={placeholder}
        className={inputClassName ?? "h-8 text-xs w-full pr-10"}
        onBlur={onBlur}
        disabled={disabled}
      />
      {!disabled && (hasValue || onDelete) && (
        <div className="absolute -top-6 right-0 z-20 inline-flex items-center gap-0.5 rounded-full bg-white/90 px-1 py-0.5 shadow-sm opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          {hasValue && (
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-muted-foreground hover:bg-muted"
              tabIndex={-1}
              onClick={handleClear}
            >
              ×
            </button>
          )}
          {onDelete && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground"
              tabIndex={-1}
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default LabeledAutocompleteField;
