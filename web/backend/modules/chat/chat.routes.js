// change-log:
// - 2026-08-10: request-room — 디자인 파트너↔기공소 채팅(DesignPage).
// related files:
// - web/backend/controllers/chats/chat.controller.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/requestor/design/DesignRequestTransferView.tsx
import express from "express";
const router = express.Router();
import chatController from "../../controllers/chats/chat.controller.js";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

// 내 채팅방 목록 조회
router.get("/rooms", chatController.getMyChatRooms);

// 고객지원 채팅방(어벗츠.핏) 조회/생성
router.get("/support-room", chatController.getSupportRoom);

// 모든 채팅방 조회 (Admin 전용)
router.get("/rooms/all", authorize(["admin"]), chatController.getAllChatRooms);

// 의뢰(request) 기준 채팅방 조회/생성 (기공소 의뢰 도메인 전용, non-practice)
router.get(
  "/request-room/:requestId",
  authorize(["requestor", "manufacturer", "admin"]),
  chatController.getOrCreateRequestChatRoom,
);

// legacy 제거: practice의 request-room 경로는 사용하지 않는다.
// practice 채팅은 transfer-room(/api/chats/practice/transfer-room/:transferId)만 SSOT로 사용한다.

// related files:
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// practice 전송(PracticeTransfer) 전용 채팅방 조회/생성
router.get(
  "/practice/transfer-room/:transferId",
  authorize(["practice", "requestor", "admin"]),
  chatController.getOrCreatePracticeTransferChatRoom,
);

// 채팅방 생성 또는 기존 채팅방 조회
router.post("/rooms", chatController.createOrGetChatRoom);

// 사용자 검색 (채팅 상대 찾기)
router.get("/search-users", chatController.searchUsers);

// 특정 채팅방의 메시지 목록 조회
router.get("/rooms/:roomId/messages", chatController.getChatMessages);

// 채팅방에 메시지 전송
router.post("/rooms/:roomId/messages", chatController.sendChatMessage);

// 메시지 리액션 토글 (카톡형)
router.post(
  "/rooms/:roomId/messages/:messageId/reactions",
  chatController.toggleChatMessageReaction,
);

// 채팅방 상태 변경 (Admin 전용)
router.patch(
  "/rooms/:roomId/status",
  authorize(["admin"]),
  chatController.updateChatRoomStatus
);

export default router;
