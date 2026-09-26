// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/shared/practice/transferMemo.ts
// - 2026-09-11: 읽기 전용 카드에 쉐이드 표시.
// - 2026-09-07: 상·하악 전체(16치) compact 표시는 번호 나열 대신 상악/하악 카드.
// - 2026-08-19: 수가 Off면 live quote-context로 기공비 미설정·어벗 단가 표시.
// - 2026-08-19: 치아 옆 스크롤·R/M/L 제거. 견적 바에 << < > >>(1칸·5칸).
// - 2026-09-02: 가로폭 부족 시 overflow-x 스크롤(<< < > >> 버튼 제거) + custom-scrollbar-x.
// - 2026-09-01: 후속 제작 모달 — 보철물 카드에서 크라운·브리지 단위 선택.
// - 2026-09-22: 보철 종류 변경 — 카드에서 직접 선택, 변경 전후를 카드 아래 기록.
// - 2026-09-23: 주문 변경 — 카드 변경 가능 항목 전부 전후 기록(형태·어벗·의뢰모드·임플란트·어벗스펙·쉐이드).
// - 2026-09-22: 종류 변경 전후 — 세로 표기(줄임 없음)·셀렉트/기록 경계선 정리.
// - 2026-09-22: 원본 종류(현재)도 선택 가능 — 잘못 바꾼 뒤 적용 전 되돌리기.
// - 2026-09-22: 제작 변경 — 카드에 어벗·쉐이드 선택(종류 변경과 함께).
// - 2026-09-22: 신규의뢰와 동일 라디오·쉐이드·복사(공통 PracticeToothWorkCardFields).
// - 2026-09-22: 어벗·스캔바디 → PracticeCustomAbutmentSpecsDialog 오픈 콜백.
// - 2026-09-01: 컨테이너 폭에 따라 inline 칸 수 4~8, 카드 폭 5rem 고정(→ 2026-09-02 overflow-x 스크롤).
// - 2026-09-02: 모바일 — 스팬 단위 세로 목록(전폭 균등 분할), 크게 보기 생략.
// - 2026-09-02: 모바일 5연결+ 브리지 — 치아당 5rem 고정폭 + 가로 스와이프.
// - 2026-08-25: 구강스캔(기공의뢰)은 디자인+생산 고정 — 치식 카드 모드 라벨 제거(작성 UI와 동일).
// - 2026-09-02: full 치식 슬롯 래퍼 contents 복구 — shrink-0이 flex-1 전폭 분할을 막던 문제.
// - 2026-09-15: 브리지 연결 이음새 — 행 gap-0으로 카드·연결선 사이 하얀 수직 거터 제거.
// - 2026-09-15: 후속 앵커 1행 스팬 — 체크박스는 원 row 치아만(빌려쓴 연결치 제외).
// - 2026-09-15: 부분 후속(남은 임시치아) — 변경 기공비 라벨.
// - 2026-09-15: 최종 기공비 — toothWorksForFinalProsthesisFeeQuote(followUp CA 스킵 우회).
// - 2026-09-02: byTooth가 연결치에 첫 행을 덮어 13-12-11 브리지에서 11 연결·스펙이 끊기던 버그 수정.
import { useMemo, useState, useRef, useEffect, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import {
  CUSTOM_ABUTMENT_SELECTION,
  formatAbutmentCompact,
  formatImplantCompact,
  formatToothNumbersForCard,
  LOWER_ARCH_TEETH,
  UPPER_ARCH_TEETH,
  normalizeToothShade,
  resolveCustomAbutmentSelection,
  type CustomAbutmentSelection,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";
import {
  PracticeToothAbutmentRadios,
  PracticeToothCardFooter,
  PracticeToothTypeMenu,
} from "@/shared/components/practice/PracticeToothWorkCardFields";
import {
  collectAdjacentBridgeLinks,
  isCustomAbutmentSupportedProsthesisType,
  isMissingToothProsthesisType,
  NO_WORK_PROSTHESIS_TYPE,
  NO_WORK_PROSTHESIS_TOOLTIP,
} from "@/shared/practice/usePracticeToothWorkEditor";
import {
  buildOrderChangeLogEntries,
  buildToothWorkDisplayByTooth,
  hasPartialProsthesisFollowUp,
  toothWorksForFinalProsthesisFeeQuote,
  toothWorksForProsthesisStage,
  type ProsthesisFeeStageRecord,
  type ProsthesisFollowUpRecord,
} from "@/shared/practice/prosthesisFollowUp";
import {
  buildProsthesisFollowUpFeeStages,
  type PracticeFeeStageSection,
} from "@/shared/practice/prosthesisFollowUpFeeStages";
import { PracticeTransferFeeEstimate } from "@/shared/components/practice/PracticeTransferFeeEstimate";
import { PracticeToothChartHorizontalScroll } from "@/shared/components/practice/PracticeToothChartHorizontalScroll";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { usePracticeTransferFeeQuote } from "@/shared/practice/usePracticeTransferFeeQuote";
import {
  buildFeeQuoteFromContext,
  type PracticeTransferFeeQuote,
  type PracticeTransferFeeQuoteViewer,
} from "@/shared/practice/practiceTransferFeeQuote";

const TOOTH_CARD_WIDTH_CLASS = "w-[5rem] max-w-[5rem] shrink-0";
const SCROLL_TOOTH_SLOT_CLASS = "relative w-[5rem] max-w-[5rem] shrink-0 snap-start";
const TOOTH_CARD_HEIGHT_CLASS = "h-[12rem]";
const TOOTH_SLOT_CLASS = TOOTH_CARD_WIDTH_CLASS;
/** full(16칸) — 전폭 균등 분할 */
const TOOTH_SLOT_FULL_CLASS = "min-w-0 flex-1 basis-0";
/** 정중선 — 미연결 폭에 구 행 gap 포함 */
const BRIDGE_GAP_MIDLINE_CLASS = "w-3 shrink-0";
const BRIDGE_GAP_UNLINKED_CLASS = "w-2 shrink-0";
const BRIDGE_GAP_LINKED_CLASS =
  "relative z-20 flex w-1.5 shrink-0 items-center justify-center self-stretch border-y border-primary bg-gradient-to-b from-primary-soft via-primary-soft to-white";

const toToothDecadeSortNumber = (toothNumber: string) => {
  const raw = String(toothNumber || "").trim();
  if (!/^[1-4][1-8]$/.test(raw)) return Number.MAX_SAFE_INTEGER;
  const tens = Number(raw[0]);
  const ones = Number(raw[1]);
  const decadeBase = (tens - 1) * 10;
  if (tens === 1 || tens === 3) return decadeBase + (8 - ones);
  return decadeBase + (ones - 1);
};

const isUpperArchTooth = (toothNumber: string) =>
  /^[12]/.test(String(toothNumber || "").trim());

/** 인접 브리지 연결을 묶어 스팬 단위 치아 목록으로 합친다 (44-45 / 44-45-46 중복 방지). */
const buildBridgeSpanTeethList = (rows: ToothWorkSelection[]): string[][] => {
  const allTeeth = new Set<string>();
  for (const row of rows) {
    const anchor = String(row.toothNumber || "").trim();
    if (/^[1-4][1-8]$/.test(anchor)) allTeeth.add(anchor);
    for (const linked of Array.isArray(row.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : []) {
      const tooth = String(linked || "").trim();
      if (/^[1-4][1-8]$/.test(tooth)) allTeeth.add(tooth);
    }
  }

  const adjacency = new Map<string, Set<string>>();
  const linkTeeth = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  };

  for (const tooth of allTeeth) {
    for (const linked of collectAdjacentBridgeLinks(rows, tooth)) {
      linkTeeth(tooth, linked);
    }
  }

  const visited = new Set<string>();
  const spans: string[][] = [];
  const sortedTeeth = [...allTeeth].sort(
    (a, b) => toToothDecadeSortNumber(a) - toToothDecadeSortNumber(b),
  );

  for (const tooth of sortedTeeth) {
    if (visited.has(tooth)) continue;
    const component: string[] = [];
    const queue = [tooth];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      for (const neighbor of adjacency.get(current) || []) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
    spans.push(
      component.sort((a, b) => toToothDecadeSortNumber(a) - toToothDecadeSortNumber(b)),
    );
  }

  return spans.sort(
    (a, b) => toToothDecadeSortNumber(a[0] || "") - toToothDecadeSortNumber(b[0] || ""),
  );
};

type MobileSpanEntry = {
  teeth: string[];
  row: ToothWorkSelection;
  spanKey: string;
};

const TOOTH_CHART_ROWS: ReadonlyArray<{
  key: string;
  label: string;
  teeth: readonly string[];
}> = [
  {
    key: "upper",
    label: "상악",
    teeth: UPPER_ARCH_TEETH,
  },
  {
    key: "lower",
    label: "하악",
    teeth: LOWER_ARCH_TEETH,
  },
];

const isSameToothSet = (a: readonly string[], b: readonly string[]) => {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((tooth) => set.has(tooth));
};

/** 치식 순서 유지한 채 치료할 치아만. 빈 칸(미치료)은 의뢰상세에서 숨긴다. */
const treatedTeethInRow = (
  teeth: readonly string[],
  selected: ReadonlySet<string>,
): string[] => teeth.filter((tooth) => selected.has(tooth));

type PracticeToothWorkChartReadOnlyProps = {
  toothWorks: ToothWorkSelection[];
  className?: string;
  feeQuote?: PracticeTransferFeeQuote | null;
  feeViewer?: PracticeTransferFeeQuoteViewer;
  labAnchorId?: string | null;
  /** 수수료 줄이기 버튼이 이 의뢰부터 동의를 맞춘다 */
  consentTransferId?: string | null;
  skipJig?: boolean;
  /** 후속 제작 등 — 어벗·디자인비 견적 제외 */
  skipAbutmentFees?: boolean;
  /** 후속 제작 — 원 임시치아 기공비 차감 */
  creditToothWorks?: ToothWorkSelection[] | null;
  /** 상단「보철물 (N개)」헤더 */
  showHeader?: boolean;
  /** 모달 등 좁은 영역 — 카드 클립·이중 테두리 완화 */
  embedded?: boolean;
  /** embedded 안의 크게 보기 — 부모 Dialog 위 z-index */
  enlargeOverlayClassName?: string;
  enlargeDialogClassName?: string;
  /** 기공소 뷰 — 자동매칭 기공비 별점 확정가 */
  labEffectiveStars?: number | null;
  /** 크라운·브리지 단위 선택 (후속 제작 모달) */
  selectable?: boolean;
  selectedSpanKeys?: ReadonlySet<string>;
  onToggleSpanKey?: (spanKey: string, selected: boolean) => void;
  spanKeyOf?: (row: ToothWorkSelection) => string;
  /** 선택 모드 — 견적·헤더 개수용 (미전달 시 선택된 스팬만 toothWorks에서 유도) */
  feeToothWorks?: ToothWorkSelection[];
  selectionDisabled?: boolean;
  /** 보철 종류 변경 — 카드에서 직접 선택 */
  prosthesisTypeOptions?: readonly string[] | null;
  onChangeProsthesisType?: (spanKey: string, prosthesisType: string) => void;
  /** 어벗·쉐이드 등 카드 스펙 패치(제작 변경 모달) */
  onPatchToothWork?: (
    spanKey: string,
    patch: Partial<ToothWorkSelection>,
  ) => void;
  /** 어벗|스캔바디 선택·상세 클릭 → 규격 모달 */
  onOpenCustomAbutmentSpecs?: (
    spanKey: string,
    selection: CustomAbutmentSelection,
  ) => void;
  /** 변경 전 종류(스팬키) — 카드 아래 전후 기록(레거시·채팅 type-only) */
  sourceProsthesisTypeBySpanKey?: ReadonlyMap<string, string> | null;
  /** 변경 전 행(스팬키) — 형태·어벗·쉐이드·임플란트 전후 기록 */
  sourceToothWorkBySpanKey?: ReadonlyMap<
    string,
    Partial<ToothWorkSelection>
  > | null;
  /** 후속 제작 기록 — 단계별 기공비 섹션 */
  prosthesisFollowUps?: ProsthesisFollowUpRecord[] | null;
  /** 저장된 단계별 견적 스냅샷(있으면 live 재계산보다 우선) */
  prosthesisFeeStages?: ProsthesisFeeStageRecord[] | null;
  /**
   * 캘린더 칩 단계 포커스 — Stage 스냅샷(치식) 우선.
   * `-1` 원 임시치아, `0..n` 해당 followUpIndex,
   * `null`이면 후속 있을 때 temp 스냅샷 보호.
   */
  feeStageFocusIndex?: number | null;
  /** Stage SSOT key (`temp` | `zirconia-N`). 있으면 focus보다 우선 */
  feeStageKey?: string | null;
  /**
   * 최종 기공비 바. true면 표시. 기본/미지정은 숨김(단계 스냅샷 보호).
   * 전부 지르 전환 완료 카드에서만 true.
   */
  showFinalFee?: boolean | null;
  /** 견적 라벨 강제(예: 최종 기공비). 미지정이면 부분후속→변경 기공비 */
  confirmedFeeLabel?: string | null;
};

export const PracticeToothWorkChartReadOnly = ({
  toothWorks,
  className,
  feeQuote: storedFeeQuote = null,
  feeViewer = "practice",
  labAnchorId = null,
  consentTransferId = null,
  skipJig = false,
  skipAbutmentFees = false,
  creditToothWorks = null,
  showHeader = true,
  embedded = false,
  enlargeOverlayClassName,
  enlargeDialogClassName,
  labEffectiveStars = null,
  selectable = false,
  selectedSpanKeys,
  onToggleSpanKey,
  spanKeyOf,
  feeToothWorks,
  selectionDisabled = false,
  prosthesisTypeOptions = null,
  onChangeProsthesisType,
  onPatchToothWork,
  onOpenCustomAbutmentSpecs,
  sourceProsthesisTypeBySpanKey = null,
  sourceToothWorkBySpanKey = null,
  prosthesisFollowUps = null,
  prosthesisFeeStages = null,
  feeStageFocusIndex = null,
  feeStageKey = null,
  showFinalFee: showFinalFeeProp = null,
  confirmedFeeLabel: confirmedFeeLabelProp = null,
}: PracticeToothWorkChartReadOnlyProps) => {
  const isMobile = useIsMobile();
  const [toothChartEnlargeOpen, setToothChartEnlargeOpen] = useState(false);

  const resolveSpanKey = (row: ToothWorkSelection) =>
    spanKeyOf?.(row) || String(row.toothNumber || "").trim();

  const typeChangeEnabled = Boolean(
    onChangeProsthesisType &&
      Array.isArray(prosthesisTypeOptions) &&
      prosthesisTypeOptions.length > 0,
  );
  const specsEditable = Boolean(onPatchToothWork);
  const editableCardCount = useMemo(() => {
    if (!specsEditable && !typeChangeEnabled) return 0;
    const keys = new Set<string>();
    for (const row of toothWorks) {
      keys.add(resolveSpanKey(row));
    }
    return keys.size;
  }, [specsEditable, typeChangeEnabled, toothWorks, spanKeyOf]);

  const [copyDragSource, setCopyDragSource] = useState<string | null>(null);
  const copyDragSourceRef = useRef<string | null>(null);

  useEffect(() => {
    if (!copyDragSource) return;
    const onUp = (event: PointerEvent) => {
      const sourceKey = copyDragSourceRef.current;
      copyDragSourceRef.current = null;
      setCopyDragSource(null);
      if (!sourceKey || !onPatchToothWork) return;
      const el = document.elementFromPoint(event.clientX, event.clientY);
      const target = el?.closest?.("[data-tooth-copy-drop]") as HTMLElement | null;
      const targetKey = String(target?.getAttribute("data-tooth-copy-drop") || "").trim();
      if (!targetKey || targetKey === sourceKey) return;
      const sourceRow = toothWorks.find((row) => resolveSpanKey(row) === sourceKey);
      if (!sourceRow) return;
      onPatchToothWork(targetKey, {
        prosthesisType: sourceRow.prosthesisType,
        shade: sourceRow.shade,
        customAbutment: sourceRow.customAbutment,
        customAbutmentSelection: sourceRow.customAbutmentSelection,
        abutmentProductMode: sourceRow.abutmentProductMode,
        implantManufacturer: sourceRow.implantManufacturer,
        implantBrand: sourceRow.implantBrand,
        implantFamily: sourceRow.implantFamily,
        implantType: sourceRow.implantType,
        implantAddRequest: sourceRow.implantAddRequest,
        abutmentManufacturer: sourceRow.abutmentManufacturer,
        abutmentDiameter: sourceRow.abutmentDiameter,
        abutmentHeight: sourceRow.abutmentHeight,
      });
    };
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    return () => {
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
    };
  }, [
    copyDragSource,
    onChangeProsthesisType,
    onPatchToothWork,
    toothWorks,
    typeChangeEnabled,
    spanKeyOf,
  ]);

  const beginCopyDrag = (spanKey: string, event: ReactPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (editableCardCount < 2) return;
    copyDragSourceRef.current = spanKey;
    setCopyDragSource(spanKey);
  };

  const renderProsthesisTypeControl = (
    row: ToothWorkSelection,
    spanKey: string,
    opts?: { editable?: boolean },
  ) => {
    const currentType = String(row.prosthesisType || "").trim();
    const editable = Boolean(opts?.editable) && typeChangeEnabled;
    const spanSelected = isSpanSelected(row);
    const selectDisabled =
      selectionDisabled || (selectable && !spanSelected);

    if (editable) {
      return (
        <PracticeToothTypeMenu
          toothNumber={String(row.toothNumber || spanKey)}
          value={currentType}
          options={prosthesisTypeOptions || []}
          disabled={selectDisabled}
          onChange={(next) => onChangeProsthesisType?.(spanKey, next)}
        />
      );
    }

    return (
      <div className="relative z-[1] mt-1.5 flex h-7 w-full min-w-0 max-w-full items-center justify-center self-stretch rounded-md border border-slate-300 bg-white px-0.5 text-center text-[11px] font-medium text-slate-700">
        <span className="block w-full truncate px-0.5">
          {currentType || "-"}
        </span>
      </div>
    );
  };

  const renderEditableExtras = (
    row: ToothWorkSelection,
    spanKey: string,
    opts?: { editable?: boolean },
  ) => {
    const editable = Boolean(opts?.editable) && specsEditable;
    const isMissingTooth = isMissingToothProsthesisType(row.prosthesisType);
    const spanSelected = isSpanSelected(row);
    const disabled =
      selectionDisabled || (selectable && !spanSelected) || !editable;
    const toothNumber = String(row.toothNumber || spanKey).trim();

    if (!editable) {
      const canShowCustom =
        !isMissingTooth &&
        isCustomAbutmentSupportedProsthesisType(row.prosthesisType) &&
        Boolean(row.customAbutment);
      const shade = normalizeToothShade(row.shade);
      const selectionKind = resolveCustomAbutmentSelection(row);
      const implantCompact = formatImplantCompact(row);
      const abutmentCompact = formatAbutmentCompact(row);
      return (
        <>
          {canShowCustom ? (
            <div className="mt-2 flex w-full flex-col items-center gap-0.5 leading-none">
              <span className="inline-flex h-5 items-center text-[11px] leading-none text-primary-strong">
                {selectionKind === CUSTOM_ABUTMENT_SELECTION.SCANBODY
                  ? "간접어벗"
                  : "직접어벗"}
              </span>
              <div className="flex w-full flex-col items-stretch gap-0.5 px-0.5">
                <span className="min-h-5 w-full px-0.5 text-center text-[10px] leading-snug text-primary-strong [overflow-wrap:anywhere]">
                  {implantCompact || "임플란트"}
                </span>
                <span className="min-h-5 w-full px-0.5 text-center text-[10px] leading-snug text-service-abut [overflow-wrap:anywhere]">
                  {abutmentCompact ||
                    (selectionKind === CUSTOM_ABUTMENT_SELECTION.ABUTMENT
                      ? "직접 입력"
                      : "스캔바디")}
                </span>
              </div>
            </div>
          ) : null}
          {shade ? (
            <span className="mt-auto mb-0.5 inline-flex max-w-full shrink-0 items-center justify-center rounded-full border border-amber-300/90 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold leading-none tracking-tight text-amber-900">
              <span className="truncate">{shade}</span>
            </span>
          ) : null}
        </>
      );
    }

    return (
      <>
        <PracticeToothAbutmentRadios
          row={row}
          toothNumber={toothNumber}
          disabled={disabled}
          onPatch={(patch) => onPatchToothWork?.(spanKey, patch)}
          onOpenSpecs={
            onOpenCustomAbutmentSpecs
              ? (selection) => onOpenCustomAbutmentSpecs(spanKey, selection)
              : undefined
          }
        />
        <PracticeToothCardFooter
          toothNumber={toothNumber}
          shade={row.shade}
          showShade={!isMissingTooth}
          shadeDisabled={disabled}
          onChangeShade={(shade) => onPatchToothWork?.(spanKey, { shade })}
          canDragCopy={editableCardCount >= 2}
          copyIsSource={copyDragSource === spanKey}
          onCopyPointerDown={(event) => beginCopyDrag(spanKey, event)}
        />
      </>
    );
  };

  const renderOrderChangeLog = (
    spanKey: string,
    currentRow: ToothWorkSelection,
  ) => {
    const sourceRow = sourceToothWorkBySpanKey?.get(spanKey) || null;
    const sourceTypeOnly =
      sourceProsthesisTypeBySpanKey?.get(spanKey)?.trim() || "";
    const entries = sourceRow
      ? buildOrderChangeLogEntries(sourceRow, currentRow)
      : sourceTypeOnly
        ? buildOrderChangeLogEntries(
            { prosthesisType: sourceTypeOnly },
            currentRow,
          )
        : [];
    if (entries.length === 0) return null;
    if (
      !typeChangeEnabled &&
      !specsEditable &&
      !(sourceToothWorkBySpanKey && sourceToothWorkBySpanKey.size > 0) &&
      !(sourceProsthesisTypeBySpanKey && sourceProsthesisTypeBySpanKey.size > 0)
    ) {
      return null;
    }
    const title = entries
      .map((e) => `${e.label} ${e.from} → ${e.to}`)
      .join(" · ");
    return (
      <div
        className="mt-1.5 flex w-full min-w-0 flex-col items-center gap-1 rounded-md border border-slate-200 bg-slate-50/90 px-1 py-1.5 text-center"
        title={title}
      >
        {entries.map((entry, index) => (
          <div
            key={`${spanKey}-change-${index}-${entry.label}-${entry.from}-${entry.to}`}
            className={cn(
              "flex w-full flex-col items-center gap-0.5",
              index > 0 ? "border-t border-slate-200/80 pt-1" : null,
            )}
          >
            <span className="w-full text-[9px] font-medium leading-none tracking-tight text-slate-400">
              {entry.label}
            </span>
            <span className="w-full break-keep text-[10px] leading-tight text-slate-500 [overflow-wrap:anywhere]">
              {entry.from}
            </span>
            <ArrowRight
              className="h-2.5 w-2.5 shrink-0 rotate-90 text-slate-400"
              aria-hidden
            />
            <span className="w-full break-keep text-[10px] font-semibold leading-tight text-primary [overflow-wrap:anywhere]">
              {entry.to}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const isSpanSelected = (row: ToothWorkSelection) => {
    if (!selectable) return true;
    return selectedSpanKeys?.has(resolveSpanKey(row)) ?? false;
  };

  const quoteToothWorks = useMemo(() => {
    if (feeToothWorks) return feeToothWorks;
    if (!selectable) return toothWorks;
    return toothWorks.filter((row) => isSpanSelected(row));
  }, [feeToothWorks, selectable, toothWorks, selectedSpanKeys, spanKeyOf]);
  /** Stage 스냅샷 우선 — case toothWorks focus 필터는 레거시 fallback */
  const displayToothWorks = useMemo(
    () =>
      toothWorksForProsthesisStage({
        toothWorks,
        prosthesisFollowUps,
        prosthesisFeeStages,
        stageKey: feeStageKey,
        focusFollowUpIndex: feeStageFocusIndex,
      }),
    [
      feeStageFocusIndex,
      feeStageKey,
      prosthesisFeeStages,
      prosthesisFollowUps,
      toothWorks,
    ],
  );
  const confirmedFeeLabel = useMemo(() => {
    if (confirmedFeeLabelProp != null && String(confirmedFeeLabelProp).trim()) {
      return String(confirmedFeeLabelProp).trim();
    }
    return hasPartialProsthesisFollowUp(quoteToothWorks) ? "변경 기공비" : null;
  }, [confirmedFeeLabelProp, quoteToothWorks]);
  const byTooth = useMemo(
    () => buildToothWorkDisplayByTooth(displayToothWorks),
    [displayToothWorks],
  );

  const allDisplayTeeth = useMemo(() => new Set(byTooth.keys()), [byTooth]);

  const selectedTeeth = useMemo(() => {
    if (!selectable) return allDisplayTeeth;
    const next = new Set<string>();
    for (const [tooth, row] of byTooth.entries()) {
      if (isSpanSelected(row)) next.add(tooth);
    }
    return next;
  }, [allDisplayTeeth, byTooth, selectable, selectedSpanKeys, spanKeyOf]);

  const chartTeeth = selectable ? allDisplayTeeth : selectedTeeth;

  const mobileSpanEntries = useMemo((): MobileSpanEntry[] => {
    const spans = buildBridgeSpanTeethList(displayToothWorks);
    const entries: MobileSpanEntry[] = [];
    for (const teeth of spans) {
      const anchor = teeth[0] || "";
      if (!anchor) continue;
      const row =
        byTooth.get(anchor) ||
        displayToothWorks.find(
          (candidate) => String(candidate.toothNumber || "").trim() === anchor,
        );
      if (!row) continue;
      const spanKey =
        spanKeyOf?.({
          ...row,
          toothNumber: anchor,
          bridgeLinkedTeeth: teeth.slice(1),
        }) || teeth.join("-");
      entries.push({ teeth, row, spanKey });
    }
    return entries;
  }, [displayToothWorks, byTooth, spanKeyOf]);

  const upperSpanEntries = useMemo(
    () => mobileSpanEntries.filter((entry) => isUpperArchTooth(entry.teeth[0] || "")),
    [mobileSpanEntries],
  );
  const lowerSpanEntries = useMemo(
    () => mobileSpanEntries.filter((entry) => !isUpperArchTooth(entry.teeth[0] || "")),
    [mobileSpanEntries],
  );
  /** 크게 보기 — 상·하악 16칸 전체 */
  const fullChartRows = useMemo(
    () =>
      TOOTH_CHART_ROWS.map((decade) => ({
        key: decade.key,
        label: decade.label,
        chartTeeth: decade.teeth,
        teeth: [...decade.teeth],
      })),
    [],
  );
  /** 상·하악별로 FDI 순 치료할 치아만 (빈 칸 제외) */
  const treatedChartRows = useMemo(
    () =>
      TOOTH_CHART_ROWS.map((decade) => ({
        key: decade.key,
        label: decade.label,
        /** 전체 치식(브리지 인접 판별용) */
        chartTeeth: decade.teeth,
        teeth: treatedTeethInRow(decade.teeth, chartTeeth),
      })).filter((row) => row.teeth.length > 0),
    [chartTeeth],
  );
  /** embedded — 좁은 영역이라 치아 수와 무관하게 크게 보기 제공 (모바일은 전폭 스팬 목록으로 생략) */
  const showEnlargeButton = isMobile
    ? false
    : embedded
      ? allDisplayTeeth.size > 0
      : treatedChartRows.some((row) => row.teeth.length > 6);
  const enlargeButtonLabel = embedded ? "보철물 크게 보기" : "크게 보기";

  const storedLinesEmpty =
    !Array.isArray(storedFeeQuote?.lines) || storedFeeQuote.lines.length === 0;
  const hasStoredFeeStages =
    Array.isArray(prosthesisFeeStages) &&
    prosthesisFeeStages.some(
      (row) =>
        String(row?.key || "").trim() &&
        (Math.max(0, Number(row.total || row.labFeeTotal || 0)) > 0 ||
          (Array.isArray(row.lines) && row.lines.length > 0)),
    );
  const { quote: feeQuote, context: feeQuoteContext, contextReady: feeContextReady } =
    usePracticeTransferFeeQuote({
    enabled:
      !storedFeeQuote ||
      storedFeeQuote.labFeeConfigured === false ||
      storedFeeQuote.total <= 0 ||
      // 확정 금액만 있고 내역 lines가 비면 live 재계산으로 툴팁을 채운다.
      (storedFeeQuote.total > 0 && storedLinesEmpty) ||
      // 단계 스냅샷이 없으면 live로 임시/지르 섹션을 재구성한다.
      (!hasStoredFeeStages &&
        Array.isArray(prosthesisFollowUps) &&
        prosthesisFollowUps.length > 0) ||
      (!hasStoredFeeStages && hasPartialProsthesisFollowUp(quoteToothWorks)),
    labAnchorId,
    toothWorks: quoteToothWorks,
    storedQuote: storedFeeQuote,
    skipAbutmentFees,
    creditToothWorks,
  });
  const feeStages = useMemo((): PracticeFeeStageSection[] | null => {
    if (hasStoredFeeStages) {
      return buildProsthesisFollowUpFeeStages({
        toothWorks: quoteToothWorks,
        prosthesisFollowUps,
        prosthesisFeeStages,
        context: feeQuoteContext,
      });
    }
    if (!feeContextReady && feeQuoteContext.usedDefaultSchedule) return null;
    return buildProsthesisFollowUpFeeStages({
      toothWorks: quoteToothWorks,
      prosthesisFollowUps,
      prosthesisFeeStages,
      context: feeQuoteContext,
    });
  }, [
    feeContextReady,
    feeQuoteContext,
    hasStoredFeeStages,
    prosthesisFeeStages,
    prosthesisFollowUps,
    quoteToothWorks,
  ]);

  const showFinalFee = useMemo(() => {
    // 단계 스냅샷 보호 — 최종 바는 완료 카드 등에서만 명시적으로 켠다.
    if (showFinalFeeProp != null) return Boolean(showFinalFeeProp);
    return false;
  }, [showFinalFeeProp]);

  /** 후속 단계 UI — 최종 바는 전부 지르 전환 후·명시 시에만(처음부터 지르+CA). 단계 섹션은 스냅샷. */
  const feeQuoteForStages = useMemo(() => {
    if (!feeStages || feeStages.length === 0) return feeQuote;
    let next: PracticeTransferFeeQuote = hasStoredFeeStages
      ? {
          ...feeQuote,
          tempCreditLabFeeTotal: 0,
        }
      : feeQuote;
    if (!hasStoredFeeStages) {
      if (!feeContextReady && feeQuoteContext.usedDefaultSchedule) return feeQuote;
      // 전부 지르면 임시치아 차감 없이 지르+CA로 재계산(처음부터 지르 제작처럼)
      const live = buildFeeQuoteFromContext({
        toothWorks: quoteToothWorks,
        context: feeQuoteContext,
        skipAbutmentFees,
        creditToothWorks: undefined,
      });
      if (!(live.total > 0 || (Array.isArray(live.lines) && live.lines.length > 0))) {
        return feeQuote;
      }
      next = {
        ...feeQuote,
        total: Math.max(0, Math.round(Number(live.total || 0))),
        labFeeTotal: Math.max(0, Math.round(Number(live.labFeeTotal || 0))),
        labAbutmentTotal: Math.max(
          0,
          Math.round(Number(live.labAbutmentTotal || 0)),
        ),
        abutmentRetailTotal: Math.max(
          0,
          Math.round(Number(live.abutmentRetailTotal || 0)),
        ),
        lines: Array.isArray(live.lines) && live.lines.length > 0
          ? live.lines
          : feeQuote.lines,
        tempCreditLabFeeTotal: 0,
      };
    }
    // 최종 기공비: 누적 billing이 아니라 지르+원 CA(처음부터 지르) 재견적.
    // followUp phase 행은 labFee가 CA를 0으로 두므로 phase 제거·원 CA 병합 행을 쓴다.
    if (showFinalFee && (feeContextReady || !feeQuoteContext.usedDefaultSchedule)) {
      const finalRows = toothWorksForFinalProsthesisFeeQuote(quoteToothWorks);
      if (finalRows.length > 0) {
        const finalLive = buildFeeQuoteFromContext({
          toothWorks: finalRows,
          context: feeQuoteContext,
          skipAbutmentFees: false,
          creditToothWorks: undefined,
        });
        if (
          finalLive.total > 0 ||
          (Array.isArray(finalLive.lines) && finalLive.lines.length > 0)
        ) {
          next = {
            ...next,
            total: Math.max(0, Math.round(Number(finalLive.total || 0))),
            labFeeTotal: Math.max(
              0,
              Math.round(Number(finalLive.labFeeTotal || 0)),
            ),
            labAbutmentTotal: Math.max(
              0,
              Math.round(Number(finalLive.labAbutmentTotal || 0)),
            ),
            abutmentRetailTotal: Math.max(
              0,
              Math.round(Number(finalLive.abutmentRetailTotal || 0)),
            ),
            lines:
              Array.isArray(finalLive.lines) && finalLive.lines.length > 0
                ? finalLive.lines
                : next.lines,
            tempCreditLabFeeTotal: 0,
          };
        }
      }
    }
    return next;
  }, [
    feeContextReady,
    feeQuote,
    feeQuoteContext,
    feeStages,
    hasStoredFeeStages,
    quoteToothWorks,
    showFinalFee,
    skipAbutmentFees,
  ]);

  const enlargeOverlayClass =
    enlargeOverlayClassName || (embedded ? "z-[350]" : "z-[110]");
  const enlargeDialogClass =
    enlargeDialogClassName || (embedded ? "z-[360]" : "z-[110]");

  if (allDisplayTeeth.size === 0) {
    return (
      <div className={cn("rounded-lg border border-dashed border-slate-200 px-3 py-4", className)}>
        <p className="text-center text-sm text-slate-400">선택된 보철물이 없습니다</p>
      </div>
    );
  }

  const toothCardShellClass = embedded
    ? "relative flex w-full min-w-0 flex-col items-center justify-start overflow-visible border px-0.5 pb-2 pt-1.5 min-h-[12rem]"
    : cn(
        "relative flex w-full min-w-0 flex-col items-center justify-start overflow-hidden border px-0.5 pb-1 pt-1.5 shadow-sm",
        TOOTH_CARD_HEIGHT_CLASS,
      );
  const fullToothCardShellClass = cn(
    "relative flex w-full min-w-0 flex-col items-center justify-start overflow-hidden border px-0.5 pb-1 pt-1.5 shadow-sm",
    TOOTH_CARD_HEIGHT_CLASS,
  );

  const renderBridgeGap = (
    toothNumber: string,
    chartNext: string | null,
    bridgeLinked: boolean,
    adjacentVisible: boolean,
    fullLayout: boolean,
    hasNextInRow: boolean,
  ) => {
    if (bridgeLinked && adjacentVisible) {
      return (
        <div className={BRIDGE_GAP_LINKED_CLASS}>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-3 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-primary/70"
          />
          <span
            className="relative z-10 flex h-5 w-5 items-center justify-center rounded-full border border-primary bg-primary text-white ring-2 ring-primary-soft"
            title={`${toothNumber}–${chartNext} 연결`}
          >
            <span className="h-0.5 w-2.5 rounded-full bg-white" />
          </span>
        </div>
      );
    }
    if (!hasNextInRow) return null;
    const isMidlinePair =
      (toothNumber === "11" && chartNext === "21") ||
      (toothNumber === "41" && chartNext === "31");
    if (fullLayout) {
      return (
        <div
          className={cn(
            "shrink-0 self-stretch",
            isMidlinePair ? BRIDGE_GAP_MIDLINE_CLASS : BRIDGE_GAP_UNLINKED_CLASS,
          )}
          aria-hidden
        />
      );
    }
    return <div className="w-2.5 shrink-0" aria-hidden />;
  };

  const mobileToothCardShellClass =
    "relative flex w-full min-w-0 flex-1 basis-0 flex-col items-center justify-start overflow-hidden border px-1 pb-2 pt-1.5 shadow-sm min-h-[10rem]";

  const renderMobileSpanBridgeGap = () => (
    <div
      className="relative z-20 flex w-3 shrink-0 items-center justify-center self-stretch border-y border-primary bg-gradient-to-b from-primary-soft via-primary-soft to-white"
      aria-hidden
    >
      <span
        className="pointer-events-none absolute inset-y-3 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-primary/70"
      />
      <span
        className="relative z-10 flex h-5 w-5 items-center justify-center rounded-full border border-primary bg-primary text-white ring-2 ring-primary-soft"
      >
        <span className="h-0.5 w-2.5 rounded-full bg-white" />
      </span>
    </div>
  );

  const renderMobileToothCard = (
    row: ToothWorkSelection,
    toothNumber: string,
    spanIndex: number,
    spanLength: number,
  ) => {
    const isMissingTooth = isMissingToothProsthesisType(row.prosthesisType);
    const spanKey = resolveSpanKey(row);
    const spanSelected = isSpanSelected(row);
    const isFirst = spanIndex === 0;
    const isLast = spanIndex === spanLength - 1;
    const isLinked = spanLength > 1;
    const extrasEditable = spanIndex === 0;

    return (
      <div key={`mobile-tooth-${spanKey}-${toothNumber}`} className={SCROLL_TOOTH_SLOT_CLASS}>
        <div
          data-tooth-copy-drop={extrasEditable ? spanKey : undefined}
          className={cn(
            mobileToothCardShellClass,
            !spanSelected && selectable && "opacity-55 saturate-50",
            isMissingTooth
              ? isLinked
                ? "border-primary bg-slate-50"
                : "rounded-xl border-slate-300 bg-slate-50"
              : spanSelected
                ? isLinked
                  ? "border-primary bg-gradient-to-b from-primary-soft via-primary-soft/95 to-white ring-1 ring-primary/40"
                  : "rounded-xl border-primary/90 bg-gradient-to-b from-primary-soft via-white to-primary-soft/40 ring-1 ring-primary-muted/40"
                : isLinked
                  ? "border-slate-300 bg-slate-50"
                  : "rounded-xl border-slate-300 bg-slate-50",
            isLinked && spanSelected && isFirst && isLast && "rounded-xl",
            isLinked && spanSelected && isFirst && !isLast && "rounded-l-xl rounded-r-none",
            isLinked && spanSelected && !isFirst && isLast && "rounded-r-xl rounded-l-none",
            isLinked && spanSelected && !isFirst && !isLast && "rounded-none",
            isLinked && spanSelected && !isFirst && "border-l-0",
            isLinked && spanSelected && !isLast && "border-r-0",
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

          <span
            className={cn(
              "relative z-[1] flex h-10 items-center text-xl font-bold tracking-tight text-slate-800",
              toothNumber === "상악" || toothNumber === "하악"
                ? "text-base"
                : "tabular-nums",
            )}
          >
            {toothNumber}
          </span>

          {isMissingTooth ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative z-20 mt-1.5 flex h-7 w-full min-w-0 items-center justify-center self-stretch rounded-md bg-transparent px-0.5 text-center text-[11px] text-slate-500">
                  <span className="block w-full truncate px-0.5">
                    {NO_WORK_PROSTHESIS_TYPE}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                {NO_WORK_PROSTHESIS_TOOLTIP}
              </TooltipContent>
            </Tooltip>
          ) : (
            renderProsthesisTypeControl(row, spanKey, {
              editable: extrasEditable,
            })
          )}

          {renderEditableExtras(row, spanKey, { editable: extrasEditable })}
        </div>
      </div>
    );
  };

  const renderMobileSpanRow = (entry: MobileSpanEntry) => {
    const { teeth, row, spanKey } = entry;
    if (teeth.length === 0) return null;
    const spanSelected = selectable ? (selectedSpanKeys?.has(spanKey) ?? false) : true;
    const archLabel = isSameToothSet(teeth, UPPER_ARCH_TEETH)
      ? "상악"
      : isSameToothSet(teeth, LOWER_ARCH_TEETH)
        ? "하악"
        : null;
    const displayTeeth = archLabel ? [teeth[0]] : teeth;

    return (
      <div key={`mobile-span-${spanKey}`} className="space-y-1">
        <div className="flex items-stretch gap-2">
          {selectable ? (
            <div
              className="flex shrink-0 items-start pt-2"
              onClick={(event) => event.stopPropagation()}
            >
              <Checkbox
                checked={spanSelected}
                disabled={selectionDisabled}
                onCheckedChange={(checked) =>
                  onToggleSpanKey?.(spanKey, checked === true)
                }
                aria-label={`${row.prosthesisType || "보철"} ${archLabel || spanKey} 선택`}
              />
            </div>
          ) : null}
          <PracticeToothChartHorizontalScroll
            className="min-w-0 w-full max-w-full flex-1"
            ariaLabel={`${archLabel || spanKey} 브리지 — 가로로 스크롤`}
          >
            <div className="inline-flex w-max items-stretch">
              {displayTeeth.map((toothNumber, index) => (
                <div
                  key={`mobile-span-tooth-${spanKey}-${archLabel || toothNumber}`}
                  className="flex shrink-0 items-stretch"
                >
                  {renderMobileToothCard(
                    row,
                    archLabel || toothNumber,
                    index,
                    displayTeeth.length,
                  )}
                  {index < displayTeeth.length - 1 ? renderMobileSpanBridgeGap() : null}
                </div>
              ))}
            </div>
          </PracticeToothChartHorizontalScroll>
        </div>
        {renderOrderChangeLog(spanKey, row)}
      </div>
    );
  };

  const renderMobileArchSection = (
    label: string,
    entries: MobileSpanEntry[],
  ) => {
    if (entries.length === 0) return null;
    const archTeeth = label === "상악" ? UPPER_ARCH_TEETH : LOWER_ARCH_TEETH;
    const allTeeth = entries.flatMap((entry) => entry.teeth);
    const canCollapseArch =
      isSameToothSet(allTeeth, archTeeth) &&
      (!selectable || entries.length === 1);
    const displayEntries = canCollapseArch
      ? [
          {
            teeth: [...archTeeth],
            row: entries[0].row,
            spanKey: entries[0].spanKey,
          },
        ]
      : entries;
    return (
      <div className="space-y-2">
        {upperSpanEntries.length > 0 && lowerSpanEntries.length > 0 ? (
          <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        ) : null}
        {displayEntries.map((entry) => renderMobileSpanRow(entry))}
      </div>
    );
  };

  const buildChartRows = (
    decades: typeof treatedChartRows,
    options: { fullLayout: boolean },
  ) => {
    const { fullLayout } = options;
    const slotClass = fullLayout ? TOOTH_SLOT_FULL_CLASS : TOOTH_SLOT_CLASS;
    const cardShellClass = fullLayout ? fullToothCardShellClass : toothCardShellClass;

    return decades.map((decade) => {
      const collapseToArch =
        !fullLayout && isSameToothSet(decade.teeth, decade.chartTeeth);
      const visible = collapseToArch
        ? decade.teeth.slice(0, 1)
        : decade.teeth;
      const archDisplayLabel = collapseToArch ? decade.label : null;

      const rowTrack = (
        <div
          className={cn(
            "items-stretch gap-0",
            fullLayout ? "flex w-full min-w-0" : "inline-flex w-max",
          )}
        >
          {visible.map((toothNumber, visibleIndex) => {
              const row = byTooth.get(toothNumber);
              if (!row && !fullLayout) return null;
              const toothLabel = archDisplayLabel || toothNumber;

              const chartIdx = decade.chartTeeth.indexOf(toothNumber);
              const chartNext =
                !collapseToArch &&
                chartIdx >= 0 &&
                chartIdx < decade.chartTeeth.length - 1
                  ? decade.chartTeeth[chartIdx + 1]
                  : null;
              const chartPrev =
                !collapseToArch && chartIdx > 0
                  ? decade.chartTeeth[chartIdx - 1]
                  : null;
              const nextVisible = visible[visibleIndex + 1];
              const adjacentVisible = Boolean(chartNext) && nextVisible === chartNext;

              if (!row) {
                return (
                  <div
                    key={`ro-tooth-slot-${toothNumber}`}
                    className={
                      fullLayout ? "contents" : "flex shrink-0 items-stretch"
                    }
                  >
                    <div className={cn("relative", slotClass)}>
                      <div
                        className={cn(
                          cardShellClass,
                          "rounded-xl border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80",
                        )}
                      >
                        <span className="flex h-10 items-center text-xl font-bold tabular-nums tracking-tight text-slate-300">
                          {toothLabel}
                        </span>
                      </div>
                    </div>
                    {renderBridgeGap(
                      toothNumber,
                      chartNext,
                      false,
                      adjacentVisible,
                      fullLayout,
                      visibleIndex < visible.length - 1,
                    )}
                  </div>
                );
              }

              const adjacentLinks = collapseToArch
                ? []
                : collectAdjacentBridgeLinks(toothWorks, toothNumber);
              const linkedChartNext = Boolean(
                chartNext && adjacentLinks.includes(chartNext),
              );
              const linkedChartPrev = Boolean(
                chartPrev && adjacentLinks.includes(chartPrev),
              );
              const isLinked = adjacentLinks.length > 0;
              const bridgeLinked = linkedChartNext;
              const showBridgeConnector = adjacentVisible && bridgeLinked;

              const isMissingTooth = isMissingToothProsthesisType(row.prosthesisType);
              const spanKey = resolveSpanKey(row);
              const spanSelected = isSpanSelected(row);
              // byTooth는 연결치에 toothNumber를 덮어쓰므로, 원 toothWorks 행 소유만 앵커로 본다.
              const isAnchorTooth = toothWorks.some(
                (candidate) =>
                  String(candidate.toothNumber || "").trim() === toothNumber,
              );
              const canToggleSpan =
                selectable && Boolean(onToggleSpanKey) && !selectionDisabled;

              const toggleSpanSelection = () => {
                if (!canToggleSpan) return;
                onToggleSpanKey?.(spanKey, !spanSelected);
              };

              return (
                <div
                  key={`ro-tooth-slot-${archDisplayLabel || toothNumber}`}
                  className={
                    fullLayout ? "contents" : "flex shrink-0 items-stretch"
                  }
                >
                  <div className={cn("relative", slotClass)}>
                    {linkedChartNext && !showBridgeConnector ? (
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
                      data-tooth-copy-drop={
                        isAnchorTooth && (specsEditable || typeChangeEnabled)
                          ? spanKey
                          : undefined
                      }
                      role={canToggleSpan ? "button" : undefined}
                      tabIndex={canToggleSpan ? 0 : undefined}
                      onClick={canToggleSpan ? toggleSpanSelection : undefined}
                      onKeyDown={
                        canToggleSpan
                          ? (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                toggleSpanSelection();
                              }
                            }
                          : undefined
                      }
                      className={cn(
                        cardShellClass,
                        canToggleSpan && "cursor-pointer",
                        !spanSelected && selectable && "opacity-55 saturate-50",
                        isMissingTooth
                          ? isLinked
                            ? "border-primary bg-slate-50"
                            : "rounded-xl border-slate-300 bg-slate-50"
                          : spanSelected
                            ? isLinked
                              ? "border-primary bg-gradient-to-b from-primary-soft via-primary-soft/95 to-white ring-1 ring-primary/40"
                              : "rounded-xl border-primary/90 bg-gradient-to-b from-primary-soft via-white to-primary-soft/40 ring-1 ring-primary-muted/40"
                            : isLinked
                              ? "border-slate-300 bg-slate-50"
                              : "rounded-xl border-slate-300 bg-slate-50",
                        isLinked && spanSelected && !linkedChartPrev && !linkedChartNext && "rounded-xl",
                        isLinked && spanSelected && linkedChartPrev && linkedChartNext && "rounded-none",
                        isLinked && spanSelected && linkedChartPrev && !linkedChartNext && "rounded-r-xl rounded-l-none",
                        isLinked && spanSelected && !linkedChartPrev && linkedChartNext && "rounded-l-xl rounded-r-none",
                        isLinked && spanSelected && linkedChartPrev && "border-l-0",
                        isLinked && spanSelected && linkedChartNext && "border-r-0",
                      )}
                    >
                      {selectable && isAnchorTooth ? (
                        <div
                          className="absolute left-1 top-1 z-30"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Checkbox
                            checked={spanSelected}
                            disabled={selectionDisabled}
                            onCheckedChange={(checked) =>
                              onToggleSpanKey?.(spanKey, checked === true)
                            }
                            aria-label={`${row.prosthesisType || "보철"} ${spanKey} 선택`}
                          />
                        </div>
                      ) : null}
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

                      <span
                        className={cn(
                          "relative z-[1] flex h-10 items-center text-xl font-bold tracking-tight text-slate-800",
                          archDisplayLabel ? "text-base" : "tabular-nums",
                        )}
                      >
                        {toothLabel}
                      </span>

                      {isMissingTooth ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="relative z-20 mt-1.5 flex h-7 w-full min-w-0 max-w-full items-center justify-center self-stretch rounded-md bg-transparent px-0.5 text-center text-[11px] text-slate-500">
                              <span className="block w-full truncate px-0.5">
                                {NO_WORK_PROSTHESIS_TYPE}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                            {NO_WORK_PROSTHESIS_TOOLTIP}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        renderProsthesisTypeControl(row, spanKey, {
                          editable: isAnchorTooth,
                        })
                      )}

                      {renderEditableExtras(row, spanKey, {
                        editable: isAnchorTooth,
                      })}
                    </div>
                    {isAnchorTooth
                      ? renderOrderChangeLog(spanKey, row)
                      : null}
                  </div>
                  {renderBridgeGap(
                    toothNumber,
                    chartNext,
                    showBridgeConnector,
                    adjacentVisible,
                    fullLayout,
                    visibleIndex < visible.length - 1,
                  )}
                </div>
              );
            })}
        </div>
      );

      return (
        <div
          key={`ro-decade-${decade.key}-${fullLayout ? "full" : "compact"}`}
          className="w-full min-w-0 max-w-full"
        >
          {fullLayout ? (
            rowTrack
          ) : (
            <PracticeToothChartHorizontalScroll
              ariaLabel={`${decade.label} 치식 가로 스크롤`}
            >
              {rowTrack}
            </PracticeToothChartHorizontalScroll>
          )}
        </div>
      );
    });
  };

  const inlineChartRows = buildChartRows(treatedChartRows, {
    fullLayout: false,
  });
  const enlargeChartRows = buildChartRows(fullChartRows, {
    fullLayout: true,
  });

  const upperInlineRow = (() => {
    const idx = treatedChartRows.findIndex((row) => row.key === "upper");
    return idx >= 0 ? inlineChartRows[idx] : null;
  })();
  const lowerInlineRow = (() => {
    const idx = treatedChartRows.findIndex((row) => row.key === "lower");
    return idx >= 0 ? inlineChartRows[idx] : null;
  })();
  const upperEnlargeRow = enlargeChartRows[0] ?? null;
  const lowerEnlargeRow = enlargeChartRows[1] ?? null;

  const feeEstimate = (
    <PracticeTransferFeeEstimate
      quote={feeQuoteForStages}
      viewer={feeViewer}
      consentTransferId={consentTransferId}
      skipJig={skipJig}
      labEffectiveStars={labEffectiveStars}
      confirmedFeeLabel={confirmedFeeLabel}
      feeStages={feeStages}
      feeStageFocusIndex={feeStageFocusIndex}
      showFinalFee={showFinalFee}
      className={
        embedded ? "border-0 bg-transparent px-0 py-1 shadow-none" : undefined
      }
    />
  );

  const inlineChartBody = isMobile ? (
    <div className="space-y-3">
      {renderMobileArchSection("상악", upperSpanEntries)}
      <PracticeTransferFeeEstimate
        quote={feeQuoteForStages}
        viewer={feeViewer}
      consentTransferId={consentTransferId}
        skipJig={skipJig}
        labEffectiveStars={labEffectiveStars}
        confirmedFeeLabel={confirmedFeeLabel}
        feeStages={feeStages}
        feeStageFocusIndex={feeStageFocusIndex}
        showFinalFee={showFinalFee}
        className={
          embedded ? "border-0 bg-transparent px-0 py-1 shadow-none" : undefined
        }
      />
      {renderMobileArchSection("하악", lowerSpanEntries)}
    </div>
  ) : (
    <div className="space-y-2">
      {upperInlineRow}
      {feeEstimate}
      {lowerInlineRow}
    </div>
  );

  const enlargeChartBody = isMobile ? (
    inlineChartBody
  ) : (
    <div className="space-y-2">
      {upperEnlargeRow}
      <PracticeTransferFeeEstimate
        quote={feeQuoteForStages}
        viewer={feeViewer}
      consentTransferId={consentTransferId}
        skipJig={skipJig}
        labEffectiveStars={labEffectiveStars}
        confirmedFeeLabel={confirmedFeeLabel}
        feeStages={feeStages}
        feeStageFocusIndex={feeStageFocusIndex}
        showFinalFee={showFinalFee}
        className={embedded ? "border-0 bg-transparent px-0 py-1 shadow-none" : undefined}
      />
      {lowerEnlargeRow}
    </div>
  );

  const openEnlargeDialog = () => {
    setToothChartEnlargeOpen(true);
  };

  const headerTeethSummary = formatToothNumbersForCard(
    Array.from(selectable ? selectedTeeth : allDisplayTeeth),
  );
  const headerCountLabel =
    /^(상악|하악)(,(상악|하악))?$/.test(headerTeethSummary)
      ? headerTeethSummary.replace(/,/g, "·")
      : `${selectable ? selectedTeeth.size : allDisplayTeeth.size}개`;

  const enlargeButton = showEnlargeButton ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 px-2.5 text-xs"
      onClick={openEnlargeDialog}
    >
      {enlargeButtonLabel}
    </Button>
  ) : null;

  return (
    <div className={cn("min-w-0 max-w-full space-y-2", className)}>
      {!toothChartEnlargeOpen ? (
        <>
          {showHeader ? (
            <div className="relative flex min-h-8 items-center">
              <p className="text-sm font-medium text-slate-700">
                보철물{" "}
                <span className="font-normal text-muted-foreground">
                  ({headerCountLabel})
                </span>
              </p>
              {enlargeButton ? <div className="absolute right-0">{enlargeButton}</div> : null}
            </div>
          ) : enlargeButton ? (
            <div className="flex justify-end">{enlargeButton}</div>
          ) : null}
          {inlineChartBody}
        </>
      ) : null}

      <Dialog open={toothChartEnlargeOpen} onOpenChange={setToothChartEnlargeOpen}>
        <DialogContent
          overlayClassName={enlargeOverlayClass}
          className={cn(
            enlargeDialogClass,
            "w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] gap-3 p-4 sm:max-w-[calc(100vw-1rem)] sm:p-5",
          )}
        >
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="text-base">
              보철물{" "}
              <span className="font-normal text-muted-foreground">
                ({headerCountLabel})
              </span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              보철물 치식 차트를 가로로 크게 봅니다.
            </DialogDescription>
          </DialogHeader>
          {toothChartEnlargeOpen ? enlargeChartBody : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};
