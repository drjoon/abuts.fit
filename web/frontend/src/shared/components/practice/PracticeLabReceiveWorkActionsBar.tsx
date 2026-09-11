// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferLabReceiveCard.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/practice/practiceTransferLabReceive.ts
// change-log:
// - 2026-09-11: 어벗 STL 업로드 버튼 — 작업 취소 옆. 인라인 파란 배너 제거(페이지 전체 드롭).
// - 2026-09-11: 업로드 대기 배지 — 어벗츠 생산의뢰 줄 오른쪽. 상세 패널 리메이크 CTA 제거.
// - 2026-09-11: 가공(pastReady) 후 어벗 취소 숨김 · 리메이크(선택 치아) 안내.
// - 2026-09-03: 어벗츠 안내 — 업로드된 치아 번호 취소줄(designFiles).
// - 2026-09-02: 어벗츠 제공 CA만 있어도 안내 표시(심플어벗 제외).
// - 2026-09-02: 공개 카탈로그로 도입중 CA 안내 보강(플래그 저장 누락 보정).
// - 2026-09-02: 미제공 안내에 어벗츠 생산의뢰 완료 여부 전달.
// - 2026-09-02: 작업 완료 취소 표시 중에도 미제공 CA 자체 처리 안내 유지.
// - 2026-09-02: 어벗(STL) 업로드 CTA 제거 — 진행상황 드롭존 클릭/드래그가 SSOT.
// - 2026-09-02: 파일 없는「작업 완료」CTA 제거(도착일 경과 자동 완료).
// - 2026-09-02: 보철/dual 제거. CA 어벗 업로드 + 파일 없는 작업 완료 CTA.
// - 2026-09-02: 수락 후 24h/48h 어벗 STL 미업로드 경고 배너.
import type { MouseEvent, ReactNode } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PracticeAbutmentUploadOverdueAlert } from "@/shared/components/practice/PracticeAbutmentUploadOverdueAlert";
import { LabPendingAbutmentGuide } from "@/shared/components/practice/LabPendingAbutmentGuide";
import {
  listPracticeTransferCustomAbutmentToothWorks,
  listPracticeTransferUploadedAbutmentTeeth,
  resolvePracticeLabReceiveWorkActionState,
  resolvePracticeTransferAbutmentUploadOverdue,
  type PracticeTransferLabReceiveItem,
} from "@/shared/practice/practiceTransferLabReceive";
import type { RoundBarCatalogRow } from "@/shared/practice/roundBarAbutment";
import { cn } from "@/shared/ui/cn";

export type PracticeLabReceiveWorkActionsBarProps = {
  transfer: PracticeTransferLabReceiveItem;
  /** 공개·도입중 카탈로그 — 저장 누락된 implantAddRequest 보강 */
  implantCatalog?: RoundBarCatalogRow[] | null;
  busy?: boolean;
  designConfirmBusy?: boolean;
  /** 수락 중「어벗 생산 취소」노출(상세는 true, 카드는 헤더와 역할 분담 시 true) */
  showProductionCancelInBar?: boolean;
  onAbutmentProductionCancel?: (event: MouseEvent) => void;
  /** 어벗 STL 파일창 — 작업 취소 옆 */
  onAbutmentStlUpload?: (event: MouseEvent) => void;
  onDesignConfirm?: () => void;
  trailingActions?: ReactNode;
  className?: string;
};

const ctaButtonClass =
  "h-8 shrink-0 px-2.5 text-xs focus-visible:ring-0 focus-visible:ring-offset-0";

/** 어벗 — 채팅 드롭존 안내 SSOT */
export const LAB_RECEIVE_ABUTMENT_UPLOAD_HINT =
  "커스텀 어벗 STL만. 구강 스캔(PLY·큰 파일)은 안 됩니다.";

/**
 * 기공의뢰수신 — 수락 후 작업 취소·디자인 확인(카드·상세 모달 공통).
 * 어벗 STL 업로드는 버튼(파일창) + 페이지 전체 드래그.
 */
export function PracticeLabReceiveWorkActionsBar({
  transfer,
  implantCatalog = null,
  busy = false,
  designConfirmBusy = false,
  showProductionCancelInBar = true,
  onAbutmentProductionCancel,
  onAbutmentStlUpload,
  onDesignConfirm,
  trailingActions = null,
  className,
}: PracticeLabReceiveWorkActionsBarProps) {
  const catalog = Array.isArray(implantCatalog) ? implantCatalog : [];
  const state = resolvePracticeLabReceiveWorkActionState(transfer, catalog);
  const uploadOverdue = resolvePracticeTransferAbutmentUploadOverdue(
    transfer,
    catalog,
  );
  const hasTrailing = Boolean(trailingActions);
  const hasAbutmentGuide = state.hasPendingLabCa || state.hasAbutsCa;
  const showAbutmentUpload =
    state.designStlUploadMode === "abutment" && Boolean(onAbutmentStlUpload);
  if (
    !state.showWorkActions &&
    !state.showCompletedStageHeaderCancel &&
    !state.abutmentCancelBlockedPastReady &&
    !hasTrailing &&
    !hasAbutmentGuide &&
    !uploadOverdue &&
    !showAbutmentUpload
  ) {
    return null;
  }

  const uploadOverdueAlert = uploadOverdue ? (
    <PracticeAbutmentUploadOverdueAlert level={uploadOverdue} compact />
  ) : null;

  /** 어벗츠 생산의뢰 줄이 있을 때는 그 줄 오른쪽에 배지 */
  const abutsInlineOverdue =
    uploadOverdueAlert && state.hasAbutsCa ? uploadOverdueAlert : null;
  const standaloneOverdue =
    uploadOverdueAlert && !state.hasAbutsCa ? uploadOverdueAlert : null;

  const pendingLabGuide = hasAbutmentGuide ? (
    <LabPendingAbutmentGuide
      toothWorks={listPracticeTransferCustomAbutmentToothWorks(
        transfer,
        catalog,
      )}
      mixedWithAbuts={state.hasAbutsCa}
      abutsProductionOrdered={
        (state.showAbutmentProductionCancel ||
          state.abutmentCancelBlockedPastReady) &&
        !state.needsMoreAbutmentDesigns
      }
      uploadedAbutmentTeeth={listPracticeTransferUploadedAbutmentTeeth(
        transfer,
        catalog,
      )}
      abutsTrailing={abutsInlineOverdue}
    />
  ) : null;

  const abutmentUploadButton = showAbutmentUpload ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="default"
          disabled={busy}
          className={cn(ctaButtonClass, "gap-1")}
          onClick={(event) => {
            event.stopPropagation();
            onAbutmentStlUpload?.(event);
          }}
        >
          <Upload className="h-3.5 w-3.5" />
          {busy ? "처리 중..." : "어벗 STL 업로드"}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {LAB_RECEIVE_ABUTMENT_UPLOAD_HINT}
        {" 페이지 어디에나 파일을 놓아도 됩니다."}
      </TooltipContent>
    </Tooltip>
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
          제조사가 준비 단계일 때만 생산을 취소할 수 있습니다. 가공이 시작되면
          리메이크로 선택 치아만 재제작하세요.
        </TooltipContent>
      </Tooltip>
    ) : null;

  const cancelCluster =
    abutmentUploadButton || productionCancelButton || hasTrailing ? (
      <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        {abutmentUploadButton}
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
        {standaloneOverdue}
        {pendingLabGuide}
        {renderActionRow(designConfirmButton)}
      </div>
    );
  }

  if (
    (state.showCompletedStageHeaderCancel ||
      state.abutmentCancelBlockedPastReady) &&
    cancelCluster
  ) {
    return (
      <div className={cn("w-full min-w-0 space-y-1.5", className)}>
        {standaloneOverdue}
        {pendingLabGuide}
        {renderActionRow(null)}
      </div>
    );
  }

  return (
    <div className={cn("w-full min-w-0 space-y-1.5", className)}>
      {standaloneOverdue}
      {pendingLabGuide}
      {cancelCluster ??
        (trailingActions ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {trailingActions}
          </div>
        ) : null)}
    </div>
  );
}
