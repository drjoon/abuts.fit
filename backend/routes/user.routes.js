import { Router } from "express";
const router = Router();
import * as userController from "../controllers/user.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

// 사용자 프로필 조회
router.get("/profile", userController.getProfile);

// 사용자 프로필 수정
router.put("/profile", userController.updateProfile);

// 제조사 목록 조회 (의뢰자, 관리자만 접근 가능)
router.get(
  "/manufacturers",
  authorize(["requestor", "admin"]),
  userController.getManufacturers
);

// 의뢰자 목록 조회 (제조사, 관리자만 접근 가능)
router.get(
  "/requestors",
  authorize(["manufacturer", "admin"]),
  userController.getRequestors
);

// 알림 설정 조회
router.get("/notification-settings", userController.getNotificationSettings);

// 알림 설정 수정
router.put("/notification-settings", userController.updateNotificationSettings);

// 사용자 통계 조회
router.get("/stats", userController.getUserStats);

// 사용자 활동 로그 조회
router.get("/activity-logs", userController.getActivityLogs);

export default router;
