import mongoose from "mongoose";

const implantPresetSchema = new mongoose.Schema(
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
    system: { type: String, required: true },
    type: { type: String, required: true },
    lastUsedAt: { type: Date, default: Date.now, index: -1 },
  },
  { timestamps: true }
);

implantPresetSchema.index(
  { requestor: 1, clinicName: 1, patientName: 1, tooth: 1 },
  { unique: true }
);

const ImplantPreset = mongoose.model("ImplantPreset", implantPresetSchema);

export default ImplantPreset;
