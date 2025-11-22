import mongoose from "mongoose";

const machineSchema = new mongoose.Schema(
  {
    // 입력 폼/UI에서 사용하는 장비 이름 (예: "M1", "Mx" 등)
    uid: {
      type: String,
      required: true,
      trim: true,
    },
    // Hi-Link 내부에서 사용하는 실제 장비 UID
    hiLinkUid: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    manufacturer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      trim: true,
    },
    serial: {
      type: String,
      trim: true,
    },
    ip: {
      type: String,
      trim: true,
    },
    port: {
      type: Number,
      default: 0,
    },
    lastStatus: {
      status: { type: String, default: "Unknown" },
      updatedAt: { type: Date },
    },
  },
  {
    timestamps: true,
  }
);

const Machine = mongoose.model("Machine", machineSchema);

export default Machine;
