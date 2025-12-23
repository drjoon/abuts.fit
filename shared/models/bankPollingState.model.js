import mongoose from "../mongoose.js";

const bankPollingStateSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    lastOccurredAt: { type: Date, default: null },
    lastExternalId: { type: String, default: "", trim: true },

    lockUntil: { type: Date, default: null, index: true },
    lockOwner: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

export default mongoose.model("BankPollingState", bankPollingStateSchema);
