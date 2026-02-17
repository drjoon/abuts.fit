import { Router } from "express";
const router = Router();
import * as userController from "../../controllers/user.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

// 사용자 프로필 조회
router.get("/profile", userController.getProfile);

// 사용자 프로필 수정
router.put("/profile", userController.updateProfile);

// 전화번호 인증번호 발송
router.post("/phone-verification/send", userController.sendPhoneVerification);

// 전화번호 인증번호 확인
router.post(
  "/phone-verification/verify",
  userController.verifyPhoneVerification
);

// 알림 설정 조회
router.get("/notification-settings", userController.getNotificationSettings);

// 알림 설정 수정
router.put("/notification-settings", userController.updateNotificationSettings);

// 내 보안 로그 (로그인 기록 등)
router.get("/security-logs", userController.getMySecurityLogs);

export default router;
