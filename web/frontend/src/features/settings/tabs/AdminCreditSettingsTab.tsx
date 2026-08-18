// change-log:
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
// - 2026-08-13: 치과 멤버십 월 구독료(practiceMembershipMonthlyFee) 추가.
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
import { useCallback, useMemo, useState, useEffect, useRef, type ReactNode } from "react";
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
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChevronsUpDown,
  CircleHelp,
  CloudUpload,
  Crown,
  Gift,
  HandCoins,
  Hexagon,
  Loader2,
  Package,
  Plus,
  Search,
  Truck,
  X,
  Zap,
  Check,
} from "lucide-react";
import { REQUESTOR_CAPABILITY_LABEL } from "@/shared/business/requestorCapabilities";
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

type RequestorItem = {
  id: string;
  name: string;
  representativeName?: string;
  businessNumber?: string;
  address?: string;
  requestorKind?: "practice" | "lab" | null;
  status?: string | null;
};

type CreditSettingsApiResponse = {
  success?: boolean;
  data?: {
    creditSettings?: Partial<CreditSettings>;
  };
};

type CreditPriceRequestorsApiResponse = {
  success?: boolean;
  data?: { items?: RequestorItem[] };
};

const AUTO_SAVE_DELAY_MS = 700;
const AMOUNT_STEP = 1000;
const SHIPPING_AMOUNT_STEP = 500;
const PERCENT_STEP = 0.1;

const DEFAULT_SHARE_PERCENTS = {
  manufacturer: 60,
  salesman: 20,
  devops: (1000 / 15000) * 100,
};

function clampSharePercent(value: number, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(100, Math.round(n * 100) / 100);
}

function readSharePercents(settings: Partial<CreditSettings>) {
  return {
    manufacturer: clampSharePercent(
      settings.manufacturerSharePercent ?? DEFAULT_SHARE_PERCENTS.manufacturer,
      DEFAULT_SHARE_PERCENTS.manufacturer,
    ),
    salesman: clampSharePercent(
      settings.salesmanSharePercent ?? DEFAULT_SHARE_PERCENTS.salesman,
      DEFAULT_SHARE_PERCENTS.salesman,
    ),
    devops: clampSharePercent(
      settings.devopsSharePercent ?? DEFAULT_SHARE_PERCENTS.devops,
      DEFAULT_SHARE_PERCENTS.devops,
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

type DistributionCellVariant =
  | "revenue"
  | "manufacturer"
  | "salesman"
  | "devops";

const DISTRIBUTION_CELL_STYLES: Record<DistributionCellVariant, string> = {
  revenue:
    "border-primary-muted/70 bg-primary-soft/25 focus-within:ring-primary-muted/60",
  manufacturer:
    "border-slate-200/90 bg-white focus-within:ring-slate-200",
  salesman: "border-sky-200/80 bg-sky-50/50 focus-within:ring-sky-200",
  devops: "border-violet-200/80 bg-violet-50/50 focus-within:ring-violet-200",
};

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

function FormulaOperator({ children }: { children: string }) {
  return (
    <span className="hidden pb-2 text-base font-medium text-slate-300 sm:inline">
      {children}
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
}> = [
  {
    label: "CNC 생산(멤버)",
    revenueKey: "membershipProductionPrice",
    partyPrefix: "membershipProduction",
  },
  {
    label: "CNC 생산(일반)",
    revenueKey: "regularProductionPrice",
    partyPrefix: "regularProduction",
  },
  {
    label: "CNC D+P(멤버)",
    revenueKey: "membershipDesignAndProductionPrice",
    partyPrefix: "membershipDesignAndProduction",
  },
  {
    label: "CNC D+P(일반)",
    revenueKey: "regularDesignAndProductionPrice",
    partyPrefix: "regularDesignAndProduction",
  },
];

function tierPartyFieldKey(prefix: TierPartyPrefix, kind: PartyKind): keyof CreditSettings {
  return `${prefix}${kind}UnitPrice` as keyof CreditSettings;
}

function readTierParty(settings: Partial<CreditSettings>, prefix: TierPartyPrefix): TierParty {
  const tier = CNC_DEFAULT_TIERS.find((item) => item.partyPrefix === prefix);
  const revenue = tier ? Number(settings[tier.revenueKey] ?? 0) || 0 : 0;
  return allocateRevenueByPercent(revenue, readSharePercents(settings));
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
  const shares = readSharePercents(merged);
  const out = {} as Record<string, number>;
  for (const tier of CNC_DEFAULT_TIERS) {
    const revenue = Number(merged[tier.revenueKey] ?? 0) || 0;
    const party = allocateRevenueByPercent(revenue, shares);
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
  const shares = readSharePercents(settings);
  const membershipParty = allocateRevenueByPercent(
    settings.membershipProductionPrice,
    shares,
  );
  const specialRequestorPrices = settings.specialRequestorPrices.map((item) => {
    const productionParty = allocateRevenueByPercent(
      item.productionPrice,
      shares,
    );
    const designParty = allocateRevenueByPercent(
      item.designAndProductionPrice,
      shares,
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

function formatWonAmount(value: number): string {
  return `${Math.max(0, Math.round(Number(value) || 0)).toLocaleString("ko-KR")}원`;
}

function computeAbutsShare(
  revenue: number,
  manufacturer: number,
  salesman: number,
  devops: number,
): number {
  return Math.max(
    0,
    Math.round(Number(revenue) || 0) -
      Math.max(0, Math.round(Number(manufacturer) || 0)) -
      Math.max(0, Math.round(Number(salesman) || 0)) -
      Math.max(0, Math.round(Number(devops) || 0)),
  );
}

function DistributionAmountCell({
  id,
  label,
  value,
  onChange,
  disabled,
  readOnly = false,
  variant,
  step = AMOUNT_STEP,
}: {
  id: string;
  label: string;
  value: number;
  onChange?: (next: number) => void;
  disabled?: boolean;
  readOnly?: boolean;
  variant: DistributionCellVariant;
  step?: number;
}) {
  if (readOnly) {
    return (
      <div
        className={`rounded-xl border px-2.5 py-2 shadow-sm ${DISTRIBUTION_CELL_STYLES[variant]}`}
      >
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </div>
        <div className="text-right text-[15px] font-semibold tabular-nums tracking-tight text-slate-800">
          {formatWonAmount(value)}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border px-2.5 py-2 shadow-sm ring-0 transition-shadow focus-within:ring-2 ${DISTRIBUTION_CELL_STYLES[variant]}`}
    >
      <Label
        htmlFor={id}
        className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500"
      >
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          min="0"
          step={step}
          className="h-9 border-0 bg-transparent p-0 pr-7 text-right text-[15px] font-semibold tabular-nums tracking-tight shadow-none focus-visible:ring-0"
          value={value}
          disabled={disabled}
          onChange={(event) =>
            onChange?.(Math.max(0, Number(event.target.value)))
          }
        />
        <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[10px] font-medium text-slate-400">
          원
        </span>
      </div>
    </div>
  );
}

function SharePercentCell({
  id,
  label,
  value,
  onChange,
  disabled,
  variant,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  variant: DistributionCellVariant;
}) {
  return (
    <div
      className={`rounded-xl border px-2.5 py-2 shadow-sm ring-0 transition-shadow focus-within:ring-2 ${DISTRIBUTION_CELL_STYLES[variant]}`}
    >
      <Label
        htmlFor={id}
        className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500"
      >
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          min="0"
          max="100"
          step={PERCENT_STEP}
          className="h-9 border-0 bg-transparent p-0 pr-6 text-right text-[15px] font-semibold tabular-nums tracking-tight shadow-none focus-visible:ring-0"
          value={value}
          disabled={disabled}
          onChange={(event) =>
            onChange(clampSharePercent(Number(event.target.value), value))
          }
        />
        <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[10px] font-medium text-slate-400">
          %
        </span>
      </div>
    </div>
  );
}

function SharePercentPanel({
  shares,
  abutsPercent,
  disabled,
  saveState,
  onManufacturerChange,
  onSalesmanChange,
  onDevopsChange,
}: {
  shares: ReturnType<typeof readSharePercents>;
  abutsPercent: number;
  disabled?: boolean;
  saveState?: AutoSaveState;
  onManufacturerChange: (next: number) => void;
  onSalesmanChange: (next: number) => void;
  onDevopsChange: (next: number) => void;
}) {
  const overAllocated =
    shares.manufacturer + shares.salesman + shares.devops > 100.001;

  return (
    <div
      className={`overflow-hidden rounded-2xl border shadow-sm ring-1 ring-black/[0.02] ${
        overAllocated
          ? "border-amber-200/90 bg-gradient-to-br from-amber-50/40 to-white"
          : "border-slate-200/80 bg-gradient-to-br from-white to-slate-50/70"
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100/90 bg-white/70 px-4 py-2.5">
        <div>
          <div className="text-sm font-semibold tracking-tight text-slate-900">
            분배 비율 (공통)
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            항목별 매출에 동일 비율을 적용합니다. 어벗츠는 잔여분입니다.
          </p>
        </div>
        <AutoSaveIndicator state={saveState ?? "idle"} />
      </div>

      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
        <SharePercentCell
          id="manufacturerSharePercent"
          label="제조사"
          value={shares.manufacturer}
          disabled={disabled}
          variant="manufacturer"
          onChange={onManufacturerChange}
        />
        <FormulaOperator>+</FormulaOperator>
        <SharePercentCell
          id="salesmanSharePercent"
          label="영업자"
          value={shares.salesman}
          disabled={disabled}
          variant="salesman"
          onChange={onSalesmanChange}
        />
        <FormulaOperator>+</FormulaOperator>
        <SharePercentCell
          id="devopsSharePercent"
          label="개발운영사"
          value={shares.devops}
          disabled={disabled}
          variant="devops"
          onChange={onDevopsChange}
        />
        <FormulaOperator>+</FormulaOperator>
        <div className="col-span-2 rounded-xl border border-primary-muted/60 bg-primary-soft/30 px-3 py-2 shadow-sm sm:col-span-1">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary-strong/80">
            어벗츠
          </div>
          <div
            className={`text-right text-[15px] font-bold tabular-nums tracking-tight ${
              overAllocated ? "text-amber-700" : "text-primary-strong"
            }`}
          >
            {abutsPercent.toLocaleString("ko-KR", {
              maximumFractionDigits: 1,
            })}
            %
          </div>
        </div>
      </div>

      {overAllocated ? (
        <p className="border-t border-amber-100/80 bg-amber-50/50 px-4 py-2 text-[11px] leading-relaxed text-amber-800">
          분배 비율 합계가 100%를 초과합니다. 어벗츠 잔여분이 0%가 됩니다.
        </p>
      ) : null}
    </div>
  );
}

function RevenueDistributionRow({
  label,
  revenueId,
  revenueValue,
  onRevenueChange,
  manufacturer,
  salesman,
  devops,
  disabled,
  saveState = "idle",
}: {
  label: string;
  revenueId: string;
  revenueValue: number;
  onRevenueChange: (next: number) => void;
  manufacturer: number;
  salesman: number;
  devops: number;
  disabled?: boolean;
  saveState?: AutoSaveState;
}) {
  const abutsShare = computeAbutsShare(
    revenueValue,
    manufacturer,
    salesman,
    devops,
  );
  const { title, badge } = parseTierLabel(label);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50/70 shadow-sm ring-1 ring-black/[0.02]">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100/90 bg-white/70 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold tracking-tight text-slate-900">
            {title}
          </span>
          {badge ? (
            <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary-strong ring-1 ring-primary-muted/60">
              {badge}
            </span>
          ) : null}
        </div>
        <AutoSaveIndicator state={saveState} />
      </div>

      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-[minmax(0,1.15fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
        <DistributionAmountCell
          id={revenueId}
          label="매출"
          value={revenueValue}
          disabled={disabled}
          step={AMOUNT_STEP}
          variant="revenue"
          onChange={onRevenueChange}
        />
        <FormulaOperator>=</FormulaOperator>
        <DistributionAmountCell
          id={`${revenueId}-manufacturer`}
          label="제조사"
          value={manufacturer}
          disabled={disabled}
          variant="manufacturer"
          readOnly
        />
        <FormulaOperator>+</FormulaOperator>
        <DistributionAmountCell
          id={`${revenueId}-salesman`}
          label="영업자"
          value={salesman}
          disabled={disabled}
          variant="salesman"
          readOnly
        />
        <FormulaOperator>+</FormulaOperator>
        <DistributionAmountCell
          id={`${revenueId}-devops`}
          label="개발운영사"
          value={devops}
          disabled={disabled}
          variant="devops"
          readOnly
        />
        <FormulaOperator>+</FormulaOperator>
        <div className="col-span-2 rounded-xl border border-primary-muted/60 bg-primary-soft/30 px-3 py-2 shadow-sm sm:col-span-1">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary-strong/80">
            어벗츠
          </div>
          <div className="text-right text-[15px] font-bold tabular-nums tracking-tight text-primary-strong">
            {formatWonAmount(abutsShare)}
          </div>
        </div>
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
  const shares = readSharePercents(fallback);
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
    manufacturerSharePercent: clampSharePercent(
      Number(
        (raw as CreditSettings).manufacturerSharePercent ??
          (fallback as CreditSettings).manufacturerSharePercent ??
          DEFAULT_SHARE_PERCENTS.manufacturer,
      ),
      DEFAULT_SHARE_PERCENTS.manufacturer,
    ),
    salesmanSharePercent: clampSharePercent(
      Number(
        (raw as CreditSettings).salesmanSharePercent ??
          (fallback as CreditSettings).salesmanSharePercent ??
          DEFAULT_SHARE_PERCENTS.salesman,
      ),
      DEFAULT_SHARE_PERCENTS.salesman,
    ),
    devopsSharePercent: clampSharePercent(
      Number(
        (raw as CreditSettings).devopsSharePercent ??
          (fallback as CreditSettings).devopsSharePercent ??
          DEFAULT_SHARE_PERCENTS.devops,
      ),
      DEFAULT_SHARE_PERCENTS.devops,
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
          className="h-11 rounded-xl border-slate-200 bg-slate-50/60 pr-10 text-right text-base font-semibold tabular-nums tracking-tight"
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

function DualTierAmountField({
  label,
  membershipId,
  regularId,
  membershipValue,
  regularValue,
  onMembershipChange,
  onRegularChange,
  disabled,
  help,
  icon: Icon,
  step = AMOUNT_STEP,
}: {
  label: string;
  membershipId: string;
  regularId: string;
  membershipValue: number;
  regularValue: number;
  onMembershipChange: (next: number) => void;
  onRegularChange: (next: number) => void;
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
            <div className="text-sm font-medium text-slate-800">{label}</div>
            {help ? <FieldHelp text={help} /> : null}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label
            htmlFor={membershipId}
            className="mb-1.5 block text-[11px] font-medium text-slate-500"
          >
            멤버십
          </Label>
          <div className="relative">
            <Input
              id={membershipId}
              type="number"
              min="0"
              step={step}
              className="h-11 rounded-xl border-slate-200 bg-slate-50/60 pr-10 text-right text-base font-semibold tabular-nums tracking-tight"
              value={membershipValue}
              onChange={(e) =>
                onMembershipChange(Math.max(0, Number(e.target.value)))
              }
              disabled={disabled}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
              원
            </span>
          </div>
        </div>
        <div>
          <Label
            htmlFor={regularId}
            className="mb-1.5 block text-[11px] font-medium text-slate-500"
          >
            일반
          </Label>
          <div className="relative">
            <Input
              id={regularId}
              type="number"
              min="0"
              step={step}
              className="h-11 rounded-xl border-slate-200 bg-slate-50/60 pr-10 text-right text-base font-semibold tabular-nums tracking-tight"
              value={regularValue}
              onChange={(e) =>
                onRegularChange(Math.max(0, Number(e.target.value)))
              }
              disabled={disabled}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
              원
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompactAmountInput({
  id,
  label,
  value,
  onChange,
  disabled,
  step = AMOUNT_STEP,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  step?: number;
}) {
  return (
    <div>
      <Label
        htmlFor={id}
        className="mb-1.5 block text-[11px] font-medium text-slate-500"
      >
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          min="0"
          step={step}
          className="h-10 rounded-xl border-slate-200 bg-slate-50/60 pr-9 text-right font-semibold tabular-nums"
          value={value}
          disabled={disabled}
          onChange={(event) =>
            onChange(Math.max(0, Number(event.target.value)))
          }
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
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
  /** credits: 환영 무료 크레딧·멤버십·배송. customAbut: 단가·추가요청·특별 공급가. */
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
      manufacturerSharePercent: DEFAULT_SHARE_PERCENTS.manufacturer,
      salesmanSharePercent: DEFAULT_SHARE_PERCENTS.salesman,
      devopsSharePercent: DEFAULT_SHARE_PERCENTS.devops,
    } as CreditSettings),
  );
  const [requestors, setRequestors] = useState<RequestorItem[]>([]);
  const [requestorPickerOpen, setRequestorPickerOpen] = useState(false);
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

  const scheduleSpecialPricesSave = useCallback(
    (scopeKey: string) => {
      scheduleItemSave(scopeKey, () => ({
        specialRequestorPrices: settingsRef.current.specialRequestorPrices,
      }));
    },
    [scheduleItemSave],
  );

  const requestorById = useMemo(() => {
    const map = new Map<string, RequestorItem>();
    requestors.forEach((item) => map.set(item.id, item));
    return map;
  }, [requestors]);

  const availableRequestors = useMemo(
    () =>
      requestors.filter(
        (requestor) =>
          !settings.specialRequestorPrices.some(
            (item) => item.requestorAnchorId === requestor.id,
          ),
      ),
    [requestors, settings.specialRequestorPrices],
  );

  const getRequestorLabel = (item: RequestorItem) => {
    const kindLabel =
      item.requestorKind === "practice" || item.requestorKind === "lab"
        ? REQUESTOR_CAPABILITY_LABEL[item.requestorKind]
        : "";
    const bn = String(item.businessNumber || "").trim();
    return [item.name, kindLabel, bn ? `(${bn})` : ""].filter(Boolean).join(" ");
  };

  const updateSpecialPrice = (
    requestorAnchorId: string,
    patch: Partial<SpecialRequestorPrice>,
    saveScopeKey: string,
  ) => {
    applySettingsUpdate((prev) =>
      syncComputedPartyFields({
        ...prev,
        specialRequestorPrices: prev.specialRequestorPrices.map((price) => {
          if (price.requestorAnchorId !== requestorAnchorId) return price;
          const next = { ...price, ...patch };
          if (patch.productionPrice != null || patch.amount != null) {
            const productionPrice = Math.max(
              0,
              Number(patch.productionPrice ?? patch.amount) || 0,
            );
            next.productionPrice = productionPrice;
            next.amount = productionPrice;
          }
          return next;
        }),
      }),
    );
    scheduleSpecialPricesSave(saveScopeKey);
  };

  const addSpecialRequestor = (requestor: RequestorItem) => {
    if (
      settings.specialRequestorPrices.some(
        (item) => item.requestorAnchorId === requestor.id,
      )
    ) {
      return;
    }
    applySettingsUpdate((prev) =>
      syncComputedPartyFields({
        ...prev,
        specialRequestorPrices: [
          ...prev.specialRequestorPrices,
          {
            requestorAnchorId: requestor.id,
            amount: prev.membershipProductionPrice,
            productionPrice: prev.membershipProductionPrice,
            designAndProductionPrice: prev.membershipDesignAndProductionPrice,
            roundBarProductionPrice: prev.membershipRoundBarProductionPrice,
            roundBarDesignAndProductionPrice:
              prev.membershipRoundBarDesignAndProductionPrice,
            manufacturerRequestUnitPrice: prev.manufacturerRequestUnitPrice,
            devopsRequestUnitPrice: prev.devopsRequestUnitPrice,
            salesmanRequestUnitPrice: prev.salesmanRequestUnitPrice,
            productionManufacturerUnitPrice: 0,
            productionSalesmanUnitPrice: 0,
            productionDevopsUnitPrice: 0,
            designAndProductionManufacturerUnitPrice: 0,
            designAndProductionSalesmanUnitPrice: 0,
            designAndProductionDevopsUnitPrice: 0,
          },
        ],
      }),
    );
    scheduleSpecialPricesSave(`special:${requestor.id}:init`);
    setRequestorPickerOpen(false);
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
    if (!token || !showCustomAbut) return;
    void (async () => {
      const res = await apiFetch<CreditPriceRequestorsApiResponse>({
        path: "/api/admin/settings/credits/requestors",
        method: "GET",
        token,
      });
      if (res.ok) {
        setRequestors(res.data?.data?.items || []);
      }
    })();
  }, [token, showCustomAbut]);

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
  const membershipHelp =
    "치과(의뢰 발신자)만 적용합니다. 기공소에는 적용하지 않으며, 매달 유료 청구됩니다.";

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
                  icon={Crown}
                  title="멤버십 · 배송"
                  description="치과 멤버십 구독료와 배송 요금입니다."
                />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <AmountField
                    id="practiceMembershipMonthlyFee"
                    label="치과 멤버십 구독료"
                    icon={Crown}
                    value={settings.practiceMembershipMonthlyFee}
                    onChange={(next) =>
                      setSettings({
                        ...settings,
                        practiceMembershipMonthlyFee: next,
                      })
                    }
                    disabled={loading}
                    help={membershipHelp}
                  />
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
            <div className="px-0.5">
              <p className="text-[12px] text-muted-foreground">
                항목마다 {AUTO_SAVE_DELAY_MS / 1000}초 후 개별 자동 저장됩니다.
              </p>
            </div>

            <Card className="app-glass-card app-glass-card--lg overflow-hidden">
              <CardContent className="space-y-5 p-5 sm:p-6">
                <SectionHeader
                  icon={Package}
                  title="커스텀어벗"
                  description="특별 공급가가 없으면 이 금액이 적용됩니다."
                />

                <div className="space-y-4 rounded-2xl border border-slate-200/70 bg-slate-50/40 p-4">
                  <SubSectionHeader
                    title="CNC어벗"
                    description="1어벗당. 매출 = 제조사 + 영업자 + 개발운영사 + 어벗츠(잔여)."
                  />
                  <SharePercentPanel
                    shares={readSharePercents(settings)}
                    abutsPercent={computeAbutsSharePercent(readSharePercents(settings))}
                    disabled={loading}
                    saveState={itemSaveStates.sharePercents ?? "idle"}
                    onManufacturerChange={(manufacturerSharePercent) =>
                      updateSharePercent({ manufacturerSharePercent })
                    }
                    onSalesmanChange={(salesmanSharePercent) =>
                      updateSharePercent({ salesmanSharePercent })
                    }
                    onDevopsChange={(devopsSharePercent) =>
                      updateSharePercent({ devopsSharePercent })
                    }
                  />
                  <div className="space-y-3">
                    {CNC_DEFAULT_TIERS.map((tier) => {
                      const party = readTierParty(settings, tier.partyPrefix);
                      const scopeKey = `tier:${tier.partyPrefix}`;
                      return (
                        <RevenueDistributionRow
                          key={tier.revenueKey}
                          label={tier.label}
                          revenueId={tier.revenueKey}
                          revenueValue={settings[tier.revenueKey]}
                          manufacturer={party.manufacturer}
                          salesman={party.salesman}
                          devops={party.devops}
                          disabled={loading}
                          saveState={itemSaveStates[scopeKey] ?? "idle"}
                          onRevenueChange={(next) => {
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

                <div className="grid gap-3 sm:max-w-xs">
                    <AmountField
                      id="abutmentDesignLabFee"
                      label="디자인비+지그제작비"
                      icon={HandCoins}
                      value={settings.abutmentDesignLabFee}
                      onChange={(next) => {
                        applySettingsUpdate((prev) => ({
                          ...prev,
                          abutmentDesignLabFee: next,
                        }));
                        scheduleItemSave("misc:designLabFee", () => ({
                          abutmentDesignLabFee:
                            settingsRef.current.abutmentDesignLabFee,
                        }));
                      }}
                      disabled={loading}
                      help="기공의뢰에 커스텀어벗이 포함되면 수락 기공소가 디자인한 뒤 지급합니다. 1어벗당. 기본 10,000원."
                    />
                </div>

                <div className="space-y-4 rounded-2xl border border-slate-200/70 bg-slate-50/40 p-4">
                  <SubSectionHeader
                    title="환봉어벗"
                    description="1어벗당. 0원이면 가격 별도 고지."
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DualTierAmountField
                      label="생산만"
                      icon={Hexagon}
                      membershipId="membershipRoundBarProductionPrice"
                      regularId="regularRoundBarProductionPrice"
                      membershipValue={
                        settings.membershipRoundBarProductionPrice
                      }
                      regularValue={settings.regularRoundBarProductionPrice}
                      onMembershipChange={(next) => {
                        applySettingsUpdate((prev) => ({
                          ...prev,
                          membershipRoundBarProductionPrice: next,
                        }));
                        scheduleItemSave("roundBar:production", () => ({
                          membershipRoundBarProductionPrice:
                            settingsRef.current.membershipRoundBarProductionPrice,
                          regularRoundBarProductionPrice:
                            settingsRef.current.regularRoundBarProductionPrice,
                        }));
                      }}
                      onRegularChange={(next) => {
                        applySettingsUpdate((prev) => ({
                          ...prev,
                          regularRoundBarProductionPrice: next,
                        }));
                        scheduleItemSave("roundBar:production", () => ({
                          membershipRoundBarProductionPrice:
                            settingsRef.current.membershipRoundBarProductionPrice,
                          regularRoundBarProductionPrice:
                            settingsRef.current.regularRoundBarProductionPrice,
                        }));
                      }}
                      disabled={loading}
                    />
                    <DualTierAmountField
                      label="디자인+생산"
                      icon={Hexagon}
                      membershipId="membershipRoundBarDesignAndProductionPrice"
                      regularId="regularRoundBarDesignAndProductionPrice"
                      membershipValue={
                        settings.membershipRoundBarDesignAndProductionPrice
                      }
                      regularValue={
                        settings.regularRoundBarDesignAndProductionPrice
                      }
                      onMembershipChange={(next) => {
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
                      onRegularChange={(next) => {
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
                      disabled={loading}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="app-glass-card app-glass-card--lg overflow-hidden">
              <CardContent className="space-y-5 p-5 sm:p-6">
                <SectionHeader
                  icon={Search}
                  title="특별 공급가"
                  description="의뢰자를 검색해 추가한 뒤 CNC·환봉 가격을 입력하세요."
                  trailing={
                    <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200/80">
                      {settings.specialRequestorPrices.length}곳
                    </span>
                  }
                />

                <div className="space-y-3">
                  {settings.specialRequestorPrices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-8 text-center">
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 ring-1 ring-slate-200/80">
                        <Search className="h-4 w-4 text-slate-400" />
                      </span>
                      <p className="mt-3 text-sm font-medium text-slate-700">
                        지정된 의뢰자가 없습니다
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        아래에서 검색해 특별 가격을 추가하세요.
                      </p>
                    </div>
                  ) : (
                    settings.specialRequestorPrices.map((item) => {
                      const requestor = requestorById.get(
                        item.requestorAnchorId,
                      );
                      const kindLabel =
                        requestor?.requestorKind === "practice" ||
                        requestor?.requestorKind === "lab"
                          ? REQUESTOR_CAPABILITY_LABEL[requestor.requestorKind]
                          : null;
                      return (
                        <div
                          key={item.requestorAnchorId}
                          className="overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50/80 shadow-sm ring-1 ring-black/[0.02]"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100/90 bg-white/75 px-4 py-3">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-slate-900">
                                {requestor?.name || "삭제된 의뢰자"}
                              </div>
                              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                {[
                                  kindLabel,
                                  requestor?.representativeName
                                    ? `대표 ${requestor.representativeName}`
                                    : "",
                                  requestor?.businessNumber || "",
                                ]
                                  .filter(Boolean)
                                  .join(" · ") || "—"}
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              disabled={loading}
                              aria-label={`${requestor?.name || "의뢰자"} 특별 공급가 삭제`}
                              onClick={() => {
                                applySettingsUpdate((prev) => ({
                                  ...prev,
                                  specialRequestorPrices:
                                    prev.specialRequestorPrices.filter(
                                      (price) =>
                                        price.requestorAnchorId !==
                                        item.requestorAnchorId,
                                    ),
                                }));
                                scheduleSpecialPricesSave(
                                  `special:${item.requestorAnchorId}:remove`,
                                );
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="space-y-4 p-4">
                            <div className="space-y-3">
                              <SubSectionHeader title="CNC어벗" />
                            <RevenueDistributionRow
                              label="CNC 생산"
                              revenueId={`special-cnc-production-${item.requestorAnchorId}`}
                              revenueValue={item.productionPrice}
                              manufacturer={item.productionManufacturerUnitPrice}
                              salesman={item.productionSalesmanUnitPrice}
                              devops={item.productionDevopsUnitPrice}
                              disabled={loading}
                              saveState={
                                itemSaveStates[
                                  `special:${item.requestorAnchorId}:production`
                                ] ?? "idle"
                              }
                              onRevenueChange={(productionPrice) =>
                                updateSpecialPrice(
                                  item.requestorAnchorId,
                                  { productionPrice },
                                  `special:${item.requestorAnchorId}:production`,
                                )
                              }
                            />
                            <RevenueDistributionRow
                              label="CNC D+P"
                              revenueId={`special-cnc-design-${item.requestorAnchorId}`}
                              revenueValue={item.designAndProductionPrice}
                              manufacturer={
                                item.designAndProductionManufacturerUnitPrice
                              }
                              salesman={item.designAndProductionSalesmanUnitPrice}
                              devops={item.designAndProductionDevopsUnitPrice}
                              disabled={loading}
                              saveState={
                                itemSaveStates[
                                  `special:${item.requestorAnchorId}:design`
                                ] ?? "idle"
                              }
                              onRevenueChange={(designAndProductionPrice) =>
                                updateSpecialPrice(
                                  item.requestorAnchorId,
                                  { designAndProductionPrice },
                                  `special:${item.requestorAnchorId}:design`,
                                )
                              }
                            />
                            </div>

                            <div className="space-y-3 rounded-xl border border-slate-200/70 bg-white/70 p-3">
                              <SubSectionHeader
                                title="환봉어벗"
                                description="1어벗당. 0원이면 가격 별도 고지."
                              />
                              <div className="grid gap-2 sm:grid-cols-2">
                              <CompactAmountInput
                                id={`special-round-production-${item.requestorAnchorId}`}
                                label="환봉 생산"
                                value={item.roundBarProductionPrice}
                                disabled={loading}
                                step={AMOUNT_STEP}
                                onChange={(roundBarProductionPrice) =>
                                  updateSpecialPrice(
                                    item.requestorAnchorId,
                                    { roundBarProductionPrice },
                                    `special:${item.requestorAnchorId}:roundProduction`,
                                  )
                                }
                              />
                              <CompactAmountInput
                                id={`special-round-design-${item.requestorAnchorId}`}
                                label="환봉 D+P"
                                value={item.roundBarDesignAndProductionPrice}
                                disabled={loading}
                                step={AMOUNT_STEP}
                                onChange={(roundBarDesignAndProductionPrice) =>
                                  updateSpecialPrice(
                                    item.requestorAnchorId,
                                    { roundBarDesignAndProductionPrice },
                                    `special:${item.requestorAnchorId}:roundDesign`,
                                  )
                                }
                              />
                            </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}

                  <Popover
                    open={requestorPickerOpen}
                    onOpenChange={setRequestorPickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={requestorPickerOpen}
                        disabled={loading}
                        className="h-11 w-full justify-between rounded-xl border-slate-200 bg-white hover:bg-slate-50 sm:max-w-md"
                      >
                        <span className="inline-flex items-center gap-2 text-muted-foreground">
                          <Plus className="h-4 w-4" />
                          의뢰자 검색 후 추가…
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[min(28rem,calc(100vw-2rem))] p-0"
                      align="start"
                    >
                      <Command>
                        <CommandInput placeholder="사업자명·대표자·사업자번호 검색" />
                        <CommandList>
                          <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
                          <CommandGroup>
                            {availableRequestors.map((requestor) => {
                              const meta = [
                                requestor.requestorKind === "practice" ||
                                requestor.requestorKind === "lab"
                                  ? REQUESTOR_CAPABILITY_LABEL[
                                      requestor.requestorKind
                                    ]
                                  : "",
                                requestor.representativeName
                                  ? `대표 ${requestor.representativeName}`
                                  : "",
                                requestor.businessNumber || "",
                              ]
                                .filter(Boolean)
                                .join(" · ");
                              const searchValue = [
                                requestor.name,
                                requestor.representativeName,
                                requestor.businessNumber,
                                requestor.address,
                                requestor.id,
                              ]
                                .filter(Boolean)
                                .join(" ");
                              return (
                                <CommandItem
                                  key={requestor.id}
                                  value={searchValue}
                                  onSelect={() =>
                                    addSpecialRequestor(requestor)
                                  }
                                >
                                  <div className="min-w-0">
                                    <div className="truncate text-sm">
                                      {getRequestorLabel(requestor)}
                                    </div>
                                    {meta ? (
                                      <div className="truncate text-xs text-muted-foreground">
                                        {meta}
                                      </div>
                                    ) : null}
                                  </div>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
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
