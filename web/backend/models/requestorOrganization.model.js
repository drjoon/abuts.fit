import mongoose from "mongoose";

const requestorOrganizationSchema = new mongoose.Schema(
  {
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
      phoneNumber: { type: String, default: "" },
      email: { type: String, default: "" },
      representativeName: { type: String, default: "" },
      businessType: { type: String, default: "" },
      businessItem: { type: String, default: "" },
    },
    verification: {
      verified: { type: Boolean, default: false },
      provider: { type: String, default: "" },
      message: { type: String, default: "" },
      checkedAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
  }
);

requestorOrganizationSchema.index({ owner: 1, name: 1 });
requestorOrganizationSchema.index(
  { "extracted.businessNumber": 1 },
  { unique: true, sparse: true }
);
requestorOrganizationSchema.index(
  { depositCode: 1 },
  {
    unique: true,
    partialFilterExpression: { depositCode: { $type: "string", $gt: "" } },
  }
);
requestorOrganizationSchema.index({
  "joinRequests.user": 1,
  "joinRequests.status": 1,
});

const RequestorOrganization = mongoose.model(
  "RequestorOrganization",
  requestorOrganizationSchema
);

export default RequestorOrganization;
