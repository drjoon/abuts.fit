// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferLabReceiveCard.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/practice/practiceTransferLabReceive.ts
// - web/frontend/src/shared/practice/roundBarAbutment.ts
// change-log:
// - 2026-08-23: 미제공 CA 안내를 한 줄로 압축(LabPendingAbutmentGuide).
// - 2026-08-21: 작업취소(수락 해제)를 업로드 CTA와 같은 버튼 행에 둔다.
// - 2026-08-21: 미제공 CA 안내 — 치아·임플란트 상세 + 자체 처리 문구(LabPendingAbutmentGuide).
// - 2026-08-21: 요청중 CA — 어벗 업로드 CTA 숨김 + 기공소 CNC 직접 의뢰 안내.
// - 2026-08-21: 어벗 생산 취소 — 가공 중이어도 클릭 가능. API 판정·토스트(준비 복귀 대비).
// - 2026-08-21: 어벗 CTA「어벗 업로드 & 생산의뢰」·툴팁 단문화.
// - 2026-08-21: 카드→캘린더 전환 후 상세 모달에서도 어벗·보철 업로드 CTA 공유.
import type { MouseEvent, ReactNode } from "react";
import { UploadCloud, X } from "lucide-react";
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
  /** 버튼 행 끝(보철 업로드 옆). 상세 모달 작업취소 등 */
  trailingActions?: ReactNode;
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

  const abutmentButtonLabel =
    state.designFileCount > 0
      ? `어벗 추가 업로드 (${state.designFileCount})`
      : "어벗 업로드 & 생산의뢰";
  const prostheticButtonLabel = state.hasPartialProsthetic
    ? `보철 추가 업로드 (${state.pendingProstheticCount})`
    : "보철 업로드 & 작업완료";
  const showAbutmentUpload =
    state.hasAbutsCa && state.needsMoreAbutmentDesigns;
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
            className="h-8 focus-visible:ring-0 focus-visible:ring-offset-0"
            onClick={(event) => void onAbutmentProductionCancel?.(event)}
          >
            <X className="h-3.5 w-3.5" />
            {busy ? "처리 중..." : "어벗 생산 취소"}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          제조사가 준비 단계일 때만 생산을 취소할 수 있습니다.
        </TooltipContent>
      </Tooltip>
    ) : null;

  if (state.showWorkActions) {
    return (
      <div className={className ? `space-y-1.5 ${className}` : "space-y-1.5"}>
        {pendingLabGuide}
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
          {showAbutmentUpload ? (
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
          {trailingActions}
        </div>
      </div>
    );
  }

  if (state.showCompletedStageHeaderCancel) {
    return (
      <div className={className ? `space-y-1.5 ${className}` : "space-y-1.5"}>
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
          {trailingActions}
        </div>
      </div>
    );
  }

  return (
    <div className={className ? `space-y-1.5 ${className}` : "space-y-1.5"}>
      <div className="flex flex-wrap items-center gap-1.5">{trailingActions}</div>
    </div>
  );
}
