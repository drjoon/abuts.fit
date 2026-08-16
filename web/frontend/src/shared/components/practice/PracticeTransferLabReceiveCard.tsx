// related files:
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/internalLab/labWork/LabWorkPage.tsx
// - web/frontend/src/shared/practice/practiceTransferLabReceive.ts
// - web/frontend/src/features/requestSettings/RequestCaseMetaBadges.tsx
// change-log:
// - 2026-08-16: 수신 카드 — 치과 중심 계층·칩 메타·상태 색·compact 셸(간단 명료).
// - 2026-08-16: 다치아 어벗 — 부족분 추가 업로드 CTA·보철 다중 업로드 안내.
// - 2026-08-16: 어벗 가공 시작 시「어벗 생산 취소」는 숨기지 않고 비활성(의뢰 수락 취소와 동일).
// - 2026-08-16: 어벗 가공 시작(준비 아님)이면 의뢰 수락 취소 비활성.
// - 2026-08-16: 취소 라벨 — 수락중「의뢰 수락 취소」·보철완료후「작업 완료 취소」.
// - 2026-08-16: 보철 완료(발송) 후 — 어벗·보철 CTA 비활성 + 오른쪽「취소」만(의뢰수락 재오픈).
// - 2026-08-16: 별점 다운그레이드 배너 — 우리 별점·자동매칭 별점·수가 차이(accent/danger).
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
import { SEMANTIC_BADGE, SEMANTIC_CALLOUT } from "@/shared/ui/semanticStatus";
import {
  countPracticeTransferDesignFiles,
  getPracticeTransferLabReceiveDisplayStatus,
  practiceTransferAbutmentMachiningStarted,
  practiceTransferHasCustomAbutment,
  practiceTransferNeedsMoreAbutmentDesigns,
  type PracticeTransferLabReceiveItem,
} from "@/shared/practice/practiceTransferLabReceive";

const formatDateTime = (value: unknown) => {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", {
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

const META_CHIP_CLASS =
  "inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-slate-600";

const statusBadgeClass = (displayStatus: string) => {
  if (
    displayStatus === "취소" ||
    displayStatus === "거부" ||
    displayStatus === "작업취소"
  ) {
    return SEMANTIC_BADGE.dangerSoft;
  }
  if (
    displayStatus === "의뢰수락" ||
    displayStatus === "작업완료" ||
    displayStatus === "생산진행" ||
    displayStatus === "포장.발송"
  ) {
    return SEMANTIC_BADGE.primarySoft;
  }
  if (displayStatus === "발송완료" || displayStatus === "자동매칭") {
    return SEMANTIC_BADGE.neutral;
  }
  return SEMANTIC_BADGE.neutral;
};

const CARD_SHELL =
  "w-full cursor-pointer rounded-xl border bg-white p-3.5 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";


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
  const needsMoreAbutmentDesigns =
    practiceTransferNeedsMoreAbutmentDesigns(transfer);
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

  /** 수락 중(업로드 가능): 어벗디자인 있으면「어벗 생산 취소」(가공 중이면 비활성 유지) */
  const productionCancelButton = showAbutmentProductionCancel ? (
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

  /** 보철 완료·발송 단계: 3버튼 유지, 업로드 2개 비활성, 오른쪽 취소만(의뢰수락 재오픈) */
  const completedStageCancelActions =
    !showWorkActions && showAbutmentProductionCancel ? (
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
        {productionStarted ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button type="button" size="sm" variant="outline" disabled className="h-8">
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
                className="h-8"
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
        )}
      </div>
    ) : null;

  const clinicLabel =
    transfer.matchingMode === "auto"
      ? "자동 매칭"
      : String(transfer.practice.businessName || "").trim() || "-";
  const contactLabel =
    transfer.matchingMode === "auto"
      ? ""
      : String(transfer.practice.userName || "").trim();
  const memoPreview = String(transfer.transferMemo || "")
    .replace(/\s+/g, " ")
    .trim();
  const workPreview =
    toothWorksPreview ||
    (transfer.prosthesisTypes.length
      ? transfer.prosthesisTypes.join(", ")
      : "");

  const actionBar =
    showWorkActions || completedStageCancelActions ? (
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
                  완성 어벗 STL을 여러 개 올릴 수 있습니다. 치아별 파일을
                  올리면 제조사에서 커스텀 어벗 생산을 진행합니다.
                </TooltipContent>
              </Tooltip>
            ) : null}
            {productionCancelButton}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={needsMoreAbutmentDesigns ? "secondary" : "default"}
                  disabled={cardBusy}
                  className="h-8 focus-visible:ring-0 focus-visible:ring-offset-0"
                  onClick={(event) => onComplete(event)}
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                  {cardBusy ? "처리 중..." : "보철 업로드 & 작업완료"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                크라운 등 보철 결과 파일을 여러 개 올려 작업완료합니다.
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
                      className="h-8"
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
                className="h-8"
                onClick={(event) => void onRelease(event)}
              >
                {cardBusy ? "처리 중..." : "의뢰 수락 취소"}
              </Button>
            )}
          </div>
        ) : (
          completedStageCancelActions
        )}
      </div>
    ) : null;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            className={cn(
              "h-5 shrink-0 px-1.5 text-[11px] font-semibold leading-none",
              statusBadgeClass(displayStatus),
            )}
          >
            {toStatusBadgeLabel(displayStatus)}
          </Badge>
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
          <RequestCaseMetaBadges
            designSoftware={designSoftwareLabel}
            anodizingEnabled={anodizingEnabled}
          />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-amber-200/80 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-950">
              <Star
                className="h-3 w-3 fill-amber-500 text-amber-500"
                aria-hidden
              />
              <span className="font-semibold tabular-nums">
                {formatLabStarsLabel(myStarsDisplay)}
              </span>
              <span className="text-amber-800/70">·{myRatingCount}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            내 별점(전체 치과 평가 합산). 평가{" "}
            {AUTO_MATCH_RATING_COUNT_GRACE + 1}회부터 실제 평균이 적용됩니다.
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="mt-2.5 flex items-start gap-2.5">
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            transfer.matchingMode === "auto"
              ? "bg-primary-soft text-primary-strong"
              : "bg-slate-100 text-slate-600",
          )}
        >
          <Building2 className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate text-[15px] font-semibold leading-tight tracking-tight text-slate-900">
              {clinicLabel}
            </h3>
            {chatUnreadCount > 0 ? (
              <Badge
                variant="destructive"
                className="h-4 min-w-4 justify-center px-1 text-[10px] leading-none"
              >
                {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
              </Badge>
            ) : null}
          </div>
          {contactLabel ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              담당 {contactLabel}
            </p>
          ) : null}
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="font-medium tabular-nums text-slate-600">
              {transfer.transferId}
            </span>
            <span aria-hidden className="text-slate-300">
              ·
            </span>
            <span className="tabular-nums">
              {formatDateTime(transfer.createdAt)}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {transfer.orderDate && transfer.arrivalDate ? (
          <div className="text-[12px] leading-snug">
            <PracticeWorkPeriodText
              orderDate={transfer.orderDate}
              arrivalDate={transfer.arrivalDate}
              variant="orderArrival"
              viewer="lab"
              className="text-[12px]"
            />
          </div>
        ) : null}
        {workPreview ? (
          <p
            className="truncate text-[12px] font-medium leading-snug text-slate-700"
            title={workPreview}
          >
            {toothWorksPreview ? workPreview : `형태 ${workPreview}`}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1">
          <span className={META_CHIP_CLASS}>파일 {transfer.fileCount}</span>
          {designFileCount > 0 ? (
            <span className={META_CHIP_CLASS}>어벗 {designFileCount}</span>
          ) : null}
          {resultCount > 0 ? (
            <span className={META_CHIP_CLASS}>결과 {resultCount}</span>
          ) : null}
        </div>
        {memoPreview ? (
          <p
            className="truncate text-[11px] leading-snug text-muted-foreground"
            title={memoPreview}
          >
            메모 {memoPreview}
          </p>
        ) : null}
      </div>

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
          className={cn(
            "mt-2.5 rounded-lg px-2.5 py-2 text-[11px]",
            SEMANTIC_CALLOUT.attentionBorder,
          )}
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-accent-strong">
            <span className="inline-flex items-center gap-1">
              <Star className="h-3 w-3 fill-current" aria-hidden />
              별점 다운그레이드
            </span>
            <span className="font-normal text-accent-strong/80">
              낮은 별점 의뢰 · 수락 전 확인
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
              <span className="mx-1 font-normal text-accent-strong/70" aria-hidden>
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

      {showWorkActions &&
      hasCa &&
      designFileCount > 0 &&
      !transfer.production?.labDesignConfirmedAt ? (
        <div className="mt-2.5 rounded-lg border border-dashed border-primary/35 bg-primary-soft/50 px-2.5 py-1.5 text-[11px] leading-snug text-primary-strong">
          어벗 디자인 도착
          {!transfer.production?.abutmentProductionStartedAt
            ? " · 신규 건은 업로드 시 자동 주문"
            : " · 레거시는 「어벗 디자인 확인」"}
        </div>
      ) : null}

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
