// related files:
// - web/backend/controllers/salesTeam/salesTeam.controller.js
// - web/backend/modules/salesTeam/salesTeam.routes.js
import mongoose from "mongoose";

const salesDailyReportSchema = new mongoose.Schema(
  {
    authorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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
