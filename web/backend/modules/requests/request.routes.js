import express from "express";
const router = express.Router();
import requestController from "../../controllers/requests/request.controller.js";
import * as cncEventController from "../../controllers/cnc/cncEvent.controller.js";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  getQueueStatus,
  enqueueApproval,
} from "../../services/reviewApprovalQueue.service.js";
import Request from "../../models/request.model.js";

// 새 의뢰 생성 (의뢰자만 가능)
router.post(
  "/",
  authenticate,
  authorize(["requestor", "admin"], { subRoles: ["owner", "staff"] }),
  requestController.createRequest,
);

// ===== 신규 의뢰 생성 =====
// SSOT: POST /api/requests/from-draft (Draft 기반 워크플로우)
// Draft에서 의뢰 생성 (의뢰자만 가능)
router.post(
  "/from-draft",
  authenticate,
  authorize(["requestor", "admin"], { subRoles: ["owner", "staff"] }),
  requestController.createRequestsFromDraft,
);

// @deprecated 2026-04-08 이후 사용 금지
// 레거시 엔드포인트: Draft 없이 직접 생성 (기존 코드 호환성을 위해 유지)
// 새 기능 개발 시 /from-draft 사용 권장
// 다건 의뢰 생성 (배치)
router.post(
  "/bulk",
  authenticate,
  authorize(["requestor", "admin"], { subRoles: ["owner", "staff"] }),
  requestController.createRequestsBulk,
);

// 모든 의뢰 목록 조회 (테스트 코드와 일치시키기 위해 기본 경로 추가)
router.get("/", authenticate, (req, res) => {
  const { role } = req.user;
  if (role === "admin") {
    return requestController.getAllRequests(req, res);
  }

  // 그 외 역할(의뢰자 등)은 자신의 의뢰만 조회
  return requestController.getMyRequests(req, res);
});

// 모든 의뢰 목록 조회 (제조사/관리자)
router.get(
  "/all",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.getAllRequests,
);

// 내 의뢰 목록 조회 (의뢰자용)
router.get(
  "/my",
  authenticate,
  authorize(["requestor", "admin"], { subRoles: ["owner", "staff"] }),
  requestController.getMyRequests,
);

// 내 대시보드 요약 (의뢰자용)
router.get(
  "/my/dashboard-summary",
  authenticate,
  authorize(["requestor", "admin"], { subRoles: ["owner", "staff"] }),
  requestController.getMyDashboardSummary,
);

// 대시보드 캐시 강제 무효화 (의뢰자용)
router.post(
  "/my/dashboard-summary/force-refresh",
  authenticate,
  authorize(["requestor", "admin"], { subRoles: ["owner", "staff"] }),
  requestController.forceRefreshMyDashboardSummary,
);

// 제조사 대시보드 요약 (할당된 의뢰 기준)
router.get(
  "/assigned/dashboard-summary",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.getAssignedDashboardSummary,
);

// 내 발송 패키지 요약 (의뢰자용)
router.get(
  "/my/shipping-packages",
  authenticate,
  authorize(["requestor", "admin"], { subRoles: ["owner", "staff"] }),
  requestController.getMyShippingPackagesSummary,
);

// 지연 위험 요약 (제조사/관리자용)
router.get(
  "/dashboard-risk-summary",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.getDashboardRiskSummary,
);

// 가공불가 상태 개요 (5개 role 공통)
router.get(
  "/unmachinable-overview",
  authenticate,
  authorize(["requestor", "manufacturer", "admin", "salesman", "devops"]),
  requestController.getUnmachinableOverview,
);

// 가격/리퍼럴 통계 (의뢰자용)
router.get(
  "/my/pricing-referral-stats",
  authenticate,
  authorize(["requestor", "salesman", "devops", "admin"], {
    subRoles: ["owner", "staff"],
  }),
  requestController.getMyPricingReferralStats,
);

// 리퍼럴 직계 멤버 목록 (의뢰자용)
router.get(
  "/my/referral-direct-members",
  authenticate,
  authorize(["requestor", "salesman", "devops", "admin"], {
    subRoles: ["owner", "staff"],
  }),
  requestController.getMyReferralDirectMembers,
);

// 동일 치과/환자/치아 조합 중복 여부 확인 (의뢰 작성 중 검증용)
router.get(
  "/my/check-duplicate",
  authenticate,
  authorize(["requestor", "admin"], { subRoles: ["owner", "staff"] }),
  requestController.checkDuplicateCaseInfo,
);

// 묶음 배송 후보 조회 (의뢰자용)
router.get(
  "/my/bulk-shipping",
  authenticate,
  authorize(["requestor", "admin"], { subRoles: ["owner", "staff"] }),
  requestController.getMyBulkShipping,
);

// 배송 도착일/출고일 계산 (공용)
router.get(
  "/shipping-estimate",
  authenticate,
  authorize(["requestor", "manufacturer", "admin"]),
  requestController.getShippingEstimate,
);

// 묶음 배송 생성/신청 (의뢰자용)
router.post(
  "/my/bulk-shipping",
  authenticate,
  authorize(["requestor", "admin"], { subRoles: ["owner", "staff"] }),
  requestController.createMyBulkShipping,
);

// 발송 처리 (운송장 등록)
router.post(
  "/shipping/register",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.registerShipment,
);

// 우편함 전체 롤백 (포장.발송 → 세척.패킹)
router.post(
  "/shipping/mailbox-rollback",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.rollbackMailboxShipping,
);

router.post(
  "/shipping/mailbox-force-today",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.setMailboxForceTodayShipment,
);

router.post(
  "/shipping/mailbox-reset-working-state",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.resetMailboxShippingWorkingState,
);

router.get(
  "/shipping/mailbox-summary",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.getShippingMailboxSummary,
);

router.get(
  "/shipping/mailbox-requests",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.getShippingMailboxRequests,
);

// 한진 운송장 출력 (메일박스 기준)
router.post(
  "/shipping/hanjin/print-labels",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.printHanjinLabels,
);

router.get(
  "/shipping/hanjin/customer-check",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.validateHanjinCustomerCheck,
);

// 한진 택배 수거 접수
router.post(
  "/shipping/hanjin/pickup",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.requestHanjinPickup,
);

router.post(
  "/shipping/hanjin/pickup-and-print",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.requestHanjinPickupAndPrint,
);

// 한진 택배 수거 접수 취소
router.post(
  "/shipping/hanjin/pickup-cancel",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.cancelHanjinPickup,
);

router.post(
  "/shipping/hanjin/manual-pickup-complete",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.manualHanjinPickupCompleted,
);

// backward compatibility
router.post(
  "/shipping/hanjin/mock-pickup-complete",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.mockHanjinPickupCompleted,
);

// 패킹 라벨 프린터 목록 조회 (pack-server 프록시)
router.get(
  "/packing/printers",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.getPackPrinters,
);

router.get(
  "/packing/print-settings",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.getPackPrintSettings,
);

// 패킹 라벨 출력 (pack-server 프록시)
router.post(
  "/packing/print-zpl",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.printPackZpl,
);

// 패킹 라벨 출력 (pack-server 프록시)
router.post(
  "/packing/print-packing-label",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.printPackPackingLabel,
);

router.get(
  "/shipping/wbl/print-settings",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.getWblPrintSettings,
);

router.get(
  "/shipping/wbl/printers",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.getWblPrinters,
);

router.post(
  "/shipping/wbl/print-png",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.wblPrintPng,
);

// 제조사/관리자: 가공불가 사유 옵션 목록 조회/저장
router.get(
  "/rnd-unmachinable-reasons",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.getRndUnmachinableReasonOptions,
);

router.put(
  "/rnd-unmachinable-reasons",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.saveRndUnmachinableReasonOptions,
);

// 의뢰자/관리자: 가공불가 판정 전체 읽음(확인) 처리
router.patch(
  "/my/rnd-unmachinable/confirm-all",
  authenticate,
  authorize(["requestor", "admin"], { subRoles: ["owner", "staff"] }),
  requestController.confirmAllRndUnmachinableByRequestor,
);

// 의뢰자/관리자: 단건 가공불가 판정 읽음(확인) 처리
router.patch(
  "/:id/rnd-unmachinable/confirm",
  authenticate,
  authorize(["requestor", "admin"], { subRoles: ["owner", "staff"] }),
  requestController.confirmRndUnmachinableByRequestor,
);

// 의뢰 상세 조회 (권한 검증은 컨트롤러에서 처리)
router.get("/:id", authenticate, requestController.getRequestById);

// 의뢰 수정 (권한 검증은 컨트롤러에서 처리)
router.put("/:id", authenticate, requestController.updateRequest);

// 의뢰 상태 변경 (권한 검증은 컨트롤러에서 처리)
router.patch(
  "/:id/status",
  authenticate,
  requestController.updateRequestStatus,
);

// 제조사/관리자: 단계별 검토 상태 변경
router.patch(
  "/:id/review-status",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.updateReviewStatusByStage,
);

router.patch(
  "/:id/rnd-done",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.updateRndDoneStatus,
);

router.patch(
  "/:id/rnd-unmachinable",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.updateRndUnmachinableStatus,
);

router.patch(
  "/:id/rnd-hex-rotation",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.updateRndHexRotation,
);

router.patch(
  "/:id/rnd-memo",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.updateRndMemo,
);

// 제조사/관리자: CNC 이벤트 조회 (의뢰 단위)
router.get(
  "/:requestId/cnc-events",
  authenticate,
  authorize(["manufacturer", "admin"]),
  cncEventController.getCncEventsByRequestId,
);

// 제조사/관리자: NC 파일을 브리지 스토리지로 동기화 (가공카드 코드 보기용)
router.post(
  "/by-request/:requestId/nc-file/ensure-bridge",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.ensureNcFileOnBridgeStoreByRequestId,
);

// 제조사/관리자: NC 파일 재생성 트리거 (Esprit force 재처리)
router.post(
  "/by-request/:requestId/nc-file/regenerate",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.regenerateNcByRequestId,
);

// 제조사/관리자: requestId로 케이스 요약 조회 (치아번호/최대직경 등)
router.get(
  "/by-request/:requestId/summary",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.getRequestSummaryByRequestId,
);

// 제조사/관리자: 자주검사 측정장비 옵션 조회
router.get(
  "/self-inspection/instruments",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.getSelfInspectionInstrumentOptions,
);

// 제조사/관리자: 자주검사 측정장비 옵션 저장(추가/삭제)
router.put(
  "/self-inspection/instruments",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.saveSelfInspectionInstrumentOptions,
);

// 제조사/관리자: 자주검사 성적서 조회
router.get(
  "/by-request/:requestId/self-inspection",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.getSelfInspectionByRequestId,
);

// 제조사/관리자: requestId 기반 커넥션 스펙 조회
router.get(
  "/by-request/:requestId/connection-spec",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.getConnectionSpecByRequestId,
);

// 제조사/관리자: 자주검사 성적서 저장 (확정)
router.post(
  "/by-request/:requestId/self-inspection",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.saveSelfInspectionByRequestId,
);

// 제조사/관리자: 원본 STL 다운로드 URL
router.get(
  "/:id/original-file-url",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.getOriginalFileUrl,
);

// 제조사/관리자: CAM STL 다운로드 URL
router.get(
  "/:id/cam-file-url",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.getCamFileUrl,
);

// 제조사/관리자: 원본 STL 다운로드 URL
router.get(
  "/:id/stl-file-url",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.getStlFileUrl,
);

// 제조사/관리자: CAM 결과 업로드 메타 저장 및 상태 전환
router.post(
  "/:id/cam-file",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.saveCamFileAndCompleteCam,
);

// 제조사/관리자: CAM 결과 파일 삭제 및 상태 롤백
router.delete(
  "/:id/cam-file",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.deleteCamFileAndRollback,
);

// 제조사/관리자: NC 파일 다운로드 URL

// 2026-06-08: NC 재생성 - Two-Phase가 기본값, One-Phase는 명시적 요청 시에만 사용
// 제조사/관리자: requestId 기반 NC 재생성 트리거 (Two-Phase 기본)
router.post(
  "/by-request/:requestId/nc-file/regenerate",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.regenerateNcByRequestIdTwoPhase,
);
// 하위호환: 기존 regenerate-2phase 경로도 Two-Phase로 동일하게 동작
router.post(
  "/by-request/:requestId/nc-file/regenerate-2phase",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.regenerateNcByRequestIdTwoPhase,
);
// 제조사/관리자: requestId 기반 One-Phase NC 재생성 (명시적 요청 시)
router.post(
  "/by-request/:requestId/nc-file/regenerate-onephase",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.regenerateNcByRequestIdOnePhase,
);
router.get(
  "/:id/nc-file-url",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.getNcFileUrl,
);

// 제조사/관리자: stageFiles(이미지 등) 다운로드 URL
router.get(
  "/:id/stage-file-url",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.getStageFileUrl,
);

// 제조사/관리자: stageFiles(이미지 등) 업로드 메타 저장
router.post(
  "/:id/stage-file",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.saveStageFile,
);

// 제조사/관리자: stageFiles(이미지 등) 삭제
router.delete(
  "/:id/stage-file",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.deleteStageFile,
);

// 제조사/관리자: NC 파일 업로드 메타 저장 (가공 단계 이동)
router.post(
  "/:id/nc-file",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.saveNcFileAndMoveToMachining,
);

// 제조사/관리자: NC 파일 삭제 (CAM 단계 롤백)
router.delete(
  "/:id/nc-file",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.deleteNcFileAndRollbackCam,
);

// 의뢰를 Draft로 복제 (의뢰자/관리자)
router.post(
  "/:id/clone-to-draft",
  authenticate,
  authorize(["requestor", "admin"]),
  requestController.cloneRequestToDraft,
);

// 제조사/관리자: 승인 직렬 큐 상태 조회 (모니터링용)
router.get(
  "/approval-queue/status",
  authenticate,
  authorize(["manufacturer", "admin"]),
  async (req, res) => {
    try {
      const status = await getQueueStatus();
      return res.status(200).json({ success: true, data: status });
    } catch (err) {
      return res
        .status(500)
        .json({ success: false, message: err?.message || "큐 상태 조회 실패" });
    }
  },
);

// 관리자: 의뢰 Esprit 트리거 수동 재시도 (큐 stuck 복구용)
router.post(
  "/approval-queue/retry-esprit",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const { requestIds } = req.body || {};
      if (!Array.isArray(requestIds) || requestIds.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "requestIds 배열이 필요합니다." });
      }
      const results = [];
      for (const requestId of requestIds) {
        const request = await Request.findOne({ requestId }).lean();
        if (!request) {
          results.push({
            requestId,
            ok: false,
            message: "의뢰를 찾을 수 없습니다.",
          });
          continue;
        }
        try {
          const result = await enqueueApproval({
            taskType: "REQUEST_STAGE_APPROVED",
            request,
            actorUserId: String(req.user._id),
          });
          results.push({ requestId, ok: true, ...result });
        } catch (err) {
          results.push({ requestId, ok: false, message: err?.message });
        }
      }
      return res.status(200).json({ success: true, data: results });
    } catch (err) {
      return res
        .status(500)
        .json({ success: false, message: err?.message || "재시도 실패" });
    }
  },
);

// 추적관리 재제작 복사 (선택 공정으로 다건 복사)
// - legacy 경로(/recall-clone)와 신규 경로(/remake-clone)를 모두 지원
const remakeCloneMiddleware = [
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.cloneRequestsForRecall,
];
router.post("/recall-clone", ...remakeCloneMiddleware);
router.post("/remake-clone", ...remakeCloneMiddleware);

// 의뢰 삭제 (권한 검증은 컨트롤러에서 처리)
router.delete("/:id", authenticate, requestController.deleteRequest);

// 내부 샘플 복사 (추적관리 완료 건을 제조사 테스트용으로 복사)
// - 기존 의뢰건은 완료 상태 유지
// - 복사본은 크레딧/수수료 미처리, 세척.패킹까지만 진행 가능
router.post(
  "/:id/clone-as-sample",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.cloneAsSample,
);

router.post(
  "/:id/clone-from-sample-to-request",
  authenticate,
  authorize(["manufacturer", "admin"]),
  requestController.cloneFromSampleToRequest,
);

export default router;
