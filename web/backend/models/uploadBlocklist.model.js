// 악성 파일을 올린 사용자 차단 목록. GuardDuty가 위협을 찾았거나 관리자가 악성으로 폐기하면 추가한다.
// 차단된 사용자(userId) 또는 그 사업자(businessAnchorId)는 스캔바디 라이브러리·심플어벗 템플릿을 새로 올릴 수 없다.
// 해제는 active=false로 남긴다(기록 유지). 활성 항목은 사용자당 하나.
// related files:
// - web/backend/services/uploadBlocklist.service.js
// - web/backend/controllers/scanbodyLibraries/scanbodyLibrary.controller.js
import mongoose from "mongoose";

export const UPLOAD_BLOCK_SOURCES = ["guardduty", "admin"];

const uploadBlocklistSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    reason: { type: String, default: "" },
    source: { type: String, enum: UPLOAD_BLOCK_SOURCES, required: true },
    /** 계기가 된 업로드. kind: library | template */
    uploadKind: { type: String, default: "" },
    uploadId: { type: mongoose.Schema.Types.ObjectId, default: null },
    fileName: { type: String, default: "" },
    /** 관리자 폐기면 그 관리자, GuardDuty면 null. */
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    active: { type: Boolean, default: true, index: true },
    unblockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    unblockedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

uploadBlocklistSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { active: true }, name: "active_user_unique" },
);

const UploadBlocklist = mongoose.model("UploadBlocklist", uploadBlocklistSchema);

export default UploadBlocklist;
