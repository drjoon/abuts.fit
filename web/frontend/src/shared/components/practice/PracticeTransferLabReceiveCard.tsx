// related files:
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/internalLab/labWork/LabWorkPage.tsx
// - web/frontend/src/shared/practice/practiceTransferLabReceive.ts
// - web/frontend/src/features/requestSettings/RequestCaseMetaBadges.tsx
// change-log:
// - 2026-08-16: 어벗 가공 시작(준비 아님)이면 어벗 생산·의뢰 수락 취소 숨김.
// - 2026-08-16: 취소 라벨 — 수락중「의뢰 수락 취소」·보철완료후「작업 완료 취소」.
// - 2026-08-16: 보철 완료(발송) 후 — 어벗·보철 CTA 비활성 + 오른쪽「취소」만(의뢰수락 재오픈).
// - 2026-08-16: 별점 다운그레이드 배너 — 내 별점·의뢰 별점·수가 차이.
// - 2026-08-16: 상태 뱃지 오른쪽 끝 — 내 별점·평가 횟수.
// - 2026-08-16: 어벗생산의뢰와 동일 크기·스타일의 디자인SW·아노 메타 뱃지.
// - 2026-08-16: CTA 라벨「어벗 생산 취소」.
// - 2026-08-16: stuck(디자인 없음+완료 플래그)도 「어벗 생산 취소」·재오픈 후 업로드 CTA.
// - 2026-08-16: 생산 취소 후 displayStatus「의뢰수락」복원 시 어벗·보철 업로드 CTA 재표시.
// - 2026-08-16: 어벗디자인 업로드 후 CTA「어벗 생산 취소」(제조 준비 단계만).
// - 2026-08-15: 업로드 완료 안내 박스(어벗생산 취소 문구) 제거.
// - 2026-08-15: 기공의뢰수신 카드 SSOT — 어벗츠기공소·일반 lab 동일 색·스타일·문구.
import type { KeyboardEvent, MouseEvent } from "react";
import { Building2, Star, UploadCloud, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RequestCaseMetaBadges } from "@/features/requestSettings/RequestCaseMetaBadges";
import { cn } from "@/shared/ui/cn";
import {
  PRACTICE_REMAKE_BADGE_CLASS,
  toStatusBadgeLabel,
} from "@/shared/practice/practiceRecentTransferList";
import { isPracticeTransferAcceptOverdue } from "@/shared/practice/practiceAcceptOverdue";
import { PRACTICE_ACCEPTED_HINT } from "@/shared/practice/practiceTransferAccept";
import { formatToothWorksForDisplay, parseToothWorks } from "@/shared/practice/transferMemo";
import { PracticeAcceptOverdueBadge } from "@/shared/components/practice/PracticeAcceptOverdueBadge";
import { PracticeTransferFeeEstimate } from "@/shared/components/practice/PracticeTransferFeeEstimate";
import {
  PracticeTransferFileDropTarget,
} from "@/shared/components/practice/PracticeTransferFileDropTarget";
import { PracticeWorkPeriodText } from "@/shared/components/practice/PracticeWorkPeriodText";
import {
  AUTO_MATCH_RATING_COUNT_GRACE,
  DEFAULT_EFFECTIVE_LAB_STARS,
  formatLabStarsLabel,
} from "@/shared/practice/practiceLabRating";
import {
  countPracticeTransferDesignFiles,
  getPracticeTransferLabReceiveDisplayStatus,
  practiceTransferAbutmentMachiningStarted,
  practiceTransferHasCustomAbutment,
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
    second: "2-digit",
    hour12: false,
  });
};

const formatWonCompact = (value: number) =>
  `₩${Math.max(0, Math.round(value)).toLocaleString("ko-KR")}`;


export type PracticeTransferLabReceiveCardProps = {
  transfer: PracticeTransferLabReceiveItem;
  chatUnreadCount?: number;
  cardBusy?: boolean;
  designConfirmBusy?: boolean;
  dimRejected?: boolean;
  /** 기공소 의뢰 기본값 — 어벗생산의뢰 파일카드와 동일 메타 뱃지 */
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
  designSoftwareLabel = null,
  anodizingEnabled = null,
  onOpen,
  onDesignUpload,
  onAbutmentProductionCancel,
  onComplete,
  onRelease,
  onDesignConfirm,
  onDropFiles,
}: PracticeTransferLabReceiveCardProps) {
  const toothWorksPreview = formatToothWorksForDisplay(
    parseToothWorks(transfer.toothWorksSummary),
    { labFacing: true },
  );
  const displayStatus = getPracticeTransferLabReceiveDisplayStatus(transfer);
  const cardId = String(transfer.transferId || transfer._id || "").trim();
  const resultCount = Number(
    transfer.resultFileCount || transfer.resultFiles?.length || 0,
  );
  const designFileCount = countPracticeTransferDesignFiles(transfer);
  const hasCa = practiceTransferHasCustomAbutment(transfer);
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
    !productionStarted &&
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
  /** 제조 준비 + (디자인 있음 | 스테이지 재오픈 필요) */
  const canCancelAbutmentProduction =
    hasCa &&
    !productionStarted &&
    (designFileCount > 0 || needsStageReopen) &&
    Array.isArray(transfer.production?.relatedRequestIds) &&
    transfer.production.relatedRequestIds.length > 0;
  const completeInputId = `practice-complete-${cardId}`;
  const acceptOverdue = isPracticeTransferAcceptOverdue({
    status: displayStatus,
    orderDate: transfer.orderDate,
    createdAt: transfer.createdAt,
  });
  const starDowngrade = transfer.starDowngrade || null;
  const hasStarDowngrade = Boolean(starDowngrade);
  const labRatingSummary = transfer.labRatingSummary || null;
  const myStarsDisplay =
    labRatingSummary &&
    labRatingSummary.ratingCount > AUTO_MATCH_RATING_COUNT_GRACE &&
    labRatingSummary.stars != null
      ? labRatingSummary.stars
      : labRatingSummary?.effectiveStars ?? DEFAULT_EFFECTIVE_LAB_STARS;
  const myRatingCount = labRatingSummary?.ratingCount ?? 0;

  const onCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };

  /** 수락 중(업로드 가능): 어벗디자인 있으면「어벗 생산 취소」 */
  const productionCancelButton = canCancelAbutmentProduction ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={cardBusy}
          className="focus-visible:ring-0 focus-visible:ring-offset-0"
          onClick={(event) => void onAbutmentProductionCancel(event)}
        >
          <X className="h-4 w-4" />
          {cardBusy ? "처리 중..." : "어벗 생산 취소"}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        제조사가 준비 단계일 때만 생산을 취소할 수 있습니다. 가공이 시작되면
        변경할 수 없습니다.
      </TooltipContent>
    </Tooltip>
  ) : null;

  /** 보철 완료·발송 단계: 3버튼 유지, 업로드 2개 비활성, 오른쪽 취소만(의뢰수락 재오픈) */
  const completedStageCancelActions =
    !showWorkActions && canCancelAbutmentProduction ? (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled
          className="focus-visible:ring-0 focus-visible:ring-offset-0"
        >
          <UploadCloud className="h-4 w-4" />
          어벗디자인 파일 업로드
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled
          className="focus-visible:ring-0 focus-visible:ring-offset-0"
        >
          <UploadCloud className="h-4 w-4" />
          보철 업로드 & 작업완료
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={cardBusy}
              onClick={(event) => void onAbutmentProductionCancel(event)}
            >
              {cardBusy ? "처리 중..." : "작업 완료 취소"}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            발송(작업완료) 단계를 의뢰수락으로 되돌립니다. 이후 어벗·보철을
            다시 올리거나 작업 취소할 수 있습니다. 제조사 준비 단계에서만
            가능합니다.
          </TooltipContent>
        </Tooltip>
      </div>
    ) : null;

  const body = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="font-semibold truncate">{transfer.transferId}</span>
          {chatUnreadCount > 0 ? (
            <Badge
              variant="destructive"
              className="h-5 min-w-5 justify-center px-1 text-[11px] leading-none"
            >
              {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RequestCaseMetaBadges
            designSoftware={designSoftwareLabel}
            anodizingEnabled={anodizingEnabled}
          />
          <span className="text-xs text-muted-foreground">
            {formatDateTime(transfer.createdAt)}
          </span>
          <Badge
            variant={
              displayStatus === "발송완료" ||
              displayStatus === "자동매칭" ||
              displayStatus === "취소" ||
              displayStatus === "거부"
                ? "destructive"
                : "secondary"
            }
            className={cn(
              "shrink-0 whitespace-nowrap",
              displayStatus === "의뢰수락" ||
                displayStatus === "작업완료" ||
                displayStatus === "생산진행"
                ? "bg-primary-soft text-primary-strong hover:bg-primary-soft"
                : "",
            )}
          >
            {toStatusBadgeLabel(displayStatus)}
          </Badge>
          {acceptOverdue ? <PracticeAcceptOverdueBadge viewer="lab" /> : null}
          {transfer.isRemake ? (
            <Badge
              variant="outline"
              className={cn(
                "shrink-0 whitespace-nowrap",
                PRACTICE_REMAKE_BADGE_CLASS,
              )}
            >
              리메이크
            </Badge>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="shrink-0 gap-1 whitespace-nowrap border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-50"
              >
                <Star className="h-3 w-3 fill-amber-500 text-amber-500" aria-hidden />
                <span className="font-semibold">
                  {formatLabStarsLabel(myStarsDisplay)}
                </span>
                <span className="font-normal text-amber-800/80">
                  · 평가 {myRatingCount}회
                </span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              내 별점(전체 치과 평가 합산). 평가{" "}
              {AUTO_MATCH_RATING_COUNT_GRACE + 1}회부터 실제 평균이 적용됩니다.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="mt-2 text-sm text-muted-foreground">
        치과:{" "}
        {transfer.matchingMode === "auto"
          ? "자동 매칭"
          : transfer.practice.businessName || "-"}
        {transfer.matchingMode === "auto"
          ? ""
          : transfer.practice.userName
            ? ` · 담당자 ${transfer.practice.userName}`
            : ""}
      </div>

      <p className="mt-2 text-xs text-muted-foreground truncate">
        파일 {transfer.fileCount}개
        {designFileCount > 0 ? ` · 어벗디자인 ${designFileCount}개` : ""}
        {resultCount > 0 ? ` · 결과 ${resultCount}개` : ""}
        {transfer.orderDate && transfer.arrivalDate ? (
          <>
            {" · "}
            <PracticeWorkPeriodText
              orderDate={transfer.orderDate}
              arrivalDate={transfer.arrivalDate}
              variant="orderArrival"
              viewer="lab"
              className="text-xs"
            />
          </>
        ) : null}
        {toothWorksPreview
          ? ` · 치아별 ${toothWorksPreview}`
          : transfer.prosthesisTypes.length
            ? ` · 형태 ${transfer.prosthesisTypes.join(", ")}`
            : ""}
        {String(transfer.transferMemo || "").trim()
          ? ` · 메모: ${String(transfer.transferMemo || "").replace(/\s+/g, " ").trim()}`
          : ""}
      </p>
      {transfer.feeQuote ? (
        <PracticeTransferFeeEstimate
          quote={transfer.feeQuote}
          viewer="lab"
          density="card"
          skipJig={Boolean(transfer.production?.skipJig)}
        />
      ) : null}

      {starDowngrade ? (
        <div
          role="note"
          className="mt-2 rounded-md border border-orange-400 bg-orange-50 px-3 py-2 text-xs text-orange-950"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
            <span className="inline-flex items-center gap-1 text-orange-700">
              <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
              별점 다운그레이드
            </span>
            <span className="text-orange-800/80 font-normal">
              내 별점 수가보다 낮은 의뢰입니다. 수락 여부를 선택하세요.
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded bg-orange-200/80 px-2 py-0.5 font-semibold text-orange-950">
              내 별점 {formatLabStarsLabel(starDowngrade.labEffectiveStars)}
            </span>
            <span className="text-orange-700" aria-hidden>
              →
            </span>
            <span className="inline-flex items-center rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-950 ring-1 ring-amber-400/60">
              자동매칭 {formatLabStarsLabel(starDowngrade.autoMatchStars)}
            </span>
            {starDowngrade.labFeeDeltaWon > 0 ? (
              <span className="inline-flex items-center rounded bg-rose-100 px-2 py-0.5 font-semibold text-rose-800 ring-1 ring-rose-300/70">
                수가 {formatWonCompact(starDowngrade.labFeeDeltaWon)} 낮음
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {showWorkActions &&
      hasCa &&
      designFileCount > 0 &&
      !transfer.production?.labDesignConfirmedAt ? (
        <div className="mt-2 rounded-md border border-dashed border-primary/40 bg-primary-soft/40 px-3 py-2 text-xs text-primary-strong">
          어벗 디자인이 도착했습니다. 레거시 건은 「어벗 디자인 확인」으로 생산을
          시작할 수 있습니다.
          {!transfer.production?.abutmentProductionStartedAt
            ? " (신규 건은 디자인 업로드 시 자동으로 제조 주문이 들어갑니다.)"
            : ""}
        </div>
      ) : null}

      {showWorkActions ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {hasCa &&
          designFileCount > 0 &&
          !transfer.production?.labDesignConfirmedAt ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={designConfirmBusy}
              onClick={(event) => {
                event.stopPropagation();
                onDesignConfirm();
              }}
            >
              {designConfirmBusy ? "확인 중..." : "어벗 디자인 확인"}
            </Button>
          ) : null}
          {hasCa && designFileCount === 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  disabled={cardBusy}
                  className="focus-visible:ring-0 focus-visible:ring-offset-0"
                  onClick={(event) => void onDesignUpload(event)}
                >
                  <UploadCloud className="h-4 w-4" />
                  {cardBusy ? "처리 중..." : "어벗디자인 파일 업로드"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                완성 어벗 STL을 올리면 제조사에서 커스텀 어벗 생산을 진행합니다.
              </TooltipContent>
            </Tooltip>
          ) : null}
          {productionCancelButton}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant={
                  hasCa && designFileCount === 0 ? "secondary" : "default"
                }
                disabled={cardBusy}
                className="focus-visible:ring-0 focus-visible:ring-offset-0"
                onClick={(event) => onComplete(event)}
              >
                <UploadCloud className="h-4 w-4" />
                {cardBusy ? "처리 중..." : "보철 업로드 & 작업완료"}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              크라운 등 보철 결과 파일을 올려 작업완료합니다.
              {PRACTICE_ACCEPTED_HINT ? ` ${PRACTICE_ACCEPTED_HINT}` : ""}
            </TooltipContent>
          </Tooltip>
          {productionStarted ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled
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
              onClick={(event) => void onRelease(event)}
            >
              {cardBusy ? "처리 중..." : "의뢰 수락 취소"}
            </Button>
          )}
        </div>
      ) : (
        completedStageCancelActions
      )}
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
          "w-full cursor-pointer rounded-lg border-2 border-dashed p-4 text-left transition",
          hasStarDowngrade
            ? "border-orange-400 hover:bg-orange-50/50"
            : "border-slate-300 hover:bg-muted/20",
          dimRejected && "opacity-40 hover:opacity-55",
        )}
        activeClassName={
          hasStarDowngrade
            ? "border-orange-500 bg-orange-50/70"
            : "border-primary bg-primary-soft/40"
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
        "w-full cursor-pointer rounded-lg border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        hasStarDowngrade
          ? "border-orange-400 bg-orange-50/40 hover:border-orange-500 hover:bg-orange-50/70"
          : "hover:border-primary/40 hover:bg-muted/20",
        dimRejected && "opacity-40 hover:opacity-55",
      )}
      data-transfer-card="true"
    >
      {body}
    </div>
  );
}
