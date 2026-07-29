// related files:
// - web/backend/controllers/chats/chat.controller.js
// - web/backend/modules/chat/chat.routes.js
// - web/backend/models/chat.model.js
// - web/frontend/src/shared/hooks/useChatRooms.ts
import mongoose from "mongoose";

const chatRoomSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    roomType: {
      type: String,
      enum: ["direct", "group"],
      default: "direct",
    },
    title: {
      type: String,
      default: "",
    },
    relatedRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Request",
      default: null,
    },
    relatedPracticeTransferId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PracticeTransfer",
      default: null,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["active", "suspended", "monitored"],
      default: "active",
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// 참여자 조합 중복 방지를 위한 인덱스
chatRoomSchema.index({ participants: 1 });

// 특정 사용자가 참여한 채팅방 조회를 위한 인덱스
chatRoomSchema.index({ participants: 1, isArchived: 1, lastMessageAt: -1 });

// practice 전송 기준 채팅방 조회 최적화
chatRoomSchema.index({ relatedPracticeTransferId: 1, isArchived: 1 });

const ChatRoom = mongoose.model("ChatRoom", chatRoomSchema);

export default ChatRoom;
