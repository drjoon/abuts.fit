import mongoose from "mongoose";

const deliveryInfoSchema = new mongoose.Schema(
  {
    request: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Request",
      required: true,
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String,
    },
    trackingNumber: String,
    carrier: String,
    shippedAt: Date,
    deliveredAt: Date,
  },
  {
    timestamps: true,
  }
);

const DeliveryInfo = mongoose.model("DeliveryInfo", deliveryInfoSchema);

export default DeliveryInfo;
