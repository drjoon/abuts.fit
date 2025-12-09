import mongoose from "mongoose";

const clinicImplantPresetSchema = new mongoose.Schema(
  {
    requestor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    clinicName: {
      type: String,
      required: true,
      index: true,
    },
    manufacturer: { type: String, required: true },
    system: { type: String, required: true },
    type: { type: String, required: true },
    useCount: { type: Number, default: 0, index: true },
    lastUsedAt: { type: Date, default: Date.now, index: -1 },
  },
  { timestamps: true }
);

clinicImplantPresetSchema.index(
  { requestor: 1, clinicName: 1, manufacturer: 1, system: 1, type: 1 },
  { unique: true }
);

const ClinicImplantPreset = mongoose.model(
  "ClinicImplantPreset",
  clinicImplantPresetSchema
);

export default ClinicImplantPreset;
