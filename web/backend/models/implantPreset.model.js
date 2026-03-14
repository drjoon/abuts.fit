import mongoose from "mongoose";

const implantPresetSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    clinicName: {
      type: String,
      required: true,
      index: true,
    },
    patientName: {
      type: String,
      required: true,
      index: true,
    },
    tooth: {
      type: String,
      required: true,
      index: true,
    },
    manufacturer: { type: String, required: true },
    brand: { type: String, required: true },
    family: { type: String, required: true },
    type: { type: String, required: true },
    lastUsedAt: { type: Date, default: Date.now, index: -1 },
  },
  { timestamps: true },
);

implantPresetSchema.index(
  { businessId: 1, clinicName: 1, patientName: 1, tooth: 1 },
  { unique: true },
);

const ImplantPreset = mongoose.model("ImplantPreset", implantPresetSchema);

export default ImplantPreset;
