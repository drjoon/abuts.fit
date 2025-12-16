import express from "express";
const router = express.Router();
import chatController from "../controllers/chat.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

// 내 채팅방 목록 조회
router.get("/rooms", chatController.getMyChatRooms);

// 고객지원 채팅방(어벗츠.핏) 조회/생성
router.get("/support-room", chatController.getSupportRoom);

// 모든 채팅방 조회 (Admin 전용)
router.get("/rooms/all", authorize(["admin"]), chatController.getAllChatRooms);

// 채팅방 생성 또는 기존 채팅방 조회
router.post("/rooms", chatController.createOrGetChatRoom);

// 사용자 검색 (채팅 상대 찾기)
router.get("/search-users", chatController.searchUsers);

// 특정 채팅방의 메시지 목록 조회
router.get("/rooms/:roomId/messages", chatController.getChatMessages);

// 채팅방에 메시지 전송
router.post("/rooms/:roomId/messages", chatController.sendChatMessage);

// 채팅방 상태 변경 (Admin 전용)
router.patch(
  "/rooms/:roomId/status",
  authorize(["admin"]),
  chatController.updateChatRoomStatus
);

export default router;
