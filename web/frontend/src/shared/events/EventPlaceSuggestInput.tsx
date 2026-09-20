// related files:
// - web/frontend/src/shared/events/eventsApi.ts
// - web/frontend/src/pages/salesTeam/SalesPlaceSuggestInput.tsx
import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/shared/ui/cn";
import {
  eventsApi,
  type EventPlaceSuggest,
} from "@/shared/events/eventsApi";

type EventPlaceSuggestInputProps = {
  value: string;
  onChange: (value: string) => void;
  onPick: (item: EventPlaceSuggest) => void;
  kind: "practice" | "dealer";
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  listMode?: "overlay" | "inline";
  maxItems?: number;
  /** 값이 바뀔 때 다음 자동완성을 1회 억제(로그인 프리필 등). */
  suppressSuggestToken?: number | string;
};

export default function EventPlaceSuggestInput({
  value,
  onChange,
  onPick,
  kind,
  placeholder = "상호명 검색 (2글자 이상)",
  className,
  inputClassName,
  listMode = "overlay",
  maxItems = 12,
  suppressSuggestToken,
}: EventPlaceSuggestInputProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const suppressSuggestRef = useRef(false);
  const lastSuppressTokenRef = useRef(suppressSuggestToken);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<EventPlaceSuggest[]>([]);
  const [active, setActive] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqRef = useRef(0);

  const visibleItems =
    maxItems != null && maxItems > 0 ? items.slice(0, maxItems) : items;

  useEffect(() => {
    if (suppressSuggestToken !== lastSuppressTokenRef.current) {
      lastSuppressTokenRef.current = suppressSuggestToken;
      suppressSuggestRef.current = true;
    }
    if (suppressSuggestRef.current) {
      suppressSuggestRef.current = false;
      setItems([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    const q = value.trim();
    if (q.length < 2) {
      setItems([]);
      setLoading(false);
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const reqId = ++reqRef.current;
      setLoading(true);
      void eventsApi
        .suggestPlaces(q, kind)
        .then((res) => {
          if (reqId !== reqRef.current) return;
          const next = res.items || [];
          setItems(next);
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
  }, [value, kind, suppressSuggestToken]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-suggest-idx="${active}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (item: EventPlaceSuggest) => {
    suppressSuggestRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    reqRef.current += 1;
    setOpen(false);
    setItems([]);
    setLoading(false);
    onChange(item.name);
    onPick(item);
  };

  const clear = () => {
    suppressSuggestRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    reqRef.current += 1;
    setOpen(false);
    setItems([]);
    setLoading(false);
    setActive(0);
    onChange("");
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <Input
          value={value}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          placeholder={placeholder}
          className={cn("pl-8 pr-9", inputClassName)}
          onChange={(e) => {
            suppressSuggestRef.current = false;
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (visibleItems.length) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (!open || !visibleItems.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(visibleItems.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter" && visibleItems[active]) {
              e.preventDefault();
              pick(visibleItems[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {loading ? (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-slate-400" />
        ) : value ? (
          <button
            type="button"
            className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="입력 지우기"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {open && value.trim().length >= 2 ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className={cn(
            listMode === "inline"
              ? "relative z-10 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-sm"
              : "absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg",
          )}
        >
          {visibleItems.length === 0 && !loading ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              결과가 없습니다. 상호를 그대로 입력하거나 「지역명 상호」로 다시
              검색해 보세요.
            </li>
          ) : visibleItems.length === 0 && loading ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">검색 중…</li>
          ) : (
            visibleItems.map((item, idx) => (
              <li key={`${item.source}-${item.name}-${item.address}-${idx}`}>
                <button
                  type="button"
                  role="option"
                  data-suggest-idx={idx}
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
                      {item.label || "지도 검색"}
                    </span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[item.address || null, item.phone || null]
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
