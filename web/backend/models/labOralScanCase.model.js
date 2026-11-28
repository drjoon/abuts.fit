// related files:
// - web/backend/controllers/labOralScanCases/labOralScanCase.controller.js
// - web/backend/modules/labOralScanCases/labOralScanCase.routes.js
// - web/backend/services/labOralScanCaseDesign.service.js
// - web/backend/controllers/ai/customAbutmentDesignChat.controller.js
// 기공소 「어벗 디자인으로 의뢰하기」 스캔 분기. PTX·치과 채팅 없이 자동 디자인 → 생산 Request.
import mongoose from "mongoose";

const labOralScanFileSchema = new mongoose.Schema(
  {
    patientName: { type: String, default: "", trim: true },
    tooth: { type: String, default: "", trim: true },
    scanRole: {
      type: String,
      enum: ["", "upper", "lower", "bite", "other"],
      default: "",
    },
    originalName: { type: String, required: true, trim: true },
    mimetype: { type: String, default: "application/octet-stream", trim: true },
    size: { type: Number, default: 0 },
    s3Key: { type: String, required: true, trim: true },
    uploadedAt: { type: Date, default: null },
  },
  { _id: false },
);

const labOralScanCaseSchema = new mongoose.Schema(
  {
    /** AI 디자인 API의 transferId 자리에 쓰는 공개 키 (LOSC-…) */
    caseId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    labBusinessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      required: true,
      index: true,
    },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    clinicName: { type: String, default: "", trim: true },
    patientName: { type: String, default: "", trim: true },
    memo: { type: String, default: "", trim: true },
    toothWorks: { type: [mongoose.Schema.Types.Mixed], default: [] },
    caseInfos: { type: mongoose.Schema.Types.Mixed, default: undefined },
    files: { type: [labOralScanFileSchema], default: [] },
    status: {
      type: String,
      enum: ["draft", "designing", "confirmed", "cancelled"],
      default: "draft",
      index: true,
    },
    production: {
      customAbutmentPreview: { type: mongoose.Schema.Types.Mixed, default: undefined },
      customAbutmentManualDesign: { type: mongoose.Schema.Types.Mixed, default: undefined },
      relatedRequestIds: {
        type: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Request",
          },
        ],
        default: [],
      },
      confirmedAt: { type: Date, default: null },
      confirmedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
    },
  },
  { timestamps: true },
);

labOralScanCaseSchema.index({
  labBusinessAnchorId: 1,
  status: 1,
  updatedAt: -1,
});

const LabOralScanCase = mongoose.model("LabOralScanCase", labOralScanCaseSchema);

export default LabOralScanCase;
