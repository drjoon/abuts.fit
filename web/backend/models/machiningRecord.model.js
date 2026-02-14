import mongoose from "mongoose";

const machiningRecordSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      index: true,
      default: null,
    },
    machineId: {
      type: String,
      index: true,
      required: true,
    },
    jobId: {
      type: String,
      default: null,
      index: true,
    },
    bridgePath: {
      type: String,
      default: null,
    },

    fileName: {
      type: String,
      default: null,
    },
    originalFileName: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: ["RUNNING", "COMPLETED", "FAILED", "CANCELED"],
      default: "RUNNING",
      index: true,
    },

    startedAt: {
      type: Date,
      default: null,
      index: true,
    },
    lastTickAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
      index: true,
    },

    percent: {
      type: Number,
      default: null,
    },
    elapsedSeconds: {
      type: Number,
      default: null,
    },
    durationSeconds: {
      type: Number,
      default: null,
    },

    failReason: {
      type: String,
      default: null,
    },
    alarms: {
      type: Array,
      default: [],
    },
  },
  { timestamps: true },
);

machiningRecordSchema.index({
  requestId: 1,
  machineId: 1,
  jobId: 1,
  status: 1,
});
machiningRecordSchema.index({ machineId: 1, jobId: 1, status: 1 });

export default mongoose.model("MachiningRecord", machiningRecordSchema);
