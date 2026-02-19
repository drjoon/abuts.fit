import mongoose from "mongoose";

const manufacturerCreditLedgerSchema = new mongoose.Schema(
  {
    manufacturerOrganization: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    manufacturerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: ["EARN", "REFUND", "PAYOUT", "ADJUST"],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true },
    refType: { type: String, default: "" },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    uniqueKey: { type: String, required: true, unique: true, index: true },
    occurredAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

manufacturerCreditLedgerSchema.index({ manufacturerOrganization: 1, occurredAt: -1 });

export default mongoose.model(
  "ManufacturerCreditLedger",
  manufacturerCreditLedgerSchema,
);
