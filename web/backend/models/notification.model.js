import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "new-message",
        "new-request-message",
        "message-read",
        "room-status-changed",
        "mention",
        "system",
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    data: {
      roomId: mongoose.Schema.Types.ObjectId,
      requestId: mongoose.Schema.Types.ObjectId,
      messageId: mongoose.Schema.Types.ObjectId,
      senderId: mongoose.Schema.Types.ObjectId,
      senderName: String,
      link: String,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    isEmailSent: {
      type: Boolean,
      default: false,
    },
    isSMSSent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// 사용자별 알림 조회를 위한 인덱스
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
