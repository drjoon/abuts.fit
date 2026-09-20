// related files:
// - web/backend/controllers/salesTeam/salesTeam.controller.js
// - web/backend/modules/salesTeam/salesTeam.routes.js
// - web/backend/utils/salesDailyReportAccess.js
// change-log:
// - 2026-09-21: businessAnchorId 스탬프(딜러사 BA 스코프 ACL).
import mongoose from "mongoose";

const salesDailyReportSchema = new mongoose.Schema(
  {
    authorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /** 작성 시점 딜러사(또는 영업본부) BA. ACL·팀 목록용. */
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    /** KST civil date YYYY-MM-DD */
    reportYmd: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },
    visitSummary: { type: String, default: "", trim: true },
    issues: { type: String, default: "", trim: true },
    tomorrowPlan: { type: String, default: "", trim: true },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

salesDailyReportSchema.index(
  { authorUserId: 1, reportYmd: 1 },
  { unique: true },
);

const SalesDailyReport = mongoose.model(
  "SalesDailyReport",
  salesDailyReportSchema,
);

export default SalesDailyReport;
