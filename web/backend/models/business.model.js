import mongoose from "mongoose";

const businessSchema = new mongoose.Schema(
  {
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
    depositCode: {
      type: String,
      default: "",
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
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
    businessLicense: {
      fileId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "File",
        default: null,
      },
      s3Key: { type: String, default: "" },
      originalName: { type: String, default: "" },
      uploadedAt: { type: Date, default: null },
    },
    extracted: {
      companyName: { type: String, default: "" },
      businessNumber: { type: String, default: undefined },
      address: { type: String, default: "" },
      addressDetail: { type: String, default: "" },
      zipCode: { type: String, default: "" },
      phoneNumber: { type: String, default: "" },
      email: { type: String, default: "" },
      representativeName: { type: String, default: "" },
      businessType: { type: String, default: "" },
      businessItem: { type: String, default: "" },
      startDate: { type: String, default: "" },
    },
    verification: {
      verified: { type: Boolean, default: false },
      provider: { type: String, default: "" },
      message: { type: String, default: "" },
      checkedAt: { type: Date, default: null },
    },
    shippingPolicy: {
      leadTimes: {
        d6: {
          minBusinessDays: { type: Number, default: 1 },
          maxBusinessDays: { type: Number, default: 2 },
        },
        d8: {
          minBusinessDays: { type: Number, default: 1 },
          maxBusinessDays: { type: Number, default: 2 },
        },
        d10: {
          minBusinessDays: { type: Number, default: 4 },
          maxBusinessDays: { type: Number, default: 7 },
        },
        d12: {
          minBusinessDays: { type: Number, default: 4 },
          maxBusinessDays: { type: Number, default: 7 },
        },
      },
      weeklyBatchDays: {
        type: [String],
        default: [],
      },
      updatedAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
  },
);

businessSchema.index({ owner: 1, name: 1 });
businessSchema.index({ businessType: 1, name: 1 });
businessSchema.index(
  { "extracted.businessNumber": 1 },
  { unique: true, sparse: true },
);
businessSchema.index({ businessAnchorId: 1 }, { sparse: true });
businessSchema.index(
  { depositCode: 1 },
  {
    unique: true,
    partialFilterExpression: { depositCode: { $type: "string", $gt: "" } },
  },
);
businessSchema.index({
  "joinRequests.user": 1,
  "joinRequests.status": 1,
});

const Business = mongoose.model("Business", businessSchema);

export default Business;
