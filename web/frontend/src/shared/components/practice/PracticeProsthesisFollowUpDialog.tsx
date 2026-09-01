// related files:
// - web/frontend/src/shared/practice/prosthesisFollowUp.ts
// - web/frontend/src/shared/components/practice/PracticeToothWorkChartReadOnly.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - 2026-09-01: 임시치아 → 최종 보철 후속 제작 확인 다이얼로그.
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
import { PracticeToothWorkChartReadOnly } from "@/shared/components/practice/PracticeToothWorkChartReadOnly";
import { buildFollowUpToothWorksDraft } from "@/shared/practice/prosthesisFollowUp";
import { toKstYmd, ymdToKstDate } from "@/shared/date/kst";
import type { ToothWorkSelection } from "@/shared/practice/transferMemo";

type FollowUpRow = ToothWorkSelection & { prosthesisPhase: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "create" | "edit";
  toothWorks?: Partial<ToothWorkSelection>[] | null;
  orderDate: string;
  defaultArrivalYmd: string;
  arrivalDefaultDays: number;
  labAnchorId?: string | null;
  busy?: boolean;
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
  orderDate,
  defaultArrivalYmd,
  arrivalDefaultDays,
  labAnchorId = null,
  busy = false,
  onConfirm,
}: Props) {
  const isEdit = mode === "edit";
  const draftRows = useMemo(
    () =>
      isEdit
        ? (Array.isArray(toothWorks) ? toothWorks : []).filter((row) =>
            String((row as { prosthesisPhase?: string }).prosthesisPhase || "").trim() ===
            "followUp",
          )
        : buildFollowUpToothWorksDraft(Array.isArray(toothWorks) ? toothWorks : []),
    [isEdit, toothWorks],
  );
  const [arrivalDate, setArrivalDate] = useState(String(defaultArrivalYmd || "").trim());
  const [arrivalPickerOpen, setArrivalPickerOpen] = useState(false);
  const [arrivalDraft, setArrivalDraft] = useState<Date | undefined>(undefined);

  const todayYmd = useMemo(() => toKstYmd(new Date()) || "", []);
  const orderYmd = String(orderDate || "").trim() || todayYmd;

  useEffect(() => {
    if (!open) return;
    setArrivalDate(String(defaultArrivalYmd || "").trim());
    setArrivalPickerOpen(false);
  }, [open, defaultArrivalYmd]);

  useEffect(() => {
    if (!arrivalPickerOpen) return;
    const seedYmd = String(arrivalDate || "").trim() || defaultArrivalYmd || todayYmd;
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
  };

  const canSubmit =
    !busy &&
    draftRows.length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(arrivalDate || "").trim());

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        overlayClassName="z-[310]"
        className="z-[320] flex max-h-[min(92vh,860px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl sm:rounded-xl sm:p-0"
      >
        <DialogHeader className="border-b px-5 py-4 text-left">
          <DialogTitle>
            {isEdit ? "최종 보철 제작 변경" : "최종 보철 제작"}
          </DialogTitle>
        </DialogHeader>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <div className="space-y-5">
            <section className="space-y-1">
              <dl className="divide-y divide-border/70">
                <div className="grid grid-cols-[6.75rem_minmax(0,1fr)] items-start gap-x-3 py-2 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
                  <dt className="pt-0.5 text-[13px] leading-snug text-muted-foreground">
                    주문일
                  </dt>
                  <dd className="text-sm font-medium leading-snug text-foreground">
                    {orderYmd || "-"}
                  </dd>
                </div>
                <div className="grid grid-cols-[6.75rem_minmax(0,1fr)] items-start gap-x-3 py-2 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
                  <dt className="pt-0.5 text-[13px] leading-snug text-muted-foreground">
                    치과도착일
                  </dt>
                  <dd className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-medium leading-snug text-foreground">
                        {arrivalDate || "-"}
                      </p>
                      <Popover open={arrivalPickerOpen} onOpenChange={setArrivalPickerOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 shrink-0 gap-1 px-2 text-xs"
                            disabled={busy}
                          >
                            <CalendarClock className="h-3.5 w-3.5" />
                            재도착일
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="z-[330] w-auto p-0"
                          onOpenAutoFocus={(e) => e.preventDefault()}
                        >
                          <div className="border-b px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                            선택일=재도착일, 오늘=재주문일로 반영됩니다.
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
                              return !ymd || Boolean(todayYmd && ymd < todayYmd);
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
              {draftRows.length > 0 ? (
                <>
                  <PracticeToothWorkChartReadOnly
                    toothWorks={draftRows}
                    labAnchorId={labAnchorId}
                    feeViewer="practice"
                    skipAbutmentFees
                    embedded
                  />
                </>
              ) : (
                <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  제작할 보철 치식이 없습니다.
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 border-t bg-background px-5 py-4 sm:justify-end">
          <Button
            type="button"
            variant="outline"
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
                toothWorks: draftRows,
              })
            }
          >
            {busy ? (isEdit ? "변경 저장 중…" : "제작 의뢰 중…") : isEdit ? "변경 저장" : "제작 의뢰"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
