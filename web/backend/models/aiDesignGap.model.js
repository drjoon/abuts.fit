// 커스텀어벗 AI가 조정값으로 바꾸지 못한 요청. 개발팀이 관리자 홈에서 보고 기능을 더한다.
// related files:
// - web/backend/services/aiDesignGap.service.js
// - web/backend/controllers/ai/customAbutmentDesignChat.controller.js
import mongoose from "mongoose";

const aiDesignGapSchema = new mongoose.Schema(
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
    patientName: { type: String, default: "", trim: true },
    toothNumber: { type: String, default: "", trim: true },
    message: { type: String, default: "", trim: true },
    reply: { type: String, default: "", trim: true },
    /** yes=기공사 수작업으로 전환, no=자동 디자인 유지, 없음=아직 답을 안 함 */
    manualChoice: { type: String, enum: ["yes", "no", null], default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

aiDesignGapSchema.index({ reviewedAt: 1, createdAt: -1 });

export default mongoose.model("AiDesignGap", aiDesignGapSchema);
