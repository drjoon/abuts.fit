// related files:
// - web/backend/controllers/practiceTransfers/practiceTransferBookmark.controller.js
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/frontend/src/shared/components/practice/PracticeTransferBookmarkControl.tsx
// - 2026-09-14: 의뢰 북마크 — 유저별 별도 컬렉션(전기간 순회·목록 스캔 회피).
import mongoose from "mongoose";

const practiceTransferBookmarkSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /** send=치과 발신, receive=기공소 수신 */
    side: {
      type: String,
      enum: ["send", "receive"],
      required: true,
      index: true,
    },
    transferMongoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PracticeTransfer",
      required: true,
      index: true,
    },
    transferId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
  },
  { timestamps: true },
);

practiceTransferBookmarkSchema.index(
  { userId: 1, transferMongoId: 1 },
  { unique: true },
);
practiceTransferBookmarkSchema.index({ userId: 1, side: 1, createdAt: -1 });

export default mongoose.model(
  "PracticeTransferBookmark",
  practiceTransferBookmarkSchema,
);
