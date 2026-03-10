import mongoose from "mongoose";

const clinicSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RequestorOrganization",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    memo: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

clinicSchema.index({ businessId: 1, name: 1 }, { unique: true });

const Clinic = mongoose.model("Clinic", clinicSchema);

export default Clinic;
