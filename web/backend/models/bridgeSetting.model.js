import mongoose from "mongoose";

const BridgeSettingSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "default" },
    hilinkDllEnterTimeoutMs: { type: Number, default: null },
    hilinkDllHoldFatalMs: { type: Number, default: null },
    hilinkFailfastOnHang: { type: Boolean, default: null },
    mockCncMachiningEnabled: { type: Boolean, default: null },
    dummyCncSchedulerEnabled: { type: Boolean, default: null },
    cncJobAssumeMinutes: { type: Number, default: null },
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
    collection: "bridge_settings",
  },
);

export default mongoose.models.BridgeSetting ||
  mongoose.model("BridgeSetting", BridgeSettingSchema);
