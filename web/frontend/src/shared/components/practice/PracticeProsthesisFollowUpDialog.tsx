/**
 * 임시치아 → 지르 후속, 또는 보철 종류 변경 리메이크(인레이→크라운 등).
 * related files:
 * - web/frontend/src/shared/practice/prosthesisFollowUp.ts
 * - web/frontend/src/shared/components/practice/PracticeToothWorkChartReadOnly.tsx
 * - web/frontend/src/shared/components/practice/PracticeCustomAbutmentSpecsDialog.tsx
 * - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
 * change-log:
 * - 2026-09-23: UI 라벨 — 보철 종류 변경→주문 변경(버튼·모달 제목·의뢰 CTA).
 * - 2026-09-23: 주문 변경 — 동일 종류라도 어벗·쉐이드·임플란트 스펙 변경 허용.
 * - 2026-09-23: 주문 변경 — 카드 전 항목 변경·전후 기록(의뢰모드 잠금 해제 포함).
 * - 2026-09-23: 취소 후 dismissKind 잔존 → 재오픈 시 취소/닫기 무시 수정(intake와 동일).
 * - 2026-09-22: 어벗·스캔바디 → PracticeCustomAbutmentSpecsDialog(신규의뢰와 동일).
 * - 2026-09-22: 보철 종류 변경 — 목록 섹션 제거, 보철물 카드에서 직접 선택·전후 기록.
 * - 2026-09-22: 제작 변경(edit) — 종류 변경 건도 보철물 카드에서 종류 선택.
 * - 2026-09-22: 제작 변경 — 원 행 없어도 카드 종류 선택(단계 스냅샷으로 전후 표시).
 * - 2026-09-22: edit 종류 변경 — 「현재」= pending 후속(이미 적용된 종류). 원본과 같아도 적용 가능.
 * - 2026-09-22: 제작 변경 — 카드에서 어벗·쉐이드 선택·저장.
 * - 2026-09-21: 보철 종류 변경 리메이크(인레이→크라운) — 단계 최고가만 청구 안내·형태 선택.
 * - 2026-09-01: 임시치아 → 최종 보철 후속 제작 확인 다이얼로그.
 * - 2026-09-01: 크라운·브리지 단위 선택(부분 제작) — 보철물 카드에서 체크.
 * - 2026-09-01: 재도착일 적용 시 계정·기공소 기본 소요일 서버 저장.
 * - 2026-09-15: 제작 의뢰 시 도착일 팝오버를 먼저 열어 확정하게 함.
 * - 2026-09-15: 제작 변경 — pending 후속 지르 표시(단계 포커스 필터 없음).
 * - 2026-09-15: 지르 제작·변경 모달 — 이번 단계 견적만(최종 기공비 숨김).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  PracticeCustomAbutmentSpecsDialog,
  prepareCustomAbutmentSpecsOpenRow,
} from "@/shared/components/practice/PracticeCustomAbutmentSpecsDialog";
import { PracticeToothWorkChartReadOnly } from "@/shared/components/practice/PracticeToothWorkChartReadOnly";
import {
  buildFollowUpToothWorksDraft,
  followUpRowSpanKey,
  hasToothWorkOrderChange,
  isFinalProsthesisType,
  listEditablePendingFollowUpToothWorks,
  listPendingFollowUpSourceSpans,
  resolveFollowUpKind,
  type ProsthesisFeeStageRecord,
  type ProsthesisFollowUpRecord,
} from "@/shared/practice/prosthesisFollowUp";
import {
  ABUTMENT_PRODUCT_MODE,
  clearSimpleAbutmentIfCustomProsthesis,
  emptyToothWorkAbutment,
  emptyToothWorkCustomSpecs,
  isAbutmentProductMode,
  isCustomAbutmentProsthesisType,
  isCustomAbutmentSelection,
  isCustomAbutmentSupportedProsthesisType,
  isSimpleAbutmentMode,
  pickToothWorkCustomSpecs,
  type AbutmentProductMode,
  type CustomAbutmentSelection,
  type PracticeAbutmentFavorite,
  type PracticeImplantFavorite,
  type SimpleSpecOptionCatalog,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";
import type { ImplantConnection } from "@/shared/practice/useImplantConnectionCatalog";
import { toKstYmd, ymdToKstDate } from "@/shared/date/kst";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { useResizableDialogWidth } from "@/shared/hooks/useResizableDialogWidth";

type FollowUpRow = ToothWorkSelection & { prosthesisPhase: string };

const TYPE_CHANGE_OPTIONS = ["인레이", "크라운", "브리지"] as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "create" | "edit";
  toothWorks?: Partial<ToothWorkSelection>[] | null;
  prosthesisFollowUps?: ReadonlyArray<ProsthesisFollowUpRecord> | null;
  /** 원 단계 스냅샷 — edit 시 변경 전 종류 복원 */
  prosthesisFeeStages?: ReadonlyArray<ProsthesisFeeStageRecord> | null;
  requestorDownloadedAt?: string | null;
  orderDate: string;
  defaultArrivalYmd: string;
  arrivalDefaultDays: number;
  labAnchorId?: string | null;
  busy?: boolean;
  /** 재도착일 적용 — 주문일↔도착일 차이로 계정·기공소 기본 소요일 갱신 */
  onArrivalReschedule?: (payload: {
    orderYmd: string;
    arrivalYmd: string;
  }) => void;
  onConfirm: (payload: {
    arrivalYmd: string;
    toothWorks: FollowUpRow[];
  }) => void | Promise<void>;
  implantConnections?: ImplantConnection[];
  implantFavorites?: PracticeImplantFavorite[];
  onImplantFavoritesChange?: (
    next: PracticeImplantFavorite[],
  ) => void | Promise<void>;
  abutmentFavorites?: PracticeAbutmentFavorite[];
  onAbutmentFavoritesChange?: (
    next: PracticeAbutmentFavorite[],
  ) => void | Promise<void>;
  directAbutmentFavorites?: PracticeAbutmentFavorite[];
  onDirectAbutmentFavoritesChange?: (
    next: PracticeAbutmentFavorite[],
  ) => void | Promise<void>;
  simpleAbutmentOptions?: SimpleSpecOptionCatalog | null;
  onSimpleAbutmentOptionsChange?: (
    next: SimpleSpecOptionCatalog,
  ) => void | Promise<void>;
  simpleHealingOptions?: SimpleSpecOptionCatalog | null;
  onSimpleHealingOptionsChange?: (
    next: SimpleSpecOptionCatalog,
  ) => void | Promise<void>;
  onPresetEditorOpen?: () => void;
  defaultAbutmentProductMode?: AbutmentProductMode;
  onDefaultAbutmentProductModeChange?: (
    next: AbutmentProductMode,
  ) => void | Promise<void>;
};

export function PracticeProsthesisFollowUpDialog({
  open,
  onOpenChange,
  mode = "create",
  toothWorks,
  prosthesisFollowUps = null,
  prosthesisFeeStages: _prosthesisFeeStages = null,
  requestorDownloadedAt = null,
  orderDate,
  defaultArrivalYmd,
  arrivalDefaultDays: _arrivalDefaultDays,
  labAnchorId = null,
  busy = false,
  onArrivalReschedule,
  onConfirm,
  implantConnections = [],
  implantFavorites = [],
  onImplantFavoritesChange,
  abutmentFavorites = [],
  onAbutmentFavoritesChange,
  directAbutmentFavorites = [],
  onDirectAbutmentFavoritesChange,
  simpleAbutmentOptions = null,
  onSimpleAbutmentOptionsChange,
  simpleHealingOptions = null,
  onSimpleHealingOptionsChange,
  onPresetEditorOpen,
  defaultAbutmentProductMode = ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION,
  onDefaultAbutmentProductModeChange,
}: Props) {
  const isMobile = useIsMobile();
  const { width: dialogWidth, beginHorizontalResize } = useResizableDialogWidth(
    open,
    { storageKey: "abuts.prosthesisFollowUpDialog.width.v1" },
  );
  const isEdit = mode === "edit";

  const draftRows = useMemo(
    () =>
      isEdit
        ? listEditablePendingFollowUpToothWorks(
            toothWorks,
            prosthesisFollowUps,
            requestorDownloadedAt,
          )
        : buildFollowUpToothWorksDraft(
            Array.isArray(toothWorks) ? toothWorks : [],
          ),
    [isEdit, prosthesisFollowUps, requestorDownloadedAt, toothWorks],
  );

  /** create: pending 스팬 종류. edit: 최종 보철 후속이면 카드에서 종류 변경 */
  const isTypeChange = useMemo(() => {
    const rows = Array.isArray(toothWorks) ? toothWorks : [];
    if (!isEdit) {
      return resolveFollowUpKind(rows) === "typeChange";
    }
    if (draftRows.length === 0) return false;
    return draftRows.every((draft) =>
      isFinalProsthesisType(String(draft.prosthesisType || "").trim()),
    );
  }, [draftRows, isEdit, toothWorks]);

  /**
   * 「현재」·변경 전후 기준.
   * create: 원 의뢰 행(인레이 등).
   * edit: 이미 적용된 pending 후속(크라운 등) — 원본이 아님.
   */
  const sourceRowBySpan = useMemo(() => {
    const map = new Map<string, Partial<ToothWorkSelection>>();
    const rows = Array.isArray(toothWorks) ? toothWorks : [];
    if (!isEdit) {
      for (const span of listPendingFollowUpSourceSpans(rows)) {
        map.set(span.teeth.join("-"), span.sourceRow || {});
      }
      return map;
    }
    for (const draft of draftRows) {
      const key = followUpRowSpanKey(draft);
      map.set(key, draft);
    }
    return map;
  }, [draftRows, isEdit, toothWorks]);

  const sourceTypeBySpan = useMemo(() => {
    const map = new Map<string, string>();
    for (const [key, row] of sourceRowBySpan) {
      const sourceType = String(row?.prosthesisType || "").trim();
      if (sourceType) map.set(key, sourceType);
    }
    return map;
  }, [sourceRowBySpan]);

  const [rowBySpanKey, setRowBySpanKey] = useState<Map<string, FollowUpRow>>(
    () => new Map(),
  );
  const [selectedSpanKeys, setSelectedSpanKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [arrivalDate, setArrivalDate] = useState(
    String(defaultArrivalYmd || "").trim(),
  );
  const [arrivalPickerOpen, setArrivalPickerOpen] = useState(false);
  const [arrivalDraft, setArrivalDraft] = useState<Date | undefined>(undefined);

  const todayYmd = useMemo(() => toKstYmd(new Date()) || "", []);
  const orderYmd = String(orderDate || "").trim() || todayYmd;

  const availableRows = useMemo(() => {
    if (rowBySpanKey.size === 0) return draftRows;
    return draftRows.map((row) => {
      const key = followUpRowSpanKey(row);
      return rowBySpanKey.get(key) || row;
    });
  }, [draftRows, rowBySpanKey]);

  const selectedRows = useMemo(
    () =>
      isEdit
        ? availableRows
        : availableRows.filter((row) =>
            selectedSpanKeys.has(followUpRowSpanKey(row)),
          ),
    [availableRows, isEdit, selectedSpanKeys],
  );

  const orderChangeValid = useMemo(() => {
    if (!isTypeChange) return true;
    return selectedRows.every((row) => {
      const key = followUpRowSpanKey(row);
      const sourceRow = sourceRowBySpan.get(key);
      const nextType = String(row.prosthesisType || "").trim();
      if (!isFinalProsthesisType(nextType)) return false;
      // create만: 원본과 완전 동일하면 거부. edit는 도착일만 변경 OK.
      if (!isEdit && !hasToothWorkOrderChange(sourceRow, row)) return false;
      return true;
    });
  }, [isEdit, isTypeChange, selectedRows, sourceRowBySpan]);

  useEffect(() => {
    if (!open) return;
    setArrivalDate(String(defaultArrivalYmd || "").trim());
    setArrivalPickerOpen(!isEdit);
    const nextMap = new Map<string, FollowUpRow>();
    for (const row of draftRows) {
      nextMap.set(followUpRowSpanKey(row), row);
    }
    setRowBySpanKey(nextMap);
    if (!isEdit) {
      setSelectedSpanKeys(
        new Set(draftRows.map((row) => followUpRowSpanKey(row))),
      );
    }
  }, [open, defaultArrivalYmd, isEdit, draftRows]);

  useEffect(() => {
    if (!arrivalPickerOpen) return;
    const seedYmd =
      String(arrivalDate || "").trim() || defaultArrivalYmd || todayYmd;
    setArrivalDraft(ymdToKstDate(seedYmd) || undefined);
  }, [arrivalPickerOpen, arrivalDate, defaultArrivalYmd, todayYmd]);

  const handleOpenChange = (next: boolean) => {
    if (!next && busy) return;
    onOpenChange(next);
  };

  const confirmArrivalDraft = () => {
    const ymd = toKstYmd(arrivalDraft) || "";
    if (!ymd || (todayYmd && ymd < todayYmd)) return;
    setArrivalDate(ymd);
    setArrivalPickerOpen(false);
    onArrivalReschedule?.({ orderYmd: todayYmd, arrivalYmd: ymd });
  };

  const toggleSpanKey = (key: string, next: boolean) => {
    setSelectedSpanKeys((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(key);
      else copy.delete(key);
      return copy;
    });
  };

  const setRowProsthesisType = (spanKey: string, prosthesisType: string) => {
    setRowBySpanKey((prev) => {
      const copy = new Map(prev);
      const current = copy.get(spanKey);
      if (!current) return prev;
      const nextType = String(prosthesisType || "").trim();
      const supportsCa = isCustomAbutmentSupportedProsthesisType(nextType);
      copy.set(spanKey, {
        ...current,
        prosthesisType: nextType,
        ...(supportsCa
          ? {}
          : {
              customAbutment: false,
              customAbutmentSelection: undefined,
              ...emptyToothWorkCustomSpecs(),
            }),
      });
      return copy;
    });
    setSelectedSpanKeys((prev) => {
      if (prev.has(spanKey)) return prev;
      const copy = new Set(prev);
      copy.add(spanKey);
      return copy;
    });
  };

  const [customSpecsSpanKey, setCustomSpecsSpanKey] = useState<string | null>(
    null,
  );
  const [customSpecsSelectionLock, setCustomSpecsSelectionLock] =
    useState<CustomAbutmentSelection | null>(null);
  const customSpecsDismissKindRef = useRef<"confirm" | "cancel" | null>(null);
  const customSpecsSnapshotRef = useRef<{
    spanKey: string;
    row: FollowUpRow;
  } | null>(null);

  useEffect(() => {
    if (open) return;
    setCustomSpecsSpanKey(null);
    setCustomSpecsSelectionLock(null);
    customSpecsSnapshotRef.current = null;
    customSpecsDismissKindRef.current = null;
  }, [open]);

  const closeCustomSpecsModal = () => {
    setCustomSpecsSpanKey(null);
    setCustomSpecsSelectionLock(null);
  };

  const openCustomSpecsModal = (
    spanKey: string,
    selection?: CustomAbutmentSelection,
  ) => {
    customSpecsDismissKindRef.current = null;
    const current =
      rowBySpanKey.get(spanKey) ||
      availableRows.find((row) => followUpRowSpanKey(row) === spanKey) ||
      draftRows.find((row) => followUpRowSpanKey(row) === spanKey);
    if (!current) return;
    const snapshotRow = clearSimpleAbutmentIfCustomProsthesis({
      ...current,
      bridgeLinkedTeeth: [...(current.bridgeLinkedTeeth || [])],
    }) as FollowUpRow;
    customSpecsSnapshotRef.current = { spanKey, row: snapshotRow };
    const requested = isCustomAbutmentSelection(selection) ? selection : null;
    const prepared = prepareCustomAbutmentSpecsOpenRow(current, {
      selection: requested,
      // 주문 변경: 의뢰모드 포함 전 항목 변경 가능. 지르 후속만 디자인+생산 고정.
      lockedMode: isTypeChange
        ? null
        : ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION,
      defaultAbutmentProductMode,
    });
    setCustomSpecsSelectionLock(prepared.selection);
    setRowBySpanKey((prev) => {
      const copy = new Map(prev);
      const row = copy.get(spanKey);
      if (!row) return prev;
      copy.set(spanKey, { ...row, ...prepared.row });
      return copy;
    });
    setSelectedSpanKeys((prev) => {
      if (prev.has(spanKey)) return prev;
      const copy = new Set(prev);
      copy.add(spanKey);
      return copy;
    });
    setCustomSpecsSpanKey(spanKey);
  };

  const patchToothWorkRow = (
    spanKey: string,
    patch: Partial<ToothWorkSelection>,
  ) => {
    setRowBySpanKey((prev) => {
      const copy = new Map(prev);
      const current = copy.get(spanKey);
      if (!current) return prev;
      const nextType =
        patch.prosthesisType != null
          ? String(patch.prosthesisType || "").trim()
          : String(current.prosthesisType || "").trim();
      const supportsCa = isCustomAbutmentSupportedProsthesisType(nextType);
      const merged = { ...current, ...patch, prosthesisType: nextType };
      copy.set(
        spanKey,
        supportsCa
          ? merged
          : {
              ...merged,
              customAbutment: false,
              customAbutmentSelection: undefined,
              ...emptyToothWorkCustomSpecs(),
            },
      );
      return copy;
    });
    setSelectedSpanKeys((prev) => {
      if (prev.has(spanKey)) return prev;
      const copy = new Set(prev);
      copy.add(spanKey);
      return copy;
    });
    if (customSpecsSpanKey === spanKey && patch.customAbutment === false) {
      customSpecsSnapshotRef.current = null;
      closeCustomSpecsModal();
    }
  };

  const cancelCustomSpecsModal = () => {
    if (customSpecsDismissKindRef.current === "cancel") {
      if (customSpecsSpanKey != null) closeCustomSpecsModal();
      return;
    }
    customSpecsDismissKindRef.current = "cancel";
    const snap = customSpecsSnapshotRef.current;
    customSpecsSnapshotRef.current = null;
    if (snap) {
      setRowBySpanKey((prev) => {
        const copy = new Map(prev);
        if (!copy.has(snap.spanKey)) return prev;
        copy.set(snap.spanKey, snap.row);
        return copy;
      });
    }
    closeCustomSpecsModal();
  };

  const confirmCustomSpecsModal = () => {
    customSpecsDismissKindRef.current = "confirm";
    customSpecsSnapshotRef.current = null;
    closeCustomSpecsModal();
  };

  const patchCustomSpecsOnSpan = (
    patch: Partial<ReturnType<typeof emptyToothWorkCustomSpecs>>,
  ) => {
    if (!customSpecsSpanKey) return;
    setRowBySpanKey((prev) => {
      const copy = new Map(prev);
      const row = copy.get(customSpecsSpanKey);
      if (!row) return prev;
      let nextPatch = patch;
      if (
        isCustomAbutmentProsthesisType(row.prosthesisType) &&
        ("abutmentManufacturer" in nextPatch ||
          "abutmentDiameter" in nextPatch ||
          "abutmentHeight" in nextPatch) &&
        isSimpleAbutmentMode({ ...row, ...nextPatch })
      ) {
        nextPatch = { ...nextPatch, ...emptyToothWorkAbutment() };
      }
      const merged = {
        ...pickToothWorkCustomSpecs(row, true),
        ...nextPatch,
      };
      copy.set(customSpecsSpanKey, {
        ...row,
        customAbutment: true,
        ...merged,
      });
      return copy;
    });
  };

  const canSubmit =
    !busy &&
    selectedRows.length > 0 &&
    orderChangeValid &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(arrivalDate || "").trim());

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        overlayClassName="z-[310]"
        className="z-[320] flex max-h-[min(92vh,860px)] translate-x-[-50%] translate-y-[-50%] flex-col gap-0 overflow-hidden p-0 sm:max-w-none sm:rounded-xl sm:p-0"
        style={
          isMobile ? undefined : { width: dialogWidth, maxWidth: dialogWidth }
        }
      >
        {!isMobile && !busy ? (
          <>
            <div
              aria-hidden
              className="absolute bottom-3 left-0 top-3 z-30 w-3 cursor-ew-resize touch-none"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                beginHorizontalResize("w", e.clientX);
              }}
            />
            <div
              aria-hidden
              className="absolute bottom-3 right-0 top-3 z-30 w-3 cursor-ew-resize touch-none"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                beginHorizontalResize("e", e.clientX);
              }}
            />
          </>
        ) : null}
        <DialogHeader className="border-b px-5 py-4 text-left">
          <DialogTitle>
            {isEdit
              ? "최종 보철 제작 변경"
              : isTypeChange
                ? "주문 변경"
                : "지르 보철 제작"}
          </DialogTitle>
          {!isEdit && !isTypeChange ? (
            <p className="pt-1 text-sm font-normal leading-relaxed text-muted-foreground">
              임시치아를 지르 최종 보철로 바꿉니다. 이번 단계 기공비는
              브리지·크라운 수가입니다. 모든 임시치아를 지르로 바꾼 뒤에만
              최종 기공비(처음부터 지르·커스텀어벗으로 제작한 합계)가
              표시됩니다. 지금은 임시치아로 계속하려면 이 창을 닫고
              「다음 도착일」만 지정하면 됩니다.
            </p>
          ) : null}
        </DialogHeader>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <div className="space-y-5">
            <section>
              <dl className="grid grid-cols-2 gap-4">
                <div className="min-w-0 space-y-1">
                  <dt className="text-[13px] leading-snug text-muted-foreground">
                    주문일
                  </dt>
                  <dd className="text-sm font-medium leading-snug text-foreground">
                    {orderYmd || "-"}
                  </dd>
                </div>
                <div className="min-w-0 space-y-1">
                  <dt className="text-[13px] leading-snug text-muted-foreground">
                    치과도착일
                  </dt>
                  <dd className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-medium leading-snug text-foreground">
                        {arrivalDate || "-"}
                      </p>
                      <Popover
                        open={arrivalPickerOpen}
                        onOpenChange={setArrivalPickerOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 shrink-0 gap-1 px-2 text-xs"
                            disabled={busy}
                          >
                            <CalendarClock className="h-3.5 w-3.5" />
                            다음 도착일
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="z-[330] w-auto p-0"
                          onOpenAutoFocus={(e) => e.preventDefault()}
                        >
                          <div className="border-b px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                            선택일=다음 도착일, 오늘=재주문일로 반영됩니다.
                          </div>
                          <Calendar
                            mode="single"
                            required
                            numberOfMonths={1}
                            selected={arrivalDraft}
                            onSelect={(date) => {
                              if (date) setArrivalDraft(date);
                            }}
                            defaultMonth={arrivalDraft}
                            disabled={(date) => {
                              const ymd = toKstYmd(date) || "";
                              return (
                                !ymd || Boolean(todayYmd && ymd < todayYmd)
                              );
                            }}
                            initialFocus
                          />
                          <div className="flex items-center justify-end gap-2 border-t px-3 py-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setArrivalPickerOpen(false)}
                            >
                              취소
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              disabled={!arrivalDraft}
                              onClick={confirmArrivalDraft}
                            >
                              적용
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </dd>
                </div>
              </dl>
            </section>

            <div className="space-y-2 overflow-visible pb-1">
              {availableRows.length > 0 ? (
                <>
                  <PracticeToothWorkChartReadOnly
                    toothWorks={availableRows as ToothWorkSelection[]}
                    feeToothWorks={selectedRows as ToothWorkSelection[]}
                    labAnchorId={labAnchorId}
                    feeViewer="practice"
                    skipAbutmentFees
                    embedded
                    selectable={!isEdit}
                    selectedSpanKeys={selectedSpanKeys}
                    onToggleSpanKey={toggleSpanKey}
                    spanKeyOf={followUpRowSpanKey}
                    selectionDisabled={busy}
                    prosthesisTypeOptions={
                      isTypeChange ? TYPE_CHANGE_OPTIONS : null
                    }
                    onChangeProsthesisType={
                      isTypeChange ? setRowProsthesisType : undefined
                    }
                    onPatchToothWork={patchToothWorkRow}
                    onOpenCustomAbutmentSpecs={(spanKey, selection) => {
                      if (busy) return;
                      openCustomSpecsModal(spanKey, selection);
                    }}
                    sourceProsthesisTypeBySpanKey={
                      isTypeChange ? sourceTypeBySpan : null
                    }
                    sourceToothWorkBySpanKey={
                      isTypeChange ? sourceRowBySpan : null
                    }
                  />
                  {isTypeChange &&
                  !orderChangeValid &&
                  selectedRows.length > 0 ? (
                    <p className="text-[12px] text-amber-700">
                      보철물 카드에서 변경할 항목을 수정해 주세요.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {isEdit
                    ? "변경할 후속 보철이 없습니다. 기공소 작업시작 전 건만 변경할 수 있습니다."
                    : isTypeChange
                      ? "변경할 보철이 없습니다."
                      : "제작할 임시치아가 없습니다."}
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t px-5 py-3 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => handleOpenChange(false)}
          >
            취소
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() =>
              void onConfirm({
                arrivalYmd: String(arrivalDate || "").trim(),
                toothWorks: selectedRows,
              })
            }
          >
            {busy
              ? "처리 중…"
              : isEdit
                ? "변경 적용"
                : isTypeChange
                  ? "주문 변경 의뢰"
                  : "지르 제작 의뢰"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      <PracticeCustomAbutmentSpecsDialog
        open={customSpecsSpanKey != null}
        onOpenChange={(next) => {
          if (next) return;
          if (customSpecsDismissKindRef.current === "confirm") {
            customSpecsDismissKindRef.current = null;
            return;
          }
          cancelCustomSpecsModal();
          customSpecsDismissKindRef.current = null;
        }}
        toothWork={
          customSpecsSpanKey
            ? rowBySpanKey.get(customSpecsSpanKey) ||
              availableRows.find(
                (row) => followUpRowSpanKey(row) === customSpecsSpanKey,
              ) ||
              null
            : null
        }
        selectionLock={customSpecsSelectionLock}
        onPatchSpecs={patchCustomSpecsOnSpan}
        onConfirm={confirmCustomSpecsModal}
        onCancel={() => {
          cancelCustomSpecsModal();
          if (customSpecsDismissKindRef.current === "cancel") {
            customSpecsDismissKindRef.current = null;
          }
        }}
        onAbutmentProductModeChange={(alternateMode) => {
          if (!customSpecsSpanKey) return;
          setRowBySpanKey((prev) => {
            const copy = new Map(prev);
            const row = copy.get(customSpecsSpanKey);
            if (!row) return prev;
            copy.set(customSpecsSpanKey, {
              ...row,
              customAbutment: true,
              abutmentProductMode: alternateMode,
            });
            return copy;
          });
          if (isAbutmentProductMode(alternateMode)) {
            void onDefaultAbutmentProductModeChange?.(alternateMode);
          }
        }}
        lockedAbutmentProductMode={
          isTypeChange ? null : ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION
        }
        onAlternateAbutmentModeNavigate={() => {
          /* 지르 후속만 디자인+생산 고정 — 잠금 시 취소만 */
        }}
        implantConnections={implantConnections}
        implantFavorites={implantFavorites}
        onImplantFavoritesChange={onImplantFavoritesChange}
        abutmentFavorites={abutmentFavorites}
        onAbutmentFavoritesChange={onAbutmentFavoritesChange}
        directAbutmentFavorites={directAbutmentFavorites}
        onDirectAbutmentFavoritesChange={onDirectAbutmentFavoritesChange}
        simpleAbutmentOptions={simpleAbutmentOptions}
        onSimpleAbutmentOptionsChange={onSimpleAbutmentOptionsChange}
        simpleHealingOptions={simpleHealingOptions}
        onSimpleHealingOptionsChange={onSimpleHealingOptionsChange}
        onPresetEditorOpen={onPresetEditorOpen}
        className="z-[340]"
        overlayClassName="z-[339]"
      />
    </>
  );
}
