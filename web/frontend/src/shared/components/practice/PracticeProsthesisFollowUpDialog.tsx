/**
 * 임시치아 → 지르 후속, 또는 보철 종류 변경 리메이크(인레이→크라운 등).
 * related files:
 * - web/frontend/src/shared/practice/prosthesisFollowUp.ts
 * - web/frontend/src/shared/components/practice/PracticeToothWorkChartReadOnly.tsx
 * - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
 * change-log:
 * - 2026-09-21: 보철 종류 변경 리메이크(인레이→크라운) — 단계 최고가만 청구 안내·형태 선택.
 * - 2026-09-01: 임시치아 → 최종 보철 후속 제작 확인 다이얼로그.
 * - 2026-09-01: 크라운·브리지 단위 선택(부분 제작) — 보철물 카드에서 체크.
 * - 2026-09-01: 재도착일 적용 시 계정·기공소 기본 소요일 서버 저장.
 * - 2026-09-15: 제작 의뢰 시 도착일 팝오버를 먼저 열어 확정하게 함.
 * - 2026-09-15: 제작 변경 — pending 후속 지르 표시(단계 포커스 필터 없음).
 * - 2026-09-15: 지르 제작·변경 모달 — 이번 단계 견적만(최종 기공비 숨김).
 */
import { useEffect, useMemo, useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PracticeToothWorkChartReadOnly } from "@/shared/components/practice/PracticeToothWorkChartReadOnly";
import {
  buildFollowUpToothWorksDraft,
  followUpRowSpanKey,
  formatFollowUpRowLabel,
  isFinalProsthesisType,
  listEditablePendingFollowUpToothWorks,
  listPendingFollowUpSourceSpans,
  resolveFollowUpKind,
  type ProsthesisFollowUpRecord,
} from "@/shared/practice/prosthesisFollowUp";
import { toKstYmd, ymdToKstDate } from "@/shared/date/kst";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { useResizableDialogWidth } from "@/shared/hooks/useResizableDialogWidth";
import type { ToothWorkSelection } from "@/shared/practice/transferMemo";

type FollowUpRow = ToothWorkSelection & { prosthesisPhase: string };

const TYPE_CHANGE_OPTIONS = ["인레이", "크라운", "브리지"] as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "create" | "edit";
  toothWorks?: Partial<ToothWorkSelection>[] | null;
  prosthesisFollowUps?: ReadonlyArray<ProsthesisFollowUpRecord> | null;
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
};

export function PracticeProsthesisFollowUpDialog({
  open,
  onOpenChange,
  mode = "create",
  toothWorks,
  prosthesisFollowUps = null,
  requestorDownloadedAt = null,
  orderDate,
  defaultArrivalYmd,
  arrivalDefaultDays: _arrivalDefaultDays,
  labAnchorId = null,
  busy = false,
  onArrivalReschedule,
  onConfirm,
}: Props) {
  const isMobile = useIsMobile();
  const { width: dialogWidth, beginHorizontalResize } = useResizableDialogWidth(
    open,
    { storageKey: "abuts.prosthesisFollowUpDialog.width.v1" },
  );
  const isEdit = mode === "edit";
  const followUpKind = useMemo(
    () =>
      isEdit
        ? "temp"
        : resolveFollowUpKind(
            Array.isArray(toothWorks) ? toothWorks : [],
          ) || "temp",
    [isEdit, toothWorks],
  );
  const isTypeChange = followUpKind === "typeChange";

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

  const sourceTypeBySpan = useMemo(() => {
    const map = new Map<string, string>();
    for (const span of listPendingFollowUpSourceSpans(
      Array.isArray(toothWorks) ? toothWorks : [],
    )) {
      map.set(
        span.teeth.join("-"),
        String(span.sourceRow?.prosthesisType || "").trim(),
      );
    }
    return map;
  }, [toothWorks]);

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

  const typeChangeValid = useMemo(() => {
    if (!isTypeChange || isEdit) return true;
    return selectedRows.every((row) => {
      const key = followUpRowSpanKey(row);
      const sourceType = sourceTypeBySpan.get(key) || "";
      const nextType = String(row.prosthesisType || "").trim();
      return isFinalProsthesisType(nextType) && nextType !== sourceType;
    });
  }, [isEdit, isTypeChange, selectedRows, sourceTypeBySpan]);

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
      copy.set(spanKey, { ...current, prosthesisType });
      return copy;
    });
  };

  const canSubmit =
    !busy &&
    selectedRows.length > 0 &&
    typeChangeValid &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(arrivalDate || "").trim());

  return (
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
                ? "보철 종류 변경 리메이크"
                : "지르 보철 제작"}
          </DialogTitle>
          {!isEdit ? (
            <p className="pt-1 text-sm font-normal leading-relaxed text-muted-foreground">
              {isTypeChange ? (
                <>
                  인레이·크라운·브리지 등 보철 종류를 바꿉니다. 기공비는
                  임시치아→지르와 같이 모든 단계 중 가장 비싼 금액만
                  청구합니다(예: 인레이 5만 + 크라운 6만 → 6만 한 번).
                </>
              ) : (
                <>
                  임시치아를 지르 최종 보철로 바꿉니다. 이번 단계 기공비는
                  브리지·크라운 수가입니다. 모든 임시치아를 지르로 바꾼 뒤에만
                  최종 기공비(처음부터 지르·커스텀어벗으로 제작한 합계)가
                  표시됩니다. 지금은 임시치아로 계속하려면 이 창을 닫고
                  「다음 도착일」만 지정하면 됩니다.
                </>
              )}
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

            {isTypeChange && !isEdit && availableRows.length > 0 ? (
              <section className="space-y-2">
                <p className="text-[13px] font-medium text-slate-700">
                  변경할 보철 종류
                </p>
                <ul className="space-y-2">
                  {availableRows.map((row) => {
                    const key = followUpRowSpanKey(row);
                    const sourceType = sourceTypeBySpan.get(key) || "";
                    const selected = selectedSpanKeys.has(key);
                    return (
                      <li
                        key={key}
                        className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 px-3 py-2"
                      >
                        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={selected}
                            disabled={busy}
                            onChange={(e) =>
                              toggleSpanKey(key, e.target.checked)
                            }
                          />
                          <span className="truncate">
                            {formatFollowUpRowLabel({
                              ...row,
                              prosthesisType: sourceType || row.prosthesisType,
                            })}
                            {sourceType ? (
                              <span className="text-muted-foreground">
                                {" "}
                                →
                              </span>
                            ) : null}
                          </span>
                        </label>
                        <Select
                          value={String(row.prosthesisType || "").trim() || undefined}
                          disabled={busy || !selected}
                          onValueChange={(value) =>
                            setRowProsthesisType(key, value)
                          }
                        >
                          <SelectTrigger className="h-8 w-[7.5rem] text-xs">
                            <SelectValue placeholder="종류" />
                          </SelectTrigger>
                          <SelectContent className="z-[330]">
                            {TYPE_CHANGE_OPTIONS.map((opt) => (
                              <SelectItem
                                key={opt}
                                value={opt}
                                disabled={opt === sourceType}
                              >
                                {opt}
                                {opt === sourceType ? " (현재)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </li>
                    );
                  })}
                </ul>
                {!typeChangeValid && selectedRows.length > 0 ? (
                  <p className="text-[12px] text-amber-700">
                    현재와 다른 보철 종류를 선택해 주세요.
                  </p>
                ) : null}
              </section>
            ) : null}

            <div className="space-y-2 overflow-visible pb-1">
              {availableRows.length > 0 ? (
                <PracticeToothWorkChartReadOnly
                  toothWorks={availableRows as ToothWorkSelection[]}
                  feeToothWorks={selectedRows as ToothWorkSelection[]}
                  labAnchorId={labAnchorId}
                  feeViewer="practice"
                  skipAbutmentFees
                  embedded
                  selectable={!isEdit && !isTypeChange}
                  selectedSpanKeys={selectedSpanKeys}
                  onToggleSpanKey={toggleSpanKey}
                />
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
                  ? "종류 변경 의뢰"
                  : "지르 제작 의뢰"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
