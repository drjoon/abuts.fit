import mongoose from "mongoose";

const draftFileSchema = new mongoose.Schema(
  {
    // 기존 File 컬렉션의 문서를 참조 (임시 업로드된 파일 메타정보)
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "File",
    },
    originalName: String,
    size: Number,
    mimetype: String,
    // File 문서를 사용하지 않는 경우를 대비한 S3 key 직접 저장
    s3Key: String,
  },
  { _id: false }
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
    caseInfos: [
      {
        // 이 case 에 연결된 파일 메타정보 (임시 업로드 파일)
        file: draftFileSchema,
        clinicName: String,
        patientName: String,
        tooth: String,
        implantSystem: String,
        implantType: String,
        connectionType: String,
        maxDiameter: Number,
        connectionDiameter: Number,
        workType: {
          type: String,
          enum: ["abutment", "crown"],
        },
        // 배송 요청 정보
        shippingMode: {
          type: String,
          enum: ["normal", "express"],
          default: "normal",
        },
        requestedShipDate: Date,
      },
    ],
  },
  {
    timestamps: true,
  }
);

const DraftRequest = mongoose.model("DraftRequest", draftCaseSchema);

export default DraftRequest;
