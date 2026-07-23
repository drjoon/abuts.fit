import mongoose from "mongoose";

const adminHappyCallCompletionSchema = new mongoose.Schema(
  {
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      required: true,
      index: true,
    },
    reasonCode: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    completedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    suppressUntil: {
      type: Date,
      required: true,
      index: true,
    },
    note: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000,
    },
  },
  {
    timestamps: true,
  },
);

adminHappyCallCompletionSchema.index(
  { businessAnchorId: 1, reasonCode: 1 },
  { unique: true },
);

const AdminHappyCallCompletion = mongoose.model(
  "AdminHappyCallCompletion",
  adminHappyCallCompletionSchema,
);

export default AdminHappyCallCompletion;
