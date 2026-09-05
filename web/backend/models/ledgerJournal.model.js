// related files:
// - web/backend/rules.md
// - web/backend/models/ledgerLine.model.js
// - web/backend/services/generalLedger.service.js
import mongoose from "mongoose";

export const LEDGER_JOURNAL_EVENT_TYPES = [
  "REQUEST_SPEND_COMMIT",
  "REQUEST_SPEND_HOLD",
  "SHIPPING_SPEND_COMMIT",
  "SHIPPING_SPEND_HOLD",
  "PRACTICE_TRANSFER_SPEND_COMMIT",
  "PRACTICE_TRANSFER_SPEND_HOLD",
  "PRACTICE_TRANSFER_HOLD_ADJUST",
  "PRACTICE_TRANSFER_ESCROW_RELEASE",
  "PRACTICE_TRANSFER_LAB_PLATFORM_FEE",
  "PRACTICE_MEMBERSHIP_SPEND",
  "CHARGE_PAID",
  "CHARGE_FREE_REQUEST",
  "CHARGE_FREE_SHIPPING",
  "LAB_SETTLEMENT_CHARGE",
  "ADJUST",
  "SETTLEMENT_PAYOUT",
  /** 스토어 기성품 과세 매출. 입금 확정 시 기록. 루트 rules.md §2.3 */
  "STORE_SALE",
  /**
   * 비제조사 소비 취소(원본 유지 + 반대부호). 제조사 REQUEST/SHIPPING 롤백은 물리 삭제.
   * 루트 rules.md §2.3
   */
  "REFUND",
];

const ledgerJournalSchema = new mongoose.Schema(
  {
    journalId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    eventType: {
      type: String,
      enum: LEDGER_JOURNAL_EVENT_TYPES,
      required: true,
      index: true,
    },
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      required: true,
      index: true,
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
    stageFrom: {
      type: String,
      default: "",
      trim: true,
    },
    stageTo: {
      type: String,
      default: "",
      trim: true,
    },
    occurredAt: {
      type: Date,
      required: true,
      index: true,
      default: Date.now,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ["POSTED"],
      default: "POSTED",
      index: true,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true },
);

ledgerJournalSchema.index({ businessAnchorId: 1, occurredAt: -1, _id: -1 });
ledgerJournalSchema.index({ eventType: 1, occurredAt: -1, _id: -1 });
ledgerJournalSchema.index({ refType: 1, refId: 1, occurredAt: -1, _id: -1 });

export default mongoose.model("LedgerJournal", ledgerJournalSchema);
