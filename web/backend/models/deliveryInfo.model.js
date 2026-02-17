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

    tracking: {
      lastStatusCode: String,
      lastStatusText: String,
      lastEventAt: Date,
      lastSyncedAt: Date,
    },

    events: [
      {
        statusCode: String,
        statusText: String,
        occurredAt: Date,
        location: String,
        description: String,
        raw: mongoose.Schema.Types.Mixed,
      },
    ],
  },
  {
    timestamps: true,
  },
);

const DeliveryInfo = mongoose.model("DeliveryInfo", deliveryInfoSchema);

export default DeliveryInfo;
