// related files:
// - web/backend/utils/practiceTransferAutoMatch.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/services/practiceTransferDashboardStats.service.js
// - web/frontend/src/shared/practice/practiceRecentTransferList.ts
// - 2026-08-25: status deleted=치과 의뢰 삭제(휴지통). canceled=레거시 동일. 기공소 작업취소는 workCanceledAt.
// - 2026-08-15: 대시보드 버킷에 거부 추가. 수락/거부·완료/취소 병기.
// - 2026-08-16: 공개풀 decline의 labRejectedAt은 미배정 취소 시 「취소」(거부 아님).
// - 2026-08-16: 자동매칭 재공개(openPool)는 작업취소보다 우선 → 「자동매칭」.
// - 2026-08-18: 수락 전(의뢰) 내용 수정 게이트 canEditPracticeTransferContent.
// - 2026-08-29: 보철 디자인 업로드(완료)=작업완료. skip 자동 confirmedAt은 출고로 올리지 않음.
// - 2026-08-29: 출고=연동 CA 포장.발송·택배. 디자인=어벗 designFiles 또는 보철 resultFiles.
import {
  isAutoMatchMode,
  toAutoMatchApiFields,
} from "./practiceTransferAutoMatch.js";

/**
 * 치과 의뢰 삭제(휴지통).
 * - status=deleted (신규)
 * - status=canceled (레거시 휴지통 — 기공소 작업취소와 무관)
 * 기공소 작업취소는 status를 바꾸지 않고 workCanceledAt만 둔다.
 */
export const PRACTICE_TRANSFER_DELETED_STATUSES = ["deleted", "canceled"];

export const isPracticeTransferDeletedStatus = (status) => {
  const s = String(status || "").trim().toLowerCase();
  return s === "deleted" || s === "canceled" || s === "cancelled";
};

export const practiceTransferNotDeletedMongoFilter = () => ({
  status: { $nin: PRACTICE_TRANSFER_DELETED_STATUSES },
});

export const practiceTransferDeletedMongoFilter = () => ({
  status: { $in: PRACTICE_TRANSFER_DELETED_STATUSES },
});

/** 연동 CA 제조 공정·택배 — 출고(생산진행)로 보는 단계 */
const PRACTICE_TRANSFER_OUTBOUND_MANUFACTURER_STAGES = new Set([
  "포장.발송",
  "발송",
  "추적관리",
  "shipping",
  "tracking",
]);

/**
 * 연동 커스텀어벗이 제조사 포장.발송·택배 단계인지.
 * @param {object|null|undefined} abutmentDeliveryInfo mapAbutmentDeliveryByTransferDocs 요약
 */
export const isPracticeTransferAbutmentOutbound = (abutmentDeliveryInfo) => {
  const di =
    abutmentDeliveryInfo && typeof abutmentDeliveryInfo === "object"
      ? abutmentDeliveryInfo
      : null;
  if (!di) return false;
  if (di.shippedAt || di.pickedUpAt || di.deliveredAt) return true;
  if (String(di.tracking?.lastStatusText || "").trim()) return true;
  const stages = Array.isArray(di.manufacturerStages)
    ? di.manufacturerStages
    : [];
  return stages.some((stage) =>
    PRACTICE_TRANSFER_OUTBOUND_MANUFACTURER_STAGES.has(String(stage || "").trim()),
  );
};

/** 어벗 디자인(designFiles) 또는 보철(resultFiles) 업로드 여부 */
export const practiceTransferHasDesignOrResultFiles = (transferDoc) => {
  const production =
    transferDoc?.production && typeof transferDoc.production === "object"
      ? transferDoc.production
      : {};
  const designFiles = Array.isArray(production.designFiles)
    ? production.designFiles
    : Array.isArray(transferDoc?.designFiles)
      ? transferDoc.designFiles
      : [];
  const resultFiles = Array.isArray(transferDoc?.resultFiles)
    ? transferDoc.resultFiles
    : [];
  const designCount = Math.max(
    designFiles.length,
    Number(production.designFileCount || transferDoc?.designFileCount || 0) || 0,
  );
  const resultCount = Math.max(
    resultFiles.length,
    Number(transferDoc?.resultFileCount || 0) || 0,
  );
  return (
    designCount > 0 ||
    resultCount > 0 ||
    Boolean(production.designReadyAt || transferDoc?.designReadyAt)
  );
};

/**
 * 기공의뢰 manufacturerStage SSOT (UI·대시보드 집계 공통).
 * - 출고(생산진행): 연동 CA 포장.발송·택배, 또는 치과 수동 생산진행(skipDesignConfirm=false)
 * - 디자인(작업완료): 어벗 designFiles 또는 보철 resultFiles 업로드(수락 후)
 * @param {object} transferDoc
 * @param {{ viewerLabAnchorId?: string|null, abutmentDeliveryInfo?: object|null }} [options]
 */
export const resolvePracticeTransferManufacturerStage = (
  transferDoc,
  { viewerLabAnchorId = null, abutmentDeliveryInfo = null } = {},
) => {
  const matchingMode = isAutoMatchMode(transferDoc) ? "auto" : "direct";
  const autoFields = toAutoMatchApiFields(transferDoc, viewerLabAnchorId);
  const production =
    transferDoc?.production && typeof transferDoc.production === "object"
      ? transferDoc.production
      : {};
  const openPool = Boolean(autoFields.autoMatch?.openPool);
  const viewerId = String(viewerLabAnchorId || "").trim();
  const declinedByViewer = Boolean(autoFields.autoMatch?.declinedByMe);
  const rejectedByViewer =
    Boolean(viewerId) &&
    String(transferDoc?.labRejectedByLabAnchorId || "").trim() === viewerId &&
    Boolean(transferDoc?.labRejectedAt);

  if (declinedByViewer || rejectedByViewer) return "거부";

  const status = String(transferDoc?.status || "").trim();
  // 치과 삭제(휴지통). 지정/배정 거부 흔적(labRejectedAt)이 있으면 발신 치과 「거부」.
  // 공개 풀 decline도 labRejectedAt을 남기므로, 미배정 자동매칭 삭제는 휴지통「취소」로 본다.
  if (isPracticeTransferDeletedStatus(status)) {
    if (transferDoc?.labRejectedAt) {
      const hasAssignee = Boolean(
        String(transferDoc?.targetLabAnchorId || "").trim(),
      );
      if (hasAssignee || matchingMode !== "auto") return "거부";
    }
    return "취소";
  }

  const delivery =
    abutmentDeliveryInfo ??
    (transferDoc?.abutmentDeliveryInfo &&
    typeof transferDoc.abutmentDeliveryInfo === "object"
      ? transferDoc.abutmentDeliveryInfo
      : null);
  // 제조사 포장.발송·택배 기록이 있으면 출고(UI「출고」)
  if (isPracticeTransferAbutmentOutbound(delivery)) return "생산진행";

  const hasDesignOrResult = practiceTransferHasDesignOrResultFiles(transferDoc);
  const accepted = Boolean(transferDoc?.requestorDownloadedAt);
  // 어벗·보철 디자인 파일 업로드(수락 후) 또는 작업완료 → 디자인
  if (
    accepted &&
    (autoFields.autoMatch?.completed || hasDesignOrResult)
  ) {
    // 치과 수동 생산진행(컨펌 생략 OFF)만 출고. skip 자동 confirmedAt은 디자인 유지.
    if (
      production?.confirmedAt &&
      production?.skipDesignConfirm === false &&
      autoFields.autoMatch?.completed
    ) {
      return "생산진행";
    }
    return "작업완료";
  }

  if (production?.confirmedAt && production?.skipDesignConfirm === false) {
    return "생산진행";
  }

  // 자동매칭 공개 풀(작업취소 재공개 포함) — 치과·타 기공소에는 「자동매칭」
  // 레거시 자동매칭 공개 풀 — 치과·타 기공소 「자동매칭」
  if (matchingMode === "auto" && openPool) return "자동매칭";
  // 어벗츠 하청 풀 — 인증 기공소 수신함만 「하청대기」(치과·원청은 지정 의뢰 단계 유지)
  if (openPool && viewerId && !autoFields.autoMatch?.mine) return "하청대기";
  // 지정 기공소 작업취소·수락전 거부(활성 유지) — 치과 「취소」 뱃지
  if (transferDoc?.workCanceledAt && !transferDoc?.requestorDownloadedAt) {
    return "작업취소";
  }
  // requestorDownloadedAt = 의뢰수락 시각(레거시 필드명). 파일 다운로드와 무관.
  if (transferDoc?.requestorDownloadedAt) return "의뢰수락";
  if (transferDoc?.requestorReadAt) return "수신완료";
  return "발송완료";
};

/** 치과가 전송 내용을 수정할 수 있는 단계 — 의뢰(발송완료|수신완료|자동매칭). 수락·취소·거부 이후 불가. */
export const canEditPracticeTransferContent = (
  transferDoc,
  options = {},
) => {
  const stage = resolvePracticeTransferManufacturerStage(transferDoc, options);
  return (
    stage === "발송완료" ||
    stage === "수신완료" ||
    stage === "자동매칭" ||
    stage === "하청대기"
  );
};

/**
 * 대시보드 기공 행 버킷.
 * 의뢰←발송완료|수신완료|자동매칭,
 * 수락←의뢰수락 / 거부←거부(수락/거부 카드에 병기),
 * 디자인←작업완료 / 취소←작업취소|취소(디자인/취소 카드에 병기),
 * 출고←생산진행|포장.발송, 추적관리←추적관리.
 */
export const toPracticeTransferDashboardBucket = (manufacturerStage) => {
  const stage = String(manufacturerStage || "").trim();
  if (
    stage === "발송완료" ||
    stage === "수신완료" ||
    stage === "자동매칭" ||
    stage === "하청대기"
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
