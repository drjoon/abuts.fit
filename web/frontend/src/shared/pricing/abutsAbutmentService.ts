// related files:
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/hooks/useSystemSettings.ts
// - web/frontend/src/features/settings/tabs/AdminCreditSettingsTab.tsx
// - web/frontend/src/shared/practice/labFeeSchedule.ts
// - .cursor/rules/design-fee.mdc
// change-log:
// - 2026-08-22: 치과 멤버십/일반 이중가 제거. 청구·안내는 membership* 단일 고시. pricingTier 분기 삭제.
// - 2026-08-19: 치과·기공소 디자인+생산(2.5만) 구강지그 제외. 지르 보철은 보철기공비 6만.
// - 2026-08-18: 치과 고시 — 서비스 3종 단일가(생산·디자인+생산·풀세트 지그/지르).
// - 2026-08-14: 환봉 0원은「가격 별도 고지」로 표시.
// - 2026-08-14: 환봉 단가 필드 포함. 도입 종류별 단가 계산은 labFeeSchedule.
// - 2026-08-13: creditSettings 멤버십/일반 생산·디자인+생산 단가 정규화.
// - 2026-08-13: 생산 일반 2.0만·멤버십 1.5만 / 디자인+생산 일반 4.0만·멤버십 2.5만.
// - 2026-08-19: 치과 멤버십 폐지. 커스텀어벗 안내는 플랫폼 고시 단가(membership* 필드).

/**
 * 커스텀어벗 청구·안내 단가 SSOT (플랫폼 고시).
 * 설정 키는 레거시명 `membership*` 유지. `regular*` 는 관리자 딜러분배용(청구 분기 없음).
 */
export const ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE = 15_000;
export const ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE = 25_000;

/** @deprecated 청구 단일가. MEMBERSHIP_PRODUCTION 과 동일(레거시 일반가 2만 폐기). */
export const ABUTS_ABUTMENT_REGULAR_PRODUCTION_PRICE =
  ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE;
/** @deprecated 청구 단일가. MEMBERSHIP_DESIGN_AND_PRODUCTION 과 동일. */
export const ABUTS_ABUTMENT_REGULAR_DESIGN_AND_PRODUCTION_PRICE =
  ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE;

export type AbutsAbutmentCreditPrices = {
  membershipProductionPrice: number;
  /** 딜러분배(무딜러) 설정. 청구에 사용하지 않음. */
  regularProductionPrice: number;
  membershipDesignAndProductionPrice: number;
  regularDesignAndProductionPrice: number;
  membershipRoundBarProductionPrice: number;
  regularRoundBarProductionPrice: number;
  membershipRoundBarDesignAndProductionPrice: number;
  regularRoundBarDesignAndProductionPrice: number;
};

export type AbutsAbutmentAdoptedKind = "cnc" | "round_bar";

const toWon = (value: unknown, fallback: number) => {
  const n = Math.round(Number(value ?? fallback));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const normalizeAbutsAbutmentCreditPrices = (
  creditSettings?: Partial<AbutsAbutmentCreditPrices> & {
    minCreditForRequest?: number;
  } | null,
): AbutsAbutmentCreditPrices => {
  const productionPrice = toWon(
    creditSettings?.membershipProductionPrice ??
      creditSettings?.minCreditForRequest,
    ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  );
  const designAndProductionPrice = toWon(
    creditSettings?.membershipDesignAndProductionPrice,
    ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE,
  );
  const roundBarProductionPrice = toWon(
    creditSettings?.membershipRoundBarProductionPrice,
    0,
  );
  const roundBarDesignAndProductionPrice = toWon(
    creditSettings?.membershipRoundBarDesignAndProductionPrice,
    0,
  );
  return {
    membershipProductionPrice: productionPrice,
    regularProductionPrice: toWon(
      creditSettings?.regularProductionPrice,
      productionPrice,
    ),
    membershipDesignAndProductionPrice: designAndProductionPrice,
    regularDesignAndProductionPrice: toWon(
      creditSettings?.regularDesignAndProductionPrice,
      designAndProductionPrice,
    ),
    membershipRoundBarProductionPrice: roundBarProductionPrice,
    regularRoundBarProductionPrice: toWon(
      creditSettings?.regularRoundBarProductionPrice,
      roundBarProductionPrice,
    ),
    membershipRoundBarDesignAndProductionPrice: roundBarDesignAndProductionPrice,
    regularRoundBarDesignAndProductionPrice: toWon(
      creditSettings?.regularRoundBarDesignAndProductionPrice,
      roundBarDesignAndProductionPrice,
    ),
  };
};

/** @deprecated 멤버십 생산 단가. MEMBERSHIP_PRODUCTION 사용 */
export const ABUTS_ABUTMENT_PRODUCTION_LIST_PRICE =
  ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE;
/** @deprecated 멤버십 디자인+생산 단가. MEMBERSHIP_DESIGN_AND_PRODUCTION 사용 */
export const ABUTS_ABUTMENT_DESIGN_AND_PRODUCTION_LIST_PRICE =
  ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE;
export const ABUTS_ABUTMENT_DESIGN_LIST_FEE =
  ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE -
  ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE;

/** 서비스 3 풀세트 구성 — 지그+임시치아 (1치) */
export const ABUTS_ABUTMENT_JIG_AND_TEMP_PRICE = 5_000;
/** 서비스 3 풀세트 구성 — 지르코니아 보철 (1치) */
export const ABUTS_ABUTMENT_ZIRCONIA_PROSTHESIS_PRICE = 60_000;

export const ABUTS_PRACTICE_MEMBERSHIP_MONTHLY_FEE_DEFAULT = 50_000;

export const ABUTS_ABUTMENT_SERVICE_SHIPPING_NOTE = "배송비 별도, 박스당 과금";
export const ABUTS_ABUTMENT_SERVICE_TAX_NOTE = "부가세 없음";
export const ABUTS_PRACTICE_MEMBERSHIP_SCOPE_NOTE = "멤버십은 치과만 적용";

export const formatAbutsAbutmentServiceWon = (value: number) =>
  `${Math.max(0, Math.round(Number(value || 0))).toLocaleString("ko-KR")}원`;

export const formatAbutsManwon = (value: number) => {
  const man = Math.max(0, Number(value || 0)) / 10_000;
  const text = Number.isInteger(man)
    ? String(man)
    : man.toFixed(1).replace(/\.0$/, "");
  return `${text}만원`;
};

/** @deprecated 치과 멤버십 폐지. 항상 고시 단일가. */
export type AbutsAbutmentPricingTier = "membership" | "regular";

/** @deprecated 항상 "membership". 호출·분기 제거 권장. */
export const resolveAbutsAbutmentPricingTier = (_args?: {
  requestorKind?: string | null;
  practiceMembershipActive?: boolean | null;
}): AbutsAbutmentPricingTier => {
  void _args;
  return "membership";
};

/** 고시 단가(membership*). tier 인자는 무시. */
export const pickAbutsAbutmentTierPrice = (args: {
  tier?: AbutsAbutmentPricingTier;
  membershipPrice: number;
  regularPrice?: number;
}) => {
  void args.tier;
  void args.regularPrice;
  return args.membershipPrice;
};

export const formatAbutsAbutmentTierPriceLine = (args: {
  tier?: AbutsAbutmentPricingTier;
  membershipPrice: number;
  regularPrice?: number;
}) => {
  const price = pickAbutsAbutmentTierPrice(args);
  if (price <= 0) return "가격 별도 고지";
  return formatAbutsManwon(price);
};
