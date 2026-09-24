// related files:
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
// - web/frontend/src/features/settings/tabs/AdminCreditSettingsTab.tsx
// - web/backend/controllers/admin/admin.settings.controller.js
// - web/backend/services/creditRevenuePolicy.service.js
// change-log:
// - 2026-09-24: 신규 유치 요율(기본 20%) + 예약 인하(15%/10%). 이미 유치한 의뢰자는 스탬프 유지.
// - 2026-09-24: (철회) 월 매출 누진 구간.
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarClock, Percent } from "lucide-react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";
import { kstAddCivilDays, toKstYmd } from "@/shared/date/kst";

type CreditSettingsPayload = {
  dealershipActiveCommissionRate?: number;
  dealershipEventCommissionRate?: number;
  dealershipEventCommissionEnabled?: boolean;
  dealershipRateChangeScheduledAt?: string | Date | null;
  dealershipRateChangeScheduledRate?: number | null;
};

type CreditsApiResponse = {
  success?: boolean;
  message?: string;
  data?: {
    creditSettings?: CreditSettingsPayload;
  };
};

const AUTO_SAVE_DELAY_MS = 700;

/** 신규 유치 요율 선택지(인하 사다리). */
const RATE_PCT_OPTIONS = [20, 15, 10] as const;
type RatePct = (typeof RATE_PCT_OPTIONS)[number];

const snapRatePct = (rate: number, fallback: RatePct = 20): RatePct => {
  const pct = Math.round((Number.isFinite(rate) ? rate : fallback / 100) * 100);
  let best: RatePct = fallback;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const option of RATE_PCT_OPTIONS) {
    const dist = Math.abs(option - pct);
    if (dist < bestDist) {
      bestDist = dist;
      best = option;
    }
  }
  return best;
};

const pctToRate = (pct: number) => pct / 100;

function toDateInputValue(raw?: string | Date | null): string {
  if (!raw) return "";
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function dateInputToIsoStart(ymd: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return `${ymd}T00:00:00+09:00`;
}

function minScheduleYmd(): string {
  const today = toKstYmd(new Date()) || "";
  return kstAddCivilDays(today, 1) || today;
}

function RatePctSelect({
  id,
  value,
  options,
  onChange,
  disabled,
  emphasized,
}: {
  id: string;
  value: RatePct;
  options: readonly RatePct[];
  onChange: (next: RatePct) => void;
  disabled?: boolean;
  emphasized?: boolean;
}) {
  return (
    <div
      id={id}
      role="radiogroup"
      aria-label="수수료 요율"
      className="flex shrink-0 items-center gap-1 rounded-xl bg-slate-100/80 p-1"
    >
      {options.map((pct) => {
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
              "h-9 min-w-[3.25rem] rounded-lg px-2.5 text-sm font-semibold tabular-nums transition-colors",
              selected
                ? emphasized
                  ? "bg-white text-primary-strong shadow-sm ring-1 ring-primary-muted/50"
                  : "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
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

/** 플랫폼 설정 · 딜러십 영업 수수료(유치 시점 고정 + 예약 인하). */
export function AdminDealershipSettingsTab({
  className,
}: {
  className?: string;
}) {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(Boolean(token));
  const [activePct, setActivePct] = useState<RatePct>(20);
  const [scheduleYmd, setScheduleYmd] = useState("");
  const [schedulePct, setSchedulePct] = useState<RatePct>(15);
  const hydratedRef = useRef(false);
  const savedSigRef = useRef("");
  const stateRef = useRef({
    activePct: 20 as RatePct,
    scheduleYmd: "",
    schedulePct: 15 as RatePct,
  });
  stateRef.current = { activePct, scheduleYmd, schedulePct };

  const buildSig = (s: typeof stateRef.current) =>
    [s.activePct, s.scheduleYmd, s.schedulePct].join("|");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!token) {
        if (mounted) setLoading(false);
        return;
      }
      try {
        hydratedRef.current = false;
        const res = await apiFetch<CreditsApiResponse>({
          path: "/api/admin/settings/credits",
          method: "GET",
          token,
          skipCache: true,
        });
        if (!res.ok || !mounted) return;
        const settings = res.data?.data?.creditSettings || {};
        const nextActive = snapRatePct(
          Number(
            settings.dealershipActiveCommissionRate ??
              settings.dealershipEventCommissionRate,
          ),
          20,
        );
        const nextScheduleYmd = toDateInputValue(
          settings.dealershipRateChangeScheduledAt,
        );
        const nextSchedulePct =
          settings.dealershipRateChangeScheduledRate != null
            ? snapRatePct(
                Number(settings.dealershipRateChangeScheduledRate),
                15,
              )
            : 15;
        setActivePct(nextActive);
        setScheduleYmd(nextScheduleYmd);
        setSchedulePct(nextSchedulePct);
        savedSigRef.current = buildSig({
          activePct: nextActive,
          scheduleYmd: nextScheduleYmd,
          schedulePct: nextSchedulePct,
        });
      } catch {
        // silent
      } finally {
        if (mounted) {
          setLoading(false);
          hydratedRef.current = true;
        }
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token || loading || !hydratedRef.current) return;
    const sig = buildSig(stateRef.current);
    if (sig === savedSigRef.current) return;

    const timer = window.setTimeout(async () => {
      try {
        const cur = stateRef.current;
        const hasSchedule = Boolean(cur.scheduleYmd);
        const payload: CreditSettingsPayload = {
          dealershipActiveCommissionRate: pctToRate(cur.activePct),
          dealershipEventCommissionRate: pctToRate(cur.activePct),
          dealershipEventCommissionEnabled: true,
          dealershipRateChangeScheduledAt: hasSchedule
            ? dateInputToIsoStart(cur.scheduleYmd)
            : null,
          dealershipRateChangeScheduledRate: hasSchedule
            ? pctToRate(cur.schedulePct)
            : null,
        };
        const res = await apiFetch<CreditsApiResponse>({
          path: "/api/admin/settings/credits",
          method: "PATCH",
          token,
          jsonBody: payload,
        });
        if (!res.ok) {
          throw new Error(res.data?.message || "저장 실패");
        }
        savedSigRef.current = sig;
        void queryClient.invalidateQueries({ queryKey: ["system-settings"] });
        void queryClient.invalidateQueries({ queryKey: ["credit-settings"] });
      } catch {
        toast({
          title: "저장 실패",
          description: "딜러십 수수료 저장에 실패했습니다.",
          variant: "destructive",
        });
      }
    }, AUTO_SAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [activePct, scheduleYmd, schedulePct, token, loading, toast, queryClient]);

  const scheduleMin = minScheduleYmd();
  const lowerOptions = RATE_PCT_OPTIONS.filter((p) => p < activePct);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          딜러십 영업 수수료
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          심플웨이·커스텀어벗 판매가(기공비·배송 제외).
          <br />
          신규 유치 요율은 지금 설정값. 이미 유치한 의뢰자는 유치 당시 요율을
          유지합니다.
          <br />
          3개월(90일) 무주문으로 소개 귀속이 리셋된 뒤 재유치하면 그 시점
          요율이 새로 적용됩니다.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-muted/60 bg-primary-soft/30 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 ring-1 ring-primary-muted/50">
            <Percent className="h-4 w-4 text-primary-strong" />
          </span>
          <div className="min-w-0">
            <Label className="text-sm font-semibold text-slate-900">
              신규 유치 요율
            </Label>
            <p className="text-[12px] leading-snug text-muted-foreground">
              지금 가입·재귀속하는 의뢰자
            </p>
          </div>
        </div>
        {loading ? (
          <span className="text-sm text-muted-foreground">…</span>
        ) : (
          <RatePctSelect
            id="dealership-active"
            value={activePct}
            options={RATE_PCT_OPTIONS}
            onChange={setActivePct}
            emphasized
          />
        )}
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-200">
              <CalendarClock className="h-4 w-4 text-slate-700" />
            </span>
            <div className="min-w-0">
              <Label
                htmlFor="dealership-rate-schedule"
                className="text-sm font-semibold text-slate-900"
              >
                요율 인하 예약
              </Label>
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                해당일 0시(KST)부터 신규 유치 요율만 변경. 기존 유치 건은
                유지.
              </p>
            </div>
          </div>
          {!loading && scheduleYmd ? (
            <button
              type="button"
              className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
              onClick={() => setScheduleYmd("")}
            >
              예약 해제
            </button>
          ) : null}
        </div>
        {loading ? (
          <p className="mt-3 text-sm text-muted-foreground">…</p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Input
              id="dealership-rate-schedule"
              type="date"
              min={scheduleMin}
              value={scheduleYmd}
              onChange={(e) => setScheduleYmd(e.target.value)}
              className="h-10 max-w-[11rem]"
            />
            <RatePctSelect
              id="dealership-rate-schedule-pct"
              value={schedulePct}
              options={
                lowerOptions.length
                  ? (lowerOptions as unknown as readonly RatePct[])
                  : RATE_PCT_OPTIONS
              }
              onChange={setSchedulePct}
              disabled={!scheduleYmd}
            />
          </div>
        )}
      </div>
    </div>
  );
}
