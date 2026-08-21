// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/controllers/requests/common.requests.controller.js
// - web/backend/controllers/admin/admin.settings.controller.js
// - web/backend/utils/creditSettingsDefaults.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/shipping/components/MailboxGrid.tsx
// - web/frontend/src/features/settings/tabs/AdminCreditSettingsTab.tsx
import mongoose from "mongoose";

const systemSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      unique: true,
      default: "global",
    },
    deliveryEtaLeadDays: {
      d6: { type: Number, default: 1 },
      d8: { type: Number, default: 1 },
      d10: { type: Number, default: 4 },
      d12: { type: Number, default: 4 },
    },
    creditSettings: {
      minCreditForRequest: { type: Number, default: 15000 },
      // 청구 SSOT=membership*(단일 고시). regular*=딜러 없음 분배 매출키(치과 구독 단가 아님).
      membershipProductionPrice: { type: Number, default: 15000 },
      regularProductionPrice: { type: Number, default: 20000 },
      membershipDesignAndProductionPrice: { type: Number, default: 25000 },
      regularDesignAndProductionPrice: { type: Number, default: 40000 },
      // CNC 티어별 건당 분배(제조사·딜러사·개발운영사). 어벗츠=매출−합계.
      // membership=딜러 있음, regular=딜러 없음. 치과 멤버십/일반 청구 이중가와 무관.
      membershipProductionManufacturerUnitPrice: { type: Number, default: 9000 },
      membershipProductionSalesmanUnitPrice: { type: Number, default: 3000 },
      membershipProductionDevopsUnitPrice: { type: Number, default: 750 },
      regularProductionManufacturerUnitPrice: { type: Number, default: 12000 },
      regularProductionSalesmanUnitPrice: { type: Number, default: 0 },
      regularProductionDevopsUnitPrice: { type: Number, default: 2000 },
      membershipDesignAndProductionManufacturerUnitPrice: { type: Number, default: 15000 },
      membershipDesignAndProductionSalesmanUnitPrice: { type: Number, default: 5000 },
      membershipDesignAndProductionDevopsUnitPrice: { type: Number, default: 1250 },
      regularDesignAndProductionManufacturerUnitPrice: { type: Number, default: 24000 },
      regularDesignAndProductionSalesmanUnitPrice: { type: Number, default: 0 },
      regularDesignAndProductionDevopsUnitPrice: { type: Number, default: 4000 },
      // CNC 매출 분배 비율(%). 멤버=딜러사 포함, 일반=딜러사 없음. 어벗츠=잔여.
      manufacturerSharePercent: { type: Number, default: 60 },
      salesmanSharePercent: { type: Number, default: 20 },
      devopsSharePercent: { type: Number, default: 5 },
      regularManufacturerSharePercent: { type: Number, default: 60 },
      regularSalesmanSharePercent: { type: Number, default: 0 },
      regularDevopsSharePercent: { type: Number, default: 10 },
      membershipRoundBarProductionPrice: { type: Number, default: 0 },
      regularRoundBarProductionPrice: { type: Number, default: 0 },
      membershipRoundBarDesignAndProductionPrice: { type: Number, default: 0 },
      regularRoundBarDesignAndProductionPrice: { type: Number, default: 0 },
      // 레거시 기공소 어벗생산의뢰 오버레이. 공개 정책은 membership* 고시.
      labProductionPrice: { type: Number, default: 15000 },
      labDesignAndProductionPrice: { type: Number, default: 25000 },
      labRoundBarProductionPrice: { type: Number, default: 0 },
      labRoundBarDesignAndProductionPrice: { type: Number, default: 0 },
      // 개발운영사 지정 의뢰자별 커스텀어벗 공급가(CNC/환봉 × 생산만/디자인+생산).
      // amount는 CNC 생산만 레거시 호환(productionPrice와 동기화). 신규 UI는 기공소 전역 단가.
      specialRequestorPrices: {
        type: [
          {
            requestorAnchorId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "BusinessAnchor",
              required: true,
            },
            amount: { type: Number, required: true, min: 0 },
            productionPrice: { type: Number, min: 0 },
            designAndProductionPrice: { type: Number, min: 0 },
            roundBarProductionPrice: { type: Number, min: 0 },
            roundBarDesignAndProductionPrice: { type: Number, min: 0 },
            manufacturerRequestUnitPrice: { type: Number, min: 0 },
            devopsRequestUnitPrice: { type: Number, min: 0 },
            salesmanRequestUnitPrice: { type: Number, min: 0 },
            productionManufacturerUnitPrice: { type: Number, min: 0 },
            productionSalesmanUnitPrice: { type: Number, min: 0 },
            productionDevopsUnitPrice: { type: Number, min: 0 },
            designAndProductionManufacturerUnitPrice: { type: Number, min: 0 },
            designAndProductionSalesmanUnitPrice: { type: Number, min: 0 },
            designAndProductionDevopsUnitPrice: { type: Number, min: 0 },
          },
        ],
        default: [],
      },
      shippingFee: { type: Number, default: 3500 },
      // 제조사(기공소·면세) 하청 공급가
      manufacturerRequestUnitPrice: { type: Number, default: 9000 },
      // 개발운영사 어벗 생산 외주 공급가(1어벗당). 지급 시 +VAT.
      devopsRequestUnitPrice: { type: Number, default: 750 },
      // 딜러사(salesman BA) 어벗 생산 수수료(1어벗당). 지급 시 +VAT. 없으면 어벗츠 귀속.
      salesmanRequestUnitPrice: { type: Number, default: 3000 },
      manufacturerShippingUnitPrice: { type: Number, default: 3500 },
      affiliateVatRate: { type: Number, default: 0.1 },
      // 신속 배송 추가 의뢰크레딧 (생산=건당, 디자인+생산=1어벗당, 가공 진입 시 차감)
      expressFee: { type: Number, default: 2000 },
      // 기공의뢰 신속처리 할증(기공비·어벗츠). 1 초과~2 이하.
      practiceRushFeeMultiplier: { type: Number, default: 1.2, min: 1, max: 2 },
      // 디자인비 (1어벗당). 플랫폼 고시 디자인+생산 − 생산만과 동기화.
      // 청구 SSOT: membershipProductionPrice 15,000 / membershipDesignAndProductionPrice 25,000
      designFee: { type: Number, default: 10000 },
      // 기공의뢰(CA) 수락 기공소 어벗디자인비 지급(1어벗당). designFee(의뢰자 과금)와 분리.
      abutmentDesignLabFee: { type: Number, default: 10000 },
      // 치과 납품 커스텀어벗 소매가(1어벗당). 기공의뢰 분배·devops 요금 설정 SSOT
      abutmentRetailPrice: { type: Number, default: 40000 },
      // 레거시. 치과 멤버십 월 구독 폐지. 신규 과금에 쓰지 않음.
      practiceMembershipMonthlyFee: { type: Number, default: 50000 },
      // 기공소 가입 환영 무료크레딧(단일). 레거시 defaultShippingFreeCredit는 0 고정.
      defaultRequestFreeCredit: { type: Number, default: 30000 },
      defaultShippingFreeCredit: { type: Number, default: 0 },
    },
    // 어벗츠 기공수가 카탈로그(항목 On/Off·이름). price는 관리자 입력.
    abutsLabFeeSchedule: {
      items: { type: [mongoose.Schema.Types.Mixed], default: [] },
      updatedAt: { type: Date, default: null },
      averagedAt: { type: Date, default: null },
    },
    // B플랜 충전 입금 계좌: EBS 환경변수 한글 인코딩 버그로 인해 DB에서 관리
    // (B_PLAN_DEPOSIT_BANK_NAME/HOLDER 를 env로 넣으면 "????"로 깨짐)
    bPlanDepositAccount: {
      bankName: { type: String, default: "하나은행" },
      accountNumber: { type: String, default: "806-910009-00004" },
      holderName: { type: String, default: "어벗츠 주식회사" },
    },
    // 한진 송하인 정보: EBS 환경변수 한글 인코딩 버그로 인해 DB에서 관리
    // (환경변수로 읽으난 한글이 "??"로 까짐 → rules.legacy-full.md 섹션 6.7.0 참고)
    hanjinSenderInfo: {
      zip: { type: String, default: "50965" },
      baseAddr: { type: String, default: "경상남도 김해시 흥동" },
      dtlAddr: { type: String, default: "전하로 85번길 5" },
      name: { type: String, default: "어벗츠 주식회사" },
      tel: { type: String, default: "1588-3948" },
      mobile: { type: String, default: "" },
    },
    // 패킹 라벨 브랜딩 정보: EBS 환경변수 한글 인코딩 버그로 인해 DB에서 관리
    // (rules.legacy-full.md 섹션 16 참고)
    packLabelBranding: {
      productName: { type: String, default: "치과용임플란트 상부구조물" },
      modelName: { type: String, default: "CA6512" },
      licenseNo: { type: String, default: "제3583호" },
      manufacturerName: { type: String, default: "(주)애크로덴트" },
      manufacturerAddr: {
        type: String,
        default: "경남 김해시 전하로85번길 5, 나동(흥동)",
      },
      manufacturerTelFax: {
        type: String,
        default: "T 055-314-4607  F 055-901-0241",
      },
      manufacturerPermitNo: { type: String, default: "제3583호" },
      sellerName: { type: String, default: "어벗츠 주식회사" },
      sellerPermit: { type: String, default: "제00001호" },
      sellerAddr: {
        type: String,
        default: "경남 거제시 거제중앙로29길 6, 3층",
      },
      sellerTel: { type: String, default: "1588-3948" },
      udiGtin: { type: String, default: "08800123600154" },
      certInfo: {
        type: String,
        default:
          "품목인증번호: 제인 26-0000호, 포장단위:1set, 보관방법: 실온보관",
      },
      homepageUrl: { type: String, default: "www.acrodent.com" },
      manualQrLabel: { type: String, default: "사용자매뉴얼" },
    },
    securitySettings: {
      twoFactorAuth: { type: Boolean, default: true },
      loginNotifications: { type: Boolean, default: true },
      dataEncryption: { type: Boolean, default: true },
      fileUploadScan: { type: Boolean, default: true },
      autoLogout: { type: Number, default: 30 },
      maxLoginAttempts: { type: Number, default: 5 },
      passwordExpiry: { type: Number, default: 90 },
      ipWhitelist: { type: Boolean, default: false },
      apiRateLimit: { type: Number, default: 1000 },
      backupFrequency: { type: String, default: "daily" },
    },
    selfInspectionInstrumentOptions: {
      type: [String],
      default: ["현미경(AD-T-07)", "비전(AD-T-19)", "MICRO(AD-T-02)"],
    },
    rndUnmachinableReasonOptions: {
      type: [String],
      default: [],
    },
    manualPickupReasonOptions: {
      type: [String],
      default: ["방문 전달"],
    },
    // related files (screw lot tracking):
    // - web/backend/controllers/requests/common.requests.controller.js
    // - web/backend/controllers/requests/common.review.controller.js
    // - web/backend/models/request.model.js
    // - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx
    // 세척.패킹 단계 스크류 로트번호 전역 설정 (동적 타입 목록)
    packingScrewLotSettings: {
      type: [
        {
          type: { type: String, default: "" },
          lotNumber: { type: String, default: "" },
        },
      ],
      default: () => [
        { type: "A", lotNumber: "" },
        { type: "B", lotNumber: "" },
        { type: "C", lotNumber: "" },
        { type: "D", lotNumber: "" },
        { type: "E", lotNumber: "" },
      ],
    },
    // 디자인 클레임 마감 (파트너 → 마감 설정). 클레임 시각 + claimHours.
    designDeadlineSettings: {
      claimHours: { type: Number, default: 3 },
    },
    // 신속배송 14:00 빠른 가공 재배치 최근 Alert 스냅샷
    // related: controllers/requests/expressDeadlineRebalance.utils.js
    lastExpressDeadlineRebalance: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

const SystemSettings = mongoose.model("SystemSettings", systemSettingsSchema);

export default SystemSettings;
