// related files:
// - web/backend/utils/dashboardNotice.js
// - web/backend/controllers/dashboardNotice.controller.js
// - web/backend/modules/admin/admin.routes.js
import mongoose from "mongoose";
import { NOTICE_AUDIENCES } from "../utils/dashboardNotice.js";

const noticeImageSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 400 },
    fileName: { type: String, trim: true, maxlength: 180, default: "" },
    contentType: { type: String, trim: true, maxlength: 80, default: "" },
  },
  { _id: false },
);

const dashboardNoticeSchema = new mongoose.Schema(
  {
    /** 시드 식별자. 있으면 재시작해도 같은 공지를 다시 만들지 않는다. */
    code: { type: String, trim: true, maxlength: 64, default: "" },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    audiences: {
      type: [{ type: String, enum: NOTICE_AUDIENCES }],
      default: [],
    },
    images: { type: [noticeImageSchema], default: [] },
    published: { type: Boolean, default: true },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

dashboardNoticeSchema.index(
  { code: 1 },
  {
    unique: true,
    partialFilterExpression: { code: { $type: "string", $gt: "" } },
  },
);
dashboardNoticeSchema.index({ published: 1, endsAt: 1, createdAt: -1 });

const DashboardNotice =
  mongoose.models.DashboardNotice ||
  mongoose.model("DashboardNotice", dashboardNoticeSchema);

export default DashboardNotice;
