// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// change-log:
// - 2026-08-17: 같은 칸을 하루에 두 번 비울 수 있어 (businessAnchorId, shipDateYmd, mailboxAddress) unique를 제거.
import mongoose from "mongoose";

const shippingPackageSchema = new mongoose.Schema(
  {
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
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

// 같은 칸을 하루에 두 번 비울 수 있다(집하 후 다음 박스). unique 금지.
shippingPackageSchema.index({
  businessAnchorId: 1,
  shipDateYmd: 1,
  mailboxAddress: 1,
});

export default mongoose.model("ShippingPackage", shippingPackageSchema);
