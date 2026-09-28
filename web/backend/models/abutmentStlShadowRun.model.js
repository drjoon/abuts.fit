// related files:
// - web/backend/services/abutmentStl/shadow.service.js
// - web/backend/jobs/abutmentStlShadowWorker.js
// - web/backend/scripts/abutment-stl-js/shadow-report.js
//
// Rhino 2-filled 등록마다 같은 원본을 JS 파이프라인으로 돌린 비교 기록. 의뢰 문서는 건드리지 않는다.
import mongoose from "mongoose";

const abutmentStlShadowRunSchema = new mongoose.Schema(
  {
    request: { type: mongoose.Schema.Types.ObjectId, ref: "Request", index: true },
    requestId: { type: String, index: true },
    /** request + Rhino 2-filled 등록 시각. 같은 등록을 두 번 돌리지 않는다. */
    dedupeKey: { type: String, required: true, unique: true },
    trigger: { type: String, enum: ["register-file", "backfill", "manual"], default: "register-file" },
    status: {
      type: String,
      enum: ["queued", "running", "done", "failed"],
      default: "queued",
      index: true,
    },
    attempts: { type: Number, default: 0 },
    queuedAt: { type: Date, default: Date.now },
    startedAt: Date,
    finishedAt: Date,
    error: String,
    input: {
      originalS3Key: String,
      rhinoFilledS3Key: String,
      rhinoFilledUploadedAt: Date,
      targetDiameter: Number,
      implantProfile: { type: mongoose.Schema.Types.Mixed, default: undefined },
      screwholeParams: { type: mongoose.Schema.Types.Mixed, default: undefined },
    },
    /** 등록 시점 Rhino 기준값(finishLine·hexRotation·메타). */
    rhino: { type: mongoose.Schema.Types.Mixed, default: undefined },
    jsVersion: String,
    /** evaluateAgainstRhino 결과(outputBuffer 제외). */
    result: { type: mongoose.Schema.Types.Mixed, default: undefined },
    jsOutputS3Key: String,
  },
  { timestamps: true },
);

abutmentStlShadowRunSchema.index({ status: 1, queuedAt: 1 });
abutmentStlShadowRunSchema.index({ createdAt: -1 });

export default mongoose.models.AbutmentStlShadowRun ||
  mongoose.model("AbutmentStlShadowRun", abutmentStlShadowRunSchema);
