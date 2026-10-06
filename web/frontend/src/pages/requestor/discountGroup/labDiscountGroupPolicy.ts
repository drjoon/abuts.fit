// related files:
// - web/frontend/src/pages/requestor/discountGroup/LabDiscountGroupPage.tsx
// - web/frontend/rules.md
// change-log:
// - 2026-10-07: 기공소 소개 할인그룹 UI용 단가·기간 상수(청구 로직 연결 전 표시 SSOT).

/** 기본 건당 의뢰비(원). */
export const LAB_DISCOUNT_BASE_UNIT_PRICE = 15_000;

/** 지난 달(측정 구간) 합산 의뢰 1건당 할인(원). */
export const LAB_DISCOUNT_PER_ORDER = 50;

/** 최대 할인액(원). 100건 이상이면 건당 1만원. */
export const LAB_DISCOUNT_MAX_AMOUNT = 5_000;

/** 가입 후 고정가 기간(일) · 고정 단가(원). */
export const LAB_DISCOUNT_INTRO_DAYS = 90;
export const LAB_DISCOUNT_INTRO_UNIT_PRICE = 10_000;

export const LAB_DISCOUNT_MIN_UNIT_PRICE =
  LAB_DISCOUNT_BASE_UNIT_PRICE - LAB_DISCOUNT_MAX_AMOUNT;

export type LabDiscountPricePreview = {
  unitPrice: number;
  discountAmount: number;
  groupOrders: number;
  rule: "intro_fixed" | "usage_discount" | "base";
  introEndsAt: Date | null;
  inIntroPeriod: boolean;
};

function addUtcDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** 승인(또는 생성)일 기준 90일 고정가 종료 시각. */
export function resolveLabDiscountIntroEndsAt(
  approvedAt?: string | null,
  createdAt?: string | null,
): Date | null {
  const raw = String(approvedAt || createdAt || "").trim();
  if (!raw) return null;
  const start = new Date(raw);
  if (!Number.isFinite(start.getTime())) return null;
  return addUtcDays(start, LAB_DISCOUNT_INTRO_DAYS);
}

/**
 * 표시용 예상 단가.
 * 청구 적용은 추후 서버 로직. UI는 정책 수치로 미리보기만 한다.
 */
export function previewLabDiscountUnitPrice(input: {
  groupOrders: number;
  approvedAt?: string | null;
  createdAt?: string | null;
  now?: Date;
}): LabDiscountPricePreview {
  const now = input.now ?? new Date();
  const introEndsAt = resolveLabDiscountIntroEndsAt(
    input.approvedAt,
    input.createdAt,
  );
  const inIntroPeriod = Boolean(
    introEndsAt && now.getTime() < introEndsAt.getTime(),
  );
  const groupOrders = Math.max(0, Math.floor(Number(input.groupOrders) || 0));

  if (inIntroPeriod) {
    return {
      unitPrice: LAB_DISCOUNT_INTRO_UNIT_PRICE,
      discountAmount: LAB_DISCOUNT_BASE_UNIT_PRICE - LAB_DISCOUNT_INTRO_UNIT_PRICE,
      groupOrders,
      rule: "intro_fixed",
      introEndsAt,
      inIntroPeriod: true,
    };
  }

  const discountAmount = Math.min(
    groupOrders * LAB_DISCOUNT_PER_ORDER,
    LAB_DISCOUNT_MAX_AMOUNT,
  );
  const unitPrice = LAB_DISCOUNT_BASE_UNIT_PRICE - discountAmount;

  return {
    unitPrice,
    discountAmount,
    groupOrders,
    rule: discountAmount > 0 ? "usage_discount" : "base",
    introEndsAt,
    inIntroPeriod: false,
  };
}

export function formatLabDiscountWon(n: number): string {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "0";
  try {
    return v.toLocaleString("ko-KR");
  } catch {
    return String(v);
  }
}
