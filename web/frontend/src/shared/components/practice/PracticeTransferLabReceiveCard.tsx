// related files:
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/internalLab/labWork/LabWorkPage.tsx
// - web/frontend/src/shared/practice/practiceTransferLabReceive.ts
// - web/frontend/src/shared/components/practice/PracticeLabReceiveWorkActionsBar.tsx
// - web/frontend/src/shared/components/practice/PracticeRecentTransferListCardDetail.tsx
// change-log:
// - 2026-09-02: 어벗·보철 CTA → 디자인(STL) 업로드 통합.
// - 2026-08-21: 의뢰 수락/작업 완료 취소 — 가공 중이어도 클릭·API 판정·토스트(고정 비활성 제거).
// - 2026-08-21: 업로드 CTA → PracticeLabReceiveWorkActionsBar(상세 모달과 공유).
// - 2026-08-17: 미확인 의뢰(!isRead)도 채팅 unread와 합산해 헤더 빨간 배지 표시(사이드바 배지와 정합).
// - 2026-08-16: 의뢰 수락 취소·작업 완료 취소 → 카드 헤더 우측.
// - 2026-08-16: 부분 보철「보철 추가 업로드 (n)」·기대 슬롯 툴팁.
// - 2026-08-16: 부분 보철「보철 추가 업로드」·어벗 툴팁(치아 수동 지정).
// - 2026-08-16: 어벗 미완이면 보철 업로드 CTA 비활성(드롭은 어벗→보철 순).
// - 2026-08-16: 카드 메타에 치아번호(11,21) — 보철 형태는 상세 모달.
// - 2026-08-16: 치과와 동일 최신 메타(시각·상태·주문/도착·치과/환자). 메모·기간·메타뱃지·헤더 별점 제거.
// - 2026-08-16: 수신 카드 — 상태·메타·별점 / 매칭·시각 / 작업기간 / 기공비·수령 4줄로 압축.
// - 2026-08-16: 수신 카드 — 치과 중심 계층·칩 메타·상태 색·compact 셸(간단 명료).
// - 2026-08-16: 다치아 어벗 — 부족분 추가 업로드 CTA·보철 다중 업로드 안내.
// - 2026-08-16: 어벗 가공 시작 시「어벗 생산 취소」는 숨기지 않고 비활성(의뢰 수락 취소와 동일).
// - 2026-08-16: 어벗 가공 시작(준비 아님)이면 의뢰 수락 취소 비활성.
// - 2026-08-16: 취소 라벨 — 수락중「의뢰 수락 취소」·보철완료후「작업 완료 취소」.
// - 2026-08-16: 보철 완료(발송) 후 — 어벗·보철 CTA 비활성 + 헤더「작업 완료 취소」.
// - 2026-08-16: 별점 다운그레이드 배너 — 우리 별점·자동매칭 별점·수가 차이(accent/danger).
// - 2026-08-16: CTA 라벨「어벗 생산 취소」.
// - 2026-08-16: stuck(디자인 없음+완료 플래그)도 「어벗 생산 취소」·재오픈 후 업로드 CTA.
// - 2026-08-16: 생산 취소 후 displayStatus「의뢰수락」복원 시 어벗·보철 업로드 CTA 재표시.
// - 2026-08-16: 어벗디자인 업로드 후 CTA「어벗 생산 취소」(제조 준비 단계만).
// - 2026-08-15: 업로드 완료 안내 박스(어벗생산 취소 문구) 제거.
// - 2026-08-15: 기공의뢰수신 카드 SSOT — 어벗츠기공소·일반 lab 동일 색·스타일·문구.
import type { KeyboardEvent, MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import { toStatusBadgeLabel } from "@/shared/practice/practiceRecentTransferList";
import { isPracticeTransferAcceptOverdue } from "@/shared/practice/practiceAcceptOverdue";
import { PRACTICE_ACCEPTED_HINT } from "@/shared/practice/practiceTransferAccept";
import { PracticeAcceptOverdueBadge } from "@/shared/components/practice/PracticeAcceptOverdueBadge";
import { PracticeLabReceiveWorkActionsBar } from "@/shared/components/practice/PracticeLabReceiveWorkActionsBar";
import { PracticeTransferFeeEstimate } from "@/shared/components/practice/PracticeTransferFeeEstimate";
import {
  PracticeTransferFileDropTarget,
} from "@/shared/components/practice/PracticeTransferFileDropTarget";
import {
  PracticeTransferRequestCardMeta,
  resolvePracticeTransferListPatientName,
  resolvePracticeTransferListToothNumbers,
} from "@/shared/components/practice/PracticeRecentTransferListCardDetail";
import {
  practiceTransferLabReceiveUnreadBadgeCount,
  resolvePracticeLabReceiveWorkActionState,
  type PracticeTransferLabReceiveItem,
} from "@/shared/practice/practiceTransferLabReceive";

const formatDateTime = (value: unknown) => {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  });
};

const CARD_SHELL =
  "w-full cursor-pointer rounded-xl border bg-white p-3.5 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type PracticeTransferLabReceiveCardProps = {
  transfer: PracticeTransferLabReceiveItem;
  chatUnreadCount?: number;
  cardBusy?: boolean;
  designConfirmBusy?: boolean;
  dimRejected?: boolean;
  /** 기공소 의뢰 기본값 — 상세에서 사용(목록 카드에는 미표시) */
  designSoftwareLabel?: string | null;
  anodizingEnabled?: boolean | null;
  onOpen: () => void;
  onDesignStlUpload?: (event: MouseEvent) => void;
  onMarkCompleteWithoutFiles?: (event: MouseEvent) => void;
  onAbutmentProductionCancel: (event: MouseEvent) => void;
  onRelease: (event: MouseEvent) => void;
  onOpenSubcontract?: (event: MouseEvent) => void;
  onDesignConfirm: () => void;
  onDropFiles?: (files: File[]) => void;
};

/**
 * 기공의뢰수신 목록 카드 — 어벗츠기공소(lab-work)·일반 기공소 공통.
 */
export function PracticeTransferLabReceiveCard({
  transfer,
  chatUnreadCount = 0,
  cardBusy = false,
  designConfirmBusy = false,
  dimRejected = false,
  onOpen,
  onDesignStlUpload,
  onMarkCompleteWithoutFiles,
  onAbutmentProductionCancel,
  onRelease,
  onOpenSubcontract,
  onDesignConfirm,
  onDropFiles,
}: PracticeTransferLabReceiveCardProps) {
  const workState = resolvePracticeLabReceiveWorkActionState(transfer);
  const statusLabel = toStatusBadgeLabel(workState.displayStatus, {
    designFileCount: transfer.production?.designFileCount,
    designFiles: transfer.production?.designFiles,
    designReadyAt: transfer.production?.designReadyAt,
  });
  const cardId = String(transfer.transferId || transfer._id || "").trim();
  const unreadBadgeCount = practiceTransferLabReceiveUnreadBadgeCount(
    transfer,
    chatUnreadCount,
  );
  const {
    showWorkActions,
    showAbutmentProductionCancel,
    showCompletedStageHeaderCancel,
    showMarkCompleteWithoutFiles,
    designStlUploadMode,
  } = workState;
  const completeInputId = `practice-complete-${cardId}`;
  const allowCardDrop =
    Boolean(onDropFiles) && designStlUploadMode === "abutment";
  const acceptOverdue = isPracticeTransferAcceptOverdue({
    status: workState.displayStatus,
    orderDate: transfer.orderDate,
    createdAt: transfer.createdAt,
  });

  const onCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };

  /** 헤더 우측 — 수락중「의뢰 수락 취소」/ 완료후「작업 완료 취소」/ 우선창「하청 전환」 */
  const headerCancelButton = transfer.autoMatch?.canOpenSubcontract &&
  onOpenSubcontract ? (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={cardBusy}
      className="h-7 px-2 text-[11px]"
      onClick={(event) => {
        event.stopPropagation();
        void onOpenSubcontract(event);
      }}
    >
      {cardBusy ? "처리 중..." : "하청 전환"}
    </Button>
  ) : showWorkActions ? (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={cardBusy}
      className="h-7 px-2 text-[11px]"
      onClick={(event) => void onRelease(event)}
    >
      {cardBusy ? "처리 중..." : "의뢰 수락 취소"}
    </Button>
  ) : showCompletedStageHeaderCancel ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={cardBusy}
          className="h-7 px-2 text-[11px]"
          onClick={(event) => void onAbutmentProductionCancel(event)}
        >
          {cardBusy ? "처리 중..." : "작업 완료 취소"}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        발송(작업완료) 단계를 의뢰수락으로 되돌립니다. 제조사 준비 단계에서만
        가능합니다.
      </TooltipContent>
    </Tooltip>
  ) : null;

  const clinicLabel =
    transfer.matchingMode === "auto"
      ? "자동 매칭"
      : transfer.autoMatch?.openPool
        ? String(transfer.practice.businessName || "").trim() || "비공개"
        : String(transfer.practice.businessName || "").trim() || "-";
  const patientName = resolvePracticeTransferListPatientName(transfer);

  const body = (
    <>
      <PracticeTransferRequestCardMeta
        createdAt={formatDateTime(transfer.createdAt)}
        statusLabel={statusLabel}
        headerActions={headerCancelButton}
        extraBadges={
          <>
            {acceptOverdue ? <PracticeAcceptOverdueBadge viewer="lab" /> : null}
            {transfer.production?.rushProcessing ? (
              <Badge
                variant="outline"
                className="h-5 shrink-0 border-orange-300 bg-orange-50 px-1.5 text-[11px] leading-none text-orange-800"
              >
                신속처리
              </Badge>
            ) : null}
            {unreadBadgeCount > 0 ? (
              <Badge
                variant="destructive"
                className="h-4 min-w-4 justify-center px-1 text-[10px] leading-none"
              >
                {unreadBadgeCount > 99 ? "99+" : unreadBadgeCount}
              </Badge>
            ) : null}
          </>
        }
        counterpartLabel="치과"
        counterpartValue={clinicLabel}
        orderDate={transfer.orderDate}
        arrivalDate={transfer.arrivalDate}
        patientName={patientName}
        toothNumbers={resolvePracticeTransferListToothNumbers(transfer)}
        afterMeta={
          transfer.feeQuote ? (
            <PracticeTransferFeeEstimate
              quote={transfer.feeQuote}
              viewer="lab"
              density="card"
              skipJig={Boolean(transfer.production?.skipJig)}
              rushProcessing={Boolean(transfer.production?.rushProcessing)}
              labEffectiveStars={
                transfer.labRatingSummary?.effectiveStars ?? null
              }
            />
          ) : null
        }
      />

      {showWorkActions ||
      showCompletedStageHeaderCancel ||
      showMarkCompleteWithoutFiles ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <PracticeLabReceiveWorkActionsBar
            transfer={transfer}
            busy={cardBusy}
            designConfirmBusy={designConfirmBusy}
            showProductionCancelInBar={
              Boolean(showAbutmentProductionCancel && showWorkActions)
            }
            showDesignUpload={false}
            onDesignStlUpload={onDesignStlUpload}
            onMarkCompleteWithoutFiles={onMarkCompleteWithoutFiles}
            onAbutmentProductionCancel={onAbutmentProductionCancel}
            onDesignConfirm={onDesignConfirm}
          />
        </div>
      ) : null}
    </>
  );

  if (allowCardDrop && showWorkActions) {
    return (
      <PracticeTransferFileDropTarget
        fileInputId={completeInputId}
        disabled={cardBusy}
        acceptedHint={PRACTICE_ACCEPTED_HINT}
        showDefaultUi={false}
        className={cn(
          CARD_SHELL,
          "border-2 border-dashed shadow-none",
          "border-slate-300/90 hover:border-primary/50 hover:bg-primary-soft/20",
          dimRejected && "opacity-40 hover:opacity-55",
        )}
        activeClassName="border-primary bg-primary-soft/45"
        onFiles={onDropFiles!}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={onOpen}
          onKeyDown={onCardKeyDown}
          className="focus-visible:outline-none"
          data-transfer-card="true"
        >
          {body}
        </div>
      </PracticeTransferFileDropTarget>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onCardKeyDown}
      className={cn(
        CARD_SHELL,
        "border-slate-200/90 hover:border-primary/35 hover:bg-slate-50/60 hover:shadow-md",
        dimRejected && "opacity-40 hover:opacity-55",
      )}
      data-transfer-card="true"
    >
      {body}
    </div>
  );
}
