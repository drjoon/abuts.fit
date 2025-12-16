import express from "express";
const router = express.Router();
import notificationController from "../controllers/notification.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

// 내 알림 목록 조회
router.get("/", notificationController.getMyNotifications);

// 알림 읽음 처리
router.patch("/:id/read", notificationController.markNotificationAsRead);

// 모든 알림 읽음 처리
router.patch("/read-all", notificationController.markAllNotificationsAsRead);

// 알림 삭제
router.delete("/:id", notificationController.deleteNotification);

export default router;
