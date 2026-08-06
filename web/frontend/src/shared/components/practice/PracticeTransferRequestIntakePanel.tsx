import { useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Minus,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImeSafeInput } from "@/shared/components/practice/ImeSafeInput";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/shared/ui/cn";
import { PracticeOrderArrivalDateRangeField } from "@/shared/components/practice/PracticeOrderArrivalDateRangeField";
import { getBusinessLabel, type SearchBusinessResult } from "@/pages/practice/hooks/usePracticeTransferStep1";
import { PracticeToothImplantFields } from "@/shared/components/practice/PracticeToothImplantFields";
import { PracticeToothAbutmentFields } from "@/shared/components/practice/PracticeToothAbutmentFields";
import { PracticeToothNumberPicker } from "@/shared/components/practice/PracticeToothNumberPicker";
import type { ImplantConnection } from "@/shared/practice/useImplantConnectionCatalog";
import {
  customSpecsKey,
  emptyToothWorkCustomSpecs,
  formatAbutmentCompact,
  formatAbutmentSummary,
  formatCustomSpecsSummary,
  formatImplantCompact,
  formatImplantSummary,
  pickToothWorkCustomSpecs,
  type PracticeAbutmentFavorite,
  type PracticeImplantFavorite,
} from "@/shared/practice/transferMemo";
import {
  applyProsthesisTypeToRow,
  getAdjacentTeeth,
  getProsthesisTypesForLinkState,
  isBridgeLikeProsthesisType,
  isCustomAbutmentSupportedProsthesisType,
  resolveProsthesisTypeForLinkState,
  toggleAdjacentBridgeLink,
  type ToothWorkSelection,
} from "@/shared/practice/usePracticeToothWorkEditor";

// related files:
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/shared/practice/usePracticeToothWorkEditor.ts
// - web/frontend/src/shared/components/practice/PracticeOrderArrivalDateRangeField.tsx
// - web/frontend/src/shared/components/practice/PracticeToothImplantFields.tsx
// - web/frontend/src/shared/components/practice/PracticeToothAbutmentFields.tsx

const PRACTICE_MEMO_SNIPPETS_LOCAL_KEY = "practice_transfer_memo_snippets_v1";
const MAX_MEMO_SNIPPETS = 40;
const MAX_MEMO_SUGGESTIONS = 8;
const MEMO_SUGGEST_MIN_CHARS = 1;
const TOOTH_CHART_VISIBLE = 6;
/** 카드 높이: 커스텀 임플란트/스캔바디 2줄까지 표시한 기준 */
const TOOTH_CARD_HEIGHT_CLASS = "h-[8.75rem]";
/** 치식: 위(18→11→21→28) / 아래(48→41→31→38). 행마다 6칸 + <> 스크롤 */
const TOOTH_CHART_ROWS: ReadonlyArray<{ key: string; label: string; teeth: readonly string[] }> = [
  {
    key: "upper",
    label: "상악",
    teeth: [
      "18", "17", "16", "15", "14", "13", "12", "11",
      "21", "22", "23", "24", "25", "26", "27", "28",
    ],
  },
  {
    key: "lower",
    label: "하악",
    teeth: [
      "48", "47", "46", "45", "44", "43", "42", "41",
      "31", "32", "33", "34", "35", "36", "37", "38",
    ],
  },
];

const initialToothChartOffsets = (): Record<string, number> => ({
  upper: 0,
  lower: 0,
});

/** 선택된 치아가 보이도록 해당 번대 스크롤 오프셋 계산 */
const offsetToRevealSelected = (
  teeth: readonly string[],
  selected: ReadonlySet<string>,
) => {
  const indices = teeth
    .map((tooth, index) => (selected.has(tooth) ? index : -1))
    .filter((index) => index >= 0);
  const maxOffset = Math.max(0, teeth.length - TOOTH_CHART_VISIBLE);
  if (indices.length === 0) return null;
  const min = Math.min(...indices);
  const max = Math.max(...indices);
  const ideal = Math.round((min + max) / 2 - (TOOTH_CHART_VISIBLE - 1) / 2);
  return Math.min(maxOffset, Math.max(0, ideal));
};

export const normalizeMemoSnippets = (items: unknown): string[] => {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of items) {
    const text = String(item || "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(text);
    if (next.length >= MAX_MEMO_SNIPPETS) break;
  }
  return next;
};

const filterMemoSuggestions = (input: string, snippets: string[]): string[] => {
  const q = String(input || "").trim().toLowerCase();
  if (q.length < MEMO_SUGGEST_MIN_CHARS) return [];
  const prefix: string[] = [];
  const contains: string[] = [];
  for (const snippet of snippets) {
    const text = String(snippet || "").trim();
    if (!text) continue;
    const lower = text.toLowerCase();
    if (lower === q) continue;
    if (lower.startsWith(q)) prefix.push(text);
    else if (lower.includes(q)) contains.push(text);
  }
  return [...prefix, ...contains].slice(0, MAX_MEMO_SUGGESTIONS);
};

const loadLocalMemoSnippets = (): string[] => {
  try {
    const raw = localStorage.getItem(PRACTICE_MEMO_SNIPPETS_LOCAL_KEY);
    if (!raw) return [];
    return normalizeMemoSnippets(JSON.parse(raw));
  } catch {
    return [];
  }
};

const persistLocalMemoSnippets = (items: string[]) => {
  try {
    localStorage.setItem(PRACTICE_MEMO_SNIPPETS_LOCAL_KEY, JSON.stringify(normalizeMemoSnippets(items)));
  } catch {
    // ignore
  }
};

export type PracticeTransferRequestIntakePanelProps = {
  selectedLab: SearchBusinessResult | null;
  setSelectedLab: (value: SearchBusinessResult | null) => void;
  labOpen: boolean;
  setLabOpen: (open: boolean) => void;
  labSearch: string;
  setLabSearch: (value: string) => void;
  labSearchResults: SearchBusinessResult[];
  labSearching: boolean;
  recentLabs: SearchBusinessResult[];
  recentLabsInitialized: boolean;
  patientName: string;
  setPatientName: (value: string) => void;
  orderDate: string;
  setOrderDate: (value: string) => void;
  arrivalDate: string;
  setArrivalDate: (value: string) => void;
  /** 주문일·도착일을 한 번에 지정(대시보드 arrival auto-sync 스킵용) */
  onOrderArrivalDatesChange?: (next: { orderDate: string; arrivalDate: string }) => void;
  arrivalDefaultDays: number;
  normalizedProsthesisTypes: string[];
  setProsthesisTypeCatalogDraft: (value: string[]) => void;
  setProsthesisTypeSettingsDialogOpen: (open: boolean) => void;
  toothWorks: ToothWorkSelection[];
  setToothWorks: Dispatch<SetStateAction<ToothWorkSelection[]>>;
  requestMemo: string;
  setRequestMemo: (value: string) => void;
  memoInputId: string;
  memoSnippets?: string[];
  onMemoSnippetsChange?: (next: string[]) => void | Promise<void>;
  onImeComposingChange?: (composing: boolean) => void;
  prosthesisTypeSelectWidthClassName?: string;
  showBridgeConnections?: boolean;
  toothTensOptions: readonly string[];
  toothOnesOptions: readonly string[];
  onClearAll?: () => void;
  implantConnections?: ImplantConnection[];
  implantFavorites?: PracticeImplantFavorite[];
  onImplantFavoritesChange?: (next: PracticeImplantFavorite[]) => void | Promise<void>;
  abutmentFavorites?: PracticeAbutmentFavorite[];
  onAbutmentFavoritesChange?: (next: PracticeAbutmentFavorite[]) => void | Promise<void>;
};

export const PracticeTransferRequestIntakePanel = ({
  selectedLab,
  setSelectedLab,
  labOpen,
  setLabOpen,
  labSearch,
  setLabSearch,
  labSearchResults,
  labSearching,
  recentLabs,
  recentLabsInitialized,
  patientName,
  setPatientName,
  orderDate,
  setOrderDate,
  arrivalDate,
  setArrivalDate,
  onOrderArrivalDatesChange,
  arrivalDefaultDays,
  normalizedProsthesisTypes,
  setProsthesisTypeCatalogDraft,
  setProsthesisTypeSettingsDialogOpen,
  toothWorks,
  setToothWorks,
  requestMemo,
  setRequestMemo,
  memoInputId,
  memoSnippets: memoSnippetsProp,
  onMemoSnippetsChange,
  onImeComposingChange,
  prosthesisTypeSelectWidthClassName = "w-[7rem]",
  showBridgeConnections = false,
  toothTensOptions,
  toothOnesOptions,
  onClearAll,
  implantConnections = [],
  implantFavorites = [],
  onImplantFavoritesChange,
  abutmentFavorites = [],
  onAbutmentFavoritesChange,
}: PracticeTransferRequestIntakePanelProps) => {
  const defaultProsthesisType = normalizedProsthesisTypes.includes("크라운")
    ? "크라운"
    : normalizedProsthesisTypes[0] || "크라운";
  const [lastUsedCustomSpecs, setLastUsedCustomSpecs] = useState(() => emptyToothWorkCustomSpecs());
  /** null = closed; number = 해당 치아 커스텀어벗 설정 */
  const [customSpecsModalTarget, setCustomSpecsModalTarget] = useState<number | null>(null);
  const [toothChartOffsets, setToothChartOffsets] = useState<Record<string, number>>(
    initialToothChartOffsets,
  );

  // 선택된 치아(예: 12·11·21)가 창 밖이면 해당 번대를 그쪽으로 스크롤
  useEffect(() => {
    const selected = new Set(
      toothWorks
        .map((row) => String(row.toothNumber || "").trim())
        .filter((tooth) => /^[1-4][1-8]$/.test(tooth)),
    );
    if (selected.size === 0) return;

    setToothChartOffsets((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const decade of TOOTH_CHART_ROWS) {
        const selectedInDecade = decade.teeth.filter((tooth) => selected.has(tooth));
        if (selectedInDecade.length === 0) continue;

        const cur = next[decade.key] ?? 0;
        const visible = new Set(
          decade.teeth.slice(cur, cur + TOOTH_CHART_VISIBLE),
        );
        if (selectedInDecade.every((tooth) => visible.has(tooth))) continue;

        const ideal = offsetToRevealSelected(decade.teeth, selected);
        if (ideal == null || ideal === cur) continue;
        next[decade.key] = ideal;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [toothWorks]);

  // 연결 여부 ↔ 형태(크라운/인레이 vs 브리지/Pontic) 불일치 보정 (드래프트·구버전 데이터)
  const toothWorkLinkTypeMismatch = useMemo(() => {
    return toothWorks.some((row) => {
      const adjacent = getAdjacentTeeth(row.toothNumber);
      const links = Array.isArray(row.bridgeLinkedTeeth)
        ? row.bridgeLinkedTeeth.filter((t) => adjacent.includes(t))
        : [];
      const isLinked = links.length > 0;
      const prevType = String(row.prosthesisType || "").trim();
      const prevLinks = Array.isArray(row.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : [];
      const linksChanged =
        links.length !== prevLinks.length ||
        links.some((t) => !prevLinks.includes(t)) ||
        prevLinks.some((t) => !links.includes(t));
      if (!prevType && !isLinked) return linksChanged;
      const resolved = resolveProsthesisTypeForLinkState(
        prevType,
        isLinked,
        normalizedProsthesisTypes,
      );
      return resolved !== prevType || linksChanged;
    });
  }, [normalizedProsthesisTypes, toothWorks]);

  useEffect(() => {
    if (!toothWorkLinkTypeMismatch) return;
    setToothWorks((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        const adjacent = getAdjacentTeeth(row.toothNumber);
        const links = Array.isArray(row.bridgeLinkedTeeth)
          ? row.bridgeLinkedTeeth.filter((t) => adjacent.includes(t))
          : [];
        const isLinked = links.length > 0;
        const prevType = String(row.prosthesisType || "").trim();
        const prosthesisType =
          !prevType && !isLinked
            ? prevType
            : resolveProsthesisTypeForLinkState(prevType, isLinked, normalizedProsthesisTypes);
        const prevLinks = Array.isArray(row.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : [];
        const linksChanged =
          links.length !== prevLinks.length ||
          links.some((t) => !prevLinks.includes(t)) ||
          prevLinks.some((t) => !links.includes(t));
        if (prosthesisType === prevType && !linksChanged) return row;
        changed = true;
        return {
          ...applyProsthesisTypeToRow(row, prosthesisType),
          bridgeLinkedTeeth: isLinked ? links : [],
        };
      });
      return changed ? next : prev;
    });
  }, [normalizedProsthesisTypes, setToothWorks, toothWorkLinkTypeMismatch]);
  const isMemoSnippetsControlled = typeof onMemoSnippetsChange === "function";
  const [localMemoSnippets, setLocalMemoSnippets] = useState<string[]>(() => loadLocalMemoSnippets());
  const [suggestLineIndex, setSuggestLineIndex] = useState<number | null>(null);
  const [suggestActiveIndex, setSuggestActiveIndex] = useState(0);
  const memoInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const pendingFocusLineRef = useRef<number | null>(null);
  // 한글 IME: compositionend 직후 keydown에서 isComposing이 이미 false인 경우가 있어 ref로 한 틱 더 막습니다.
  const memoComposingRef = useRef(false);
  const patientComposingRef = useRef(false);
  // 조합 중 Enter → 조합 확정 후 줄바꿈 (글자가 다음 줄로 가는 것 방지)
  const pendingMemoNewlineIndexRef = useRef<number | null>(null);
  const suppressMemoEnterRef = useRef(false);

  const reportImeComposing = () => {
    onImeComposingChange?.(patientComposingRef.current || memoComposingRef.current);
  };

  const emptySpecsKey = customSpecsKey(emptyToothWorkCustomSpecs());

  const resolveSeedCustomSpecs = (
    prev: ToothWorkSelection[],
    excludeIndex?: number,
  ) => {
    if (customSpecsKey(lastUsedCustomSpecs) !== emptySpecsKey) {
      return pickToothWorkCustomSpecs(lastUsedCustomSpecs, true);
    }
    const donor = prev.find(
      (row, index) =>
        index !== excludeIndex &&
        row.customAbutment &&
        isCustomAbutmentSupportedProsthesisType(row.prosthesisType) &&
        customSpecsKey(row) !== emptySpecsKey,
    );
    if (donor) return pickToothWorkCustomSpecs(donor, true);
    return emptyToothWorkCustomSpecs();
  };

  const applyCustomSpecsToTooth = (
    index: number,
    specs: ReturnType<typeof emptyToothWorkCustomSpecs>,
  ) => {
    setToothWorks((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = {
        ...next[index],
        customAbutment: true,
        ...specs,
      };
      return next;
    });
    if (customSpecsKey(specs) !== emptySpecsKey) {
      setLastUsedCustomSpecs(pickToothWorkCustomSpecs(specs, true));
    }
  };

  const patchCustomSpecsOnTooth = (
    index: number,
    patch: Partial<ReturnType<typeof emptyToothWorkCustomSpecs>>,
  ) => {
    setToothWorks((prev) => {
      const next = [...prev];
      const row = next[index];
      if (!row) return prev;
      const merged = {
        ...pickToothWorkCustomSpecs(row, true),
        ...patch,
      };
      next[index] = {
        ...row,
        customAbutment: true,
        ...merged,
      };
      if (customSpecsKey(merged) !== emptySpecsKey) {
        setLastUsedCustomSpecs(pickToothWorkCustomSpecs(merged, true));
      }
      return next;
    });
  };

  useEffect(() => {
    if (isMemoSnippetsControlled) return;
    setLocalMemoSnippets(loadLocalMemoSnippets());
  }, [isMemoSnippetsControlled]);

  const memoSnippets = useMemo(
    () =>
      normalizeMemoSnippets(
        isMemoSnippetsControlled ? memoSnippetsProp || [] : localMemoSnippets,
      ),
    [isMemoSnippetsControlled, localMemoSnippets, memoSnippetsProp],
  );

  const memoLines = useMemo(() => {
    if (!String(requestMemo || "").length) return [""];
    return String(requestMemo).split("\n");
  }, [requestMemo]);

  useEffect(() => {
    const focusIndex = pendingFocusLineRef.current;
    if (focusIndex === null) return;
    pendingFocusLineRef.current = null;
    // 포커스를 바로 옮기면 조합 중이던 글자가 새 input에 들어가므로 IME 커밋 이후로 미룹니다.
    const timer = window.setTimeout(() => {
      const input = memoInputRefs.current[focusIndex];
      if (input) {
        input.focus();
        const len = input.value.length;
        input.setSelectionRange(len, len);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [memoLines]);

  const syncMemoLines = (nextLines: string[]) => {
    setRequestMemo(nextLines.join("\n"));
  };

  const insertMemoNewlineAfter = (index: number, currentValue: string) => {
    const prev = String(requestMemo || "");
    const nextLines = prev.length ? prev.split("\n") : [""];
    while (nextLines.length <= index) nextLines.push("");
    nextLines[index] = currentValue;
    nextLines.splice(index + 1, 0, "");
    pendingFocusLineRef.current = index + 1;
    syncMemoLines(nextLines);
  };

  const isNativeImeComposing = (e: KeyboardEvent<HTMLInputElement>) =>
    e.nativeEvent.isComposing || e.keyCode === 229;

  const handleDeleteMemoLine = (index: number) => {
    if (memoLines.length <= 1) {
      syncMemoLines([""]);
      pendingFocusLineRef.current = 0;
      return;
    }
    const nextLines = memoLines.filter((_, idx) => idx !== index);
    syncMemoLines(nextLines.length ? nextLines : [""]);
    pendingFocusLineRef.current = Math.max(0, index - 1);
  };

  const commitMemoSnippets = (nextRaw: string[]) => {
    const next = normalizeMemoSnippets(nextRaw);
    persistLocalMemoSnippets(next);
    if (isMemoSnippetsControlled) {
      void onMemoSnippetsChange?.(next);
      return;
    }
    setLocalMemoSnippets(next);
  };

  const rememberMemoSentence = (sentence: string) => {
    const text = String(sentence || "").trim();
    if (!text) return;
    const without = memoSnippets.filter((item) => item.toLowerCase() !== text.toLowerCase());
    commitMemoSnippets([text, ...without]);
  };

  const closeMemoSuggestions = () => {
    setSuggestLineIndex(null);
    setSuggestActiveIndex(0);
  };

  const openMemoSuggestions = (lineIndex: number, lineValue: string) => {
    const matches = filterMemoSuggestions(lineValue, memoSnippets);
    if (matches.length === 0) {
      closeMemoSuggestions();
      return;
    }
    setSuggestLineIndex(lineIndex);
    setSuggestActiveIndex(0);
  };

  const applyMemoSuggestion = (lineIndex: number, snippet: string) => {
    const text = String(snippet || "").trim();
    if (!text) return;
    const nextLines = [...memoLines];
    while (nextLines.length <= lineIndex) nextLines.push("");
    nextLines[lineIndex] = text;
    syncMemoLines(nextLines);
    rememberMemoSentence(text);
    closeMemoSuggestions();
    pendingFocusLineRef.current = lineIndex;
  };

  const suggestionsForActiveLine =
    suggestLineIndex === null
      ? []
      : filterMemoSuggestions(memoLines[suggestLineIndex] || "", memoSnippets);

  return (
    <div className="flex min-h-0 flex-col gap-3 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-sky-50/60 p-4 shadow-[0_4px_12px_rgba(15,23,42,0.03)] transition-all hover:shadow-[0_8px_20px_rgba(15,23,42,0.06)]">
      {onClearAll ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-lg border-slate-200 bg-white"
            onClick={onClearAll}
          >
            전체삭제
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-end gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.7fr)_minmax(0,0.95fr)]">
        <div className="space-y-2">
          <Label className="text-sm">기공소 선택 <span className="text-destructive">*</span></Label>
          <Popover open={labOpen} onOpenChange={setLabOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={labOpen}
                className="h-11 w-full justify-between text-base"
              >
                <span className="truncate">
                  {selectedLab ? getBusinessLabel(selectedLab) : "기공소를 검색해서 선택하세요"}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[420px] p-0" align="start">
              <Command>
                <CommandInput
                  placeholder="기공소 검색 (사업자명/대표자명/사업자번호/주소)"
                  value={labSearch}
                  onValueChange={(v) => {
                    setLabSearch(v);
                  }}
                />
                <CommandList>
                  {!recentLabsInitialized ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">불러오는 중...</div>
                  ) : null}

                  {recentLabs.length > 0 ? (
                    <CommandGroup heading="최근 전송한 기공소">
                      {recentLabs.map((b) => {
                        const selected = selectedLab?._id === b._id;
                        const rep = String(b.representativeName || "").trim();
                        const bn = String(b.businessNumber || "").trim();
                        const addr = String(b.address || "").trim();
                        const meta = [rep ? `대표: ${rep}` : "", bn ? `사업자: ${bn}` : "", addr || ""]
                          .filter(Boolean)
                          .join(" · ");
                        const searchValue = [b.name, rep, bn, addr].filter(Boolean).join(" ");

                        return (
                          <CommandItem
                            key={`recent-${b._id}`}
                            value={searchValue}
                            onSelect={() => {
                              setSelectedLab(b);
                              setLabOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selected ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <div className="min-w-0">
                              <div className="truncate text-base font-medium">{getBusinessLabel(b)}</div>
                              {meta ? <div className="truncate text-sm text-muted-foreground">{meta}</div> : null}
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  ) : (
                    <div className="px-3 py-2 text-sm text-muted-foreground">최근 전송한 기공소가 없습니다.</div>
                  )}

                  <CommandSeparator />

                  <CommandGroup heading="기공소 검색">
                    {labSearching ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">검색 중...</div>
                    ) : labSearch.trim() ? (
                      labSearchResults.length > 0 ? (
                        labSearchResults.map((b) => {
                          const selected = selectedLab?._id === b._id;
                          const rep = String(b.representativeName || "").trim();
                          const bn = String(b.businessNumber || "").trim();
                          const addr = String(b.address || "").trim();
                          const meta = [rep ? `대표: ${rep}` : "", bn ? `사업자: ${bn}` : "", addr || ""]
                            .filter(Boolean)
                            .join(" · ");
                          const searchValue = [b.name, rep, bn, addr].filter(Boolean).join(" ");

                          return (
                            <CommandItem
                              key={b._id}
                              value={searchValue}
                              onSelect={() => {
                                setSelectedLab(b);
                                setLabOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selected ? "opacity-100" : "opacity-0",
                                )}
                              />
                              <div className="min-w-0">
                                <div className="truncate text-base font-medium">{getBusinessLabel(b)}</div>
                                {meta ? (
                                  <div className="truncate text-sm text-muted-foreground">{meta}</div>
                                ) : null}
                              </div>
                            </CommandItem>
                          );
                        })
                      ) : (
                        <div className="px-3 py-2 text-sm text-muted-foreground">검색 결과가 없습니다.</div>
                      )
                    ) : (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        검색어를 입력하면 기공소를 찾을 수 있습니다.
                      </div>
                    )}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">환자명 <span className="text-destructive">*</span></Label>
          <ImeSafeInput
            value={patientName}
            onChange={setPatientName}
            onComposingChange={(composing) => {
              patientComposingRef.current = composing;
              reportImeComposing();
            }}
            placeholder="예: 홍길동"
            className="h-11 text-base"
          />
        </div>

        <PracticeOrderArrivalDateRangeField
          orderDate={orderDate}
          arrivalDate={arrivalDate}
          arrivalDefaultDays={arrivalDefaultDays}
          onChange={(next) => {
            if (onOrderArrivalDatesChange) {
              onOrderArrivalDatesChange(next);
              return;
            }
            setOrderDate(next.orderDate);
            setArrivalDate(next.arrivalDate);
          }}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <Label className="text-sm">
            보철물 <span className="text-destructive">*</span>
          </Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setProsthesisTypeCatalogDraft(normalizedProsthesisTypes);
                    setProsthesisTypeSettingsDialogOpen(true);
                  }}
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                보철물 목록 설정
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setToothWorks([
                      {
                        toothNumber: "",
                        prosthesisType: defaultProsthesisType,
                        customAbutment: false,
                        bridgeLinkedTeeth: [],
                        ...emptyToothWorkCustomSpecs(),
                      },
                    ]);
                    setLastUsedCustomSpecs(emptyToothWorkCustomSpecs());
                    setCustomSpecsModalTarget(null);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                치아 전체 삭제
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="space-y-2">
          {(() => {
            const byTooth = new Map<string, { row: ToothWorkSelection; originalIndex: number }>();
            toothWorks.forEach((row, originalIndex) => {
              const tooth = String(row.toothNumber || "").trim();
              if (!/^[1-4][1-8]$/.test(tooth)) return;
              if (!byTooth.has(tooth)) byTooth.set(tooth, { row, originalIndex });
            });

            const syncToothNumberLinks = (toothNumber: string, prevRow: ToothWorkSelection) => {
              const adj = getAdjacentTeeth(toothNumber);
              const nextLinks = Array.isArray(prevRow.bridgeLinkedTeeth)
                ? prevRow.bridgeLinkedTeeth.filter((v) => adj.includes(v))
                : [];
              const nextIsLinked = nextLinks.length > 0;
              const prosthesisType = resolveProsthesisTypeForLinkState(
                prevRow.prosthesisType,
                nextIsLinked,
                normalizedProsthesisTypes,
              );
              return {
                ...applyProsthesisTypeToRow(prevRow, prosthesisType),
                toothNumber,
                bridgeLinkedTeeth: nextIsLinked ? nextLinks : [],
              };
            };

            const activateTooth = (toothNumber: string) => {
              setToothWorks((prev) => {
                const existingIdx = prev.findIndex(
                  (row) => String(row.toothNumber || "").trim() === toothNumber,
                );
                if (existingIdx >= 0) return prev;

                const adj = getAdjacentTeeth(toothNumber);
                const bridgeNeighborIdx = prev.findIndex(
                  (row) =>
                    adj.includes(String(row.toothNumber || "").trim()) &&
                    isBridgeLikeProsthesisType(row.prosthesisType),
                );

                const emptyIdx = prev.findIndex(
                  (row) => !/^[1-4][1-8]$/.test(String(row.toothNumber || "").trim()),
                );
                const insertAt = emptyIdx >= 0 ? emptyIdx : prev.length;
                let next = [...prev];
                const base = {
                  toothNumber,
                  prosthesisType: defaultProsthesisType,
                  customAbutment: false,
                  bridgeLinkedTeeth: [] as string[],
                  ...emptyToothWorkCustomSpecs(),
                };
                if (emptyIdx >= 0) next[emptyIdx] = { ...next[emptyIdx], ...base };
                else next.push(base);

                if (bridgeNeighborIdx >= 0) {
                  const neighborTooth = String(next[bridgeNeighborIdx]?.toothNumber || "").trim();
                  const targetIdx = next.findIndex(
                    (row) => String(row.toothNumber || "").trim() === toothNumber,
                  );
                  if (targetIdx >= 0 && neighborTooth) {
                    next = toggleAdjacentBridgeLink(
                      next,
                      bridgeNeighborIdx,
                      toothNumber,
                      true,
                      normalizedProsthesisTypes,
                    );
                  }
                }
                return next;
              });
            };

            const shiftDecade = (decadeKey: string, delta: number, maxOffset: number) => {
              setToothChartOffsets((prev) => {
                const cur = prev[decadeKey] ?? 0;
                const next = Math.min(maxOffset, Math.max(0, cur + delta));
                if (next === cur) return prev;
                return { ...prev, [decadeKey]: next };
              });
            };

            const toggleBridgeBetween = (toothA: string, toothB: string, connect: boolean) => {
              setToothWorks((prev) => {
                const idxA = prev.findIndex(
                  (row) => String(row.toothNumber || "").trim() === toothA,
                );
                const idxB = prev.findIndex(
                  (row) => String(row.toothNumber || "").trim() === toothB,
                );
                if (idxA >= 0) {
                  return toggleAdjacentBridgeLink(
                    prev,
                    idxA,
                    toothB,
                    connect,
                    normalizedProsthesisTypes,
                  );
                }
                if (idxB >= 0) {
                  return toggleAdjacentBridgeLink(
                    prev,
                    idxB,
                    toothA,
                    connect,
                    normalizedProsthesisTypes,
                  );
                }
                return prev;
              });
            };

            return TOOTH_CHART_ROWS.map((decade) => {
              const maxOffset = Math.max(0, decade.teeth.length - TOOTH_CHART_VISIBLE);
              const offset = Math.min(maxOffset, toothChartOffsets[decade.key] ?? 0);
              const visible = decade.teeth.slice(offset, offset + TOOTH_CHART_VISIBLE);

              return (
                <div key={`decade-${decade.key}`} className="flex items-stretch gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-12 w-12 shrink-0 self-center rounded-xl text-slate-500 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-30"
                    disabled={offset <= 0}
                    onClick={() => shiftDecade(decade.key, -1, maxOffset)}
                    aria-label={`${decade.label} 이전`}
                  >
                    <ChevronLeft className="h-8 w-8" strokeWidth={2.25} />
                  </Button>

                  <div className="flex min-w-0 flex-1 items-stretch">
                    {visible.map((toothNumber, visibleIndex) => {
                      const configured = byTooth.get(toothNumber);
                      const chartIdx = decade.teeth.indexOf(toothNumber);
                      const chartNext =
                        chartIdx >= 0 && chartIdx < decade.teeth.length - 1
                          ? decade.teeth[chartIdx + 1]
                          : null;
                      const nextVisible = visible[visibleIndex + 1];
                      const showBridgeControl =
                        Boolean(chartNext) &&
                        nextVisible === chartNext &&
                        (byTooth.has(toothNumber) || byTooth.has(chartNext!));
                      const nextConfigured = chartNext ? byTooth.get(chartNext) : undefined;
                      const bridgeLinked = Boolean(
                        chartNext &&
                          ((configured &&
                            Array.isArray(configured.row.bridgeLinkedTeeth) &&
                            configured.row.bridgeLinkedTeeth.includes(chartNext)) ||
                            (nextConfigured &&
                              Array.isArray(nextConfigured.row.bridgeLinkedTeeth) &&
                              nextConfigured.row.bridgeLinkedTeeth.includes(toothNumber))),
                      );

                      const card = !configured ? (
                        <button
                          type="button"
                          title={`${toothNumber} 선택`}
                          className={cn(
                            "flex w-full flex-col items-center justify-start rounded-xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80 px-1 pt-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition-all",
                            TOOTH_CARD_HEIGHT_CLASS,
                            "hover:border-sky-300 hover:from-sky-50/80 hover:to-white hover:shadow-sm hover:shadow-sky-100/60",
                          )}
                          onClick={() => activateTooth(toothNumber)}
                        >
                          <span className="flex h-9 items-center text-lg font-semibold tabular-nums tracking-tight text-slate-400/90">
                            {toothNumber}
                          </span>
                        </button>
                      ) : null;

                      if (!configured) {
                        const emptyBridgeControl = showBridgeControl ? (
                          <div
                            className={cn(
                              "relative z-20 flex shrink-0 items-center justify-center self-stretch",
                              bridgeLinked
                                ? "w-3.5 border-y border-sky-500 bg-gradient-to-b from-sky-100 via-sky-50 to-white"
                                : "w-5",
                            )}
                          >
                            {bridgeLinked ? (
                              <span
                                aria-hidden
                                className="pointer-events-none absolute inset-y-3 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-sky-400/70"
                              />
                            ) : null}
                            <button
                              type="button"
                              title={
                                bridgeLinked
                                  ? `${toothNumber}–${chartNext} 연결 해제`
                                  : `${toothNumber}–${chartNext} 브리지 연결`
                              }
                              className={cn(
                                "relative z-10 flex h-5 w-5 items-center justify-center rounded-full border shadow-sm transition-colors",
                                bridgeLinked
                                  ? "border-sky-500 bg-sky-500 text-white ring-2 ring-sky-100 hover:bg-sky-600"
                                  : "border-slate-200 bg-white text-slate-500 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700",
                              )}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!chartNext) return;
                                toggleBridgeBetween(toothNumber, chartNext, !bridgeLinked);
                              }}
                            >
                              {bridgeLinked ? (
                                <Minus className="h-3 w-3" strokeWidth={2.5} />
                              ) : (
                                <Plus className="h-3 w-3" strokeWidth={2.5} />
                              )}
                            </button>
                          </div>
                        ) : visibleIndex < visible.length - 1 ? (
                          <div className="w-2 shrink-0" aria-hidden />
                        ) : null;

                        return (
                          <div key={`tooth-slot-${toothNumber}`} className="contents">
                            <div className="min-w-0 flex-1">{card}</div>
                            {emptyBridgeControl}
                          </div>
                        );
                      }

                      const { row, originalIndex } = configured;
                      const adjacentTeeth = getAdjacentTeeth(row.toothNumber);
                      const linkedTeeth = Array.isArray(row.bridgeLinkedTeeth)
                        ? row.bridgeLinkedTeeth.filter((t) => adjacentTeeth.includes(t))
                        : [];
                      const isLinked = linkedTeeth.length > 0;
                      const prosthesisTypeOptions = getProsthesisTypesForLinkState(
                        isLinked,
                        normalizedProsthesisTypes,
                      );
                      const canSelectCustomAbutment = isCustomAbutmentSupportedProsthesisType(
                        row.prosthesisType,
                      );
                      const showCustomDetails =
                        canSelectCustomAbutment && Boolean(row.customAbutment);
                      const implantSummary = formatImplantSummary(row);
                      const abutmentSummary = formatAbutmentSummary(row);
                      const implantCompact = formatImplantCompact(row);
                      const abutmentCompact = formatAbutmentCompact(row);
                      const chartPrev = chartIdx > 0 ? decade.teeth[chartIdx - 1] : null;
                      const linkedChartNext = Boolean(
                        chartNext && linkedTeeth.includes(chartNext),
                      );
                      const linkedChartPrev = Boolean(
                        chartPrev && linkedTeeth.includes(chartPrev),
                      );

                      const bridgeControl = showBridgeControl ? (
                        <div
                          className={cn(
                            "relative z-20 flex shrink-0 items-center justify-center self-stretch",
                            bridgeLinked
                              ? "w-3.5 border-y border-sky-500 bg-gradient-to-b from-sky-100 via-sky-50 to-white"
                              : "w-5",
                          )}
                        >
                          {bridgeLinked ? (
                            <span
                              aria-hidden
                              className="pointer-events-none absolute inset-y-3 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-sky-400/70"
                            />
                          ) : null}
                          <button
                            type="button"
                            title={
                              bridgeLinked
                                ? `${toothNumber}–${chartNext} 연결 해제`
                                : `${toothNumber}–${chartNext} 브리지 연결`
                            }
                            className={cn(
                              "relative z-10 flex h-5 w-5 items-center justify-center rounded-full border shadow-sm transition-colors",
                              bridgeLinked
                                ? "border-sky-500 bg-sky-500 text-white ring-2 ring-sky-100 hover:bg-sky-600"
                                : "border-slate-200 bg-white text-slate-500 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700",
                            )}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!chartNext) return;
                              toggleBridgeBetween(toothNumber, chartNext, !bridgeLinked);
                            }}
                          >
                            {bridgeLinked ? (
                              <Minus className="h-3 w-3" strokeWidth={2.5} />
                            ) : (
                              <Plus className="h-3 w-3" strokeWidth={2.5} />
                            )}
                          </button>
                        </div>
                      ) : visibleIndex < visible.length - 1 ? (
                        <div className="w-2 shrink-0" aria-hidden />
                      ) : null;

                      return (
                        <div key={`tooth-slot-${toothNumber}`} className="contents">
                          <div className="relative min-w-0 flex-1">
                          {linkedChartNext && !showBridgeControl ? (
                            <span
                              aria-hidden
                              className="pointer-events-none absolute right-0 top-1/2 z-20 h-8 w-1.5 -translate-y-1/2 rounded-l-full bg-sky-400/80"
                            />
                          ) : null}
                          {linkedChartPrev && visible[visibleIndex - 1] !== chartPrev ? (
                            <span
                              aria-hidden
                              className="pointer-events-none absolute left-0 top-1/2 z-20 h-8 w-1.5 -translate-y-1/2 rounded-r-full bg-sky-400/80"
                            />
                          ) : null}

                          <div
                            className={cn(
                              "relative flex flex-col items-center justify-start border px-1 pb-1 pt-1.5 shadow-sm",
                              TOOTH_CARD_HEIGHT_CLASS,
                              isLinked
                                ? "border-sky-500 bg-gradient-to-b from-sky-100 via-sky-50/95 to-white ring-1 ring-sky-300/40"
                                : "rounded-xl border-sky-300/90 bg-gradient-to-b from-sky-50 via-white to-sky-50/40 ring-1 ring-sky-200/40",
                              isLinked && !linkedChartPrev && !linkedChartNext && "rounded-xl",
                              isLinked && linkedChartPrev && linkedChartNext && "rounded-none",
                              isLinked && linkedChartPrev && !linkedChartNext && "rounded-r-xl rounded-l-none",
                              isLinked && !linkedChartPrev && linkedChartNext && "rounded-l-xl rounded-r-none",
                              linkedChartPrev && "border-l-0",
                              linkedChartNext && "border-r-0",
                            )}
                          >
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 z-10 h-5 w-5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                              onClick={() => {
                                setCustomSpecsModalTarget((prev) => {
                                  if (prev === null) return prev;
                                  if (prev === originalIndex) return null;
                                  return prev > originalIndex ? prev - 1 : prev;
                                });
                                setToothWorks((prev) => {
                                  const next = prev.filter((_, i) => i !== originalIndex);
                                  if (next.length > 0) return next;
                                  return [
                                    {
                                      toothNumber: "",
                                      prosthesisType: defaultProsthesisType,
                                      customAbutment: false,
                                      bridgeLinkedTeeth: [],
                                      ...emptyToothWorkCustomSpecs(),
                                    },
                                  ];
                                });
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>

                            {/* 1) 치아번호 */}
                            <PracticeToothNumberPicker
                              value={row.toothNumber}
                              tensOptions={toothTensOptions}
                              onesOptions={toothOnesOptions}
                              className="h-9 w-10 shrink-0 border-0 bg-transparent text-lg font-bold tracking-tight text-slate-800 shadow-none hover:bg-sky-100/60"
                              onChange={(nextTooth) => {
                                setToothWorks((prev) => {
                                  const next = [...prev];
                                  next[originalIndex] = syncToothNumberLinks(
                                    nextTooth,
                                    next[originalIndex],
                                  );
                                  return next;
                                });
                              }}
                            />

                            {/* 2) 치아형태 */}
                            <div className="mt-1.5 shrink-0">
                            <Select
                              value={
                                !row.prosthesisType
                                  ? "__empty__"
                                  : prosthesisTypeOptions.includes(row.prosthesisType)
                                    ? row.prosthesisType
                                    : resolveProsthesisTypeForLinkState(
                                        row.prosthesisType,
                                        isLinked,
                                        normalizedProsthesisTypes,
                                      )
                              }
                              onValueChange={(value) => {
                                setToothWorks((prev) => {
                                  const next = [...prev];
                                  const prosthesisType = value === "__empty__" ? "" : value;
                                  const prevType = String(next[originalIndex]?.prosthesisType || "");
                                  const currentTooth = String(
                                    next[originalIndex]?.toothNumber || "",
                                  ).trim();
                                  let keepLinks =
                                    isBridgeLikeProsthesisType(prosthesisType) &&
                                    Array.isArray(next[originalIndex].bridgeLinkedTeeth)
                                      ? next[originalIndex].bridgeLinkedTeeth
                                      : [];

                                  // 브리지/Pontic으로 바꾸면 치식 인접 설정치를 자동 연결
                                  if (
                                    isBridgeLikeProsthesisType(prosthesisType) &&
                                    keepLinks.length === 0 &&
                                    /^[1-4][1-8]$/.test(currentTooth)
                                  ) {
                                    const adj = getAdjacentTeeth(currentTooth);
                                    keepLinks = next
                                      .map((r) => String(r.toothNumber || "").trim())
                                      .filter(
                                        (t, idx) =>
                                          idx !== originalIndex &&
                                          adj.includes(t) &&
                                          /^[1-4][1-8]$/.test(t),
                                      );
                                  }

                                  next[originalIndex] = {
                                    ...applyProsthesisTypeToRow(next[originalIndex], prosthesisType),
                                    bridgeLinkedTeeth: keepLinks,
                                  };

                                  if (
                                    keepLinks.length > 0 &&
                                    isBridgeLikeProsthesisType(prosthesisType)
                                  ) {
                                    for (const linked of keepLinks) {
                                      const peerIdx = next.findIndex(
                                        (r, idx) =>
                                          idx !== originalIndex &&
                                          String(r.toothNumber || "").trim() === linked,
                                      );
                                      if (peerIdx < 0) continue;
                                      const peer = next[peerIdx];
                                      const peerLinks = Array.isArray(peer.bridgeLinkedTeeth)
                                        ? peer.bridgeLinkedTeeth
                                        : [];
                                      const peerType = resolveProsthesisTypeForLinkState(
                                        peer.prosthesisType,
                                        true,
                                        normalizedProsthesisTypes,
                                      );
                                      next[peerIdx] = {
                                        ...applyProsthesisTypeToRow(peer, peerType),
                                        bridgeLinkedTeeth: Array.from(
                                          new Set([...peerLinks, currentTooth]),
                                        ),
                                      };
                                    }
                                  }

                                  const bridgeLikeToNonBridgeLike =
                                    isBridgeLikeProsthesisType(prevType) &&
                                    !isBridgeLikeProsthesisType(prosthesisType) &&
                                    /^[1-4][1-8]$/.test(currentTooth);

                                  if (bridgeLikeToNonBridgeLike) {
                                    for (let i = 0; i < next.length; i += 1) {
                                      if (i === originalIndex) continue;
                                      const links = Array.isArray(next[i].bridgeLinkedTeeth)
                                        ? next[i].bridgeLinkedTeeth
                                        : [];
                                      if (!links.includes(currentTooth)) continue;
                                      const nextLinks = links.filter((v) => v !== currentTooth);
                                      const peerType = resolveProsthesisTypeForLinkState(
                                        next[i].prosthesisType,
                                        nextLinks.length > 0,
                                        normalizedProsthesisTypes,
                                      );
                                      next[i] = {
                                        ...applyProsthesisTypeToRow(next[i], peerType),
                                        bridgeLinkedTeeth: nextLinks,
                                      };
                                    }
                                  }

                                  return next;
                                });
                              }}
                            >
                              <SelectTrigger className="h-5 w-[3.75rem] justify-center gap-0 rounded-md border-sky-200/80 bg-white/80 px-0.5 text-[9px] text-slate-600 shadow-none [&>span]:w-full [&>span]:text-center [&>svg]:hidden">
                                <SelectValue placeholder="형태" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__empty__">형태 선택</SelectItem>
                                {prosthesisTypeOptions.map((type) => (
                                  <SelectItem key={`ptype-${toothNumber}-${type}`} value={type}>
                                    {type}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            </div>

                            {/* 3) 커스텀어벗 · 임플란트 · 스캔바디 */}
                            {canSelectCustomAbutment ? (
                              <div className="mt-2 flex w-full flex-col items-center gap-0 leading-none">
                                <label className="inline-flex h-4 items-center gap-0.5 text-[9px] leading-none text-slate-500">
                                  <input
                                    type="checkbox"
                                    className="h-2.5 w-2.5 accent-sky-600"
                                    checked={Boolean(row.customAbutment)}
                                    onChange={(e) => {
                                      const checked = Boolean(e.target.checked);
                                      if (checked) {
                                        const seed = resolveSeedCustomSpecs(toothWorks, originalIndex);
                                        setToothWorks((prev) => {
                                          const next = [...prev];
                                          next[originalIndex] = {
                                            ...next[originalIndex],
                                            customAbutment: true,
                                            ...seed,
                                          };
                                          return next;
                                        });
                                        if (customSpecsKey(seed) !== emptySpecsKey) {
                                          setLastUsedCustomSpecs(seed);
                                        }
                                        setCustomSpecsModalTarget(originalIndex);
                                      } else {
                                        setToothWorks((prev) => {
                                          const next = [...prev];
                                          next[originalIndex] = {
                                            ...next[originalIndex],
                                            customAbutment: false,
                                            ...emptyToothWorkCustomSpecs(),
                                          };
                                          return next;
                                        });
                                        setCustomSpecsModalTarget((prev) =>
                                          prev === originalIndex ? null : prev,
                                        );
                                      }
                                    }}
                                  />
                                  <span>커스텀</span>
                                </label>

                                {showCustomDetails ? (
                                  <TooltipProvider delayDuration={0}>
                                    <div className="flex w-full flex-col items-stretch px-0.5">
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button
                                            type="button"
                                            className="h-3.5 w-full truncate px-0.5 text-center text-[8px] leading-none text-sky-700 hover:bg-sky-100/70 hover:underline"
                                            onClick={() => setCustomSpecsModalTarget(originalIndex)}
                                          >
                                            {implantCompact || "임플란트"}
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="max-w-[16rem] text-xs">
                                          {implantSummary || "임플란트 선택"}
                                        </TooltipContent>
                                      </Tooltip>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button
                                            type="button"
                                            className="h-3.5 w-full truncate px-0.5 text-center text-[8px] leading-none text-teal-700 hover:bg-teal-50 hover:underline"
                                            onClick={() => setCustomSpecsModalTarget(originalIndex)}
                                          >
                                            {abutmentCompact || "스캔바디"}
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="max-w-[16rem] text-xs">
                                          {abutmentSummary || "스캔바디 선택"}
                                        </TooltipContent>
                                      </Tooltip>
                                    </div>
                                  </TooltipProvider>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                          </div>
                          {bridgeControl}
                        </div>
                      );
                    })}
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-12 w-12 shrink-0 self-center rounded-xl text-slate-500 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-30"
                    disabled={offset >= maxOffset}
                    onClick={() => shiftDecade(decade.key, 1, maxOffset)}
                    aria-label={`${decade.label} 다음`}
                  >
                    <ChevronRight className="h-8 w-8" strokeWidth={2.25} />
                  </Button>
                </div>
              );
            });
          })()}
        </div>
        </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col space-y-2">
        <Label className="text-sm">메모</Label>
        <div
          id={memoInputId}
          className="flex min-h-[9rem] flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-2.5"
        >
          {memoLines.map((line, index) => {
            const lineSuggestions =
              suggestLineIndex === index
                ? suggestionsForActiveLine
                : filterMemoSuggestions(line, memoSnippets);
            const showSuggestions =
              suggestLineIndex === index && lineSuggestions.length > 0;

            return (
              <div key={`memo-line-${index}`} className="relative flex items-center gap-1.5">
                <div className="relative min-w-0 flex-1">
                  <ImeSafeInput
                    ref={(el) => {
                      memoInputRefs.current[index] = el;
                    }}
                    value={line}
                    onChange={(nextValue) => {
                      const nextLines = [...memoLines];
                      nextLines[index] = nextValue;
                      syncMemoLines(nextLines);
                      openMemoSuggestions(index, nextValue);
                    }}
                    onFocus={() => {
                      openMemoSuggestions(index, line);
                    }}
                    onBlur={() => {
                      // 클릭으로 제안을 고를 수 있게 살짝 늦춘다
                      window.setTimeout(() => {
                        rememberMemoSentence(memoInputRefs.current[index]?.value ?? line);
                        if (suggestLineIndex === index) closeMemoSuggestions();
                      }, 120);
                    }}
                    onComposingChange={(composing) => {
                      memoComposingRef.current = composing;
                      reportImeComposing();
                      if (composing) closeMemoSuggestions();
                    }}
                    onCompositionEnd={(e) => {
                      const shouldInsertNewline = pendingMemoNewlineIndexRef.current === index;
                      pendingMemoNewlineIndexRef.current = null;
                      const committed = e.currentTarget.value;
                      if (shouldInsertNewline) {
                        suppressMemoEnterRef.current = true;
                        rememberMemoSentence(committed);
                        insertMemoNewlineAfter(index, committed);
                        closeMemoSuggestions();
                      } else {
                        openMemoSuggestions(index, committed);
                      }
                      window.setTimeout(() => {
                        memoComposingRef.current = false;
                        suppressMemoEnterRef.current = false;
                        reportImeComposing();
                      }, 0);
                    }}
                    onKeyDown={(e) => {
                      if (isNativeImeComposing(e) || memoComposingRef.current) {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (suppressMemoEnterRef.current) return;
                          pendingMemoNewlineIndexRef.current = index;
                        }
                        return;
                      }

                      const open =
                        suggestLineIndex === index &&
                        suggestionsForActiveLine.length > 0;
                      const matches = open ? suggestionsForActiveLine : [];

                      if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                        e.preventDefault();
                        setSuggestActiveIndex((prev) => {
                          if (e.key === "ArrowDown") {
                            return prev + 1 >= matches.length ? 0 : prev + 1;
                          }
                          return prev - 1 < 0 ? matches.length - 1 : prev - 1;
                        });
                        return;
                      }

                      if (open && e.key === "Escape") {
                        e.preventDefault();
                        closeMemoSuggestions();
                        return;
                      }

                      // 제안이 열려 있으면 Enter로 수락. Tab도 동일하게 동작.
                      if (open && (e.key === "Enter" || e.key === "Tab")) {
                        const pick =
                          matches[
                            suggestActiveIndex >= 0 && suggestActiveIndex < matches.length
                              ? suggestActiveIndex
                              : 0
                          ];
                        if (pick) {
                          e.preventDefault();
                          applyMemoSuggestion(index, pick);
                          return;
                        }
                      }

                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (suppressMemoEnterRef.current) return;
                        rememberMemoSentence(e.currentTarget.value);
                        insertMemoNewlineAfter(index, e.currentTarget.value);
                        closeMemoSuggestions();
                        return;
                      }

                      if (
                        e.key === "Backspace" &&
                        !line &&
                        memoLines.length > 1
                      ) {
                        e.preventDefault();
                        closeMemoSuggestions();
                        handleDeleteMemoLine(index);
                      }
                    }}
                    placeholder={
                      index === 0
                        ? "요청사항 입력 (입력 시 문장 제안)"
                        : "추가 문장"
                    }
                    className="h-10 w-full text-sm"
                    autoComplete="off"
                  />
                  {showSuggestions ? (
                    <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-slate-200 bg-white text-slate-900 shadow-lg">
                      <ul className="max-h-48 overflow-y-auto py-1 text-sm">
                        {lineSuggestions.map((snippet, optionIndex) => (
                          <li key={`memo-suggest-${index}-${optionIndex}:${snippet}`}>
                            <button
                              type="button"
                              className={cn(
                                "flex w-full cursor-pointer items-center px-2.5 py-1.5 text-left hover:bg-sky-50 hover:text-sky-900",
                                optionIndex === suggestActiveIndex &&
                                  "bg-sky-50 text-sky-900",
                              )}
                              tabIndex={-1}
                              onMouseDown={(ev) => {
                                ev.preventDefault();
                                applyMemoSuggestion(index, snippet);
                              }}
                              onMouseEnter={() => setSuggestActiveIndex(optionIndex)}
                            >
                              <span className="truncate">{snippet}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 text-slate-400 hover:text-destructive"
                  onClick={() => {
                    closeMemoSuggestions();
                    handleDeleteMemoLine(index);
                  }}
                  aria-label="문장 삭제"
                  title="문장 삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          {memoSnippets.length === 0 ? (
            <p className="px-0.5 text-xs text-slate-400">
              입력한 문장이 쌓이면 자동으로 제안됩니다. Enter로 수락하세요.
            </p>
          ) : null}
        </div>
      </div>

      <Dialog
        open={customSpecsModalTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCustomSpecsModalTarget(null);
        }}
      >
        <DialogContent className="max-h-[92vh] gap-4 overflow-y-auto sm:max-w-3xl">
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="text-lg">
              {`커스텀어벗 설정${
                typeof customSpecsModalTarget === "number" &&
                toothWorks[customSpecsModalTarget]?.toothNumber
                  ? ` (#${toothWorks[customSpecsModalTarget].toothNumber})`
                  : ""
              }`}
            </DialogTitle>
            <DialogDescription className="text-sm">
              임플란트·스캔바디 프리셋을 선택하거나 직접 입력하세요. 자주 쓰는 조합은 프리셋으로 저장할 수 있습니다.
            </DialogDescription>
          </DialogHeader>

          {typeof customSpecsModalTarget === "number" && toothWorks[customSpecsModalTarget] ? (
            <div className="space-y-4">
              {customSpecsKey(lastUsedCustomSpecs) !== emptySpecsKey ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-700">직전에 선택한 규격</p>
                    <span className="text-xs text-slate-400">클릭하면 적용</span>
                  </div>
                  <button
                    type="button"
                    className="w-full truncate rounded-md border border-sky-300 bg-white px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-sky-50"
                    onClick={() =>
                      applyCustomSpecsToTooth(
                        customSpecsModalTarget,
                        pickToothWorkCustomSpecs(lastUsedCustomSpecs, true),
                      )
                    }
                  >
                    {formatCustomSpecsSummary(lastUsedCustomSpecs) || "최근 규격"}
                  </button>
                </div>
              ) : null}
              <PracticeToothImplantFields
                value={pickToothWorkCustomSpecs(toothWorks[customSpecsModalTarget], true)}
                onChange={(nextImplant) => {
                  patchCustomSpecsOnTooth(customSpecsModalTarget, nextImplant);
                }}
                connections={implantConnections}
                favorites={implantFavorites}
                onFavoritesChange={onImplantFavoritesChange}
                presetsFirst
              />
              <PracticeToothAbutmentFields
                heading="스캔바디"
                value={pickToothWorkCustomSpecs(toothWorks[customSpecsModalTarget], true)}
                onChange={(nextAbutment) => {
                  patchCustomSpecsOnTooth(customSpecsModalTarget, nextAbutment);
                }}
                favorites={abutmentFavorites}
                onFavoritesChange={onAbutmentFavoritesChange}
                presetsFirst
              />
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" className="h-10 min-w-[6rem] text-sm" onClick={() => setCustomSpecsModalTarget(null)}>
              완료
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
