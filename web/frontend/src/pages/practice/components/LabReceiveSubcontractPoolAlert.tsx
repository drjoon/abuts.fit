/**
 * 하청 기공소 수신함 — 원청이 넘긴 미배정 하청 알림.
 * 협력·하청 뱃지 왼쪽. 클릭하면 의뢰 내역을 보고 확인한 뒤 선착순으로 진행한다.
 * 여러 건은 좌우 버튼으로 넘긴다. 보철은 치식 카드.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { PracticeToothWorkChartReadOnly } from "@/shared/components/practice/PracticeToothWorkChartReadOnly";
import { cn } from "@/shared/ui/cn";
import type { PracticeTransferLabReceiveItem } from "@/shared/practice/practiceTransferLabReceive";
import { resolvePracticeTransferToothWorks } from "@/shared/practice/practiceTransferLabReceive";
import {
  formatPracticeTransferListPatientWithTeeth,
  resolvePracticeTransferListPatientName,
  resolvePracticeTransferListToothNumbers,
} from "@/shared/components/practice/PracticeRecentTransferListCardDetail";

type LabReceiveSubcontractPoolAlertProps = {
  transfers: readonly PracticeTransferLabReceiveItem[];
  onConfirm: (transfer: PracticeTransferLabReceiveItem) => Promise<boolean>;
};

const transferKey = (transfer: PracticeTransferLabReceiveItem) =>
  String(transfer.transferId || transfer._id || "").trim();

const latestYmd = (dates: string[] | undefined, fallback: string) => {
  const list = Array.isArray(dates) ? dates : [];
  const last = String(list[list.length - 1] || "").trim();
  return last || String(fallback || "").trim();
};

function PoolCaseSlide({
  transfer,
}: {
  transfer: PracticeTransferLabReceiveItem;
}) {
  const clinic = String(transfer.practice?.businessName || "").trim() || "-";
  const patient = resolvePracticeTransferListPatientName(transfer) || "-";
  const teeth = resolvePracticeTransferListToothNumbers(transfer);
  const arrival = latestYmd(transfer.arrivalDates, transfer.arrivalDate);
  const toothWorks = resolvePracticeTransferToothWorks(transfer);
  const fileCount = Number(transfer.fileCount || 0);
  const patientLine =
    toothWorks.length > 0
      ? patient
      : formatPracticeTransferListPatientWithTeeth(patient, teeth) || patient;
  const facts = [
    clinic !== "-" ? clinic : "",
    patientLine && patientLine !== "-" ? patientLine : "",
    arrival ? `도착 ${arrival}` : "",
    fileCount > 0 ? `파일 ${fileCount}개` : "",
  ].filter(Boolean);

  return (
    <div className="space-y-3">
      {facts.length > 0 ? (
        <p className="text-sm font-medium text-slate-900">{facts.join(" · ")}</p>
      ) : null}
      {toothWorks.length > 0 ? (
        <div className="w-0 min-w-full">
          <PracticeToothWorkChartReadOnly
            toothWorks={toothWorks}
            feeQuote={transfer.feeQuote || null}
            feeViewer="lab"
            skipJig={Boolean(transfer.production?.skipJig)}
            showHeader
            embedded
            enlargeOverlayClassName="z-[350]"
            enlargeDialogClassName="z-[360]"
          />
        </div>
      ) : (
        <p className="text-sm text-slate-500">보철 정보가 없습니다.</p>
      )}
    </div>
  );
}

export function LabReceiveSubcontractPoolAlert({
  transfers,
  onConfirm,
}: LabReceiveSubcontractPoolAlertProps) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [slideFrom, setSlideFrom] = useState<"left" | "right" | null>(null);
  const busyRef = useRef(false);

  const rows = useMemo(
    () => transfers.filter((row) => transferKey(row)),
    [transfers],
  );

  const index = Math.max(
    0,
    rows.findIndex((row) => transferKey(row) === selectedId),
  );

  useEffect(() => {
    if (!open) return;
    if (!rows.length) {
      setOpen(false);
      return;
    }
    if (!rows.some((row) => transferKey(row) === selectedId)) {
      setSelectedId(transferKey(rows[0]));
    }
  }, [open, rows, selectedId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (busyRef.current || rows.length < 2) return;
      const target = event.target as HTMLElement | null;
      const tag = String(target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        const prev = rows[index - 1];
        if (!prev) return;
        setSlideFrom("left");
        setSelectedId(transferKey(prev));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        const next = rows[index + 1];
        if (!next) return;
        setSlideFrom("right");
        setSelectedId(transferKey(next));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, rows, index]);

  if (!rows.length) return null;

  const selected = rows[index] || rows[0];
  const countLabel = rows.length > 99 ? "99+" : String(rows.length);
  const canPrev = index > 0;
  const canNext = index < rows.length - 1;

  const go = (delta: number) => {
    if (busy) return;
    const next = rows[index + delta];
    if (!next) return;
    setSlideFrom(delta < 0 ? "left" : "right");
    setSelectedId(transferKey(next));
  };

  return (
    <>
      <button
        type="button"
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-amber-400 bg-amber-50 px-2.5 text-xs font-semibold text-amber-950"
        aria-label={`신규 하청 ${rows.length}건. 의뢰 내역을 보고 진행합니다.`}
        onClick={() => {
          setSlideFrom(null);
          setSelectedId(transferKey(rows[0]));
          setOpen(true);
        }}
      >
        <AlertCircle className="h-3.5 w-3.5" aria-hidden />
        신규 하청 {countLabel}
      </button>
      <ConfirmDialog
        open={open}
        title="신규 하청"
        confirmLabel={busy ? "처리 중..." : "하청 진행"}
        cancelLabel="닫기"
        confirmTone="primary"
        busy={busy}
        dense
        showCloseButton
        showCancel={false}
        footerLeading={
          rows.length > 1 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="이전 하청"
                disabled={!canPrev || busy}
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-full",
                  canPrev && !busy
                    ? "bg-primary-strong text-white hover:bg-primary"
                    : "cursor-not-allowed bg-primary-soft text-primary/40",
                )}
                onClick={() => go(-1)}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <p className="min-w-10 text-center text-xs font-medium tabular-nums text-slate-500">
                {index + 1} / {rows.length}
              </p>
              <button
                type="button"
                aria-label="다음 하청"
                disabled={!canNext || busy}
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-full",
                  canNext && !busy
                    ? "bg-primary-strong text-white hover:bg-primary"
                    : "cursor-not-allowed bg-primary-soft text-primary/40",
                )}
                onClick={() => go(1)}
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : null
        }
        closeOnBackdrop
        panelClassName="w-max min-w-[min(28rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]"
        onCancel={() => {
          if (!busy) setOpen(false);
        }}
        onConfirm={() => {
          if (!selected || busyRef.current) return;
          busyRef.current = true;
          setBusy(true);
          void onConfirm(selected)
            .then((ok) => {
              if (ok) setOpen(false);
            })
            .finally(() => {
              busyRef.current = false;
              setBusy(false);
            });
        }}
        description={
          <div className="space-y-3 text-left text-sm">
            <p>선착순이라 다른 기공소가 먼저 시작하면 사라집니다.</p>
            <div className="overflow-hidden">
              <div
                key={transferKey(selected)}
                className={cn(
                  slideFrom === "right" &&
                    "animate-in slide-in-from-right-8 fade-in-0 duration-200",
                  slideFrom === "left" &&
                    "animate-in slide-in-from-left-8 fade-in-0 duration-200",
                )}
              >
                <PoolCaseSlide transfer={selected} />
              </div>
            </div>
          </div>
        }
      />
    </>
  );
}
