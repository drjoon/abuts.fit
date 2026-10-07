// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import mongoose from "mongoose";

const chatSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatRoom",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // user: 일반 말풍선 / system: 상태 변경 기록(작업취소 등). UI는 messageKind로 분기.
    messageKind: {
      type: String,
      enum: ["user", "system"],
      default: "user",
      index: true,
    },
    // system 전용 이벤트 키. 예: work_cancel, awaiting_production_confirm
    systemEvent: {
      type: String,
      default: null,
      trim: true,
      maxlength: 64,
    },
    // system 전용 구조화 payload (후속 보철 toothWorks 등)
    systemPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    content: {
      type: String,
      required: true,
    },
    attachments: [
      {
        fileId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "File",
          default: null,
        },
        fileName: String,
        fileType: String,
        fileSize: Number,
        s3Key: String,
        s3Url: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
        /** true면 클릭 시 이미지 대신 작업 파일(페인트 포함)을 연다. */
        openWorkFiles: {
          type: Boolean,
          default: false,
        },
      },
    ],
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      default: null,
    },
    // 카톡형 간단 리액션 (하트, 엄지척 등). emoji당 사용자 1회.
    reactions: [
      {
        emoji: {
          type: String,
          required: true,
          trim: true,
          maxlength: 16,
        },
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    readBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// 특정 채팅방의 메시지 조회를 위한 인덱스
chatSchema.index({ roomId: 1, createdAt: -1 });

// 미읽음 메시지 조회 최적화를 위한 복합 인덱스
chatSchema.index({ roomId: 1, sender: 1, "readBy.userId": 1 });

// 삭제되지 않은 메시지 조회를 위한 인덱스
chatSchema.index({ roomId: 1, isDeleted: 1, createdAt: -1 });

// S3 프록시 다운로드 권한 조회 — 첨부 s3Key exact match (첨부 없는 메시지는 제외)
chatSchema.index({ "attachments.s3Key": 1 }, { sparse: true });

// 메시지 전송 후 채팅방 lastMessageAt 업데이트
chatSchema.post("save", async function (doc) {
  const ChatRoom = mongoose.model("ChatRoom");
  await ChatRoom.findByIdAndUpdate(doc.roomId, {
    lastMessageAt: doc.createdAt,
  });
});

const Chat = mongoose.model("Chat", chatSchema);

export default Chat;
