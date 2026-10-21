import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import {
  suggestImplantNameRegistry,
  type ImplantNameSuggestion,
} from "@/shared/admin/newConnectionRequestInbox";

type Props = {
  field: "manufacturer" | "brand";
  value: string;
  manufacturerContext?: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  onChange: (next: string) => void;
  onPickSuggestion?: (row: ImplantNameSuggestion) => void;
};

type ListPosition = {
  top: number;
  left: number;
  width: number;
};

export function ImplantCustomNameSuggestInput({
  field,
  value,
  manufacturerContext,
  placeholder,
  disabled = false,
  readOnly = false,
  className,
  onChange,
  onPickSuggestion,
}: Props) {
  const listId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const blurTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ImplantNameSuggestion[]>([]);
  const [listPosition, setListPosition] = useState<ListPosition | null>(null);

  useEffect(() => {
    const q = String(value || "").trim();
    if (!open || q.length < 1) {
      setItems([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void suggestImplantNameRegistry({
        field,
        q,
        manufacturer: manufacturerContext,
      }).then(setItems);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [value, field, manufacturerContext, open]);

  const showList = open && items.length > 0 && !disabled && !readOnly;

  const pickRow = (row: ImplantNameSuggestion) => {
    const label =
      field === "brand" ? row.brand || row.manufacturer : row.manufacturer;
    if (field === "brand") {
      onChange(row.brand || label);
    } else {
      onChange(row.manufacturer || label);
    }
    onPickSuggestion?.(row);
    if (blurTimer.current) {
      window.clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
    setOpen(false);
  };

  useLayoutEffect(() => {
    if (!showList || !anchorRef.current) {
      setListPosition(null);
      return;
    }
    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setListPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [showList, items.length, value]);

  const listbox =
    showList && listPosition ? (
      <div
        style={{
          position: "fixed",
          top: listPosition.top,
          left: listPosition.left,
          width: listPosition.width,
        }}
        className="z-[410] pointer-events-auto"
        onPointerDownCapture={(e) => {
          e.preventDefault();
        }}
      >
        <ul
          id={listId}
          role="listbox"
          className="max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {items.map((row) => {
            const label =
              field === "brand" ? row.brand || row.manufacturer : row.manufacturer;
            const key = `${row.manufacturer}::${row.brand}::${label}`;
            return (
              <li key={key} role="option">
                <button
                  type="button"
                  className="w-full px-2.5 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-50"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    pickRow(row);
                  }}
                >
                  {label}
                  {field === "manufacturer" && row.brand ? (
                    <span className="ml-1 text-xs text-slate-500">
                      · {row.brand}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    ) : null;

  return (
    <div ref={anchorRef} className="relative z-[1] min-w-0">
      <Input
        placeholder={placeholder}
        value={value}
        readOnly={readOnly}
        disabled={disabled}
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        className={className}
        onFocus={() => {
          if (blurTimer.current) {
            window.clearTimeout(blurTimer.current);
            blurTimer.current = null;
          }
          setOpen(true);
        }}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 160);
        }}
        onChange={(e) => onChange(e.target.value)}
      />
      {listbox ? createPortal(listbox, document.body) : null}
    </div>
  );
}
