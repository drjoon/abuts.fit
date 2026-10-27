// related files:
// - web/backend/services/heldSms.service.js
// - web/backend/controllers/admin/adminHeldSms.controller.js
import mongoose from "mongoose";

const recipientSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true },
    name: { type: String, default: "" },
    content: { type: String, required: true },
  },
  { _id: false },
);

const heldSmsSchema = new mongoose.Schema(
  {
    reason: { type: String, required: true, index: true },
    fingerprint: { type: String, required: true },
    subject: { type: String, default: "알림" },
    recipients: { type: [recipientSchema], default: [] },
    status: {
      type: String,
      enum: ["held", "sending", "sent", "dismissed"],
      default: "held",
      index: true,
    },
    hitCount: { type: Number, default: 1 },
    lastSeenAt: { type: Date, default: Date.now },
    sentAt: { type: Date, default: null },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    receiptNum: { type: String, default: "" },
  },
  { timestamps: true },
);

heldSmsSchema.index(
  { fingerprint: 1 },
  { unique: true, partialFilterExpression: { status: "held" } },
);
heldSmsSchema.index({ status: 1, createdAt: -1 });

const HeldSms = mongoose.models.HeldSms || mongoose.model("HeldSms", heldSmsSchema);

export default HeldSms;
