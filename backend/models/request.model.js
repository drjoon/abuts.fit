import mongoose from "mongoose";

const requestSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      unique: true,
    },
    lotNumber: {
      type: String,
      unique: true,
      sparse: true,
    },
    title: {
      type: String,
      required: [true, "제목은 필수 입력 항목입니다."],
      trim: true,
    },
    description: {
      type: String,
    },
    requirements: {
      type: String,
    },
    requestor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    manufacturer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // 추가된 필드들
    referenceId: {
      type: [String],
      index: true,
    },
    dentistName: {
      type: String,
    },
    patientName: {
      type: String,
    },
    tooth: {
      type: String,
    },

    status: {
      type: String,
      enum: [
        "의뢰접수",
        "가공전",
        "가공후",
        "배송대기",
        "배송중",
        "완료",
        "취소",
      ],
      default: "의뢰접수",
    },
    // 상위 공정 상태 (의뢰접수, 가공, 세척/검사/포장, 배송, 완료, 취소)
    status1: {
      type: String,
      enum: ["의뢰접수", "가공", "세척/검사/포장", "배송", "완료", "취소"],
      default: "의뢰접수",
    },
    // 공정 내 세부 단계 (없음, 전, 중, 후)
    status2: {
      type: String,
      enum: ["없음", "전", "중", "후"],
      default: "없음",
    },
    priority: {
      type: String,
      enum: ["낮음", "보통", "높음"],
      default: "보통",
    },

    // Specifications 통합
    specifications: {
      implantSystem: String, // e.g. OSSTEM, Straumann (implantCompany)
      implantType: String, // e.g. Regular, Bone Level RC (implantProduct)
      connectionType: String, // e.g. Hex, Non-hex

      maxDiameter: Number,
      connectionDiameter: Number,

      implantSize: String, // e.g. 4.3x10mm
      height: String, // e.g. 5mm
      angle: String, // e.g. 15도
      material: String, // e.g. 티타늄
    },

    // Legacy fields for compatibility (optional to keep or remove, keeping for safety but marking deprecated)
    implantManufacturer: {
      type: String,
      // required: true, -> making optional as we move to specifications
    },
    implantSystemLegacy: {
      // Renamed to avoid conflict if needed, or just remove required
      type: String,
      alias: "implantSystem",
    },
    implantTypeLegacy: {
      type: String,
      alias: "implantType",
    },

    connection: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Connection",
      default: null,
    },
    files: [
      {
        fileName: String,
        fileType: String,
        fileSize: Number,
        filePath: String,
        s3Key: String,
        s3Url: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    patientCases: [
      {
        patientName: String,
        teeth: [String],
        files: [
          {
            filename: String,
            workType: String,
          },
        ],
        note: String,
      },
    ],
    messages: [
      {
        sender: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        content: {
          type: String,
          required: true,
        },
        attachments: [
          {
            fileName: String,
            fileType: String,
            fileSize: Number,
            filePath: String,
            s3Key: String,
            s3Url: String,
          },
        ],
        createdAt: {
          type: Date,
          default: Date.now,
        },
        isRead: {
          type: Boolean,
          default: false,
        },
      },
    ],
    price: {
      amount: {
        type: Number,
        default: 0,
      },
      currency: {
        type: String,
        default: "KRW",
      },
      quotedAt: Date,
    },
    timeline: {
      estimatedCompletion: Date,
      actualCompletion: Date,
    },
    deliveryInfo: {
      address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String,
      },
      trackingNumber: String,
      carrier: String,
      shippedAt: Date,
      deliveredAt: Date,
    },
    paymentStatus: {
      type: String,
      enum: ["미결제", "결제 대기", "결제 완료", "환불"],
      default: "미결제",
    },
    paymentDetails: {
      method: String,
      transactionId: String,
      paidAt: Date,
      amount: Number,
    },
    statusHistory: [
      {
        status: { type: String, required: true },
        note: String,
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    feedback: {
      rating: {
        type: Number,
        min: 1,
        max: 5,
      },
      comment: String,
      givenAt: Date,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt 자동 생성
  }
);

// 의뢰 ID 자동 생성 (REQ-001, REQ-002, ...)
requestSchema.pre("save", async function (next) {
  if (!this.isNew) {
    return next();
  }

  try {
    const count = await this.constructor.countDocuments({});
    const paddedCount = String(count + 1).padStart(3, "0");
    this.requestId = `REQ-${paddedCount}`;
    next();
  } catch (error) {
    next(error);
  }
});

// 의뢰 모델 생성
const Request = mongoose.model("Request", requestSchema);

export default Request;
