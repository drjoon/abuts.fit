// related files:
// - web/backend/services/easyFinBankSync.service.js
// change-log:
// - 2026-10-14: 팝빌 계좌조회 마지막 잔액·수집 시각.
import mongoose from "mongoose";

const easyFinBankSnapshotSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "abuts-deposit" },
    bankCode: { type: String, default: "" },
    bankName: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    balance: { type: Number, default: null },
    lastScrapAt: { type: Date, default: null },
    jobId: { type: String, default: "" },
    syncedAt: { type: Date, default: null },
    depositCount: { type: Number, default: 0 },
    error: { type: String, default: "" },
  },
  { timestamps: true },
);

export default mongoose.model("EasyFinBankSnapshot", easyFinBankSnapshotSchema);
