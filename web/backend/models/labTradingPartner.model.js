// related files:
// - web/backend/rules.md
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
// - web/backend/modules/labTradingPartners/labTradingPartner.routes.js
// - web/frontend/src/features/settings/tabs/LabTradingPartnersTab.tsx
import mongoose from "mongoose";

const labTradingPartnerSchema = new mongoose.Schema(
  {
    labAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      required: true,
      index: true,
    },
    practiceAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    inviteToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    status: {
      type: String,
      // active: 등록 기간 내 초대·검증 완료된 등록 치과 (플랫폼 수수료 partnerFeeRate, 기본 0%)
      // referred: 등록 기간이 지난 뒤 발급된 초대로 검증 완료 (동일하게 partnerFeeRate)
      // 관계 없음: 플랫폼 수수료 nonPartnerFeeRate (기본 25%, 개발운영사 파트너 페이지에서 설정)
      enum: ["invited", "pending", "active", "referred", "canceled", "expired"],
      default: "invited",
      index: true,
    },
    // 60일 소개치과 등록 기간이 지난 뒤 발급된 초대인지 여부. true면 검증 완료 시 active가 아닌 referred로 승격된다.
    invitedAfterWindow: {
      type: Boolean,
      default: false,
    },
    practiceHint: {
      name: { type: String, default: "", trim: true },
      phone: { type: String, default: "", trim: true },
      memo: { type: String, default: "", trim: true },
    },
    invitedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    invitedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    /** 치과 가입·사업자 연결 시각 (검증 전 pending) */
    boundAt: {
      type: Date,
      default: null,
    },
    activatedAt: {
      type: Date,
      default: null,
    },
    canceledAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

labTradingPartnerSchema.index(
  { labAnchorId: 1, practiceAnchorId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      practiceAnchorId: { $type: "objectId" },
      status: { $in: ["pending", "active", "referred"] },
    },
  },
);

labTradingPartnerSchema.index({ labAnchorId: 1, status: 1, invitedAt: -1 });

const LabTradingPartner = mongoose.model(
  "LabTradingPartner",
  labTradingPartnerSchema,
);

export default LabTradingPartner;
