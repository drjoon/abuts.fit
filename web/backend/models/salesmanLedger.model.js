import mongoose from "mongoose";

const salesmanLedgerSchema = new mongoose.Schema(
  {
    salesmanId: {
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
    amount: {
      type: Number,
      required: true,
    },
    refType: {
      type: String,
      default: "",
    },
    refId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    uniqueKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model("SalesmanLedger", salesmanLedgerSchema);
