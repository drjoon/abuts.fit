// related files:
// - web/backend/rules.md
// - web/backend/models/ledgerJournal.model.js
// - web/backend/services/generalLedger.service.js
import mongoose from "mongoose";

export const LEDGER_LINE_ACCOUNT_CODES = [
  "REQ_PAID_CREDIT",
  "REQ_FREE_REQUEST_CREDIT",
  "REQ_FREE_SHIPPING_CREDIT",
  "LAB_SETTLEMENT_CREDIT",
  "PLATFORM_ESCROW",
  "REV_MANUFACTURER",
  "REV_DEVOPS",
  "REV_SALESMAN",
  "REV_ADMIN",
];

export const LEDGER_OWNER_ROLES = [
  "requestor",
  "manufacturer",
  "devops",
  "salesman",
  "admin",
];

export const LEDGER_CREDIT_KINDS = [
  "PAID",
  "FREE_REQUEST",
  "FREE_SHIPPING",
  "SETTLEMENT",
  null,
];

const ledgerLineSchema = new mongoose.Schema(
  {
    journalId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    lineNo: {
      type: Number,
      required: true,
      min: 1,
    },
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      required: true,
      index: true,
    },
    accountCode: {
      type: String,
      enum: LEDGER_LINE_ACCOUNT_CODES,
      required: true,
      index: true,
    },
    ownerRole: {
      type: String,
      enum: LEDGER_OWNER_ROLES,
      required: true,
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    amountExcludingVat: {
      type: Number,
      default: null,
    },
    vatAmount: {
      type: Number,
      default: 0,
    },
    amountIncludingVat: {
      type: Number,
      default: null,
    },
    creditKind: {
      type: String,
      enum: LEDGER_CREDIT_KINDS,
      default: null,
      index: true,
    },
    occurredAt: {
      type: Date,
      required: true,
      index: true,
      default: Date.now,
    },
    refType: {
      type: String,
      default: "",
      index: true,
      trim: true,
    },
    refId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true },
);

ledgerLineSchema.index({ journalId: 1, lineNo: 1 }, { unique: true });
ledgerLineSchema.index({ ownerRole: 1, ownerId: 1, occurredAt: -1, _id: -1 });
// 의뢰자 잔액(GL direct balance) 집계 경로 최적화 인덱스
// - match: ownerRole + ownerId + accountCode
// - aggregate/group: accountCode
ledgerLineSchema.index({ ownerRole: 1, ownerId: 1, accountCode: 1, occurredAt: -1 });
ledgerLineSchema.index({ accountCode: 1, occurredAt: -1, _id: -1 });
ledgerLineSchema.index({ businessAnchorId: 1, occurredAt: -1, _id: -1 });
ledgerLineSchema.index({ refType: 1, refId: 1, occurredAt: -1, _id: -1 });

export default mongoose.model("LedgerLine", ledgerLineSchema);
