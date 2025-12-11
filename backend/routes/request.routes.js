import express from "express";
const router = express.Router();
import requestController from "../controllers/request.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

// 새 의뢰 생성 (의뢰자만 가능)
router.post(
  "/",
  authorize(["requestor", "admin"]),
  requestController.createRequest
);

// Draft에서 의뢰 생성 (의뢰자만 가능)
router.post(
  "/from-draft",
  authorize(["requestor", "admin"]),
  requestController.createRequestsFromDraft
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

// 모든 의뢰 목록 조회 (관리자만 가능)
router.get("/all", authorize(["admin"]), requestController.getAllRequests);

// 내 의뢰 목록 조회 (의뢰자용)
router.get(
  "/my",
  authorize(["requestor", "admin"]),
  requestController.getMyRequests
);

// 내 대시보드 요약 (의뢰자용)
router.get(
  "/my/dashboard-summary",
  authorize(["requestor", "admin"]),
  requestController.getMyDashboardSummary
);

// 동일 환자/치아 커스텀 어벗 의뢰 존재 여부 확인 (재의뢰 판단용)
router.get(
  "/my/has-duplicate",
  authorize(["requestor", "admin"]),
  requestController.hasDuplicateCase
);

// 묶음 배송 후보 조회 (의뢰자용)
router.get(
  "/my/bulk-shipping",
  authorize(["requestor", "admin"]),
  requestController.getMyBulkShipping
);

// 묶음 배송 생성/신청 (의뢰자용)
router.post(
  "/my/bulk-shipping",
  authorize(["requestor", "admin"]),
  requestController.createMyBulkShipping
);

// 의뢰 상세 조회 (권한 검증은 컨트롤러에서 처리)
router.get("/:id", requestController.getRequestById);

// 의뢰 수정 (권한 검증은 컨트롤러에서 처리)
router.put("/:id", requestController.updateRequest);

// 의뢰 상태 변경 (권한 검증은 컨트롤러에서 처리)
router.patch("/:id/status", requestController.updateRequestStatus);

// 의뢰에 메시지 추가 (권한 검증은 컨트롤러에서 처리)
router.post("/:id/messages", requestController.addMessage);

// 의뢰 삭제 (권한 검증은 컨트롤러에서 처리)
router.delete("/:id", requestController.deleteRequest);

export default router;
