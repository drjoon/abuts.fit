// related files:
// - web/backend/rules.md
// - web/backend/models/bonusGrant.model.js
// - web/backend/controllers/admin/adminFreeCreditGrant.controller.js
// - web/backend/controllers/businesses/business.freeCredit.util.js
// - web/backend/controllers/credits/creditLedger.controller.js
// - web/backend/controllers/admin/adminCredit.controller.js
import mongoose from "mongoose";

const freeCreditGrantSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "REQUEST_FREE_CREDIT",
        "SHIPPING_FREE_CREDIT",
        "WELCOME_BONUS", // legacy 호환 (앱 안정화 후 삭제 예정)
        "FREE_SHIPPING_CREDIT", // legacy 호환 (앱 안정화 후 삭제 예정)
      ],
      required: true,
      index: true,
    },
    businessNumber: {
      type: String,
      required: true,
      index: true,
    },
    amount: { type: Number, required: true },
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
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
    grantJournalId: {
      type: String,
      default: null,
      index: true,
    },
    canceledAt: {
      type: Date,
      default: null,
      index: true,
    },
    canceledByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    cancelReason: { type: String, default: "" },
    cancelJournalId: {
      type: String,
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

freeCreditGrantSchema.index(
  { type: 1, businessNumber: 1, isOverride: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isOverride: false,
      businessNumber: { $type: "string", $gt: "" },
    },
  },
);

// 물리 컬렉션 연속성 보장을 위해 model name은 BonusGrant를 유지합니다.
const FreeCreditGrant =
  mongoose.models.BonusGrant ||
  mongoose.model("BonusGrant", freeCreditGrantSchema);

export default FreeCreditGrant;
