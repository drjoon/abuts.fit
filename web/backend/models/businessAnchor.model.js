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
    metadata: {
      companyName: { type: String, default: "" },
      representativeName: { type: String, default: "" },
      address: { type: String, default: "" },
      addressDetail: { type: String, default: "" },
      zipCode: { type: String, default: "" },
      phoneNumber: { type: String, default: "" },
      email: { type: String, default: "" },
      businessItem: { type: String, default: "" },
      businessCategory: { type: String, default: "" },
      startDate: { type: String, default: "" },
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

const BusinessAnchor = mongoose.model("BusinessAnchor", businessAnchorSchema);

export default BusinessAnchor;
