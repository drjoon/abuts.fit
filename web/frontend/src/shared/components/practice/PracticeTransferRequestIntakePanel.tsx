import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Minus,
  Pin,
  Plus,
  CircleHelp,
  Settings,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImeSafeInput } from "@/shared/components/practice/ImeSafeInput";
import { Label } from "@/components/ui/label";
import { AutoMatchLabFeeBudgetDialog } from "@/shared/components/practice/AutoMatchLabFeeBudgetDialog";
import { AutoMatchMinLabRatingStars } from "@/shared/components/practice/AutoMatchMinLabRatingStars";
import {
  resolveAutoMatchBudgetOrDefaults,
  type AbutsLabFeeCatalogItem,
  type PracticeTransferAutoMatchBudget,
} from "@/shared/practice/autoMatchBudget";
import {
  DEFAULT_AUTO_MATCH_MIN_LAB_RATING,
  normalizeAutoMatchMinLabRating,
} from "@/shared/practice/practiceLabRating";
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
import { cn } from "@/shared/ui/cn";
import { PracticeOrderArrivalDateRangeField } from "@/shared/components/practice/PracticeOrderArrivalDateRangeField";
import {
  AUTO_MATCH_LAB,
  AUTO_MATCH_LAB_TOOLTIP,
  getBusinessLabel,
  isLabPinned,
  isPinnedAbutsRecentLab,
  isAutoMatchLab,
  type SearchBusinessResult,
} from "@/pages/practice/hooks/usePracticeTransferStep1";
import { PracticeToothImplantFields } from "@/shared/components/practice/PracticeToothImplantFields";
import { PracticeToothAbutmentFields } from "@/shared/components/practice/PracticeToothAbutmentFields";
import { PracticeCustomSpecsPresetEditDialog } from "@/shared/components/practice/PracticeCustomSpecsPresetEditDialog";
import type { ImplantConnection } from "@/shared/practice/useImplantConnectionCatalog";
import {
  ABUTMENT_PRODUCT_MODE,
  ABUTMENT_PRODUCT_MODE_LABEL,
  DEFAULT_ACCOUNT_ABUTMENT_PRODUCT_MODE,
  emptyToothWorkCustomSpecs,
  formatAbutmentCompact,
  formatAbutmentSummary,
  formatImplantCompact,
  formatImplantSummary,
  hasCompleteAbutmentPresets,
  isAbutmentProductMode,
  normalizeAccountAbutmentProductMode,
  pickToothWorkCustomSpecs,
  resolveToothAbutmentProductMode,
  type AbutmentProductMode,
  type PracticeAbutmentFavorite,
  type PracticeImplantFavorite,
} from "@/shared/practice/transferMemo";
import {
  normalizeAbutsAbutmentCreditPrices,
} from "@/shared/pricing/abutsAbutmentService";
import { useAbutsAbutmentPricingTier } from "@/shared/pricing/useAbutsAbutmentPricingTier";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import {
  applyCycledLinkedSpanProsthesisType,
  applyProsthesisTypeToRow,
  collectAdjacentBridgeLinks,
  CUSTOM_ABUTMENT_PROSTHESIS_TYPE,
  getAdjacentTeeth,
  getProsthesisTypesForLinkState,
  isCustomAbutmentProsthesisType,
  isCustomAbutmentSupportedProsthesisType,
  isLinkableProsthesisType,
  isMissingToothProsthesisType,
  isRetainerProsthesisType,
  isSpanUniformProsthesisType,
  isTemporaryToothProsthesisType,
  LINKED_PROSTHESIS_TYPES,
  NO_WORK_PROSTHESIS_TYPE,
  NO_WORK_PROSTHESIS_TOOLTIP,
  pruneLinkedSpanProsthesisSnapshot,
  resolveProsthesisTypeForLinkState,
  STANDALONE_PROSTHESIS_TYPES,
  toggleAdjacentBridgeLink,
  type LinkedSpanProsthesisSnapshot,
  type ToothWorkSelection,
} from "@/shared/practice/usePracticeToothWorkEditor";
import { PracticeTransferFeeEstimate } from "@/shared/components/practice/PracticeTransferFeeEstimate";
import { usePracticeTransferFeeQuote } from "@/shared/practice/usePracticeTransferFeeQuote";
import { resolveAdoptedAbutmentKind } from "@/shared/practice/labFeeSchedule";

// related files:
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/shared/practice/usePracticeToothWorkEditor.ts
// - web/frontend/src/shared/components/practice/PracticeOrderArrivalDateRangeField.tsx
// - web/frontend/src/shared/components/practice/PracticeToothImplantFields.tsx
// - web/frontend/src/shared/components/practice/PracticeToothAbutmentFields.tsx
// - web/frontend/src/shared/components/practice/PracticeCustomSpecsPresetEditDialog.tsx
// - web/frontend/src/shared/pricing/abutsAbutmentService.ts
// - 2026-08-13: 기공의뢰 모달=디자인+생산 고정(생산만→어벗생산의뢰). 어벗생산의뢰=생산만 고정(디자인+생산→기공의뢰).
// - 2026-08-13: 생산·디자인+생산 단가를 creditSettings 멤버십/일반값으로 표시.
// - 2026-08-11: 기공소 선택에 "자동 매칭" 옵션(+빠른툴팁) 추가.
// - 2026-08-11: 안내문구 최소화 — 플레이스홀더·메모 도움말·커스텀규격 설명을 즉시툴팁으로.
// - 2026-08-11: 기공의뢰 카드 내 행(섹션) 수직 간격 gap-10.
// - 2026-08-13: 커스텀어벗 설정 모달에 생산만/디자인+생산 배타 선택 + 가격 툴팁.
// - 2026-08-13: 상·하악 사이 견적(크레딧 소비액) + 빠른툴팁 세부내역.
// - 2026-08-15: showLabField/showPatientField/showDateFields — 익스프레스 위저드용 개별 표시.
// - 2026-08-14: 기공소 미선택 시 견적 계산 없이 안내만.
// - 2026-08-14: 생산만/디자인+생산 툴팁을「커스텀어벗 - 어벗츠 자체 제공」(+생산만은 어벗생산의뢰 안내)로 통일.
// - 2026-08-14: 커스텀어벗 설정 모달 가로폭을 프리셋 편집과 같이 max-w-5xl로 맞춘다.
// - 2026-08-14: 환봉 도입 치아는 환봉 단가(0원이면 별도 고지)를 설정 모달에 표시.
// - 2026-08-14: 환봉 요청중 판별용 implantFavorites를 기공비 견적에 전달.
// - 2026-08-13: 커스텀어벗 칸 「설정」제거. 생산/디자인+생산 클릭 시 설정 모달.
// - 2026-08-13: 커스텀어벗 가격 툴팁은 해당 치과 멤버십/일반 한쪽만 안내.
// - 2026-08-13: 커스텀어벗 설정 모달 가격 툴팁은 호버일 때만.
// - 2026-08-13: 단독 보철=인레이/크라운/커스텀어벗. 형태 클릭은 모달 없음.
// - 2026-08-13: 커스텀어벗 모달 기본=디자인+생산. 선택값은 계정 defaultAbutmentProductMode로 저장.
// - 2026-08-13: 커스텀어벗 설정 모달 툴팁에서 월 구독료 삭제. 배송비·부가세는 한 줄.
// - 2026-08-13: 모달 하단 좌측 프리셋 편집(primary), 우측 취소/확인.
// - 2026-08-13: 임플란트·스캔바디 프리셋이 모두 없으면 설정 모달과 함께 프리셋 편집을 연다.
// - 2026-08-13: 임플란트·스캔바디 프리셋을 각각 한 번 고르면 확인과 같이 저장·닫힘.
// - 2026-08-13: 크라운·브리지 아래 어벗 체크박스. 체크 시 설정 모달.
// - 2026-08-13: 커스텀어벗 프리셋 목록은 4개까지 표시, 초과 시 스크롤.
// - 2026-08-13: 형태 글자 클릭(인레이→크라운→커스텀어벗)은 설정 모달을 열지 않음.
// - 2026-08-13: 연결 형태 클릭 순환에 유지장치·임시치아 추가.
// - 2026-08-13: 유지장치=연결 전용. 임시치아=단독·연결.
// - 2026-08-14: 유지장치·임시치아 등 연결 전체 강제 변경 후 복귀 시, 미클릭 치아는 형태·어벗·임플란트까지 복원.
// - 2026-08-13: 어벗 체크·커스텀어벗인데 프리셋 미선택이면 치식 카드 빨강.
// - 2026-08-13: 기공의뢰 치식 카드에서 디자인+생산 라벨 제거(모드는 디자인+생산 고정).
// - 2026-08-13: 형태 글자 클릭은 마키 억제와 별개로 순환(브리지·크라운 여백 클릭 포함).

const PRACTICE_MEMO_SNIPPETS_LOCAL_KEY = "practice_transfer_memo_snippets_v1";
const MAX_MEMO_SNIPPETS = 40;
const MAX_MEMO_SUGGESTIONS = 8;
const MEMO_SUGGEST_MIN_CHARS = 1;
const TOOTH_CHART_VISIBLE = 6;
/** 카드 높이: 커스텀 임플란트/스캔바디 2줄까지 표시한 기준 */
const TOOTH_CARD_HEIGHT_CLASS = "h-[12rem]";

const abutmentServiceOptionsFromPrices = (
  prices: ReturnType<typeof normalizeAbutsAbutmentCreditPrices>,
  kind: "cnc" | "round_bar" = "cnc",
): Array<{
  mode: AbutmentProductMode;
  membershipPrice: number;
  regularPrice: number;
}> =>
  kind === "round_bar"
    ? [
        {
          mode: ABUTMENT_PRODUCT_MODE.PRODUCTION,
          membershipPrice: prices.membershipRoundBarProductionPrice,
          regularPrice: prices.regularRoundBarProductionPrice,
        },
        {
          mode: ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION,
          membershipPrice: prices.membershipRoundBarDesignAndProductionPrice,
          regularPrice: prices.regularRoundBarDesignAndProductionPrice,
        },
      ]
    : [
        {
          mode: ABUTMENT_PRODUCT_MODE.PRODUCTION,
          membershipPrice: prices.membershipProductionPrice,
          regularPrice: prices.regularProductionPrice,
        },
        {
          mode: ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION,
          membershipPrice: prices.membershipDesignAndProductionPrice,
          regularPrice: prices.regularDesignAndProductionPrice,
        },
      ];

/** 다이얼로그 자동포커스로 툴팁이 바로 뜨지 않게, 포인터 호버일 때만 연다. */
const HoverOnlyTooltip = ({
  content,
  children,
}: {
  content: ReactNode;
  children: ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open}>
      <TooltipTrigger
        asChild
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        className="max-w-xs space-y-1 p-3 text-xs leading-relaxed"
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)}
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
};
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

/** 빈 치아 슬롯 클릭·드래그 선택 시 행 추가(이미 있으면 no-op). */
const activateToothInWorks = (
  prev: ToothWorkSelection[],
  toothNumber: string,
  defaultProsthesisType: string,
  prosthesisTypes: string[],
  options?: { autoLinkBridgeNeighbor?: boolean },
): ToothWorkSelection[] => {
  const existingIdx = prev.findIndex(
    (row) => String(row.toothNumber || "").trim() === toothNumber,
  );
  if (existingIdx >= 0) return prev;

  const autoLinkBridgeNeighbor = options?.autoLinkBridgeNeighbor === true;
  const adj = getAdjacentTeeth(toothNumber);
  const bridgeNeighborIdx = autoLinkBridgeNeighbor
    ? prev.findIndex(
        (row) =>
          adj.includes(String(row.toothNumber || "").trim()) &&
          isLinkableProsthesisType(row.prosthesisType),
      )
    : -1;

  const emptyIdx = prev.findIndex(
    (row) => !/^[1-4][1-8]$/.test(String(row.toothNumber || "").trim()),
  );
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
        prosthesisTypes,
      );
    }
  }
  return next;
};

const activateTeethInWorks = (
  prev: ToothWorkSelection[],
  toothNumbers: readonly string[],
  defaultProsthesisType: string,
  prosthesisTypes: string[],
  options?: { autoLinkBridgeNeighbor?: boolean },
): ToothWorkSelection[] => {
  let next = prev;
  for (const toothNumber of toothNumbers) {
    next = activateToothInWorks(
      next,
      toothNumber,
      defaultProsthesisType,
      prosthesisTypes,
      options,
    );
  }
  return next;
};

/** 선택 해제: 브리지 연결 정리 후 행 제거(목록이 비면 빈 행 1개 유지). */
const deactivateToothInWorks = (
  prev: ToothWorkSelection[],
  toothNumber: string,
  defaultProsthesisType: string,
  prosthesisTypes: string[],
): ToothWorkSelection[] => {
  let next = prev;
  let idx = next.findIndex((row) => String(row.toothNumber || "").trim() === toothNumber);
  if (idx < 0) return prev;

  const links = Array.isArray(next[idx].bridgeLinkedTeeth)
    ? [...next[idx].bridgeLinkedTeeth]
    : [];
  for (const adj of links) {
    idx = next.findIndex((row) => String(row.toothNumber || "").trim() === toothNumber);
    if (idx < 0) break;
    next = toggleAdjacentBridgeLink(next, idx, adj, false, prosthesisTypes);
  }

  const removeIdx = next.findIndex(
    (row) => String(row.toothNumber || "").trim() === toothNumber,
  );
  if (removeIdx < 0) return next;
  next = next.filter((_, i) => i !== removeIdx);
  if (next.length === 0) {
    return [
      {
        toothNumber: "",
        prosthesisType: defaultProsthesisType,
        customAbutment: false,
        bridgeLinkedTeeth: [],
        ...emptyToothWorkCustomSpecs(),
      },
    ];
  }
  return next;
};

const deactivateTeethInWorks = (
  prev: ToothWorkSelection[],
  toothNumbers: readonly string[],
  defaultProsthesisType: string,
  prosthesisTypes: string[],
): ToothWorkSelection[] => {
  let next = prev;
  for (const toothNumber of toothNumbers) {
    next = deactivateToothInWorks(next, toothNumber, defaultProsthesisType, prosthesisTypes);
  }
  return next;
};

const applyBridgeLinksInWorks = (
  prev: ToothWorkSelection[],
  bridgeKeys: readonly string[],
  connect: boolean,
  prosthesisTypes: string[],
): ToothWorkSelection[] => {
  let next = prev;
  for (const key of bridgeKeys) {
    const [toothA, toothB] = String(key || "").split("|");
    if (!toothA || !toothB) continue;
    const idxA = next.findIndex((row) => String(row.toothNumber || "").trim() === toothA);
    if (idxA >= 0) {
      next = toggleAdjacentBridgeLink(next, idxA, toothB, connect, prosthesisTypes);
      continue;
    }
    const idxB = next.findIndex((row) => String(row.toothNumber || "").trim() === toothB);
    if (idxB >= 0) {
      next = toggleAdjacentBridgeLink(next, idxB, toothA, connect, prosthesisTypes);
    }
  }
  return next;
};

const matchesLinkedToggleType = (current: string, type: string) => {
  if (type === "Pontic") return /^pontic$/i.test(current);
  if (type === NO_WORK_PROSTHESIS_TYPE) return isMissingToothProsthesisType(current);
  if (type === "유지장치") return isRetainerProsthesisType(current);
  if (type === "임시치아") return isTemporaryToothProsthesisType(current);
  return current === type;
};

/** 선택 치아 클릭: 인레이→크라운→커스텀어벗→임시치아 / 브리지↔Pontic↔작업X↔유지장치↔임시치아 */
const resolveNextProsthesisType = (
  prev: ToothWorkSelection[],
  toothNumber: string,
  prosthesisTypes: string[],
): { index: number; nextType: string } | null => {
  const idx = prev.findIndex((row) => String(row.toothNumber || "").trim() === toothNumber);
  if (idx < 0) return null;
  const row = prev[idx];
  const links = collectAdjacentBridgeLinks(prev, row.toothNumber);
  const isLinked = links.length > 0;
  const options = getProsthesisTypesForLinkState(isLinked, prosthesisTypes);
  if (options.length === 0) return null;

  const current = String(row.prosthesisType || "").trim();
  let nextType: string | null = null;
  if (isLinked) {
    const cycle = LINKED_PROSTHESIS_TYPES.filter((type) =>
      options.some((option) => matchesLinkedToggleType(option, type)),
    );
    if (cycle.length > 0) {
      const currentIdx = cycle.findIndex((type) => matchesLinkedToggleType(current, type));
      nextType = cycle[(currentIdx >= 0 ? currentIdx + 1 : 0) % cycle.length]!;
    }
  }
  if (!nextType) {
    const cycle = STANDALONE_PROSTHESIS_TYPES.filter((type) =>
      options.some((option) =>
        type === CUSTOM_ABUTMENT_PROSTHESIS_TYPE
          ? isCustomAbutmentProsthesisType(option)
          : option === type,
      ),
    ).map((type) =>
      type === CUSTOM_ABUTMENT_PROSTHESIS_TYPE
        ? options.find((option) => isCustomAbutmentProsthesisType(option)) || type
        : type,
    );
    const currentIdx = cycle.findIndex((type) =>
      isCustomAbutmentProsthesisType(type)
        ? isCustomAbutmentProsthesisType(current)
        : type === current,
    );
    nextType =
      cycle.length > 0
        ? cycle[(currentIdx >= 0 ? currentIdx + 1 : 0) % cycle.length]!
        : options[0]!;
  }
  if (!nextType || nextType === current) return null;
  return { index: idx, nextType };
};

const TOOTH_MARQUEE_MOVE_THRESHOLD_PX = 6;

const clientRectsIntersect = (
  a: { left: number; top: number; right: number; bottom: number },
  b: DOMRect,
) =>
  !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);

/** 같은 악궁(상·하) 안에서만 파인더식 Shift 범위 선택 */
const teethInShiftRange = (anchor: string, target: string): string[] => {
  for (const row of TOOTH_CHART_ROWS) {
    const i = row.teeth.indexOf(anchor);
    const j = row.teeth.indexOf(target);
    if (i < 0 || j < 0) continue;
    const [lo, hi] = i <= j ? [i, j] : [j, i];
    return row.teeth.slice(lo, hi + 1) as string[];
  }
  return [target];
};

const isToothOverlayUiTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "[data-no-tooth-marquee], [data-radix-tooltip-content], [data-radix-popper-content-wrapper], [role='tooltip']",
    ),
  );
};

/** 빈 슬롯·선택 카드·브리지 +/−·차트 여백은 마키 허용. 셀렉트·입력 등만 차단 */
const isToothMarqueeBlockedTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return true;
  if (isToothOverlayUiTarget(target)) return true;
  if (target.closest("[data-tooth-slot-empty]")) return false;
  if (target.closest("[data-tooth-slot-selected]")) return false;
  if (target.closest("[data-bridge-link]")) return false;
  if (target.closest("button, input, textarea, select, a, [role='combobox']")) return true;
  return false;
};

/** R=우측(10/40), M=전치부, L=좌측(20/30) — 상·하악 공통 스크롤 오프셋 */
const toothChartOffsetForRegion = (
  region: "R" | "M" | "L",
  teethLength: number,
  visibleCount: number = TOOTH_CHART_VISIBLE,
) => {
  const maxOffset = Math.max(0, teethLength - visibleCount);
  if (region === "R") return 0;
  if (region === "L") return maxOffset;
  return Math.min(maxOffset, Math.max(0, Math.round(maxOffset / 2)));
};

const initialToothChartOffsets = (): Record<string, number> => {
  const next: Record<string, number> = {};
  for (const decade of TOOTH_CHART_ROWS) {
    next[decade.key] = toothChartOffsetForRegion("M", decade.teeth.length);
  }
  return next;
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
  /** false면 기공소·환자명·날짜를 숨기고 보철물·메모만 렌더 (기본 true) */
  showHeaderFields?: boolean;
  /** 헤더 필드 개별 표시. 미지정 시 showHeaderFields 따름 (익스프레스 위저드용) */
  showLabField?: boolean;
  showPatientField?: boolean;
  showDateFields?: boolean;
  /** false면 보철물 치식 섹션 숨김 (기본 true) */
  showProsthesisSection?: boolean;
  /** false면 메모 섹션 숨김 (기본 true) */
  showMemoSection?: boolean;
  /** card: practice transfers 카드 스타일 / plain: 모달 등 상위 카드 안에 임베드 */
  variant?: "card" | "plain";
  /** 크게 보기 버튼 숨김 */
  hideEnlargeButton?: boolean;
  /** compact: 6칸 스크롤 / full: 16칸 전체 표시 (크게 보기와 동일) */
  toothChartDisplayMode?: "compact" | "full";
  /** 상위 Dialog 위에 뜨는 내부 Dialog(커스텀어벗 설정 등) z-index */
  nestedDialogClassName?: string;
  nestedDialogOverlayClassName?: string;
  /** 메모 라벨 위에 렌더 (의뢰비 등) */
  aboveMemoContent?: ReactNode;
  /** 메모 입력 박스 className 덮어쓰기 (높이·스크롤 등) */
  memoBoxClassName?: string;
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
  /** 「고정」섹션(어벗츠 항상 + 사용자 pin) */
  pinnedLabs?: SearchBusinessResult[];
  /** 최근 기공소 목록에서 제거(X) */
  onRemoveRecentLab?: (lab: SearchBusinessResult) => void;
  /** 기공소 고정/해제(어벗츠는 no-op) */
  onTogglePinLab?: (lab: SearchBusinessResult) => void;
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
  onClearAll?: () => void;
  implantConnections?: ImplantConnection[];
  implantFavorites?: PracticeImplantFavorite[];
  onImplantFavoritesChange?: (next: PracticeImplantFavorite[]) => void | Promise<void>;
  /** 프리셋 편집을 열 때 서버 프리셋(도입 스펙)을 다시 불러온다 */
  onPresetEditorOpen?: () => void;
  abutmentFavorites?: PracticeAbutmentFavorite[];
  onAbutmentFavoritesChange?: (next: PracticeAbutmentFavorite[]) => void | Promise<void>;
  /** 계정 커스텀어벗 기본 모드. 신규 선택·모달 초기값 */
  defaultAbutmentProductMode?: AbutmentProductMode;
  onDefaultAbutmentProductModeChange?: (
    next: AbutmentProductMode,
  ) => void | Promise<void>;
  /** 고정 모드. 해당 항목 항상 체크. 다른 항목 클릭은 onAlternateAbutmentModeNavigate */
  lockedAbutmentProductMode?: AbutmentProductMode;
  /** 고정 모드의 반대 항목 클릭 시 이동(기공의뢰↔어벗생산의뢰) */
  onAlternateAbutmentModeNavigate?: () => void;
  /** 값이 바뀌면 치식 차트를 M(전치부) 위치로 되돌린다 (새로 작성 등) */
  toothChartResetNonce?: number;
  /** 상·하악 사이에 견적(크레딧 소비액) 표시. 기공의뢰서만 */
  showFeeEstimate?: boolean;
  /** 자동매칭 기공비 예산(항목별 min/max) */
  autoMatchBudget?: PracticeTransferAutoMatchBudget | null;
  /** 어벗츠 수가 카탈로그 — 예산 모달 항목 SSOT */
  abutsLabFeeCatalog?: AbutsLabFeeCatalogItem[] | null;
  onAutoMatchBudgetChange?: (
    next: PracticeTransferAutoMatchBudget | null,
  ) => void | Promise<void>;
  /** 자동매칭 최소 별(1~3). 전체 치과 평가 평균 기준. 합산 5회 이하·미평가는 차단 안 함. */
  autoMatchMinLabRating?: number;
  onAutoMatchMinLabRatingChange?: (next: number) => void | Promise<void>;
};

export const PracticeTransferRequestIntakePanel = ({
  showHeaderFields = true,
  showLabField: showLabFieldProp,
  showPatientField: showPatientFieldProp,
  showDateFields: showDateFieldsProp,
  showProsthesisSection = true,
  showMemoSection = true,
  variant = "card",
  hideEnlargeButton = false,
  toothChartDisplayMode = "compact",
  nestedDialogClassName,
  nestedDialogOverlayClassName,
  aboveMemoContent,
  memoBoxClassName,
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
  pinnedLabs = [],
  onRemoveRecentLab,
  onTogglePinLab,
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
  onClearAll,
  implantConnections = [],
  implantFavorites = [],
  onImplantFavoritesChange,
  onPresetEditorOpen,
  abutmentFavorites = [],
  onAbutmentFavoritesChange,
  defaultAbutmentProductMode: defaultAbutmentProductModeProp,
  onDefaultAbutmentProductModeChange,
  lockedAbutmentProductMode,
  onAlternateAbutmentModeNavigate,
  toothChartResetNonce = 0,
  showFeeEstimate = false,
  autoMatchBudget = null,
  abutsLabFeeCatalog = null,
  onAutoMatchBudgetChange,
  autoMatchMinLabRating = DEFAULT_AUTO_MATCH_MIN_LAB_RATING,
  onAutoMatchMinLabRatingChange,
}: PracticeTransferRequestIntakePanelProps) => {
  const [autoMatchBudgetOpen, setAutoMatchBudgetOpen] = useState(false);
  const resolvedAutoMatchBudget = resolveAutoMatchBudgetOrDefaults(
    autoMatchBudget,
    abutsLabFeeCatalog,
  );
  const resolvedMinLabRating = normalizeAutoMatchMinLabRating(
    autoMatchMinLabRating,
  );
  const defaultAbutmentProductMode = normalizeAccountAbutmentProductMode(
    defaultAbutmentProductModeProp ?? DEFAULT_ACCOUNT_ABUTMENT_PRODUCT_MODE,
  );
  const lockedMode = isAbutmentProductMode(lockedAbutmentProductMode)
    ? lockedAbutmentProductMode
    : null;
  const applyIntakeProsthesisType = (
    row: ToothWorkSelection,
    prosthesisType: string,
  ) => {
    const next = applyProsthesisTypeToRow(
      row,
      prosthesisType,
      lockedMode ?? defaultAbutmentProductMode,
    );
    if (
      lockedMode &&
      (next.customAbutment || isCustomAbutmentProsthesisType(next.prosthesisType))
    ) {
      return {
        ...next,
        customAbutment: true,
        abutmentProductMode: lockedMode,
      };
    }
    return next;
  };
  const defaultProsthesisType = normalizedProsthesisTypes.includes("크라운")
    ? "크라운"
    : normalizedProsthesisTypes[0] || "크라운";
  const abutmentPricingTier = useAbutsAbutmentPricingTier();
  const { data: systemSettings } = useSystemSettings();
  const { quote: feeQuote } = usePracticeTransferFeeQuote({
    enabled: showFeeEstimate && Boolean(selectedLab),
    labAnchorId: selectedLab?._id,
    toothWorks,
    implantFavorites,
    abutmentPricingTier,
    autoMatchBudget: isAutoMatchLab(selectedLab) ? resolvedAutoMatchBudget : null,
  });
  /** null = closed; number = 해당 치아 커스텀어벗 설정 */
  const [customSpecsModalTarget, setCustomSpecsModalTarget] = useState<number | null>(null);
  const customSpecsAdoptedKind =
    typeof customSpecsModalTarget === "number"
      ? resolveAdoptedAbutmentKind(
          toothWorks[customSpecsModalTarget],
          implantFavorites,
        )
      : "cnc";
  const abutmentServiceOptions = useMemo(
    () =>
      abutmentServiceOptionsFromPrices(
        normalizeAbutsAbutmentCreditPrices(systemSettings?.creditSettings),
        customSpecsAdoptedKind,
      ),
    [customSpecsAdoptedKind, systemSettings?.creditSettings],
  );
  const [customSpecsPresetEditOpen, setCustomSpecsPresetEditOpen] = useState(false);
  const customSpecsPresetEditOpenRef = useRef(false);
  /** 이번 모달에서 임플란트/스캔바디를 각각 클릭 선택했는지 */
  const customSpecsPickSessionRef = useRef({ implant: false, scanbody: false });
  const customSpecsModalSnapshotRef = useRef<{
    index: number;
    row: ToothWorkSelection;
    accountMode: AbutmentProductMode;
  } | null>(null);
  const [toothChartOffsets, setToothChartOffsets] = useState<Record<string, number>>(
    initialToothChartOffsets,
  );
  const [toothChartEnlargeOpen, setToothChartEnlargeOpen] = useState(false);
  const showFullToothChart = toothChartDisplayMode === "full" || toothChartEnlargeOpen;
  const toothChartVisibleCount = showFullToothChart ? 16 : TOOTH_CHART_VISIBLE;
  const showInlineToothChartHeader = !toothChartEnlargeOpen || toothChartDisplayMode === "full";
  const toothChartResetNonceRef = useRef(toothChartResetNonce);
  /** 파인더식 마키·Shift 범위 선택 / 해제 + 브리지 + 히트 */
  const toothChartRef = useRef<HTMLDivElement | null>(null);
  const toothSelectAnchorRef = useRef<string | null>(null);
  const suppressToothClickRef = useRef(false);
  /** 인레이→크라운 직후 어벗 체크박스가 같은 클릭을 받아 모달이 열리는 것 방지 */
  const suppressAbutmentCheckboxUntilRef = useRef(0);
  /** 유지장치·임시치아 진입 직전 치아별 행. 브리지 등으로 복귀 시 미클릭 치아 내용 복원 */
  const linkedSpanTypeSnapshotRef = useRef<LinkedSpanProsthesisSnapshot>({});
  const toothMarqueeSessionRef = useRef<{
    pointerId: number;
    originX: number;
    originY: number;
    lastX: number;
    lastY: number;
    shiftKey: boolean;
    mode: "select" | "deselect";
    startTooth: string | null;
    startBridge: string | null;
    startWasSelected: boolean;
    selectedAtStart: Set<string>;
    moved: boolean;
    active: boolean;
    hitTeeth: Set<string>;
    /** 포인터가 실제로 지나간 + 만 브리지로 친다(마키 사각형에 낀 +는 무시) */
    paintedBridges: Set<string>;
    onMove: ((ev: PointerEvent) => void) | null;
    onUp: ((ev: PointerEvent) => void) | null;
  } | null>(null);
  const [toothMarquee, setToothMarquee] = useState<{
    originX: number;
    originY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const [toothMarqueePreview, setToothMarqueePreview] = useState<{
    mode: "select" | "deselect";
    teeth: ReadonlySet<string>;
    bridges: ReadonlySet<string>;
  } | null>(null);

  const selectedToothSet = useMemo(() => {
    const teeth = new Set<string>();
    for (const row of toothWorks) {
      const tooth = String(row.toothNumber || "").trim();
      if (/^[1-4][1-8]$/.test(tooth)) teeth.add(tooth);
    }
    return teeth;
  }, [toothWorks]);

  const applyToothChartHits = (
    mode: "select" | "deselect",
    toothNumbers: readonly string[],
    bridgeKeys: readonly string[],
  ) => {
    if (toothNumbers.length === 0 && bridgeKeys.length === 0) return;
    setCustomSpecsModalTarget((prev) => {
      if (prev === null || mode !== "deselect") return prev;
      const modalTooth = String(toothWorks[prev]?.toothNumber || "").trim();
      return toothNumbers.includes(modalTooth) ? null : prev;
    });
    setToothWorks((prev) => {
      let next = prev;
      if (mode === "select") {
        // 치아 마키로 잡힌 치아만 선택. 브리지는 양끝이 그 치아 집합 안에 있는 + 만 적용.
        // (+만 클릭/페인트한 경우는 그 양끝을 치아 집합으로 씀)
        const selectedTeeth = new Set(toothNumbers);
        const bridgesToApply: string[] = [];
        if (selectedTeeth.size === 0) {
          for (const key of bridgeKeys) {
            const [toothA, toothB] = String(key || "").split("|");
            if (!toothA || !toothB) continue;
            selectedTeeth.add(toothA);
            selectedTeeth.add(toothB);
            bridgesToApply.push(key);
          }
        } else {
          for (const key of bridgeKeys) {
            const [toothA, toothB] = String(key || "").split("|");
            if (!toothA || !toothB) continue;
            if (selectedTeeth.has(toothA) && selectedTeeth.has(toothB)) {
              bridgesToApply.push(key);
            }
          }
        }
        next = activateTeethInWorks(
          next,
          [...selectedTeeth],
          defaultProsthesisType,
          normalizedProsthesisTypes,
          { autoLinkBridgeNeighbor: false },
        );
        if (bridgesToApply.length > 0) {
          next = applyBridgeLinksInWorks(
            next,
            bridgesToApply,
            true,
            normalizedProsthesisTypes,
          );
        }
      } else {
        next = applyBridgeLinksInWorks(
          next,
          bridgeKeys,
          false,
          normalizedProsthesisTypes,
        );
        next = deactivateTeethInWorks(
          next,
          toothNumbers,
          defaultProsthesisType,
          normalizedProsthesisTypes,
        );
      }
      return next;
    });
  };

  const collectToothMarqueeHits = (
    originX: number,
    originY: number,
    currentX: number,
    currentY: number,
  ) => {
    const chart = toothChartRef.current;
    const teeth = new Set<string>();
    if (!chart) return teeth;
    const box = {
      left: Math.min(originX, currentX),
      right: Math.max(originX, currentX),
      top: Math.min(originY, currentY),
      bottom: Math.max(originY, currentY),
    };
    chart.querySelectorAll("[data-tooth-select]").forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      const tooth = node.getAttribute("data-tooth-select");
      if (!tooth) return;
      if (clientRectsIntersect(box, node.getBoundingClientRect())) teeth.add(tooth);
    });
    return teeth;
  };

  const bridgeKeyUnderPoint = (clientX: number, clientY: number) => {
    const hit = document.elementFromPoint(clientX, clientY);
    if (!(hit instanceof Element)) return null;
    return hit.closest("[data-bridge-link]")?.getAttribute("data-bridge-link") ?? null;
  };

  /** 빠른 드래그로 좁은 + 열을 건너뛰지 않도록 구간 샘플링 */
  const paintBridgesAlongSegment = (
    into: Set<string>,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ) => {
    const dist = Math.hypot(toX - fromX, toY - fromY);
    const steps = Math.max(1, Math.ceil(dist / 4));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const key = bridgeKeyUnderPoint(fromX + (toX - fromX) * t, fromY + (toY - fromY) * t);
      if (key) into.add(key);
    }
  };

  const endToothMarqueeListeners = () => {
    const session = toothMarqueeSessionRef.current;
    if (!session) return;
    if (session.onMove) window.removeEventListener("pointermove", session.onMove);
    if (session.onUp) {
      window.removeEventListener("pointerup", session.onUp);
      window.removeEventListener("pointercancel", session.onUp);
    }
  };

  const handleToothChartPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (isToothMarqueeBlockedTarget(event.target)) return;

    const startEl =
      event.target instanceof Element
        ? (event.target.closest("[data-tooth-select]") as HTMLElement | null)
        : null;
    const startTooth = startEl?.getAttribute("data-tooth-select") ?? null;
    const bridgeEl =
      event.target instanceof Element
        ? (event.target.closest("[data-bridge-link]") as HTMLElement | null)
        : null;
    const startBridge = bridgeEl?.getAttribute("data-bridge-link") ?? null;
    const startWasSelected = Boolean(startTooth && selectedToothSet.has(startTooth));
    const startBridgeConnected = Boolean(
      startBridge && bridgeEl?.getAttribute("data-bridge-linked") === "1",
    );
    const mode: "select" | "deselect" =
      startWasSelected || startBridgeConnected ? "deselect" : "select";

    endToothMarqueeListeners();
    const session = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      shiftKey: event.shiftKey,
      mode,
      startTooth,
      startBridge,
      startWasSelected,
      selectedAtStart: new Set(selectedToothSet),
      moved: false,
      active: false,
      hitTeeth: new Set<string>(),
      paintedBridges: new Set<string>(startBridge ? [startBridge] : []),
      onMove: null as ((ev: PointerEvent) => void) | null,
      onUp: null as ((ev: PointerEvent) => void) | null,
    };
    toothMarqueeSessionRef.current = session;

    const publishPreview = (
      nextMode: "select" | "deselect",
      teeth: Set<string>,
      paintedBridges: Set<string>,
    ) => {
      let mode = nextMode;
      const bridges = new Set<string>();
      if (teeth.size === 0) {
        for (const key of paintedBridges) bridges.add(key);
      } else {
        for (const key of paintedBridges) {
          const [toothA, toothB] = String(key || "").split("|");
          if (toothA && toothB && teeth.has(toothA) && teeth.has(toothB)) {
            bridges.add(key);
          }
        }
      }
      if (
        mode === "select" &&
        teeth.size > 0 &&
        bridges.size === 0 &&
        [...teeth].every((t) => session.selectedAtStart.has(t))
      ) {
        mode = "deselect";
      }
      session.hitTeeth = teeth;
      setToothMarqueePreview({ mode, teeth, bridges });
    };

    const onMove = (ev: PointerEvent) => {
      const current = toothMarqueeSessionRef.current;
      if (!current || current.pointerId !== ev.pointerId) return;
      const dx = ev.clientX - current.originX;
      const dy = ev.clientY - current.originY;
      if (!current.active) {
        if (Math.hypot(dx, dy) < TOOTH_MARQUEE_MOVE_THRESHOLD_PX) return;
        current.active = true;
        current.moved = true;
        suppressToothClickRef.current = true;
      }

      paintBridgesAlongSegment(
        current.paintedBridges,
        current.lastX,
        current.lastY,
        ev.clientX,
        ev.clientY,
      );
      current.lastX = ev.clientX;
      current.lastY = ev.clientY;

      const anchor = toothSelectAnchorRef.current;
      // Shift+드래그: 앵커~현재 치아 범위. 브리지는 포인터가 지나간 + 만.
      if (current.shiftKey && anchor && current.mode === "select") {
        const hit = document.elementFromPoint(ev.clientX, ev.clientY);
        const tooth =
          (hit instanceof Element
            ? hit.closest("[data-tooth-select]")?.getAttribute("data-tooth-select")
            : null) || current.startTooth;
        if (tooth) {
          const range = new Set(teethInShiftRange(anchor, tooth));
          setToothMarquee(null);
          publishPreview(current.mode, range, new Set(current.paintedBridges));
        }
        return;
      }

      const teeth = collectToothMarqueeHits(
        current.originX,
        current.originY,
        ev.clientX,
        ev.clientY,
      );
      setToothMarquee({
        originX: current.originX,
        originY: current.originY,
        currentX: ev.clientX,
        currentY: ev.clientY,
      });
      publishPreview(current.mode, teeth, new Set(current.paintedBridges));
    };

    const onUp = (ev: PointerEvent) => {
      const current = toothMarqueeSessionRef.current;
      if (!current || current.pointerId !== ev.pointerId) return;
      endToothMarqueeListeners();
      toothMarqueeSessionRef.current = null;
      setToothMarquee(null);
      setToothMarqueePreview(null);

      paintBridgesAlongSegment(
        current.paintedBridges,
        current.lastX,
        current.lastY,
        ev.clientX,
        ev.clientY,
      );
      current.lastX = ev.clientX;
      current.lastY = ev.clientY;

      if (current.moved && current.active) {
        let teeth = [...current.hitTeeth];
        const bridges = [...current.paintedBridges];
        const anchor = toothSelectAnchorRef.current;
        if (current.shiftKey && anchor && current.mode === "select") {
          const hit = document.elementFromPoint(ev.clientX, ev.clientY);
          const tooth =
            (hit instanceof Element
              ? hit.closest("[data-tooth-select]")?.getAttribute("data-tooth-select")
              : null) || current.startTooth;
          if (tooth) teeth = teethInShiftRange(anchor, tooth);
        } else {
          teeth = [
            ...collectToothMarqueeHits(
              current.originX,
              current.originY,
              ev.clientX,
              ev.clientY,
            ),
          ];
        }

        let mode = current.mode;
        // 여백에서 시작해 이미 선택된 치아만 긁으면 해제로 전환
        if (
          mode === "select" &&
          teeth.length > 0 &&
          bridges.length === 0 &&
          teeth.every((t) => current.selectedAtStart.has(t))
        ) {
          mode = "deselect";
        }

        applyToothChartHits(mode, teeth, bridges);
        if (teeth.length > 0 && mode === "select") {
          toothSelectAnchorRef.current = teeth[teeth.length - 1] ?? anchor ?? null;
        } else if (mode === "deselect" && current.startTooth) {
          if (toothSelectAnchorRef.current === current.startTooth) {
            toothSelectAnchorRef.current = null;
          }
        }
        window.setTimeout(() => {
          suppressToothClickRef.current = false;
        }, 0);
        return;
      }

      // 클릭(드래그 아님)
      if (current.startBridge) {
        const [toothA, toothB] = current.startBridge.split("|");
        if (toothA && toothB) {
          applyToothChartHits(
            current.mode,
            [],
            [current.startBridge],
          );
        }
        suppressToothClickRef.current = true;
        window.setTimeout(() => {
          suppressToothClickRef.current = false;
        }, 0);
        return;
      }

      if (current.startTooth) {
        if (current.shiftKey && toothSelectAnchorRef.current && current.mode === "select") {
          applyToothChartHits(
            "select",
            teethInShiftRange(toothSelectAnchorRef.current, current.startTooth),
            [],
          );
          toothSelectAnchorRef.current = current.startTooth;
        } else if (current.startWasSelected) {
          // 선택 카드 본체 클릭 → 해제 (형태 토글은 라벨 글자만)
          applyToothChartHits("deselect", [current.startTooth], []);
          if (toothSelectAnchorRef.current === current.startTooth) {
            toothSelectAnchorRef.current = null;
          }
        } else {
          applyToothChartHits("select", [current.startTooth], []);
          toothSelectAnchorRef.current = current.startTooth;
        }
        suppressToothClickRef.current = true;
        window.setTimeout(() => {
          suppressToothClickRef.current = false;
        }, 0);
        return;
      }
      suppressToothClickRef.current = false;
    };

    session.onMove = onMove;
    session.onUp = onUp;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  useEffect(() => {
    return () => {
      endToothMarqueeListeners();
      toothMarqueeSessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  }, []);

  useEffect(() => {
    let overlayPointer = false;
    const onPointerDown = (event: PointerEvent) => {
      if (!isToothOverlayUiTarget(event.target)) return;
      overlayPointer = true;
      suppressToothClickRef.current = true;
    };
    const onPointerUp = () => {
      if (!overlayPointer) return;
      overlayPointer = false;
      window.setTimeout(() => {
        suppressToothClickRef.current = false;
      }, 0);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerUp, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerUp, true);
    };
  }, []);

  useEffect(() => {
    if (toothChartResetNonceRef.current === toothChartResetNonce) return;
    toothChartResetNonceRef.current = toothChartResetNonce;
    linkedSpanTypeSnapshotRef.current = {};
    setToothChartOffsets(initialToothChartOffsets());
  }, [toothChartResetNonce]);

  useEffect(() => {
    linkedSpanTypeSnapshotRef.current = pruneLinkedSpanProsthesisSnapshot(
      linkedSpanTypeSnapshotRef.current,
      toothWorks,
    );
  }, [toothWorks]);

  const requestedToothCount = useMemo(() => {
    const teeth = new Set<string>();
    for (const row of toothWorks) {
      const tooth = String(row.toothNumber || "").trim();
      if (/^[1-4][1-8]$/.test(tooth)) teeth.add(tooth);
    }
    return teeth.size;
  }, [toothWorks]);

  // 연결 여부 ↔ 형태(인레이/크라운/커스텀어벗/임시치아 vs 브리지/Pontic/작업X/유지장치/임시치아) 불일치 보정 (드래프트·구버전 데이터)
  const toothWorkLinkTypeMismatch = useMemo(() => {
    return toothWorks.some((row) => {
      const links = collectAdjacentBridgeLinks(toothWorks, row.toothNumber);
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
        row.customAbutment || isCustomAbutmentProsthesisType(prevType),
      );
      return resolved !== prevType || linksChanged;
    });
  }, [normalizedProsthesisTypes, toothWorks]);

  useEffect(() => {
    if (!toothWorkLinkTypeMismatch) return;
    setToothWorks((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        const links = collectAdjacentBridgeLinks(prev, row.toothNumber);
        const isLinked = links.length > 0;
        const prevType = String(row.prosthesisType || "").trim();
        const prosthesisType =
          !prevType && !isLinked
            ? prevType
            : resolveProsthesisTypeForLinkState(
                prevType,
                isLinked,
                normalizedProsthesisTypes,
                row.customAbutment || isCustomAbutmentProsthesisType(prevType),
              );
        const prevLinks = Array.isArray(row.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : [];
        const linksChanged =
          links.length !== prevLinks.length ||
          links.some((t) => !prevLinks.includes(t)) ||
          prevLinks.some((t) => !links.includes(t));
        if (prosthesisType === prevType && !linksChanged) return row;
        changed = true;
        return {
          ...applyIntakeProsthesisType(row, prosthesisType),
          bridgeLinkedTeeth: isLinked ? links : [],
        };
      });
      return changed ? next : prev;
    });
  }, [defaultAbutmentProductMode, normalizedProsthesisTypes, setToothWorks, toothWorkLinkTypeMismatch]);
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

  const openCustomSpecsModal = (index: number) => {
    const current = toothWorks[index];
    if (current) {
      customSpecsModalSnapshotRef.current = {
        index,
        row: {
          ...current,
          bridgeLinkedTeeth: [...(current.bridgeLinkedTeeth || [])],
        },
        accountMode: defaultAbutmentProductMode,
      };
    } else {
      customSpecsModalSnapshotRef.current = null;
    }
    const hasNoPresets =
      implantFavorites.length === 0 && abutmentFavorites.length === 0;
    customSpecsPresetEditOpenRef.current = hasNoPresets;
    customSpecsPickSessionRef.current = { implant: false, scanbody: false };
    setCustomSpecsPresetEditOpen(hasNoPresets);
    setToothWorks((prev) => {
      const row = prev[index];
      if (!row) return prev;
      const canEnable =
        row.customAbutment ||
        isCustomAbutmentProsthesisType(row.prosthesisType) ||
        row.prosthesisType === "크라운" ||
        row.prosthesisType === "브리지";
      if (!canEnable) return prev;
      const nextMode = lockedMode
        ? lockedMode
        : isAbutmentProductMode(row.abutmentProductMode)
          ? row.abutmentProductMode
          : defaultAbutmentProductMode;
      if (
        row.customAbutment &&
        row.abutmentProductMode === nextMode
      ) {
        return prev;
      }
      const next = [...prev];
      next[index] = {
        ...row,
        customAbutment: true,
        abutmentProductMode: nextMode,
      };
      return next;
    });
    setCustomSpecsModalTarget(index);
  };

  const closeCustomSpecsModal = () => {
    customSpecsPresetEditOpenRef.current = false;
    customSpecsPickSessionRef.current = { implant: false, scanbody: false };
    setCustomSpecsPresetEditOpen(false);
    setCustomSpecsModalTarget(null);
  };

  const restoreCustomSpecsModalSnapshot = () => {
    const snap = customSpecsModalSnapshotRef.current;
    if (!snap) return;
    customSpecsModalSnapshotRef.current = null;
    setToothWorks((prev) => {
      if (!prev[snap.index]) return prev;
      const next = [...prev];
      next[snap.index] = snap.row;
      return next;
    });
    if (snap.accountMode !== defaultAbutmentProductMode) {
      void onDefaultAbutmentProductModeChange?.(snap.accountMode);
    }
  };

  const cancelCustomSpecsModal = () => {
    restoreCustomSpecsModalSnapshot();
    closeCustomSpecsModal();
  };

  const confirmCustomSpecsModal = () => {
    customSpecsModalSnapshotRef.current = null;
    closeCustomSpecsModal();
  };

  const tryConfirmCustomSpecsModalAfterPicks = () => {
    if (customSpecsPresetEditOpenRef.current) return;
    const { implant, scanbody } = customSpecsPickSessionRef.current;
    if (!implant || !scanbody) return;
    confirmCustomSpecsModal();
  };

  const setCustomSpecsPresetEditOpenSafe = (open: boolean) => {
    customSpecsPresetEditOpenRef.current = open;
    setCustomSpecsPresetEditOpen(open);
    if (open) onPresetEditorOpen?.();
    if (!open) tryConfirmCustomSpecsModalAfterPicks();
  };

  const registerCustomSpecsPick = (kind: "implant" | "scanbody" | "both") => {
    const prev = customSpecsPickSessionRef.current;
    customSpecsPickSessionRef.current = {
      implant: prev.implant || kind === "implant" || kind === "both",
      scanbody: prev.scanbody || kind === "scanbody" || kind === "both",
    };
    tryConfirmCustomSpecsModalAfterPicks();
  };

  const patchCustomSpecsOnTooth = (
    index: number,
    patch: Partial<ReturnType<typeof emptyToothWorkCustomSpecs>>,
  ) => {
    const row = toothWorks[index];
    if (!row) return;
    const merged = {
      ...pickToothWorkCustomSpecs(row, true),
      ...patch,
    };
    const implantTouched = (
      ["implantManufacturer", "implantBrand", "implantFamily", "implantType"] as const
    ).some((key) => key in patch);
    const scanbodyTouched = (
      ["abutmentManufacturer", "abutmentDiameter", "abutmentHeight"] as const
    ).some((key) => key in patch);
    setToothWorks((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      next[index] = {
        ...current,
        customAbutment: true,
        ...merged,
      };
      return next;
    });
    if (implantTouched && scanbodyTouched) registerCustomSpecsPick("both");
    else if (implantTouched) registerCustomSpecsPick("implant");
    else if (scanbodyTouched) registerCustomSpecsPick("scanbody");
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

  const memoOnly =
    showMemoSection && !showHeaderFields && !showProsthesisSection;

  const showLabField = showLabFieldProp ?? showHeaderFields;
  const showPatientField = showPatientFieldProp ?? showHeaderFields;
  const showDateFields = showDateFieldsProp ?? showHeaderFields;
  const showAnyHeaderFields = showLabField || showPatientField || showDateFields;
  const headerFieldCount =
    Number(showLabField) + Number(showPatientField) + Number(showDateFields);
  const headerGridClassName =
    headerFieldCount <= 1
      ? "grid grid-cols-1 items-end gap-3 max-w-lg"
      : headerFieldCount === 2
        ? "grid grid-cols-1 items-end gap-3 sm:grid-cols-2"
        : "grid grid-cols-1 items-end gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.7fr)_minmax(0,0.95fr)]";

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col gap-10",
        memoOnly && "h-full flex-1",
        variant === "card" &&
          "rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-primary-soft/60 p-4 shadow-[0_4px_12px_rgba(15,23,42,0.03)] transition-all hover:shadow-[0_8px_20px_rgba(15,23,42,0.06)]",
      )}
    >
      {showAnyHeaderFields && onClearAll ? (
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

      {showAnyHeaderFields ? (
      <div className={headerGridClassName}>
        {showLabField ? (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label className="text-sm">
              기공소 <span className="text-destructive">*</span>
            </Label>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground [&_svg]:size-5"
                    aria-label="자동매칭 기공비 범위 설정"
                    onClick={() => setAutoMatchBudgetOpen(true)}
                  >
                    <SlidersHorizontal />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                  <p>기공비 범위에 맞는 인증 기공소만 자동매칭에 참여합니다.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <AutoMatchMinLabRatingStars
              value={resolvedMinLabRating}
              disabled={!onAutoMatchMinLabRatingChange}
              onChange={(next) => {
                void onAutoMatchMinLabRatingChange?.(next);
              }}
            />
          </div>
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
                  {selectedLab
                    ? isAutoMatchLab(selectedLab)
                      ? AUTO_MATCH_LAB.name
                      : getBusinessLabel(selectedLab)
                    : "기공소 선택"}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[420px] p-0" align="start">
              <Command>
                <CommandInput
                  placeholder="기공소 검색"
                  value={labSearch}
                  onValueChange={(v) => {
                    setLabSearch(v);
                  }}
                />
                <CommandList>
                  <CommandGroup>
                    <CommandItem
                      value={`${AUTO_MATCH_LAB.name} 자동매칭 auto match`}
                      onSelect={() => {
                        setSelectedLab(AUTO_MATCH_LAB);
                        setLabOpen(false);
                      }}
                      className="group items-start py-2.5"
                    >
                      <Check
                        className={cn(
                          "mr-2 mt-0.5 h-4 w-4 shrink-0",
                          isAutoMatchLab(selectedLab)
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="min-w-0 flex-1 text-left">
                            <div className="truncate text-base font-medium">
                              {AUTO_MATCH_LAB.name}
                            </div>
                            <div className="truncate text-sm text-muted-foreground group-data-[selected=true]:text-accent-foreground/85">
                              {AUTO_MATCH_LAB_TOOLTIP}
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent
                          side="right"
                          className="max-w-xs text-xs"
                        >
                          <p>{AUTO_MATCH_LAB_TOOLTIP}</p>
                        </TooltipContent>
                      </Tooltip>
                    </CommandItem>
                  </CommandGroup>

                  <CommandSeparator />

                  {!recentLabsInitialized ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">불러오는 중...</div>
                  ) : null}

                  {pinnedLabs.length > 0 ? (
                    <CommandGroup heading="고정">
                      {pinnedLabs.map((b) => {
                        const selected = selectedLab?._id === b._id;
                        const rep = String(b.representativeName || "").trim();
                        const bn = String(b.businessNumber || "").trim();
                        const addr = String(b.address || "").trim();
                        const meta = [rep ? `대표: ${rep}` : "", bn ? `사업자: ${bn}` : "", addr || ""]
                          .filter(Boolean)
                          .join(" · ");
                        const searchValue = [b.name, rep, bn, addr, "고정"].filter(Boolean).join(" ");
                        const label = getBusinessLabel(b);
                        const systemPinned = isPinnedAbutsRecentLab(b);

                        return (
                          <CommandItem
                            key={`pinned-${b._id}`}
                            value={searchValue}
                            onSelect={() => {
                              setSelectedLab(b);
                              setLabOpen(false);
                            }}
                            className="group items-start py-2.5"
                          >
                            <Check
                              className={cn(
                                "mr-2 mt-0.5 h-4 w-4 shrink-0",
                                selected ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-base font-medium">{label}</div>
                              {meta ? (
                                <div className="truncate text-sm text-muted-foreground group-data-[selected=true]:text-accent-foreground/85">
                                  {meta}
                                </div>
                              ) : null}
                            </div>
                            {onTogglePinLab ? (
                              <button
                                type="button"
                                className={cn(
                                  "ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                                  systemPinned
                                    ? "cursor-default text-primary opacity-80"
                                    : "text-primary hover:bg-muted hover:opacity-100",
                                )}
                                aria-label={
                                  systemPinned
                                    ? `${label} 고정(해제 불가)`
                                    : `${label} 고정 해제`
                                }
                                title={systemPinned ? "항상 고정" : "고정 해제"}
                                disabled={systemPinned}
                                onPointerDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (!systemPinned) onTogglePinLab(b);
                                }}
                              >
                                <Pin className="h-3.5 w-3.5 fill-current" />
                              </button>
                            ) : null}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  ) : null}

                  {recentLabs.length > 0 ? (
                    <CommandGroup heading="최근">
                      {recentLabs.map((b) => {
                        const selected = selectedLab?._id === b._id;
                        const rep = String(b.representativeName || "").trim();
                        const bn = String(b.businessNumber || "").trim();
                        const addr = String(b.address || "").trim();
                        const meta = [rep ? `대표: ${rep}` : "", bn ? `사업자: ${bn}` : "", addr || ""]
                          .filter(Boolean)
                          .join(" · ");
                        const searchValue = [b.name, rep, bn, addr].filter(Boolean).join(" ");
                        const label = getBusinessLabel(b);

                        return (
                          <CommandItem
                            key={`recent-${b._id}`}
                            value={searchValue}
                            onSelect={() => {
                              setSelectedLab(b);
                              setLabOpen(false);
                            }}
                            className="group items-start py-2.5"
                          >
                            <Check
                              className={cn(
                                "mr-2 mt-0.5 h-4 w-4 shrink-0",
                                selected ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-base font-medium">{label}</div>
                              {meta ? (
                                <div className="truncate text-sm text-muted-foreground group-data-[selected=true]:text-accent-foreground/85">
                                  {meta}
                                </div>
                              ) : null}
                            </div>
                            {onTogglePinLab ? (
                              <button
                                type="button"
                                className="ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100"
                                aria-label={`${label} 고정`}
                                title="고정"
                                onPointerDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  onTogglePinLab(b);
                                }}
                              >
                                <Pin className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                            {onRemoveRecentLab ? (
                              <button
                                type="button"
                                className="ml-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100"
                                aria-label={`${label} 최근에서 제거`}
                                title="최근에서 제거"
                                onPointerDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  onRemoveRecentLab(b);
                                }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  ) : null}

                  <CommandSeparator />

                  <CommandGroup heading="검색">
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
                          const label = getBusinessLabel(b);
                          const pinned = isLabPinned(b, pinnedLabs);
                          const systemPinned = isPinnedAbutsRecentLab(b);

                          return (
                            <CommandItem
                              key={b._id}
                              value={searchValue}
                              onSelect={() => {
                                setSelectedLab(b);
                                setLabOpen(false);
                              }}
                              className="group"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4 shrink-0",
                                  selected ? "opacity-100" : "opacity-0",
                                )}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-base font-medium">{label}</div>
                                {meta ? (
                                  <div className="truncate text-sm text-muted-foreground">{meta}</div>
                                ) : null}
                              </div>
                              {onTogglePinLab ? (
                                <button
                                  type="button"
                                  className={cn(
                                    "ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                                    pinned
                                      ? systemPinned
                                        ? "cursor-default text-primary opacity-80"
                                        : "text-primary hover:bg-muted"
                                      : "text-muted-foreground opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100",
                                  )}
                                  aria-label={
                                    systemPinned
                                      ? `${label} 고정(해제 불가)`
                                      : pinned
                                        ? `${label} 고정 해제`
                                        : `${label} 고정`
                                  }
                                  title={
                                    systemPinned
                                      ? "항상 고정"
                                      : pinned
                                        ? "고정 해제"
                                        : "고정"
                                  }
                                  disabled={systemPinned}
                                  onPointerDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (!systemPinned) onTogglePinLab(b);
                                  }}
                                >
                                  <Pin
                                    className={cn(
                                      "h-3.5 w-3.5",
                                      pinned && "fill-current",
                                    )}
                                  />
                                </button>
                              ) : null}
                            </CommandItem>
                          );
                        })
                      ) : (
                        <div className="px-3 py-2 text-sm text-muted-foreground">결과 없음</div>
                      )
                    ) : (
                      <div className="px-3 py-2 text-sm text-muted-foreground">검색어 입력</div>
                    )}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <AutoMatchLabFeeBudgetDialog
            open={autoMatchBudgetOpen}
            onOpenChange={setAutoMatchBudgetOpen}
            value={resolvedAutoMatchBudget}
            catalog={abutsLabFeeCatalog}
            onSave={async (next) => {
              await onAutoMatchBudgetChange?.(next);
            }}
          />
        </div>
        ) : null}

        {showPatientField ? (
        <div className="space-y-2">
          <Label className="text-sm">환자명 <span className="text-destructive">*</span></Label>
          <ImeSafeInput
            value={patientName}
            onChange={setPatientName}
            onComposingChange={(composing) => {
              patientComposingRef.current = composing;
              reportImeComposing();
            }}
            placeholder="환자명"
            className="h-11 text-base"
          />
        </div>
        ) : null}

        {showDateFields ? (
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
        ) : null}
      </div>
      ) : null}

      {showProsthesisSection ? (
      <div className="space-y-2">
        {showInlineToothChartHeader ? (
        <div className="relative flex min-h-8 items-center">
          <div className="flex items-center gap-1">
            <Label className="text-sm">
              보철물{" "}
              <span className="font-normal text-muted-foreground">({requestedToothCount}개)</span>{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex text-muted-foreground/80 transition-colors hover:text-foreground"
                  aria-label="보철물 도움말"
                >
                  <CircleHelp className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                치아 클릭·드래그로 선택. +로 브리지. 형태 글자 클릭으로 종류 변경.
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                title="오른쪽 · 10/40번대"
                className="h-8 w-10 px-0 text-sm font-semibold tabular-nums"
                onClick={() => {
                  setToothChartOffsets(() => {
                    const next: Record<string, number> = {};
                    for (const decade of TOOTH_CHART_ROWS) {
                      next[decade.key] = toothChartOffsetForRegion(
                        "R",
                        decade.teeth.length,
                        toothChartVisibleCount,
                      );
                    }
                    return next;
                  });
                }}
              >
                R
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="한 칸 왼쪽"
                className="h-8 w-8 text-slate-500"
                onClick={() => {
                  setToothChartOffsets((prev) => {
                    const next = { ...prev };
                    for (const decade of TOOTH_CHART_ROWS) {
                      const cur = next[decade.key] ?? 0;
                      next[decade.key] = Math.max(0, cur - 1);
                    }
                    return next;
                  });
                }}
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2.25} />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                title="전치부"
                className="h-8 w-10 px-0 text-sm font-semibold tabular-nums"
                onClick={() => {
                  setToothChartOffsets(() => {
                    const next: Record<string, number> = {};
                    for (const decade of TOOTH_CHART_ROWS) {
                      next[decade.key] = toothChartOffsetForRegion(
                        "M",
                        decade.teeth.length,
                        toothChartVisibleCount,
                      );
                    }
                    return next;
                  });
                }}
              >
                M
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="한 칸 오른쪽"
                className="h-8 w-8 text-slate-500"
                onClick={() => {
                  setToothChartOffsets((prev) => {
                    const next = { ...prev };
                    for (const decade of TOOTH_CHART_ROWS) {
                      const maxOffset = Math.max(
                        0,
                        decade.teeth.length - toothChartVisibleCount,
                      );
                      const cur = next[decade.key] ?? 0;
                      next[decade.key] = Math.min(maxOffset, cur + 1);
                    }
                    return next;
                  });
                }}
              >
                <ChevronRight className="h-5 w-5" strokeWidth={2.25} />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                title="왼쪽 · 20/30번대"
                className="h-8 w-10 px-0 text-sm font-semibold tabular-nums"
                onClick={() => {
                  setToothChartOffsets(() => {
                    const next: Record<string, number> = {};
                    for (const decade of TOOTH_CHART_ROWS) {
                      next[decade.key] = toothChartOffsetForRegion(
                        "L",
                        decade.teeth.length,
                        toothChartVisibleCount,
                      );
                    }
                    return next;
                  });
                }}
              >
                L
              </Button>
            </div>

            <div className="absolute right-0 flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs"
                disabled={requestedToothCount === 0}
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
                  customSpecsModalSnapshotRef.current = null;
                  closeCustomSpecsModal();
                  toothSelectAnchorRef.current = null;
                }}
              >
                전체해제
              </Button>
              {!hideEnlargeButton && toothChartDisplayMode !== "full" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  onClick={() => {
                    setToothChartOffsets(initialToothChartOffsets());
                    setToothChartEnlargeOpen(true);
                  }}
                >
                  크게 보기
                </Button>
              ) : null}
            </div>
        </div>
        ) : null}

        {(() => {
            const byTooth = new Map<string, { row: ToothWorkSelection; originalIndex: number }>();
            toothWorks.forEach((row, originalIndex) => {
              const tooth = String(row.toothNumber || "").trim();
              if (!/^[1-4][1-8]$/.test(tooth)) return;
              if (!byTooth.has(tooth)) byTooth.set(tooth, { row, originalIndex });
            });

            const handleEmptyToothClick = (
              e: ReactMouseEvent<HTMLButtonElement>,
              toothNumber: string,
            ) => {
              if (suppressToothClickRef.current) return;
              if (e.shiftKey && toothSelectAnchorRef.current) {
                applyToothChartHits(
                  "select",
                  teethInShiftRange(toothSelectAnchorRef.current, toothNumber),
                  [],
                );
              } else {
                applyToothChartHits("select", [toothNumber], []);
              }
              toothSelectAnchorRef.current = toothNumber;
            };

            const shiftDecade = (decadeKey: string, delta: number, maxOffset: number) => {
              setToothChartOffsets((prev) => {
                const cur = prev[decadeKey] ?? 0;
                const next = Math.min(maxOffset, Math.max(0, cur + delta));
                if (next === cur) return prev;
                return { ...prev, [decadeKey]: next };
              });
            };

            const chartRows = TOOTH_CHART_ROWS.map((decade) => {
              const maxOffset = Math.max(0, decade.teeth.length - toothChartVisibleCount);
              const offset = Math.min(maxOffset, toothChartOffsets[decade.key] ?? 0);
              const visible = decade.teeth.slice(offset, offset + toothChartVisibleCount);

              return (
                <div key={`decade-${decade.key}`} className="flex items-stretch gap-0.5">
                  {maxOffset > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      data-no-tooth-marquee=""
                      className="h-12 w-12 shrink-0 self-center rounded-xl text-slate-500 hover:bg-primary-soft hover:text-primary-strong disabled:opacity-30"
                      disabled={offset <= 0}
                      onClick={() => shiftDecade(decade.key, -1, maxOffset)}
                      aria-label={`${decade.label} 이전`}
                    >
                      <ChevronLeft className="h-8 w-8" strokeWidth={2.25} />
                    </Button>
                  ) : null}

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
                        Boolean(chartNext) && nextVisible === chartNext;
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
                          title={`${toothNumber} 크라운 선택`}
                          data-tooth-select={toothNumber}
                          data-tooth-slot-empty=""
                          className={cn(
                            "flex w-full touch-none flex-col items-center justify-start rounded-xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80 px-1 pt-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition-all",
                            TOOTH_CARD_HEIGHT_CLASS,
                            "hover:border-primary/70 hover:from-primary-soft/80 hover:to-white hover:shadow-sm hover:shadow-primary-soft/60",
                            toothMarqueePreview?.teeth.has(toothNumber) &&
                              toothMarqueePreview.mode === "select" &&
                              "border-primary/70 from-primary-soft to-white ring-2 ring-primary/70",
                            toothMarqueePreview?.teeth.has(toothNumber) &&
                              toothMarqueePreview.mode === "deselect" &&
                              "border-destructive/80 ring-2 ring-destructive/70",
                          )}
                          onClick={(e) => handleEmptyToothClick(e, toothNumber)}
                        >
                          <span className="flex h-10 items-center text-xl font-semibold tabular-nums tracking-tight text-slate-400/90">
                            {toothNumber}
                          </span>
                        </button>
                      ) : null;

                      if (!configured) {
                        const emptyBridgeControl = showBridgeControl ? (
                          <div
                            data-bridge-link={`${toothNumber}|${chartNext}`}
                            data-bridge-linked={bridgeLinked ? "1" : "0"}
                            className={cn(
                              "relative z-20 flex shrink-0 items-center justify-center self-stretch",
                              bridgeLinked
                                ? "w-3.5 border-y border-primary bg-gradient-to-b from-primary-soft via-primary-soft to-white"
                                : "w-5",
                              toothMarqueePreview?.bridges.has(`${toothNumber}|${chartNext}`) &&
                                toothMarqueePreview.mode === "select" &&
                                "bg-primary-soft/80",
                              toothMarqueePreview?.bridges.has(`${toothNumber}|${chartNext}`) &&
                                toothMarqueePreview.mode === "deselect" &&
                                "bg-destructive-soft/80",
                            )}
                          >
                            {bridgeLinked ? (
                              <span
                                aria-hidden
                                className="pointer-events-none absolute inset-y-3 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-primary/70"
                              />
                            ) : null}
                            <button
                              type="button"
                              data-bridge-link={`${toothNumber}|${chartNext}`}
                              data-bridge-linked={bridgeLinked ? "1" : "0"}
                              title={
                                bridgeLinked
                                  ? `${toothNumber}–${chartNext} 연결 해제`
                                  : `${toothNumber}–${chartNext} 브리지 연결`
                              }
                              className={cn(
                                "relative z-10 flex h-6 w-6 items-center justify-center rounded-full border shadow-sm transition-colors",
                                bridgeLinked
                                  ? "border-primary bg-primary text-white ring-2 ring-primary-soft hover:bg-primary-strong"
                                  : "border-slate-200 bg-white text-slate-500 hover:border-primary/70 hover:bg-primary-soft hover:text-primary-strong",
                                toothMarqueePreview?.bridges.has(`${toothNumber}|${chartNext}`) &&
                                  toothMarqueePreview.mode === "select" &&
                                  "border-primary bg-primary-soft text-primary-strong ring-2 ring-primary/70",
                                toothMarqueePreview?.bridges.has(`${toothNumber}|${chartNext}`) &&
                                  toothMarqueePreview.mode === "deselect" &&
                                  "border-destructive/80 bg-destructive-soft text-destructive ring-2 ring-destructive/80",
                              )}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (suppressToothClickRef.current) return;
                                if (!chartNext) return;
                                const key = `${toothNumber}|${chartNext}`;
                                if (bridgeLinked) {
                                  applyToothChartHits("deselect", [], [key]);
                                } else {
                                  // 양옆 치아 크라운 선택(없으면 생성) 후 브리지 연결
                                  applyToothChartHits("select", [], [key]);
                                }
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
                      const linkedTeeth = collectAdjacentBridgeLinks(toothWorks, row.toothNumber);
                      const isLinked = linkedTeeth.length > 0;
                      const isMissingTooth = isMissingToothProsthesisType(row.prosthesisType);
                      const isCustomType = isCustomAbutmentProsthesisType(row.prosthesisType);
                      const showAbutmentCheckbox =
                        !isMissingTooth &&
                        !isCustomType &&
                        (row.prosthesisType === "크라운" || row.prosthesisType === "브리지");
                      const showCustomDetails =
                        isCustomType ||
                        (isCustomAbutmentSupportedProsthesisType(row.prosthesisType) &&
                          Boolean(row.customAbutment));
                      const missingAbutmentPreset =
                        showCustomDetails && !hasCompleteAbutmentPresets(row);
                      const implantSummary = formatImplantSummary(row);
                      const abutmentSummary = formatAbutmentSummary(row);
                      const implantCompact = formatImplantCompact(row);
                      const abutmentCompact = formatAbutmentCompact(row);
                      const chartPrev = chartIdx > 0 ? decade.teeth[chartIdx - 1] : null;
                      const prevConfigured = chartPrev ? byTooth.get(chartPrev) : undefined;
                      const linkedChartNext = Boolean(
                        chartNext &&
                          (linkedTeeth.includes(chartNext) ||
                            (nextConfigured &&
                              Array.isArray(nextConfigured.row.bridgeLinkedTeeth) &&
                              nextConfigured.row.bridgeLinkedTeeth.includes(toothNumber))),
                      );
                      const linkedChartPrev = Boolean(
                        chartPrev &&
                          (linkedTeeth.includes(chartPrev) ||
                            (prevConfigured &&
                              Array.isArray(prevConfigured.row.bridgeLinkedTeeth) &&
                              prevConfigured.row.bridgeLinkedTeeth.includes(toothNumber))),
                      );

                      const bridgeControl = showBridgeControl ? (
                        <div
                          data-bridge-link={`${toothNumber}|${chartNext}`}
                          data-bridge-linked={bridgeLinked ? "1" : "0"}
                          className={cn(
                            "relative z-20 flex shrink-0 items-center justify-center self-stretch",
                            bridgeLinked
                              ? "w-3.5 border-y border-primary bg-gradient-to-b from-primary-soft via-primary-soft to-white"
                              : "w-5",
                            toothMarqueePreview?.bridges.has(`${toothNumber}|${chartNext}`) &&
                              toothMarqueePreview.mode === "select" &&
                              "bg-primary-soft/80",
                            toothMarqueePreview?.bridges.has(`${toothNumber}|${chartNext}`) &&
                              toothMarqueePreview.mode === "deselect" &&
                              "bg-destructive-soft/80",
                          )}
                        >
                          {bridgeLinked ? (
                            <span
                              aria-hidden
                              className="pointer-events-none absolute inset-y-3 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-primary/70"
                            />
                          ) : null}
                          <button
                            type="button"
                            data-bridge-link={`${toothNumber}|${chartNext}`}
                            data-bridge-linked={bridgeLinked ? "1" : "0"}
                            title={
                              bridgeLinked
                                ? `${toothNumber}–${chartNext} 연결 해제`
                                : `${toothNumber}–${chartNext} 브리지 연결`
                            }
                            className={cn(
                              "relative z-10 flex h-6 w-6 items-center justify-center rounded-full border shadow-sm transition-colors",
                              bridgeLinked
                                ? "border-primary bg-primary text-white ring-2 ring-primary-soft hover:bg-primary-strong"
                                : "border-slate-200 bg-white text-slate-500 hover:border-primary/70 hover:bg-primary-soft hover:text-primary-strong",
                              toothMarqueePreview?.bridges.has(`${toothNumber}|${chartNext}`) &&
                                toothMarqueePreview.mode === "select" &&
                                "border-primary bg-primary-soft text-primary-strong ring-2 ring-primary/70",
                              toothMarqueePreview?.bridges.has(`${toothNumber}|${chartNext}`) &&
                                toothMarqueePreview.mode === "deselect" &&
                                "border-destructive/80 bg-destructive-soft text-destructive ring-2 ring-destructive/80",
                            )}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (suppressToothClickRef.current) return;
                              if (!chartNext) return;
                              const key = `${toothNumber}|${chartNext}`;
                              if (bridgeLinked) {
                                applyToothChartHits("deselect", [], [key]);
                              } else {
                                applyToothChartHits("select", [], [key]);
                              }
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
                              className="pointer-events-none absolute right-0 top-1/2 z-20 h-8 w-1.5 -translate-y-1/2 rounded-l-full bg-primary/80"
                            />
                          ) : null}
                          {linkedChartPrev && visible[visibleIndex - 1] !== chartPrev ? (
                            <span
                              aria-hidden
                              className="pointer-events-none absolute left-0 top-1/2 z-20 h-8 w-1.5 -translate-y-1/2 rounded-r-full bg-primary/80"
                            />
                          ) : null}

                          <div
                            data-tooth-select={toothNumber}
                            data-tooth-slot-selected=""
                            className={cn(
                              "relative flex w-full min-w-0 flex-col items-center justify-start overflow-hidden border px-1 pb-1 pt-1.5 shadow-sm",
                              TOOTH_CARD_HEIGHT_CLASS,
                              isMissingTooth
                                ? isLinked
                                  ? "border-primary bg-slate-50"
                                  : "rounded-xl border-slate-300 bg-slate-50"
                                : missingAbutmentPreset
                                ? isLinked
                                  ? "border-destructive bg-gradient-to-b from-destructive-soft via-destructive-soft/95 to-white ring-1 ring-destructive/40"
                                  : "rounded-xl border-destructive bg-gradient-to-b from-destructive-soft via-white to-destructive-soft/40 ring-1 ring-destructive/40"
                                : isLinked
                                ? "border-primary bg-gradient-to-b from-primary-soft via-primary-soft/95 to-white ring-1 ring-primary/40"
                                : "rounded-xl border-primary/90 bg-gradient-to-b from-primary-soft via-white to-primary-soft/40 ring-1 ring-primary-muted/40",
                              isLinked && !linkedChartPrev && !linkedChartNext && "rounded-xl",
                              isLinked && linkedChartPrev && linkedChartNext && "rounded-none",
                              isLinked && linkedChartPrev && !linkedChartNext && "rounded-r-xl rounded-l-none",
                              isLinked && !linkedChartPrev && linkedChartNext && "rounded-l-xl rounded-r-none",
                              linkedChartPrev && "border-l-0",
                              linkedChartNext && "border-r-0",
                              toothMarqueePreview?.teeth.has(toothNumber) &&
                                toothMarqueePreview.mode === "select" &&
                                "ring-2 ring-primary/80",
                              toothMarqueePreview?.teeth.has(toothNumber) &&
                                toothMarqueePreview.mode === "deselect" &&
                                "ring-2 ring-destructive/80 opacity-80",
                            )}
                          >
                            {isMissingTooth ? (
                              <svg
                                aria-hidden
                                viewBox="0 0 100 100"
                                preserveAspectRatio="none"
                                className="pointer-events-none absolute inset-x-2 top-9 bottom-3 z-[5] text-slate-300/40"
                              >
                                <line
                                  x1="8"
                                  y1="8"
                                  x2="92"
                                  y2="92"
                                  stroke="currentColor"
                                  strokeWidth="10"
                                  strokeLinecap="round"
                                />
                                <line
                                  x1="92"
                                  y1="8"
                                  x2="8"
                                  y2="92"
                                  stroke="currentColor"
                                  strokeWidth="10"
                                  strokeLinecap="round"
                                />
                              </svg>
                            ) : null}

                            {/* 1) 치아번호 (차트 슬롯으로만 선택 — 번호 변경 팝업 없음) */}
                            <span className="relative z-[1] flex h-10 shrink-0 items-center text-xl font-bold tabular-nums tracking-tight text-slate-800">
                              {row.toothNumber}
                            </span>

                            {/* 2) 치아형태 — 글자 클릭 시에만 인레이→크라운→커스텀어벗→임시치아 / 브리지↔Pontic↔작업X↔유지장치↔임시치아 */}
                            {(() => {
                              const typeLabel = isMissingTooth
                                ? NO_WORK_PROSTHESIS_TYPE
                                : row.prosthesisType ||
                                  resolveProsthesisTypeForLinkState(
                                    "",
                                    isLinked,
                                    normalizedProsthesisTypes,
                                  );
                              const typeButton = (
                                <button
                                  type="button"
                                  data-no-tooth-marquee=""
                                  className={cn(
                                    "relative mt-1.5 flex h-7 w-full min-w-0 cursor-pointer items-center justify-center truncate rounded-md px-0.5 text-center text-[11px]",
                                    isMissingTooth
                                      ? "z-20 bg-transparent text-slate-500 hover:bg-transparent"
                                      : "z-[1] text-slate-600 hover:bg-primary-soft hover:text-primary-strong",
                                  )}
                                  title={
                                    isMissingTooth
                                      ? undefined
                                      : isLinked
                                        ? "클릭: 브리지 ↔ Pontic ↔ 작업X ↔ 유지장치 ↔ 임시치아 (유지장치·임시치아는 연결 전체 동일, 복귀 시 미클릭 치아는 원래 내용)"
                                        : "클릭: 인레이 → 크라운 → 커스텀어벗 → 임시치아"
                                  }
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    // 마키 억제는 카드 해제용. 형태 버튼(여백 포함) 클릭은 순환한다.
                                    const resolved = resolveNextProsthesisType(
                                      toothWorks,
                                      toothNumber,
                                      normalizedProsthesisTypes,
                                    );
                                    if (!resolved) return;
                                    setToothWorks((prev) => {
                                      const current = prev[resolved.index];
                                      if (!current) return prev;
                                      const currentType = String(current.prosthesisType || "").trim();
                                      const isLinkedSpan =
                                        collectAdjacentBridgeLinks(prev, current.toothNumber)
                                          .length > 0;
                                      if (
                                        isLinkedSpan &&
                                        (isSpanUniformProsthesisType(resolved.nextType) ||
                                          isSpanUniformProsthesisType(currentType))
                                      ) {
                                        const cycled = applyCycledLinkedSpanProsthesisType(
                                          prev,
                                          current.toothNumber,
                                          resolved.nextType,
                                          linkedSpanTypeSnapshotRef.current,
                                          lockedMode ?? defaultAbutmentProductMode,
                                        );
                                        linkedSpanTypeSnapshotRef.current = cycled.snapshot;
                                        return cycled.rows;
                                      }
                                      const next = [...prev];
                                      next[resolved.index] = applyIntakeProsthesisType(
                                        current,
                                        resolved.nextType,
                                      );
                                      return next;
                                    });
                                    // 형태 글자 클릭은 타입만 순환. 모달은 어벗 체크·상세 클릭에서만.
                                    suppressAbutmentCheckboxUntilRef.current = Date.now() + 500;
                                    if (customSpecsModalTarget === resolved.index) {
                                      customSpecsModalSnapshotRef.current = null;
                                      closeCustomSpecsModal();
                                    }
                                  }}
                                >
                                  {typeLabel}
                                </button>
                              );
                              if (!isMissingTooth) return typeButton;
                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>{typeButton}</TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                                    {NO_WORK_PROSTHESIS_TOOLTIP}
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })()}

                            {/* 3) 크라운·브리지 → 어벗 체크. 커스텀어벗 형태는 상세만 */}
                            {showAbutmentCheckbox ? (
                              <label
                                data-no-tooth-marquee=""
                                title={
                                  missingAbutmentPreset
                                    ? "임플란트·스캔바디 프리셋을 선택해주세요"
                                    : undefined
                                }
                                className={cn(
                                  "mt-2 inline-flex h-5 max-w-full cursor-pointer items-center gap-1 px-0.5 text-[11px] leading-none",
                                  missingAbutmentPreset
                                    ? "text-destructive"
                                    : "text-slate-600",
                                )}
                              >
                                <input
                                  type="checkbox"
                                  className="h-3.5 w-3.5 accent-primary-strong"
                                  checked={Boolean(row.customAbutment)}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (Date.now() < suppressAbutmentCheckboxUntilRef.current) {
                                      e.preventDefault();
                                    }
                                  }}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    if (Date.now() < suppressAbutmentCheckboxUntilRef.current) {
                                      return;
                                    }
                                    if (e.target.checked) {
                                      openCustomSpecsModal(originalIndex);
                                      return;
                                    }
                                    setToothWorks((prev) => {
                                      const current = prev[originalIndex];
                                      if (!current) return prev;
                                      const next = [...prev];
                                      next[originalIndex] = {
                                        ...current,
                                        customAbutment: false,
                                        abutmentProductMode: undefined,
                                        ...emptyToothWorkCustomSpecs(),
                                      };
                                      return next;
                                    });
                                    if (customSpecsModalTarget === originalIndex) {
                                      customSpecsModalSnapshotRef.current = null;
                                      closeCustomSpecsModal();
                                    }
                                  }}
                                />
                                <span className="truncate">어벗</span>
                              </label>
                            ) : null}

                            {/* 4) 임플란트 · 스캔바디. 기공의뢰는 디자인+생산 고정이라 모드 라벨 없음 */}
                            {showCustomDetails ? (
                              <div
                                data-no-tooth-marquee=""
                                className={cn(
                                  "flex w-full flex-col items-center gap-0.5 leading-none",
                                  showAbutmentCheckbox ? "mt-0.5" : "mt-2",
                                )}
                              >
                                <TooltipProvider delayDuration={0}>
                                  <div className="flex w-full flex-col items-stretch gap-0.5 px-0.5">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          className={cn(
                                            "h-5 w-full truncate px-0.5 text-center text-[10px] leading-none hover:underline",
                                            implantCompact
                                              ? "text-primary-strong hover:bg-primary-soft/70"
                                              : missingAbutmentPreset
                                                ? "font-semibold text-destructive hover:bg-destructive-soft"
                                                : "text-primary-strong hover:bg-primary-soft/70",
                                          )}
                                          onClick={() => openCustomSpecsModal(originalIndex)}
                                        >
                                          {implantCompact || "임플란트"}
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom" className="max-w-[16rem] text-xs">
                                        {implantSummary ||
                                          (missingAbutmentPreset
                                            ? "임플란트 프리셋을 선택해주세요"
                                            : "임플란트 선택")}
                                      </TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          className={cn(
                                            "h-5 w-full truncate px-0.5 text-center text-[10px] leading-none hover:underline",
                                            abutmentCompact
                                              ? "text-service-abut hover:bg-service-abut-soft"
                                              : missingAbutmentPreset
                                                ? "font-semibold text-destructive hover:bg-destructive-soft"
                                                : "text-service-abut hover:bg-service-abut-soft",
                                          )}
                                          onClick={() => openCustomSpecsModal(originalIndex)}
                                        >
                                          {abutmentCompact || "스캔바디"}
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom" className="max-w-[16rem] text-xs">
                                        {abutmentSummary ||
                                          (missingAbutmentPreset
                                            ? "스캔바디 프리셋을 선택해주세요"
                                            : "스캔바디 선택")}
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                </TooltipProvider>
                              </div>
                            ) : null}
                          </div>
                          </div>
                          {bridgeControl}
                        </div>
                      );
                    })}
                  </div>

                  {maxOffset > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      data-no-tooth-marquee=""
                      className="h-12 w-12 shrink-0 self-center rounded-xl text-slate-500 hover:bg-primary-soft hover:text-primary-strong disabled:opacity-30"
                      disabled={offset >= maxOffset}
                      onClick={() => shiftDecade(decade.key, 1, maxOffset)}
                      aria-label={`${decade.label} 다음`}
                    >
                      <ChevronRight className="h-8 w-8" strokeWidth={2.25} />
                    </Button>
                  ) : null}
                </div>
              );
            });

            const chartBody = (
              <div
                ref={toothChartRef}
                data-tooth-chart
                className={cn(
                  "relative select-none space-y-2 px-1 py-1",
                  toothMarquee ? "cursor-crosshair" : null,
                )}
                onPointerDown={handleToothChartPointerDown}
              >
                {chartRows[0]}
                {showFeeEstimate ? (
                  <PracticeTransferFeeEstimate
                    quote={feeQuote}
                    viewer="practice"
                    labPending={!selectedLab}
                  />
                ) : null}
                {chartRows[1]}
                {toothMarquee && toothChartRef.current
                  ? (() => {
                      const container = toothChartRef.current!;
                      const bounds = container.getBoundingClientRect();
                      const left =
                        Math.min(toothMarquee.originX, toothMarquee.currentX) -
                        bounds.left +
                        container.scrollLeft;
                      const top =
                        Math.min(toothMarquee.originY, toothMarquee.currentY) -
                        bounds.top +
                        container.scrollTop;
                      const width = Math.abs(toothMarquee.currentX - toothMarquee.originX);
                      const height = Math.abs(toothMarquee.currentY - toothMarquee.originY);
                      if (width < 2 && height < 2) return null;
                      return (
                        <div
                          aria-hidden
                          className="pointer-events-none absolute z-30 rounded-sm border border-primary bg-primary/20"
                          style={{ left, top, width, height }}
                        />
                      );
                    })()
                  : null}
              </div>
            );

            return (
              <>
                {toothChartDisplayMode === "full" || !toothChartEnlargeOpen ? chartBody : null}
                {toothChartDisplayMode !== "full" ? (
                <Dialog
                  open={toothChartEnlargeOpen}
                  onOpenChange={setToothChartEnlargeOpen}
                >
                  <DialogContent className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] gap-3 p-4 sm:p-5">
                    <DialogHeader className="pr-8 text-left">
                      <DialogTitle className="text-base">
                        보철물{" "}
                        <span className="font-normal text-muted-foreground">
                          ({requestedToothCount}개)
                        </span>
                      </DialogTitle>
                      <DialogDescription className="sr-only">
                        보철물 치식 차트를 가로로 크게 봅니다.
                      </DialogDescription>
                    </DialogHeader>
                    {toothChartEnlargeOpen ? chartBody : null}
                  </DialogContent>
                </Dialog>
                ) : null}
              </>
            );
          })()}
        </div>
      ) : null}

      {showMemoSection ? (
      <div
        className={cn(
          "flex min-h-0 flex-col space-y-2",
          memoOnly && "flex-1",
        )}
      >
        {aboveMemoContent}
        <div className="flex h-7 shrink-0 items-center gap-1">
          <Label className="text-sm leading-none">메모</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex text-muted-foreground/80 transition-colors hover:text-foreground"
                aria-label="메모 도움말"
              >
                <CircleHelp className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
              Enter로 줄바꿈. 입력한 문장은 다음에 자동 제안됩니다.
            </TooltipContent>
          </Tooltip>
        </div>
        <div
          id={memoInputId}
          className={cn(
            "flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-2.5",
            memoBoxClassName ?? "min-h-[9rem]",
          )}
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
                    placeholder={index === 0 ? "메모" : ""}
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
                                "flex w-full cursor-pointer items-center px-2.5 py-1.5 text-left hover:bg-primary-soft hover:text-primary-strong",
                                optionIndex === suggestActiveIndex &&
                                  "bg-primary-soft text-primary-strong",
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
        </div>
      </div>
      ) : null}

      <Dialog
        open={customSpecsModalTarget !== null}
        onOpenChange={(open) => {
          if (!open) cancelCustomSpecsModal();
        }}
      >
        <DialogContent
          className={cn(
            "flex max-h-[92vh] flex-col gap-4 overflow-hidden sm:max-w-5xl",
            nestedDialogClassName,
          )}
          overlayClassName={nestedDialogOverlayClassName}
        >
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="text-lg">
              {`커스텀어벗 설정${
                typeof customSpecsModalTarget === "number" &&
                toothWorks[customSpecsModalTarget]?.toothNumber
                  ? ` (#${toothWorks[customSpecsModalTarget].toothNumber})`
                  : ""
              }`}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {lockedMode === ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION
                ? "디자인+생산 의뢰가 선택됩니다. 생산만 의뢰는 어벗생산의뢰 페이지로 이동합니다. 임플란트와 스캔바디 프리셋을 각각 한 번씩 선택하면 저장되고 닫힙니다."
                : lockedMode === ABUTMENT_PRODUCT_MODE.PRODUCTION
                  ? "생산만 의뢰가 선택됩니다. 디자인+생산 의뢰는 기공의뢰 페이지로 이동합니다. 임플란트와 스캔바디 프리셋을 각각 한 번씩 선택하면 저장되고 닫힙니다."
                  : "생산만 의뢰 또는 디자인+생산 의뢰를 고른 뒤, 임플란트와 스캔바디 프리셋을 각각 한 번씩 선택하면 저장되고 닫힙니다. 확인도 동일하고, 취소하면 열기 전 값으로 돌아갑니다."}
            </DialogDescription>
          </DialogHeader>

          {typeof customSpecsModalTarget === "number" && toothWorks[customSpecsModalTarget] ? (
            <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
              <div className="my-10 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {abutmentServiceOptions.map((option) => {
                  const isDesign =
                    option.mode === ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION;
                  const selected = lockedMode
                    ? option.mode === lockedMode
                    : resolveToothAbutmentProductMode(
                        toothWorks[customSpecsModalTarget],
                      ) === option.mode;
                  return (
                    <HoverOnlyTooltip
                      key={option.mode}
                      content={
                        <>
                          <p className="font-medium">커스텀어벗 - 어벗츠 자체 제공</p>
                          {option.mode === ABUTMENT_PRODUCT_MODE.PRODUCTION ? (
                            <p className="text-muted-foreground">
                              어벗생산의뢰 페이지에서 처리합니다.
                            </p>
                          ) : null}
                        </>
                      }
                    >
                      <label
                        className={cn(
                          "flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-center text-sm font-semibold transition-colors",
                          isDesign
                            ? selected
                              ? "border-[hsl(46_92%_48%)] bg-[hsl(48_96%_58%)] text-slate-900 shadow-sm"
                              : "border-[hsl(46_85%_52%)] bg-[hsl(48_100%_93%)] text-[hsl(42_72%_28%)] hover:bg-[hsl(48_96%_86%)]"
                            : selected
                              ? "border-primary bg-primary text-primary-foreground shadow-sm"
                              : "border-primary bg-primary-soft text-primary-strong hover:bg-primary/15",
                        )}
                      >
                        <input
                          type="checkbox"
                          className={cn(
                            "h-4 w-4",
                            isDesign
                              ? "accent-[hsl(46_92%_42%)]"
                              : "accent-primary-strong",
                          )}
                          checked={selected}
                          onChange={() => {
                            if (lockedMode) {
                              if (option.mode === lockedMode) return;
                              cancelCustomSpecsModal();
                              onAlternateAbutmentModeNavigate?.();
                              return;
                            }
                            const index = customSpecsModalTarget;
                            const current = toothWorks[index];
                            if (!current) return;
                            const previous = resolveToothAbutmentProductMode(current);
                            if (
                              previous === option.mode &&
                              isAbutmentProductMode(current.abutmentProductMode)
                            ) {
                              return;
                            }
                            setToothWorks((prev) => {
                              const row = prev[index];
                              if (!row) return prev;
                              const next = [...prev];
                              next[index] = {
                                ...row,
                                customAbutment: true,
                                abutmentProductMode: option.mode,
                              };
                              return next;
                            });
                            if (previous !== option.mode) {
                              void onDefaultAbutmentProductModeChange?.(option.mode);
                            }
                          }}
                        />
                        <span className="text-center">
                          {ABUTMENT_PRODUCT_MODE_LABEL[option.mode]}
                        </span>
                      </label>
                    </HoverOnlyTooltip>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <PracticeToothImplantFields
                  mode="presets"
                  allowPresetEdit={false}
                  heading="임플란트 프리셋"
                  value={pickToothWorkCustomSpecs(toothWorks[customSpecsModalTarget], true)}
                  onChange={(nextImplant) => {
                    patchCustomSpecsOnTooth(customSpecsModalTarget, nextImplant);
                  }}
                  connections={implantConnections}
                  favorites={implantFavorites}
                />
                <PracticeToothAbutmentFields
                  mode="presets"
                  allowPresetEdit={false}
                  heading="스캔바디 프리셋"
                  value={pickToothWorkCustomSpecs(toothWorks[customSpecsModalTarget], true)}
                  onChange={(nextAbutment) => {
                    patchCustomSpecsOnTooth(customSpecsModalTarget, nextAbutment);
                  }}
                  favorites={abutmentFavorites}
                />
              </div>

              <PracticeCustomSpecsPresetEditDialog
                open={customSpecsPresetEditOpen}
                onOpenChange={setCustomSpecsPresetEditOpenSafe}
                className={nestedDialogClassName}
                overlayClassName={nestedDialogOverlayClassName}
                value={pickToothWorkCustomSpecs(toothWorks[customSpecsModalTarget], true)}
                onImplantChange={(nextImplant) => {
                  patchCustomSpecsOnTooth(customSpecsModalTarget, nextImplant);
                }}
                onAbutmentChange={(nextAbutment) => {
                  patchCustomSpecsOnTooth(customSpecsModalTarget, nextAbutment);
                }}
                connections={implantConnections}
                implantFavorites={implantFavorites}
                onImplantFavoritesChange={onImplantFavoritesChange}
                abutmentFavorites={abutmentFavorites}
                onAbutmentFavoritesChange={onAbutmentFavoritesChange}
              />
            </div>

            <DialogFooter className="flex flex-row items-center justify-between gap-2 sm:justify-between sm:space-x-0">
              <Button
                type="button"
                className="h-10"
                onClick={() => setCustomSpecsPresetEditOpenSafe(true)}
              >
                <Settings className="mr-1.5 h-4 w-4" />
                프리셋 편집
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 min-w-[5.5rem]"
                  onClick={cancelCustomSpecsModal}
                >
                  취소
                </Button>
                <Button
                  type="button"
                  className="h-10 min-w-[5.5rem]"
                  onClick={confirmCustomSpecsModal}
                >
                  확인
                </Button>
              </div>
            </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};
