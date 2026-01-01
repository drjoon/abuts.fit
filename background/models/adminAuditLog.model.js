import mongoose from "mongoose";

const adminAuditLogSchema = new mongoose.Schema(
  {
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: { type: String, required: true, index: true },
    refType: { type: String, default: "" },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: null },
    ipAddress: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("AdminAuditLog", adminAuditLogSchema);
