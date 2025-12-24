import mongoose from "../mongoose.js";

const chargeOrderSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RequestorOrganization",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    depositCode: { type: String, required: true, trim: true, index: true },
    status: {
      type: String,
      enum: ["PENDING", "MATCHED", "EXPIRED", "CANCELED"],
      default: "PENDING",
      index: true,
    },
    supplyAmount: { type: Number, required: true, min: 0 },
    vatAmount: { type: Number, required: true, min: 0 },
    amountTotal: { type: Number, required: true, min: 0, index: true },
    expiresAt: { type: Date, required: true, index: true },

    bankTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BankTransaction",
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
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

chargeOrderSchema.index({
  depositCode: 1,
  status: 1,
  amountTotal: 1,
  expiresAt: 1,
});

export default mongoose.model("ChargeOrder", chargeOrderSchema);
