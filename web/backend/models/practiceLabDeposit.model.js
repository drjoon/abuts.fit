// related files:
// - web/backend/services/practiceObBilling.service.js
// - web/backend/controllers/credits/practiceOpenBanking.controller.js
// - web/frontend/src/features/settings/tabs/PracticeObBillingTab.tsx
import mongoose from "mongoose";

/**
 * 치과 → 개별 기공소(어벗츠기공소 포함) 보증금 직접 이체 기록.
 * 월 이용 금액 1천만원 초과 치과가 대상(영업 담당자 안내). 플랫폼은 보증금을 보관하지 않는다.
 * 이체 인증은 오픈뱅킹 + 생체인증(Face ID/지문).
 */
const practiceLabDepositSchema = new mongoose.Schema(
  {
    practiceAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      required: true,
      index: true,
    },
    labAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      required: true,
      index: true,
    },
    labName: { type: String, default: "", trim: true },
    amount: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ["TRANSFERRED", "FAILED", "RETURNED"],
      default: "TRANSFERRED",
      index: true,
    },
    failureReason: { type: String, default: "" },
    obTxId: { type: String, default: "" },
    transferredAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export default mongoose.models.PracticeLabDeposit ||
  mongoose.model("PracticeLabDeposit", practiceLabDepositSchema);
