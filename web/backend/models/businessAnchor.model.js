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
      unique: true,
      index: true,
      trim: true,
    },
    businessType: {
      type: String,
      enum: ["requestor", "salesman", "manufacturer", "devops", "admin", "practice"],
      default: "requestor",
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
    // 이용 서비스 OR: free=기공의뢰서, paid=생산의뢰(검증 필수)
    requestorServices: {
      free: { type: Boolean, default: false },
      paid: { type: Boolean, default: false },
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
    // 개발운영사 지정: 검증 기공소가 기공의뢰 자동매칭 공개 풀에 참여
    // related files:
    // - web/backend/utils/practiceTransferAutoMatch.js
    // - web/backend/modules/devops/practiceTransferAutoMatch.routes.js
    practiceTransferAutoMatchEnabled: {
      type: Boolean,
      default: false,
      index: true,
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
      // 기공의뢰(practice transfer) 플랫폼 수수료율(2단계).
      // 등록 치과(active|referred)=partnerFeeRate, 미등록=nonPartnerFeeRate.
      // 걷힌 수수료 총액은 위 4자 배분율로 다시 나뉜다.
      partnerFeeRate: { type: Number, default: 0, min: 0, max: 1 },
      nonPartnerFeeRate: { type: Number, default: 0.25, min: 0, max: 1 },
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
    labFeeSchedule: {
      crown: { type: Number, default: 60000, min: 0 },
      bridge: { type: Number, default: 60000, min: 0 },
      inlay: { type: Number, default: 50000, min: 0 },
      pontic: { type: Number, default: 40000, min: 0 },
      customAbutmentDesign: { type: Number, default: 10000, min: 0 },
      customAbutmentDesignAndProduction: {
        type: Number,
        default: 35000,
        min: 0,
      },
      updatedAt: { type: Date, default: null },
    },
    practiceTransferSettings: {
      // related files:
      // - web/backend/controllers/practiceTransfers/practiceTransferSettings.controller.js
      // - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
      // - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
      arrivalDefaultDays: {
        type: Number,
        default: 7,
        min: 0,
        max: 365,
      },
      prosthesisTypes: {
        type: [String],
        default: ["크라운", "브리지", "커스텀어벗+크라운", "커스텀어벗+브리지"],
      },
      memoSnippets: {
        type: [String],
        default: [],
      },
      implantFavorites: {
        type: [
          {
            id: { type: String, default: "" },
            manufacturer: { type: String, default: "" },
            brand: { type: String, default: "" },
            family: { type: String, default: "" },
            type: { type: String, default: "" },
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
      // 기공의뢰 「디자인 컨펌 생략」마지막 설정 (계정/앵커 SSOT). 전송 시 의뢰건에 스냅샷.
      skipDesignConfirm: {
        type: Boolean,
        default: false,
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

// 소개 트리 조회 성능 최적화 ($graphLookup)
businessAnchorSchema.index({
  businessType: 1,
  referredByAnchorId: 1,
  status: 1,
});

const BusinessAnchor = mongoose.model("BusinessAnchor", businessAnchorSchema);

export default BusinessAnchor;
