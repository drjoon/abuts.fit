import mongoose from "mongoose";

const bonusGrantSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["WELCOME_BONUS"],
      required: true,
      index: true,
    },
    businessNumber: {
      type: String,
      required: true,
      index: true,
    },
    amount: { type: Number, required: true },
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
    isOverride: { type: Boolean, default: false, index: true },
    source: {
      type: String,
      enum: ["auto", "admin", "migrated"],
      required: true,
      index: true,
    },
    overrideReason: { type: String, default: "" },
    grantedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    creditLedgerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CreditLedger",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

bonusGrantSchema.index(
  { type: 1, businessNumber: 1, isOverride: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isOverride: false,
      businessNumber: { $type: "string", $gt: "" },
    },
  }
);

const BonusGrant = mongoose.model("BonusGrant", bonusGrantSchema);

export default BonusGrant;
