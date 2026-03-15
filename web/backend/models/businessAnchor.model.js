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
    sourceBusinessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
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
  },
  {
    timestamps: true,
  },
);

businessAnchorSchema.index({ businessType: 1, name: 1 });
businessAnchorSchema.index({ sourceBusinessId: 1 }, { sparse: true });
businessAnchorSchema.index({ referredByAnchorId: 1, businessType: 1 });

const BusinessAnchor = mongoose.model("BusinessAnchor", businessAnchorSchema);

export default BusinessAnchor;
