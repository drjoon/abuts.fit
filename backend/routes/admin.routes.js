import { Router } from "express";
const router = Router();
import adminController from "../controllers/admin.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

// 모든 라우트에 인증 및 관리자 권한 확인 미들웨어 적용
router.use(authenticate);
router.use(authorize(["admin"]));

// 사용자 관리
router.get("/users", adminController.getAllUsers);
router.get("/users/:id", adminController.getUserById);
router.put("/users/:id", adminController.updateUser);
router.delete("/users/:id", adminController.deleteUser); // 사용자 삭제 추가
router.patch("/users/:id/toggle-active", adminController.toggleUserActive);
router.patch("/users/:id/change-role", adminController.changeUserRole);

// 의뢰 관리
router.get("/requests", adminController.getAllRequests); // 모든 의뢰 조회
router.get("/requests/:id", adminController.getRequestById); // 의뢰 상세 조회
router.patch("/requests/:id/status", adminController.updateRequestStatus); // 의뢰 상태 변경
router.patch("/requests/:id/assign", adminController.assignManufacturer); // 제조사 할당

// 대시보드 통계
router.get("/dashboard", adminController.getDashboardStats);

// 가격/리퍼럴 정책 통계
router.get("/pricing-stats", adminController.getPricingStats);
router.get("/pricing-stats/users", adminController.getPricingStatsByUser);

// 시스템 로그
router.get("/logs", adminController.getSystemLogs);

// 활동 로그
router.get("/activity-logs", adminController.getActivityLogs); // 활동 로그 조회

// 시스템 설정
router.get("/settings", adminController.getSystemSettings);
router.put("/settings", adminController.updateSystemSettings); // 시스템 설정 업데이트

export default router;
