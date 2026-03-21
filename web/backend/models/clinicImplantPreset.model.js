import mongoose from "mongoose";

const clinicImplantPresetSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      required: true,
      index: true,
    },
    clinicName: {
      type: String,
      required: true,
      index: true,
    },
    manufacturer: { type: String, required: true },
    brand: { type: String, required: true },
    family: { type: String, required: true },
    type: { type: String, required: true },
    useCount: { type: Number, default: 0, index: true },
    lastUsedAt: { type: Date, default: Date.now, index: -1 },
  },
  { timestamps: true },
);

clinicImplantPresetSchema.index(
  {
    businessId: 1,
    clinicName: 1,
    manufacturer: 1,
    brand: 1,
    family: 1,
    type: 1,
  },
  { unique: true },
);

const ClinicImplantPreset = mongoose.model(
  "ClinicImplantPreset",
  clinicImplantPresetSchema,
);

export default ClinicImplantPreset;
