import mongoose from "mongoose";

const connectionSchema = new mongoose.Schema(
  {
    manufacturer: { type: String, required: true },
    system: { type: String, required: true },
    type: { type: String, required: true },
    category: { type: String, required: true },
    fileName: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Connection = mongoose.model("Connection", connectionSchema);

export default Connection;
