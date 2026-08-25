/**
 * 기공소 지정 거부·작업취소 후 — 치과가 다른 기공소를 고르는 안내 모달.
 * related files:
 * - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
 * - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
 * - 2026-08-16: 의뢰 상세 대신 전용 모달 + 기공소 선택 필드.
 * - 2026-08-16: labOpen은 모달 로컬 상태. Popover 클릭으로 Dialog가 닫히지 않게.
 * - 2026-08-16: 「기공소 변경 전송」클릭 시 즉시 retarget API 호출.
 * - 2026-08-19: 모달에서 바로 휴지통(의뢰 취소) 이동.
 * - 2026-08-25: 제목 한 줄용 max-w 36rem. 기공소 Popover는 intake에서 modal+스크롤 허용.
 */
import { ArrowRightLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PracticeTransferRequestIntakePanel,
  type PracticeTransferRequestIntakePanelProps,
} from "@/shared/components/practice/PracticeTransferRequestIntakePanel";

export type PracticeLabRejectedReselectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rejectedLabName?: string | null;
  transferId?: string | null;
  confirming?: boolean;
  /** 기공소 선택에 필요한 intake props (labOpen은 모달이 자체 관리) */
  labIntakeProps: Pick<
    PracticeTransferRequestIntakePanelProps,
    | "selectedLab"
    | "setSelectedLab"
    | "labSearch"
    | "setLabSearch"
    | "labSearchResults"
    | "labSearching"
    | "recentLabs"
    | "recentLabsInitialized"
    | "pinnedLabs"
    | "onRemoveRecentLab"
    | "onTogglePinLab"
    | "autoMatchMinLabRating"
    | "onAutoMatchMinLabRatingChange"
    | "autoMatchMaxLabRating"
    | "onAutoMatchMaxLabRatingChange"
    | "autoMatchBudget"
    | "abutsLabFeeCatalog"
    | "onAutoMatchBudgetChange"
  >;
  onConfirm: () => void | Promise<void>;
  /** 더 이상 진행하지 않을 때 휴지통(취소) */
  onMoveToTrash?: () => void;
  trashing?: boolean;
};

const isPortaledOverlayTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "[data-radix-popper-content-wrapper], [data-radix-select-content], [role='listbox']",
    ),
  );
};

export function PracticeLabRejectedReselectDialog({
  open,
  onOpenChange,
  rejectedLabName,
  transferId,
  confirming = false,
  labIntakeProps,
  onConfirm,
  onMoveToTrash,
  trashing = false,
}: PracticeLabRejectedReselectDialogProps) {
  const [labOpen, setLabOpen] = useState(false);
  const labLabel = String(rejectedLabName || "")
    .trim()
    .replace(/\s*→.*$/g, "");
  const transferLabel = String(transferId || "").trim();
  const canConfirm = Boolean(String(labIntakeProps.selectedLab?._id || "").trim());
  const busy = confirming || trashing;

  useEffect(() => {
    if (!open) setLabOpen(false);
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] gap-0 overflow-visible p-0 sm:w-max sm:max-w-[min(100vw-2rem,36rem)] sm:rounded-2xl"
        onOpenAutoFocus={(e) => {
          // 첫 포커스가 별/도움말로 가면 툴팁이 모달과 함께 뜬다 → 제목으로 둔다
          e.preventDefault();
          const title = (e.currentTarget as HTMLElement).querySelector(
            "[data-reselect-dialog-title]",
          );
          if (title instanceof HTMLElement) title.focus();
        }}
        onPointerDownOutside={(e) => {
          if (busy || isPortaledOverlayTarget(e.target)) e.preventDefault();
        }}
        onFocusOutside={(e) => {
          if (busy || isPortaledOverlayTarget(e.target)) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (busy || isPortaledOverlayTarget(e.target)) e.preventDefault();
        }}
      >
        <DialogHeader className="space-y-3 px-5 pb-1 pt-5 text-left sm:px-6 sm:pt-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 ring-1 ring-slate-200/80">
              <ArrowRightLeft className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 space-y-1.5">
              <DialogTitle
                data-reselect-dialog-title
                tabIndex={-1}
                className="text-base font-semibold tracking-tight text-slate-900 outline-none"
              >
                {labLabel
                  ? `「${labLabel}」에서 의뢰를 수락하지 않았어요`
                  : "기공소에서 의뢰를 수락하지 않았어요"}
              </DialogTitle>
              {transferLabel ? (
                <p className="font-mono text-xs text-slate-500">{transferLabel}</p>
              ) : null}
              <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
                다른 기공소를 선택해 다시 전송하거나, 진행을 중단하려면 의뢰를 취소하세요.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 px-5 py-4 sm:px-6">
          <PracticeTransferRequestIntakePanel
            variant="plain"
            showHeaderFields
            showLabField
            showPatientField={false}
            showDateFields={false}
            showAutoMatchMinLabRating
            showProsthesisSection={false}
            showMemoSection={false}
            showFeeEstimate={false}
            hideEnlargeButton
            selectedLab={labIntakeProps.selectedLab}
            setSelectedLab={labIntakeProps.setSelectedLab}
            labOpen={labOpen}
            setLabOpen={setLabOpen}
            labSearch={labIntakeProps.labSearch}
            setLabSearch={labIntakeProps.setLabSearch}
            labSearchResults={labIntakeProps.labSearchResults}
            labSearching={labIntakeProps.labSearching}
            recentLabs={labIntakeProps.recentLabs}
            recentLabsInitialized={labIntakeProps.recentLabsInitialized}
            pinnedLabs={labIntakeProps.pinnedLabs}
            onRemoveRecentLab={labIntakeProps.onRemoveRecentLab}
            onTogglePinLab={labIntakeProps.onTogglePinLab}
            autoMatchMinLabRating={labIntakeProps.autoMatchMinLabRating}
            onAutoMatchMinLabRatingChange={
              labIntakeProps.onAutoMatchMinLabRatingChange
            }
            autoMatchMaxLabRating={labIntakeProps.autoMatchMaxLabRating}
            onAutoMatchMaxLabRatingChange={
              labIntakeProps.onAutoMatchMaxLabRatingChange
            }
            autoMatchBudget={labIntakeProps.autoMatchBudget}
            abutsLabFeeCatalog={labIntakeProps.abutsLabFeeCatalog}
            onAutoMatchBudgetChange={labIntakeProps.onAutoMatchBudgetChange}
            patientName=""
            setPatientName={() => {}}
            orderDate=""
            setOrderDate={() => {}}
            arrivalDate=""
            setArrivalDate={() => {}}
            arrivalDefaultDays={7}
            normalizedProsthesisTypes={[]}
            setProsthesisTypeCatalogDraft={() => {}}
            setProsthesisTypeSettingsDialogOpen={() => {}}
            toothWorks={[]}
            setToothWorks={() => {}}
            requestMemo=""
            setRequestMemo={() => {}}
            memoInputId="practice-lab-rejected-reselect-memo"
          />
        </div>

        <DialogFooter className="gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3 sm:justify-end sm:space-x-0 sm:px-6">
          <Button
            type="button"
            variant="outline"
            className="h-9"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            닫기
          </Button>
          {onMoveToTrash ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              className="h-9 border-destructive-muted text-destructive hover:bg-destructive-soft hover:text-destructive"
              onClick={() => onMoveToTrash()}
            >
              {trashing ? "처리 중..." : "의뢰 취소"}
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={!canConfirm || busy}
            className="h-9 bg-primary-strong text-white hover:bg-primary-strong/90"
            onClick={() => void onConfirm()}
          >
            {confirming ? "전송 중..." : "다시 전송"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
