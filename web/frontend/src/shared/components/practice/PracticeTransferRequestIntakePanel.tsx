import { useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import {
  Check,
  ChevronsUpDown,
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
import type { ImplantConnection } from "@/shared/practice/useImplantConnectionCatalog";
import {
  customSpecsKey,
  emptyToothWorkCustomSpecs,
  formatCustomSpecsSummary,
  pickToothWorkCustomSpecs,
  type PracticeAbutmentFavorite,
  type PracticeImplantFavorite,
} from "@/shared/practice/transferMemo";
import {
  getAdjacentTeeth,
  isBridgeLikeProsthesisType,
  isCustomAbutmentSupportedProsthesisType,
  useOrderedToothWorkRows,
  type ToothWorkSelection,
} from "@/shared/practice/usePracticeToothWorkEditor";

// related files:
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/shared/practice/usePracticeToothWorkEditor.ts
// - web/frontend/src/shared/components/practice/PracticeOrderArrivalDateRangeField.tsx
// - web/frontend/src/shared/components/practice/PracticeToothImplantFields.tsx
// - web/frontend/src/shared/components/practice/PracticeToothAbutmentFields.tsx

const remapIndexSetAfterRemove = (prev: Set<number>, removedIndex: number) => {
  const remapped = new Set<number>();
  for (const idx of prev) {
    if (idx === removedIndex) continue;
    remapped.add(idx > removedIndex ? idx - 1 : idx);
  }
  return remapped;
};

const PRACTICE_MEMO_SNIPPETS_LOCAL_KEY = "practice_transfer_memo_snippets_v1";
const MAX_MEMO_SNIPPETS = 40;
const MAX_MEMO_SUGGESTIONS = 8;
const MEMO_SUGGEST_MIN_CHARS = 1;

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
  const orderedToothWorkRows = useOrderedToothWorkRows(toothWorks);
  const defaultProsthesisType = normalizedProsthesisTypes.includes("크라운")
    ? "크라운"
    : normalizedProsthesisTypes[0] || "크라운";
  const [sharedCustomSpecs, setSharedCustomSpecs] = useState(() => emptyToothWorkCustomSpecs());
  const [overrideIndexes, setOverrideIndexes] = useState<Set<number>>(() => new Set());
  /** null = closed; 'shared' = 공통 설정; number = 치아 개별 설정 */
  const [customSpecsModalTarget, setCustomSpecsModalTarget] = useState<"shared" | number | null>(
    null,
  );
  const sharedSpecsSeededRef = useRef(false);
  const overrideIndexesRef = useRef(overrideIndexes);
  overrideIndexesRef.current = overrideIndexes;
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

  const customAbutmentIndexes = useMemo(
    () =>
      toothWorks
        .map((row, index) => ({ row, index }))
        .filter(
          ({ row }) =>
            Boolean(row.customAbutment) &&
            isCustomAbutmentSupportedProsthesisType(row.prosthesisType),
        )
        .map(({ index }) => index),
    [toothWorks],
  );

  const hasCustomAbutmentTeeth = customAbutmentIndexes.length > 0;

  // 드래프트/동기화로 치아 규격이 들어오면 공통 설정을 한 번 시드하고, 다른 치아는 개별로 표시
  useEffect(() => {
    if (!hasCustomAbutmentTeeth) {
      sharedSpecsSeededRef.current = false;
      return;
    }
    if (sharedSpecsSeededRef.current) return;

    const donorIndex =
      customAbutmentIndexes.find(
        (index) => customSpecsKey(toothWorks[index]) !== emptySpecsKey,
      ) ?? customAbutmentIndexes[0];
    const donorSpecs = pickToothWorkCustomSpecs(toothWorks[donorIndex], true);
    setSharedCustomSpecs(donorSpecs);

    const donorKey = customSpecsKey(donorSpecs);
    const nextOverrides = new Set<number>();
    for (const index of customAbutmentIndexes) {
      if (index === donorIndex) continue;
      if (customSpecsKey(toothWorks[index]) !== donorKey) nextOverrides.add(index);
    }
    setOverrideIndexes(nextOverrides);
    sharedSpecsSeededRef.current = true;
  }, [customAbutmentIndexes, emptySpecsKey, hasCustomAbutmentTeeth, toothWorks]);

  const applySharedSpecsToTeeth = (
    specs: ReturnType<typeof emptyToothWorkCustomSpecs>,
    options?: { includeOverrides?: boolean; onlyIndex?: number },
  ) => {
    const includeOverrides = Boolean(options?.includeOverrides);
    const onlyIndex = options?.onlyIndex;
    setToothWorks((prev) =>
      prev.map((row, index) => {
        if (typeof onlyIndex === "number" && index !== onlyIndex) return row;
        if (
          !row.customAbutment ||
          !isCustomAbutmentSupportedProsthesisType(row.prosthesisType)
        ) {
          return row;
        }
        if (
          !includeOverrides &&
          typeof onlyIndex !== "number" &&
          overrideIndexesRef.current.has(index)
        ) {
          return row;
        }
        return {
          ...row,
          customAbutment: true,
          ...specs,
        };
      }),
    );
  };

  const updateSharedCustomSpecs = (
    patch: Partial<ReturnType<typeof emptyToothWorkCustomSpecs>>,
  ) => {
    const next = {
      ...sharedCustomSpecs,
      ...patch,
    };
    setSharedCustomSpecs(next);
    applySharedSpecsToTeeth(next);
  };

  const resolveSeedCustomSpecs = (
    prev: ToothWorkSelection[],
    excludeIndex?: number,
  ) => {
    if (customSpecsKey(sharedCustomSpecs) !== emptySpecsKey) {
      return pickToothWorkCustomSpecs(sharedCustomSpecs, true);
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
                    setSharedCustomSpecs(emptyToothWorkCustomSpecs());
                    setOverrideIndexes(new Set());
                    setCustomSpecsModalTarget(null);
                    sharedSpecsSeededRef.current = false;
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

        <div className="space-y-1.5">
          {hasCustomAbutmentTeeth ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50/50 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800">커스텀어벗 공통 설정</p>
                <p className="mt-0.5 truncate text-sm text-slate-600">
                  {formatCustomSpecsSummary(sharedCustomSpecs) || "임플란트·스캔바디 정보를 입력하세요"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 text-sm"
                  onClick={() => setCustomSpecsModalTarget("shared")}
                >
                  설정
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 px-3 text-sm"
                  onClick={() => {
                    applySharedSpecsToTeeth(sharedCustomSpecs, { includeOverrides: true });
                    setOverrideIndexes(new Set());
                  }}
                >
                  전체 적용
                </Button>
              </div>
            </div>
          ) : null}

          {orderedToothWorkRows.map(({ row, originalIndex, linkPrev, linkNext }) => {
            const adjacentTeeth = getAdjacentTeeth(row.toothNumber);
            const linkedTeeth = Array.isArray(row.bridgeLinkedTeeth)
              ? row.bridgeLinkedTeeth.filter((t) => adjacentTeeth.includes(t))
              : [];
            const isBridgeLike = isBridgeLikeProsthesisType(row.prosthesisType);
            const canSelectCustomAbutment = isCustomAbutmentSupportedProsthesisType(row.prosthesisType);

            return (
              <div key={`${originalIndex}:${row.toothNumber}:${row.prosthesisType}`} className={showBridgeConnections ? "relative pl-4" : ""}>
                {showBridgeConnections && linkPrev ? <span className="absolute left-[7px] -top-2 h-2 w-[2px] bg-blue-500" /> : null}
                {showBridgeConnections && linkNext ? <span className="absolute left-[7px] -bottom-2 h-2 w-[2px] bg-blue-500" /> : null}
                {showBridgeConnections && (linkPrev || linkNext) ? (
                  <span className="absolute left-[7px] top-0 bottom-0 w-[2px] bg-blue-400" />
                ) : null}
                {showBridgeConnections ? (
                  <span
                    className={cn(
                      "absolute left-[3px] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border",
                      linkPrev || linkNext
                        ? "border-blue-600 bg-blue-500"
                        : "border-slate-300 bg-slate-300",
                    )}
                  />
                ) : null}

                <div className="space-y-1 rounded-md border px-2 py-1.5">
                  <div className="flex items-start gap-1.5 flex-wrap">
                    <div className="grid grid-cols-2 gap-1 pt-0">
                      <Select
                        value={/^[1-4]/.test(row.toothNumber) ? row.toothNumber.slice(0, 1) : "__empty__"}
                        onValueChange={(value) => {
                          setToothWorks((prev) => {
                            const next = [...prev];
                            const ones = /^[1-8]$/.test(next[originalIndex]?.toothNumber?.slice(1, 2) || "")
                              ? next[originalIndex].toothNumber.slice(1, 2)
                              : "";
                            const tens = value === "__empty__" ? "" : value;
                            // 십의 자리 없으면 치아번호 전체 비움(일의 자리만 남는 깨진 값 방지)
                            const toothNumber = !tens ? "" : ones ? `${tens}${ones}` : tens;
                            const adj = getAdjacentTeeth(toothNumber);
                            next[originalIndex] = {
                              ...next[originalIndex],
                              toothNumber,
                              bridgeLinkedTeeth: Array.isArray(next[originalIndex].bridgeLinkedTeeth)
                                ? next[originalIndex].bridgeLinkedTeeth.filter((v) => adj.includes(v))
                                : [],
                            };
                            return next;
                          });
                        }}
                      >
                        <SelectTrigger className="h-8 w-9 justify-center gap-0 px-1 text-sm [&>svg]:hidden">
                          <SelectValue placeholder="1" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__empty__">-</SelectItem>
                          {toothTensOptions.map((digit) => (
                            <SelectItem key={`tooth-tens-${digit}`} value={digit}>
                              {digit}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={/^[1-8]$/.test(row.toothNumber.slice(1, 2)) ? row.toothNumber.slice(1, 2) : "__empty__"}
                        onValueChange={(value) => {
                          setToothWorks((prev) => {
                            const next = [...prev];
                            const tens = /^[1-4]$/.test(next[originalIndex]?.toothNumber?.slice(0, 1) || "")
                              ? next[originalIndex].toothNumber.slice(0, 1)
                              : "";
                            const ones = value === "__empty__" ? "" : value;
                            // 십의 자리 없는 일의 자리만으로는 유효 치아번호가 되지 않게 한다.
                            const toothNumber = !tens ? "" : ones ? `${tens}${ones}` : tens;
                            const adj = getAdjacentTeeth(toothNumber);
                            next[originalIndex] = {
                              ...next[originalIndex],
                              toothNumber,
                              bridgeLinkedTeeth: Array.isArray(next[originalIndex].bridgeLinkedTeeth)
                                ? next[originalIndex].bridgeLinkedTeeth.filter((v) => adj.includes(v))
                                : [],
                            };
                            return next;
                          });
                        }}
                      >
                        <SelectTrigger className="h-8 w-9 justify-center gap-0 px-1 text-sm [&>svg]:hidden">
                          <SelectValue placeholder="1" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__empty__">-</SelectItem>
                          {toothOnesOptions.map((digit) => (
                            <SelectItem key={`tooth-ones-${digit}`} value={digit}>
                              {digit}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col items-center gap-1">
                      <Select
                        value={row.prosthesisType || "__empty__"}
                        onValueChange={(value) => {
                          setToothWorks((prev) => {
                            const next = [...prev];
                            const prosthesisType = value === "__empty__" ? "" : value;
                            const prevType = String(next[originalIndex]?.prosthesisType || "");
                            const currentTooth = String(next[originalIndex]?.toothNumber || "").trim();

                            next[originalIndex] = {
                              ...next[originalIndex],
                              prosthesisType,
                              customAbutment: isCustomAbutmentSupportedProsthesisType(prosthesisType)
                                ? Boolean(next[originalIndex].customAbutment)
                                : false,
                              bridgeLinkedTeeth: isBridgeLikeProsthesisType(prosthesisType)
                                ? Array.isArray(next[originalIndex].bridgeLinkedTeeth)
                                  ? next[originalIndex].bridgeLinkedTeeth
                                  : []
                                : [],
                              ...(isCustomAbutmentSupportedProsthesisType(prosthesisType) &&
                              next[originalIndex].customAbutment
                                ? pickToothWorkCustomSpecs(next[originalIndex], true)
                                : emptyToothWorkCustomSpecs()),
                            };

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
                                next[i] = {
                                  ...next[i],
                                  bridgeLinkedTeeth: links.filter((v) => v !== currentTooth),
                                };
                              }
                            }

                            return next;
                          });
                        }}
                      >
                        <SelectTrigger className={cn("h-8 px-2 text-sm", prosthesisTypeSelectWidthClassName)}>
                          <SelectValue placeholder="형태" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__empty__">형태 선택</SelectItem>
                          {normalizedProsthesisTypes.map((type) => (
                            <SelectItem key={`ptype-${type}`} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {isBridgeLike ? (
                        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                          <span className="whitespace-nowrap">연결할 치아</span>
                          {adjacentTeeth.map((adjTooth) => (
                            <label
                              key={`adj-${originalIndex}-${adjTooth}`}
                              className="inline-flex items-center gap-1 text-foreground"
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4"
                                checked={linkedTeeth.includes(adjTooth)}
                                onChange={(e) => {
                                  const checked = Boolean(e.target.checked);
                                  setToothWorks((prev) => {
                                    const next = [...prev];
                                    const currentTooth = String(next[originalIndex]?.toothNumber || "").trim();
                                    const currentLinks = Array.isArray(next[originalIndex].bridgeLinkedTeeth)
                                      ? next[originalIndex].bridgeLinkedTeeth
                                      : [];

                                    next[originalIndex] = {
                                      ...next[originalIndex],
                                      bridgeLinkedTeeth: checked
                                        ? Array.from(new Set([...currentLinks, adjTooth]))
                                        : currentLinks.filter((v) => v !== adjTooth),
                                    };

                                    const pairedIdx = next.findIndex(
                                      (pairedRow, rowIdx) =>
                                        rowIdx !== originalIndex && pairedRow.toothNumber === adjTooth,
                                    );

                                    if (checked) {
                                      if (pairedIdx >= 0) {
                                        const paired = next[pairedIdx];
                                        const pairedLinks = Array.isArray(paired.bridgeLinkedTeeth)
                                          ? paired.bridgeLinkedTeeth
                                          : [];
                                        const pairedType = isBridgeLikeProsthesisType(row.prosthesisType)
                                          ? row.prosthesisType
                                          : "브리지";
                                        next[pairedIdx] = {
                                          ...paired,
                                          prosthesisType: pairedType,
                                          customAbutment: isCustomAbutmentSupportedProsthesisType(pairedType)
                                            ? Boolean(paired.customAbutment)
                                            : false,
                                          bridgeLinkedTeeth: currentTooth
                                            ? Array.from(new Set([...pairedLinks, currentTooth]))
                                            : pairedLinks,
                                          ...(isCustomAbutmentSupportedProsthesisType(pairedType) &&
                                          paired.customAbutment
                                            ? pickToothWorkCustomSpecs(paired, true)
                                            : emptyToothWorkCustomSpecs()),
                                        };
                                      } else {
                                        next.push({
                                          toothNumber: adjTooth,
                                          prosthesisType: isBridgeLikeProsthesisType(row.prosthesisType)
                                            ? row.prosthesisType
                                            : "브리지",
                                          customAbutment: false,
                                          bridgeLinkedTeeth: currentTooth ? [currentTooth] : [],
                                          ...emptyToothWorkCustomSpecs(),
                                        });
                                      }
                                    } else if (pairedIdx >= 0 && currentTooth) {
                                      const paired = next[pairedIdx];
                                      const pairedLinks = Array.isArray(paired.bridgeLinkedTeeth)
                                        ? paired.bridgeLinkedTeeth
                                        : [];
                                      next[pairedIdx] = {
                                        ...paired,
                                        bridgeLinkedTeeth: pairedLinks.filter((v) => v !== currentTooth),
                                      };
                                    }

                                    return next;
                                  });
                                }}
                              />
                              <span>{adjTooth}</span>
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {canSelectCustomAbutment ? (
                      <label className="inline-flex h-8 items-center gap-1 text-xs whitespace-nowrap">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5"
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
                              if (customSpecsKey(sharedCustomSpecs) === emptySpecsKey) {
                                setSharedCustomSpecs(seed);
                              }
                              setOverrideIndexes((prevOverrides) => {
                                const copy = new Set(prevOverrides);
                                copy.delete(originalIndex);
                                return copy;
                              });
                              // 체크 시 공통 설정 모달로 임플란트·스캔바디 입력
                              setCustomSpecsModalTarget("shared");
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
                              setOverrideIndexes((prevOverrides) => {
                                const copy = new Set(prevOverrides);
                                copy.delete(originalIndex);
                                return copy;
                              });
                              setCustomSpecsModalTarget((prev) =>
                                prev === originalIndex ? null : prev,
                              );
                            }
                          }}
                        />
                        <span>커스텀어벗</span>
                      </label>
                    ) : null}

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setOverrideIndexes((prevOverrides) => {
                          const remapped = new Set<number>();
                          for (const idx of prevOverrides) {
                            if (idx === originalIndex) continue;
                            remapped.add(idx > originalIndex ? idx - 1 : idx);
                          }
                          return remapped;
                        });
                        setCustomSpecsModalTarget((prev) => {
                          if (prev === null || prev === "shared") return prev;
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
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {canSelectCustomAbutment && row.customAbutment ? (
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <span
                        className={cn(
                          "rounded px-2 py-0.5 text-xs font-medium",
                          overrideIndexes.has(originalIndex)
                            ? "bg-amber-100 text-amber-800"
                            : "bg-sky-100 text-sky-800",
                        )}
                      >
                        {overrideIndexes.has(originalIndex) ? "개별" : "공통"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-600">
                        {formatCustomSpecsSummary(row) || "규격 미선택"}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs"
                        onClick={() => setCustomSpecsModalTarget(originalIndex)}
                      >
                        이 치아만 다르게
                      </Button>
                      {overrideIndexes.has(originalIndex) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2.5 text-xs text-sky-700"
                          onClick={() => {
                            applySharedSpecsToTeeth(sharedCustomSpecs, {
                              onlyIndex: originalIndex,
                            });
                            setOverrideIndexes((prev) => {
                              const next = new Set(prev);
                              next.delete(originalIndex);
                              return next;
                            });
                          }}
                        >
                          공통으로
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() =>
                setToothWorks((prev) => [
                  ...prev,
                  {
                    toothNumber: "",
                    prosthesisType: defaultProsthesisType,
                    customAbutment: false,
                    bridgeLinkedTeeth: [],
                    ...emptyToothWorkCustomSpecs(),
                  },
                ])
              }
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              치아 추가
            </Button>
          </div>
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

                      // IDE식: Tab으로 제안 수락. Enter는 항상 줄바꿈(+학습).
                      if (open && e.key === "Tab") {
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
              입력한 문장이 쌓이면 자동으로 제안됩니다. Tab으로 수락하세요.
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
              {customSpecsModalTarget === "shared"
                ? "커스텀어벗 공통 설정"
                : `커스텀어벗 개별 설정${
                    typeof customSpecsModalTarget === "number" &&
                    toothWorks[customSpecsModalTarget]?.toothNumber
                      ? ` (#${toothWorks[customSpecsModalTarget].toothNumber})`
                      : ""
                  }`}
            </DialogTitle>
            <DialogDescription className="text-sm">
              임플란트와 스캔바디 정보를 입력하세요.
              {customSpecsModalTarget === "shared"
                ? " 공통 값은 커스텀어벗 치아에 함께 적용됩니다."
                : " 이 치아에만 적용됩니다."}
            </DialogDescription>
          </DialogHeader>

          {customSpecsModalTarget !== null ? (
            <div className="space-y-4">
              <PracticeToothImplantFields
                value={
                  customSpecsModalTarget === "shared"
                    ? sharedCustomSpecs
                    : pickToothWorkCustomSpecs(toothWorks[customSpecsModalTarget], true)
                }
                onChange={(nextImplant) => {
                  if (customSpecsModalTarget === "shared") {
                    updateSharedCustomSpecs(nextImplant);
                    return;
                  }
                  const index = customSpecsModalTarget;
                  setToothWorks((prev) => {
                    const next = [...prev];
                    next[index] = {
                      ...next[index],
                      customAbutment: true,
                      ...nextImplant,
                    };
                    return next;
                  });
                  setOverrideIndexes((prev) => new Set(prev).add(index));
                }}
                connections={implantConnections}
                favorites={implantFavorites}
                onFavoritesChange={onImplantFavoritesChange}
              />
              <PracticeToothAbutmentFields
                heading="스캔바디"
                value={
                  customSpecsModalTarget === "shared"
                    ? sharedCustomSpecs
                    : pickToothWorkCustomSpecs(toothWorks[customSpecsModalTarget], true)
                }
                onChange={(nextAbutment) => {
                  if (customSpecsModalTarget === "shared") {
                    updateSharedCustomSpecs(nextAbutment);
                    return;
                  }
                  const index = customSpecsModalTarget;
                  setToothWorks((prev) => {
                    const next = [...prev];
                    next[index] = {
                      ...next[index],
                      customAbutment: true,
                      ...nextAbutment,
                    };
                    return next;
                  });
                  setOverrideIndexes((prev) => new Set(prev).add(index));
                }}
                favorites={abutmentFavorites}
                onFavoritesChange={onAbutmentFavoritesChange}
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
