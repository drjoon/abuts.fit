// related files:
// - web/backend/rules.md
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/services/creditBalance.service.js
import mongoose from "mongoose";

const businessCreditBalanceSchema = new mongoose.Schema(
  {
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      required: true,
      unique: true,
      index: true,
    },
    paidCredit: { type: Number, required: true, default: 0 },
    bonusRequestCredit: { type: Number, required: true, default: 0 },
    bonusShippingCredit: { type: Number, required: true, default: 0 },
    version: { type: Number, required: true, default: 0 },
    lastAppliedLedgerAt: { type: Date, default: null },
    lastAppliedLedgerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true },
);

export default mongoose.model(
  "BusinessCreditBalance",
  businessCreditBalanceSchema,
);
