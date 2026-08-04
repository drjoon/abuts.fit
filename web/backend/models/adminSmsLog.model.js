// related files:
// - web/backend/rules.md
// - web/backend/controllers/admin/adminSms.controller.js
// - web/backend/modules/admin/admin.routes.js
import mongoose from "mongoose";

const adminSmsLogSchema = new mongoose.Schema(
  {
    to: { type: [String], required: true },
    text: { type: String, required: true },
    status: {
      type: String,
      enum: ["PENDING", "QUEUED", "SENT", "FAILED"],
      required: true,
      default: "PENDING",
    },
    method: {
      type: String,
      enum: ["SMS", "LMS", "KAKAO"],
      default: "SMS",
    },
    messageId: { type: String },
    errorMessage: { type: String },
    note: { type: String, default: "" },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

const AdminSmsLog =
  mongoose.models.AdminSmsLog ||
  mongoose.model("AdminSmsLog", adminSmsLogSchema);

export default AdminSmsLog;
