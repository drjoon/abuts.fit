// related files:
// - web/backend/controllers/salesTeam/salesTeam.controller.js
// - web/backend/modules/salesTeam/salesTeam.routes.js
import mongoose from "mongoose";

const salesVisitSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalesAccount",
      required: true,
      index: true,
    },
    assigneeUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    plannedAt: { type: Date, required: true, index: true },
    /** 유연 윈도우 시작·끝 (around / askBefore 용, 선택) */
    windowStartAt: { type: Date, default: null },
    windowEndAt: { type: Date, default: null },
    commitment: {
      type: String,
      enum: ["confirmed", "around", "askBefore"],
      default: "confirmed",
      index: true,
    },
    status: {
      type: String,
      enum: ["planned", "done", "canceled", "noShow"],
      default: "planned",
      index: true,
    },
    memo: { type: String, default: "", trim: true },
    completedAt: { type: Date, default: null },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

salesVisitSchema.index({ assigneeUserId: 1, plannedAt: 1, status: 1 });
salesVisitSchema.index({ accountId: 1, plannedAt: -1 });

const SalesVisit = mongoose.model("SalesVisit", salesVisitSchema);

export default SalesVisit;
