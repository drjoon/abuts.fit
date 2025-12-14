import mongoose from "mongoose";

const systemSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      unique: true,
      default: "global",
    },
    deliveryEtaLeadDays: {
      d6: { type: Number, default: 2 },
      d8: { type: Number, default: 2 },
      d10: { type: Number, default: 5 },
      d10plus: { type: Number, default: 5 },
    },
  },
  {
    timestamps: true,
  }
);

const SystemSettings = mongoose.model("SystemSettings", systemSettingsSchema);

export default SystemSettings;
