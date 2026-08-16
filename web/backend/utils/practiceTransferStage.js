// related files:
// - web/backend/utils/practiceTransferAutoMatch.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/services/practiceTransferDashboardStats.service.js
// - web/frontend/src/shared/practice/practiceRecentTransferList.ts
// - 2026-08-15: 대시보드 버킷에 거부 추가. 수락/거부·완료/취소 병기.
// - 2026-08-16: 공개풀 decline의 labRejectedAt은 미배정 취소 시 「취소」(거부 아님).
import {
  isAutoMatchMode,
  toAutoMatchApiFields,
} from "./practiceTransferAutoMatch.js";

/**
 * 기공의뢰 manufacturerStage SSOT (UI·대시보드 집계 공통).
 * 생산진행 = 치과 「생산 진행」 컨펌 후(production.confirmedAt).
 * @param {object} transferDoc
 * @param {{ viewerLabAnchorId?: string|null }} [options]
 *   viewerLabAnchorId: 기공소 수신 뷰 — 내가 거부한 공개 풀/지정 건을 「거부」로.
 */
export const resolvePracticeTransferManufacturerStage = (
  transferDoc,
  { viewerLabAnchorId = null } = {},
) => {
  const matchingMode = isAutoMatchMode(transferDoc) ? "auto" : "direct";
  const autoFields = toAutoMatchApiFields(transferDoc, viewerLabAnchorId);
  const production =
    transferDoc?.production && typeof transferDoc.production === "object"
      ? transferDoc.production
      : {};
  const openPool =
    matchingMode === "auto" && Boolean(autoFields.autoMatch?.openPool);
  const viewerId = String(viewerLabAnchorId || "").trim();
  const declinedByViewer = Boolean(autoFields.autoMatch?.declinedByMe);
  const rejectedByViewer =
    Boolean(viewerId) &&
    String(transferDoc?.labRejectedByLabAnchorId || "").trim() === viewerId &&
    Boolean(transferDoc?.labRejectedAt);

  if (declinedByViewer || rejectedByViewer) return "거부";

  const status = String(transferDoc?.status || "").trim();
  // 지정/배정 거부 → canceled + labRejectedAt (발신 치과에서도 거부로 집계).
  // 공개 풀 decline도 labRejectedAt을 남기므로, 미배정 자동매칭 취소는 휴지통「취소」로 본다.
  if (status === "canceled") {
    if (transferDoc?.labRejectedAt) {
      const hasAssignee = Boolean(
        String(transferDoc?.targetLabAnchorId || "").trim(),
      );
      if (hasAssignee || matchingMode !== "auto") return "거부";
    }
    return "취소";
  }
  if (production?.confirmedAt) return "생산진행";
  if (autoFields.autoMatch?.completed) return "작업완료";
  // 기공소 작업취소(수락 해제) — 치과 휴지통 취소와 구분(작업취소)
  if (transferDoc?.workCanceledAt && !transferDoc?.requestorDownloadedAt) {
    return "작업취소";
  }
  // requestorDownloadedAt = 의뢰수락 시각(레거시 필드명). 파일 다운로드와 무관.
  if (transferDoc?.requestorDownloadedAt && !openPool) return "의뢰수락";
  if (transferDoc?.requestorReadAt && !openPool) return "수신완료";
  if (openPool) return "자동매칭";
  return "발송완료";
};

/**
 * 대시보드 기공 행 버킷.
 * 의뢰←발송완료|수신완료|자동매칭,
 * 수락←의뢰수락 / 거부←거부(수락/거부 카드에 병기),
 * 완료←작업완료 / 취소←작업취소|취소(완료/취소 카드에 병기),
 * 발송←생산진행|포장.발송, 추적관리←추적관리.
 */
export const toPracticeTransferDashboardBucket = (manufacturerStage) => {
  const stage = String(manufacturerStage || "").trim();
  if (
    stage === "발송완료" ||
    stage === "수신완료" ||
    stage === "자동매칭"
  ) {
    return "sent";
  }
  if (stage === "의뢰수락" || stage === "다운로드완료") return "accepted";
  if (stage === "거부") return "rejected";
  if (stage === "작업완료") return "completed";
  if (stage === "작업취소" || stage === "취소") return "canceled";
  if (stage === "생산진행" || stage === "포장.발송") return "shipping";
  if (stage === "추적관리") return "tracking";
  return null;
};

export const emptyPracticeTransferDashboardStats = () => ({
  sent: 0,
  accepted: 0,
  rejected: 0,
  completed: 0,
  canceled: 0,
  shipping: 0,
  tracking: 0,
});
