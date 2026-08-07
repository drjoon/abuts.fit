// related files:
// - web/backend/jobs/hourlyRequestBackupWorker.js
// - web/backend/services/requestBackup.service.js
// - web/backend/rules.md
import mongoose from "mongoose";

/**
 * 중요 컬렉션 정기 백업 실행 메타.
 * 백업 파일은 S3/로컬 append-only. 이 컬렉션은 지문/이력/워터마크만 기록하며 삭제하지 않는다.
 */
const requestBackupRunSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["hourly", "weekly", "manual"],
      default: "hourly",
      index: true,
    },
    mode: {
      type: String,
      enum: ["full", "incremental"],
      default: "incremental",
      index: true,
    },
    status: {
      type: String,
      enum: ["skipped", "completed", "failed"],
      required: true,
      index: true,
    },
    reason: { type: String, default: "" },
    fingerprint: { type: String, default: "" },
    previousFingerprint: { type: String, default: "" },
    requestCount: { type: Number, default: 0 },
    stageCounts: { type: mongoose.Schema.Types.Mixed, default: {} },
    collectionCounts: { type: mongoose.Schema.Types.Mixed, default: {} },
    deltaCounts: { type: mongoose.Schema.Types.Mixed, default: {} },
    // 컬렉션별 증분 커서 { maxId, maxUpdatedAt }
    watermarks: { type: mongoose.Schema.Types.Mixed, default: {} },
    // 증분 체인의 기준 full run
    baseRunId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RequestBackupRun",
      default: null,
    },
    storage: {
      type: {
        type: String,
        enum: ["s3", "local", "none", "mixed"],
        default: "none",
      },
      bucket: { type: String, default: "" },
      key: { type: String, default: "" },
      localPath: { type: String, default: "" },
      bytes: { type: Number, default: 0 },
    },
    files: {
      type: [
        {
          collectionName: { type: String, default: "" },
          type: { type: String, enum: ["s3", "local"], default: "local" },
          bucket: { type: String, default: "" },
          key: { type: String, default: "" },
          localPath: { type: String, default: "" },
          bytes: { type: Number, default: 0 },
          count: { type: Number, default: 0 },
        },
      ],
      default: [],
    },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    error: { type: String, default: "" },
  },
  { timestamps: true },
);

requestBackupRunSchema.index({ createdAt: -1 });
requestBackupRunSchema.index({ mode: 1, createdAt: -1 });
requestBackupRunSchema.index({ fingerprint: 1, createdAt: -1 });

const RequestBackupRun = mongoose.model(
  "RequestBackupRun",
  requestBackupRunSchema,
);

export default RequestBackupRun;
