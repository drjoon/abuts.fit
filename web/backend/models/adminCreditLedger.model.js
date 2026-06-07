import mongoose from "mongoose";

const adminCreditLedgerSchema = new mongoose.Schema(
  {
    adminUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["EARN", "PAYOUT", "ADJUST"],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true },
    // 회계 추적 강화: VAT 제외 금액(공급가) / VAT / VAT 포함 지급액을 분리 저장
    amountExcludingVat: { type: Number, default: null },
    vatAmount: { type: Number, default: 0 },
    amountIncludingVat: { type: Number, default: null },
    refType: { type: String, default: "" },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    uniqueKey: { type: String, required: true, unique: true, index: true },
    occurredAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

adminCreditLedgerSchema.index({ adminUserId: 1, occurredAt: -1 });

export default mongoose.model("AdminCreditLedger", adminCreditLedgerSchema);
