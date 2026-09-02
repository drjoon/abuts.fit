// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferLabReceiveCard.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/practice/practiceTransferLabReceive.ts
// change-log:
// - 2026-09-02: 어벗(STL) 업로드 CTA 제거 — 진행상황 드롭존 클릭/드래그가 SSOT.
// - 2026-09-02: 파일 없는「작업 완료」CTA 제거(도착일 경과 자동 완료).
// - 2026-09-02: 보철/dual 제거. CA 어벗 업로드 + 파일 없는 작업 완료 CTA.
import type { MouseEvent, ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LabPendingAbutmentGuide } from "@/shared/components/practice/LabPendingAbutmentGuide";
import {
  listPracticeTransferCustomAbutmentToothWorks,
  resolvePracticeLabReceiveWorkActionState,
  type PracticeTransferLabReceiveItem,
} from "@/shared/practice/practiceTransferLabReceive";
import { cn } from "@/shared/ui/cn";

export type PracticeLabReceiveWorkActionsBarProps = {
  transfer: PracticeTransferLabReceiveItem;
  busy?: boolean;
  designConfirmBusy?: boolean;
  /** 수락 중「어벗 생산 취소」노출(상세는 true, 카드는 헤더와 역할 분담 시 true) */
  showProductionCancelInBar?: boolean;
  onAbutmentProductionCancel?: (event: MouseEvent) => void;
  onDesignConfirm?: () => void;
  trailingActions?: ReactNode;
  className?: string;
};

const ctaButtonClass =
  "h-8 shrink-0 px-2.5 text-xs focus-visible:ring-0 focus-visible:ring-offset-0";

/** 어벗 — 채팅 드롭존 안내 SSOT */
export const LAB_RECEIVE_ABUTMENT_UPLOAD_HINT =
  "커스텀 어벗 생산을 어벗츠에 자동 주문합니다.";

/**
 * 기공의뢰수신 — 수락 후 작업 취소·디자인 확인(카드·상세 모달 공통).
 * 어벗 STL 업로드는 상세 진행상황 드롭존(클릭/드래그)만 사용.
 */
export function PracticeLabReceiveWorkActionsBar({
  transfer,
  busy = false,
  designConfirmBusy = false,
  showProductionCancelInBar = true,
  onAbutmentProductionCancel,
  onDesignConfirm,
  trailingActions = null,
  className,
}: PracticeLabReceiveWorkActionsBarProps) {
  const state = resolvePracticeLabReceiveWorkActionState(transfer);
  const hasTrailing = Boolean(trailingActions);
  if (
    !state.showWorkActions &&
    !state.showCompletedStageHeaderCancel &&
    !hasTrailing
  ) {
    return null;
  }

  const pendingLabGuide = state.hasPendingLabCa ? (
    <LabPendingAbutmentGuide
      toothWorks={listPracticeTransferCustomAbutmentToothWorks(transfer)}
      mixedWithAbuts={state.hasAbutsCa}
    />
  ) : null;

  const productionCancelButton =
    showProductionCancelInBar &&
    state.showAbutmentProductionCancel &&
    state.showWorkActions ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy || !onAbutmentProductionCancel}
            className="h-8 shrink-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            onClick={(event) => void onAbutmentProductionCancel?.(event)}
          >
            <X className="h-3.5 w-3.5" />
            {busy ? "처리 중..." : "어벗 취소"}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          제조사가 준비 단계일 때만 생산을 취소할 수 있습니다.
        </TooltipContent>
      </Tooltip>
    ) : null;

  const cancelCluster =
    productionCancelButton || hasTrailing ? (
      <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        {productionCancelButton}
        {trailingActions}
      </div>
    ) : null;

  const renderActionRow = (primary: ReactNode) => (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5">
      <div className="flex min-w-0 flex-nowrap items-center gap-1.5">
        {primary}
      </div>
      {cancelCluster}
    </div>
  );

  const designConfirmButton =
    state.showDesignConfirm && onDesignConfirm ? (
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={designConfirmBusy}
        className={ctaButtonClass}
        onClick={(event) => {
          event.stopPropagation();
          onDesignConfirm();
        }}
      >
        {designConfirmBusy ? "확인 중..." : "어벗 디자인 확인"}
      </Button>
    ) : null;

  if (state.showWorkActions || designConfirmButton) {
    return (
      <div className={cn("w-full min-w-0 space-y-1.5", className)}>
        {pendingLabGuide}
        {renderActionRow(designConfirmButton)}
      </div>
    );
  }

  if (state.showCompletedStageHeaderCancel) {
    return (
      <div className={cn("w-full min-w-0 space-y-1.5", className)}>
        {renderActionRow(null)}
      </div>
    );
  }

  return (
    <div className={cn("w-full min-w-0 space-y-1.5", className)}>
      {cancelCluster ?? (
        <div className="flex flex-wrap items-center gap-1.5">{trailingActions}</div>
      )}
    </div>
  );
}
