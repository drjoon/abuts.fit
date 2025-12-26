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
