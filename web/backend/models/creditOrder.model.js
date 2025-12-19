import mongoose from "mongoose";

const creditOrderSchema = new mongoose.Schema(
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
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    status: {
      type: String,
      enum: [
        "CREATED",
        "WAITING_FOR_DEPOSIT",
        "DONE",
        "CANCELED",
        "REFUND_REQUESTED",
        "REFUNDED",
        "EXPIRED",
      ],
      default: "CREATED",
      index: true,
    },
    supplyAmount: { type: Number, required: true, min: 0 },
    vatAmount: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },

    refundedSupplyAmount: { type: Number, default: 0, min: 0 },
    refundedVatAmount: { type: Number, default: 0, min: 0 },
    refundedTotalAmount: { type: Number, default: 0, min: 0 },

    paymentKey: { type: String },
    tossSecret: { type: String },

    method: { type: String, default: "VIRTUAL_ACCOUNT" },
    requestedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    depositedAt: { type: Date, default: null },

    virtualAccount: {
      bank: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      customerName: { type: String, default: "" },
      dueDate: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

creditOrderSchema.index(
  { paymentKey: 1 },
  {
    unique: true,
    partialFilterExpression: { paymentKey: { $type: "string", $gt: "" } },
  }
);

export default mongoose.model("CreditOrder", creditOrderSchema);
