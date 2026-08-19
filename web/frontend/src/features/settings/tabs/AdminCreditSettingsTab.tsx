// change-log:
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
import { useCallback, useState, useEffect, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { CREDIT_SETTINGS_DEFAULTS } from "@/hooks/useSystemSettings";
import {
  normalizeAbutsAbutmentCreditPrices,
} from "@/shared/pricing/abutsAbutmentService";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CircleHelp,
  CloudUpload,
  Gift,
  Loader2,
  Package,
  Percent,
  Truck,
  Zap,
  Check,
} from "lucide-react";
import { AdminRoundBarAbutmentTab } from "@/pages/admin/system/AdminRoundBarAbutmentTab";

interface CreditSettings {
  minCreditForRequest: number;
  specialRequestorPrices: SpecialRequestorPrice[];
  shippingFee: number;
  manufacturerRequestUnitPrice: number;
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
  manufacturerSharePercent: number;
  salesmanSharePercent: number;
  devopsSharePercent: number;
  regularManufacturerSharePercent: number;
  regularSalesmanSharePercent: number;
  regularDevopsSharePercent: number;
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
const SHIPPING_AMOUNT_STEP = 500;
const PERCENT_STEP = 5;

type ShareKind = "membership" | "regular";

const MEMBERSHIP_SHARE_PERCENTS = {
  manufacturer: 60,
  salesman: 20,
  devops: 5,
};

const REGULAR_SHARE_PERCENTS = {
  manufacturer: 60,
  salesman: 0,
  devops: 10,
};

function clampSharePercent(value: number, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(100, Math.round(n * 100) / 100);
}

function readSharePercents(
  settings: Partial<CreditSettings>,
  kind: ShareKind = "membership",
) {
  if (kind === "regular") {
    return {
      manufacturer: clampSharePercent(
        settings.regularManufacturerSharePercent ??
          REGULAR_SHARE_PERCENTS.manufacturer,
        REGULAR_SHARE_PERCENTS.manufacturer,
      ),
      salesman: clampSharePercent(
        settings.regularSalesmanSharePercent ?? REGULAR_SHARE_PERCENTS.salesman,
        REGULAR_SHARE_PERCENTS.salesman,
      ),
      devops: clampSharePercent(
        settings.regularDevopsSharePercent ?? REGULAR_SHARE_PERCENTS.devops,
        REGULAR_SHARE_PERCENTS.devops,
      ),
    };
  }
  return {
    manufacturer: clampSharePercent(
      settings.manufacturerSharePercent ?? MEMBERSHIP_SHARE_PERCENTS.manufacturer,
      MEMBERSHIP_SHARE_PERCENTS.manufacturer,
    ),
    salesman: clampSharePercent(
      settings.salesmanSharePercent ?? MEMBERSHIP_SHARE_PERCENTS.salesman,
      MEMBERSHIP_SHARE_PERCENTS.salesman,
    ),
    devops: clampSharePercent(
      settings.devopsSharePercent ?? MEMBERSHIP_SHARE_PERCENTS.devops,
      MEMBERSHIP_SHARE_PERCENTS.devops,
    ),
  };
}

function computeAbutsSharePercent(shares: ReturnType<typeof readSharePercents>) {
  return Math.max(
    0,
    Math.round((100 - shares.manufacturer - shares.salesman - shares.devops) * 10) /
      10,
  );
}

function allocateRevenueByPercent(
  revenue: number,
  shares: ReturnType<typeof readSharePercents>,
): TierParty {
  const rev = Math.max(0, Math.round(Number(revenue) || 0));
  return {
    manufacturer: Math.round((rev * shares.manufacturer) / 100),
    salesman: Math.round((rev * shares.salesman) / 100),
    devops: Math.round((rev * shares.devops) / 100),
  };
}

type AutoSaveState = "idle" | "pending" | "saving" | "saved";

function parseTierLabel(label: string): { title: string; badge?: string } {
  const match = label.match(/^(.+?)\((.+)\)$/);
  if (!match) return { title: label };
  return { title: match[1].trim(), badge: match[2].trim() };
}

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

type LabSupplyPriceKey =
  | "labProductionPrice"
  | "labDesignAndProductionPrice"
  | "labRoundBarProductionPrice"
  | "labRoundBarDesignAndProductionPrice";

const LAB_SUPPLY_CNC_CARDS: Array<{
  id: LabSupplyPriceKey;
  title: string;
}> = [
  { id: "labProductionPrice", title: "생산" },
  { id: "labDesignAndProductionPrice", title: "디자인+생산" },
];

const LAB_SUPPLY_ROUND_BAR_CARDS: Array<{
  id: LabSupplyPriceKey;
  title: string;
}> = [
  { id: "labRoundBarProductionPrice", title: "환봉 생산" },
  { id: "labRoundBarDesignAndProductionPrice", title: "환봉 디자인+생산" },
];

function tierPartyFieldKey(prefix: TierPartyPrefix, kind: PartyKind): keyof CreditSettings {
  return `${prefix}${kind}UnitPrice` as keyof CreditSettings;
}

function readTierParty(settings: Partial<CreditSettings>, prefix: TierPartyPrefix): TierParty {
  const tier = CNC_DEFAULT_TIERS.find((item) => item.partyPrefix === prefix);
  const revenue = tier ? Number(settings[tier.revenueKey] ?? 0) || 0 : 0;
  return allocateRevenueByPercent(
    revenue,
    readSharePercents(settings, tier?.shareKind ?? "membership"),
  );
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
  const out = {} as Record<string, number>;
  for (const tier of CNC_DEFAULT_TIERS) {
    const revenue = Number(merged[tier.revenueKey] ?? 0) || 0;
    const party = allocateRevenueByPercent(
      revenue,
      readSharePercents(merged, tier.shareKind),
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
  const tierFields = buildNormalizedTierPartyFields(settings, settings);
  const membershipShares = readSharePercents(settings, "membership");
  const membershipParty = allocateRevenueByPercent(
    settings.membershipProductionPrice,
    membershipShares,
  );
  const specialRequestorPrices = settings.specialRequestorPrices.map((item) => {
    const productionParty = allocateRevenueByPercent(
      item.productionPrice,
      membershipShares,
    );
    const designParty = allocateRevenueByPercent(
      item.designAndProductionPrice,
      membershipShares,
    );
    return {
      ...item,
      productionManufacturerUnitPrice: productionParty.manufacturer,
      productionSalesmanUnitPrice: productionParty.salesman,
      productionDevopsUnitPrice: productionParty.devops,
      designAndProductionManufacturerUnitPrice: designParty.manufacturer,
      designAndProductionSalesmanUnitPrice: designParty.salesman,
      designAndProductionDevopsUnitPrice: designParty.devops,
      manufacturerRequestUnitPrice: productionParty.manufacturer,
      devopsRequestUnitPrice: productionParty.devops,
      salesmanRequestUnitPrice: productionParty.salesman,
    };
  });
  return {
    ...settings,
    ...tierFields,
    manufacturerRequestUnitPrice: membershipParty.manufacturer,
    salesmanRequestUnitPrice: membershipParty.salesman,
    devopsRequestUnitPrice: membershipParty.devops,
    specialRequestorPrices,
  };
}

function buildSharePercentSavePayload(
  settings: CreditSettings,
): Partial<CreditSettings> {
  const synced = syncComputedPartyFields(settings);
  return {
    manufacturerSharePercent: synced.manufacturerSharePercent,
    salesmanSharePercent: synced.salesmanSharePercent,
    devopsSharePercent: synced.devopsSharePercent,
    regularManufacturerSharePercent: synced.regularManufacturerSharePercent,
    regularSalesmanSharePercent: synced.regularSalesmanSharePercent,
    regularDevopsSharePercent: synced.regularDevopsSharePercent,
    ...buildNormalizedTierPartyFields(synced, synced),
    manufacturerRequestUnitPrice: synced.manufacturerRequestUnitPrice,
    salesmanRequestUnitPrice: synced.salesmanRequestUnitPrice,
    devopsRequestUnitPrice: synced.devopsRequestUnitPrice,
    specialRequestorPrices: synced.specialRequestorPrices,
  };
}

function buildTierSavePayload(
  settings: CreditSettings,
  tier: (typeof CNC_DEFAULT_TIERS)[number],
): Partial<CreditSettings> {
  const party = readTierParty(settings, tier.partyPrefix);
  const payload: Partial<CreditSettings> = {
    [tier.revenueKey]: settings[tier.revenueKey],
    [tierPartyFieldKey(tier.partyPrefix, "Manufacturer")]: party.manufacturer,
    [tierPartyFieldKey(tier.partyPrefix, "Salesman")]: party.salesman,
    [tierPartyFieldKey(tier.partyPrefix, "Devops")]: party.devops,
  };
  if (tier.partyPrefix === "membershipProduction") {
    payload.minCreditForRequest = settings.membershipProductionPrice;
    payload.manufacturerRequestUnitPrice = party.manufacturer;
    payload.salesmanRequestUnitPrice = party.salesman;
    payload.devopsRequestUnitPrice = party.devops;
  }
  if (
    tier.revenueKey === "membershipProductionPrice" ||
    tier.revenueKey === "membershipDesignAndProductionPrice"
  ) {
    payload.designFee = settings.designFee;
  }
  return payload;
}

function PercentField({
  id,
  label,
  value,
  onChange,
  disabled,
  readOnly = false,
}: {
  id: string;
  label: string;
  value: number;
  onChange?: (next: number) => void;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
      <Label htmlFor={id} className="mb-3 block text-sm font-medium text-slate-800">
        {label}
      </Label>
      {readOnly ? (
        <div className="relative">
          <div className="flex h-11 items-center justify-end rounded-xl border border-slate-200 bg-slate-50/60 pr-10 text-base font-semibold tabular-nums tracking-tight text-slate-800">
            {value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}
          </div>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
            %
          </span>
        </div>
      ) : (
        <div className="relative">
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
    </div>
  );
}

function SharePercentRow({
  idPrefix,
  title,
  description,
  shares,
  showSalesman,
  disabled,
  onManufacturerChange,
  onSalesmanChange,
  onDevopsChange,
}: {
  idPrefix: string;
  title: string;
  description: string;
  shares: ReturnType<typeof readSharePercents>;
  showSalesman: boolean;
  disabled?: boolean;
  onManufacturerChange: (next: number) => void;
  onSalesmanChange?: (next: number) => void;
  onDevopsChange: (next: number) => void;
}) {
  const overAllocated =
    shares.manufacturer + shares.salesman + shares.devops > 100.001;
  const abutsPercent = computeAbutsSharePercent(shares);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h4 className="text-sm font-semibold tracking-tight text-slate-800">
          {title}
        </h4>
        <p className="text-[13px] text-muted-foreground">{description}</p>
        {overAllocated ? (
          <span className="text-[12px] font-medium text-amber-700">
            합계 100% 초과
          </span>
        ) : null}
      </div>
      <div
        className={`grid gap-3 sm:grid-cols-2 ${
          showSalesman ? "lg:grid-cols-4" : "lg:grid-cols-3"
        }`}
      >
        <PercentField
          id={`${idPrefix}-manufacturer`}
          label="제조사"
          value={shares.manufacturer}
          disabled={disabled}
          onChange={onManufacturerChange}
        />
        {showSalesman ? (
          <PercentField
            id={`${idPrefix}-salesman`}
            label="딜러사"
            value={shares.salesman}
            disabled={disabled}
            onChange={onSalesmanChange}
          />
        ) : null}
        <PercentField
          id={`${idPrefix}-devops`}
          label="개발운영사"
          value={shares.devops}
          disabled={disabled}
          onChange={onDevopsChange}
        />
        <PercentField
          id={`${idPrefix}-abuts`}
          label="어벗츠"
          value={abutsPercent}
          readOnly
        />
      </div>
    </div>
  );
}

function SharePercentPanel({
  membershipShares,
  regularShares,
  disabled,
  onMembershipChange,
  onRegularChange,
}: {
  membershipShares: ReturnType<typeof readSharePercents>;
  regularShares: ReturnType<typeof readSharePercents>;
  disabled?: boolean;
  onMembershipChange: (
    patch: Partial<
      Pick<
        CreditSettings,
        | "manufacturerSharePercent"
        | "salesmanSharePercent"
        | "devopsSharePercent"
      >
    >,
  ) => void;
  onRegularChange: (
    patch: Partial<
      Pick<
        CreditSettings,
        | "regularManufacturerSharePercent"
        | "regularSalesmanSharePercent"
        | "regularDevopsSharePercent"
      >
    >,
  ) => void;
}) {
  return (
    <div className="space-y-5">
      <SharePercentRow
        idPrefix="membershipShare"
        title="딜러사 포함"
        description="의뢰자 소개 코드에 딜러사 있음"
        shares={membershipShares}
        showSalesman
        disabled={disabled}
        onManufacturerChange={(manufacturerSharePercent) =>
          onMembershipChange({ manufacturerSharePercent })
        }
        onSalesmanChange={(salesmanSharePercent) =>
          onMembershipChange({ salesmanSharePercent })
        }
        onDevopsChange={(devopsSharePercent) =>
          onMembershipChange({ devopsSharePercent })
        }
      />
      <SharePercentRow
        idPrefix="regularShare"
        title="딜러사 비포함"
        description="의뢰자 소개 코드에 딜러사 없음"
        shares={regularShares}
        showSalesman={false}
        disabled={disabled}
        onManufacturerChange={(regularManufacturerSharePercent) =>
          onRegularChange({ regularManufacturerSharePercent })
        }
        onDevopsChange={(regularDevopsSharePercent) =>
          onRegularChange({ regularDevopsSharePercent })
        }
      />
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
  const shares = readSharePercents(fallback, "membership");
  const productionParty = allocateRevenueByPercent(productionPrice, shares);
  const designParty = allocateRevenueByPercent(
    designAndProductionPrice,
    shares,
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
    membershipRoundBarProductionPrice: Math.max(
      0,
      Number(
        raw.membershipRoundBarProductionPrice ??
          fallback.membershipRoundBarProductionPrice ??
          0,
      ) || 0,
    ),
    regularRoundBarProductionPrice: Math.max(
      0,
      Number(
        raw.regularRoundBarProductionPrice ??
          fallback.regularRoundBarProductionPrice ??
          0,
      ) || 0,
    ),
    membershipRoundBarDesignAndProductionPrice: Math.max(
      0,
      Number(
        raw.membershipRoundBarDesignAndProductionPrice ??
          fallback.membershipRoundBarDesignAndProductionPrice ??
          0,
      ) || 0,
    ),
    regularRoundBarDesignAndProductionPrice: Math.max(
      0,
      Number(
        raw.regularRoundBarDesignAndProductionPrice ??
          fallback.regularRoundBarDesignAndProductionPrice ??
          0,
      ) || 0,
    ),
    labProductionPrice: Math.max(
      0,
      Number(
        (raw as CreditSettings).labProductionPrice ??
          fallback.labProductionPrice ??
          (raw as CreditSettings).regularProductionPrice ??
          fallback.regularProductionPrice ??
          0,
      ) || 0,
    ),
    labDesignAndProductionPrice: Math.max(
      0,
      Number(
        (raw as CreditSettings).labDesignAndProductionPrice ??
          fallback.labDesignAndProductionPrice ??
          (raw as CreditSettings).regularDesignAndProductionPrice ??
          fallback.regularDesignAndProductionPrice ??
          0,
      ) || 0,
    ),
    labRoundBarProductionPrice: Math.max(
      0,
      Number(
        (raw as CreditSettings).labRoundBarProductionPrice ??
          fallback.labRoundBarProductionPrice ??
          raw.regularRoundBarProductionPrice ??
          fallback.regularRoundBarProductionPrice ??
          0,
      ) || 0,
    ),
    labRoundBarDesignAndProductionPrice: Math.max(
      0,
      Number(
        (raw as CreditSettings).labRoundBarDesignAndProductionPrice ??
          fallback.labRoundBarDesignAndProductionPrice ??
          raw.regularRoundBarDesignAndProductionPrice ??
          fallback.regularRoundBarDesignAndProductionPrice ??
          0,
      ) || 0,
    ),
    manufacturerSharePercent: clampSharePercent(
      Number(
        (raw as CreditSettings).manufacturerSharePercent ??
          (fallback as CreditSettings).manufacturerSharePercent ??
          MEMBERSHIP_SHARE_PERCENTS.manufacturer,
      ),
      MEMBERSHIP_SHARE_PERCENTS.manufacturer,
    ),
    salesmanSharePercent: clampSharePercent(
      Number(
        (raw as CreditSettings).salesmanSharePercent ??
          (fallback as CreditSettings).salesmanSharePercent ??
          MEMBERSHIP_SHARE_PERCENTS.salesman,
      ),
      MEMBERSHIP_SHARE_PERCENTS.salesman,
    ),
    devopsSharePercent: clampSharePercent(
      Number(
        (raw as CreditSettings).devopsSharePercent ??
          (fallback as CreditSettings).devopsSharePercent ??
          MEMBERSHIP_SHARE_PERCENTS.devops,
      ),
      MEMBERSHIP_SHARE_PERCENTS.devops,
    ),
    regularManufacturerSharePercent: clampSharePercent(
      Number(
        (raw as CreditSettings).regularManufacturerSharePercent ??
          (fallback as CreditSettings).regularManufacturerSharePercent ??
          REGULAR_SHARE_PERCENTS.manufacturer,
      ),
      REGULAR_SHARE_PERCENTS.manufacturer,
    ),
    regularSalesmanSharePercent: clampSharePercent(
      Number(
        (raw as CreditSettings).regularSalesmanSharePercent ??
          (fallback as CreditSettings).regularSalesmanSharePercent ??
          REGULAR_SHARE_PERCENTS.salesman,
      ),
      REGULAR_SHARE_PERCENTS.salesman,
    ),
    regularDevopsSharePercent: clampSharePercent(
      Number(
        (raw as CreditSettings).regularDevopsSharePercent ??
          (fallback as CreditSettings).regularDevopsSharePercent ??
          REGULAR_SHARE_PERCENTS.devops,
      ),
      REGULAR_SHARE_PERCENTS.devops,
    ),
    ...buildNormalizedTierPartyFields({ ...fallback, ...raw, ...abutmentPrices }, {
      ...CREDIT_SETTINGS_DEFAULTS,
      ...fallback,
      ...raw,
      ...abutmentPrices,
    } as CreditSettings),
  };
  withPrices.manufacturerRequestUnitPrice =
    withPrices.membershipProductionManufacturerUnitPrice;
  withPrices.salesmanRequestUnitPrice =
    withPrices.membershipProductionSalesmanUnitPrice;
  withPrices.devopsRequestUnitPrice =
    withPrices.membershipProductionDevopsUnitPrice;
  withPrices.specialRequestorPrices = Array.isArray(raw.specialRequestorPrices)
    ? raw.specialRequestorPrices
        .map((item) => normalizeSpecialRequestorPrice(item, withPrices))
        .filter((item) => item.requestorAnchorId)
    : fallback.specialRequestorPrices;
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
  saveState = "idle",
  help,
}: {
  id: string;
  title: string;
  badge?: string;
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  saveState?: AutoSaveState;
  help?: string;
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
          step={AMOUNT_STEP}
          className="h-11 rounded-xl border-slate-200 bg-slate-50/60 pr-9 text-right text-base font-semibold tabular-nums tracking-tight [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          value={value}
          disabled={disabled}
          onChange={(event) =>
            onChange(Math.max(0, Number(event.target.value)))
          }
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
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
  description?: string;
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

function SubSectionHeader({
  title,
  description,
  trailing,
}: {
  title: string;
  description?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-0.5">
        <h4 className="text-sm font-semibold tracking-tight text-slate-800">
          {title}
        </h4>
        {description ? (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {trailing}
    </div>
  );
}

export type AdminCreditSettingsVariant = "credits" | "customAbut";

type AdminCreditSettingsTabProps = {
  /** credits: 환영 무료 크레딧·배송. customAbut: 치과·기공소 공급 단가·추가요청. */
  variant?: AdminCreditSettingsVariant;
};

export const AdminCreditSettingsTab = ({
  variant = "credits",
}: AdminCreditSettingsTabProps) => {
  const showCredits = variant === "credits";
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
      manufacturerSharePercent: MEMBERSHIP_SHARE_PERCENTS.manufacturer,
      salesmanSharePercent: MEMBERSHIP_SHARE_PERCENTS.salesman,
      devopsSharePercent: MEMBERSHIP_SHARE_PERCENTS.devops,
      regularManufacturerSharePercent: REGULAR_SHARE_PERCENTS.manufacturer,
      regularSalesmanSharePercent: REGULAR_SHARE_PERCENTS.salesman,
      regularDevopsSharePercent: REGULAR_SHARE_PERCENTS.devops,
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

  const scheduleTierSave = useCallback(
    (tier: (typeof CNC_DEFAULT_TIERS)[number]) => {
      scheduleItemSave(`tier:${tier.partyPrefix}`, () =>
        buildTierSavePayload(settingsRef.current, tier),
      );
    },
    [scheduleItemSave],
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
          | "manufacturerSharePercent"
          | "salesmanSharePercent"
          | "devopsSharePercent"
          | "regularManufacturerSharePercent"
          | "regularSalesmanSharePercent"
          | "regularDevopsSharePercent"
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

  const updateLabSupplyPrice = (
    key: LabSupplyPriceKey,
    next: number,
  ) => {
    applySettingsUpdate((prev) => ({
      ...prev,
      [key]: next,
    }));
    scheduleItemSave(`lab:${key}`, () => ({
      [key]: settingsRef.current[key],
    }));
  };

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
      const payload = settingsRef.current;
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
                  title="환영 무료 크레딧"
                  description="기공소(의뢰 수신자) 신규 가입 시 무료크레딧으로 1회 지급합니다. 치과에는 지급하지 않습니다."
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <AmountField
                    id="defaultRequestFreeCredit"
                    label="무료 크레딧"
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
                    help="가입 시 무료크레딧 잔액으로 1회 충전됩니다. 기공의뢰·어벗 생산·배송 등에 사용됩니다."
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

        {showCustomAbut ? (
          <>
            <Card className="app-glass-card app-glass-card--lg overflow-hidden">
              <CardContent className="space-y-5 p-5 sm:p-6">
                <SectionHeader
                  icon={Percent}
                  title="분배 비율 (공통)"
                  description="환봉어벗을 제외한 고시·딜러없음 매출에 적용합니다. 어벗츠는 잔여분입니다. 멤버십 구독 비율이 아닙니다."
                  trailing={
                    <AutoSaveIndicator
                      state={itemSaveStates.sharePercents ?? "idle"}
                    />
                  }
                />
                <SharePercentPanel
                  membershipShares={readSharePercents(settings, "membership")}
                  regularShares={readSharePercents(settings, "regular")}
                  disabled={loading}
                  onMembershipChange={(patch) => updateSharePercent(patch)}
                  onRegularChange={(patch) => updateSharePercent(patch)}
                />
              </CardContent>
            </Card>

            <Card className="app-glass-card app-glass-card--lg overflow-hidden">
              <CardContent className="space-y-5 p-5 sm:p-6">
                <SectionHeader
                  icon={Package}
                  title="치과 공급 어벗"
                  description="공개 정책·청구 고시는 생산·디자인+생산입니다. 고시 배지는 딜러 소개가 있을 때, 딜러없음은 분배식만 다릅니다. 치과 구독/멤버십 단가가 아닙니다."
                />

                <div className="space-y-3">
                  <SubSectionHeader title="CNC어벗" />
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {CNC_DEFAULT_TIERS.map((tier) => {
                      const { title, badge } = parseTierLabel(tier.label);
                      const scopeKey = `tier:${tier.partyPrefix}`;
                      return (
                        <SalesAmountCard
                          key={tier.revenueKey}
                          id={tier.revenueKey}
                          title={title}
                          badge={badge}
                          value={settings[tier.revenueKey]}
                          disabled={loading}
                          saveState={itemSaveStates[scopeKey] ?? "idle"}
                          onChange={(next) => {
                            applySettingsUpdate((prev) => {
                              const patch: Partial<CreditSettings> = {
                                [tier.revenueKey]: next,
                              };
                              if (
                                tier.revenueKey === "membershipProductionPrice"
                              ) {
                                patch.minCreditForRequest = next;
                                patch.designFee = Math.max(
                                  0,
                                  prev.membershipDesignAndProductionPrice -
                                    next,
                                );
                              }
                              if (
                                tier.revenueKey ===
                                "membershipDesignAndProductionPrice"
                              ) {
                                patch.designFee = Math.max(
                                  0,
                                  next - prev.membershipProductionPrice,
                                );
                              }
                              return syncComputedPartyFields({
                                ...prev,
                                ...patch,
                              });
                            });
                            scheduleTierSave(tier);
                          }}
                        />
                        );
                      })}
                  </div>
                </div>

                <div className="space-y-3">
                  <SubSectionHeader title="환봉어벗" />
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <SalesAmountCard
                      id="membershipRoundBarProductionPrice"
                      title="환봉 생산"
                      badge="고시"
                      value={settings.membershipRoundBarProductionPrice}
                      disabled={loading}
                      saveState={
                        itemSaveStates["roundBar:production"] ?? "idle"
                      }
                      onChange={(next) => {
                        applySettingsUpdate((prev) => ({
                          ...prev,
                          membershipRoundBarProductionPrice: next,
                        }));
                        scheduleItemSave("roundBar:production", () => ({
                          membershipRoundBarProductionPrice:
                            settingsRef.current
                              .membershipRoundBarProductionPrice,
                          regularRoundBarProductionPrice:
                            settingsRef.current.regularRoundBarProductionPrice,
                        }));
                      }}
                    />
                    <SalesAmountCard
                      id="regularRoundBarProductionPrice"
                      title="환봉 생산"
                      badge="딜러없음"
                      value={settings.regularRoundBarProductionPrice}
                      disabled={loading}
                      saveState={
                        itemSaveStates["roundBar:production"] ?? "idle"
                      }
                      onChange={(next) => {
                        applySettingsUpdate((prev) => ({
                          ...prev,
                          regularRoundBarProductionPrice: next,
                        }));
                        scheduleItemSave("roundBar:production", () => ({
                          membershipRoundBarProductionPrice:
                            settingsRef.current
                              .membershipRoundBarProductionPrice,
                          regularRoundBarProductionPrice:
                            settingsRef.current.regularRoundBarProductionPrice,
                        }));
                      }}
                    />
                    <SalesAmountCard
                      id="membershipRoundBarDesignAndProductionPrice"
                      title="환봉 디자인+생산"
                      badge="고시"
                      value={
                        settings.membershipRoundBarDesignAndProductionPrice
                      }
                      disabled={loading}
                      saveState={itemSaveStates["roundBar:design"] ?? "idle"}
                      onChange={(next) => {
                        applySettingsUpdate((prev) => ({
                          ...prev,
                          membershipRoundBarDesignAndProductionPrice: next,
                        }));
                        scheduleItemSave("roundBar:design", () => ({
                          membershipRoundBarDesignAndProductionPrice:
                            settingsRef.current
                              .membershipRoundBarDesignAndProductionPrice,
                          regularRoundBarDesignAndProductionPrice:
                            settingsRef.current
                              .regularRoundBarDesignAndProductionPrice,
                        }));
                      }}
                    />
                    <SalesAmountCard
                      id="regularRoundBarDesignAndProductionPrice"
                      title="환봉 디자인+생산"
                      badge="딜러없음"
                      value={settings.regularRoundBarDesignAndProductionPrice}
                      disabled={loading}
                      saveState={itemSaveStates["roundBar:design"] ?? "idle"}
                      onChange={(next) => {
                        applySettingsUpdate((prev) => ({
                          ...prev,
                          regularRoundBarDesignAndProductionPrice: next,
                        }));
                        scheduleItemSave("roundBar:design", () => ({
                          membershipRoundBarDesignAndProductionPrice:
                            settingsRef.current
                              .membershipRoundBarDesignAndProductionPrice,
                          regularRoundBarDesignAndProductionPrice:
                            settingsRef.current
                              .regularRoundBarDesignAndProductionPrice,
                        }));
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="app-glass-card app-glass-card--lg overflow-hidden">
              <CardContent className="space-y-5 p-5 sm:p-6">
                <SectionHeader
                  icon={Package}
                  title="기공소 공급 어벗 (레거시 오버레이)"
                  description="공개 정책은 위 고시와 같습니다. 이 값은 기공소 어벗생산의뢰 장부 오버레이(labProductionPrice)입니다. 고시와 같게 운영하려면 같은 금액으로 맞추세요."
                />

                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-3">
                    <SubSectionHeader title="CNC어벗" />
                    <div className="grid gap-3 sm:grid-cols-2">
                      {LAB_SUPPLY_CNC_CARDS.map((card) => (
                        <SalesAmountCard
                          key={card.id}
                          id={card.id}
                          title={card.title}
                          badge="오버레이"
                          value={settings[card.id]}
                          disabled={loading}
                          saveState={itemSaveStates[`lab:${card.id}`] ?? "idle"}
                          onChange={(next) => updateLabSupplyPrice(card.id, next)}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <SubSectionHeader title="환봉어벗" />
                    <div className="grid gap-3 sm:grid-cols-2">
                      {LAB_SUPPLY_ROUND_BAR_CARDS.map((card) => (
                        <SalesAmountCard
                          key={card.id}
                          id={card.id}
                          title={card.title}
                          badge="오버레이"
                          value={settings[card.id]}
                          disabled={loading}
                          saveState={itemSaveStates[`lab:${card.id}`] ?? "idle"}
                          onChange={(next) => updateLabSupplyPrice(card.id, next)}
                        />
                      ))}
                    </div>
                  </div>
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
