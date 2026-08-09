// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import mongoose from "mongoose";
import crypto from "crypto";

// related files (request category SSOT):
// - web/backend/controllers/requests/common.requests.controller.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/bg/bg.controller.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/request.ts
export const REQUEST_CATEGORY_VALUES = [
  "order",
  "rnd_sample",
  "copied_sample",
];

const MANUFACTURER_HEX_ROTATION_REGEX = /^헥스\s*[+-]?\d+(?:\.\d+)?\s*도회전$/;
const isCanonicalManufacturerHexRotation = (value) => {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v === "STL모델대로" || v === "헥스30도회전") return true;
  return MANUFACTURER_HEX_ROTATION_REGEX.test(v);
};

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
      value: {
        // 단일 로트번호 : CA + YYMMDD + -AAA (workType에 따라 prefix 변형 가능)
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
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    requestor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    caManufacturer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    assignedAt: Date,
    caseInfos: {
      clinicName: String,
      patientName: String,
      tooth: String,
      implantManufacturer: String, // e.g. OSSTEM, Straumann (manufacturer)
      implantBrand: String,
      implantFamily: String, // e.g. Regular, Mini
      implantType: String, // e.g. Hex, Non-hex (type)
      maxDiameter: Number,
      connectionDiameter: Number,
      totalLength: Number,
      stlMetadataUpdatedAt: Date,
      l1: Number,
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
      hexRotation: {
        version: Number,
        moduleVersion: String,
        beforeToXDeg: Number,
        appliedDeg: Number,
        residualToXDeg: Number,
        method: String,
        samples: Number,
        aligned: Boolean,
        message: String,
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
      // esprit-addin: 의뢰별 공정 PRC 파일명(또는 절대경로)
      // - Face Hole 공정: AcroDent/1_Face Hole/
      // - Connection 공정: AcroDent/2_Connection/
      faceHolePrcFileName: String,
      connectionPrcFileName: String,
      workType: String,
      // 신규의뢰 상세 모달: 커스텀어벗 생산 | 커스텀어벗 디자인+생산
      productMode: {
        type: String,
        enum: ["custom_abutment", "design_custom_abutment"],
      },
      prosthesisType: {
        type: String,
        trim: true,
      },
      memo: {
        type: String,
        trim: true,
      },
      toothWorks: {
        type: [mongoose.Schema.Types.Mixed],
        default: undefined,
      },
      // 기공소(사업체) 의뢰 기본 설정에서 신규 생성 시 스냅샷되는 아노다이징 여부.
      // false이면 제조사 워크시트 카드에 "아노다이징 X" 배지를 노출한다.
      anodizingEnabled: {
        type: Boolean,
        default: true,
      },
      // 유지홈(retentionGroove) 옵션 — 현재 UI 정책은 없음/있음(2단계).
      // legacy shallow 데이터는 none으로 정규화해 사용한다.
      // esprit-addin StepIncrement 매핑의 SSOT 필드.
      retentionGroove: {
        type: String,
        enum: ["none", "shallow", "deep"],
        default: "deep",
      },
      // related files:
      // - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
      // - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
      // 의뢰건 디자인 소프트웨어(신규의뢰 카드 단위 SSOT)
      designSoftware: {
        type: String,
        trim: true,
        maxlength: 120,
      },
      // 제조사 오버라이드 헥스 회전(canonical)
      // - "STL모델대로" | "헥스30도회전" | "헥스X도회전(total)"
      manufacturerHexRotation: {
        type: String,
        validate: {
          validator: (v) => v == null || isCanonicalManufacturerHexRotation(v),
          message:
            "manufacturerHexRotation은 'STL모델대로' | '헥스30도회전' | '헥스X도회전(total)' 형식이어야 합니다.",
        },
      },
      // 의뢰자 헥스 회전 선택값
      requestorHexRotation: {
        type: String,
        default: "STL모델대로",
      },
      // 최종 헥스 회전 값 (제조사 값이 있으면 우선, 없으면 의뢰자 값)
      finalHexRotation: {
        type: String,
        default: "STL모델대로",
      },
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
      // 디자인+생산: 환자 단위로 묶인 구강 스캔 등 추가 첨부
      files: {
        type: [
          {
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
        ],
        default: undefined,
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
      // NC 재생성(재처리) 이력: 프론트/백엔드에서 재생성 요청이 발생한 경우 간단한 이력을 남김
      ncRegenerations: {
        type: [
          {
            type: {
              type: String,
              enum: ["standard", "two-phase"],
              default: "standard",
            },
            createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            createdAt: { type: Date, default: Date.now },
            params: { type: {}, default: undefined },
            _id: false,
          },
        ],
        default: undefined,
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
        // finishline 높이 SSOT
        // - 레거시 top_z 별칭은 사용하지 않고 max_z/min_z로 통일한다.
        // - point도 함께 저장해 downstream에서 동일 기준점을 재사용한다.
        max_z: Number,
        min_z: Number,
        max_z_point: {
          type: [Number],
          default: undefined,
        },
        min_z_point: {
          type: [Number],
          default: undefined,
        },

        updatedAt: {
          type: Date,
          default: Date.now,
        },
      },
    },
    // 제조 공정 단계 SSOT
    // 의뢰 출처 구분 (내부 샘플/테스트용 의뢰 식별)
    source: {
      type: String,
      enum: ["normal", "manufacturer_sample"],
      default: "normal",
      index: true,
    },
    // 의뢰 분류 SSOT
    // - order: 일반 의뢰건
    // - rnd_sample: R&D 보관 샘플
    // - copied_sample: 생산/재가공용 복사 샘플
    requestCategory: {
      type: String,
      enum: REQUEST_CATEGORY_VALUES,
      default: "order",
      index: true,
    },
    rnd: {
      doneAt: {
        type: Date,
        default: null,
        index: true,
      },
      doneBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      doneFromStage: {
        type: String,
        default: null,
      },
      // 가공불가 상태 3단계 SSOT
      // 1) potential: 가공불가 가능성
      // 2) judged: 제조사/관리자 가공불가 판정
      // 3) confirmed: 의뢰자 확인(읽음 처리와 동일 의미)
      unmachinablePotentialAt: {
        type: Date,
        default: null,
        index: true,
      },
      unmachinablePotentialBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      unmachinableAt: {
        type: Date,
        default: null,
        index: true,
      },
      unmachinableBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      unmachinableConfirmedAt: {
        type: Date,
        default: null,
        index: true,
      },
      unmachinableConfirmedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      unmachinableFromStage: {
        type: String,
        default: null,
      },
      unmachinableReason: {
        type: String,
        default: "",
      },
      // 의뢰자가 불완전가공 상태에서 "계속 진행"을 선택한 이력
      requestorContinueAt: {
        type: Date,
        default: null,
      },
      requestorContinueBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      requestorContinueMessage: {
        type: String,
        default: "",
      },
      memo: {
        type: String,
        default: "",
      },
      memoUpdatedAt: {
        type: Date,
        default: null,
      },
      memoUpdatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      // 제조사 헥스 회전/좌표계 전처리 선택값 (canonical)
      // - "STL모델대로" | "헥스30도회전" | "헥스X도회전(total)"
      // related files:
      // - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
      // - web/backend/controllers/bg/bg.controller.js
      // Rhino align 기능이 구성정보 전처리를 대체하므로 개별 구성정보 파일 기반 모드는 사용하지 않는다.
      manufacturerHexRotation: {
        type: String,
        validate: {
          validator: (v) => v == null || isCanonicalManufacturerHexRotation(v),
          message:
            "rnd.manufacturerHexRotation은 'STL모델대로' | '헥스30도회전' | '헥스X도회전(total)' 형식이어야 합니다.",
        },
        default: null,
      },
      manufacturerHexRotationUpdatedAt: {
        type: Date,
        default: null,
      },
      manufacturerHexRotationUpdatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
    },

    // 디자인 파트너 클레임 (design_custom_abutment 준비 큐)
    // 활성 = claimedAt 존재 && deadlineAt > now (만료는 lazy)
    designClaim: {
      claimedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      claimedByName: {
        type: String,
        default: null,
      },
      claimedAt: {
        type: Date,
        default: null,
      },
      deadlineAt: {
        type: Date,
        default: null,
      },
      claimHours: {
        type: Number,
        default: null,
      },
    },

    manufacturerStage: {
      type: String,
      enum: [
        "준비",
        "CAM",
        "가공",
        "세척.패킹",
        "포장.발송",
        "추적관리",
        "취소",
      ],
      default: "준비",
    },
    // 배송 방식 SSOT(표시/조회 편의): finalShipping.mode 와 동기화
    shippingMode: {
      type: String,
      enum: ["normal", "express"],
      default: "normal",
      index: true,
    },
    // 출고일(또는 희망 출고일) (KST 기준)
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
    shippingLabelPrinted: {
      printed: {
        type: Boolean,
        default: false,
      },
      printedAt: {
        type: Date,
        default: null,
      },
      mailboxAddress: {
        type: String,
        default: null,
      },
      snapshotFingerprint: {
        type: String,
        default: null,
      },
      snapshotCapturedAt: {
        type: Date,
        default: null,
      },
      snapshotRequestIds: {
        type: [String],
        default: undefined,
      },
      cachedZplLabels: {
        type: [String],
        default: undefined,
      },
      cachedAddressListRow: {
        type: {},
        default: undefined,
      },
      cachedLabelCount: {
        type: Number,
        default: 0,
      },
    },
    // related files (screw lot tracking):
    // - web/backend/models/systemSettings.model.js
    // - web/backend/controllers/requests/common.requests.controller.js
    // - web/backend/controllers/requests/common.review.controller.js
    // - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
    // 스크류 로트 추적(의뢰별 스냅샷)
    // - packing 승인/수동 할당 시점의 타입/로트번호를 의뢰에 귀속해 이력 추적한다.
    // - 이후 전역 로트 재설정과 무관하게 본 스냅샷은 유지된다.
    screwTracking: {
      screwType: {
        type: String,
        default: null,
      },
      lotNumber: {
        type: String,
        default: "",
      },
      assignedAt: {
        type: Date,
        default: null,
      },
      assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      assignedByName: {
        type: String,
        default: "",
      },
      source: {
        type: String,
        enum: ["manual", "auto"],
        default: "manual",
      },
    },

    shippingWorkflow: {
      code: {
        type: String,
        default: "none",
        enum: [
          "none",
          "printed",
          "accepted",
          "picked_up",
          "completed",
          "canceled",
          "error",
        ],
      },
      label: {
        type: String,
        default: "미처리",
      },
      printedAt: {
        type: Date,
        default: null,
      },
      acceptedAt: {
        type: Date,
        default: null,
      },
      pickedUpAt: {
        type: Date,
        default: null,
      },
      completedAt: {
        type: Date,
        default: null,
      },
      erroredAt: {
        type: Date,
        default: null,
      },
      canceledAt: {
        type: Date,
        default: null,
      },
      trackingStatusCode: {
        type: String,
        default: null,
      },
      trackingStatusText: {
        type: String,
        default: null,
      },
      source: {
        type: String,
        default: null,
      },
      // related files:
      // - web/backend/controllers/requests/shipping.controller.js
      // - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/shipping/components/MailboxGrid.tsx
      // - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/tracking/TrackingPage.tsx
      manualDeliveryMethods: {
        type: [String],
        default: [],
      },
      manualDeliveryMethodsUpdatedAt: {
        type: Date,
        default: null,
      },
      updatedAt: {
        type: Date,
        default: null,
      },
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

      // 신속배송 14:00 완료를 위한 여유 장비 재배치 메타 (빠른 가공 재배치 뱃지)
      fastMachiningRebalance: {
        at: Date,
        fromMachineId: String,
        toMachineId: String,
        fromDiameter: Number,
        toDiameter: Number,
        reason: String,
      },

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
      expressFee: {
        type: Number,
        default: null,
      },
      expressFeeStatus: {
        type: String,
        enum: ["charged", "cancelled"],
      },
      // 디자인비 총액(1어벗당 designFee × 어벗 수). design_custom_abutment 전용.
      designFee: {
        type: Number,
        default: null,
      },
      // 디자인+생산 적용 어벗 수. 재견적 시 생산 단가 복원용.
      abutmentQty: {
        type: Number,
        default: null,
      },
    },

    timeline: {
      originalEstimatedShipYmd: String, // 최초 계산된 발송 예정일(YYYY-MM-DD)
      nextEstimatedShipYmd: String, // 재조정된 다음 발송 예정일(YYYY-MM-DD)
      estimatedShipYmd: String, // YYYY-MM-DD 형식 (KST 기준, 발송 예정일)
      forceTodayShipment: {
        type: Boolean,
        default: false,
      },
      // 약속 출고일 자정 이후 정시/실패 평가 결과
      shipOutcome: {
        status: {
          type: String,
          enum: ["pending", "on_time", "late"],
        },
        evaluatedAt: Date,
        pickedUpYmd: String,
        promisedYmd: String,
      },
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
    selfInspection: {
      confirmed: { type: Boolean, default: false },
      confirmedAt: Date,
      confirmedBy: String,
      overallJudgment: String,
      rows: [
        {
          label: String,
          referenceValue: String,
          criterion: String,
          instrument: String,
          measuredValue: String,
          judgment: String,
          _id: false,
        },
      ],
    },
  },
  {
    timestamps: true, // createdAt, updatedAt 자동 생성
  },
);

requestSchema.index({
  businessAnchorId: 1,
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

requestSchema.index({
  businessAnchorId: 1,
  manufacturerStage: 1,
  "caseInfos.implantBrand": 1,
  createdAt: -1,
});

// CA 제조사 대시보드 조회를 위한 인덱스
// 쿼리: caManufacturer + manufacturerStage + implantBrand 필터
requestSchema.index({
  caManufacturer: 1,
  manufacturerStage: 1,
  createdAt: -1,
});

requestSchema.index({
  businessAnchorId: 1,
  manufacturerStage: 1,
});

requestSchema.index({ requestCategory: 1, manufacturerStage: 1, createdAt: -1 });

// 관리자 모니터링/기간 필터 목록·집계 (createdAt range sort/count)
requestSchema.index({ createdAt: -1, _id: -1 });

// requestCategory SSOT 보호
// - source / rnd.doneAt 변경 이벤트가 발생할 때만 requestCategory를 동기화한다.
// - read 경로에서의 추정/보정은 하지 않는다.
requestSchema.pre("save", function (next) {
  const categoryRaw = String(this.requestCategory || "").trim();
  const sourceRaw = String(this.source || "").trim();

  if (!categoryRaw) {
    this.requestCategory = "order";
  }

  if (sourceRaw === "manufacturer_sample") {
    this.requestCategory = this.rnd?.doneAt ? "rnd_sample" : "copied_sample";
  } else if (sourceRaw === "normal" && this.requestCategory !== "order") {
    this.requestCategory = "order";
  }

  next();
});

// 의뢰 ID 자동 생성 (YYYYMMDD-XXXXXXXX)
requestSchema.pre("save", async function (next) {
  if (!this.isNew || this.requestId) {
    return next();
  }

  try {
    const now = new Date();
    // KST 기준 날짜로 requestId prefix 생성
    const kstDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const dateStr = kstDate.replace(/-/g, "");

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

// 성능 최적화를 위한 복합 인덱스
requestSchema.index({
  businessAnchorId: 1,
  manufacturerStage: 1,
  createdAt: -1,
});
requestSchema.index({ requestor: 1, status: 1 });

// 워크시트 조회 성능 최적화 (제조사 필터링)
requestSchema.index({
  manufacturerStage: 1,
  caManufacturer: 1,
  createdAt: -1,
});

// 배송 워크시트 조회 최적화
requestSchema.index({
  manufacturerStage: 1,
  "timeline.estimatedShipYmd": 1,
  createdAt: -1,
});

// 우편함 요약 조회 최적화 (포장.발송/추적관리 + 우편함 주소)
requestSchema.index({
  manufacturerStage: 1,
  mailboxAddress: 1,
  caManufacturer: 1,
  createdAt: -1,
});

// 디자인 클레임 목록 필터
requestSchema.index({
  "designClaim.claimedBy": 1,
  "designClaim.deadlineAt": 1,
});

// 추적관리(pre-pickup 후보) 조회 최적화
requestSchema.index({
  manufacturerStage: 1,
  "shippingWorkflow.code": 1,
  deliveryInfoRef: 1,
  caManufacturer: 1,
  createdAt: -1,
});

// 의뢰 모델 생성
const Request = mongoose.model("Request", requestSchema);

export default Request;
