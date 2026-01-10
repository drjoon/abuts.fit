import mongoose from "mongoose";

const machineSchema = new mongoose.Schema(
  {
    // 입력 폼/UI에서 사용하는 장비 이름 (예: "M1", "Mx" 등)
    uid: {
      type: String,
      required: true,
      trim: true,
    },
    // Hi-Link DLL에 전달되는 실제 UID (숫자 포맷 등 별도 관리 가능)
    hiLinkUid: {
      type: String,
      trim: true,
    },
    manufacturer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
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
    allowJobStart: {
      type: Boolean,
      default: true,
    },
    allowProgramDelete: {
      type: Boolean,
      default: false,
    },
    allowAutoMachining: {
      type: Boolean,
      default: false,
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
