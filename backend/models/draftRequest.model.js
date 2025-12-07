import mongoose from "mongoose";

const draftFileSchema = new mongoose.Schema(
  {
    // 기존 File 컬렉션의 문서를 참조 (임시 업로드된 파일 메타정보)
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "File",
    },
    originalName: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    mimetype: {
      type: String,
      required: true,
    },
    // File 문서를 사용하지 않는 경우를 대비한 S3 key 직접 저장
    s3Key: {
      type: String,
    },
  },
  { _id: true }
);

const draftCaseSchema = new mongoose.Schema(
  {
    requestor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["draft", "submitted", "cancelled"],
      default: "draft",
    },
    message: {
      type: String,
      default: "",
    },
    caseInfos: {
      clinicName: String,
      patientName: String,
      tooth: String,
      workType: {
        type: String,
        enum: ["abutment", "prosthesis"],
      },
      abutType: String,
      implantSystem: String,
      implantType: String,
      connectionType: String,
    },
    files: [draftFileSchema],
  },
  {
    timestamps: true,
  }
);

const DraftRequest = mongoose.model("DraftRequest", draftCaseSchema);

export default DraftRequest;
