import mongoose from "mongoose";

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
    depositorName: { type: String, required: true, trim: true, index: true },
    status: {
      type: String,
      enum: ["PENDING", "MATCHED", "EXPIRED", "CANCELED", "AUTO_MATCHED"],
      default: "PENDING",
      index: true,
    },
    adminApprovalStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    adminApprovalNote: { type: String, default: "" },
    adminApprovalAt: { type: Date, default: null },
    adminApprovalBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    adminVerified: { type: Boolean, default: false },
    adminVerifiedAt: { type: Date, default: null },
    adminVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isLocked: { type: Boolean, default: false },
    lockedAt: { type: Date, default: null },
    lockedReason: { type: String, default: "" },
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

chargeOrderSchema.index({
  depositorName: 1,
  status: 1,
  amountTotal: 1,
  expiresAt: 1,
});

export default mongoose.model("ChargeOrder", chargeOrderSchema);
