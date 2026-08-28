// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferLabReceiveCard.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/practice/practiceTransferLabReceive.ts
// - web/frontend/src/shared/practice/roundBarAbutment.ts
// change-log:
// - 2026-08-28: 어벗·보철·취소 — 가능하면 1줄, 아니면 어벗·보철 / 취소 2줄.
// - 2026-08-28: CTA「어벗/보철 업로드」단축·툴팁(생산 시작·작업 완료) 공유 문구.
// - 2026-08-28: 업로드 CTA 2열 + 취소 행 — 좁은 채팅에서 버튼이 3줄로 떨어지지 않게.
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
import { cn } from "@/shared/ui/cn";

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

const ctaButtonClass =
  "h-8 shrink-0 px-2.5 text-xs focus-visible:ring-0 focus-visible:ring-offset-0";

/** 어벗 업로드 CTA·채팅 드롭존 안내 SSOT */
export const LAB_RECEIVE_ABUTMENT_UPLOAD_HINT =
  "어벗츠에서 커스텀 어벗 생산이 시작됩니다.";
/** 보철 업로드 CTA·채팅 드롭존 안내 SSOT */
export const LAB_RECEIVE_PROSTHETIC_UPLOAD_HINT =
  "업로드하면 작업이 완료됩니다.";

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
      : "어벗 업로드";
  const prostheticButtonLabel = state.hasPartialProsthetic
    ? `보철 추가 업로드 (${state.pendingProstheticCount})`
    : "보철 업로드";
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
            className="h-8 shrink-0 focus-visible:ring-0 focus-visible:ring-offset-0"
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

  if (state.showWorkActions) {
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

    const abutmentUploadButton = showAbutmentUpload ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            className={ctaButtonClass}
            onClick={(event) => void onDesignUpload(event)}
          >
            <UploadCloud className="h-3.5 w-3.5" />
            {busy ? "처리 중..." : abutmentButtonLabel}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {state.designFileCount > 0
            ? "남은 어벗 STL을 이어서 올립니다."
            : LAB_RECEIVE_ABUTMENT_UPLOAD_HINT}
        </TooltipContent>
      </Tooltip>
    ) : null;

    const prostheticUploadButton = (
      <Tooltip>
        <TooltipTrigger asChild>
          {state.needsMoreAbutmentDesigns ? (
            <span className="inline-flex shrink-0">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled
                className={ctaButtonClass}
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
              className={ctaButtonClass}
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
              : LAB_RECEIVE_PROSTHETIC_UPLOAD_HINT}
        </TooltipContent>
      </Tooltip>
    );

    return (
      <div className={cn("w-full min-w-0 space-y-1.5", className)}>
        {pendingLabGuide}
        {renderActionRow(
          <>
            {designConfirmButton}
            {abutmentUploadButton}
            {prostheticUploadButton}
          </>,
        )}
      </div>
    );
  }

  if (state.showCompletedStageHeaderCancel) {
    return (
      <div className={cn("w-full min-w-0 space-y-1.5", className)}>
        {renderActionRow(
          <>
            <Button
              type="button"
              size="sm"
              disabled
              className={ctaButtonClass}
            >
              <UploadCloud className="h-3.5 w-3.5" />
              어벗 업로드
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled
              className={ctaButtonClass}
            >
              <UploadCloud className="h-3.5 w-3.5" />
              보철 업로드
            </Button>
          </>,
        )}
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
