// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/frontend/src/features/support/InquiriesPage.tsx
// change-log:
// - 2026-08-14: manufacturer_add_request(환봉 제조사 추가요청 자동 문의).
// - 2026-08-11: 문의 type enum을 프론트 역할별 프리셋과 맞춤.
import mongoose from "mongoose";

const businessRegistrationInquirySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
    },
    businessType: {
      type: String,
      enum: ["requestor", "salesman", "manufacturer", "devops", "admin", "practice"],
      default: null,
    },
    userSnapshot: {
      name: String,
      email: String,
      role: String,
      business: String,
    },
    type: {
      type: String,
      // Frontend role presets (InquiriesPage) + legacy business/user registration keys.
      enum: [
        "general",
        "business_registration",
        "user_registration",
        "other",
        "manufacturing",
        "delivery",
        "billing",
        "credit",
        "design",
        "file_transfer",
        "account",
        "order_intake",
        "cam_machining",
        "equipment",
        "packing",
        "settlement",
        "referral_commission",
        "partnership",
        "operation",
        "system",
        "manufacturer_add_request",
      ],
      default: "general",
      index: true,
    },
    subject: {
      type: String,
      default: "",
    },
    message: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["open", "resolved"],
      default: "open",
    },
    adminNote: {
      type: String,
      default: "",
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reason: {
      type: String,
      default: "",
    },
    payload: {
      role: String,
      ownerForm: Object,
      license: Object,
    },
  },
  { timestamps: true },
);

export default mongoose.model(
  "BusinessRegistrationInquiry",
  businessRegistrationInquirySchema,
);
