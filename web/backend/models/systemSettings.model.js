import mongoose from "mongoose";

const systemSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      unique: true,
      default: "global",
    },
    deliveryEtaLeadDays: {
      d6: { type: Number, default: 1 },
      d8: { type: Number, default: 1 },
      d10: { type: Number, default: 1 },
      d10plus: { type: Number, default: 1 },
    },
    securitySettings: {
      twoFactorAuth: { type: Boolean, default: true },
      loginNotifications: { type: Boolean, default: true },
      dataEncryption: { type: Boolean, default: true },
      fileUploadScan: { type: Boolean, default: true },
      autoLogout: { type: Number, default: 30 },
      maxLoginAttempts: { type: Number, default: 5 },
      passwordExpiry: { type: Number, default: 90 },
      ipWhitelist: { type: Boolean, default: false },
      apiRateLimit: { type: Number, default: 1000 },
      backupFrequency: { type: String, default: "daily" },
    },
  },
  {
    timestamps: true,
  },
);

const SystemSettings = mongoose.model("SystemSettings", systemSettingsSchema);

export default SystemSettings;
