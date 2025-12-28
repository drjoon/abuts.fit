import mongoose from "mongoose";

const manufacturerPaymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    occurredAt: {
      type: Date,
      required: true,
      index: true,
    },
    bankTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BankTransaction",
      default: null,
      index: true,
    },
    externalId: {
      type: String,
      default: "",
      trim: true,
    },
    printedContent: {
      type: String,
      default: "",
    },
    note: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["CONFIRMED", "PENDING", "CANCELLED"],
      default: "CONFIRMED",
      index: true,
    },
  },
  { timestamps: true }
);

manufacturerPaymentSchema.index({ userId: 1, occurredAt: -1 });
manufacturerPaymentSchema.index({ externalId: 1 }, { sparse: true });

export default mongoose.model("ManufacturerPayment", manufacturerPaymentSchema);
