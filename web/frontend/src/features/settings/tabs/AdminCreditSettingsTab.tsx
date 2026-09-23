// change-log:
// - 2026-09-23: 런칭 이벤트 on/off — 즉시 적용(분배 비율 예약과 분리).
// - 2026-09-23: 런칭 이벤트 on/off — 내일부터 예약 적용(분배 비율과 동일).
// - 2026-09-23: 가격 카드에서 매입가 제거(분배 비율)·4열.
// - 2026-09-23: 런칭 이벤트 시작·종료일 UI 제거(on/off만).
// - 2026-09-23: 런칭 이벤트 1만 / 정상가 1.3만 · FM덴탈 월정액 배송 설정.
// - 2026-09-23: 분배 비율 — 딜러 10/15/20% 선택·내일부터 적용 안내. 딜러십 섹션 제거.
// - 2026-09-23: 분배 비율 — 딜러=이벤트 요율·개발운영 5%·어벗츠 나머지. 스토어·커스텀어벗만(기공비 제외).
// - 2026-09-23: variant=shareRates — 분배 비율(공통)+딜러십. 커스텀어벗 탭에서 분배 카드 분리.
// - 2026-09-20: 커스텀어벗 가격 아래 의뢰자 BA 판매가 오버라이드 목록.
// - 2026-09-20: 매입가 = 판매가의 50%(읽기 전용). 리메이크 매입가 입력 제거.
// - 2026-08-24: 분배 비율 — 딜러사 포함 섹션·딜러사 비포함 안내문 제거(딜러 분배 중단).
// - 2026-08-23: 제조사=일반과세. 매입 공급가로 잔여 분배(부가세 포함가는 표시·설정값).
// - 2026-08-22: 가격 라벨 — 판매가(부가세 면제)·매입가(부가세 포함).
// - 2026-08-22: 매입가(부가세 포함) 스피너 100원 단위. 판매가는 1,000원.
// - 2026-08-22: 가격(판매가·매입가) 1,000원 단위 스피너 표시.
// - 2026-08-22: 가격(판매가·매입가) 카드. 커스텀어벗 가격·제조사 단가 카드 제거. 분배 % 옆 개당 단가.
// - 2026-08-22: 판매가 CNC·환봉 구분 없이 단일(기본 15,000). 매입가=제조사 고정단가.
// - 2026-08-22: 제조사=고정단가(8,800·부가세포함) 선차감. 잔여를 딜러/개발운영/어벗츠 비중(30:10:40·없으면 20:80)으로 분배.
// - 2026-08-22: 치과 청구는 membership* 단일 고시. UI「멤버/일반」은 딜러 유무 분배만(청구 이중가 아님).
// - 2026-08-21: 치과 공급 어벗 UI 삭제. 기공소 공급→커스텀어벗 가격(CNC·환봉 생산만).
// - 2026-08-19: 고시=생산·디자인+생산. 멤버/일반→딜러 분배 배지. 디자인비+지그 UI 제거.
// - 2026-08-18: 기공소 공급 CNC·환봉 소제목을 가로 2열로.
// - 2026-08-18: 기공소 공급 어벗을 의뢰자별이 아니라 치과 공급과 같은 전역 멤버 카드 4장으로.
// - 2026-08-18: 카드 제목 커스텀어벗→치과 공급 어벗, 특별 공급가→기공소 공급 어벗.
// - 2026-08-18: 금액 입력 스피너 숨김·원 접미사 여백 확보(숫자 잘림 방지).
// - 2026-08-18: 분배 비율 스피너 5% 단위.
// - 2026-08-18: 분배 비율 라벨 — 딜러사 포함/비포함(소개코드).
// - 2026-08-18: 분배 비율 라벨 — 영업자 포함(소개코드 있음)/비포함(없음).
// - 2026-08-18: 분배 비율을 페이지 상단 카드로. 자동저장 문구 제거·UI 단순화.
// - 2026-08-18: 분배 비율을 멤버(60+20+5+15)·일반(60+10+30) 두 식으로 분리.
// - 2026-08-18: 공통 분배 비율을 맨 위로. CNC·디자인비 매출만 5열, 환봉은 제외.
// - 2026-08-18: CNC 분배 공통 %(맨 위) — 항목별 매출만 입력, 분배는 비율×매출.
// - 2026-08-18: 분배 행 UI 개선·자동저장 상태 표시(700ms 디바운스).
// - 2026-08-18: CNC·특별공급가 항목별 제조사/영업자/개발운영사 분배(공통 설정 제거).
// - 2026-08-18: 특별공급가 치과별 CNC 생산·D+P 분배식 UI. salesmanRequestUnitPrice per-clinic.
// - 2026-08-18: CNC어벗 4티어를 매출=제조사+영업자+개발운영사+어벗츠 구조로 표시. salesmanRequestUnitPrice 추가.
// - 2026-08-18: 커스텀어벗 CNC·특별공급가 6열(외주 제조사·개발운영사). 특별공급가 카드를 커스텀어벗 바로 아래로.
// - 2026-08-18: 멤버십·배송 — 구독료·배송비·신속 의뢰비만 표시. 제조사 하청은 커스텀어벗 탭으로 이전 예정.
// - 2026-08-17: 제조사 하청 의뢰 공급가 도움말 — 어벗 1개당.
// - 2026-08-16: variant로 크레딧(환영·멤버십·배송) / 커스텀어벗(단가·추가요청·특별공급가) 분리.
// - 2026-08-15: 특별 공급가 치과카드 4항목을 4열 1행 배치.
// - 2026-08-15: 특별 공급가 CNC/환봉 × 생산만·디자인+생산 입력. 배송 500원·그 외 1000원 step.
// - 2026-08-15: 섹션명 커스텀어벗, 환영 무료 크레딧 입력 1/2열.
// - 2026-08-15: 환영 무료 크레딧을 단일 금액(defaultRequestFreeCredit)으로 정리. 배송 분리 설정 UI 제거.
// - 2026-08-14: 5섹션(환영 무료 크레딧·어벗·어벗 추가 요청·멤버십·배송·특별 공급가). 의뢰·배송→어벗.
// - 2026-08-14: 의뢰·배송에 CNC/환봉 라벨 분리, 환봉방식 커스텀어벗 요청 목록 포함.
// - 2026-08-13: 디자인비 항목을 디자인+생산으로 교체. 생산만·디자인+생산을 멤버십/일반 단가로 분리.
// - 2026-08-15: 치과 멤버십 월 구독료 기본 50,000(면세).
// - 2026-08-19: 치과 멤버십 월 구독료 UI 제거(과금 폐지). 배송·신속비만 유지.
// - 2026-08-13: 디자인비(1어벗당) 입력 복구. 기본 생산 15,000 + 디자인 5,000.
// - 2026-08-13: 파트너 요금·크레딧 UI를 카드/아이콘/자동저장 스타일로 정리.
// - 2026-08-13: 저장/취소 버튼 제거 → 변경 시 디바운스 자동 저장.
// - 2026-08-13: 특별 공급가 — 의뢰자 검색 후 추가·금액 입력, 다수 지정 지원.
// - 2026-08-13: 카드 제목/설명 제거, 라벨을「커스텀 어벗 의뢰비」로 변경, 의뢰자별 특별 공급가 UI 추가.
// - 2026-08-10: 레이아웃·여백 정리, 긴 도움말은 툴팁으로 이동.
// - 2026-08-09: 디자인비 도움말에 출고 +1영업일(묶음·신속) 안내 추가.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/admin/settings/SettingsPage.tsx
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
// - web/backend/controllers/admin/admin.settings.controller.js
// - web/backend/models/systemSettings.model.js
// - web/backend/utils/creditSettingsDefaults.js
// - web/frontend/src/pages/admin/system/AdminRoundBarAbutmentTab.tsx
import { useCallback, useState, useEffect, useRef, useMemo, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { CREDIT_SETTINGS_DEFAULTS } from "@/hooks/useSystemSettings";
import {
  AFFILIATE_VAT_RATE,
  splitInclusiveVat,
} from "@/shared/settlement/affiliateVat";
import {
  ABUTS_ABUTMENT_LAUNCH_EVENT_PRODUCTION_PRICE,
  normalizeAbutsAbutmentCreditPrices,
} from "@/shared/pricing/abutsAbutmentService";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Banknote,
  Check,
  CircleHelp,
  CloudUpload,
  Gift,
  Loader2,
  Percent,
  Truck,
  Zap,
} from "lucide-react";
import { AdminRoundBarAbutmentTab } from "@/pages/admin/system/AdminRoundBarAbutmentTab";
import { cn } from "@/shared/ui/cn";
import { kstAddCivilDays, toKstYmd } from "@/shared/date/kst";

interface CreditSettings {
  minCreditForRequest: number;
  specialRequestorPrices: SpecialRequestorPrice[];
  shippingFee: number;
  manufacturerRequestUnitPrice: number;
  manufacturerRemakeUnitPrice: number;
  devopsRequestUnitPrice: number;
  salesmanRequestUnitPrice: number;
  manufacturerShippingUnitPrice: number;
  affiliateVatRate: number;
  expressFee: number;
  designFee: number;
  abutmentDesignLabFee: number;
  abutmentRetailPrice: number;
  practiceMembershipMonthlyFee: number;
  defaultRequestFreeCredit: number;
  defaultShippingFreeCredit: number;
  membershipProductionPrice: number;
  regularProductionPrice: number;
  customAbutmentLaunchEventEnabled?: boolean;
  customAbutmentLaunchEventStartedAt?: string | Date | null;
  customAbutmentLaunchEventEndedAt?: string | Date | null;
  customAbutmentLaunchEventProductionPrice?: number;
  fmDentalMonthlyShippingFee?: number;
  membershipDesignAndProductionPrice: number;
  regularDesignAndProductionPrice: number;
  membershipRoundBarProductionPrice: number;
  regularRoundBarProductionPrice: number;
  membershipRoundBarDesignAndProductionPrice: number;
  regularRoundBarDesignAndProductionPrice: number;
  labProductionPrice: number;
  labDesignAndProductionPrice: number;
  labRoundBarProductionPrice: number;
  labRoundBarDesignAndProductionPrice: number;
  membershipProductionManufacturerUnitPrice: number;
  membershipProductionSalesmanUnitPrice: number;
  membershipProductionDevopsUnitPrice: number;
  regularProductionManufacturerUnitPrice: number;
  regularProductionSalesmanUnitPrice: number;
  regularProductionDevopsUnitPrice: number;
  membershipDesignAndProductionManufacturerUnitPrice: number;
  membershipDesignAndProductionSalesmanUnitPrice: number;
  membershipDesignAndProductionDevopsUnitPrice: number;
  regularDesignAndProductionManufacturerUnitPrice: number;
  regularDesignAndProductionSalesmanUnitPrice: number;
  regularDesignAndProductionDevopsUnitPrice: number;
  /** 커스텀어벗 매입 = 판매가 × 이 비율(기본 50). */
  manufacturerSharePercent: number;
  salesmanSharePercent: number;
  devopsSharePercent: number;
  /** 어벗츠% = 100 − (제조사 + 딜러 + 개발운영사). */
  abutsSharePercent: number;
  regularManufacturerSharePercent: number;
  regularSalesmanSharePercent: number;
  regularDevopsSharePercent: number;
  regularAbutsSharePercent: number;
  /** 스토어 판매 분배(판매가 대비). */
  storeManufacturerSharePercent: number;
  storeSalesmanSharePercent: number;
  storeDevopsSharePercent: number;
  storeAbutsSharePercent: number;
  /** 기공 분배(기공비 대비). 기공사업부·영업팀·개발운영사·어벗츠. */
  labBizSharePercent: number;
  labSalesTeamSharePercent: number;
  labDevopsSharePercent: number;
  labAbutsSharePercent: number;
}

type TierPartyPrefix =
  | "membershipProduction"
  | "regularProduction"
  | "membershipDesignAndProduction"
  | "regularDesignAndProduction";

type PartyKind = "Manufacturer" | "Salesman" | "Devops";

type TierParty = {
  manufacturer: number;
  salesman: number;
  devops: number;
};

type SpecialRequestorPrice = {
  requestorAnchorId: string;
  amount: number;
  productionPrice: number;
  designAndProductionPrice: number;
  roundBarProductionPrice: number;
  roundBarDesignAndProductionPrice: number;
  manufacturerRequestUnitPrice: number;
  devopsRequestUnitPrice: number;
  salesmanRequestUnitPrice: number;
  productionManufacturerUnitPrice: number;
  productionSalesmanUnitPrice: number;
  productionDevopsUnitPrice: number;
  designAndProductionManufacturerUnitPrice: number;
  designAndProductionSalesmanUnitPrice: number;
  designAndProductionDevopsUnitPrice: number;
};

type CreditSettingsApiResponse = {
  success?: boolean;
  data?: {
    creditSettings?: Partial<CreditSettings>;
  };
};

const AUTO_SAVE_DELAY_MS = 700;
const AMOUNT_STEP = 1000;
/** 매입가(부가세 포함) 스피너 단위 */
const PURCHASE_AMOUNT_STEP = 100;
const SHIPPING_AMOUNT_STEP = 500;
const PERCENT_STEP = 5;

type ShareKind = "membership" | "regular";

/** 판매가 대비 분배 기본값. 제조사 50 + 딜러 20 + 개발운영 5 → 어벗츠 25. */
const MEMBERSHIP_RESIDUAL_SHARE_PERCENTS = {
  salesman: 20,
  devops: 5,
  abuts: 25,
};

/** 기공 분배 기본값. 기공사업부 50 + 영업팀 20 + 개발운영 5 → 어벗츠 25. */
const LAB_SHARE_PERCENTS = {
  biz: 50,
  salesTeam: 20,
  devops: 5,
  abuts: 25,
};

/** 딜러 없을 때: 개발운영사 5%, 어벗츠=나머지. */
const REGULAR_RESIDUAL_SHARE_PERCENTS = {
  salesman: 0,
  devops: 5,
  abuts: 95,
};

/** 어벗츠% = 100 − (제조사 + 딜러 + 개발운영사). */
function abutsShareFromParts(
  manufacturerPercent: number,
  dealerPercent: number,
  devopsPercent: number,
): number {
  return Math.max(
    0,
    Math.round(
      (100 -
        (Number(manufacturerPercent) || 0) -
        (Number(dealerPercent) || 0) -
        (Number(devopsPercent) || 0)) *
        100,
    ) / 100,
  );
}

/** 딜러 분배·수수료 요율 선택지. */
const DEALER_RATE_PCT_OPTIONS = [10, 15, 20] as const;
type DealerRatePct = (typeof DEALER_RATE_PCT_OPTIONS)[number];

function snapDealerPct(
  value: number,
  fallback: DealerRatePct = 20,
): DealerRatePct {
  const pct = Math.round(Number.isFinite(value) ? value : fallback);
  let best: DealerRatePct = fallback;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const option of DEALER_RATE_PCT_OPTIONS) {
    const dist = Math.abs(option - pct);
    if (dist < bestDist) {
      bestDist = dist;
      best = option;
    }
  }
  return best;
}

/** 딜러 요율 변경 예약 — 내일 0시(KST). */
function tomorrowKstIsoStart(): string {
  const today = toKstYmd(new Date()) || "";
  const tomorrow = kstAddCivilDays(today, 1) || today;
  return `${tomorrow}T00:00:00+09:00`;
}

function buildDealerSchedulePayload(pendingPct: DealerRatePct | null) {
  if (pendingPct == null) {
    return {
      dealershipRateChangeScheduledAt: null as string | null,
      dealershipRateChangeScheduledRate: null as number | null,
    };
  }
  return {
    dealershipRateChangeScheduledAt: tomorrowKstIsoStart(),
    dealershipRateChangeScheduledRate: pendingPct / 100,
  };
}

function buildStoreDealerSchedulePayload(pendingPct: DealerRatePct | null) {
  if (pendingPct == null) {
    return {
      storeDealerRateChangeScheduledAt: null as string | null,
      storeDealerRateChangeScheduledRate: null as number | null,
    };
  }
  return {
    storeDealerRateChangeScheduledAt: tomorrowKstIsoStart(),
    storeDealerRateChangeScheduledRate: pendingPct / 100,
  };
}

function buildDevopsSchedulePayload(pendingPct: number | null) {
  if (pendingPct == null) {
    return {
      devopsShareChangeScheduledAt: null as string | null,
      devopsShareChangeScheduledPercent: null as number | null,
    };
  }
  const n = Number(pendingPct);
  const pct =
    !Number.isFinite(n) || n < 0 ? 5 : Math.min(100, Math.round(n * 100) / 100);
  return {
    devopsShareChangeScheduledAt: tomorrowKstIsoStart(),
    devopsShareChangeScheduledPercent: pct,
  };
}

function buildStoreDevopsSchedulePayload(pendingPct: number | null) {
  if (pendingPct == null) {
    return {
      storeDevopsShareChangeScheduledAt: null as string | null,
      storeDevopsShareChangeScheduledPercent: null as number | null,
    };
  }
  const n = Number(pendingPct);
  const pct =
    !Number.isFinite(n) || n < 0 ? 5 : Math.min(100, Math.round(n * 100) / 100);
  return {
    storeDevopsShareChangeScheduledAt: tomorrowKstIsoStart(),
    storeDevopsShareChangeScheduledPercent: pct,
  };
}

function buildManufacturerSchedulePayload(pendingPct: number | null) {
  if (pendingPct == null) {
    return {
      manufacturerShareChangeScheduledAt: null as string | null,
      manufacturerShareChangeScheduledPercent: null as number | null,
    };
  }
  const pct = readManufacturerSharePercent(pendingPct);
  return {
    manufacturerShareChangeScheduledAt: tomorrowKstIsoStart(),
    manufacturerShareChangeScheduledPercent: pct,
  };
}

function buildLaunchEventApplyPayload(enabled: boolean) {
  return {
    customAbutmentLaunchEventEnabled: enabled,
    customAbutmentLaunchEventStartedAt: null as string | null,
    customAbutmentLaunchEventEndedAt: enabled
      ? (null as string | null)
      : new Date().toISOString(),
    customAbutmentLaunchEventChangeScheduledAt: null as string | null,
    customAbutmentLaunchEventChangeScheduledEnabled: null as boolean | null,
  };
}

function buildStoreManufacturerSchedulePayload(pendingPct: number | null) {
  if (pendingPct == null) {
    return {
      storeManufacturerShareChangeScheduledAt: null as string | null,
      storeManufacturerShareChangeScheduledPercent: null as number | null,
    };
  }
  const pct = readManufacturerSharePercent(pendingPct);
  return {
    storeManufacturerShareChangeScheduledAt: tomorrowKstIsoStart(),
    storeManufacturerShareChangeScheduledPercent: pct,
  };
}

function buildLabPercentSchedulePayload(
  field: "biz" | "salesTeam" | "devops",
  pendingPct: number | null,
) {
  const atKey =
    field === "biz"
      ? "labBizShareChangeScheduledAt"
      : field === "salesTeam"
        ? "labSalesTeamShareChangeScheduledAt"
        : "labDevopsShareChangeScheduledAt";
  const pctKey =
    field === "biz"
      ? "labBizShareChangeScheduledPercent"
      : field === "salesTeam"
        ? "labSalesTeamShareChangeScheduledPercent"
        : "labDevopsShareChangeScheduledPercent";
  if (pendingPct == null) {
    return {
      [atKey]: null as string | null,
      [pctKey]: null as number | null,
    };
  }
  const n = Number(pendingPct);
  const pct =
    !Number.isFinite(n) || n < 0 ? 0 : Math.min(100, Math.round(n * 100) / 100);
  return {
    [atKey]: tomorrowKstIsoStart(),
    [pctKey]: pct,
  };
}

function ShareChangePendingBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="text-[12px] font-medium text-amber-700">
      내일부터 변경 적용
    </span>
  );
}

function DealerRatePctSelect({
  value,
  onChange,
  disabled,
}: {
  value: DealerRatePct;
  onChange: (next: DealerRatePct) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="딜러 분배율"
      className="flex w-full items-center gap-1 rounded-xl bg-slate-100/80 p-1"
    >
      {DEALER_RATE_PCT_OPTIONS.map((pct) => {
        const selected = value === pct;
        return (
          <button
            key={pct}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(pct)}
            className={cn(
              "h-9 flex-1 rounded-lg px-2 text-sm font-semibold tabular-nums transition-colors",
              selected
                ? "bg-white text-primary-strong shadow-sm ring-1 ring-primary-muted/50"
                : "text-slate-500 hover:text-slate-800",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            {pct}%
          </button>
        );
      })}
    </div>
  );
}

const DEFAULT_MANUFACTURER_REQUEST_UNIT_PRICE = 6500;
const DEFAULT_MANUFACTURER_REMAKE_UNIT_PRICE = 6500;
/** 커스텀어벗 매입가 = 판매가 × 제조사 비율. 기본 50%. */
const DEFAULT_MANUFACTURER_PURCHASE_PERCENT = 50;

/** 매입가(부가세 포함) = 판매가(부가세 면제) × 제조사 비율. 0% 허용. */
function purchasePriceFromSale(
  sale: number,
  manufacturerPercent: number = DEFAULT_MANUFACTURER_PURCHASE_PERCENT,
): number {
  const n = Number(manufacturerPercent);
  const pct = Math.max(
    0,
    Math.min(
      100,
      Number.isFinite(n) ? n : DEFAULT_MANUFACTURER_PURCHASE_PERCENT,
    ),
  );
  return Math.max(0, Math.round(((Number(sale) || 0) * pct) / 100));
}

/** 제조사 분배%. 0 허용. null/NaN만 기본값. */
function readManufacturerSharePercent(
  value: unknown,
  fallback: number = DEFAULT_MANUFACTURER_PURCHASE_PERCENT,
): number {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(100, Math.round(n * 100) / 100);
}

function clampSharePercent(value: number, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(100, Math.round(n * 100) / 100);
}

function readResidualSharePercents(
  settings: Partial<CreditSettings>,
  kind: ShareKind = "membership",
) {
  if (kind === "regular") {
    const salesman = clampSharePercent(
      settings.regularSalesmanSharePercent ??
        REGULAR_RESIDUAL_SHARE_PERCENTS.salesman,
      REGULAR_RESIDUAL_SHARE_PERCENTS.salesman,
    );
    const devops = clampSharePercent(
      settings.regularDevopsSharePercent ?? REGULAR_RESIDUAL_SHARE_PERCENTS.devops,
      REGULAR_RESIDUAL_SHARE_PERCENTS.devops,
    );
    const abutsFallback =
      settings.regularAbutsSharePercent != null
        ? REGULAR_RESIDUAL_SHARE_PERCENTS.abuts
        : Math.max(0, 100 - salesman - devops);
    return {
      salesman,
      devops,
      abuts: clampSharePercent(
        settings.regularAbutsSharePercent ?? abutsFallback,
        abutsFallback,
      ),
    };
  }
  const salesman = clampSharePercent(
    settings.salesmanSharePercent ?? MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.salesman,
    MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.salesman,
  );
  const devops = clampSharePercent(
    settings.devopsSharePercent ?? MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops,
    MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops,
  );
  const abutsFallback =
    settings.abutsSharePercent != null
      ? MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.abuts
      : Math.max(0, 100 - salesman - devops);
  return {
    salesman,
    devops,
    abuts: clampSharePercent(
      settings.abutsSharePercent ?? abutsFallback,
      abutsFallback,
    ),
  };
}

/** @deprecated 레거시 호환 별칭. 잔여 비중만 사용. */
function readSharePercents(
  settings: Partial<CreditSettings>,
  kind: ShareKind = "membership",
) {
  const residual = readResidualSharePercents(settings, kind);
  return {
    manufacturer: 0,
    salesman: residual.salesman,
    devops: residual.devops,
    abuts: residual.abuts,
  };
}

type ResidualUnitPrices = TierParty & { abuts: number };

function allocateRevenueByFixedManufacturerAndResidualShares(
  revenue: number,
  manufacturerInclusiveUnitPrice: number,
  residualShares: ReturnType<typeof readResidualSharePercents>,
): ResidualUnitPrices {
  const rev = Math.max(0, Math.round(Number(revenue) || 0));
  // 설정 매입가는 부가세 포함. 잔여 분배는 공급가 선차감(장부 SSOT).
  const manufacturerSupply = Math.min(
    splitInclusiveVat(
      Math.max(0, Math.round(Number(manufacturerInclusiveUnitPrice) || 0)),
      AFFILIATE_VAT_RATE,
    ).supply,
    rev,
  );
  const residual = Math.max(0, rev - manufacturerSupply);
  const salesmanW = Math.max(0, Number(residualShares.salesman) || 0);
  const devopsW = Math.max(0, Number(residualShares.devops) || 0);
  const abutsW = Math.max(0, Number(residualShares.abuts) || 0);
  const weightSum = salesmanW + devopsW + abutsW;
  if (residual <= 0 || weightSum <= 0) {
    return { manufacturer: manufacturerSupply, salesman: 0, devops: 0, abuts: 0 };
  }
  const salesman = Math.round((residual * salesmanW) / weightSum);
  const devops = Math.round((residual * devopsW) / weightSum);
  const abuts = Math.max(0, residual - salesman - devops);
  return { manufacturer: manufacturerSupply, salesman, devops, abuts };
}

function allocateRevenueByPercent(
  revenue: number,
  shares: ReturnType<typeof readSharePercents>,
  manufacturerUnitPrice = DEFAULT_MANUFACTURER_REQUEST_UNIT_PRICE,
): TierParty {
  return allocateRevenueByFixedManufacturerAndResidualShares(
    revenue,
    manufacturerUnitPrice,
    {
      salesman: shares.salesman,
      devops: shares.devops,
      abuts: shares.abuts,
    },
  );
}

type AutoSaveState = "idle" | "pending" | "saving" | "saved";

function AutoSaveIndicator({ state }: { state: AutoSaveState }) {
  if (state === "idle") return null;

  const copy =
    state === "pending"
      ? "변경됨 · 곧 저장"
      : state === "saving"
        ? "저장 중…"
        : "저장됨";

  const Icon =
    state === "pending"
      ? CloudUpload
      : state === "saving"
        ? Loader2
        : Check;

  const tone =
    state === "saved"
      ? "text-emerald-700 ring-emerald-200/80"
      : "text-slate-600 ring-slate-200/80";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-medium ring-1 ${tone}`}
    >
      <Icon
        className={`h-3.5 w-3.5 ${state === "saving" ? "animate-spin" : ""}`}
      />
      {copy}
    </span>
  );
}

const CNC_DEFAULT_TIERS: Array<{
  label: string;
  revenueKey:
    | "membershipProductionPrice"
    | "regularProductionPrice"
    | "membershipDesignAndProductionPrice"
    | "regularDesignAndProductionPrice";
  partyPrefix: TierPartyPrefix;
  shareKind: ShareKind;
}> = [
  {
    label: "생산(고시)",
    revenueKey: "membershipProductionPrice",
    partyPrefix: "membershipProduction",
    shareKind: "membership",
  },
  {
    label: "생산(딜러없음)",
    revenueKey: "regularProductionPrice",
    partyPrefix: "regularProduction",
    shareKind: "regular",
  },
  {
    label: "디자인+생산(고시)",
    revenueKey: "membershipDesignAndProductionPrice",
    partyPrefix: "membershipDesignAndProduction",
    shareKind: "membership",
  },
  {
    label: "디자인+생산(딜러없음)",
    revenueKey: "regularDesignAndProductionPrice",
    partyPrefix: "regularDesignAndProduction",
    shareKind: "regular",
  },
];

function tierPartyFieldKey(prefix: TierPartyPrefix, kind: PartyKind): keyof CreditSettings {
  return `${prefix}${kind}UnitPrice` as keyof CreditSettings;
}

function buildNormalizedTierPartyFields(
  raw: Partial<CreditSettings>,
  fallback: CreditSettings,
): Pick<
  CreditSettings,
  | "membershipProductionManufacturerUnitPrice"
  | "membershipProductionSalesmanUnitPrice"
  | "membershipProductionDevopsUnitPrice"
  | "regularProductionManufacturerUnitPrice"
  | "regularProductionSalesmanUnitPrice"
  | "regularProductionDevopsUnitPrice"
  | "membershipDesignAndProductionManufacturerUnitPrice"
  | "membershipDesignAndProductionSalesmanUnitPrice"
  | "membershipDesignAndProductionDevopsUnitPrice"
  | "regularDesignAndProductionManufacturerUnitPrice"
  | "regularDesignAndProductionSalesmanUnitPrice"
  | "regularDesignAndProductionDevopsUnitPrice"
> {
  const merged = { ...fallback, ...raw };
  const manufacturerUnit = Math.max(
    0,
    Math.round(
      Number(
        merged.manufacturerRequestUnitPrice ??
          DEFAULT_MANUFACTURER_REQUEST_UNIT_PRICE,
      ) || 0,
    ),
  );
  const out = {} as Record<string, number>;
  for (const tier of CNC_DEFAULT_TIERS) {
    const revenue = Number(merged[tier.revenueKey] ?? 0) || 0;
    const party = allocateRevenueByPercent(
      revenue,
      readSharePercents(merged, tier.shareKind),
      manufacturerUnit,
    );
    out[tierPartyFieldKey(tier.partyPrefix, "Manufacturer")] = party.manufacturer;
    out[tierPartyFieldKey(tier.partyPrefix, "Salesman")] = party.salesman;
    out[tierPartyFieldKey(tier.partyPrefix, "Devops")] = party.devops;
  }
  return out as Pick<
    CreditSettings,
    | "membershipProductionManufacturerUnitPrice"
    | "membershipProductionSalesmanUnitPrice"
    | "membershipProductionDevopsUnitPrice"
    | "regularProductionManufacturerUnitPrice"
    | "regularProductionSalesmanUnitPrice"
    | "regularProductionDevopsUnitPrice"
    | "membershipDesignAndProductionManufacturerUnitPrice"
    | "membershipDesignAndProductionSalesmanUnitPrice"
    | "membershipDesignAndProductionDevopsUnitPrice"
    | "regularDesignAndProductionManufacturerUnitPrice"
    | "regularDesignAndProductionSalesmanUnitPrice"
    | "regularDesignAndProductionDevopsUnitPrice"
  >;
}

function syncComputedPartyFields(settings: CreditSettings): CreditSettings {
  const manufacturerUnit = Math.max(
    0,
    Math.round(
      Number(
        settings.manufacturerRequestUnitPrice ??
          DEFAULT_MANUFACTURER_REQUEST_UNIT_PRICE,
      ) || 0,
    ),
  );
  const tierFields = buildNormalizedTierPartyFields(settings, settings);
  const membershipShares = readSharePercents(settings, "membership");
  const membershipParty = allocateRevenueByPercent(
    settings.membershipProductionPrice,
    membershipShares,
    manufacturerUnit,
  );
  const specialRequestorPrices = settings.specialRequestorPrices.map((item) => {
    const productionParty = allocateRevenueByPercent(
      item.productionPrice,
      membershipShares,
      manufacturerUnit,
    );
    const designParty = allocateRevenueByPercent(
      item.designAndProductionPrice,
      membershipShares,
      manufacturerUnit,
    );
    return {
      ...item,
      productionManufacturerUnitPrice: productionParty.manufacturer,
      productionSalesmanUnitPrice: productionParty.salesman,
      productionDevopsUnitPrice: productionParty.devops,
      designAndProductionManufacturerUnitPrice: designParty.manufacturer,
      designAndProductionSalesmanUnitPrice: designParty.salesman,
      designAndProductionDevopsUnitPrice: designParty.devops,
      manufacturerRequestUnitPrice: manufacturerUnit,
      devopsRequestUnitPrice: productionParty.devops,
      salesmanRequestUnitPrice: productionParty.salesman,
    };
  });
  return {
    ...settings,
    ...tierFields,
    manufacturerRequestUnitPrice: manufacturerUnit,
    salesmanRequestUnitPrice: membershipParty.salesman,
    devopsRequestUnitPrice: membershipParty.devops,
    specialRequestorPrices,
  };
}

function buildSharePercentSavePayload(
  settings: CreditSettings,
): Partial<CreditSettings> {
  const synced = syncComputedPartyFields(settings);
  const customAbuts = abutsShareFromParts(
    synced.manufacturerSharePercent,
    synced.salesmanSharePercent,
    synced.devopsSharePercent,
  );
  const storeAbuts = abutsShareFromParts(
    synced.storeManufacturerSharePercent,
    synced.storeSalesmanSharePercent,
    synced.storeDevopsSharePercent,
  );
  return {
    manufacturerSharePercent: synced.manufacturerSharePercent,
    salesmanSharePercent: synced.salesmanSharePercent,
    devopsSharePercent: synced.devopsSharePercent,
    abutsSharePercent: customAbuts,
    regularManufacturerSharePercent: 0,
    regularSalesmanSharePercent: synced.regularSalesmanSharePercent,
    regularDevopsSharePercent: synced.regularDevopsSharePercent,
    regularAbutsSharePercent: abutsShareFromParts(
      0,
      synced.regularSalesmanSharePercent,
      synced.regularDevopsSharePercent,
    ),
    storeManufacturerSharePercent: synced.storeManufacturerSharePercent,
    storeSalesmanSharePercent: synced.storeSalesmanSharePercent,
    storeDevopsSharePercent: synced.storeDevopsSharePercent,
    storeAbutsSharePercent: storeAbuts,
    labBizSharePercent: synced.labBizSharePercent,
    labSalesTeamSharePercent: synced.labSalesTeamSharePercent,
    labDevopsSharePercent: synced.labDevopsSharePercent,
    labAbutsSharePercent: abutsShareFromParts(
      synced.labBizSharePercent,
      synced.labSalesTeamSharePercent,
      synced.labDevopsSharePercent,
    ),
    ...buildNormalizedTierPartyFields(synced, synced),
    manufacturerRequestUnitPrice: purchasePriceFromSale(
      synced.labProductionPrice,
      synced.manufacturerSharePercent,
    ),
    manufacturerRemakeUnitPrice: synced.manufacturerRemakeUnitPrice,
    manufacturerShippingUnitPrice: synced.manufacturerShippingUnitPrice,
    salesmanRequestUnitPrice: synced.salesmanRequestUnitPrice,
    devopsRequestUnitPrice: synced.devopsRequestUnitPrice,
    specialRequestorPrices: synced.specialRequestorPrices,
  };
}

function PercentField({
  id,
  label,
  value,
  onChange,
  disabled,
  readOnly = false,
  unitPrice,
  previousPercent,
}: {
  id: string;
  label: string;
  value: number;
  onChange?: (next: number) => void;
  disabled?: boolean;
  readOnly?: boolean;
  /** 판매가−매입가 잔여 × 비중으로 산출한 개당 단가 */
  unitPrice?: number;
  /** 변경 전(현재 적용) %. 라벨 오른쪽 끝에 표시. */
  previousPercent?: number;
}) {
  const hasPrevious =
    previousPercent != null && Number.isFinite(previousPercent);
  const previousChanged =
    hasPrevious && Math.abs(Number(previousPercent) - Number(value)) > 0.0001;
  const previousLabel = hasPrevious
    ? `${Number(previousPercent).toLocaleString("ko-KR", {
        maximumFractionDigits: 1,
      })}%`
    : null;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Label
          htmlFor={id}
          className="min-w-0 text-sm font-medium text-slate-800"
        >
          {label}
        </Label>
        {previousLabel ? (
          <span
            className={
              previousChanged
                ? "shrink-0 text-xs font-semibold tabular-nums tracking-tight text-amber-700"
                : "shrink-0 text-xs font-medium tabular-nums tracking-tight text-slate-400"
            }
            title="변경 전(현재 적용)"
          >
            {previousLabel}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {readOnly ? (
          <div className="relative min-w-0 flex-1">
            <div className="flex h-11 items-center justify-end rounded-xl border border-slate-200 bg-slate-50/60 pr-10 text-base font-semibold tabular-nums tracking-tight text-slate-800">
              {value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}
            </div>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
              %
            </span>
          </div>
        ) : (
          <div className="relative min-w-0 flex-1">
            <Input
              id={id}
              type="number"
              min="0"
              max="100"
              step={PERCENT_STEP}
              className="h-11 rounded-xl border-slate-200 bg-slate-50/60 pr-10 text-right text-base font-semibold tabular-nums tracking-tight"
              value={value}
              disabled={disabled}
              onChange={(event) =>
                onChange?.(clampSharePercent(Number(event.target.value), value))
              }
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
              %
            </span>
          </div>
        )}
        {unitPrice != null ? (
          <div className="min-w-[5.75rem] shrink-0 text-right text-sm font-semibold tabular-nums tracking-tight text-slate-900">
            {Math.max(0, Math.round(unitPrice)).toLocaleString("ko-KR")}
            <span className="ml-0.5 text-xs font-medium text-slate-400">원</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SharePercentRow({
  idPrefix,
  rowLabel,
  shares,
  manufacturerPercent,
  dealerSelectPct,
  previousManufacturerPercent,
  previousDealerPercent,
  previousDevopsPercent,
  previousAbutsPercent,
  disabled,
  onManufacturerChange,
  onDealerChange,
  onDevopsChange,
}: {
  idPrefix: string;
  rowLabel: string;
  shares: ReturnType<typeof readResidualSharePercents>;
  manufacturerPercent: number;
  dealerSelectPct: DealerRatePct;
  previousManufacturerPercent: number;
  previousDealerPercent: number;
  previousDevopsPercent: number;
  previousAbutsPercent: number;
  disabled?: boolean;
  onManufacturerChange: (next: number) => void;
  onDealerChange: (next: DealerRatePct) => void;
  onDevopsChange: (next: number) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-slate-800">{rowLabel}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,24fr)_minmax(0,28fr)_minmax(0,24fr)_minmax(0,24fr)]">
        <PercentField
          id={`${idPrefix}-manufacturer`}
          label="제조사"
          value={manufacturerPercent}
          previousPercent={previousManufacturerPercent}
          disabled={disabled}
          onChange={onManufacturerChange}
        />
        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Label
              htmlFor={`${idPrefix}-dealer`}
              className="min-w-0 text-sm font-medium text-slate-800"
            >
              딜러
            </Label>
            <span
              className={
                Math.abs(previousDealerPercent - dealerSelectPct) > 0.0001
                  ? "shrink-0 text-xs font-semibold tabular-nums tracking-tight text-amber-700"
                  : "shrink-0 text-xs font-medium tabular-nums tracking-tight text-slate-400"
              }
              title="변경 전(현재 적용)"
            >
              {previousDealerPercent.toLocaleString("ko-KR", {
                maximumFractionDigits: 1,
              })}
              %
            </span>
          </div>
          <DealerRatePctSelect
            value={dealerSelectPct}
            onChange={onDealerChange}
            disabled={disabled}
          />
        </div>
        <PercentField
          id={`${idPrefix}-devops`}
          label="개발운영사"
          value={shares.devops}
          previousPercent={previousDevopsPercent}
          disabled={disabled}
          onChange={onDevopsChange}
        />
        <PercentField
          id={`${idPrefix}-abuts`}
          label="어벗츠"
          value={shares.abuts}
          previousPercent={previousAbutsPercent}
          disabled={disabled}
          readOnly
        />
      </div>
    </div>
  );
}

/** 기공: 기공사업부 · 영업팀 · 개발운영사 · 어벗츠(나머지). */
function LabSharePercentRow({
  idPrefix,
  bizPercent,
  salesTeamPercent,
  devopsPercent,
  abutsPercent,
  previousBizPercent,
  previousSalesTeamPercent,
  previousDevopsPercent,
  previousAbutsPercent,
  disabled,
  onBizChange,
  onSalesTeamChange,
  onDevopsChange,
}: {
  idPrefix: string;
  bizPercent: number;
  salesTeamPercent: number;
  devopsPercent: number;
  abutsPercent: number;
  previousBizPercent: number;
  previousSalesTeamPercent: number;
  previousDevopsPercent: number;
  previousAbutsPercent: number;
  disabled?: boolean;
  onBizChange: (next: number) => void;
  onSalesTeamChange: (next: number) => void;
  onDevopsChange: (next: number) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-slate-800">기공</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <PercentField
          id={`${idPrefix}-biz`}
          label="기공사업부"
          value={bizPercent}
          previousPercent={previousBizPercent}
          disabled={disabled}
          onChange={onBizChange}
        />
        <PercentField
          id={`${idPrefix}-salesTeam`}
          label="영업팀"
          value={salesTeamPercent}
          previousPercent={previousSalesTeamPercent}
          disabled={disabled}
          onChange={onSalesTeamChange}
        />
        <PercentField
          id={`${idPrefix}-devops`}
          label="개발운영사"
          value={devopsPercent}
          previousPercent={previousDevopsPercent}
          disabled={disabled}
          onChange={onDevopsChange}
        />
        <PercentField
          id={`${idPrefix}-abuts`}
          label="어벗츠"
          value={abutsPercent}
          previousPercent={previousAbutsPercent}
          disabled={disabled}
          readOnly
        />
      </div>
    </div>
  );
}

function normalizeSpecialRequestorPrice(
  item: Partial<SpecialRequestorPrice> & { amount?: number },
  fallback: CreditSettings,
): SpecialRequestorPrice {
  const productionPrice = Math.max(
    0,
    Number(item.productionPrice ?? item.amount) || 0,
  );
  const legacyDesignFee = Math.max(
    0,
    Number(fallback.designFee) ||
      fallback.membershipDesignAndProductionPrice -
        fallback.membershipProductionPrice,
  );
  const hasExplicitDesign = item.designAndProductionPrice != null;
  const designAndProductionPrice = Math.max(
    0,
    Number(
      hasExplicitDesign
        ? item.designAndProductionPrice
        : productionPrice + legacyDesignFee,
    ) || 0,
  );
  const manufacturerUnit = Math.max(
    0,
    Math.round(
      Number(
        fallback.manufacturerRequestUnitPrice ??
          DEFAULT_MANUFACTURER_REQUEST_UNIT_PRICE,
      ) || 0,
    ),
  );
  const shares = readSharePercents(fallback, "membership");
  const productionParty = allocateRevenueByPercent(
    productionPrice,
    shares,
    manufacturerUnit,
  );
  const designParty = allocateRevenueByPercent(
    designAndProductionPrice,
    shares,
    manufacturerUnit,
  );
  const productionManufacturerUnitPrice = productionParty.manufacturer;
  const productionSalesmanUnitPrice = productionParty.salesman;
  const productionDevopsUnitPrice = productionParty.devops;
  const designAndProductionManufacturerUnitPrice = designParty.manufacturer;
  const designAndProductionSalesmanUnitPrice = designParty.salesman;
  const designAndProductionDevopsUnitPrice = designParty.devops;
  return {
    requestorAnchorId: String(item.requestorAnchorId || ""),
    amount: productionPrice,
    productionPrice,
    designAndProductionPrice,
    roundBarProductionPrice: Math.max(
      0,
      Number(
        item.roundBarProductionPrice ??
          fallback.membershipRoundBarProductionPrice,
      ) || 0,
    ),
    roundBarDesignAndProductionPrice: Math.max(
      0,
      Number(
        item.roundBarDesignAndProductionPrice ??
          fallback.membershipRoundBarDesignAndProductionPrice,
      ) || 0,
    ),
    manufacturerRequestUnitPrice: productionManufacturerUnitPrice,
    devopsRequestUnitPrice: productionDevopsUnitPrice,
    salesmanRequestUnitPrice: productionSalesmanUnitPrice,
    productionManufacturerUnitPrice,
    productionSalesmanUnitPrice,
    productionDevopsUnitPrice,
    designAndProductionManufacturerUnitPrice,
    designAndProductionSalesmanUnitPrice,
    designAndProductionDevopsUnitPrice,
  };
}

function normalizeCreditSettings(
  raw: Partial<CreditSettings> | typeof CREDIT_SETTINGS_DEFAULTS,
  fallback: CreditSettings,
): CreditSettings {
  const abutmentPrices = normalizeAbutsAbutmentCreditPrices({
    ...fallback,
    ...raw,
  });
  const withPrices: CreditSettings = {
    minCreditForRequest: abutmentPrices.membershipProductionPrice,
    specialRequestorPrices: [],
    shippingFee: Number(raw.shippingFee ?? fallback.shippingFee),
    manufacturerRequestUnitPrice: Number(
      (raw as CreditSettings).manufacturerRequestUnitPrice ??
        (fallback as CreditSettings).manufacturerRequestUnitPrice ??
        9000,
    ),
    manufacturerRemakeUnitPrice: Number(
      (raw as CreditSettings).manufacturerRemakeUnitPrice ??
        (fallback as CreditSettings).manufacturerRemakeUnitPrice ??
        DEFAULT_MANUFACTURER_REMAKE_UNIT_PRICE,
    ),
    devopsRequestUnitPrice: Number(
      (raw as CreditSettings).devopsRequestUnitPrice ??
        (fallback as CreditSettings).devopsRequestUnitPrice ??
        1000,
    ),
    salesmanRequestUnitPrice: Number(
      (raw as CreditSettings).salesmanRequestUnitPrice ??
        (fallback as CreditSettings).salesmanRequestUnitPrice ??
        3000,
    ),
    manufacturerShippingUnitPrice: Number(
      (raw as CreditSettings).manufacturerShippingUnitPrice ??
        (fallback as CreditSettings).manufacturerShippingUnitPrice ??
        3500,
    ),
    affiliateVatRate: (() => {
      const rawRate = Number(
        (raw as CreditSettings).affiliateVatRate ??
          (fallback as CreditSettings).affiliateVatRate ??
          0.1,
      );
      if (!Number.isFinite(rawRate) || rawRate < 0) return 0.1;
      return Math.min(1, rawRate);
    })(),
    expressFee: Number(raw.expressFee ?? fallback.expressFee),
    designFee: Math.max(
      0,
      abutmentPrices.membershipDesignAndProductionPrice -
        abutmentPrices.membershipProductionPrice,
    ),
    abutmentDesignLabFee: Math.max(
      0,
      Number(
        (raw as CreditSettings).abutmentDesignLabFee ??
          (fallback as CreditSettings).abutmentDesignLabFee ??
          10000,
      ) || 0,
    ),
    abutmentRetailPrice: Number(
      raw.abutmentRetailPrice ?? fallback.abutmentRetailPrice ?? 40000,
    ),
    practiceMembershipMonthlyFee: Number(
      raw.practiceMembershipMonthlyFee ??
        fallback.practiceMembershipMonthlyFee ??
        50000,
    ),
    defaultRequestFreeCredit: Number(
      raw.defaultRequestFreeCredit ?? fallback.defaultRequestFreeCredit,
    ),
    // 환영 지급은 무료크레딧 단일. 레거시 배송 환영 설정값은 저장·표시 모두 0.
    defaultShippingFreeCredit: 0,
    ...abutmentPrices,
    labProductionPrice: Math.max(
      0,
      Number(
        (raw as CreditSettings).labProductionPrice ??
          fallback.labProductionPrice ??
          abutmentPrices.membershipProductionPrice,
      ) || 0,
    ),
    labDesignAndProductionPrice: Math.max(
      0,
      Number(
        (raw as CreditSettings).labDesignAndProductionPrice ??
          fallback.labDesignAndProductionPrice ??
          abutmentPrices.membershipDesignAndProductionPrice,
      ) || 0,
    ),
    labRoundBarProductionPrice: (() => {
      const rawVal = Number(
        (raw as CreditSettings).labRoundBarProductionPrice ??
          fallback.labRoundBarProductionPrice,
      );
      if (Number.isFinite(rawVal) && rawVal > 0) return Math.round(rawVal);
      return abutmentPrices.membershipRoundBarProductionPrice;
    })(),
    labRoundBarDesignAndProductionPrice: (() => {
      const rawVal = Number(
        (raw as CreditSettings).labRoundBarDesignAndProductionPrice ??
          fallback.labRoundBarDesignAndProductionPrice,
      );
      if (Number.isFinite(rawVal) && rawVal > 0) return Math.round(rawVal);
      return abutmentPrices.membershipRoundBarDesignAndProductionPrice;
    })(),
    manufacturerSharePercent: readManufacturerSharePercent(
      (raw as CreditSettings).manufacturerSharePercent ??
        (fallback as CreditSettings).manufacturerSharePercent,
    ),
    salesmanSharePercent: clampSharePercent(
      Number(
        (raw as CreditSettings).salesmanSharePercent ??
          (fallback as CreditSettings).salesmanSharePercent ??
          MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.salesman,
      ),
      MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.salesman,
    ),
    devopsSharePercent: clampSharePercent(
      Number(
        (raw as CreditSettings).devopsSharePercent ??
          (fallback as CreditSettings).devopsSharePercent ??
          MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops,
      ),
      MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops,
    ),
    abutsSharePercent: clampSharePercent(
      Number(
        (raw as CreditSettings).abutsSharePercent ??
          (fallback as CreditSettings).abutsSharePercent ??
          MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.abuts,
      ),
      MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.abuts,
    ),
    regularManufacturerSharePercent: clampSharePercent(
      Number(
        (raw as CreditSettings).regularManufacturerSharePercent ??
          (fallback as CreditSettings).regularManufacturerSharePercent ??
          0,
      ),
      0,
    ),
    regularSalesmanSharePercent: clampSharePercent(
      Number(
        (raw as CreditSettings).regularSalesmanSharePercent ??
          (fallback as CreditSettings).regularSalesmanSharePercent ??
          REGULAR_RESIDUAL_SHARE_PERCENTS.salesman,
      ),
      REGULAR_RESIDUAL_SHARE_PERCENTS.salesman,
    ),
    regularDevopsSharePercent: clampSharePercent(
      Number(
        (raw as CreditSettings).regularDevopsSharePercent ??
          (fallback as CreditSettings).regularDevopsSharePercent ??
          REGULAR_RESIDUAL_SHARE_PERCENTS.devops,
      ),
      REGULAR_RESIDUAL_SHARE_PERCENTS.devops,
    ),
    regularAbutsSharePercent: clampSharePercent(
      Number(
        (raw as CreditSettings).regularAbutsSharePercent ??
          (fallback as CreditSettings).regularAbutsSharePercent ??
          REGULAR_RESIDUAL_SHARE_PERCENTS.abuts,
      ),
      REGULAR_RESIDUAL_SHARE_PERCENTS.abuts,
    ),
    storeManufacturerSharePercent: readManufacturerSharePercent(
      (raw as CreditSettings).storeManufacturerSharePercent ??
        (fallback as CreditSettings).storeManufacturerSharePercent ??
        (raw as CreditSettings).manufacturerSharePercent ??
        (fallback as CreditSettings).manufacturerSharePercent,
    ),
    storeSalesmanSharePercent: clampSharePercent(
      Number(
        (raw as CreditSettings).storeSalesmanSharePercent ??
          (fallback as CreditSettings).storeSalesmanSharePercent ??
          (raw as CreditSettings).salesmanSharePercent ??
          (fallback as CreditSettings).salesmanSharePercent ??
          MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.salesman,
      ),
      MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.salesman,
    ),
    storeDevopsSharePercent: clampSharePercent(
      Number(
        (raw as CreditSettings).storeDevopsSharePercent ??
          (fallback as CreditSettings).storeDevopsSharePercent ??
          (raw as CreditSettings).devopsSharePercent ??
          (fallback as CreditSettings).devopsSharePercent ??
          MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops,
      ),
      MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops,
    ),
    storeAbutsSharePercent: clampSharePercent(
      Number(
        (raw as CreditSettings).storeAbutsSharePercent ??
          (fallback as CreditSettings).storeAbutsSharePercent ??
          (raw as CreditSettings).abutsSharePercent ??
          (fallback as CreditSettings).abutsSharePercent ??
          MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.abuts,
      ),
      MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.abuts,
    ),
    labBizSharePercent: readManufacturerSharePercent(
      (raw as CreditSettings).labBizSharePercent ??
        (fallback as CreditSettings).labBizSharePercent,
      LAB_SHARE_PERCENTS.biz,
    ),
    labSalesTeamSharePercent: readManufacturerSharePercent(
      (raw as CreditSettings).labSalesTeamSharePercent ??
        (fallback as CreditSettings).labSalesTeamSharePercent,
      LAB_SHARE_PERCENTS.salesTeam,
    ),
    labDevopsSharePercent: readManufacturerSharePercent(
      (raw as CreditSettings).labDevopsSharePercent ??
        (fallback as CreditSettings).labDevopsSharePercent,
      LAB_SHARE_PERCENTS.devops,
    ),
    labAbutsSharePercent: clampSharePercent(
      Number(
        (raw as CreditSettings).labAbutsSharePercent ??
          (fallback as CreditSettings).labAbutsSharePercent ??
          LAB_SHARE_PERCENTS.abuts,
      ),
      LAB_SHARE_PERCENTS.abuts,
    ),
    customAbutmentLaunchEventEnabled:
      (raw as CreditSettings).customAbutmentLaunchEventEnabled !== false,
    customAbutmentLaunchEventStartedAt:
      (raw as CreditSettings).customAbutmentLaunchEventStartedAt ??
      (fallback as CreditSettings).customAbutmentLaunchEventStartedAt ??
      null,
    customAbutmentLaunchEventEndedAt:
      (raw as CreditSettings).customAbutmentLaunchEventEndedAt ??
      (fallback as CreditSettings).customAbutmentLaunchEventEndedAt ??
      null,
    customAbutmentLaunchEventProductionPrice: Math.max(
      0,
      Number(
        (raw as CreditSettings).customAbutmentLaunchEventProductionPrice ??
          (fallback as CreditSettings).customAbutmentLaunchEventProductionPrice ??
          ABUTS_ABUTMENT_LAUNCH_EVENT_PRODUCTION_PRICE,
      ) || 0,
    ),
    fmDentalMonthlyShippingFee: Math.max(
      0,
      Number(
        (raw as CreditSettings).fmDentalMonthlyShippingFee ??
          (fallback as CreditSettings).fmDentalMonthlyShippingFee ??
          0,
      ) || 0,
    ),
    ...buildNormalizedTierPartyFields({ ...fallback, ...raw, ...abutmentPrices }, {
      ...CREDIT_SETTINGS_DEFAULTS,
      ...fallback,
      ...raw,
      ...abutmentPrices,
    } as CreditSettings),
  };
  withPrices.manufacturerRequestUnitPrice = Math.max(
    0,
    Math.round(
      Number(
        (raw as CreditSettings).manufacturerRequestUnitPrice ??
          (fallback as CreditSettings).manufacturerRequestUnitPrice ??
          DEFAULT_MANUFACTURER_REQUEST_UNIT_PRICE,
      ) || 0,
    ),
  );
  // 레거시 잔여%분배(제조사 비중 > 0 · abuts 없음) → 매입 비율 50% + 잔여 비중 기본값.
  const legacyManufacturerShare = Number(
    (raw as CreditSettings).manufacturerSharePercent ??
      (fallback as CreditSettings).manufacturerSharePercent ??
      0,
  );
  const hasExplicitAbuts = (raw as CreditSettings).abutsSharePercent != null;
  const hasExplicitManufacturerPurchase =
    (raw as CreditSettings).manufacturerSharePercent != null;
  if (
    legacyManufacturerShare > 0 &&
    !hasExplicitAbuts &&
    !hasExplicitManufacturerPurchase
  ) {
    withPrices.manufacturerSharePercent = DEFAULT_MANUFACTURER_PURCHASE_PERCENT;
    withPrices.salesmanSharePercent = MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.salesman;
    withPrices.devopsSharePercent = MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops;
    withPrices.abutsSharePercent = MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.abuts;
    withPrices.regularManufacturerSharePercent = 0;
    withPrices.regularSalesmanSharePercent = REGULAR_RESIDUAL_SHARE_PERCENTS.salesman;
    withPrices.regularDevopsSharePercent = REGULAR_RESIDUAL_SHARE_PERCENTS.devops;
    withPrices.regularAbutsSharePercent = REGULAR_RESIDUAL_SHARE_PERCENTS.abuts;
    if (
      !(raw as CreditSettings).manufacturerRequestUnitPrice &&
      withPrices.manufacturerRequestUnitPrice !==
        DEFAULT_MANUFACTURER_REQUEST_UNIT_PRICE
    ) {
      withPrices.manufacturerRequestUnitPrice =
        DEFAULT_MANUFACTURER_REQUEST_UNIT_PRICE;
    }
    Object.assign(
      withPrices,
      buildNormalizedTierPartyFields(withPrices, withPrices),
    );
  }

  withPrices.salesmanRequestUnitPrice =
    withPrices.membershipProductionSalesmanUnitPrice;
  withPrices.devopsRequestUnitPrice =
    withPrices.membershipProductionDevopsUnitPrice;
  withPrices.specialRequestorPrices = Array.isArray(raw.specialRequestorPrices)
    ? raw.specialRequestorPrices
        .map((item) => normalizeSpecialRequestorPrice(item, withPrices))
        .filter((item) => item.requestorAnchorId)
    : fallback.specialRequestorPrices;
  withPrices.abutsSharePercent = abutsShareFromParts(
    withPrices.manufacturerSharePercent,
    withPrices.salesmanSharePercent,
    withPrices.devopsSharePercent,
  );
  withPrices.storeAbutsSharePercent = abutsShareFromParts(
    withPrices.storeManufacturerSharePercent,
    withPrices.storeSalesmanSharePercent,
    withPrices.storeDevopsSharePercent,
  );
  withPrices.labAbutsSharePercent = abutsShareFromParts(
    withPrices.labBizSharePercent,
    withPrices.labSalesTeamSharePercent,
    withPrices.labDevopsSharePercent,
  );
  withPrices.regularAbutsSharePercent = abutsShareFromParts(
    0,
    withPrices.regularSalesmanSharePercent,
    withPrices.regularDevopsSharePercent,
  );
  withPrices.manufacturerRequestUnitPrice = purchasePriceFromSale(
    withPrices.labProductionPrice,
    withPrices.manufacturerSharePercent,
  );
  return withPrices;
}

function FieldHelp({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex text-slate-400 transition-colors hover:text-slate-700"
          aria-label="도움말"
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-left leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function SalesAmountCard({
  id,
  title,
  badge,
  value,
  onChange,
  disabled,
  readOnly = false,
  saveState = "idle",
  help,
  step = AMOUNT_STEP,
}: {
  id: string;
  title: string;
  badge?: string;
  value: number;
  onChange?: (next: number) => void;
  disabled?: boolean;
  readOnly?: boolean;
  saveState?: AutoSaveState;
  help?: string;
  /** 스피너 증감 단위. 기본 1,000원. */
  step?: number;
}) {
  const label = badge ? `${title} (${badge})` : title;
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Label htmlFor={id} className="text-sm font-medium text-slate-800">
            {label}
          </Label>
          {help ? <FieldHelp text={help} /> : null}
        </div>
        <AutoSaveIndicator state={saveState} />
      </div>
      <div className="relative">
        <Input
          id={id}
          type="number"
          min="0"
          step={step}
          readOnly={readOnly}
          className="h-11 rounded-xl border-slate-200 bg-slate-50/60 pr-14 text-right text-base font-semibold tabular-nums tracking-tight"
          value={value}
          disabled={disabled || readOnly}
          onChange={(event) =>
            onChange?.(Math.max(0, Number(event.target.value)))
          }
        />
        <span className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
          원
        </span>
      </div>
    </div>
  );
}

function AmountField({
  id,
  label,
  value,
  onChange,
  disabled,
  help,
  icon: Icon,
  step = AMOUNT_STEP,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  help?: string;
  icon?: typeof Gift;
  step?: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        {Icon ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 ring-1 ring-slate-200/80">
            <Icon className="h-4 w-4 text-slate-600" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Label htmlFor={id} className="text-sm font-medium text-slate-800">
              {label}
            </Label>
            {help ? <FieldHelp text={help} /> : null}
          </div>
        </div>
      </div>
      <div className="relative">
        <Input
          id={id}
          type="number"
          min="0"
          step={step}
          className="h-11 rounded-xl border-slate-200 bg-slate-50/60 pr-9 text-right text-base font-semibold tabular-nums tracking-tight [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
          disabled={disabled}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
          원
        </span>
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
  trailing,
}: {
  icon: typeof Gift;
  title: string;
  description?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft/60 ring-1 ring-primary-muted/70">
          <Icon className="h-5 w-5 text-primary-strong" />
        </span>
        <div className="min-w-0 space-y-1">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">
            {title}
          </h3>
          {description ? (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {trailing}
    </div>
  );
}

export type AdminCreditSettingsVariant =
  | "credits"
  | "shareRates"
  | "customAbut";

type AdminCreditSettingsTabProps = {
  /** credits: 환영 무료 크레딧·배송. shareRates: 분배 비율·딜러십. customAbut: 가격·추가요청. */
  variant?: AdminCreditSettingsVariant;
};

export const AdminCreditSettingsTab = ({
  variant = "credits",
}: AdminCreditSettingsTabProps) => {
  const showCredits = variant === "credits";
  const showShareRates = variant === "shareRates";
  const showCustomAbut = variant === "customAbut";
  const { token } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<CreditSettings>(() =>
    normalizeCreditSettings(CREDIT_SETTINGS_DEFAULTS, {
      ...CREDIT_SETTINGS_DEFAULTS,
      specialRequestorPrices: [],
      labProductionPrice:
        CREDIT_SETTINGS_DEFAULTS.labProductionPrice,
      labDesignAndProductionPrice:
        CREDIT_SETTINGS_DEFAULTS.labDesignAndProductionPrice,
      labRoundBarProductionPrice:
        CREDIT_SETTINGS_DEFAULTS.labRoundBarProductionPrice,
      labRoundBarDesignAndProductionPrice:
        CREDIT_SETTINGS_DEFAULTS.labRoundBarDesignAndProductionPrice,
      manufacturerSharePercent: DEFAULT_MANUFACTURER_PURCHASE_PERCENT,
      salesmanSharePercent: MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.salesman,
      devopsSharePercent: MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops,
      abutsSharePercent: MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.abuts,
      regularManufacturerSharePercent: 0,
      regularSalesmanSharePercent: REGULAR_RESIDUAL_SHARE_PERCENTS.salesman,
      regularDevopsSharePercent: REGULAR_RESIDUAL_SHARE_PERCENTS.devops,
      regularAbutsSharePercent: REGULAR_RESIDUAL_SHARE_PERCENTS.abuts,
      storeManufacturerSharePercent: DEFAULT_MANUFACTURER_PURCHASE_PERCENT,
      storeSalesmanSharePercent: MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.salesman,
      storeDevopsSharePercent: MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops,
      storeAbutsSharePercent: MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.abuts,
      labBizSharePercent: LAB_SHARE_PERCENTS.biz,
      labSalesTeamSharePercent: LAB_SHARE_PERCENTS.salesTeam,
      labDevopsSharePercent: LAB_SHARE_PERCENTS.devops,
      labAbutsSharePercent: LAB_SHARE_PERCENTS.abuts,
    } as CreditSettings),
  );
  const [itemSaveStates, setItemSaveStates] = useState<
    Record<string, AutoSaveState>
  >({});
  const hydratedRef = useRef(false);
  const savedSnapshotRef = useRef("");
  const settingsRef = useRef(settings);
  const itemSaveTimersRef = useRef<Map<string, number>>(new Map());
  const itemSavedFadeTimersRef = useRef<Map<string, number>>(new Map());
  const itemSavedSnapshotsRef = useRef<Map<string, string>>(new Map());
  settingsRef.current = settings;

  const setScopeSaveState = useCallback(
    (scopeKey: string, state: AutoSaveState) => {
      setItemSaveStates((prev) => {
        if (state === "idle") {
          if (!(scopeKey in prev)) return prev;
          const next = { ...prev };
          delete next[scopeKey];
          return next;
        }
        return { ...prev, [scopeKey]: state };
      });
    },
    [],
  );

  const scheduleItemSave = useCallback(
    (scopeKey: string, buildPayload: () => Record<string, unknown>) => {
      if (!hydratedRef.current || !token || loading) return;

      setScopeSaveState(scopeKey, "pending");

      const existing = itemSaveTimersRef.current.get(scopeKey);
      if (existing != null) {
        window.clearTimeout(existing);
      }

      const timer = window.setTimeout(async () => {
        itemSaveTimersRef.current.delete(scopeKey);

        const payload = buildPayload();
        const payloadSnap = JSON.stringify(payload);
        if (payloadSnap === itemSavedSnapshotsRef.current.get(scopeKey)) {
          setScopeSaveState(scopeKey, "idle");
          return;
        }

        setScopeSaveState(scopeKey, "saving");

        try {
          const res = await apiFetch<CreditSettingsApiResponse>({
            path: "/api/admin/settings/credits",
            method: "PATCH",
            token,
            jsonBody: payload,
          });

          if (!res.ok) {
            throw new Error("설정 저장 실패");
          }

          const saved = res.data?.data?.creditSettings;
          if (saved) {
            const normalized = normalizeCreditSettings(
              saved,
              settingsRef.current,
            );
            settingsRef.current = normalized;
            setSettings(normalized);
            savedSnapshotRef.current = JSON.stringify(normalized);
          }

          itemSavedSnapshotsRef.current.set(scopeKey, payloadSnap);
          void queryClient.invalidateQueries({ queryKey: ["credit-settings"] });

          setScopeSaveState(scopeKey, "saved");
          const existingFade = itemSavedFadeTimersRef.current.get(scopeKey);
          if (existingFade != null) {
            window.clearTimeout(existingFade);
          }
          itemSavedFadeTimersRef.current.set(
            scopeKey,
            window.setTimeout(() => {
              setScopeSaveState(scopeKey, "idle");
              itemSavedFadeTimersRef.current.delete(scopeKey);
            }, 2000),
          );
        } catch (error) {
          setScopeSaveState(scopeKey, "idle");
          toast({
            title: "설정 저장 실패",
            description:
              error instanceof Error ? error.message : "알 수 없는 오류",
            variant: "destructive",
            duration: 3000,
          });
        }
      }, AUTO_SAVE_DELAY_MS);

      itemSaveTimersRef.current.set(scopeKey, timer);
    },
    [token, loading, toast, queryClient, setScopeSaveState],
  );

  const applySettingsUpdate = useCallback(
    (updater: (prev: CreditSettings) => CreditSettings) => {
      setSettings((prev) => {
        const next = updater(prev);
        settingsRef.current = next;
        return next;
      });
    },
    [],
  );

  const scheduleSharePercentSave = useCallback(() => {
    scheduleItemSave("sharePercents", () =>
      buildSharePercentSavePayload(settingsRef.current),
    );
  }, [scheduleItemSave]);

  const updateSharePercent = useCallback(
    (
      patch: Partial<
        Pick<
          CreditSettings,
          | "manufacturerRequestUnitPrice"
          | "manufacturerRemakeUnitPrice"
          | "manufacturerShippingUnitPrice"
          | "manufacturerSharePercent"
          | "salesmanSharePercent"
          | "devopsSharePercent"
          | "abutsSharePercent"
          | "regularManufacturerSharePercent"
          | "regularSalesmanSharePercent"
          | "regularDevopsSharePercent"
          | "regularAbutsSharePercent"
          | "storeManufacturerSharePercent"
          | "storeSalesmanSharePercent"
          | "storeDevopsSharePercent"
          | "storeAbutsSharePercent"
        >
      >,
    ) => {
      applySettingsUpdate((prev) =>
        syncComputedPartyFields({
          ...prev,
          ...patch,
        }),
      );
      scheduleSharePercentSave();
    },
    [applySettingsUpdate, scheduleSharePercentSave],
  );

  /** 커스텀어벗: 제조사·딜러·개발운영 변경은 내일부터 예약. */
  const [effectiveManufacturerPct, setEffectiveManufacturerPct] = useState(
    DEFAULT_MANUFACTURER_PURCHASE_PERCENT,
  );
  const [pendingManufacturerPct, setPendingManufacturerPct] = useState(
    DEFAULT_MANUFACTURER_PURCHASE_PERCENT,
  );
  /** 런칭 이벤트 on/off — 즉시 적용. */
  const [pendingLaunchEventEnabled, setPendingLaunchEventEnabled] =
    useState(true);
  const [effectiveDealerPct, setEffectiveDealerPct] = useState<DealerRatePct>(
    snapDealerPct(MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.salesman),
  );
  const [pendingDealerPct, setPendingDealerPct] = useState<DealerRatePct>(
    snapDealerPct(MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.salesman),
  );
  const [effectiveDevopsPct, setEffectiveDevopsPct] = useState(
    MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops,
  );
  const [pendingDevopsPct, setPendingDevopsPct] = useState(
    MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops,
  );
  /** 스토어 분배 예약(제조사·딜러·개발운영). */
  const [effectiveStoreManufacturerPct, setEffectiveStoreManufacturerPct] =
    useState(DEFAULT_MANUFACTURER_PURCHASE_PERCENT);
  const [pendingStoreManufacturerPct, setPendingStoreManufacturerPct] =
    useState(DEFAULT_MANUFACTURER_PURCHASE_PERCENT);
  const [effectiveStoreDealerPct, setEffectiveStoreDealerPct] =
    useState<DealerRatePct>(
      snapDealerPct(MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.salesman),
    );
  const [pendingStoreDealerPct, setPendingStoreDealerPct] =
    useState<DealerRatePct>(
      snapDealerPct(MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.salesman),
    );
  const [effectiveStoreDevopsPct, setEffectiveStoreDevopsPct] = useState(
    MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops,
  );
  const [pendingStoreDevopsPct, setPendingStoreDevopsPct] = useState(
    MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops,
  );
  /** 기공 분배 예약(기공사업부·영업팀·개발운영). */
  const [effectiveLabBizPct, setEffectiveLabBizPct] = useState(
    LAB_SHARE_PERCENTS.biz,
  );
  const [pendingLabBizPct, setPendingLabBizPct] = useState(LAB_SHARE_PERCENTS.biz);
  const [effectiveLabSalesTeamPct, setEffectiveLabSalesTeamPct] = useState(
    LAB_SHARE_PERCENTS.salesTeam,
  );
  const [pendingLabSalesTeamPct, setPendingLabSalesTeamPct] = useState(
    LAB_SHARE_PERCENTS.salesTeam,
  );
  const [effectiveLabDevopsPct, setEffectiveLabDevopsPct] = useState(
    LAB_SHARE_PERCENTS.devops,
  );
  const [pendingLabDevopsPct, setPendingLabDevopsPct] = useState(
    LAB_SHARE_PERCENTS.devops,
  );
  const pendingManufacturerRef = useRef(pendingManufacturerPct);
  const pendingLaunchEventRef = useRef(pendingLaunchEventEnabled);
  const pendingDealerRef = useRef(pendingDealerPct);
  const pendingDevopsRef = useRef(pendingDevopsPct);
  const effectiveManufacturerRef = useRef(effectiveManufacturerPct);
  const effectiveDealerRef = useRef(effectiveDealerPct);
  const effectiveDevopsRef = useRef(effectiveDevopsPct);
  const pendingStoreManufacturerRef = useRef(pendingStoreManufacturerPct);
  const pendingStoreDealerRef = useRef(pendingStoreDealerPct);
  const pendingStoreDevopsRef = useRef(pendingStoreDevopsPct);
  const effectiveStoreManufacturerRef = useRef(effectiveStoreManufacturerPct);
  const effectiveStoreDealerRef = useRef(effectiveStoreDealerPct);
  const effectiveStoreDevopsRef = useRef(effectiveStoreDevopsPct);
  const pendingLabBizRef = useRef(pendingLabBizPct);
  const pendingLabSalesTeamRef = useRef(pendingLabSalesTeamPct);
  const pendingLabDevopsRef = useRef(pendingLabDevopsPct);
  const effectiveLabBizRef = useRef(effectiveLabBizPct);
  const effectiveLabSalesTeamRef = useRef(effectiveLabSalesTeamPct);
  const effectiveLabDevopsRef = useRef(effectiveLabDevopsPct);
  pendingManufacturerRef.current = pendingManufacturerPct;
  pendingLaunchEventRef.current = pendingLaunchEventEnabled;
  pendingDealerRef.current = pendingDealerPct;
  pendingDevopsRef.current = pendingDevopsPct;
  effectiveManufacturerRef.current = effectiveManufacturerPct;
  effectiveDealerRef.current = effectiveDealerPct;
  effectiveDevopsRef.current = effectiveDevopsPct;
  pendingStoreManufacturerRef.current = pendingStoreManufacturerPct;
  pendingStoreDealerRef.current = pendingStoreDealerPct;
  pendingStoreDevopsRef.current = pendingStoreDevopsPct;
  effectiveStoreManufacturerRef.current = effectiveStoreManufacturerPct;
  effectiveStoreDealerRef.current = effectiveStoreDealerPct;
  effectiveStoreDevopsRef.current = effectiveStoreDevopsPct;
  pendingLabBizRef.current = pendingLabBizPct;
  pendingLabSalesTeamRef.current = pendingLabSalesTeamPct;
  pendingLabDevopsRef.current = pendingLabDevopsPct;
  effectiveLabBizRef.current = effectiveLabBizPct;
  effectiveLabSalesTeamRef.current = effectiveLabSalesTeamPct;
  effectiveLabDevopsRef.current = effectiveLabDevopsPct;

  const shareChangePending =
    pendingManufacturerPct !== effectiveManufacturerPct ||
    pendingDealerPct !== effectiveDealerPct ||
    pendingDevopsPct !== effectiveDevopsPct ||
    pendingStoreManufacturerPct !== effectiveStoreManufacturerPct ||
    pendingStoreDealerPct !== effectiveStoreDealerPct ||
    pendingStoreDevopsPct !== effectiveStoreDevopsPct ||
    pendingLabBizPct !== effectiveLabBizPct ||
    pendingLabSalesTeamPct !== effectiveLabSalesTeamPct ||
    pendingLabDevopsPct !== effectiveLabDevopsPct;

  const persistShareSchedules = useCallback(() => {
    if (!hydratedRef.current || !token || loading) return;
    const manufacturerPending =
      pendingManufacturerRef.current !== effectiveManufacturerRef.current;
    const dealerPending =
      pendingDealerRef.current !== effectiveDealerRef.current;
    const devopsPending =
      pendingDevopsRef.current !== effectiveDevopsRef.current;
    const storeManufacturerPending =
      pendingStoreManufacturerRef.current !==
      effectiveStoreManufacturerRef.current;
    const storeDealerPending =
      pendingStoreDealerRef.current !== effectiveStoreDealerRef.current;
    const storeDevopsPending =
      pendingStoreDevopsRef.current !== effectiveStoreDevopsRef.current;
    const labBizPending =
      pendingLabBizRef.current !== effectiveLabBizRef.current;
    const labSalesTeamPending =
      pendingLabSalesTeamRef.current !== effectiveLabSalesTeamRef.current;
    const labDevopsPending =
      pendingLabDevopsRef.current !== effectiveLabDevopsRef.current;
    scheduleItemSave("sharePercents", () => ({
      ...buildSharePercentSavePayload(settingsRef.current),
      ...buildManufacturerSchedulePayload(
        manufacturerPending ? pendingManufacturerRef.current : null,
      ),
      ...buildDealerSchedulePayload(
        dealerPending ? pendingDealerRef.current : null,
      ),
      ...buildDevopsSchedulePayload(
        devopsPending ? pendingDevopsRef.current : null,
      ),
      ...buildStoreManufacturerSchedulePayload(
        storeManufacturerPending ? pendingStoreManufacturerRef.current : null,
      ),
      ...buildStoreDealerSchedulePayload(
        storeDealerPending ? pendingStoreDealerRef.current : null,
      ),
      ...buildStoreDevopsSchedulePayload(
        storeDevopsPending ? pendingStoreDevopsRef.current : null,
      ),
      ...buildLabPercentSchedulePayload(
        "biz",
        labBizPending ? pendingLabBizRef.current : null,
      ),
      ...buildLabPercentSchedulePayload(
        "salesTeam",
        labSalesTeamPending ? pendingLabSalesTeamRef.current : null,
      ),
      ...buildLabPercentSchedulePayload(
        "devops",
        labDevopsPending ? pendingLabDevopsRef.current : null,
      ),
    }));
  }, [loading, scheduleItemSave, token]);

  const scheduleManufacturerShareChange = useCallback(
    (nextPercent: number) => {
      const dealer = pendingDealerRef.current;
      const devops = pendingDevopsRef.current;
      const next = Math.min(
        readManufacturerSharePercent(nextPercent),
        Math.max(0, 100 - dealer - devops),
      );
      setPendingManufacturerPct(next);
      pendingManufacturerRef.current = next;
      const cappedDevops = Math.min(
        devops,
        Math.max(0, 100 - next - dealer),
      );
      if (cappedDevops !== pendingDevopsRef.current) {
        setPendingDevopsPct(cappedDevops);
        pendingDevopsRef.current = cappedDevops;
      }
      persistShareSchedules();
    },
    [persistShareSchedules],
  );

  const scheduleStoreManufacturerShareChange = useCallback(
    (nextPercent: number) => {
      const dealer = pendingStoreDealerRef.current;
      const devops = pendingStoreDevopsRef.current;
      const next = Math.min(
        readManufacturerSharePercent(nextPercent),
        Math.max(0, 100 - dealer - devops),
      );
      setPendingStoreManufacturerPct(next);
      pendingStoreManufacturerRef.current = next;
      const cappedDevops = Math.min(
        devops,
        Math.max(0, 100 - next - dealer),
      );
      if (cappedDevops !== pendingStoreDevopsRef.current) {
        setPendingStoreDevopsPct(cappedDevops);
        pendingStoreDevopsRef.current = cappedDevops;
      }
      persistShareSchedules();
    },
    [persistShareSchedules],
  );

  const scheduleDealerRateChange = useCallback(
    (nextDealerPct: DealerRatePct) => {
      const mfr = pendingManufacturerRef.current;
      const cappedDevops = Math.min(
        pendingDevopsRef.current,
        Math.max(0, 100 - mfr - nextDealerPct),
      );
      setPendingDealerPct(nextDealerPct);
      pendingDealerRef.current = nextDealerPct;
      if (cappedDevops !== pendingDevopsRef.current) {
        setPendingDevopsPct(cappedDevops);
        pendingDevopsRef.current = cappedDevops;
      }
      persistShareSchedules();
    },
    [persistShareSchedules],
  );

  const scheduleStoreDealerRateChange = useCallback(
    (nextDealerPct: DealerRatePct) => {
      const mfr = pendingStoreManufacturerRef.current;
      const cappedDevops = Math.min(
        pendingStoreDevopsRef.current,
        Math.max(0, 100 - mfr - nextDealerPct),
      );
      setPendingStoreDealerPct(nextDealerPct);
      pendingStoreDealerRef.current = nextDealerPct;
      if (cappedDevops !== pendingStoreDevopsRef.current) {
        setPendingStoreDevopsPct(cappedDevops);
        pendingStoreDevopsRef.current = cappedDevops;
      }
      persistShareSchedules();
    },
    [persistShareSchedules],
  );

  const scheduleDevopsShareChange = useCallback(
    (nextDevopsPct: number) => {
      const mfr = pendingManufacturerRef.current;
      const next = clampSharePercent(
        nextDevopsPct,
        MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops,
      );
      const capped = Math.min(
        next,
        Math.max(0, 100 - mfr - pendingDealerRef.current),
      );
      setPendingDevopsPct(capped);
      pendingDevopsRef.current = capped;
      persistShareSchedules();
    },
    [persistShareSchedules],
  );

  const scheduleStoreDevopsShareChange = useCallback(
    (nextDevopsPct: number) => {
      const mfr = pendingStoreManufacturerRef.current;
      const next = clampSharePercent(
        nextDevopsPct,
        MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops,
      );
      const capped = Math.min(
        next,
        Math.max(0, 100 - mfr - pendingStoreDealerRef.current),
      );
      setPendingStoreDevopsPct(capped);
      pendingStoreDevopsRef.current = capped;
      persistShareSchedules();
    },
    [persistShareSchedules],
  );

  const scheduleLabBizShareChange = useCallback(
    (nextPct: number) => {
      const salesTeam = pendingLabSalesTeamRef.current;
      const devops = pendingLabDevopsRef.current;
      const next = Math.min(
        readManufacturerSharePercent(nextPct, LAB_SHARE_PERCENTS.biz),
        Math.max(0, 100 - salesTeam - devops),
      );
      setPendingLabBizPct(next);
      pendingLabBizRef.current = next;
      persistShareSchedules();
    },
    [persistShareSchedules],
  );

  const scheduleLabSalesTeamShareChange = useCallback(
    (nextPct: number) => {
      const biz = pendingLabBizRef.current;
      const devops = pendingLabDevopsRef.current;
      const next = Math.min(
        readManufacturerSharePercent(nextPct, LAB_SHARE_PERCENTS.salesTeam),
        Math.max(0, 100 - biz - devops),
      );
      setPendingLabSalesTeamPct(next);
      pendingLabSalesTeamRef.current = next;
      persistShareSchedules();
    },
    [persistShareSchedules],
  );

  const scheduleLabDevopsShareChange = useCallback(
    (nextPct: number) => {
      const biz = pendingLabBizRef.current;
      const salesTeam = pendingLabSalesTeamRef.current;
      const next = Math.min(
        readManufacturerSharePercent(nextPct, LAB_SHARE_PERCENTS.devops),
        Math.max(0, 100 - biz - salesTeam),
      );
      setPendingLabDevopsPct(next);
      pendingLabDevopsRef.current = next;
      persistShareSchedules();
    },
    [persistShareSchedules],
  );

  /** CNC·환봉 구분 없는 단일 판매가. 관련 고시·lab 생산가를 함께 맞춘다. */
  const updateSalePrice = useCallback(
    (next: number) => {
      const sale = Math.max(0, Math.round(Number(next) || 0));
      applySettingsUpdate((prev) => {
        const purchase = purchasePriceFromSale(
          sale,
          prev.manufacturerSharePercent,
        );
        return syncComputedPartyFields({
          ...prev,
          labProductionPrice: sale,
          labRoundBarProductionPrice: sale,
          membershipProductionPrice: sale,
          regularProductionPrice: sale,
          membershipRoundBarProductionPrice: sale,
          regularRoundBarProductionPrice: sale,
          minCreditForRequest: sale,
          manufacturerRequestUnitPrice: purchase,
        });
      });
      scheduleItemSave("salePrice", () => {
        const current = settingsRef.current;
        return {
          labProductionPrice: current.labProductionPrice,
          labRoundBarProductionPrice: current.labRoundBarProductionPrice,
          membershipProductionPrice: current.membershipProductionPrice,
          regularProductionPrice: current.regularProductionPrice,
          membershipRoundBarProductionPrice:
            current.membershipRoundBarProductionPrice,
          regularRoundBarProductionPrice: current.regularRoundBarProductionPrice,
          minCreditForRequest: current.minCreditForRequest,
          ...buildSharePercentSavePayload(current),
        };
      });
    },
    [applySettingsUpdate, scheduleItemSave],
  );

  const updateShippingPurchasePrice = useCallback(
    (next: number) => {
      updateSharePercent({
        manufacturerShippingUnitPrice: Math.max(
          0,
          Math.round(Number(next) || 0),
        ),
      });
    },
    [updateSharePercent],
  );

  const updateLaunchEventPrice = useCallback(
    (next: number) => {
      const price = Math.max(0, Math.round(Number(next) || 0));
      applySettingsUpdate((prev) => ({
        ...prev,
        customAbutmentLaunchEventProductionPrice: price,
      }));
      scheduleItemSave("launchEventPrice", () => ({
        customAbutmentLaunchEventProductionPrice:
          settingsRef.current.customAbutmentLaunchEventProductionPrice ??
          ABUTS_ABUTMENT_LAUNCH_EVENT_PRODUCTION_PRICE,
      }));
    },
    [applySettingsUpdate, scheduleItemSave],
  );

  const updateFmDentalMonthlyFee = useCallback(
    (next: number) => {
      const fee = Math.max(0, Math.round(Number(next) || 0));
      applySettingsUpdate((prev) => ({
        ...prev,
        fmDentalMonthlyShippingFee: fee,
      }));
      scheduleItemSave("fmDentalMonthlyFee", () => ({
        fmDentalMonthlyShippingFee:
          settingsRef.current.fmDentalMonthlyShippingFee ?? 0,
      }));
    },
    [applySettingsUpdate, scheduleItemSave],
  );

  const updateLaunchEventEnabled = useCallback(
    (enabled: boolean) => {
      setPendingLaunchEventEnabled(enabled);
      pendingLaunchEventRef.current = enabled;
      applySettingsUpdate((prev) => ({
        ...prev,
        customAbutmentLaunchEventEnabled: enabled,
        customAbutmentLaunchEventStartedAt: null,
        customAbutmentLaunchEventEndedAt: enabled ? null : new Date().toISOString(),
      }));
      scheduleItemSave("launchEventToggle", () =>
        buildLaunchEventApplyPayload(pendingLaunchEventRef.current),
      );
    },
    [applySettingsUpdate, scheduleItemSave],
  );

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      hydratedRef.current = false;
      const res = await apiFetch<CreditSettingsApiResponse>({
        path: "/api/admin/settings/credits",
        method: "GET",
        token,
      });

      if (!res.ok) {
        throw new Error("설정 조회 실패");
      }

      const data = res.data?.data?.creditSettings || CREDIT_SETTINGS_DEFAULTS;
      const normalized = normalizeCreditSettings(data, {
        ...CREDIT_SETTINGS_DEFAULTS,
        specialRequestorPrices: [],
      });

      const effectiveMfr = readManufacturerSharePercent(
        normalized.manufacturerSharePercent,
      );
      setEffectiveManufacturerPct(effectiveMfr);
      const scheduledMfr = Number(
        (data as { manufacturerShareChangeScheduledPercent?: number | null })
          .manufacturerShareChangeScheduledPercent,
      );
      const scheduledMfrAt = (
        data as { manufacturerShareChangeScheduledAt?: string | Date | null }
      ).manufacturerShareChangeScheduledAt;
      if (
        scheduledMfrAt &&
        Number.isFinite(scheduledMfr) &&
        scheduledMfr >= 0
      ) {
        setPendingManufacturerPct(readManufacturerSharePercent(scheduledMfr));
      } else {
        setPendingManufacturerPct(effectiveMfr);
      }

      const effectiveLaunch =
        (data as { customAbutmentLaunchEventEnabled?: boolean })
          .customAbutmentLaunchEventEnabled !== false;
      setPendingLaunchEventEnabled(effectiveLaunch);

      const eventRate = Number(
        (data as { dealershipEventCommissionRate?: number })
          .dealershipEventCommissionRate,
      );
      const eventOn =
        (data as { dealershipEventCommissionEnabled?: boolean })
          .dealershipEventCommissionEnabled !== false;
      const fromShare = Number(normalized.salesmanSharePercent);
      const fromEvent = eventOn
        ? Math.round((Number.isFinite(eventRate) ? eventRate : 0.2) * 100)
        : 10;
      const effective = snapDealerPct(
        Number.isFinite(fromShare) && fromShare > 0 ? fromShare : fromEvent,
      );
      setEffectiveDealerPct(effective);

      const scheduledRate = Number(
        (data as { dealershipRateChangeScheduledRate?: number | null })
          .dealershipRateChangeScheduledRate,
      );
      const scheduledAt = (
        data as { dealershipRateChangeScheduledAt?: string | Date | null }
      ).dealershipRateChangeScheduledAt;
      if (scheduledAt && Number.isFinite(scheduledRate) && scheduledRate > 0) {
        setPendingDealerPct(snapDealerPct(Math.round(scheduledRate * 100)));
      } else {
        setPendingDealerPct(effective);
      }

      const effectiveDevops = clampSharePercent(
        normalized.devopsSharePercent,
        MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops,
      );
      setEffectiveDevopsPct(effectiveDevops);
      const scheduledDevops = Number(
        (data as { devopsShareChangeScheduledPercent?: number | null })
          .devopsShareChangeScheduledPercent,
      );
      const scheduledDevopsAt = (
        data as { devopsShareChangeScheduledAt?: string | Date | null }
      ).devopsShareChangeScheduledAt;
      if (
        scheduledDevopsAt &&
        Number.isFinite(scheduledDevops) &&
        scheduledDevops >= 0
      ) {
        setPendingDevopsPct(
          clampSharePercent(
            scheduledDevops,
            MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops,
          ),
        );
      } else {
        setPendingDevopsPct(effectiveDevops);
      }

      const storeEffectiveMfr = readManufacturerSharePercent(
        normalized.storeManufacturerSharePercent,
      );
      setEffectiveStoreManufacturerPct(storeEffectiveMfr);
      const storeScheduledMfr = Number(
        (
          data as {
            storeManufacturerShareChangeScheduledPercent?: number | null;
          }
        ).storeManufacturerShareChangeScheduledPercent,
      );
      const storeScheduledMfrAt = (
        data as {
          storeManufacturerShareChangeScheduledAt?: string | Date | null;
        }
      ).storeManufacturerShareChangeScheduledAt;
      if (
        storeScheduledMfrAt &&
        Number.isFinite(storeScheduledMfr) &&
        storeScheduledMfr >= 0
      ) {
        setPendingStoreManufacturerPct(
          readManufacturerSharePercent(storeScheduledMfr),
        );
      } else {
        setPendingStoreManufacturerPct(storeEffectiveMfr);
      }

      const storeEffective = snapDealerPct(
        Number.isFinite(normalized.storeSalesmanSharePercent) &&
          normalized.storeSalesmanSharePercent > 0
          ? normalized.storeSalesmanSharePercent
          : effective,
      );
      setEffectiveStoreDealerPct(storeEffective);
      const storeScheduledRate = Number(
        (data as { storeDealerRateChangeScheduledRate?: number | null })
          .storeDealerRateChangeScheduledRate,
      );
      const storeScheduledAt = (
        data as { storeDealerRateChangeScheduledAt?: string | Date | null }
      ).storeDealerRateChangeScheduledAt;
      if (
        storeScheduledAt &&
        Number.isFinite(storeScheduledRate) &&
        storeScheduledRate > 0
      ) {
        setPendingStoreDealerPct(
          snapDealerPct(Math.round(storeScheduledRate * 100)),
        );
      } else {
        setPendingStoreDealerPct(storeEffective);
      }

      const storeEffectiveDevops = clampSharePercent(
        normalized.storeDevopsSharePercent,
        MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops,
      );
      setEffectiveStoreDevopsPct(storeEffectiveDevops);
      const storeScheduledDevops = Number(
        (data as { storeDevopsShareChangeScheduledPercent?: number | null })
          .storeDevopsShareChangeScheduledPercent,
      );
      const storeScheduledDevopsAt = (
        data as { storeDevopsShareChangeScheduledAt?: string | Date | null }
      ).storeDevopsShareChangeScheduledAt;
      if (
        storeScheduledDevopsAt &&
        Number.isFinite(storeScheduledDevops) &&
        storeScheduledDevops >= 0
      ) {
        setPendingStoreDevopsPct(
          clampSharePercent(
            storeScheduledDevops,
            MEMBERSHIP_RESIDUAL_SHARE_PERCENTS.devops,
          ),
        );
      } else {
        setPendingStoreDevopsPct(storeEffectiveDevops);
      }

      const hydrateLabPending = (
        effectivePct: number,
        scheduledPctRaw: unknown,
        scheduledAtRaw: unknown,
        setEffective: (n: number) => void,
        setPending: (n: number) => void,
        fallback: number,
      ) => {
        setEffective(effectivePct);
        const scheduledPct = Number(scheduledPctRaw);
        if (
          scheduledAtRaw &&
          Number.isFinite(scheduledPct) &&
          scheduledPct >= 0
        ) {
          setPending(readManufacturerSharePercent(scheduledPct, fallback));
        } else {
          setPending(effectivePct);
        }
      };
      hydrateLabPending(
        readManufacturerSharePercent(
          normalized.labBizSharePercent,
          LAB_SHARE_PERCENTS.biz,
        ),
        (data as { labBizShareChangeScheduledPercent?: number | null })
          .labBizShareChangeScheduledPercent,
        (data as { labBizShareChangeScheduledAt?: string | Date | null })
          .labBizShareChangeScheduledAt,
        setEffectiveLabBizPct,
        setPendingLabBizPct,
        LAB_SHARE_PERCENTS.biz,
      );
      hydrateLabPending(
        readManufacturerSharePercent(
          normalized.labSalesTeamSharePercent,
          LAB_SHARE_PERCENTS.salesTeam,
        ),
        (data as { labSalesTeamShareChangeScheduledPercent?: number | null })
          .labSalesTeamShareChangeScheduledPercent,
        (data as { labSalesTeamShareChangeScheduledAt?: string | Date | null })
          .labSalesTeamShareChangeScheduledAt,
        setEffectiveLabSalesTeamPct,
        setPendingLabSalesTeamPct,
        LAB_SHARE_PERCENTS.salesTeam,
      );
      hydrateLabPending(
        readManufacturerSharePercent(
          normalized.labDevopsSharePercent,
          LAB_SHARE_PERCENTS.devops,
        ),
        (data as { labDevopsShareChangeScheduledPercent?: number | null })
          .labDevopsShareChangeScheduledPercent,
        (data as { labDevopsShareChangeScheduledAt?: string | Date | null })
          .labDevopsShareChangeScheduledAt,
        setEffectiveLabDevopsPct,
        setPendingLabDevopsPct,
        LAB_SHARE_PERCENTS.devops,
      );

      setSettings(normalized);
      settingsRef.current = normalized;
      savedSnapshotRef.current = JSON.stringify(normalized);
      itemSavedSnapshotsRef.current.clear();
      setItemSaveStates({});
      hydratedRef.current = true;
    } catch (error) {
      toast({
        title: "설정 조회 실패",
        description: error instanceof Error ? error.message : "알 수 없는 오류",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (!showCredits || !hydratedRef.current || !token || loading) return;
    const snapshot = JSON.stringify(settings);
    if (snapshot === savedSnapshotRef.current) return;

    const timer = window.setTimeout(async () => {
      const { specialRequestorPrices: _requestorOverrides, ...payload } =
        settingsRef.current;
      const payloadSnap = JSON.stringify(payload);
      if (payloadSnap === savedSnapshotRef.current) return;

      try {
        const res = await apiFetch<CreditSettingsApiResponse>({
          path: "/api/admin/settings/credits",
          method: "PATCH",
          token,
          jsonBody: payload,
        });

        if (!res.ok) {
          throw new Error("설정 저장 실패");
        }

        const saved = res.data?.data?.creditSettings;
        const normalized = saved
          ? normalizeCreditSettings(saved, payload)
          : payload;
        savedSnapshotRef.current = JSON.stringify(normalized);

        if (JSON.stringify(settingsRef.current) === payloadSnap) {
          setSettings(normalized);
          settingsRef.current = normalized;
          savedSnapshotRef.current = JSON.stringify(normalized);
        }
        void queryClient.invalidateQueries({ queryKey: ["credit-settings"] });
      } catch (error) {
        toast({
          title: "설정 저장 실패",
          description:
            error instanceof Error ? error.message : "알 수 없는 오류",
          variant: "destructive",
          duration: 3000,
        });
      }
    }, AUTO_SAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [settings, token, loading, toast, queryClient, showCredits]);

  useEffect(
    () => () => {
      itemSaveTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      itemSaveTimersRef.current.clear();
      itemSavedFadeTimersRef.current.forEach((timer) =>
        window.clearTimeout(timer),
      );
      itemSavedFadeTimersRef.current.clear();
    },
    [],
  );

  const expressHelp = `생산 의뢰는 건당, 디자인+생산은 커스텀어벗 수만큼 곱합니다. 기본 ${CREDIT_SETTINGS_DEFAULTS.expressFee.toLocaleString("ko-KR")}원.`;

  return (
    <TooltipProvider>
      <div className="space-y-5">
        {showCredits ? (
          <>
            <Card className="app-glass-card app-glass-card--lg overflow-hidden">
              <CardContent className="space-y-5 p-5 sm:p-6">
                <SectionHeader
                  icon={Gift}
                  title="수동 무료크레딧 (관리자)"
                  description="가입 환영 크레딧 자동 지급은 폐지되었습니다. 치과·기공소는 30일 데모(가상 잔고)로 운영되며, 전환 입금 확인 시 실사용으로 전환됩니다. 아래 금액은 관리자 수동 무료크레딧 지급 기본값입니다."
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <AmountField
                    id="defaultRequestFreeCredit"
                    label="수동 지급 기본액"
                    icon={Gift}
                    value={settings.defaultRequestFreeCredit}
                    onChange={(next) =>
                      setSettings({
                        ...settings,
                        defaultRequestFreeCredit: next,
                        defaultShippingFreeCredit: 0,
                      })
                    }
                    disabled={loading}
                    help="자동 가입 지급은 하지 않습니다. 관리자가 수동으로 무료크레딧을 줄 때 기본 금액으로만 사용합니다."
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="app-glass-card app-glass-card--lg overflow-hidden">
              <CardContent className="space-y-5 p-5 sm:p-6">
                <SectionHeader
                  icon={Truck}
                  title="배송"
                  description="박스당 배송비와 신속 출고 추가 요금입니다."
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <AmountField
                    id="shippingFee"
                    label="배송비"
                    icon={Truck}
                    value={settings.shippingFee}
                    onChange={(next) =>
                      setSettings({ ...settings, shippingFee: next })
                    }
                    disabled={loading}
                    help="박스단위 별도(의뢰자 청구)"
                    step={SHIPPING_AMOUNT_STEP}
                  />
                  <AmountField
                    id="expressFee"
                    label="신속 의뢰비"
                    icon={Zap}
                    value={settings.expressFee}
                    onChange={(next) =>
                      setSettings({ ...settings, expressFee: next })
                    }
                    disabled={loading}
                    help={expressHelp}
                    step={SHIPPING_AMOUNT_STEP}
                  />
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}

        {showShareRates ? (
          <Card className="app-glass-card app-glass-card--lg overflow-hidden">
            <CardContent className="space-y-5 p-5 sm:p-6">
              <SectionHeader
                icon={Percent}
                title="분배 비율"
                description={
                  <>
                    배송비 제외.
                    <br />
                    변경 사항은 내일부터 적용
                  </>
                }
                trailing={
                  <div className="flex items-center gap-2">
                    <ShareChangePendingBadge show={shareChangePending} />
                    <AutoSaveIndicator
                      state={itemSaveStates.sharePercents ?? "idle"}
                    />
                  </div>
                }
              />
              <div className="space-y-6">
                <SharePercentRow
                  idPrefix="storeShareRates"
                  rowLabel="스토어"
                  shares={{
                    salesman: pendingStoreDealerPct,
                    devops: pendingStoreDevopsPct,
                    abuts: abutsShareFromParts(
                      pendingStoreManufacturerPct,
                      pendingStoreDealerPct,
                      pendingStoreDevopsPct,
                    ),
                  }}
                  manufacturerPercent={pendingStoreManufacturerPct}
                  dealerSelectPct={pendingStoreDealerPct}
                  previousManufacturerPercent={effectiveStoreManufacturerPct}
                  previousDealerPercent={effectiveStoreDealerPct}
                  previousDevopsPercent={effectiveStoreDevopsPct}
                  previousAbutsPercent={abutsShareFromParts(
                    effectiveStoreManufacturerPct,
                    effectiveStoreDealerPct,
                    effectiveStoreDevopsPct,
                  )}
                  disabled={loading}
                  onManufacturerChange={scheduleStoreManufacturerShareChange}
                  onDealerChange={scheduleStoreDealerRateChange}
                  onDevopsChange={scheduleStoreDevopsShareChange}
                />
                <SharePercentRow
                  idPrefix="customAbutShareRates"
                  rowLabel="커스텀어벗"
                  shares={{
                    salesman: pendingDealerPct,
                    devops: pendingDevopsPct,
                    abuts: abutsShareFromParts(
                      pendingManufacturerPct,
                      pendingDealerPct,
                      pendingDevopsPct,
                    ),
                  }}
                  manufacturerPercent={pendingManufacturerPct}
                  dealerSelectPct={pendingDealerPct}
                  previousManufacturerPercent={effectiveManufacturerPct}
                  previousDealerPercent={effectiveDealerPct}
                  previousDevopsPercent={effectiveDevopsPct}
                  previousAbutsPercent={abutsShareFromParts(
                    effectiveManufacturerPct,
                    effectiveDealerPct,
                    effectiveDevopsPct,
                  )}
                  disabled={loading}
                  onManufacturerChange={scheduleManufacturerShareChange}
                  onDealerChange={scheduleDealerRateChange}
                  onDevopsChange={scheduleDevopsShareChange}
                />
                <LabSharePercentRow
                  idPrefix="labShareRates"
                  bizPercent={pendingLabBizPct}
                  salesTeamPercent={pendingLabSalesTeamPct}
                  devopsPercent={pendingLabDevopsPct}
                  abutsPercent={abutsShareFromParts(
                    pendingLabBizPct,
                    pendingLabSalesTeamPct,
                    pendingLabDevopsPct,
                  )}
                  previousBizPercent={effectiveLabBizPct}
                  previousSalesTeamPercent={effectiveLabSalesTeamPct}
                  previousDevopsPercent={effectiveLabDevopsPct}
                  previousAbutsPercent={abutsShareFromParts(
                    effectiveLabBizPct,
                    effectiveLabSalesTeamPct,
                    effectiveLabDevopsPct,
                  )}
                  disabled={loading}
                  onBizChange={scheduleLabBizShareChange}
                  onSalesTeamChange={scheduleLabSalesTeamShareChange}
                  onDevopsChange={scheduleLabDevopsShareChange}
                />
              </div>
            </CardContent>
          </Card>
        ) : null}

        {showCustomAbut ? (
          <>
            <Card className="app-glass-card app-glass-card--lg overflow-hidden">
              <CardContent className="space-y-5 p-5 sm:p-6">
                <SectionHeader
                  icon={Banknote}
                  title="가격"
                  trailing={
                    <AutoSaveIndicator
                      state={itemSaveStates.salePrice ?? "idle"}
                    />
                  }
                />
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-semibold text-slate-900">
                      런칭 이벤트
                    </p>
                    <p className="text-xs text-slate-500">
                      켜면 이벤트 단가, 끄면 정상가.
                      <br />
                      변경은 즉시 적용됩니다.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <AutoSaveIndicator
                      state={itemSaveStates.launchEventToggle ?? "idle"}
                    />
                    <Switch
                      checked={pendingLaunchEventEnabled}
                      disabled={loading}
                      onCheckedChange={updateLaunchEventEnabled}
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <SalesAmountCard
                    id="customAbutLaunchEventPrice"
                    title="이벤트가(부가세 면제)"
                    value={
                      settings.customAbutmentLaunchEventProductionPrice ??
                      ABUTS_ABUTMENT_LAUNCH_EVENT_PRODUCTION_PRICE
                    }
                    disabled={loading}
                    onChange={updateLaunchEventPrice}
                    help="런칭 이벤트 기간 커스텀어벗 1개당 단가입니다."
                  />
                  <SalesAmountCard
                    id="customAbutSalePrice"
                    title="정상가(부가세 면제)"
                    value={settings.labProductionPrice}
                    disabled={loading}
                    onChange={updateSalePrice}
                    help="이벤트 종료 후 치과·기공소에 청구하는 커스텀어벗 1개당 단가입니다."
                  />
                  <SalesAmountCard
                    id="customAbutShippingPurchasePrice"
                    title="배송비(부가세 포함)"
                    value={settings.manufacturerShippingUnitPrice}
                    disabled={loading}
                    step={PURCHASE_AMOUNT_STEP}
                    onChange={updateShippingPurchasePrice}
                    help="박스당 제조사 배송비(부가세 포함)."
                  />
                  <SalesAmountCard
                    id="fmDentalMonthlyShippingFee"
                    title="FM덴탈 월정액 배송"
                    value={settings.fmDentalMonthlyShippingFee ?? 0}
                    disabled={loading}
                    onChange={updateFmDentalMonthlyFee}
                    help="기공소만. 정상가 구간 선택지. 0원이면 가입 불가. 유료 크레딧에서 차감합니다."
                  />
                </div>
              </CardContent>
            </Card>

            <AdminRoundBarAbutmentTab />
          </>
        ) : null}
      </div>
    </TooltipProvider>
  );
};
