// 스캔바디 라이브러리 업로드 작업. 원본은 S3 격리 경로에 두고 GuardDuty 검사가 끝난 뒤에만 연다.
// uploading → scanning → processing → done | rejected(위협·검사 불가·형식) | failed(시간 초과·오류)
// 원본은 처리가 끝나면 지우고, 해시·검사 결과·거절 사유는 기록으로 남긴다.
// related files:
// - web/backend/services/scanbodyLibraryUpload.service.js
// - web/backend/controllers/scanbodyLibraries/scanbodyLibrary.controller.js
import mongoose from "mongoose";

export const SCANBODY_UPLOAD_STATUSES = ["uploading", "scanning", "processing", "done", "rejected", "failed"];

const resultLibrarySchema = new mongoose.Schema(
  {
    libraryId: { type: mongoose.Schema.Types.ObjectId, ref: "ScanbodyLibrary" },
    systemName: String,
    source: String,
    kitCount: Number,
    partCount: Number,
  },
  { _id: false },
);

const scanbodyLibraryUploadSchema = new mongoose.Schema(
  {
    ownerAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    fileName: { type: String, required: true },
    declaredSize: { type: Number, default: 0 },
    size: { type: Number, default: 0 },
    sha256: { type: String, default: "" },
    quarantineKey: { type: String, required: true },
    status: { type: String, enum: SCANBODY_UPLOAD_STATUSES, default: "uploading", index: true },
    /** GuardDuty 태그 GuardDutyMalwareScanStatus, 검사를 끈 환경은 "SKIPPED". */
    scanStatus: { type: String, default: "" },
    message: { type: String, default: "" },
    notes: { type: [String], default: [] },
    libraries: { type: [resultLibrarySchema], default: [] },
    scanStartedAt: { type: Date, default: null },
    processingAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

scanbodyLibraryUploadSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

const ScanbodyLibraryUpload = mongoose.model("ScanbodyLibraryUpload", scanbodyLibraryUploadSchema);

export default ScanbodyLibraryUpload;
