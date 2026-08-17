// change-log:
// - 2026-08-17: 파트너 수익분배 탭 — 재원 공식·섹터 비율·세금 설정 안내.
// related files:
// - web/frontend/src/pages/admin/partners/AdminPartnersPage.tsx
// - web/frontend/src/pages/admin/partners/partnerShare.ts
// - web/frontend/src/pages/admin/partners/PartnerShareContext.tsx
// - web/frontend/src/pages/admin/partners/SectorShareTab.tsx
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CircleHelp,
  Landmark,
  Minus,
  PieChart,
  Scale,
  Wallet,
} from "lucide-react";
import { usePartnerShare } from "./PartnerShareContext";
import {
  SECTOR_KEYS,
  SECTOR_META,
  formatPercent,
  formatWon,
  remainingRates,
  sectorPoolAmount,
  sumRates,
  type SectorKey,
} from "./partnerShare";

function FieldHelp({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:text-slate-600"
          aria-label="도움말"
        >
          <CircleHelp className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-left leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
  trailing,
}: {
  icon: typeof PieChart;
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

function PercentField({
  id,
  sectorKey,
  value,
  onChange,
}: {
  id: string;
  sectorKey: SectorKey;
  value: number;
  onChange: (next: number) => void;
}) {
  const meta = SECTOR_META[sectorKey];
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.barClass}`}
        />
        <Label htmlFor={id} className="text-sm font-medium text-slate-800">
          {meta.label}
        </Label>
      </div>
      <div className="relative">
        <Input
          id={id}
          type="number"
          min="0"
          max="100"
          step="0.1"
          className="h-11 rounded-xl border-slate-200 bg-slate-50/60 pr-10 text-right text-base font-semibold tabular-nums tracking-tight"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
          %
        </span>
      </div>
    </div>
  );
}

export function RevenueShareTab() {
  const { state, setRate, setPreviewPool } = usePartnerShare();
  const used = sumRates(state.rates);
  const remain = remainingRates(state.rates);
  const overflow = used > 100;

  return (
    <div className="space-y-5">
      <Card className="app-glass-card app-glass-card--lg overflow-hidden">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <SectionHeader
            icon={Scale}
            title="분배 재원"
            description="어벗츠 매출에서 제조사 생산비(배송비 포함)를 뺀 금액을 사업부·파트너에 나눕니다."
          />
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-3.5 text-sm">
            <span className="rounded-full bg-white px-3 py-1 font-medium text-slate-800 ring-1 ring-slate-200">
              어벗츠 매출
            </span>
            <Minus className="h-4 w-4 text-slate-400" />
            <span className="rounded-full bg-white px-3 py-1 font-medium text-slate-800 ring-1 ring-slate-200">
              제조사 생산비
              <span className="ml-1 text-[12px] font-normal text-muted-foreground">
                배송비 포함
              </span>
            </span>
            <span className="text-slate-400">=</span>
            <span className="rounded-full bg-primary-soft px-3 py-1 font-semibold text-primary-strong ring-1 ring-primary-muted/70">
              분배 재원
            </span>
          </div>
          <div className="max-w-sm">
            <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 ring-1 ring-slate-200/80">
                  <Wallet className="h-4 w-4 text-slate-600" />
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <Label
                    htmlFor="previewPool"
                    className="text-sm font-medium text-slate-800"
                  >
                    미리보기 재원
                  </Label>
                  <FieldHelp text="실제 지급 시에는 어벗츠 매출 − 제조사 생산비(배송비 포함)로 산출됩니다. 지금은 금액 흐름을 확인하기 위한 미리보기입니다." />
                </div>
              </div>
              <div className="relative">
                <Input
                  id="previewPool"
                  type="number"
                  min="0"
                  step="1000"
                  className="h-11 rounded-xl border-slate-200 bg-slate-50/60 pr-10 text-right text-base font-semibold tabular-nums tracking-tight"
                  value={state.previewPool}
                  onChange={(event) =>
                    setPreviewPool(Number(event.target.value))
                  }
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                  원
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="app-glass-card app-glass-card--lg overflow-hidden">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <SectionHeader
            icon={PieChart}
            title="수익 분배비"
            description="분배 재원을 100%로 보고 각 섹터 비율을 지정합니다."
            trailing={
              <div
                className={`rounded-full px-3 py-1 text-[12px] font-semibold tabular-nums ring-1 ${
                  overflow
                    ? "bg-destructive-soft text-destructive ring-destructive/30"
                    : "bg-slate-100 text-slate-600 ring-slate-200"
                }`}
              >
                합계 {formatPercent(used)}
                {overflow ? " · 100% 초과" : ` · 잔여 ${formatPercent(Math.max(0, remain))}`}
              </div>
            }
          />

          <div className="h-3 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/80">
            <div className="flex h-full w-full">
              {SECTOR_KEYS.map((key) => {
                const pct = Math.max(0, state.rates[key]);
                if (pct <= 0) return null;
                return (
                  <div
                    key={key}
                    className={SECTOR_META[key].barClass}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                    title={`${SECTOR_META[key].label} ${formatPercent(pct)}`}
                  />
                );
              })}
              {remain > 0 ? (
                <div
                  className="bg-slate-200"
                  style={{ width: `${remain}%` }}
                  title={`잔여 ${formatPercent(remain)}`}
                />
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {SECTOR_KEYS.map((key) => (
              <PercentField
                key={key}
                id={`share-rate-${key}`}
                sectorKey={key}
                value={state.rates[key]}
                onChange={(next) => setRate(key, next)}
              />
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {SECTOR_KEYS.map((key) => {
              const amount = sectorPoolAmount(
                state.previewPool,
                state.rates[key],
              );
              return (
                <div
                  key={`${key}-amount`}
                  className="flex items-center justify-between rounded-xl bg-slate-50/80 px-3.5 py-2.5 ring-1 ring-slate-200/70"
                >
                  <span className="inline-flex items-center gap-2 text-[13px] text-slate-600">
                    <span
                      className={`h-2 w-2 rounded-full ${SECTOR_META[key].barClass}`}
                    />
                    {SECTOR_META[key].label}
                    <span className="tabular-nums text-slate-400">
                      {formatPercent(state.rates[key])}
                    </span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-slate-900">
                    {formatWon(amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="app-glass-card app-glass-card--lg overflow-hidden">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <SectionHeader
            icon={Landmark}
            title="세금 설정"
            description="실지급은 세법에 따른 원천징수 후 금액입니다."
          />
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-5">
            <p className="text-sm font-medium text-slate-800">
              세금 설정은 이후 추가됩니다.
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              지금은 비워 둡니다. 원천징수 세율·공제 항목을 여기서 지정하면, 각
              사업부·파트너 탭의 실지급이 세후 금액으로 계산됩니다.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
