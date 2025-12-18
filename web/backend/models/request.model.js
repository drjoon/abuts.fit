import mongoose from "mongoose";
import crypto from "crypto";

const requestSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      unique: true,
    },
    title: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      default: "",
    },
    referenceIds: {
      // 동일 치과, 환자에 대해 당일 접수된 의뢰 내역은 같이 묶어서 관리
      type: [String], // 예를 들어, 향기로운치과-김혜영의 32, 42, 45 커스텀 어벗 내역이 동시에 들어오면
      index: true, // 32에서는 42,45의 requestId를 referenceIds에 추가
    },
    lotNumber: {
      // 제조사가 관리하는 로트 넘어
      type: String, // YYYYMMDD-AAA 형식
      unique: true, // 년도월날짜-세글자 알파벳 대문자
      sparse: true, // 마지막 3글자는 26진법 표기법이라 보면 도달할 수 없는 값
    },
    requestorOrganizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RequestorOrganization",
      default: null,
      index: true,
    },
    requestor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    manufacturer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    assignedAt: Date,
    caseInfos: {
      clinicName: String,
      patientName: String,
      tooth: String,
      implantManufacturer: String, // e.g. OSSTEM, Straumann (manufacturer)
      implantSystem: String, // e.g. Regular, Bone Level RC (system)
      implantType: String, // e.g. Hex, Non-hex (type)
      maxDiameter: Number,
      connectionDiameter: Number,
      workType: String,
      file: {
        // s3에 저장된 파일의 메타 데이터를 DB에서 관리
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
      // 의뢰인용 상태
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
    // 아래 status1, 2는 제조사 및 관리자용 상태
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
      baseAmount: {
        type: Number,
        default: 0,
      },
      discountAmount: {
        type: Number,
        default: 0,
      },
      currency: {
        type: String,
        default: "KRW",
      },
      rule: {
        type: String,
        default: "",
      },
      discountMeta: {
        last30DaysOrders: Number,
        referralLast30DaysOrders: Number,
        discountPerOrder: Number,
        maxDiscount: Number,
      },
      quotedAt: Date,
    },

    timeline: {
      estimatedCompletion: Date,
      actualCompletion: Date,
    },

    statusHistory: [
      {
        status: String,
        note: String,
        updatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        updatedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    deliveryInfoRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryInfo",
    },

    paymentStatus: {
      type: String,
      enum: ["결제전", "결제완료", "결제취소"],
      default: "결제전",
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

requestSchema.index({
  requestorOrganizationId: 1,
  "caseInfos.clinicName": 1,
  "caseInfos.patientName": 1,
  "caseInfos.tooth": 1,
  status: 1,
  createdAt: -1,
});

requestSchema.index({
  requestor: 1,
  "caseInfos.clinicName": 1,
  "caseInfos.patientName": 1,
  "caseInfos.tooth": 1,
  status: 1,
  createdAt: -1,
});

// 의뢰 ID 자동 생성 (YYYYMMDD-XXXXXXXX)
requestSchema.pre("save", async function (next) {
  if (!this.isNew || this.requestId) {
    return next();
  }

  try {
    const now = new Date();
    // KST 기준 날짜로 requestId prefix 생성
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const year = kst.getUTCFullYear();
    const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
    const day = String(kst.getUTCDate()).padStart(2, "0");
    const dateStr = `${year}${month}${day}`;

    const session = this.$session?.() || null;
    const RequestModel = this.constructor;
    const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const SUFFIX_LEN = 8;
    const MAX_TRIES = 8;

    const makeSuffix = () => {
      const bytes = crypto.randomBytes(SUFFIX_LEN);
      let out = "";
      for (let i = 0; i < SUFFIX_LEN; i += 1) {
        out += ALPHABET[bytes[i] % ALPHABET.length];
      }
      return out;
    };

    for (let attempt = 0; attempt < MAX_TRIES; attempt += 1) {
      const candidate = `${dateStr}-${makeSuffix()}`;
      const exists = await RequestModel.exists({
        requestId: candidate,
      }).session(session || undefined);
      if (!exists) {
        this.requestId = candidate;
        next();
        return;
      }
    }

    next(new Error("requestId 생성에 실패했습니다."));
  } catch (error) {
    next(error);
  }
});

// 의뢰 모델 생성
const Request = mongoose.model("Request", requestSchema);

export default Request;
