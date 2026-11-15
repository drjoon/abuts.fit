// related files:
// - web/backend/services/ddosIpBan.store.js
// - web/backend/middlewares/requestFloodBlocker.js
// - web/backend/rules.md
import mongoose from "mongoose";

const ddosIpBanSchema = new mongoose.Schema(
  {
    ip: { type: String, required: true, trim: true },
    banUntil: { type: Date, required: true },
    banLevel: { type: Number, required: true, min: 0, default: 0 },
    reason: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

ddosIpBanSchema.index({ ip: 1 }, { unique: true });
ddosIpBanSchema.index({ banUntil: -1 });

const DdosIpBan =
  mongoose.models.DdosIpBan || mongoose.model("DdosIpBan", ddosIpBanSchema);

export default DdosIpBan;
