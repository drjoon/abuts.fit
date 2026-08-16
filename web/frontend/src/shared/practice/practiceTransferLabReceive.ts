// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferLabReceiveCard.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// change-log:
// - 2026-08-16: expectedAbutmentDesigns / needsMoreAbutmentDesigns — 다치아 어벗 업로드 CTA.
// - 2026-08-16: machiningStarted — abutmentPastReady 우선(준비 복귀 후 sticky startedAt 무시).
// - 2026-08-16: abutmentPastReady — 가공 시작 시 생산/수락 취소 불가 판정.
// - 2026-08-16: 별점 다운그레이드(starDowngrade) 수신 타입.
// - 2026-08-16: labRatingSummary(내 별점·평가 횟수) 수신 타입.
// - 2026-08-16: 생산 취소 시 confirmedAt·autoMatch.completed·manufacturerStage 클리어 →「의뢰수락」.
// - 2026-08-15: 기공의뢰수신(어벗츠기공소·일반 lab) 카드 SSOT — 상태·CA 판정·타입.
// - 2026-08-16: 자동매칭 재공개(openPool)는 workCanceledAt보다 우선 →「자동매칭」(수락 취소 후 수락 잔상 방지).
import { parseToothWorks } from "@/shared/practice/transferMemo";
import type { PracticeTransferFeeQuote } from "@/shared/practice/practiceTransferFeeQuote";
import type {
  LabRatingSummary,
  StarDowngradeInfo,
} from "@/shared/practice/practiceLabRating";

export type PracticeTransferLabReceiveFile = {
  id: string;
  patientName: string;
  tooth: string;
  originalName: string;
  mimetype: string;
  size: number;
  s3Key: string;
};

export type PracticeTransferLabReceiveItem = {
  _id: string;
  transferId: string;
  targetLabName: string;
  transferMemo: string;
  rawTransferMemo: string;
  orderDate: string;
  arrivalDate: string;
  prosthesisTypes: string[];
  toothWorksSummary: string;
  status: string;
  manufacturerStage?: string;
  createdAt: string;
  updatedAt: string;
  isRead: boolean;
  requestorReadAt: string | null;
  isDownloaded: boolean;
  isAccepted: boolean;
  requestorDownloadedAt: string | null;
  requestorAcceptedAt: string | null;
  workCanceledAt?: string | null;
  labRejected?: boolean;
  labRejectedAt?: string | null;
  matchingMode?: "direct" | "auto";
  autoMatch?: {
    claimedAt?: string | null;
    deadlineAt?: string | null;
    claimHours?: number | null;
    completedAt?: string | null;
    openPool?: boolean;
    claimActive?: boolean;
    completed?: boolean;
    mine?: boolean;
    declinedByMe?: boolean;
    remainingMs?: number | null;
    releaseCount?: number;
  } | null;
  hasCustomAbutment?: boolean;
  production?: {
    shippingMode?: "normal" | "express" | null;
    skipDesignConfirm?: boolean;
    skipJig?: boolean;
    designReadyAt?: string | null;
    designFileCount?: number;
    designFiles?: PracticeTransferLabReceiveFile[];
    labDesignConfirmedAt?: string | null;
    practiceDesignConfirmedAt?: string | null;
    abutmentProductionStartedAt?: string | null;
    /** 연동 CA가 준비 단계를 지남(가공 등) — 생산/수락 취소 불가 */
    abutmentPastReady?: boolean;
    confirmedAt?: string | null;
    relatedRequestIds?: string[];
  } | null;
  practice: {
    businessName: string;
    userName: string;
  };
  practiceBusinessAnchorId?: string | null;
  labFeeMultiplier?: number;
  fileCount: number;
  files: PracticeTransferLabReceiveFile[];
  resultFileCount?: number;
  resultFiles?: PracticeTransferLabReceiveFile[];
  feeQuote?: PracticeTransferFeeQuote | null;
  /** 자동매칭 — 우리 별점(수가)보다 의뢰 별점(수가)이 낮을 때 */
  starDowngrade?: StarDowngradeInfo | null;
  /** 수신 기공소 본인 별점 요약 */
  labRatingSummary?: LabRatingSummary | null;
  isRemake?: boolean;
  remakeSourceTransferId?: string;
};

export type PracticeTransferLabReceiveDisplayStatus =
  | "거부"
  | "생산진행"
  | "작업완료"
  | "취소"
  | "자동매칭"
  | "의뢰수락"
  | "수신완료"
  | "발송완료";

export function getPracticeTransferLabReceiveDisplayStatus(
  transfer: {
    status?: string;
    manufacturerStage?: string;
    isRead?: boolean;
    isDownloaded?: boolean;
    isAccepted?: boolean;
    requestorDownloadedAt?: string | null;
    requestorAcceptedAt?: string | null;
    workCanceledAt?: string | null;
    matchingMode?: string | null;
    labRejected?: boolean;
    production?: {
      confirmedAt?: string | null;
    } | null;
    autoMatch?: {
      openPool?: boolean;
      completed?: boolean;
      claimActive?: boolean;
      mine?: boolean;
      declinedByMe?: boolean;
    } | null;
  },
): PracticeTransferLabReceiveDisplayStatus {
  if (
    transfer.labRejected ||
    transfer.manufacturerStage === "거부" ||
    transfer.autoMatch?.declinedByMe
  ) {
    return "거부";
  }
  if (
    transfer.production?.confirmedAt ||
    transfer.manufacturerStage === "생산진행"
  ) {
    return "생산진행";
  }
  if (
    transfer.autoMatch?.completed ||
    transfer.manufacturerStage === "작업완료"
  ) {
    return "작업완료";
  }

  // 자동매칭 재공개(수락 취소 포함) — workCanceledAt이 남아 있어도 공개 풀이면 「자동매칭」
  if (
    String(transfer.matchingMode || "") === "auto" &&
    (transfer.autoMatch?.openPool || transfer.manufacturerStage === "자동매칭")
  ) {
    return "자동매칭";
  }

  const stage = String(transfer.manufacturerStage || "").trim();
  if (
    stage === "작업취소" ||
    stage === "취소" ||
    Boolean(String(transfer.workCanceledAt || "").trim())
  ) {
    return "취소";
  }

  const rawStatus = String(transfer.status || "").trim().toLowerCase();
  if (
    Boolean(transfer.isAccepted) ||
    Boolean(transfer.isDownloaded) ||
    Boolean(String(transfer.requestorAcceptedAt || "").trim()) ||
    Boolean(String(transfer.requestorDownloadedAt || "").trim()) ||
    rawStatus === "downloaded" ||
    rawStatus === "accepted" ||
    rawStatus === "다운로드완료" ||
    rawStatus === "의뢰수락"
  ) {
    return "의뢰수락";
  }

  return transfer.isRead ? "수신완료" : "발송완료";
}

export function practiceTransferHasCustomAbutment(
  transfer: PracticeTransferLabReceiveItem | null | undefined,
) {
  if (!transfer) return false;
  if (typeof transfer.hasCustomAbutment === "boolean") {
    return transfer.hasCustomAbutment;
  }
  return parseToothWorks(transfer.toothWorksSummary).some((row) =>
    Boolean(row.customAbutment),
  );
}

export function practiceTransferAbutmentMachiningStarted(
  transfer:
    | {
        production?: {
          abutmentProductionStartedAt?: string | null;
          abutmentPastReady?: boolean | null;
        } | null;
      }
    | null
    | undefined,
) {
  // 라이브 pastReady가 있으면 그것만 본다(가공→준비 복귀 후 sticky startedAt 무시).
  if (
    transfer?.production &&
    Object.prototype.hasOwnProperty.call(transfer.production, "abutmentPastReady")
  ) {
    return Boolean(transfer.production.abutmentPastReady);
  }
  return Boolean(transfer?.production?.abutmentProductionStartedAt);
}

export function countPracticeTransferDesignFiles(
  transfer: PracticeTransferLabReceiveItem | null | undefined,
) {
  if (!transfer) return 0;
  return Number(
    transfer.production?.designFileCount ||
      transfer.production?.designFiles?.length ||
      0,
  );
}

/** 치식 요약·연동 Request 기준, 올려야 할 어벗디자인 개수 */
export function countPracticeTransferExpectedAbutmentDesigns(
  transfer: PracticeTransferLabReceiveItem | null | undefined,
) {
  if (!transfer) return 0;
  const caTeeth = parseToothWorks(transfer.toothWorksSummary).filter((row) =>
    Boolean(row.customAbutment),
  ).length;
  const related = Array.isArray(transfer.production?.relatedRequestIds)
    ? transfer.production.relatedRequestIds.filter((id) =>
        Boolean(String(id || "").trim()),
      ).length
    : 0;
  return Math.max(caTeeth, related, 0);
}

/** 커스텀어벗이 있고 아직 치아별 어벗디자인이 부족한지 */
export function practiceTransferNeedsMoreAbutmentDesigns(
  transfer: PracticeTransferLabReceiveItem | null | undefined,
) {
  if (!practiceTransferHasCustomAbutment(transfer)) return false;
  const designCount = countPracticeTransferDesignFiles(transfer);
  const expected = countPracticeTransferExpectedAbutmentDesigns(transfer);
  if (expected <= 0) return designCount === 0;
  return designCount < expected;
}
