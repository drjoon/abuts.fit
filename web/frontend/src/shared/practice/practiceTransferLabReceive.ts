// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferLabReceiveCard.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// change-log:
// - 2026-08-16: 생산 취소 시 confirmedAt·autoMatch.completed·manufacturerStage 클리어 →「의뢰수락」.
// - 2026-08-15: 기공의뢰수신(어벗츠기공소·일반 lab) 카드 SSOT — 상태·CA 판정·타입.
import { parseToothWorks } from "@/shared/practice/transferMemo";
import type { PracticeTransferFeeQuote } from "@/shared/practice/practiceTransferFeeQuote";

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

  const stage = String(transfer.manufacturerStage || "").trim();
  if (
    stage === "작업취소" ||
    stage === "취소" ||
    Boolean(String(transfer.workCanceledAt || "").trim())
  ) {
    return "취소";
  }

  if (
    String(transfer.matchingMode || "") === "auto" &&
    transfer.autoMatch?.openPool
  ) {
    return "자동매칭";
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
