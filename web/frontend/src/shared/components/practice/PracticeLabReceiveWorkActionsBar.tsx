// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferLabReceiveCard.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/practice/practiceTransferLabReceive.ts
// change-log:
// - 2026-08-21: 어벗 CTA「어벗 업로드 & 생산의뢰」·툴팁 단문화.
// - 2026-08-21: 카드→캘린더 전환 후 상세 모달에서도 어벗·보철 업로드 CTA 공유.
import type { MouseEvent } from "react";
import { UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  resolvePracticeLabReceiveWorkActionState,
  type PracticeTransferLabReceiveItem,
} from "@/shared/practice/practiceTransferLabReceive";

export type PracticeLabReceiveWorkActionsBarProps = {
  transfer: PracticeTransferLabReceiveItem;
  busy?: boolean;
  designConfirmBusy?: boolean;
  /** 수락 중「어벗 생산 취소」노출(상세는 true, 카드는 헤더와 역할 분담 시 true) */
  showProductionCancelInBar?: boolean;
  onDesignUpload: (event: MouseEvent) => void;
  onAbutmentProductionCancel?: (event: MouseEvent) => void;
  onComplete: (event: MouseEvent) => void;
  onDesignConfirm?: () => void;
  className?: string;
};

/**
 * 기공의뢰수신 — 수락 후 어벗디자인/보철 업로드 CTA(카드·상세 모달 공통).
 */
export function PracticeLabReceiveWorkActionsBar({
  transfer,
  busy = false,
  designConfirmBusy = false,
  showProductionCancelInBar = true,
  onDesignUpload,
  onAbutmentProductionCancel,
  onComplete,
  onDesignConfirm,
  className,
}: PracticeLabReceiveWorkActionsBarProps) {
  const state = resolvePracticeLabReceiveWorkActionState(transfer);
  if (!state.showWorkActions && !state.showCompletedStageHeaderCancel) {
    return null;
  }

  const abutmentButtonLabel =
    state.designFileCount > 0
      ? `어벗 추가 업로드 (${state.designFileCount})`
      : "어벗 업로드 & 생산의뢰";
  const prostheticButtonLabel = state.hasPartialProsthetic
    ? `보철 추가 업로드 (${state.pendingProstheticCount})`
    : "보철 업로드 & 작업완료";

  const productionCancelButton =
    showProductionCancelInBar &&
    state.showAbutmentProductionCancel &&
    state.showWorkActions ? (
      state.productionStarted ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled
                className="h-8 focus-visible:ring-0 focus-visible:ring-offset-0"
              >
                <X className="h-3.5 w-3.5" />
                어벗 생산 취소
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            어벗 가공이 시작된 뒤에는 생산을 취소할 수 없습니다. 제조사가 준비
            단계일 때만 가능합니다.
          </TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy || !onAbutmentProductionCancel}
              className="h-8 focus-visible:ring-0 focus-visible:ring-offset-0"
              onClick={(event) => void onAbutmentProductionCancel?.(event)}
            >
              <X className="h-3.5 w-3.5" />
              {busy ? "처리 중..." : "어벗 생산 취소"}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            제조사가 준비 단계일 때만 생산을 취소할 수 있습니다. 가공이 시작되면
            변경할 수 없습니다.
          </TooltipContent>
        </Tooltip>
      )
    ) : null;

  const completedStageDisabledUploads = state.showCompletedStageHeaderCancel ? (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        disabled
        className="h-8 focus-visible:ring-0 focus-visible:ring-offset-0"
      >
        <UploadCloud className="h-3.5 w-3.5" />
        어벗 업로드 & 생산의뢰
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled
        className="h-8 focus-visible:ring-0 focus-visible:ring-offset-0"
      >
        <UploadCloud className="h-3.5 w-3.5" />
        보철 업로드 & 작업완료
      </Button>
    </div>
  ) : null;

  if (state.showWorkActions) {
    return (
      <div className={className}>
        <div className="flex flex-wrap items-center gap-1.5">
          {state.showDesignConfirm && onDesignConfirm ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={designConfirmBusy}
              className="h-8"
              onClick={(event) => {
                event.stopPropagation();
                onDesignConfirm();
              }}
            >
              {designConfirmBusy ? "확인 중..." : "어벗 디자인 확인"}
            </Button>
          ) : null}
          {state.hasCa && state.needsMoreAbutmentDesigns ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  className="h-8 focus-visible:ring-0 focus-visible:ring-offset-0"
                  onClick={(event) => void onDesignUpload(event)}
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                  {busy ? "처리 중..." : abutmentButtonLabel}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                {state.designFileCount > 0
                  ? "남은 어벗 STL을 이어서 올립니다."
                  : "어벗 STL을 올리고 어벗츠에 생산을 의뢰합니다."}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {productionCancelButton}
          <Tooltip>
            <TooltipTrigger asChild>
              {state.needsMoreAbutmentDesigns ? (
                <span className="inline-flex">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled
                    className="h-8 focus-visible:ring-0 focus-visible:ring-offset-0"
                  >
                    <UploadCloud className="h-3.5 w-3.5" />
                    {prostheticButtonLabel}
                  </Button>
                </span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  disabled={busy}
                  className="h-8 focus-visible:ring-0 focus-visible:ring-offset-0"
                  onClick={(event) => onComplete(event)}
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                  {busy ? "처리 중..." : prostheticButtonLabel}
                </Button>
              )}
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              {state.needsMoreAbutmentDesigns
                ? "어벗을 먼저 올린 뒤 보철 STL을 올릴 수 있습니다."
                : state.hasPartialProsthetic
                  ? "남은 보철을 이어서 올립니다."
                  : "보철 파일을 올리고 작업을 완료합니다."}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    );
  }

  return completedStageDisabledUploads ? (
    <div className={className}>{completedStageDisabledUploads}</div>
  ) : null;
}
