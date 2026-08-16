/**
 * 기공소 지정 거부·작업취소 후 — 치과가 다른 기공소를 고르는 안내 모달.
 * related files:
 * - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
 * - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
 * - 2026-08-16: 의뢰 상세 대신 전용 모달 + 기공소 선택 필드.
 * - 2026-08-16: labOpen은 모달 로컬 상태. Popover 클릭으로 Dialog가 닫히지 않게.
 * - 2026-08-16: 「기공소 변경 전송」클릭 시 즉시 retarget API 호출.
 */
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
}: PracticeLabRejectedReselectDialogProps) {
  const [labOpen, setLabOpen] = useState(false);
  const labLabel = String(rejectedLabName || "")
    .trim()
    .replace(/\s*→.*$/g, "");
  const transferLabel = String(transferId || "").trim();
  const canConfirm = Boolean(String(labIntakeProps.selectedLab?._id || "").trim());

  useEffect(() => {
    if (!open) setLabOpen(false);
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (confirming) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-w-lg gap-0 overflow-visible p-0 sm:rounded-xl"
        onOpenAutoFocus={(e) => {
          // 첫 포커스가 별/도움말로 가면 툴팁이 모달과 함께 뜬다 → 제목으로 둔다
          e.preventDefault();
          const title = (e.currentTarget as HTMLElement).querySelector(
            "[data-reselect-dialog-title]",
          );
          if (title instanceof HTMLElement) title.focus();
        }}
        onPointerDownOutside={(e) => {
          if (confirming || isPortaledOverlayTarget(e.target)) e.preventDefault();
        }}
        onFocusOutside={(e) => {
          if (confirming || isPortaledOverlayTarget(e.target)) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (confirming || isPortaledOverlayTarget(e.target)) e.preventDefault();
        }}
      >
        <DialogHeader className="space-y-2 border-b border-accent-muted bg-accent-soft px-5 py-4 text-left">
          <DialogTitle
            data-reselect-dialog-title
            tabIndex={-1}
            className="text-base font-semibold text-accent-strong outline-none"
          >
            {labLabel
              ? `기공소「${labLabel}」이(가) 의뢰를 거부했습니다`
              : "기공소가 의뢰를 거부했습니다"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {transferLabel ? (
              <span className="mb-1 block font-medium text-slate-700">
                전송ID {transferLabel}
              </span>
            ) : null}
            다른 기공소를 선택한 뒤「기공소 변경 전송」을 누르면 바로 다시 전송됩니다. 더
            이상 진행하지 않으려면 최근 전송에서 휴지통으로 이동할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-5 py-4">
          <PracticeTransferRequestIntakePanel
            variant="plain"
            showHeaderFields
            showLabField
            showPatientField={false}
            showDateFields={false}
            showAutoMatchMinLabRating={false}
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

        <DialogFooter className="gap-2 border-t px-5 py-3 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={confirming}
            onClick={() => onOpenChange(false)}
          >
            닫기
          </Button>
          <Button
            type="button"
            disabled={!canConfirm || confirming}
            className="bg-accent text-accent-foreground hover:bg-accent-strong"
            onClick={() => void onConfirm()}
          >
            {confirming ? "전송 중..." : "기공소 변경 전송"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
