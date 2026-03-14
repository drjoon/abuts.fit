import mongoose from "mongoose";

const shippingPackageSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    shipDateYmd: {
      type: String, // YYYY-MM-DD (KST)
      required: true,
      index: true,
    },
    mailboxAddress: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    requestIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Request",
      },
    ],
    shippingFeeSupply: {
      type: Number,
      default: 3500,
    },
    shippingFeeVat: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

shippingPackageSchema.index(
  { businessId: 1, shipDateYmd: 1, mailboxAddress: 1 },
  { unique: true },
);

export default mongoose.model("ShippingPackage", shippingPackageSchema);
