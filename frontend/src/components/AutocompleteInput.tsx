import React, { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface AutocompleteOption {
  id: string | number;
  label: string;
}

interface AutocompleteInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
  options: AutocompleteOption[];
  /**
   * 필터링 로직을 커스터마이즈하고 싶을 때 사용 (기본: label에 value 포함, 대소문자 무시)
   */
  filterFn?: (option: AutocompleteOption, input: string) => boolean;
  /**
   * 옵션을 확정 선택했을 때 호출
   */
  onOptionSelect?: (option: AutocompleteOption) => void;
  /**
   * 드롭다운이 열릴지 여부 (기본: 입력값이 있을 때 자동)
   */
  openOnFocus?: boolean;
  /**
   * 포커스를 잃었을 때 호출
   */
  onBlur?: () => void;
}

export const AutocompleteInput: React.FC<AutocompleteInputProps> = ({
  value,
  onValueChange,
  options,
  filterFn,
  onOptionSelect,
  openOnFocus = true,
  className,
  onBlur: onBlurProp,
  ...inputProps
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const trimmed = value.trim();

    const base = (() => {
      if (!trimmed) return options;
      const lower = trimmed.toLowerCase();
      if (filterFn) return options.filter((opt) => filterFn(opt, trimmed));
      return options.filter((opt) => opt.label.toLowerCase().includes(lower));
    })();

    // label 기준으로 다시 한 번 중복 제거 (오지연, 오지연 같은 항목 방지)
    const seen = new Set<string>();
    const uniq: AutocompleteOption[] = [];
    base.forEach((opt) => {
      const key = opt.label.trim().toLowerCase();
      if (!key) return;
      if (seen.has(key)) return;
      seen.add(key);
      uniq.push(opt);
    });
    return uniq;
  }, [value, options, filterFn]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onValueChange(e.target.value);
    if (openOnFocus) setIsOpen(true);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const anyEvent = e.nativeEvent as any;
    if (anyEvent?.isComposing) return;

    if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      if (filtered.length === 0) return;
      setIsOpen(true);
      setActiveIndex(0);
      e.preventDefault();
      return;
    }

    switch (e.key) {
      case "ArrowDown": {
        if (!isOpen) return;
        if (filtered.length === 0) return;
        e.preventDefault();
        setActiveIndex((prev) => {
          const next = prev + 1;
          return next >= filtered.length ? 0 : next;
        });
        break;
      }
      case "ArrowUp": {
        if (!isOpen) return;
        if (filtered.length === 0) return;
        e.preventDefault();
        setActiveIndex((prev) => {
          const next = prev - 1;
          return next < 0 ? filtered.length - 1 : next;
        });
        break;
      }
      case "Enter": {
        if (!isOpen) return;
        if (filtered.length === 0) return;
        e.preventDefault();
        const option =
          activeIndex >= 0 && activeIndex < filtered.length
            ? filtered[activeIndex]
            : filtered[0];
        onValueChange(option.label);
        onOptionSelect?.(option);
        setIsOpen(false);
        setActiveIndex(-1);
        break;
      }
      case "Escape": {
        if (!isOpen) return;
        e.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
        break;
      }
      default:
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={value}
        onChange={handleChange}
        onFocus={() => {
          if (openOnFocus) setIsOpen(true);
        }}
        onBlur={() => {
          setIsOpen(false);
          setActiveIndex(-1);
          onBlurProp?.();
        }}
        onKeyDown={handleKeyDown}
        className={className}
        {...inputProps}
      />
      {isOpen && filtered.length > 0 && (
        <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-lg">
          <ul className="max-h-48 overflow-y-auto py-1 text-xs">
            {filtered.map((opt, index) => (
              <li key={`${opt.id}-${index}`}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full cursor-pointer items-center px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground",
                    index === activeIndex && "bg-accent text-accent-foreground"
                  )}
                  tabIndex={-1}
                  onMouseDown={(e) => {
                    // 포커스 유지 위해 preventDefault
                    e.preventDefault();
                    onValueChange(opt.label);
                    onOptionSelect?.(opt);
                    setIsOpen(false);
                    setActiveIndex(-1);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span className="truncate">{opt.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default AutocompleteInput;
