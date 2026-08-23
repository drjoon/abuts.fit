// change-log:
// - 2026-08-23: 배송·출고 풀필먼트 필드(fulfillmentStatus·shipping).
// - 2026-08-23: 스토어 기성품 입금주문(과세). ChargeOrder와 분리.
// related files:
// - web/backend/services/storeSale.service.js
// - web/backend/controllers/store/storeOrder.controller.js
// - rules.md §2.3
import mongoose from "mongoose";

const storeOrderItemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    qty: { type: Number, required: true, min: 1 },
    unitPriceInclusive: { type: Number, required: true, min: 0 },
    supplyAmount: { type: Number, required: true, min: 0 },
    vatAmount: { type: Number, required: true, min: 0 },
    lineTotalInclusive: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const storeShippingSchema = new mongoose.Schema(
  {
    recipientName: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    zipCode: { type: String, default: "", trim: true },
    address: { type: String, default: "", trim: true },
    addressDetail: { type: String, default: "", trim: true },
    memo: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const storeOrderSchema = new mongoose.Schema(
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
    depositCode: { type: String, required: true, trim: true, index: true },
    depositorName: { type: String, required: true, trim: true, index: true },
    status: {
      type: String,
      enum: ["PENDING", "MATCHED", "PAID", "CANCELED", "EXPIRED"],
      default: "PENDING",
      index: true,
    },
    /** 결제와 분리된 출고 상태. 입금 확정 시 READY. */
    fulfillmentStatus: {
      type: String,
      enum: ["UNPAID", "READY", "SHIPPED", "DELIVERED", "CANCELED"],
      default: "UNPAID",
      index: true,
    },
    shipping: { type: storeShippingSchema, default: () => ({}) },
    courier: { type: String, default: "", trim: true },
    trackingNumber: { type: String, default: "", trim: true },
    shippedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    fulfillmentNote: { type: String, default: "" },
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
    items: { type: [storeOrderItemSchema], required: true },
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
    paidAt: { type: Date, default: null },
    /** BANK=계좌이체 입금, CREDIT=유료 선수금 차감 */
    paymentMethod: {
      type: String,
      enum: ["BANK", "CREDIT"],
      default: "BANK",
      index: true,
    },
    note: { type: String, default: "" },
  },
  { timestamps: true },
);

storeOrderSchema.index({
  depositCode: 1,
  status: 1,
  amountTotal: 1,
  expiresAt: 1,
});
storeOrderSchema.index({
  businessAnchorId: 1,
  status: 1,
  expiresAt: 1,
});
storeOrderSchema.index({
  fulfillmentStatus: 1,
  status: 1,
  createdAt: -1,
});

export default mongoose.model("StoreOrder", storeOrderSchema);
