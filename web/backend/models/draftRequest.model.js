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
  { _id: false },
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
        implantManufacturer: String,
        implantBrand: String,
        implantFamily: String,
        implantType: String,
        maxDiameter: Number,
        connectionDiameter: Number,
        totalLength: Number,
        taperAngle: Number,
        tiltAxisVector: {
          x: Number,
          y: Number,
          z: Number,
        },
        frontPoint: {
          x: Number,
          y: Number,
          z: Number,
        },
        taperGuide: mongoose.Schema.Types.Mixed,
        newSystemRequest: {
          requested: { type: Boolean, default: false },
          manufacturer: String,
          brand: String,
          message: String,
          free: { type: Boolean, default: false },
          tag: String,
        },
        // related files:
        // - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
        // - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
        // - web/backend/controllers/chats/chat.controller.js
        // practice 전송 라우팅 SSOT (치과 -> 기공소)
        // 주의: newSystemRequest.manufacturer(기공소 -> 제조사 루트)와 절대 혼용하지 않는다.
        practiceRouting: {
          targetLabAnchorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BusinessAnchor",
            default: null,
          },
          targetLabName: {
            type: String,
            default: "",
            trim: true,
          },
        },
        workType: {
          type: String,
          enum: ["abutment", "crown"],
        },
        // 신규의뢰 상세 모달: 커스텀어벗 | 디자인+커스텀어벗
        productMode: {
          type: String,
          enum: ["custom_abutment", "design_custom_abutment"],
          default: "custom_abutment",
        },
        // 디자인+커스텀어벗: 보철물 형태
        prosthesisType: {
          type: String,
          trim: true,
          default: "",
        },
        // 디자인+커스텀어벗: 자유 메모
        memo: {
          type: String,
          trim: true,
          default: "",
        },
        // 디자인+커스텀어벗: practice transfers 보철물 치식
        toothWorks: {
          type: [mongoose.Schema.Types.Mixed],
          default: [],
        },
        // 유지홈(retentionGroove) — Request 승격 전 none/deep으로 정규화.
        // legacy shallow 데이터는 none으로 취급한다.
        retentionGroove: {
          type: String,
          enum: ["none", "shallow", "deep"],
          default: "deep",
        },
        // related files:
        // - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
        // - web/backend/controllers/requests/creation.from-draft.controller.js
        // 의뢰건 디자인 소프트웨어(신규의뢰 카드 단위 SSOT)
        designSoftware: {
          type: String,
          trim: true,
          maxlength: 120,
        },
        // 의뢰자 헥스 회전 선택값(canonical)
        requestorHexRotation: {
          type: String,
          default: "STL모델대로",
        },
        // 배송 방식: 묶음(normal) | 신속(express)
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
  },
);

const DraftRequest = mongoose.model("DraftRequest", draftCaseSchema);

export default DraftRequest;
