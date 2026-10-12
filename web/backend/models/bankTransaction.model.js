// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import mongoose from "mongoose";

const bankTransactionSchema = new mongoose.Schema(
  {
    externalId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    bankCode: { type: String, default: "", index: true },
    accountNumber: { type: String, default: "", index: true },
    tranAmt: { type: Number, required: true, min: 0, index: true },
    printedContent: { type: String, default: "" },
    depositCode: { type: String, default: "", index: true },
    occurredAt: { type: Date, default: null, index: true },

    status: {
      type: String,
      enum: ["NEW", "MATCHED", "IGNORED"],
      default: "NEW",
      index: true,
    },
    chargeOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChargeOrder",
      default: null,
      index: true,
    },
    storeOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StoreOrder",
      default: null,
      index: true,
    },
    // 자동매칭 시 입금자명이 사업자명·대표자명과 다르면 MISMATCH (관리자 수동 확인 필요)
    payerNameCheck: {
      type: String,
      enum: ["", "OK", "MISMATCH", "UNKNOWN"],
      default: "",
    },
    matchedAt: { type: Date, default: null },
    matchedBy: { type: String, enum: ["AUTO", "ADMIN"], default: null },
    matchedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    raw: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

bankTransactionSchema.index({ status: 1, depositCode: 1, tranAmt: 1 });

export default mongoose.model("BankTransaction", bankTransactionSchema);
