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
    // 패킹 라벨 브랜딩 정보: EBS 환경변수 한글 인코딩 버그로 인해 DB에서 관리
    // (rules.md 섹션 16 참고)
    packLabelBranding: {
      productName: { type: String, default: "치과용임플란트 상부구조물" },
      modelName: { type: String, default: "CA6512" },
      licenseNo: { type: String, default: "제3583호" },
      manufacturerName: { type: String, default: "(주)애크로덴트" },
      manufacturerAddr: {
        type: String,
        default: "경남 김해시 전하로85번길 5, 나동(흥동)",
      },
      manufacturerTelFax: {
        type: String,
        default: "T 055-314-4607  F 055-901-0241",
      },
      manufacturerPermitNo: { type: String, default: "제3583호" },
      sellerName: { type: String, default: "어벗츠 주식회사" },
      sellerPermit: { type: String, default: "제00001호" },
      sellerAddr: {
        type: String,
        default: "경남 거제시 거제중앙로29길 6, 3층",
      },
      sellerTel: { type: String, default: "1588-3948" },
      udiGtin: { type: String, default: "08800123600154" },
      certInfo: {
        type: String,
        default:
          "품목인증번호: 제인 26-0000호, 포장단위:1set, 보관방법: 실온보관",
      },
      homepageUrl: { type: String, default: "www.acrodent.com" },
      manualQrLabel: { type: String, default: "사용자매뉴얼" },
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
    selfInspectionInstrumentOptions: {
      type: [String],
      default: ["현미경(AD-T-07)", "비전(AD-T-19)", "MICRO(AD-T-02)"],
    },
    rndUnmachinableReasonOptions: {
      type: [String],
      default: [],
    },
    // related files (screw lot tracking):
    // - web/backend/controllers/requests/common.requests.controller.js
    // - web/backend/controllers/requests/common.review.controller.js
    // - web/backend/models/request.model.js
    // - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx
    // 세척.패킹 단계 스크류 로트번호 전역 설정 (동적 타입 목록)
    packingScrewLotSettings: {
      type: [
        {
          type: { type: String, default: "" },
          lotNumber: { type: String, default: "" },
        },
      ],
      default: () => [
        { type: "A", lotNumber: "" },
        { type: "B", lotNumber: "" },
        { type: "C", lotNumber: "" },
        { type: "D", lotNumber: "" },
        { type: "E", lotNumber: "" },
      ],
    },
  },
  {
    timestamps: true,
  },
);

const SystemSettings = mongoose.model("SystemSettings", systemSettingsSchema);

export default SystemSettings;
