import mongoose from "mongoose";

const adminHappyCallMemoEntrySchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    savedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    savedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { _id: true },
);

const adminHappyCallMemoDraftSchema = new mongoose.Schema(
  {
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      required: true,
      unique: true,
      index: true,
    },
    entries: {
      type: [adminHappyCallMemoEntrySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

const AdminHappyCallMemoDraft = mongoose.model(
  "AdminHappyCallMemoDraft",
  adminHappyCallMemoDraftSchema,
);

export default AdminHappyCallMemoDraft;
