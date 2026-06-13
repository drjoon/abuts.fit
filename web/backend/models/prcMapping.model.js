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
      // 브랜드별 명칭 차이를 반영한 canonical family 집합
      // - Regular
      // - Mini (일부 제조사 Small)
      // - Narrow
      // - Small Narrow (네오 계열)
      enum: ["Regular", "Mini", "Narrow", "Small Narrow"],
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
