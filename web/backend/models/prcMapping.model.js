import mongoose from "mongoose";

const prcMappingSchema = new mongoose.Schema(
  {
    manufacturer: {
      type: String,
      required: true,
      trim: true,
    },
    brand: {
      type: String,
      required: true,
      trim: true,
    },
    family: {
      type: String,
      required: true,
      enum: ["Regular", "Mini"],
    },
    type: {
      type: String,
      required: true,
      enum: ["Hex", "Non-Hex"],
    },
    faceHolePrcFileName: {
      type: String,
      required: true,
      trim: true,
    },
    connectionPrcFileName: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true },
);

prcMappingSchema.index(
  { manufacturer: 1, brand: 1, family: 1, type: 1 },
  { unique: true },
);

const PrcMapping = mongoose.model("PrcMapping", prcMappingSchema);

export default PrcMapping;
