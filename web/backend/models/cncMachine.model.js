import mongoose from "mongoose";

const normalizeDiameterGroup = (v) => {
  const raw = String(v || "").trim();
  if (!raw) return raw;
  if (raw.includes("+")) return "12";
  const numeric = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
  if (Number.isFinite(numeric) && numeric > 10) return "12";
  return raw;
};

const cncMachineSchema = new mongoose.Schema(
  {
    machineId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "maintenance", "inactive"],
      default: "active",
    },
    maxModelDiameterGroups: {
      type: [
        {
          type: String,
          enum: ["6", "8", "10", "12"],
          set: normalizeDiameterGroup,
        },
      ],
      default: ["12"],
    },
    currentMaterial: {
      materialType: {
        type: String,
        trim: true,
        default: "",
      },
      heatNo: {
        type: String,
        trim: true,
        default: "",
      },
      diameter: {
        type: Number,
        required: true,
      },
      diameterGroup: {
        type: String,
        enum: ["6", "8", "10", "12"],
        set: normalizeDiameterGroup,
        required: true,
      },
      remainingLength: {
        type: Number,
        default: 0,
      },
      setAt: Date,
      setBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
    scheduledMaterialChange: {
      targetTime: Date,
      newDiameter: Number,
      newDiameterGroup: {
        type: String,
        enum: ["6", "8", "10", "12"],
        set: normalizeDiameterGroup,
      },
      scheduledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      scheduledAt: Date,
      notes: String,
    },
    dummySettings: {
      enabled: {
        type: Boolean,
        default: true,
      },
      programName: {
        type: String,
        trim: true,
        default: "O0100",
      },
      schedules: [
        {
          time: {
            type: String,
            default: "08:00",
          },
          enabled: {
            type: Boolean,
            default: true,
          },
        },
      ],
      excludeHolidays: {
        type: Boolean,
        default: false,
      },
      // 마지막 더미 실행 시각(YYYY-MM-DD HH:mm, KST 기준)
      lastRunKey: {
        type: String,
        default: null,
      },
    },
    uiSnapshot: {
      motorTemperatureRows: {
        type: [
          {
            name: { type: String, trim: true, default: "" },
            temperature: { type: Number, default: null },
          },
        ],
        default: [],
      },
      toolLifeRows: {
        type: [
          {
            toolNum: { type: Number, default: 0 },
            useCount: { type: Number, default: 0 },
            configCount: { type: Number, default: 0 },
            warningCount: { type: Number, default: 0 },
            use: { type: Boolean, default: true },
          },
        ],
        default: [],
      },
      toolOffsetRows: {
        type: [
          {
            toolNum: { type: Number, default: 0 },
            geoX: { type: Number, default: 0 },
            geoY: { type: Number, default: 0 },
            geoZ: { type: Number, default: 0 },
            geoR: { type: Number, default: 0 },
            wearX: { type: Number, default: 0 },
            wearY: { type: Number, default: 0 },
            wearZ: { type: Number, default: 0 },
            wearR: { type: Number, default: 0 },
            tipL: { type: Number, default: 0 },
          },
        ],
        default: [],
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },
    tooling: {
      observations: {
        type: [
          {
            toolNum: { type: Number, default: 0 },
            useCount: { type: Number, default: 0 },
            configCount: { type: Number, default: 0 },
            warningCount: { type: Number, default: 0 },
            use: { type: Boolean, default: true },
            source: { type: String, trim: true, default: "snapshot" },
            observedAt: { type: Date, default: Date.now },
          },
        ],
        default: [],
      },
      replacementHistory: {
        type: [
          {
            toolNum: { type: Number, default: 0 },
            kind: {
              type: String,
              enum: ["normal", "abnormal"],
              default: "normal",
            },
            note: { type: String, trim: true, default: "" },
            observedUseCount: { type: Number, default: 0 },
            observedConfigCount: { type: Number, default: 0 },
            observedWarningCount: { type: Number, default: 0 },
            predictedReplacementUseCount: { type: Number, default: 0 },
            createdAt: { type: Date, default: Date.now },
            createdBy: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
              default: null,
            },
            createdByName: { type: String, trim: true, default: "" },
          },
        ],
        default: [],
      },
      // 슬롯별 공구 메타데이터 및 교체 워크플로우 상태
      // 교체 흐름: mounted → removing(해제요청) → removed(실제교체대기) → mounting(장착중) → mounted
      toolSlots: {
        type: [
          {
            // 슬롯 번호 (toolLifeRows.toolNum과 동일 키로 매핑)
            toolNum: { type: Number, required: true },
            // 공구 명칭 (예: "드릴 1.2mm", "밀링 D3.0")
            toolName: { type: String, trim: true, default: "" },
            // 공구 타입 분류 (drill | mill | reamer | other)
            toolType: {
              type: String,
              enum: ["drill", "mill", "reamer", "other"],
              default: "other",
            },
            // 공구 메모 (직경, 제조사, 로트번호 등 자유 기입)
            toolNote: { type: String, trim: true, default: "" },
            // 현재 교체 워크플로우 상태
            // - mounted: 장착 완료(정상 운용)
            // - removing: 작업자가 웹앱에서 해제 요청(장비에서 공구 빼는 중)
            // - removed: 장비에서 실제 공구 제거 완료 대기 (교체 완료 확인 전)
            replacementStatus: {
              type: String,
              enum: ["mounted", "removing", "removed"],
              default: "mounted",
            },
            // 해제 요청 시각 (removing 상태로 전환된 시각)
            removalRequestedAt: { type: Date, default: null },
            // 해제 요청자
            removalRequestedBy: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
              default: null,
            },
            removalRequestedByName: { type: String, trim: true, default: "" },
            // 가장 최근 교체 완료 시각
            lastReplacedAt: { type: Date, default: null },
            // 가장 최근 교체자
            lastReplacedBy: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
              default: null,
            },
            lastReplacedByName: { type: String, trim: true, default: "" },
          },
        ],
        default: [],
      },
      // 슬롯별 가공 통계: 가공 완료 시 bridge-server가 백엔드에 notify할 때 집계
      // machiningStats는 장비 단위가 아니라 슬롯(공구) 단위 누적 통계다.
      machiningStats: {
        type: [
          {
            // 슬롯 번호
            toolNum: { type: Number, required: true },
            // 전체 누적 가공 건수 (교체해도 리셋하지 않는 절대 누계)
            totalJobCount: { type: Number, default: 0 },
            // 전체 누적 가공 시간(초) (교체해도 리셋하지 않는 절대 누계)
            totalMachiningSeconds: { type: Number, default: 0 },
            // 현재 장착 이후(교체 기준) 가공 건수
            currentJobCount: { type: Number, default: 0 },
            // 현재 장착 이후(교체 기준) 가공 시간(초)
            currentMachiningSeconds: { type: Number, default: 0 },
            // 마지막 가공 완료 시각
            lastJobAt: { type: Date, default: null },
            // 최근 30일 일별 가공 건수 버킷 [{ymd, count, seconds}]
            // ymd: "YYYY-MM-DD" (KST 기준)
            dailyBuckets: {
              type: [
                {
                  ymd: { type: String, trim: true },
                  count: { type: Number, default: 0 },
                  seconds: { type: Number, default: 0 },
                },
              ],
              default: [],
            },
          },
        ],
        default: [],
      },
    },
    bridgeQueueSnapshot: {
      jobs: [
        {
          id: { type: String, trim: true },
          kind: { type: String, trim: true },
          fileName: { type: String, trim: true },
          originalFileName: { type: String, trim: true },
          bridgePath: { type: String, trim: true },
          s3Key: { type: String, trim: true },
          s3Bucket: { type: String, trim: true },
          fileSize: { type: Number },
          contentType: { type: String, trim: true },
          requestId: { type: String, trim: true },
          // 큐 우선순위: 1(장비페이지) > 2(가공페이지)
          priority: { type: Number, default: 2 },
          // 자동 시작 허용(장비페이지: next up play, 가공페이지: allowAutoStart=true일 때)
          allowAutoStart: { type: Boolean, default: false },
          programNo: { type: Number },
          programName: { type: String, trim: true },
          qty: { type: Number },
          createdAtUtc: { type: Date },
          source: { type: String, trim: true },
          paused: { type: Boolean, default: false },
        },
      ],
      updatedAt: { type: Date, default: null },
    },
    bridgeQueueSyncedAt: {
      type: Date,
      default: null,
    },
    specifications: {
      maxDiameter: Number,
      minDiameter: Number,
      manufacturer: String,
      model: String,
    },
    location: String,
    notes: String,
  },
  {
    timestamps: true,
  },
);

cncMachineSchema.index({ status: 1 });
cncMachineSchema.index({ "currentMaterial.diameterGroup": 1 });

const CncMachine = mongoose.model("CncMachine", cncMachineSchema);

export default CncMachine;
