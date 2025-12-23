import mongoose from "../mongoose.js";

const creditLedgerSchema = new mongoose.Schema(
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
    type: {
      type: String,
      enum: ["CHARGE", "BONUS", "SPEND", "REFUND", "ADJUST"],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true },
    refType: { type: String, default: "" },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    uniqueKey: { type: String, required: true, unique: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model("CreditLedger", creditLedgerSchema);
