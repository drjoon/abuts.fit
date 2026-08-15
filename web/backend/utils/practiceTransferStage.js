// related files:
// - web/backend/utils/practiceTransferAutoMatch.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/services/practiceTransferDashboardStats.service.js
// - web/frontend/src/shared/practice/practiceRecentTransferList.ts
import {
  isAutoMatchMode,
  toAutoMatchApiFields,
} from "./practiceTransferAutoMatch.js";

/**
 * 기공의뢰 manufacturerStage SSOT (UI·대시보드 집계 공통).
 * 생산진행 = 치과 「생산 진행」 컨펌 후(production.confirmedAt).
 */
export const resolvePracticeTransferManufacturerStage = (transferDoc) => {
  const matchingMode = isAutoMatchMode(transferDoc) ? "auto" : "direct";
  const autoFields = toAutoMatchApiFields(transferDoc);
  const production =
    transferDoc?.production && typeof transferDoc.production === "object"
      ? transferDoc.production
      : {};
  const openPool =
    matchingMode === "auto" && Boolean(autoFields.autoMatch?.openPool);

  if (String(transferDoc?.status || "").trim() === "canceled") return "취소";
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
 * 대시보드 기공 행 5칸 버킷.
 * 의뢰←발송완료|수신완료|자동매칭, 수락←의뢰수락, 완료←작업완료,
 * 발송←생산진행|포장.발송, 추적관리←추적관리.
 * 취소/작업취소는 집계 제외(대시보드에 취소 카드 없음).
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
  if (stage === "작업완료") return "completed";
  if (stage === "생산진행" || stage === "포장.발송") return "shipping";
  if (stage === "추적관리") return "tracking";
  return null;
};

export const emptyPracticeTransferDashboardStats = () => ({
  sent: 0,
  accepted: 0,
  completed: 0,
  shipping: 0,
  tracking: 0,
});
