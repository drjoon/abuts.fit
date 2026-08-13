// related files:
// - web/backend/utils/roundBarAbutment.js
// - web/backend/controllers/practiceTransfers/roundBarAbutmentRequest.controller.js
// - web/backend/controllers/admin/admin.roundBarAbutment.controller.js
// - web/frontend/src/pages/admin/system/AdminRoundBarAbutmentTab.tsx
import mongoose from "mongoose";
import { ROUND_BAR_HEX_TYPE } from "../utils/roundBarAbutment.js";

const roundBarAbutmentRequestSchema = new mongoose.Schema(
  {
    practiceAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      required: true,
      index: true,
    },
    practiceName: {
      type: String,
      default: "",
      trim: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    favoriteId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    inquiryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessRegistrationInquiry",
      default: null,
    },
    manufacturer: { type: String, required: true, trim: true },
    brand: { type: String, required: true, trim: true },
    family: { type: String, required: true, trim: true },
    type: { type: String, default: ROUND_BAR_HEX_TYPE, trim: true },
    specKey: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    adopted: {
      type: Boolean,
      default: false,
      index: true,
    },
    /** 도입 시 관리자가 지정. cnc | round_bar. 도입 전에는 빈 값 */
    adoptedKind: {
      type: String,
      enum: ["cnc", "round_bar", ""],
      default: "",
      trim: true,
    },
    adoptedAt: { type: Date, default: null },
    adoptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    revertedAt: { type: Date, default: null },
    revertedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

roundBarAbutmentRequestSchema.index({ practiceAnchorId: 1, specKey: 1 });
roundBarAbutmentRequestSchema.index({ createdAt: -1 });

const RoundBarAbutmentRequest = mongoose.model(
  "RoundBarAbutmentRequest",
  roundBarAbutmentRequestSchema,
);

export default RoundBarAbutmentRequest;
