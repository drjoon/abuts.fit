// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/controllers/practiceTransfers/practiceTransferSettings.controller.js
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
import mongoose from "mongoose";

const MANUFACTURER_HEX_ROTATION_REGEX = /^헥스\s*[+-]?\d+(?:\.\d+)?\s*도회전$/;
const isCanonicalManufacturerHexRotation = (value) => {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v === "STL모델대로" || v === "헥스30도회전") return true;
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
    // 치과(practice) 커스텀어벗 멤버십. 기공소는 무시하고 일반가.
    // 해지(cancelAtPeriodEnd) 시 다음 결제일까지 유지, 그 다음 결제는 하지 않음.
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
    // - web/backend/modules/devops/practiceTransferAutoMatch.routes.js
    // - web/backend/services/labAutoMatchParticipation.service.js
    // - web/frontend/src/pages/devops/components/PracticeTransferAutoMatchTab.tsx
    practiceTransferAutoMatchEnabled: {
      type: Boolean,
      default: false,
      index: true,
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
      manufacturerRate: { type: Number, default: 0.6, min: 0, max: 1 },
      devopsRate: { type: Number, default: 0.1, min: 0, max: 1 },
      salesmanRate: { type: Number, default: 0.1, min: 0, max: 1 },
      adminRate: { type: Number, default: 0.2, min: 0, max: 1 },
      // 기공의뢰 플랫폼 수수료율. 자동 매칭 성공 시 기공비에만 적용(지정 의뢰 0%).
      // 걷힌 수수료 총액은 위 4자 배분율로 다시 나뉜다.
      platformFeeRate: { type: Number, default: 0.1, min: 0, max: 1 },
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
          minBusinessDays: { type: Number, default: 4, min: 0 },
          maxBusinessDays: { type: Number, default: 7, min: 0 },
        },
        d12: {
          minBusinessDays: { type: Number, default: 4, min: 0 },
          maxBusinessDays: { type: Number, default: 7, min: 0 },
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
      // 의뢰자(사업체) 단위 CAD 디자인 소프트웨어 설정
      // - null: 미설정 (신규의뢰 진입 시 선택 모달 노출)
      // - "3Shape" | "ExoCAD" | 직접입력 문자열
      designSoftware: {
        type: String,
        default: null,
        trim: true,
      },
      // 의뢰자(사업체) 단위 기본 헥스 회전값 (신규 의뢰 기본값)
      defaultRequestorHexRotation: {
        type: String,
        default: "STL모델대로",
      },
      // 제조사 워크시트(PreviewModal)에서 설정하는 의뢰자(사업체) 단위 기본 좌표계 전처리 모드
      // - canonical: "STL모델대로" | "헥스30도회전" | "헥스X도회전(total)"
      // - 저장 주체: 제조사
      // - 적용 대상: 해당 businessAnchorId의 이후 신규 의뢰
      defaultManufacturerHexRotation: {
        type: String,
        validate: {
          validator: (v) => v == null || isCanonicalManufacturerHexRotation(v),
          message:
            "defaultManufacturerHexRotation은 'STL모델대로' | '헥스30도회전' | '헥스X도회전(total)' 형식이어야 합니다.",
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
      pontic: { type: Number, default: 40000, min: 0 },
      retainer: { type: Number, default: 40000, min: 0 },
      removableTemp3: { type: Number, default: 30000, min: 0 },
      removableTemp6: { type: Number, default: 50000, min: 0 },
      customAbutmentDesign: { type: Number, default: 10000, min: 0 },
      customAbutmentDesignAndProduction: {
        type: Number,
        default: 35000,
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
        pontic: { type: Number, default: 0, min: 0 },
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
        pontic: { type: Boolean, default: true },
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
    // 치과→기공소 rating(1~3)·메모. 기록한 치과·관리자만 조회.
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
          stars: { type: Number, default: 3, min: 1, max: 3 },
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
      arrivalDefaultDays: {
        type: Number,
        default: 7,
        min: 0,
        max: 365,
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
      // 기공의뢰 「디자인 컨펌 생략」마지막 설정 (계정/앵커 SSOT). 전송 시 의뢰건에 스냅샷. 기본=생략.
      skipDesignConfirm: {
        type: Boolean,
        default: true,
      },
      // 커스텀어벗 설정 모달 기본 모드. 미설정·신규 계정은 디자인+생산.
      // 치아별 스냅샷은 toothWorks.abutmentProductMode (레거시 미설정=생산만).
      defaultAbutmentProductMode: {
        type: String,
        enum: ["custom_abutment", "design_custom_abutment"],
        default: "design_custom_abutment",
      },
      // 자동매칭 기공비 예산 — 항목별 min/max (Mixed). 어벗츠 어벗 제외.
      autoMatchBudget: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
      },
      // 자동매칭 참여 최소 별(1~3). 해당 치과 rating 기준.
      // 미평가·동일 기공소 평가 2회 이하는 차단하지 않음.
      autoMatchMinLabRating: {
        type: Number,
        default: 1,
        min: 1,
        max: 3,
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
