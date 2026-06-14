import mongoose from "mongoose";

const connectionSchema = new mongoose.Schema(
  {
    manufacturer: { type: String, required: true },
    manufacturerKor: { type: String, default: "" },
    brand: { type: String, required: true },
    displayBrand: { type: String, default: "" },
    family: { type: String, required: true },
    displayFamily: { type: String, default: "" },
    type: { type: String, required: true },
    displayType: { type: String, default: "" },
    category: { type: String, required: true },
    fileName: { type: String, required: true },
    diameter: { type: Number },
    l2: { type: Number },
    hexSize: { type: Number },
    internalGauge: { type: String, default: "" },
    protrusionLength: { type: Number },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const Connection = mongoose.model("Connection", connectionSchema);

export default Connection;
