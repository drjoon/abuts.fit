// related files:
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/internalLab/labWork/LabWorkPage.tsx
// - web/frontend/src/shared/practice/practiceTransferLabReceive.ts
// - web/frontend/src/shared/components/practice/PracticeRecentTransferListCardDetail.tsx
// change-log:
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
import { Star, UploadCloud, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import {
  PRACTICE_REMAKE_BADGE_CLASS,
  toStatusBadgeLabel,
} from "@/shared/practice/practiceRecentTransferList";
import { isPracticeTransferAcceptOverdue } from "@/shared/practice/practiceAcceptOverdue";
import { PRACTICE_ACCEPTED_HINT } from "@/shared/practice/practiceTransferAccept";
import { PracticeAcceptOverdueBadge } from "@/shared/components/practice/PracticeAcceptOverdueBadge";
import { PracticeTransferFeeEstimate } from "@/shared/components/practice/PracticeTransferFeeEstimate";
import {
  PracticeTransferFileDropTarget,
} from "@/shared/components/practice/PracticeTransferFileDropTarget";
import {
  PracticeTransferRequestCardMeta,
  resolvePracticeTransferListPatientName,
  resolvePracticeTransferListToothNumbers,
} from "@/shared/components/practice/PracticeRecentTransferListCardDetail";
import { formatLabStarsLabel } from "@/shared/practice/practiceLabRating";
import { SEMANTIC_BADGE, SEMANTIC_CALLOUT } from "@/shared/ui/semanticStatus";
import {
  countPracticeTransferDesignFiles,
  countPracticeTransferPendingProstheticFiles,
  formatPracticeTransferProstheticSlotLabels,
  getPracticeTransferLabReceiveDisplayStatus,
  practiceTransferAbutmentMachiningStarted,
  practiceTransferHasCustomAbutment,
  practiceTransferHasPartialProstheticUploads,
  practiceTransferNeedsMoreAbutmentDesigns,
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

const formatWonCompact = (value: number) =>
  `₩${Math.max(0, Math.round(value)).toLocaleString("ko-KR")}`;

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
  onDesignUpload: (event: MouseEvent) => void;
  onAbutmentProductionCancel: (event: MouseEvent) => void;
  onComplete: (event: MouseEvent) => void;
  onRelease: (event: MouseEvent) => void;
  onDesignConfirm: () => void;
  onDropFiles: (files: File[]) => void;
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
  onDesignUpload,
  onAbutmentProductionCancel,
  onComplete,
  onRelease,
  onDesignConfirm,
  onDropFiles,
}: PracticeTransferLabReceiveCardProps) {
  const displayStatus = getPracticeTransferLabReceiveDisplayStatus(transfer);
  const statusLabel = toStatusBadgeLabel(displayStatus);
  const cardId = String(transfer.transferId || transfer._id || "").trim();
  // 사이드바「기공의뢰수신」배지와 동일: 미확인 의뢰(1) + 채팅 unread.
  const unreadBadgeCount =
    (transfer.isRead ? 0 : 1) + Math.max(0, Number(chatUnreadCount) || 0);
  const resultCount = Number(
    transfer.resultFileCount || transfer.resultFiles?.length || 0,
  );
  const designFileCount = countPracticeTransferDesignFiles(transfer);
  const hasCa = practiceTransferHasCustomAbutment(transfer);
  const needsMoreAbutmentDesigns =
    practiceTransferNeedsMoreAbutmentDesigns(transfer);
  const hasPartialProsthetic =
    practiceTransferHasPartialProstheticUploads(transfer);
  const pendingProstheticCount =
    countPracticeTransferPendingProstheticFiles(transfer);
  const prostheticSlotLabels = formatPracticeTransferProstheticSlotLabels(
    transfer,
    { pendingOnly: hasPartialProsthetic },
  );
  const isLabAccepted =
    Boolean(transfer.isAccepted) ||
    Boolean(transfer.isDownloaded) ||
    Boolean(String(transfer.requestorDownloadedAt || "").trim()) ||
    Boolean(String(transfer.requestorAcceptedAt || "").trim());
  const productionStarted = practiceTransferAbutmentMachiningStarted(transfer);
  /** 디자인만 지워지고 작업완료/생산진행 플래그가 남은 재작업 가능 상태 */
  const needsStageReopen =
    hasCa &&
    isLabAccepted &&
    designFileCount === 0 &&
    (resultCount > 0 ||
      Boolean(transfer.production?.confirmedAt) ||
      Boolean(transfer.autoMatch?.completed) ||
      displayStatus === "생산진행" ||
      displayStatus === "작업완료");
  /** 의뢰수락이거나, 재오픈 직후(디자인·결과 없음)면 업로드 CTA */
  const showWorkActions =
    displayStatus === "의뢰수락" ||
    (isLabAccepted &&
      !productionStarted &&
      designFileCount === 0 &&
      resultCount === 0 &&
      !transfer.production?.confirmedAt &&
      !transfer.autoMatch?.completed);
  /** 연동 CA가 있고(디자인 있음 | 스테이지 재오픈) — 가공 중이어도 CTA는 노출 */
  const showAbutmentProductionCancel =
    hasCa &&
    (designFileCount > 0 || needsStageReopen) &&
    Array.isArray(transfer.production?.relatedRequestIds) &&
    transfer.production.relatedRequestIds.length > 0;
  /** 보철완료 후 헤더「작업 완료 취소」(업로드 CTA는 비활성으로 하단 유지) */
  const showCompletedStageHeaderCancel =
    !showWorkActions && showAbutmentProductionCancel;
  const completeInputId = `practice-complete-${cardId}`;
  const acceptOverdue = isPracticeTransferAcceptOverdue({
    status: displayStatus,
    orderDate: transfer.orderDate,
    createdAt: transfer.createdAt,
  });
  const starDowngrade = transfer.starDowngrade || null;
  const hasStarDowngrade = Boolean(starDowngrade);

  const onCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };

  /** 수락 중(업로드 가능): 어벗디자인 있으면「어벗 생산 취소」(가공 중이면 비활성 유지) */
  const productionCancelButton =
    showAbutmentProductionCancel && showWorkActions ? (
      productionStarted ? (
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
              disabled={cardBusy}
              className="h-8 focus-visible:ring-0 focus-visible:ring-offset-0"
              onClick={(event) => void onAbutmentProductionCancel(event)}
            >
              <X className="h-3.5 w-3.5" />
              {cardBusy ? "처리 중..." : "어벗 생산 취소"}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            제조사가 준비 단계일 때만 생산을 취소할 수 있습니다. 가공이 시작되면
            변경할 수 없습니다.
          </TooltipContent>
        </Tooltip>
      )
    ) : null;

  /** 헤더 우측 — 수락중「의뢰 수락 취소」/ 완료후「작업 완료 취소」 */
  const headerCancelButton = showWorkActions ? (
    productionStarted ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled
              className="h-7 px-2 text-[11px]"
            >
              의뢰 수락 취소
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          어벗 가공이 시작된 뒤에는 의뢰 수락을 취소할 수 없습니다. 제조사가
          준비 단계일 때만 가능합니다.
        </TooltipContent>
      </Tooltip>
    ) : (
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
    )
  ) : showCompletedStageHeaderCancel ? (
    productionStarted ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled
              className="h-7 px-2 text-[11px]"
            >
              작업 완료 취소
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          어벗 가공이 시작된 뒤에는 작업 완료를 취소할 수 없습니다. 제조사가
          준비 단계일 때만 가능합니다.
        </TooltipContent>
      </Tooltip>
    ) : (
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
          발송(작업완료) 단계를 의뢰수락으로 되돌립니다. 이후 어벗·보철을 다시
          올리거나 작업 취소할 수 있습니다. 제조사 준비 단계에서만 가능합니다.
        </TooltipContent>
      </Tooltip>
    )
  ) : null;

  /** 보철 완료·발송 단계: 업로드 2개만 비활성(취소는 헤더) */
  const completedStageDisabledUploads = showCompletedStageHeaderCancel ? (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        disabled
        className="h-8 focus-visible:ring-0 focus-visible:ring-offset-0"
      >
        <UploadCloud className="h-3.5 w-3.5" />
        어벗 업로드
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

  const clinicLabel =
    transfer.matchingMode === "auto"
      ? "자동 매칭"
      : String(transfer.practice.businessName || "").trim() || "-";
  const patientName = resolvePracticeTransferListPatientName(transfer);
  const prostheticButtonLabel = hasPartialProsthetic
    ? `보철 추가 업로드 (${pendingProstheticCount})`
    : "보철 업로드 & 작업완료";

  const actionBar =
    showWorkActions || completedStageDisabledUploads ? (
      <div className="mt-3 border-t border-slate-100 pt-3">
        {showWorkActions ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {hasCa &&
            designFileCount > 0 &&
            !transfer.production?.labDesignConfirmedAt ? (
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
            {hasCa && needsMoreAbutmentDesigns ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    disabled={cardBusy}
                    className="h-8 focus-visible:ring-0 focus-visible:ring-offset-0"
                    onClick={(event) => void onDesignUpload(event)}
                  >
                    <UploadCloud className="h-3.5 w-3.5" />
                    {cardBusy
                      ? "처리 중..."
                      : designFileCount > 0
                        ? `어벗 추가 업로드 (${designFileCount})`
                        : "어벗 업로드"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  완성 어벗 STL을 올립니다. 파일명에 치아가 없어도 프리뷰에서
                  직접 지정할 수 있습니다. 치아 수만큼 올리거나, 일부만 분할
                  업로드할 수 있습니다.
                </TooltipContent>
              </Tooltip>
            ) : null}
            {productionCancelButton}
            <Tooltip>
              <TooltipTrigger asChild>
                {needsMoreAbutmentDesigns ? (
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
                    disabled={cardBusy}
                    className="h-8 focus-visible:ring-0 focus-visible:ring-offset-0"
                    onClick={(event) => onComplete(event)}
                  >
                    <UploadCloud className="h-3.5 w-3.5" />
                    {cardBusy ? "처리 중..." : prostheticButtonLabel}
                  </Button>
                )}
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                {needsMoreAbutmentDesigns
                  ? "어벗디자인을 먼저 업로드한 뒤 보철 파일을 올릴 수 있습니다."
                  : hasPartialProsthetic
                    ? `남은 보철 ${pendingProstheticCount}개${
                        prostheticSlotLabels ? ` (${prostheticSlotLabels})` : ""
                      }를 이어서 올립니다.`
                    : prostheticSlotLabels
                      ? `이 의뢰 보철 ${pendingProstheticCount}개: ${prostheticSlotLabels}. 브리지는 스팬당 1개, 크라운·인레이는 치아당 1개입니다.${
                          PRACTICE_ACCEPTED_HINT ? ` ${PRACTICE_ACCEPTED_HINT}` : ""
                        }`
                      : `브리지는 스팬당 1개, 크라운·인레이는 치아당 1개로 올려 작업완료합니다.${
                          PRACTICE_ACCEPTED_HINT ? ` ${PRACTICE_ACCEPTED_HINT}` : ""
                        }`}
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          completedStageDisabledUploads
        )}
      </div>
    ) : null;

  const body = (
    <>
      <PracticeTransferRequestCardMeta
        createdAt={formatDateTime(transfer.createdAt)}
        statusLabel={statusLabel}
        headerActions={headerCancelButton}
        extraBadges={
          <>
            {acceptOverdue ? <PracticeAcceptOverdueBadge viewer="lab" /> : null}
            {transfer.isRemake ? (
              <Badge
                variant="outline"
                className={cn(
                  "h-5 shrink-0 px-1.5 text-[11px] leading-none",
                  PRACTICE_REMAKE_BADGE_CLASS,
                )}
              >
                리메이크
              </Badge>
            ) : null}
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
          transfer.feeQuote || starDowngrade ? (
            <div className="space-y-2">
              {transfer.feeQuote ? (
                <PracticeTransferFeeEstimate
                  quote={transfer.feeQuote}
                  viewer="lab"
                  density="card"
                  skipJig={Boolean(transfer.production?.skipJig)}
                  rushProcessing={Boolean(transfer.production?.rushProcessing)}
                  labEffectiveStars={
                    transfer.labRatingSummary?.effectiveStars ??
                    starDowngrade?.labEffectiveStars ??
                    null
                  }
                />
              ) : null}
              {starDowngrade ? (
                <div
                  role="note"
                  className={cn(
                    "rounded-lg px-2.5 py-2 text-[11px]",
                    SEMANTIC_CALLOUT.attentionBorder,
                  )}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-accent-strong">
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3 w-3 fill-current" aria-hidden />
                      별점 다운그레이드
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-1.5 py-0.5 font-semibold tabular-nums",
                        SEMANTIC_BADGE.attentionSoft,
                      )}
                    >
                      {formatLabStarsLabel(starDowngrade.labEffectiveStars)}
                      <span
                        className="mx-1 font-normal text-accent-strong/70"
                        aria-hidden
                      >
                        →
                      </span>
                      {formatLabStarsLabel(starDowngrade.autoMatchStars)}
                    </span>
                    {starDowngrade.labFeeDeltaWon > 0 ? (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md px-1.5 py-0.5 font-semibold tabular-nums",
                          SEMANTIC_BADGE.dangerSoft,
                        )}
                      >
                        수가 {formatWonCompact(starDowngrade.labFeeDeltaWon)}↓
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null
        }
      />

      {actionBar}
    </>
  );

  if (showWorkActions) {
    return (
      <PracticeTransferFileDropTarget
        fileInputId={completeInputId}
        disabled={cardBusy}
        acceptedHint={PRACTICE_ACCEPTED_HINT}
        showDefaultUi={false}
        className={cn(
          CARD_SHELL,
          "border-2 border-dashed shadow-none",
          hasStarDowngrade
            ? "border-accent/70 bg-accent-soft/35 hover:border-accent hover:bg-accent-soft/60"
            : "border-slate-300/90 hover:border-primary/50 hover:bg-primary-soft/20",
          dimRejected && "opacity-40 hover:opacity-55",
        )}
        activeClassName={
          hasStarDowngrade
            ? "border-accent bg-accent-soft/80"
            : "border-primary bg-primary-soft/45"
        }
        onFiles={onDropFiles}
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
        hasStarDowngrade
          ? "border-accent/70 bg-accent-soft/35 hover:border-accent hover:bg-accent-soft/60 hover:shadow-md"
          : "border-slate-200/90 hover:border-primary/35 hover:bg-slate-50/60 hover:shadow-md",
        dimRejected && "opacity-40 hover:opacity-55",
      )}
      data-transfer-card="true"
    >
      {body}
    </div>
  );
}
