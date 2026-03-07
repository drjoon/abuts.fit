import mongoose from "mongoose";

const connectionSchema = new mongoose.Schema(
  {
    manufacturer: { type: String, required: true },
    manufacturerKor: { type: String, default: "" },
    system: { type: String, required: true },
    family: { type: String, default: "Regular" },
    type: { type: String, required: true },
    category: { type: String, required: true },
    fileName: { type: String, required: true },
    diameter: { type: Number },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const Connection = mongoose.model("Connection", connectionSchema);

export default Connection;
