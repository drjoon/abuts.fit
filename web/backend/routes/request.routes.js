import express from "express";
const router = express.Router();
import requestController from "../controllers/request.controller.js";
import * as cncEventController from "../controllers/cncEvent.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

// 새 의뢰 생성 (의뢰자만 가능)
router.post(
  "/",
  authorize(["requestor", "admin"], { requestorRoles: ["owner", "staff"] }),
  requestController.createRequest,
);

// Draft에서 의뢰 생성 (의뢰자만 가능)
router.post(
  "/from-draft",
  authorize(["requestor", "admin"], { requestorRoles: ["owner", "staff"] }),
  requestController.createRequestsFromDraft,
);

// 모든 의뢰 목록 조회 (테스트 코드와 일치시키기 위해 기본 경로 추가)
router.get("/", (req, res) => {
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
  authorize(["manufacturer", "admin"]),
  requestController.getAllRequests,
);

// 내 의뢰 목록 조회 (의뢰자용)
router.get(
  "/my",
  authorize(["requestor", "admin"], { requestorRoles: ["owner", "staff"] }),
  requestController.getMyRequests,
);

// 내 대시보드 요약 (의뢰자용)
router.get(
  "/my/dashboard-summary",
  authorize(["requestor", "admin"], { requestorRoles: ["owner", "staff"] }),
  requestController.getMyDashboardSummary,
);

// 내 발송 패키지 요약 (의뢰자용)
router.get(
  "/my/shipping-packages",
  authorize(["requestor", "admin"], { requestorRoles: ["owner", "staff"] }),
  requestController.getMyShippingPackagesSummary,
);

// 지연 위험 요약 (제조사/관리자용)
router.get(
  "/dashboard-risk-summary",
  authorize(["manufacturer", "admin"]),
  requestController.getDashboardRiskSummary,
);

// 가격/리퍼럴 통계 (의뢰자용)
router.get(
  "/my/pricing-referral-stats",
  authorize(["requestor", "admin"], { requestorRoles: ["owner", "staff"] }),
  requestController.getMyPricingReferralStats,
);

// 동일 환자/치아 커스텀 어벗 의뢰 존재 여부 확인 (재의뢰 판단용)
router.get(
  "/my/has-duplicate",
  authorize(["requestor", "admin"], { requestorRoles: ["owner", "staff"] }),
  requestController.hasDuplicateCase,
);

// 동일 치과/환자/치아 조합 중복 여부 확인 (의뢰 작성 중 검증용)
router.get(
  "/my/check-duplicate",
  authorize(["requestor", "admin"], { requestorRoles: ["owner", "staff"] }),
  requestController.checkDuplicateCaseInfo,
);

// 묶음 배송 후보 조회 (의뢰자용)
router.get(
  "/my/bulk-shipping",
  authorize(["requestor", "admin"], { requestorRoles: ["owner", "staff"] }),
  requestController.getMyBulkShipping,
);

// 배송 도착일/출고일 계산 (공용)
router.get(
  "/shipping-estimate",
  authorize(["requestor", "manufacturer", "admin"]),
  requestController.getShippingEstimate,
);

// 배송 방식 변경 (의뢰자용)
router.patch(
  "/my/shipping-mode",
  authorize(["requestor", "admin"], { requestorRoles: ["owner", "staff"] }),
  requestController.updateMyShippingMode,
);

// 최대 직경별 통계 (공용: 의뢰인=본인, 제조사/관리자=전체)
router.get(
  "/diameter-stats",
  authorize(["requestor", "manufacturer", "admin"]),
  requestController.getDiameterStats,
);

// 묶음 배송 생성/신청 (의뢰자용)
router.post(
  "/my/bulk-shipping",
  authorize(["requestor", "admin"], { requestorRoles: ["owner", "staff"] }),
  requestController.createMyBulkShipping,
);

// 의뢰 상세 조회 (권한 검증은 컨트롤러에서 처리)
router.get("/:id", requestController.getRequestById);

// 의뢰 수정 (권한 검증은 컨트롤러에서 처리)
router.put("/:id", requestController.updateRequest);

// 의뢰 상태 변경 (권한 검증은 컨트롤러에서 처리)
router.patch("/:id/status", requestController.updateRequestStatus);

// 제조사/관리자: 단계별 검토 상태 변경
router.patch(
  "/:id/review-status",
  authorize(["manufacturer", "admin"]),
  requestController.updateReviewStatusByStage,
);

// 제조사/관리자: CNC 이벤트 조회 (의뢰 단위)
router.get(
  "/:requestId/cnc-events",
  authorize(["manufacturer", "admin"]),
  cncEventController.getCncEventsByRequestId,
);

// 제조사/관리자: NC 파일을 브리지 스토리지로 동기화 (가공카드 코드 보기용)
router.post(
  "/by-request/:requestId/nc-file/ensure-bridge",
  authorize(["manufacturer", "admin"]),
  requestController.ensureNcFileOnBridgeStoreByRequestId,
);

// 제조사/관리자: 원본 STL 다운로드 URL
router.get(
  "/:id/original-file-url",
  authorize(["manufacturer", "admin"]),
  requestController.getOriginalFileUrl,
);

// 제조사/관리자: CAM STL 다운로드 URL
router.get(
  "/:id/cam-file-url",
  authorize(["manufacturer", "admin"]),
  requestController.getCamFileUrl,
);

// 제조사/관리자: 원본 STL 다운로드 URL
router.get(
  "/:id/stl-file-url",
  authorize(["manufacturer", "admin"]),
  requestController.getStlFileUrl,
);

// 제조사/관리자: CAM 결과 업로드 메타 저장 및 상태 전환
router.post(
  "/:id/cam-file",
  authorize(["manufacturer", "admin"]),
  requestController.saveCamFileAndCompleteCam,
);

// 제조사/관리자: CAM 결과 파일 삭제 및 상태 롤백
router.delete(
  "/:id/cam-file",
  authorize(["manufacturer", "admin"]),
  requestController.deleteCamFileAndRollback,
);

// 제조사/관리자: NC 파일 다운로드 URL
router.get(
  "/:id/nc-file-url",
  authorize(["manufacturer", "admin"]),
  requestController.getNcFileUrl,
);

// 제조사/관리자: stageFiles(이미지 등) 다운로드 URL
router.get(
  "/:id/stage-file-url",
  authorize(["manufacturer", "admin"]),
  requestController.getStageFileUrl,
);

// 제조사/관리자: stageFiles(이미지 등) 업로드 메타 저장
router.post(
  "/:id/stage-file",
  authorize(["manufacturer", "admin"]),
  requestController.saveStageFile,
);

// 제조사/관리자: stageFiles(이미지 등) 삭제
router.delete(
  "/:id/stage-file",
  authorize(["manufacturer", "admin"]),
  requestController.deleteStageFile,
);

// 제조사/관리자: NC 파일 업로드 메타 저장 (가공 단계 이동)
router.post(
  "/:id/nc-file",
  authorize(["manufacturer", "admin"]),
  requestController.saveNcFileAndMoveToMachining,
);

// 제조사/관리자: NC 파일 삭제 (CAM 단계 롤백)
router.delete(
  "/:id/nc-file",
  authorize(["manufacturer", "admin"]),
  requestController.deleteNcFileAndRollbackCam,
);

// 의뢰를 Draft로 복제 (의뢰자/관리자)
router.post(
  "/:id/clone-to-draft",
  authorize(["requestor", "admin"]),
  requestController.cloneRequestToDraft,
);

// 의뢰 삭제 (권한 검증은 컨트롤러에서 처리)
router.delete("/:id", requestController.deleteRequest);

export default router;
