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
      d10: { type: Number, default: 4 },
      d12: { type: Number, default: 4 },
    },
    creditSettings: {
      minCreditForRequest: { type: Number, default: 10000 },
      shippingFee: { type: Number, default: 3500 },
      defaultWelcomeBonusCredit: { type: Number, default: 30000 },
      defaultFreeShippingCredit: { type: Number, default: 7000 },
    },
    // 한진 송하인 정보: EBS 환경변수 한글 인코딩 버그로 인해 DB에서 관리
    // (환경변수로 읽으면 한글이 "??"로 깨짐 → rules.md 섹션 6.7.0 참고)
    hanjinSenderInfo: {
      zip: { type: String, default: "50965" },
      baseAddr: { type: String, default: "경상남도 김해시 흥동" },
      dtlAddr: { type: String, default: "전하로 85번길 5" },
      name: { type: String, default: "어벗츠 주식회사" },
      tel: { type: String, default: "1588-3948" },
      mobile: { type: String, default: "" },
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
