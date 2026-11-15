// 의뢰 치과별 커스텀어벗 AI 디자인 대화 토큰·금액. 한 줄이 Gemini 호출 한 번이다.
// related files:
// - web/backend/services/aiDesignChatUsage.service.js
// - web/backend/controllers/ai/customAbutmentDesignChat.controller.js
import mongoose from "mongoose";

const aiDesignChatUsageSchema = new mongoose.Schema(
  {
    practiceBusinessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    practiceName: { type: String, default: "", trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    transferId: { type: String, default: "", trim: true },
    model: { type: String, default: "", trim: true },
    inputTokens: { type: Number, default: 0 },
    cachedTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    thoughtsTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    costUsdMicros: { type: Number, default: 0 },
    costKrw: { type: Number, default: 0 },
    fxKrwPerUsd: { type: Number, default: 0 },
  },
  { timestamps: true },
);

aiDesignChatUsageSchema.index({ practiceBusinessAnchorId: 1, createdAt: -1 });

export default mongoose.model("AiDesignChatUsage", aiDesignChatUsageSchema);
