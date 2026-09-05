// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import { Router } from "express";
const router = Router();
import * as userController from "../../controllers/users/user.controller.js";
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
  userController.verifyPhoneVerification,
);

// 알림 설정 조회
router.get("/notification-settings", userController.getNotificationSettings);

// 알림 설정 수정
router.put("/notification-settings", userController.updateNotificationSettings);

// 최근 대시보드 경로
router.get("/last-dashboard-path", userController.getLastDashboardPath);
router.put("/last-dashboard-path", userController.updateLastDashboardPath);

// 계정(개인) 데스크톱 사이드바 펼침
router.get("/sidebar-open", userController.getSidebarOpen);
router.put("/sidebar-open", userController.updateSidebarOpen);

// 기공의뢰수신 캘린더 날짜 뱃지(주문일/치과도착일)
router.get(
  "/lab-receive-calendar-date-key",
  userController.getLabReceiveCalendarDateKey,
);
router.put(
  "/lab-receive-calendar-date-key",
  userController.updateLabReceiveCalendarDateKey,
);

// 기공의뢰수신 캘린더 숨길 요일
router.get(
  "/lab-receive-calendar-hidden-weekdays",
  userController.getLabReceiveCalendarHiddenWeekdays,
);
router.put(
  "/lab-receive-calendar-hidden-weekdays",
  userController.updateLabReceiveCalendarHiddenWeekdays,
);

// 플랫폼 가이드투어 (치과·기공소 1회)
router.put("/guide-tour", userController.updateGuideTour);

// 내 보안 로그 (로그인 기록 등)
router.get("/security-logs", userController.getMySecurityLogs);

export default router;
