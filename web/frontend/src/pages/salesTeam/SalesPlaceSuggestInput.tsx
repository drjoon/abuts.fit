// related files:
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
// - web/frontend/src/pages/salesTeam/SalesAccountsPage.tsx
// - web/frontend/src/pages/salesTeam/SalesHomePage.tsx
import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { Input } from "@/components/ui/input";
import { cn } from "@/shared/ui/cn";
import {
  KIND_LABEL,
  salesTeamApi,
  type SalesPlaceSuggest,
} from "./salesTeamApi";

type SalesPlaceSuggestInputProps = {
  value: string;
  onChange: (value: string) => void;
  onPick: (item: SalesPlaceSuggest) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
};

export default function SalesPlaceSuggestInput({
  value,
  onChange,
  onPick,
  placeholder = "상호명 검색 (2글자 이상)",
  className,
  inputClassName,
  autoFocus,
}: SalesPlaceSuggestInputProps) {
  const token = useAuthStore((s) => s.token);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SalesPlaceSuggest[]>([]);
  const [active, setActive] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqRef = useRef(0);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const reqId = ++reqRef.current;
      setLoading(true);
      void salesTeamApi
        .suggestPlaces(token, q)
        .then((res) => {
          if (reqId !== reqRef.current) return;
          setItems(res.items || []);
          setActive(0);
          setOpen(true);
        })
        .catch(() => {
          if (reqId !== reqRef.current) return;
          setItems([]);
        })
        .finally(() => {
          if (reqId !== reqRef.current) return;
          setLoading(false);
        });
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [token, value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (item: SalesPlaceSuggest) => {
    onChange(item.name);
    onPick(item);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <Input
          value={value}
          autoFocus={autoFocus}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          placeholder={placeholder}
          className={cn("pl-8 pr-8", inputClassName)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (items.length) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (!open || !items.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(items.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter" && items[active]) {
              e.preventDefault();
              pick(items[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {loading ? (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-slate-400" />
        ) : null}
      </div>
      {open && value.trim().length >= 2 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {items.length === 0 && !loading ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              검색 결과가 없습니다. 그대로 저장해도 됩니다.
            </li>
          ) : (
            items.map((item, idx) => (
              <li key={`${item.source}-${item.accountId || item.name}-${idx}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={idx === active}
                  className={cn(
                    "flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-slate-50",
                    idx === active && "bg-primary-soft/40",
                  )}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => pick(item)}
                >
                  <span className="flex items-center gap-1.5 font-medium text-slate-900">
                    <span className="truncate">{item.name}</span>
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                      {item.label || KIND_LABEL[item.kind] || item.source}
                    </span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[KIND_LABEL[item.kind], item.address || item.phone]
                      .filter(Boolean)
                      .join(" · ") || "상세 없음"}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
