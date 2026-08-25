// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
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
    errorCode: {
      type: String,
      default: null,
    },
    alarms: {
      type: Array,
      default: [],
    },

    // 의뢰 라벨 스냅샷 — 샘플 하드삭제 후에도 가공완료 목록에 표시
    clinicName: { type: String, default: null },
    patientName: { type: String, default: null },
    tooth: { type: String, default: null },
    lotNumberValue: { type: String, default: null },
    requestCategory: { type: String, default: null },
    source: { type: String, default: null },
    displayLabel: { type: String, default: null },
    // 샘플(의뢰) 하드삭제 시각. 있으면 되돌리기/자주검사 비활성
    requestDeletedAt: { type: Date, default: null, index: true },
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
// last-completed: 장비별 최신 COMPLETED 1건 조회
machiningRecordSchema.index({ machineId: 1, status: 1, completedAt: -1 });

export default mongoose.model("MachiningRecord", machiningRecordSchema);
