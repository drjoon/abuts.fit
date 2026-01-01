import mongoose from "mongoose";

const clinicSchema = new mongoose.Schema(
  {
    requestor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
  }
);

clinicSchema.index({ requestor: 1, name: 1 }, { unique: true });

const Clinic = mongoose.model("Clinic", clinicSchema);

export default Clinic;
