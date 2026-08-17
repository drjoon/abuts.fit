// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/utils/popbill.util.js
// - web/backend/services/practiceLabInvoice.service.js
// - web/backend/controllers/admin/adminSettlementBatch.controller.js
import mongoose from "mongoose";

// 계산서/세금계산서 발행 방향(반대방향 = 크레딧 흐름의 역방향).
// - ABUTS_TO_CUSTOMER: 치과/기공소의 크레딧 충전(어벗츠에게 결제)의 반대방향. 어벗츠가 실제 공급자(SELF).
// - LAB_TO_PRACTICE: 치과→기공소 기공의뢰비(크레딧)의 반대방향. 기공소가 실제 공급자, 어벗츠는 수탁자(TRUSTEE).
// - AFFILIATE_TO_ABUTS: 어벗츠→관계사/파트너 정산(크레딧)의 반대방향. 공급자=기공소·제조사·영업자·개발운영사, 어벗츠=수탁자(TRUSTEE). 과세/면세는 taxType.
export const TAX_INVOICE_DIRECTIONS = [
  "ABUTS_TO_CUSTOMER",
  "LAB_TO_PRACTICE",
  "AFFILIATE_TO_ABUTS",
];

export const TAX_INVOICE_ISSUANCE_MODES = ["SELF", "TRUSTEE"];
export const TAX_INVOICE_TAX_TYPES = ["과세", "면세"];

const partySchema = {
  bizNo: { type: String, default: "" },
  corpName: { type: String, default: "" },
  ceoName: { type: String, default: "" },
  addr: { type: String, default: "" },
  bizType: { type: String, default: "" },
  bizClass: { type: String, default: "" },
  contactName: { type: String, default: "" },
  contactEmail: { type: String, default: "" },
  contactTel: { type: String, default: "" },
};

const TaxInvoiceDraftSchema = new mongoose.Schema(
  {
    chargeOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChargeOrder",
      default: null,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // 이 문서의 "소유자"(내 계산서함에 노출되는 기준) — direction별 의미:
    // ABUTS_TO_CUSTOMER=구매자(치과/기공소), LAB_TO_PRACTICE=구매자(치과), AFFILIATE_TO_ABUTS=구매자(어벗츠 admin anchor)
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
    },
    direction: {
      type: String,
      enum: TAX_INVOICE_DIRECTIONS,
      default: "ABUTS_TO_CUSTOMER",
      index: true,
    },
    issuanceMode: {
      type: String,
      enum: TAX_INVOICE_ISSUANCE_MODES,
      default: "SELF",
    },
    taxType: {
      type: String,
      enum: TAX_INVOICE_TAX_TYPES,
      default: "면세",
    },
    // 실제 공급자 앵커 (TRUSTEE일 때만 사용, SELF면 null=어벗츠 자신)
    sellerAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    seller: partySchema,
    writeDate: { type: String, default: null },
    status: {
      type: String,
      enum: [
        "PENDING_APPROVAL",
        "APPROVED",
        "REJECTED",
        "SENT",
        "FAILED",
        "CANCELLED",
      ],
      default: "PENDING_APPROVAL",
    },
    supplyAmount: { type: Number, required: true },
    vatAmount: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    itemName: { type: String, default: "" },
    buyer: partySchema,
    // 월합계 발행 대상 기간(LAB_TO_PRACTICE, AFFILIATE_TO_ABUTS). 건별(ABUTS_TO_CUSTOMER)은 null.
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    // 집계에 포함된 원천 레퍼런스(추적용) — LAB_TO_PRACTICE: PracticeTransfer id들, AFFILIATE_TO_ABUTS: SettlementBatchItem id
    sourceRefType: { type: String, default: "" },
    sourceRefIds: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },
    attemptCount: { type: Number, default: 0, min: 0 },
    lastAttemptAt: { type: Date, default: null },
    hometaxTrxId: { type: String, default: null },
    failReason: { type: String, default: null },
    approvedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

TaxInvoiceDraftSchema.index({ status: 1, updatedAt: -1 });
TaxInvoiceDraftSchema.index({ businessAnchorId: 1, createdAt: -1 });
TaxInvoiceDraftSchema.index({ sellerAnchorId: 1, createdAt: -1 });
// 같은 기간(월합계) 중복 생성 방지 — periodStart가 있는 문서에만 적용(부분 유니크 인덱스)
TaxInvoiceDraftSchema.index(
  { sellerAnchorId: 1, businessAnchorId: 1, direction: 1, periodStart: 1, periodEnd: 1 },
  {
    unique: true,
    partialFilterExpression: { periodStart: { $type: "date" } },
  },
);

const TaxInvoiceDraft = mongoose.model(
  "TaxInvoiceDraft",
  TaxInvoiceDraftSchema,
  "TaxInvoiceDraft",
);

export default TaxInvoiceDraft;
