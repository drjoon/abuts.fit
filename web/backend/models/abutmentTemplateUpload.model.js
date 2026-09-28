// 심플어벗 템플릿(.dcm) 업로드 작업. 원본은 열지 않고 S3 보류 경로(hold)에 둔다.
// 관리자가 「열어 보기」하면 격리 경로(quarantine)로 복사해 GuardDuty 검사 → 워커 해석 → AbutmentTemplate 등록.
// uploading → pending_review → scanning → processing → done
//   pending_review → rejected(관리자 폐기) · scanning → rejected(위협·검사 불가) · 어디서든 → failed(시간 초과·오류)
// 관리자가 올린 건은 격리 경로로 바로 올라가고, 검토 없이 complete에서 바로 scanning.
// related files:
// - web/backend/services/abutmentTemplateUpload.service.js
// - web/backend/models/abutmentTemplate.model.js
// - web/backend/controllers/scanbodyLibraries/scanbodyLibrary.controller.js
import mongoose from "mongoose";
import { ABUTMENT_TEMPLATE_KINDS } from "./abutmentTemplate.model.js";

export const ABUTMENT_TEMPLATE_UPLOAD_STATUSES = [
  "uploading",
  "pending_review",
  "scanning",
  "processing",
  "done",
  "rejected",
  "failed",
];

const vec3 = { type: [Number], default: undefined };

const abutmentTemplateUploadSchema = new mongoose.Schema(
  {
    ownerAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    /** 업로드한 사람의 사업자(차단 목록에 같이 넣는다). 관리자는 null. */
    uploaderAnchorId: { type: mongoose.Schema.Types.ObjectId, ref: "BusinessAnchor", default: null },
    fileName: { type: String, required: true },
    declaredSize: { type: Number, default: 0 },
    size: { type: Number, default: 0 },
    sha256: { type: String, default: "" },
    /** 브라우저가 계산해 보낸 값(서버가 범위를 확인했다). 등록 때 그대로 쓴다. */
    meta: {
      kind: { type: String, enum: ABUTMENT_TEMPLATE_KINDS, required: true },
      diameter: { type: String, required: true },
      height: { type: String, default: "" },
      frame: { origin: vec3, axis: vec3, ref: vec3 },
      marginHeightMm: { type: Number, default: 0 },
      maxDiameterMm: { type: Number, default: 0 },
      heightMm: { type: Number, default: 0 },
    },
    /** 검토 전 보류 경로(GuardDuty 보호 밖). 관리자 업로드는 격리 경로로 바로 올라가 비어 있다. */
    holdKey: { type: String, default: "" },
    quarantineKey: { type: String, required: true },
    /** 관리자가 올린 건: 검토 없이 검사로 간다. */
    autoApproved: { type: Boolean, default: false },
    status: { type: String, enum: ABUTMENT_TEMPLATE_UPLOAD_STATUSES, default: "uploading", index: true },
    /** GuardDuty 태그 GuardDutyMalwareScanStatus, 검사를 끈 환경은 "SKIPPED". */
    scanStatus: { type: String, default: "" },
    message: { type: String, default: "" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewReason: { type: String, default: "" },
    markedMalicious: { type: Boolean, default: false },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "AbutmentTemplate", default: null },
    scanStartedAt: { type: Date, default: null },
    processingAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

abutmentTemplateUploadSchema.index({ status: 1, createdAt: 1 });
abutmentTemplateUploadSchema.index({ scanStartedAt: 1 });
abutmentTemplateUploadSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

const AbutmentTemplateUpload = mongoose.model("AbutmentTemplateUpload", abutmentTemplateUploadSchema);

export default AbutmentTemplateUpload;
