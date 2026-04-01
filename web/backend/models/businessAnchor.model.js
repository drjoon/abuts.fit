import mongoose from "mongoose";

const businessAnchorSchema = new mongoose.Schema(
  {
    businessNumberNormalized: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    businessType: {
      type: String,
      enum: ["requestor", "salesman", "manufacturer", "devops", "admin"],
      default: "requestor",
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["draft", "active", "verified", "inactive", "merged"],
      default: "active",
      index: true,
    },
    primaryContactUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    referredByAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    defaultReferralAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    // 사업자 메타데이터 (AI 파싱 후 사용자 확인/검증을 거친 데이터)
    // 주의: extracted 필드는 제거됨 (2026-03-31)
    // AI 파싱 결과도 사용자 확인/검증을 거치므로 metadata가 SSOT
    metadata: {
      companyName: { type: String, default: "" },
      representativeName: { type: String, default: "" },
      address: { type: String, default: "" },
      addressDetail: { type: String, default: "" },
      zipCode: { type: String, default: "" },
      phoneNumber: { type: String, default: "" },
      email: { type: String, default: "" },
      businessItem: { type: String, default: "" }, // 종목
      businessType: { type: String, default: "" }, // 업태 (구 businessCategory)
      startDate: { type: String, default: "" },
      businessNumber: { type: String, default: "" },
    },
    verification: {
      verified: { type: Boolean, default: false },
      verifiedAt: { type: Date, default: null },
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
    },
    businessLicense: {
      s3Key: { type: String, default: "" },
      fileId: { type: String, default: "" },
      uploadedAt: { type: Date, default: null },
    },
    payoutAccount: {
      bankName: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      holderName: { type: String, default: "" },
      updatedAt: { type: Date, default: null },
    },
    payoutRates: {
      manufacturerRate: { type: Number, default: 0.65, min: 0, max: 1 },
      baseCommissionRate: { type: Number, default: 0.05, min: 0, max: 1 },
      salesmanDirectRate: { type: Number, default: 0.05, min: 0, max: 1 },
      updatedAt: { type: Date, default: null },
    },
    referralMembershipAggregate: {
      requestorDirectCircleAnchorIds: {
        type: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BusinessAnchor",
          },
        ],
        default: [],
      },
      requestorDirectCircleMemberCount: {
        type: Number,
        default: 0,
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },
    owners: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },
    ],
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },
    ],
    joinRequests: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        status: {
          type: String,
          enum: ["pending", "approved", "rejected"],
          default: "pending",
        },
        requestedRole: {
          type: String,
          enum: ["representative", "staff"],
          default: "staff",
        },
        approvedRole: {
          type: String,
          enum: ["representative", "staff", ""],
          default: "",
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

businessAnchorSchema.index({ businessType: 1, name: 1 });
businessAnchorSchema.index({ referredByAnchorId: 1, businessType: 1 });

// 소개 트리 조회 성능 최적화 ($graphLookup)
businessAnchorSchema.index({
  businessType: 1,
  referredByAnchorId: 1,
  status: 1,
});

const BusinessAnchor = mongoose.model("BusinessAnchor", businessAnchorSchema);

export default BusinessAnchor;
