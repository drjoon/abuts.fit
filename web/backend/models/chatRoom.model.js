// related files:
// - web/backend/controllers/chats/chat.controller.js
// - web/backend/modules/chat/chat.routes.js
// - web/backend/models/chat.model.js
// - web/frontend/src/shared/hooks/useChatRooms.ts
// change-log:
// - 2026-09-07: 기공소↔치과 파트너 DM — relatedLabAnchorId + relatedPracticeAnchorId (의뢰건 없이).
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
    /** 기공소↔치과 상시 채팅(의뢰건 무관). transfer/request 방과 배타. */
    relatedLabAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    relatedPracticeAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
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

// 기공소↔치과 파트너 DM — 앵커 쌍당 1방
chatRoomSchema.index(
  { relatedLabAnchorId: 1, relatedPracticeAnchorId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      relatedLabAnchorId: { $type: "objectId" },
      relatedPracticeAnchorId: { $type: "objectId" },
      relatedPracticeTransferId: null,
      relatedRequestId: null,
      isArchived: false,
    },
  },
);

const ChatRoom = mongoose.model("ChatRoom", chatRoomSchema);

export default ChatRoom;
