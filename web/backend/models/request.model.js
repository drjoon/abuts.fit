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
      material: {
        // 원소재 Heat No.
        type: String,
      },
      part: {
        // 반제품 : CAP + YYMMDD + -AAA
        type: String,
        unique: true,
        sparse: true,
      },
      final: {
        // 완제품 : CA + YYMMDD + -AAA
        type: String,
        unique: true,
        sparse: true,
      },
    },
    assignedMachine: {
      // 가공 직전 배정된 장비 (M3, M4 등)
      type: String,
      default: null,
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
      // esprit-addin: 의뢰별 공정 PRC 파일명(또는 절대경로)
      // - Face Hole 공정: AcroDent/1_Face Hole/
      // - Connection 공정: AcroDent/2_Connection/
      faceHolePrcFileName: String,
      connectionPrcFileName: String,
      workType: String,
      reviewByStage: {
        request: {
          status: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED"],
            default: "PENDING",
          },
          updatedAt: Date,
          updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          reason: String,
        },
        cam: {
          status: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED"],
            default: "PENDING",
          },
          updatedAt: Date,
          updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          reason: String,
        },
        machining: {
          status: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED"],
            default: "PENDING",
          },
          updatedAt: Date,
          updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          reason: String,
        },
        packing: {
          status: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED"],
            default: "PENDING",
          },
          updatedAt: Date,
          updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          reason: String,
        },
        shipping: {
          status: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED"],
            default: "PENDING",
          },
          updatedAt: Date,
          updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          reason: String,
        },
        tracking: {
          status: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED"],
            default: "PENDING",
          },
          updatedAt: Date,
          updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          reason: String,
        },
      },
      rollbackCounts: {
        request: { type: Number, default: 0 },
        cam: { type: Number, default: 0 },
        machining: { type: Number, default: 0 },
        packing: { type: Number, default: 0 },
        shipping: { type: Number, default: 0 },
        tracking: { type: Number, default: 0 },
      },
      stageFiles: {
        machining: {
          fileName: String,
          fileType: String,
          fileSize: Number,
          filePath: String,
          s3Key: String,
          s3Url: String,
          source: {
            type: String,
            enum: ["worker", "manual"],
            default: "manual",
          },
          uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          uploadedAt: {
            type: Date,
            default: Date.now,
          },
        },
        packing: {
          fileName: String,
          fileType: String,
          fileSize: Number,
          filePath: String,
          s3Key: String,
          s3Url: String,
          source: {
            type: String,
            enum: ["worker", "manual"],
            default: "manual",
          },
          uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          uploadedAt: {
            type: Date,
            default: Date.now,
          },
        },
        shipping: {
          fileName: String,
          fileType: String,
          fileSize: Number,
          filePath: String,
          s3Key: String,
          s3Url: String,
          source: {
            type: String,
            enum: ["worker", "manual"],
            default: "manual",
          },
          uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          uploadedAt: {
            type: Date,
            default: Date.now,
          },
        },
        tracking: {
          fileName: String,
          fileType: String,
          fileSize: Number,
          filePath: String,
          s3Key: String,
          s3Url: String,
          source: {
            type: String,
            enum: ["worker", "manual"],
            default: "manual",
          },
          uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          uploadedAt: {
            type: Date,
            default: Date.now,
          },
        },
      },
      file: {
        // s3에 저장된 파일의 메타 데이터를 DB에서 관리
        originalName: String,
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
      camFile: {
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
      ncFile: {
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
      finishLine: {
        version: Number,
        sectionCount: Number,
        maxStepDistance: Number,
        points: {
          type: [[Number]],
          default: undefined,
        },
        pt0: {
          type: [Number],
          default: undefined,
        },
        updatedAt: {
          type: Date,
          default: Date.now,
        },
      },
    },
    // 제조사용 스테이지 (UI 표기용) — status와 동일한 값을 사용한다.
    manufacturerStage: {
      type: String,
      enum: [
        "의뢰",
        "CAM",
        "가공",
        "세척.패킹",
        "포장.발송",
        "추적관리",
        "취소",
      ],
      default: "의뢰",
    },
    // 레거시: 배송 모드 (프론트/백엔드 일부 로직에서 사용)
    shippingMode: {
      type: String,
      enum: ["normal", "express"],
      default: "normal",
    },
    // 레거시: 출고일(또는 희망 출고일) (KST 기준)
    requestedShipDate: Date,

    shippingPackageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShippingPackage",
      default: null,
      index: true,
    },
    // 배송 요청 정보 (원본 - 의뢰자가 신규 의뢰 시 선택)
    originalShipping: {
      mode: {
        type: String,
        enum: ["normal", "express"],
        default: "normal",
      },
      requestedAt: Date, // 의뢰 생성 시각
    },
    // 최종 배송 옵션 (의뢰자가 배송 대기 중 변경 가능)
    finalShipping: {
      mode: {
        type: String,
        enum: ["normal", "express"],
      },
      updatedAt: Date, // 마지막 변경 시각
    },
    // 가상 우편함 할당 주소 (A1A1 ~ C4C4)
    mailboxAddress: {
      type: String,
      default: null,
      index: true,
    },
    // 생산 스케줄 (생산자 관점, 시각 단위 관리)
    productionSchedule: {
      // 예정 시각
      scheduledCamStart: Date, // CAM 시작 예정 시각
      scheduledCamComplete: Date, // CAM 완료 예정 시각 (CAM 시작 + 5분)
      scheduledMachiningStart: Date, // 가공 시작 예정 시각 (CAM 완료 직후)
      scheduledMachiningComplete: Date, // 가공 완료 예정 시각 (가공 시작 + 15분)
      scheduledBatchProcessing: Date, // 세척/검사/포장 예정 시각 (50~100개 모아서 처리)
      scheduledPickupRequest: Date, // 택배 수거 신청 시각 (15:00)
      scheduledShipPickup: Date, // 택배 수거 시각 (매일 16:00)

      // 실제 시각
      actualCamStart: Date,
      actualCamComplete: Date,
      actualMachiningStart: Date,
      actualMachiningComplete: Date,
      actualBatchProcessing: Date,
      actualShipPickup: Date,

      machiningProgress: {
        machineId: String,
        jobId: String,
        phase: String,
        percent: Number,
        startedAt: Date,
        lastTickAt: Date,
        elapsedSeconds: Number,
      },

      machiningRecord: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MachiningRecord",
        default: null,
        index: true,
      },

      // 장비 할당
      assignedMachine: {
        type: String, // machineId (M3, M4 등)
        ref: "CncMachine",
      },
      queuePosition: Number, // 해당 장비 큐에서의 위치
      machiningQty: {
        type: Number,
        default: 1,
      },

      // 직경 정보
      diameter: Number, // 실제 직경 (mm)
      diameterGroup: String, // "6" | "8" | "10" | "12"

      ncPreload: {
        status: {
          type: String,
          enum: ["NONE", "UPLOADING", "READY", "FAILED"],
          default: "NONE",
        },
        programNo: Number,
        machineId: String,
        bridgePath: String,
        updatedAt: Date,
        error: String,
      },
    },

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
      paidAmount: {
        type: Number,
        default: null,
      },
      bonusAmount: {
        type: Number,
        default: null,
      },
    },

    timeline: {
      originalEstimatedShipYmd: String, // 최초 계산된 발송 예정일(YYYY-MM-DD)
      nextEstimatedShipYmd: String, // 재조정된 다음 발송 예정일(YYYY-MM-DD)
      estimatedShipYmd: String, // YYYY-MM-DD 형식 (KST 기준, 발송 예정일)
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
  },
);

requestSchema.index({
  requestorOrganizationId: 1,
  "caseInfos.clinicName": 1,
  "caseInfos.patientName": 1,
  "caseInfos.tooth": 1,
  manufacturerStage: 1,
  createdAt: -1,
});

requestSchema.index({
  requestor: 1,
  "caseInfos.clinicName": 1,
  "caseInfos.patientName": 1,
  "caseInfos.tooth": 1,
  manufacturerStage: 1,
  createdAt: -1,
});

// 대시보드 조회 최적화를 위한 복합 인덱스
requestSchema.index({
  requestorOrganizationId: 1,
  manufacturerStage: 1,
  "caseInfos.implantSystem": 1,
  createdAt: -1,
});

// 제조사 대시보드 조회를 위한 인덱스
requestSchema.index({
  manufacturer: 1,
  manufacturerStage: 1,
  "caseInfos.implantSystem": 1,
  createdAt: -1,
});

// 배송 모드 및 상태 기반 조회를 위한 인덱스
requestSchema.index({
  requestorOrganizationId: 1,
  manufacturerStage: 1,
  shippingMode: 1,
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
