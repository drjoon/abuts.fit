import mongoose from "mongoose";

const requestSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      unique: true,
    },
    referenceIds: {
      type: [String],
      index: true,
    },
    lotNumber: {
      type: String,
      unique: true,
      sparse: true,
    },
    requestor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    caseInfos: {
      clinicName: String,
      patientName: String,
      tooth: String,
      implantSystem: String, // e.g. OSSTEM, Straumann (implantCompany)
      implantType: String, // e.g. Regular, Bone Level RC (implantProduct)
      connectionType: String, // e.g. Hex, Non-hex
      maxDiameter: Number,
      connectionDiameter: Number,
      workType: String,
      file: {
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

    // 배송 요청 정보
    shippingMode: {
      type: String,
      enum: ["normal", "express"],
      default: "normal",
    },
    requestedShipDate: Date,

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
  },
  {
    timestamps: true, // createdAt, updatedAt 자동 생성
  }
);

// 의뢰 ID 자동 생성 (YYYYMMDD-000001, YYYYMMDD-000002 ... 날짜별 6자리 숫자 시퀀스)
requestSchema.pre("save", async function (next) {
  if (!this.isNew || this.requestId) {
    return next();
  }

  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const dateStr = `${year}${month}${day}`;

    const prefix = `${dateStr}-`;

    // 오늘 날짜(prefix)에 대해 이미 발급된 의뢰 수를 기준으로 1-based index 계산
    const todayCount = await this.constructor.countDocuments({
      requestId: { $regex: `^${prefix}` },
    });

    const seqNumber = todayCount + 1; // 1 -> 000001, 2 -> 000002 ...
    const seqStr = String(seqNumber).padStart(6, "0");

    this.requestId = `${prefix}${seqStr}`;
    next();
  } catch (error) {
    next(error);
  }
});

// 의뢰 모델 생성
const Request = mongoose.model("Request", requestSchema);

export default Request;
