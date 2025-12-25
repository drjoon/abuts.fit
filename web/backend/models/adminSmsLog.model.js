import mongoose from "mongoose";

const adminSmsLogSchema = new mongoose.Schema(
  {
    to: { type: [String], required: true },
    text: { type: String, required: true },
    status: { type: String, enum: ["SENT", "FAILED"], required: true },
    messageId: { type: String },
    errorMessage: { type: String },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const AdminSmsLog = mongoose.model("AdminSmsLog", adminSmsLogSchema);

export default AdminSmsLog;
