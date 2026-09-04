// related files:
// - web/backend/controllers/practiceTransfers/prosthesisFeeItemRequest.controller.js
// - web/backend/services/prosthesisFeeItemRequestDashboardStats.service.js
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
// change-log:
// - 2026-09-05: 치과 커스텀 보철(기공수가) 요청 — 기공소 Off 시드·관리자 대시보드.
// - 2026-09-05: 추가요청 — 관리자 승인 범위(지정 기공소/전체) 후 시드.
import mongoose from "mongoose";

const prosthesisFeeItemRequestSchema = new mongoose.Schema(
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
    labAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    labName: {
      type: String,
      default: "",
      trim: true,
    },
    /** 다중 대상 기공소(지정 승인 시 전부 Off 시드) */
    labTargets: {
      type: [
        {
          labAnchorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BusinessAnchor",
            required: true,
          },
          labName: {
            type: String,
            default: "",
            trim: true,
          },
        },
      ],
      default: [],
    },
    /** 요청 내용(보철물 이름) */
    name: {
      type: String,
      required: true,
      trim: true,
    },
    nameKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "adopted", "dismissed"],
      default: "pending",
      index: true,
    },
    source: {
      type: String,
      enum: [
        "extra_request",
        "select_all",
        "prosthesis_type_settings",
        "other",
      ],
      default: "extra_request",
      trim: true,
    },
    /** 관리자 승인 시: lab=지정 기공소만, all_labs=모든 기공소 */
    applyScope: {
      type: String,
      enum: ["lab", "all_labs"],
      default: null,
    },
    approvedAt: { type: Date, default: null },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    adoptedAt: { type: Date, default: null },
    adoptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

prosthesisFeeItemRequestSchema.index({
  practiceAnchorId: 1,
  nameKey: 1,
  labAnchorId: 1,
});
prosthesisFeeItemRequestSchema.index({ createdAt: -1 });
prosthesisFeeItemRequestSchema.index({ status: 1, createdAt: -1 });

const ProsthesisFeeItemRequest = mongoose.model(
  "ProsthesisFeeItemRequest",
  prosthesisFeeItemRequestSchema,
);

export default ProsthesisFeeItemRequest;
