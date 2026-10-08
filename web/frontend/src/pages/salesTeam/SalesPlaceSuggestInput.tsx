// related files:
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
// - web/frontend/src/pages/salesTeam/SalesAccountsPage.tsx
// - web/frontend/src/pages/salesTeam/SalesHomePage.tsx
import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { Input } from "@/components/ui/input";
import { cn } from "@/shared/ui/cn";
import {
  inferPlaceKindFromName,
  KIND_LABEL,
  manualPlaceSuggest,
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
  listClassName?: string;
  /**
   * overlay: 입력 아래 absolute (기본).
   * inline: 문서 흐름 — 모달에서 닫힌 뒤 예약 공백이 남지 않음.
   */
  listMode?: "overlay" | "inline";
  /** Cap dropdown rows (avoids tall scroll in modals). */
  maxItems?: number;
  autoFocus?: boolean;
  /** 거래처 추가 등 — 이미 등록된 거래처(source=account)는 목록에서 제외 */
  hideRegisteredAccounts?: boolean;
  /** 검색 없을 때 유형 버튼이 이 상호로 바로 저장 */
  onDirectCommit?: (item: SalesPlaceSuggest) => void;
  /** Enter·저장은 유형을 고르기 전에는 저장하지 않고 이 콜백만 호출 */
  onRequireKind?: () => void;
  /** 유형 미선택 안내를 강조 */
  kindPrompt?: boolean;
  /** Enter로 저장할 때 쓸 유형. onRequireKind가 있으면 Enter는 저장하지 않음 */
  directKind?: "practice" | "lab";
  directCommitDisabled?: boolean;
};

export default function SalesPlaceSuggestInput({
  value,
  onChange,
  onPick,
  placeholder = "상호명 검색 (2글자 이상)",
  className,
  inputClassName,
  listClassName,
  listMode = "overlay",
  maxItems,
  autoFocus,
  hideRegisteredAccounts = false,
  onDirectCommit,
  onRequireKind,
  kindPrompt = false,
  directKind,
  directCommitDisabled = false,
}: SalesPlaceSuggestInputProps) {
  const token = useAuthStore((s) => s.token);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  /** 선택 직후 value 동기화로 suggest가 다시 열려 드롭다운이 남는 것 방지 */
  const suppressSuggestRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SalesPlaceSuggest[]>([]);
  const [active, setActive] = useState(0);
  const committingRef = useRef(false);
  const enterDuringCompositionRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqRef = useRef(0);

  const visibleItems =
    maxItems != null && maxItems > 0 ? items.slice(0, maxItems) : items;

  const wasDirectCommitDisabledRef = useRef(false);

  useEffect(() => {
    if (wasDirectCommitDisabledRef.current && !directCommitDisabled) {
      committingRef.current = false;
    }
    wasDirectCommitDisabledRef.current = directCommitDisabled;
  }, [directCommitDisabled]);

  useEffect(() => {
    if (kindPrompt && value.trim().length >= 2) setOpen(true);
  }, [kindPrompt, value]);

  useEffect(() => {
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
      void salesTeamApi
        .suggestPlaces(token, q)
        .then((res) => {
          if (reqId !== reqRef.current) return;
          const next = (res.items || []).filter((it) =>
            hideRegisteredAccounts ? it.source !== "account" : true,
          );
          setItems(next);
          setActive(0);
          setOpen(true);
        })
        .catch(() => {
          if (reqId !== reqRef.current) return;
          setItems([]);
          setOpen(true);
        })
        .finally(() => {
          if (reqId !== reqRef.current) return;
          setLoading(false);
        });
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [token, value, hideRegisteredAccounts]);

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

  const pick = (item: SalesPlaceSuggest) => {
    suppressSuggestRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    reqRef.current += 1;
    setOpen(false);
    setItems([]);
    setLoading(false);
    onChange(item.name);
    onPick(item);
  };

  const commitManual = (kind: "practice" | "lab", nameOverride?: string) => {
    const name = (nameOverride ?? value).trim();
    if (!name || directCommitDisabled || committingRef.current) return;
    const item = manualPlaceSuggest(name, kind);
    if (onDirectCommit) {
      committingRef.current = true;
      suppressSuggestRef.current = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      reqRef.current += 1;
      setOpen(false);
      setItems([]);
      setLoading(false);
      onDirectCommit(item);
      return;
    }
    pick(item);
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
          autoFocus={autoFocus}
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
            if (value.trim().length >= 2) setOpen(true);
          }}
          onCompositionEnd={() => {
            enterDuringCompositionRef.current = false;
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.key === "Process") {
              if (e.key === "Enter") enterDuringCompositionRef.current = true;
              return;
            }
            if (e.key === "Enter") {
              if (enterDuringCompositionRef.current) {
                enterDuringCompositionRef.current = false;
                return;
              }
              if (open && visibleItems.length && visibleItems[active]) {
                e.preventDefault();
                pick(visibleItems[active]);
                return;
              }
              const name = value.trim();
              if (!name) return;
              e.preventDefault();
              if (onRequireKind) {
                setOpen(true);
                onRequireKind();
                return;
              }
              if (!onDirectCommit) return;
              commitManual(
                inferPlaceKindFromName(name) || directKind || "practice",
              );
              return;
            }
            if (!open || !visibleItems.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(visibleItems.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
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
              ? "relative z-10 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white px-1.5 py-1.5 shadow-sm"
              : "absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white px-1.5 py-1.5 shadow-lg",
            listClassName,
          )}
        >
          {visibleItems.length === 0 && loading ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">검색 중…</li>
          ) : (
            visibleItems.map((item, idx) => (
              <li key={`${item.source}-${item.accountId || item.name}-${idx}`}>
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
          <li className="sticky bottom-0 mt-1 border-t border-slate-100 bg-white px-1.5 pt-1.5">
              <p
                className={cn(
                  "px-1.5 py-1 text-xs",
                  kindPrompt
                    ? "font-medium text-amber-800"
                    : "text-muted-foreground",
                )}
              >
                {visibleItems.length === 0 && loading ? (
                  onRequireKind
                    ? "유형을 선택하세요."
                    : "유형을 고르면 입력한 상호로 넣습니다."
                ) : visibleItems.length === 0 ? (
                  onRequireKind ? (
                    <>
                      검색 결과가 없습니다.
                      <br />
                      유형을 선택하세요.
                    </>
                  ) : onDirectCommit ? (
                    <>
                      검색 결과가 없습니다.
                      <br />
                      유형을 누르면 바로 저장됩니다.
                    </>
                  ) : (
                    <>
                      검색 결과가 없습니다.
                      <br />
                      유형을 고르면 입력한 상호로 넣습니다.
                    </>
                  )
                ) : onRequireKind ? (
                  "유형을 선택하세요."
                ) : onDirectCommit ? (
                  "검색에 없으면 유형을 누르면 바로 저장됩니다."
                ) : (
                  "검색에 없으면 유형을 고르세요."
                )}
              </p>
              <div className="flex gap-1.5 px-1.5 pb-1">
                {(["practice", "lab"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className="h-8 flex-1 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                    disabled={directCommitDisabled}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      commitManual(kind);
                    }}
                    onClick={(e) => e.preventDefault()}
                  >
                    {onDirectCommit
                      ? KIND_LABEL[kind]
                      : `${KIND_LABEL[kind]}로 입력`}
                  </button>
                ))}
              </div>
            </li>
        </ul>
      ) : null}
    </div>
  );
}
