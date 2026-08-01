// related files:
// - web/backend/rules.md
// - web/backend/services/creditBalance.service.js
// - web/backend/controllers/admin/adminBonusGrant.controller.js
// - web/backend/controllers/manufacturers/manufacturer.controller.js
import mongoose from "mongoose";

const creditLedgerSchema = new mongoose.Schema(
  {
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
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
    // 장부 분류 SSOT: 유료/무료 크레딧 원천 구분
    // - PAID: 유료 충전
    // - FREE_REQUEST: 무료 의뢰 크레딧 충전/조정
    // - FREE_SHIPPING: 무료 배송 크레딧 충전/조정
    // 레거시 데이터는 null 허용(타입/refType 기반 하위 호환 계산)
    creditKind: {
      type: String,
      enum: ["PAID", "FREE_REQUEST", "FREE_SHIPPING"],
      default: null,
      index: true,
    },
    memo: { type: String, default: "" },
    spentPaidAmount: { type: Number, default: null },
    spentFreeAmount: { type: Number, default: null },
    hasFreeRequest: { type: Boolean, default: null },
    refType: { type: String, default: "" },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    uniqueKey: { type: String, required: true, unique: true, index: true },
  },
  { timestamps: true },
);

export default mongoose.model("CreditLedger", creditLedgerSchema);
