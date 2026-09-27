// 기공소 AI 보철 — 임플란트 라이브러리 선택. 제조사 → 시스템, 검색·즐겨찾기.

import { useMemo, useState } from "react";
import { Search, Star, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import type { ImplantLibrary } from "@/shared/practice/implantLibrary";
import { cn } from "@/shared/ui/cn";

type Props = {
  toothNumber: string;
  libraries: readonly ImplantLibrary[];
  favorites: readonly string[];
  value: string | null;
  /** 의뢰 사양의 제조사. 처음 열 때 이 제조사를 편다. */
  defaultManufacturer: string;
  onPick: (library: ImplantLibrary) => void;
  onToggleFavorite: (id: string) => void;
  onClose: () => void;
};

type Mode = "company" | "search" | "favorite";

export function LabImplantLibraryPicker({
  toothNumber,
  libraries,
  favorites,
  value,
  defaultManufacturer,
  onPick,
  onToggleFavorite,
  onClose,
}: Props) {
  const current = libraries.find((row) => row.id === value) ?? null;
  const manufacturers = useMemo(
    () => [...new Set(libraries.map((row) => row.manufacturer))],
    [libraries],
  );
  const [mode, setMode] = useState<Mode>("company");
  const [manufacturer, setManufacturer] = useState(() => {
    if (current) return current.manufacturer;
    const want = defaultManufacturer.trim().toLowerCase();
    return manufacturers.find((row) => row.toLowerCase() === want) ?? "";
  });
  const [query, setQuery] = useState("");
  const favoriteSet = new Set(favorites);

  const rows = useMemo(() => {
    if (mode === "favorite") return libraries.filter((row) => favoriteSet.has(row.id));
    if (mode === "search") {
      const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (words.length === 0) return [];
      return libraries
        .filter((row) => {
          const text = `${row.manufacturer} ${row.label}`.toLowerCase();
          return words.every((word) => text.includes(word));
        })
        .slice(0, 60);
    }
    return manufacturer ? libraries.filter((row) => row.manufacturer === manufacturer) : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favorites, libraries, manufacturer, mode, query]);

  const tab = (id: Mode, label: string, icon: JSX.Element) => (
    <button
      type="button"
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs",
        mode === id ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-muted",
      )}
      onClick={() => setMode(id)}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="w-72 rounded-lg border bg-background/95 p-3 text-sm shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-semibold text-foreground">#{toothNumber} 임플란트 라이브러리</p>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          aria-label="닫기"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex gap-1">
        {tab("company", "제조사", <span className="h-3.5 w-3.5 rounded-full border" />)}
        {tab("search", "검색", <Search className="h-3.5 w-3.5" />)}
        {tab("favorite", `즐겨찾기 (${favorites.length})`, <Star className="h-3.5 w-3.5" />)}
      </div>
      <div className="mt-2 space-y-2">
        {mode === "company" ? (
          <select
            className="h-8 w-full rounded-md border bg-background px-2 text-xs"
            aria-label="제조사"
            value={manufacturer}
            onChange={(event) => setManufacturer(event.target.value)}
          >
            <option value="">제조사</option>
            {manufacturers.map((row) => (
              <option key={row} value={row}>
                {row}
              </option>
            ))}
          </select>
        ) : null}
        {mode === "search" ? (
          <Input
            autoFocus
            className="h-8 text-xs"
            placeholder="제조사·시스템·타입"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        ) : null}
        {libraries.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            임플란트 카탈로그를 불러오는 중입니다.
          </p>
        ) : rows.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {mode === "company"
              ? "제조사를 고르면 시스템이 나옵니다."
              : mode === "search"
                ? "맞는 라이브러리가 없습니다."
                : "별을 누르면 여기에 모입니다."}
          </p>
        ) : (
          <ul className="max-h-56 space-y-0.5 overflow-y-auto">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-1">
                <button
                  type="button"
                  className={cn(
                    "min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-xs",
                    row.id === value ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                  )}
                  onClick={() => onPick(row)}
                >
                  {mode !== "company" ? (
                    <span className="block truncate text-[10px] opacity-80">{row.manufacturer}</span>
                  ) : null}
                  <span className="block truncate">{row.label || row.manufacturer}</span>
                </button>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-muted"
                  aria-label={favoriteSet.has(row.id) ? "즐겨찾기 해제" : "즐겨찾기"}
                  onClick={() => onToggleFavorite(row.id)}
                >
                  <Star
                    className={cn(
                      "h-3.5 w-3.5",
                      favoriteSet.has(row.id) ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
                    )}
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
