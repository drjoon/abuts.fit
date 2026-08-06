import { useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import {
  Check,
  ChevronsUpDown,
  ChevronDown,
  Plus,
  Settings,
  Trash2,
  BookmarkPlus,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { PracticeDateInputField } from "@/shared/components/practice/PracticeDateInputField";
import { getBusinessLabel, type SearchBusinessResult } from "@/pages/practice/hooks/usePracticeTransferStep1";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
// - web/frontend/src/shared/components/practice/PracticeToothImplantFields.tsx
// - web/frontend/src/shared/components/practice/PracticeToothAbutmentFields.tsx

const PRACTICE_MEMO_SNIPPETS_LOCAL_KEY = "practice_transfer_memo_snippets_v1";
const MAX_MEMO_SNIPPETS = 40;

export const normalizeMemoSnippets = (items: unknown): string[] => {
  if (!Array.isArray(items)) return [];
  return Array.from(
    new Set(
      items
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  ).slice(0, MAX_MEMO_SNIPPETS);
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
  arrivalDefaultDays: number;
  setArrivalDefaultDaysDraft: (value: number) => void;
  setArrivalSettingsDialogOpen: (open: boolean) => void;
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
  arrivalDefaultDays,
  setArrivalDefaultDaysDraft,
  setArrivalSettingsDialogOpen,
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
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const orderedToothWorkRows = useOrderedToothWorkRows(toothWorks);
  const defaultProsthesisType = normalizedProsthesisTypes.includes("크라운")
    ? "크라운"
    : normalizedProsthesisTypes[0] || "크라운";
  const [sharedCustomSpecs, setSharedCustomSpecs] = useState(() => emptyToothWorkCustomSpecs());
  const [overrideIndexes, setOverrideIndexes] = useState<Set<number>>(() => new Set());
  const [expandedOverrideIndexes, setExpandedOverrideIndexes] = useState<Set<number>>(
    () => new Set(),
  );
  const sharedSpecsSeededRef = useRef(false);
  const overrideIndexesRef = useRef(overrideIndexes);
  overrideIndexesRef.current = overrideIndexes;
  const isMemoSnippetsControlled = typeof onMemoSnippetsChange === "function";
  const [localMemoSnippets, setLocalMemoSnippets] = useState<string[]>(() => loadLocalMemoSnippets());
  const [editingSnippetIndex, setEditingSnippetIndex] = useState<number | null>(null);
  const [editingSnippetDraft, setEditingSnippetDraft] = useState("");
  const [snippetHint, setSnippetHint] = useState("");
  const [snippetSaving, setSnippetSaving] = useState(false);
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

  const commitMemoSnippets = async (nextRaw: string[]) => {
    const next = normalizeMemoSnippets(nextRaw);
    persistLocalMemoSnippets(next);
    if (isMemoSnippetsControlled) {
      setSnippetSaving(true);
      try {
        await onMemoSnippetsChange?.(next);
      } finally {
        setSnippetSaving(false);
      }
      return;
    }
    setLocalMemoSnippets(next);
  };

  const handleSaveSentence = async (sentence: string) => {
    const text = String(sentence || "").trim();
    if (!text) return;
    if (memoSnippets.some((item) => item.toLowerCase() === text.toLowerCase())) {
      setSnippetHint("이미 저장된 문장입니다.");
      return;
    }
    await commitMemoSnippets([text, ...memoSnippets]);
    setSnippetHint("문장을 저장했습니다.");
  };

  const handleInsertMemoSnippet = (snippet: string) => {
    const text = String(snippet || "").trim();
    if (!text) return;
    const current = String(requestMemo || "");
    const next = current.trim() ? `${current.replace(/\s+$/, "")}\n${text}` : text;
    setRequestMemo(next);
  };

  const handleDeleteMemoSnippet = async (index: number) => {
    const next = memoSnippets.filter((_, idx) => idx !== index);
    await commitMemoSnippets(next);
    if (editingSnippetIndex === index) {
      setEditingSnippetIndex(null);
      setEditingSnippetDraft("");
    }
    setSnippetHint("저장된 문장을 삭제했습니다.");
  };

  const handleStartEditSnippet = (index: number) => {
    setEditingSnippetIndex(index);
    setEditingSnippetDraft(memoSnippets[index] || "");
  };

  const handleConfirmEditSnippet = async () => {
    if (editingSnippetIndex === null) return;
    const nextText = String(editingSnippetDraft || "").trim();
    if (!nextText) {
      setSnippetHint("문장 내용을 입력해주세요.");
      return;
    }
    const next = [...memoSnippets];
    next[editingSnippetIndex] = nextText;
    await commitMemoSnippets(next);
    setEditingSnippetIndex(null);
    setEditingSnippetDraft("");
    setSnippetHint("저장된 문장을 수정했습니다.");
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-sky-50/60 p-4 shadow-[0_4px_12px_rgba(15,23,42,0.03)] transition-all hover:shadow-[0_8px_20px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">의뢰서 작성</h3>
        {onClearAll ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-lg border-slate-200 bg-white"
            onClick={onClearAll}
          >
            전체삭제
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-2 sm:col-span-2">
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
      </div>

      <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PracticeDateInputField
          id={`${memoInputId}-order-date`}
          label="주문일"
          value={orderDate}
          onChange={setOrderDate}
          labelClassName="text-sm"
        />
        <PracticeDateInputField
          id={`${memoInputId}-arrival-date`}
          label="도착일"
          value={arrivalDate}
          min={orderDate || undefined}
          onChange={setArrivalDate}
          labelClassName="text-sm"
          labelAction={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                setArrivalDefaultDaysDraft(arrivalDefaultDays);
                setArrivalSettingsDialogOpen(true);
              }}
              aria-label="도착일 기본값 설정"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          }
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm">
            보철물 <span className="text-destructive">*</span>
          </Label>
          <div className="flex items-center gap-1">
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
                      setExpandedOverrideIndexes(new Set());
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
        </div>

        <div className="space-y-1.5">
          {hasCustomAbutmentTeeth ? (
            <div className="space-y-2 rounded-md border border-sky-200 bg-sky-50/50 px-2.5 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-slate-700">커스텀어벗 공통 설정</p>
                  <p className="text-[11px] text-slate-500">
                    이 환자 커스텀어벗 치아에 함께 적용됩니다. 치아마다 다르면 각 행에서 「이 치아만
                    다르게」를 사용하세요.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => {
                    applySharedSpecsToTeeth(sharedCustomSpecs, { includeOverrides: true });
                    setOverrideIndexes(new Set());
                    setExpandedOverrideIndexes(new Set());
                  }}
                >
                  모든 커스텀어벗 치아에 적용
                </Button>
              </div>
              <PracticeToothImplantFields
                value={sharedCustomSpecs}
                onChange={(nextImplant) => updateSharedCustomSpecs(nextImplant)}
                connections={implantConnections}
                favorites={implantFavorites}
                onFavoritesChange={onImplantFavoritesChange}
              />
              <PracticeToothAbutmentFields
                value={sharedCustomSpecs}
                onChange={(nextAbutment) => updateSharedCustomSpecs(nextAbutment)}
                favorites={abutmentFavorites}
                onFavoritesChange={onAbutmentFavoritesChange}
              />
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
                              setExpandedOverrideIndexes((prevExpanded) => {
                                const copy = new Set(prevExpanded);
                                copy.delete(originalIndex);
                                return copy;
                              });
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
                        setExpandedOverrideIndexes((prevExpanded) => {
                          const remapped = new Set<number>();
                          for (const idx of prevExpanded) {
                            if (idx === originalIndex) continue;
                            remapped.add(idx > originalIndex ? idx - 1 : idx);
                          }
                          return remapped;
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
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-medium",
                            overrideIndexes.has(originalIndex)
                              ? "bg-amber-100 text-amber-800"
                              : "bg-sky-100 text-sky-800",
                          )}
                        >
                          {overrideIndexes.has(originalIndex) ? "개별" : "공통"}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11px] text-slate-600">
                          {formatCustomSpecsSummary(row) || "규격 미선택"}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-[11px]"
                          onClick={() =>
                            setExpandedOverrideIndexes((prev) => {
                              const next = new Set(prev);
                              if (next.has(originalIndex)) next.delete(originalIndex);
                              else next.add(originalIndex);
                              return next;
                            })
                          }
                        >
                          {expandedOverrideIndexes.has(originalIndex)
                            ? "접기"
                            : "이 치아만 다르게"}
                        </Button>
                        {overrideIndexes.has(originalIndex) ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-[11px] text-sky-700"
                            onClick={() => {
                              applySharedSpecsToTeeth(sharedCustomSpecs, {
                                onlyIndex: originalIndex,
                              });
                              setOverrideIndexes((prev) => {
                                const next = new Set(prev);
                                next.delete(originalIndex);
                                return next;
                              });
                              setExpandedOverrideIndexes((prev) => {
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

                      {expandedOverrideIndexes.has(originalIndex) ? (
                        <div className="space-y-1.5">
                          <PracticeToothImplantFields
                            value={pickToothWorkCustomSpecs(row, true)}
                            onChange={(nextImplant) => {
                              setToothWorks((prev) => {
                                const next = [...prev];
                                next[originalIndex] = {
                                  ...next[originalIndex],
                                  customAbutment: true,
                                  ...nextImplant,
                                };
                                return next;
                              });
                              setOverrideIndexes((prev) => new Set(prev).add(originalIndex));
                            }}
                            connections={implantConnections}
                            favorites={implantFavorites}
                            onFavoritesChange={onImplantFavoritesChange}
                          />
                          <PracticeToothAbutmentFields
                            value={pickToothWorkCustomSpecs(row, true)}
                            onChange={(nextAbutment) => {
                              setToothWorks((prev) => {
                                const next = [...prev];
                                next[originalIndex] = {
                                  ...next[originalIndex],
                                  customAbutment: true,
                                  ...nextAbutment,
                                };
                                return next;
                              });
                              setOverrideIndexes((prev) => new Set(prev).add(originalIndex));
                            }}
                            favorites={abutmentFavorites}
                            onFavoritesChange={onAbutmentFavoritesChange}
                          />
                        </div>
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

      <div className="mt-2 flex min-h-0 flex-1 flex-col space-y-1.5">
        <Label className="text-sm">메모</Label>
        <div
          id={memoInputId}
          className="min-h-[5rem] flex-1 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-white/80 p-1.5"
        >
          {memoLines.map((line, index) => {
            const canSave = Boolean(String(line || "").trim());
            return (
              <div key={`memo-line-${index}`} className="flex items-center gap-1">
                <ImeSafeInput
                  ref={(el) => {
                    memoInputRefs.current[index] = el;
                  }}
                  value={line}
                  onChange={(nextValue) => {
                    const nextLines = [...memoLines];
                    nextLines[index] = nextValue;
                    syncMemoLines(nextLines);
                    if (snippetHint) setSnippetHint("");
                  }}
                  onComposingChange={(composing) => {
                    memoComposingRef.current = composing;
                    reportImeComposing();
                  }}
                  onCompositionEnd={(e) => {
                    const shouldInsertNewline = pendingMemoNewlineIndexRef.current === index;
                    pendingMemoNewlineIndexRef.current = null;
                    // compositionend 다음으로 오는 Enter keydown이 중복 줄바꿈하지 않도록 한 틱 유지
                    if (shouldInsertNewline) {
                      suppressMemoEnterRef.current = true;
                      insertMemoNewlineAfter(index, e.currentTarget.value);
                    }
                    window.setTimeout(() => {
                      memoComposingRef.current = false;
                      suppressMemoEnterRef.current = false;
                      reportImeComposing();
                    }, 0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (suppressMemoEnterRef.current) return;
                      // 조합 중 Enter: 확정 후 compositionend에서 줄바꿈 (글자 유실/다음줄 이동 방지)
                      if (isNativeImeComposing(e)) {
                        pendingMemoNewlineIndexRef.current = index;
                        return;
                      }
                      insertMemoNewlineAfter(index, e.currentTarget.value);
                      return;
                    }
                    if (
                      e.key === "Backspace" &&
                      !isNativeImeComposing(e) &&
                      !memoComposingRef.current &&
                      !line &&
                      memoLines.length > 1
                    ) {
                      e.preventDefault();
                      handleDeleteMemoLine(index);
                    }
                  }}
                  placeholder={index === 0 ? "요청사항 입력" : "추가 문장"}
                  className="h-8 text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-sky-600 hover:bg-sky-50 hover:text-sky-700"
                  disabled={!canSave || snippetSaving}
                  onClick={() => void handleSaveSentence(line)}
                  aria-label="문장 저장"
                  title="문장 저장"
                >
                  <BookmarkPlus className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-slate-400 hover:text-destructive"
                  onClick={() => handleDeleteMemoLine(index)}
                  aria-label="문장 삭제"
                  title="문장 삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
        {snippetHint ? <p className="text-xs text-slate-500">{snippetHint}</p> : null}

        <Collapsible open={snippetsOpen} onOpenChange={setSnippetsOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md px-0.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <span>
                저장된 문장
                {memoSnippets.length > 0 ? ` (${memoSnippets.length})` : ""}
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-slate-400 transition-transform",
                  snippetsOpen ? "rotate-180" : "",
                )}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1.5 pt-1">
            {memoSnippets.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-200 px-2 py-2 text-xs text-slate-400">
                문장 옆 저장 아이콘으로 추가
              </p>
            ) : (
              <div className="max-h-[7.5rem] space-y-1 overflow-y-auto pr-1">
                {memoSnippets.map((snippet, index) => {
                  const isEditing = editingSnippetIndex === index;
                  if (isEditing) {
                    return (
                      <div
                        key={`snippet-edit-${index}`}
                        className="flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50/50 px-1.5 py-1"
                      >
                        <Input
                          autoFocus
                          value={editingSnippetDraft}
                          onChange={(e) => setEditingSnippetDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void handleConfirmEditSnippet();
                            }
                            if (e.key === "Escape") {
                              setEditingSnippetIndex(null);
                              setEditingSnippetDraft("");
                            }
                          }}
                          className="h-7 text-xs"
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 shrink-0 px-2 text-xs"
                          disabled={snippetSaving}
                          onClick={() => void handleConfirmEditSnippet()}
                        >
                          확인
                        </Button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={`snippet-${index}:${snippet}`}
                      className="flex items-center gap-1 rounded-md border border-slate-200 bg-white/80 px-1.5 py-1"
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-xs text-slate-700 hover:bg-sky-50"
                        title={snippet}
                        onClick={() => handleInsertMemoSnippet(snippet)}
                      >
                        {snippet}
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-slate-500 hover:text-sky-700"
                        onClick={() => handleStartEditSnippet(index)}
                        aria-label="저장된 문장 수정"
                        title="수정"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-slate-400 hover:text-destructive"
                        disabled={snippetSaving}
                        onClick={() => void handleDeleteMemoSnippet(index)}
                        aria-label="저장된 문장 삭제"
                        title="삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
};
