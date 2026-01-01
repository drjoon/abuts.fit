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
      },
    ],
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      default: null,
    },
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

// 메시지 전송 후 채팅방 lastMessageAt 업데이트
chatSchema.post("save", async function (doc) {
  const ChatRoom = mongoose.model("ChatRoom");
  await ChatRoom.findByIdAndUpdate(doc.roomId, {
    lastMessageAt: doc.createdAt,
  });
});

const Chat = mongoose.model("Chat", chatSchema);

export default Chat;
