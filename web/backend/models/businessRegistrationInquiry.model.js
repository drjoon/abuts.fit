import mongoose from "mongoose";

const businessRegistrationInquirySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RequestorOrganization",
      default: null,
    },
    organizationType: {
      type: String,
      enum: ["requestor", "salesman", "manufacturer"],
      default: null,
    },
    userSnapshot: {
      name: String,
      email: String,
      role: String,
      organization: String,
    },
    type: {
      type: String,
      enum: ["general", "business_registration", "user_registration", "other"],
      default: "general",
      index: true,
    },
    subject: {
      type: String,
      default: "",
    },
    message: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["open", "resolved"],
      default: "open",
    },
    adminNote: {
      type: String,
      default: "",
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reason: {
      type: String,
      default: "",
    },
    payload: {
      role: String,
      ownerForm: Object,
      license: Object,
    },
  },
  { timestamps: true },
);

export default mongoose.model(
  "BusinessRegistrationInquiry",
  businessRegistrationInquirySchema,
);
