// related files:
// - web/backend/controllers/requests/common.requests.controller.js
// - web/backend/controllers/admin/adminCommBadges.controller.js
// - web/backend/services/requestDashboardStats.service.js
// - web/frontend/src/pages/admin/requests/AdminRequestMonitoring.tsx
// change-log:
// - 2026-09-03: 헥스 확인용 복사샘플은 PTX designCompletedAt 대기가드 면제(준비 목록 누락 방지).
// - 2026-08-26: 제조사 준비 큐·관리자 모니터링·의뢰 배지 공통 가드 분리.

/**
 * 제조사 가공작업 준비 큐에 올릴 수 있는 건만.
 * SSOT: productModeNe=design_custom_abutment (RequestPage / dashboard requestCount)
 * - 레거시 디자인 mode 제외
 * - PTX 연동 + designCompletedAt 없음 → 기공소 디자인 대기, 제조 준비·관리자 모니터링·의뢰 배지에서 제외
 * - 헥스 확인용 복사샘플은 제조 확인용이라 PTX 디자인 대기와 무관 → 항상 준비 큐 포함
 */
export function buildWorksheetReadyQueueGuard() {
  return {
    $and: [
      {
        $or: [
          { "caseInfos.productMode": { $ne: "design_custom_abutment" } },
          { "caseInfos.productMode": { $exists: false } },
        ],
      },
      {
        $or: [
          { "caseInfos.hexVerificationSample": true },
          { "partnerBilling.relatedPracticeTransferId": null },
          { "partnerBilling.relatedPracticeTransferId": { $exists: false } },
          { designCompletedAt: { $type: "date" } },
        ],
      },
    ],
  };
}

/** 의뢰가 제조사 준비 큐(배지·모니터링) 대상인지 — create/handoff emit 가드 */
export function isWorksheetReadyQueueRequest(requestLike) {
  if (requestLike?.caseInfos?.hexVerificationSample === true) return true;
  const productMode = String(requestLike?.caseInfos?.productMode || "").trim();
  if (productMode === "design_custom_abutment") return false;
  const relatedPtxId =
    requestLike?.partnerBilling?.relatedPracticeTransferId ?? null;
  if (relatedPtxId && !requestLike?.designCompletedAt) return false;
  return true;
}
