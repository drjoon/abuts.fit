// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/controllers/practiceTransfers/practiceTransferSettings.controller.js
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
import mongoose from "mongoose";

const MANUFACTURER_HEX_PLUS_MODES = new Set(["STL모델+", "헥스30+"]);
const MANUFACTURER_HEX_ROTATION_REGEX = /^헥스\s*[+-]?\d+(?:\.\d+)?\s*도회전$/;
const isCanonicalManufacturerHexRotation = (value) => {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v === "STL모델대로" || v === "헥스30도회전") return true;
  if (MANUFACTURER_HEX_PLUS_MODES.has(v)) return true;
  return MANUFACTURER_HEX_ROTATION_REGEX.test(v);
};

const businessAnchorSchema = new mongoose.Schema(
  {
    businessNumberNormalized: {
      type: String,
      required: true,
      // unique는 (BN + businessType) 복합 — 동일 법인의 role별 사업부 앵커 허용
      index: true,
      trim: true,
    },
    businessType: {
      type: String,
      enum: [
        "requestor",
        "salesman",
        "manufacturer",
        "internalLab",
        "devops",
        "admin",
        "practice",
        "labTeam",
        "salesTeam",
      ],
      default: "requestor",
      index: true,
    },
    /**
     * 동일 법인(사업자등록) 하위 조직.
     * 예: admin「어벗츠 주식회사」← internalLab「기공사업부」
     */
    parentBusinessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    // 의뢰자 역할 XOR: practice=치과(기공실), lab=기공소
    // related files:
    // - web/backend/utils/requestorCapabilities.js
    // - web/frontend/src/shared/business/requestorCapabilities.ts
    requestorKind: {
      type: String,
      default: null,
      index: true,
      validate: {
        validator: (v) => v == null || v === "practice" || v === "lab",
        message: "requestorKind must be practice or lab",
      },
    },
    // 이용 서비스: paid-only. free는 폐기(읽기 시 paid 승격).
    requestorServices: {
      free: { type: Boolean, default: false },
      paid: { type: Boolean, default: false },
    },
    // 레거시. 치과 멤버십 구독 폐지. 신규 과금·단가 분기에 쓰지 않음.
    practiceMembershipActive: {
      type: Boolean,
      default: false,
      index: true,
    },
    practiceMembershipCancelAtPeriodEnd: {
      type: Boolean,
      default: false,
      index: true,
    },
    practiceMembershipNextBillingAt: {
      type: Date,
      default: null,
      index: true,
    },
    practiceMembershipStartedAt: {
      type: Date,
      default: null,
    },
    practiceMembershipCanceledAt: {
      type: Date,
      default: null,
    },
    // 레거시 — normalize/백필·resolve 폴백만. 신규 쓰기 금지.
    requestorCapabilities: {
      practice: { type: Boolean, default: false },
      lab: { type: Boolean, default: false },
    },
    /**
     * 데모 모드(의뢰자). 신규 가입 시 true + 데모 크레딧(100만 원, 30일).
     * 소진·기간 만료·사용자/관리자 실사용 전환 시 false + demoModeExitedAt(+잔여 회수).
     * related: web/backend/controllers/businesses/business.demoMode.util.js
     */
    demoMode: {
      type: Boolean,
      default: false,
      index: true,
    },
    demoModeStartedAt: {
      type: Date,
      default: null,
    },
    demoModeExitedAt: {
      type: Date,
      default: null,
      index: true,
    },
    // 개발운영사 지정: 의뢰자 사업자에 디자인 큐(사이드바·API) 접근 허용
    // related files:
    // - web/backend/utils/designAccess.js
    // - web/backend/modules/devops/designAccess.routes.js
    // - web/frontend/src/pages/devops/components/DesignerAssignmentTab.tsx
    designAccessEnabled: {
      type: Boolean,
      default: false,
      index: true,
    },
    // 어벗츠 인증 기공소(ON): 치과의 자동 매칭 의뢰 공개 풀에 참여
    // related files:
    // - web/backend/utils/practiceTransferAutoMatch.js
    // - web/backend/utils/abutsLabCertification.js
    // - web/backend/modules/devops/practiceTransferAutoMatch.routes.js
    // - web/backend/services/labAutoMatchParticipation.service.js
    // - web/frontend/src/pages/devops/components/PracticeTransferAutoMatchTab.tsx
    practiceTransferAutoMatchEnabled: {
      type: Boolean,
      default: false,
      index: true,
    },
    // 기공소 어벗츠 인증 신청·기공 테스트·메모 (가입 시 미신청)
    abutsLabCertification: {
      status: {
        type: String,
        enum: ["none", "applied", "testing", "certified", "rejected"],
        default: "none",
        index: true,
      },
      testStatus: {
        type: String,
        enum: ["none", "pending", "passed", "failed"],
        default: "none",
      },
      memo: {
        type: String,
        default: "",
        maxlength: 2000,
      },
      appliedAt: { type: Date, default: null },
      testedAt: { type: Date, default: null },
      certifiedAt: { type: Date, default: null },
      rejectedAt: { type: Date, default: null },
    },
    // 월 참여 구독(해지 예약·다음 결제일). 활성 여부는 practiceTransferAutoMatchEnabled.
    autoMatchParticipationCancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    autoMatchParticipationNextBillingAt: {
      type: Date,
      default: null,
      index: true,
    },
    autoMatchParticipationStartedAt: {
      type: Date,
      default: null,
    },
    autoMatchParticipationCanceledAt: {
      type: Date,
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["draft", "active", "verified", "inactive", "merged"],
      default: "active",
      index: true,
    },
    primaryContactUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    referredByAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    defaultReferralAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    // 사업자 메타데이터 (AI 파싱 후 사용자 확인/검증을 거친 데이터)
    // 주의: extracted 필드는 제거됨 (2026-03-31)
    // AI 파싱 결과도 사용자 확인/검증을 거치므로 metadata가 SSOT
    metadata: {
      companyName: { type: String, default: "" },
      representativeName: { type: String, default: "" },
      address: { type: String, default: "" },
      addressDetail: { type: String, default: "" },
      zipCode: { type: String, default: "" },
      phoneNumber: { type: String, default: "" },
      email: { type: String, default: "" },
      businessItem: { type: String, default: "" }, // 종목
      businessType: { type: String, default: "" }, // 업태 (구 businessCategory)
      startDate: { type: String, default: "" },
      businessNumber: { type: String, default: "" },
    },
    verification: {
      verified: { type: Boolean, default: false },
      verifiedAt: { type: Date, default: null },
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
    },
    businessLicense: {
      s3Key: { type: String, default: "" },
      fileId: { type: String, default: "" },
      uploadedAt: { type: Date, default: null },
    },
    payoutAccount: {
      bankName: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      holderName: { type: String, default: "" },
      updatedAt: { type: Date, default: null },
    },
    payoutRates: {
      manufacturerRate: { type: Number, default: 0, min: 0, max: 1 },
      devopsRate: { type: Number, default: 0.1, min: 0, max: 1 },
      salesmanRate: { type: Number, default: 0.3, min: 0, max: 1 },
      adminRate: { type: Number, default: 0.4, min: 0, max: 1 },
      // 기공의뢰 플랫폼 수수료율.
      // - subcontractFeeRate: 어벗츠 원청을 타 기공소가 하청 수행할 때 (기본 15%)
      // - platformFeeRate: 레거시 매칭 성공 수수료 (경로 B 자체 수행은 0)
      // - directPlatformFeeEnabled: 지정(direct) 수수료 적용 on/off(기본 off=무료)
      // - directPlatformFeeRate: 지정 적용 on일 때 요율 (기본 5%)
      platformFeeRate: { type: Number, default: 0.1, min: 0, max: 1 },
      subcontractFeeRate: { type: Number, default: 0.15, min: 0, max: 1 },
      directPlatformFeeEnabled: { type: Boolean, default: false },
      directPlatformFeeRate: { type: Number, default: 0.05, min: 0, max: 1 },
      // 기공소 자동 매칭 월 참여 수수료(원). 정책상 0 고정(성공 %만 과금). 관리자「기공소 매칭」.
      autoMatchMonthlyFee: { type: Number, default: 0, min: 0 },
      // 레거시 2단계 필드. 신규 저장은 platformFeeRate. 읽기는 resolvePlatformFeeRate fallback.
      partnerFeeRate: { type: Number, default: 0, min: 0, max: 1 },
      nonPartnerFeeRate: { type: Number, default: 0.1, min: 0, max: 1 },
      updatedAt: { type: Date, default: null },
    },
    shippingPolicy: {
      weeklyBatchDays: {
        type: [String],
        default: [],
        enum: ["mon", "tue", "wed", "thu", "fri"],
      },
      // 신규의뢰 첨부 시 적용할 기본 배송 방식 (묶음/신속)
      defaultShippingMode: {
        type: String,
        enum: ["normal", "express"],
        default: "normal",
      },
      leadTimes: {
        d6: {
          minBusinessDays: { type: Number, default: 1, min: 0 },
          maxBusinessDays: { type: Number, default: 2, min: 0 },
        },
        d8: {
          minBusinessDays: { type: Number, default: 1, min: 0 },
          maxBusinessDays: { type: Number, default: 2, min: 0 },
        },
        d10: {
          minBusinessDays: { type: Number, default: 1, min: 0 },
          maxBusinessDays: { type: Number, default: 2, min: 0 },
        },
        d12: {
          minBusinessDays: { type: Number, default: 1, min: 0 },
          maxBusinessDays: { type: Number, default: 2, min: 0 },
        },
      },
      updatedAt: { type: Date, default: null },
    },
    requestSettings: {
      // related files:
      // - web/backend/controllers/businesses/business.controller.js
      // - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
      // 사업체 아노다이징 기본값(신규의뢰 __default__ 시드). 의뢰건 SSOT는 caseInfos.anodizingEnabled.
      anodizingEnabled: {
        type: Boolean,
        default: true,
      },
      // 기공소 유지홈 기본값(신규의뢰/디자인 확인 시드). 의뢰건 SSOT는 caseInfos.retentionGroove.
      retentionGroove: {
        type: String,
        enum: ["none", "deep", "shallow"],
        default: "none",
        trim: true,
      },
      // 의뢰자(사업체) 단위 CAD 디자인 소프트웨어 설정
      // - null: 미설정 (어벗생산의뢰/기공의뢰수신 진입 시 선택 모달 강제)
      // - "3Shape" | "ExoCAD" | 직접입력 문자열
      // related files:
      // - web/frontend/src/features/requestSettings/useRequestorRequestSettings.ts
      // - web/backend/services/practiceTransferProduction.service.js
      designSoftware: {
        type: String,
        default: null,
        trim: true,
      },
      // ExoCAD 전용 버전. designSoftware==="ExoCAD"일 때만 의미 있음.
      // - "le_3_0": 3.0 이하 / "ge_3_2": 3.2 이상
      // related: web/backend/utils/designSoftwareHex.js
      exoCadVersion: {
        type: String,
        default: null,
        trim: true,
        validate: {
          validator: (v) =>
            v == null || v === "" || v === "le_3_0" || v === "ge_3_2",
          message: "exoCadVersion은 le_3_0 | ge_3_2 이어야 합니다.",
        },
      },
      // deprecated: pending SSOT는 User.hexByImplantManufacturer[].verifiedHex
      hexVerificationSamplePending: {
        type: Boolean,
        default: false,
      },
      // deprecated(레거시 계정 단일 확정). 신규 가입 시드용으로만 유지.
      hexVerificationCompletedAt: {
        type: Date,
        default: null,
      },
      hexVerificationCompletedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      // deprecated(레거시). 해석 fallback / 신규 가입 시드.
      hexVerificationResultHex: {
        type: String,
        validate: {
          validator: (v) =>
            v == null || v === "" || v === "STL모델대로" || v === "헥스30도회전",
          message:
            "hexVerificationResultHex는 'STL모델대로' | '헥스30도회전' 이어야 합니다.",
        },
        default: null,
        trim: true,
      },
      // 신규 가입 시드용(확정/샘플 SSOT는 User). related: designSoftwareHex.js
      hexByImplantManufacturer: [
        {
          _id: false,
          manufacturer: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
          },
          applyHex30: {
            type: Boolean,
            default: true,
          },
          verifiedHex: {
            type: String,
            default: null,
            trim: true,
          },
          verifiedAt: {
            type: Date,
            default: null,
          },
          verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
          },
        },
      ],
      // 의뢰자(사업체) 단위 기본 헥스 회전값 (신규 의뢰 기본값)
      defaultRequestorHexRotation: {
        type: String,
        default: "STL모델대로",
      },
      // 제조사 워크시트(PreviewModal)에서 설정하는 의뢰자 단위 기본 좌표계 전처리 모드
      // - canonical: "STL모델대로" | "헥스30도회전" | "STL모델+" | "헥스30+"
      // - 저장 주체: 제조사 (개인 User 우선, 없으면 이 BusinessAnchor)
      // - 적용 대상: 해당 의뢰자/사업체의 이후 신규 의뢰
      // - 조회 SSOT: User → BusinessAnchor → 관리자 hexVerificationResultHex → designSoftware
      defaultManufacturerHexRotation: {
        type: String,
        validate: {
          validator: (v) => v == null || isCanonicalManufacturerHexRotation(v),
          message:
            "defaultManufacturerHexRotation은 'STL모델대로' | '헥스30도회전' | 'STL모델+' | '헥스30+' 형식이어야 합니다.",
        },
        default: null,
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },
    // 기공소 기공비 수가 (원). lab only. 설정 「기공비」탭 SSOT
    // related: web/backend/utils/labFeeSchedule.js
    // 마스터 active(기본 false)가 켜져야 설정 완료. 수가 디폴트는 기본값.
    labFeeSchedule: {
      active: { type: Boolean, default: false },
      crown: { type: Number, default: 60000, min: 0 },
      bridge: { type: Number, default: 60000, min: 0 },
      inlay: { type: Number, default: 50000, min: 0 },
      retainer: { type: Number, default: 40000, min: 0 },
      removableTemp3: { type: Number, default: 30000, min: 0 },
      removableTemp6: { type: Number, default: 50000, min: 0 },
      customAbutmentDesign: { type: Number, default: 10000, min: 0 },
      customAbutmentDesignAndProduction: {
        type: Number,
        default: 40000,
        min: 0,
      },
      items: {
        type: [
          {
            id: { type: String, default: "", trim: true },
            name: { type: String, default: "", trim: true },
            unit: {
              type: String,
              enum: ["perTooth", "perNTeeth", "perSet"],
              default: "perTooth",
            },
            enabled: { type: Boolean, default: true },
            price: { type: Number, default: 0, min: 0 },
            remake: { type: Number, default: 0, min: 0 },
            tiers: [
              {
                n: { type: Number, default: 3, min: 1 },
                price: { type: Number, default: 0, min: 0 },
                remake: { type: Number, default: 0, min: 0 },
              },
            ],
          },
        ],
        default: undefined,
      },
      remake: {
        crown: { type: Number, default: 0, min: 0 },
        bridge: { type: Number, default: 0, min: 0 },
        inlay: { type: Number, default: 0, min: 0 },
        retainer: { type: Number, default: 0, min: 0 },
        removableTemp3: { type: Number, default: 0, min: 0 },
        removableTemp6: { type: Number, default: 0, min: 0 },
        customAbutmentDesign: { type: Number, default: 0, min: 0 },
        customAbutmentDesignAndProduction: {
          type: Number,
          default: 0,
          min: 0,
        },
      },
      // 항목별 서비스 제공 여부. false면 UI에서 비활성(수가 값은 유지)
      enabled: {
        crown: { type: Boolean, default: true },
        bridge: { type: Boolean, default: true },
        inlay: { type: Boolean, default: true },
        retainer: { type: Boolean, default: true },
        removableTemp3: { type: Boolean, default: true },
        removableTemp6: { type: Boolean, default: true },
        customAbutmentDesign: { type: Boolean, default: true },
        customAbutmentDesignAndProduction: { type: Boolean, default: true },
      },
      updatedAt: { type: Date, default: null },
    },
    // 기공소→치과별 기공수가 할증(배수). 현재값 + history(변경·1x 해제 이력).
    // as-of: 의뢰 createdAt 기준 당시 배수. 이후 변경분은 다음 건부터.
    // related: web/backend/utils/labFeeSchedule.js (resolveLabPracticeFeeMultiplierAsOf)
    labPracticeFeeMultipliers: {
      type: [
        {
          _id: false,
          practiceAnchorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BusinessAnchor",
            required: true,
          },
          // 현재 적용 배수(1=할증 없음). history가 있으면 1이어도 행 유지.
          multiplier: { type: Number, default: 1, min: 1, max: 5 },
          updatedAt: { type: Date, default: null },
          // 배수 변경 이벤트. at 시점부터 multiplier 적용.
          history: {
            type: [
              {
                _id: false,
                multiplier: { type: Number, min: 1, max: 5 },
                at: { type: Date },
              },
            ],
            default: [],
          },
        },
      ],
      default: [],
    },
    // 기공소→치과 내부 메모. 치과당 1건(재저장 시 덮어쓰기). 기공소만 조회.
    labPracticePartnerMemos: {
      type: [
        {
          _id: false,
          practiceAnchorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BusinessAnchor",
            required: true,
          },
          memo: { type: String, default: "" },
          updatedAt: { type: Date, default: null },
        },
      ],
      default: [],
    },
    // 기공소→치과별 특별공급가. 할인율(전체) 또는 항목별 할인금액.
    // related: web/backend/utils/labFeeSchedule.js (applyLabPracticeSpecialSupplyToSchedule)
    labPracticeSpecialSupplyPrices: {
      type: [
        {
          _id: false,
          practiceAnchorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BusinessAnchor",
            required: true,
          },
          // rate: 전 항목 동일 %, amount: items[] 할인금액
          mode: {
            type: String,
            enum: ["rate", "amount"],
            default: "amount",
          },
          // mode=rate 일 때 0~100
          discountRate: { type: Number, default: 0, min: 0, max: 100 },
          items: {
            type: [
              {
                _id: false,
                feeItemId: { type: String, default: "", trim: true },
                feeItemName: { type: String, default: "", trim: true },
                discountAmount: { type: Number, default: 0, min: 0 },
                remakeDiscountAmount: { type: Number, default: 0, min: 0 },
              },
            ],
            default: [],
          },
          updatedAt: { type: Date, default: null },
        },
      ],
      default: [],
    },
    // 치과→기공소 rating(1~5)·메모. 별점은 기공소 공개, 치과·메모는 비공개.
    // 치과·기공소 쌍당 1건(재평가 시 덮어쓰기). ratingCount는 항상 1(집계는 평가 치과 수).
    // related: web/backend/utils/practiceLabRating.js
    practiceLabRatings: {
      type: [
        {
          _id: false,
          labAnchorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BusinessAnchor",
            required: true,
          },
          stars: { type: Number, default: 5, min: 1, max: 5 },
          memo: { type: String, default: "" },
          ratingCount: { type: Number, default: 1, min: 1 },
          updatedAt: { type: Date, default: null },
        },
      ],
      default: [],
    },
    practiceTransferSettings: {
      // related files:
      // - web/backend/controllers/practiceTransfers/practiceTransferSettings.controller.js
      // - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
      // - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
      // - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
      // - 2026-08-14: implantFavorites roundBar/adopted/roundBarRequestId (환봉 제조사 추가요청)
      // - 2026-08-13: defaultAbutmentProductMode(커스텀어벗 모달 계정 기본=디자인+생산)
      // - 2026-08-28: calendarNewRequestHintDismissedAt(도착일 클릭 신규의뢰 안내 닫음)
      arrivalDefaultDays: {
        type: Number,
        default: 7,
        min: 0,
        max: 365,
      },
      // 기공소별 주문→치과도착 기본 일수(달력일). 미등록 기공소는 arrivalDefaultDays.
      labArrivalDefaults: {
        type: [
          {
            _id: false,
            labAnchorId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "BusinessAnchor",
              required: true,
            },
            labName: { type: String, default: "" },
            arrivalDefaultDays: {
              type: Number,
              default: 7,
              min: 0,
              max: 365,
            },
            updatedAt: { type: Date, default: null },
          },
        ],
        default: [],
      },
      prosthesisTypes: {
        type: [String],
        default: ["인레이", "크라운", "커스텀어벗", "브리지", "유지장치", "임시치아"],
      },
      memoSnippets: {
        type: [String],
        default: [],
      },
      implantFavorites: {
        type: [
          {
            _id: false,
            id: { type: String, default: "" },
            manufacturer: { type: String, default: "" },
            brand: { type: String, default: "" },
            family: { type: String, default: "" },
            type: { type: String, default: "" },
            roundBar: { type: Boolean, default: false },
            adopted: { type: Boolean, default: false },
            adoptedKind: { type: String, default: "" },
            isPublic: { type: Boolean, default: false },
            roundBarRequestId: { type: String, default: "" },
          },
        ],
        default: [],
      },
      abutmentFavorites: {
        type: [
          {
            id: { type: String, default: "" },
            manufacturer: { type: String, default: "" },
            diameter: { type: String, default: "" },
            height: { type: String, default: "" },
          },
        ],
        default: [],
      },
      promoNoticeDismissedAt: {
        type: Date,
        default: null,
      },
      // 캘린더 「도착일 클릭으로 신규의뢰」안내 닫음(계정/앵커). null이면 표시.
      calendarNewRequestHintDismissedAt: {
        type: Date,
        default: null,
      },
      // 기공의뢰 「디자인 컨펌 생략」마지막 설정 (계정/앵커 SSOT). 전송 시 의뢰건에 스냅샷. 기본=생략.
      skipDesignConfirm: {
        type: Boolean,
        default: true,
      },
      // 레거시(2026-08-22 옵션 삭제): practiceTransferSettings.skipJig — 「지그 제작 불필요」UI 제거.
      // 구 계정 값만 남을 수 있음. 신규 전송·설정에 사용하지 않음.
      skipJig: {
        type: Boolean,
        default: true,
      },
      // 커스텀어벗 설정 모달 기본 모드. 신규=생산만(design_custom_abutment 청구 폐기).
      // 치아별 스냅샷은 toothWorks.abutmentProductMode (레거시 미설정=생산만).
      defaultAbutmentProductMode: {
        type: String,
        enum: ["custom_abutment", "design_custom_abutment"],
        default: "custom_abutment",
      },
      // 자동매칭 기공비 — v4 고정수가(카탈로그 평균, 별점 배수 없음). 레거시 v2/v3 스냅샷 호환.
      autoMatchBudget: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
      },
      // 자동매칭 별점 하한(1~5). 전체 치과 평가 평균 기준.
      // 평가 3회 이하·미평가는 유효 3점. 기본 3. 기공비 배수 하한 기준.
      autoMatchMinLabRating: {
        type: Number,
        default: 3,
        min: 1,
        max: 5,
      },
      // 자동매칭 별점 상한(1~5). 기본 4. 하한보다 낮으면 하한으로 맞춤.
      autoMatchMaxLabRating: {
        type: Number,
        default: 4,
        min: 1,
        max: 5,
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },
    referralMembershipAggregate: {
      requestorDirectCircleAnchorIds: {
        type: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BusinessAnchor",
          },
        ],
        default: [],
      },
      requestorDirectCircleMemberCount: {
        type: Number,
        default: 0,
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },
    owners: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },
    ],
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },
    ],
    /** 어벗츠(admin) 임직원 부서. related: business.department.controller.js */
    internalDepartments: {
      type: [
        {
          name: { type: String, required: true, trim: true },
          sortOrder: { type: Number, default: 0 },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    joinRequests: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        status: {
          type: String,
          enum: ["pending", "approved", "rejected"],
          default: "pending",
        },
        requestedRole: {
          type: String,
          enum: ["representative", "staff"],
          default: "staff",
        },
        approvedRole: {
          type: String,
          enum: ["representative", "staff", ""],
          default: "",
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

businessAnchorSchema.index({ businessType: 1, name: 1 });
businessAnchorSchema.index({ referredByAnchorId: 1, businessType: 1 });
// 동일 사업자번호는 businessType(역할/사업부)별로 1개까지 — 법인 공유·역할 분리
businessAnchorSchema.index(
  { businessNumberNormalized: 1, businessType: 1 },
  { unique: true },
);
businessAnchorSchema.index({ parentBusinessAnchorId: 1, businessType: 1 });

// 소개 트리 조회 성능 최적화 ($graphLookup)
businessAnchorSchema.index({
  businessType: 1,
  referredByAnchorId: 1,
  status: 1,
});

const BusinessAnchor = mongoose.model("BusinessAnchor", businessAnchorSchema);

export default BusinessAnchor;
