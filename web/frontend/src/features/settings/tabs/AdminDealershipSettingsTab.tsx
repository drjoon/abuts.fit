// related files:
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
// - web/backend/controllers/admin/admin.settings.controller.js
// - web/backend/services/creditRevenuePolicy.service.js
// change-log:
// - 2026-09-23: 적용 범위 카피 — 스토어·커스텀어벗(기공비·배송 제외). 분배 딜러%와 이벤트 요율 동기화.
// - 2026-09-23: 플랫폼「분배비율」탭에 편입(독립 딜러십 탭 제거).
// - 2026-09-20: 기본 10% 고정 · 이벤트 15/20% · 시작/종료일 제거 · 요율 변경 예약.
// - 2026-09-20: 요율 10/15/20% 선택식. 유치 시점 요율 안내 카피.
// - 2026-09-20: 자동 저장 PATCH를 jsonBody로 수정(body 객체는 JSON 미전송 → 저장 실패).
// - 2026-09-20: 유치 시점별 요율 — 이벤트 시작/종료일 + 기본/이벤트 %.
// - 2026-09-20: 딜러십 영업 수수료 — 기본 10% · 이벤트 15%(on/off). 자동 저장.
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CalendarClock, Info, Percent } from "lucide-react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";
import { kstAddCivilDays, toKstYmd } from "@/shared/date/kst";

type CreditSettingsPayload = {
  dealershipBaseCommissionRate?: number;
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

const BASE_PCT = 10 as const;
/** 이벤트 요율 선택지. */
const EVENT_RATE_PCT_OPTIONS = [15, 20] as const;
type EventRatePct = (typeof EVENT_RATE_PCT_OPTIONS)[number];
/** 요율 변경 예약 선택지(기본 포함). */
const SCHEDULED_RATE_PCT_OPTIONS = [10, 15, 20] as const;
type ScheduledRatePct = (typeof SCHEDULED_RATE_PCT_OPTIONS)[number];

const snapEventPct = (rate: number, fallback: EventRatePct = 20): EventRatePct => {
  const pct = Math.round((Number.isFinite(rate) ? rate : fallback / 100) * 100);
  let best: EventRatePct = fallback;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const option of EVENT_RATE_PCT_OPTIONS) {
    const dist = Math.abs(option - pct);
    if (dist < bestDist) {
      bestDist = dist;
      best = option;
    }
  }
  return best;
};

const snapScheduledPct = (
  rate: number,
  fallback: ScheduledRatePct = 15,
): ScheduledRatePct => {
  const pct = Math.round((Number.isFinite(rate) ? rate : fallback / 100) * 100);
  let best: ScheduledRatePct = fallback;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const option of SCHEDULED_RATE_PCT_OPTIONS) {
    const dist = Math.abs(option - pct);
    if (dist < bestDist) {
      bestDist = dist;
      best = option;
    }
  }
  return best;
};

const pctToRate = (pct: number) => pct / 100;

/** KST calendar date → input[type=date] value */
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

function RatePctSelect<T extends number>({
  id,
  value,
  options,
  onChange,
  disabled,
  emphasized,
}: {
  id: string;
  value: T;
  options: readonly T[];
  onChange: (next: T) => void;
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

/** 플랫폼 설정 · 딜러십 영업 수수료. */
export function AdminDealershipSettingsTab({
  className,
  onActiveDealerPctChange,
}: {
  className?: string;
  /** 분배 비율 딜러%와 동기화(이벤트 on→이벤트 요율, off→기본 10%). */
  onActiveDealerPctChange?: (pct: number) => void;
}) {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(Boolean(token));
  const [eventPct, setEventPct] = useState<EventRatePct>(20);
  const [eventEnabled, setEventEnabled] = useState(true);
  const [scheduleYmd, setScheduleYmd] = useState("");
  const [schedulePct, setSchedulePct] = useState<ScheduledRatePct>(15);
  const hydratedRef = useRef(false);
  const savedSigRef = useRef("");
  const onActiveDealerPctChangeRef = useRef(onActiveDealerPctChange);
  onActiveDealerPctChangeRef.current = onActiveDealerPctChange;
  const stateRef = useRef({
    eventPct: 20 as EventRatePct,
    eventEnabled: true,
    scheduleYmd: "",
    schedulePct: 15 as ScheduledRatePct,
  });
  stateRef.current = {
    eventPct,
    eventEnabled,
    scheduleYmd,
    schedulePct,
  };

  const buildSig = (s: typeof stateRef.current) =>
    [s.eventPct, String(s.eventEnabled), s.scheduleYmd, s.schedulePct].join(
      "|",
    );

  const emitActiveDealerPct = (enabled: boolean, pct: number) => {
    onActiveDealerPctChangeRef.current?.(enabled ? pct : BASE_PCT);
  };

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
        const nextEvent = snapEventPct(
          Number(settings.dealershipEventCommissionRate),
          20,
        );
        const nextEnabled = settings.dealershipEventCommissionEnabled !== false;
        const nextScheduleYmd = toDateInputValue(
          settings.dealershipRateChangeScheduledAt,
        );
        const nextSchedulePct =
          settings.dealershipRateChangeScheduledRate != null
            ? snapScheduledPct(
                Number(settings.dealershipRateChangeScheduledRate),
                15,
              )
            : 15;
        setEventPct(nextEvent);
        setEventEnabled(nextEnabled);
        setScheduleYmd(nextScheduleYmd);
        setSchedulePct(nextSchedulePct);
        savedSigRef.current = buildSig({
          eventPct: nextEvent,
          eventEnabled: nextEnabled,
          scheduleYmd: nextScheduleYmd,
          schedulePct: nextSchedulePct,
        });
        // 초기 로드는 부모 분배%를 덮어쓰지 않음. 저장 후에만 동기화.
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
          dealershipBaseCommissionRate: pctToRate(BASE_PCT),
          dealershipEventCommissionRate: pctToRate(cur.eventPct),
          dealershipEventCommissionEnabled: cur.eventEnabled,
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
        emitActiveDealerPct(cur.eventEnabled, cur.eventPct);
      } catch {
        toast({
          title: "저장 실패",
          description: "딜러십 수수료 저장에 실패했습니다.",
          variant: "destructive",
        });
      }
    }, AUTO_SAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [
    eventPct,
    eventEnabled,
    scheduleYmd,
    schedulePct,
    token,
    loading,
    toast,
    queryClient,
  ]);

  const scheduleMin = minScheduleYmd();

  return (
    <div className={cn("space-y-4", className)}>
      <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">딜러십 영업 수수료</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          스토어·커스텀어벗 판매가 기준(기공비·배송 제외).
          <br />
          기본 10% · 이벤트 15%/20%. 유치 당시 요율을 따릅니다.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-200">
              <Percent className="h-4 w-4 text-slate-700" />
            </span>
            <div className="min-w-0">
              <Label className="text-sm font-semibold text-slate-900">
                기본 요율
              </Label>
              <p className="text-[12px] leading-snug text-muted-foreground">
                이벤트 종료 후
              </p>
            </div>
          </div>
          {loading ? (
            <span className="text-sm text-muted-foreground">…</span>
          ) : (
            <span className="text-sm font-semibold tabular-nums text-slate-900">
              {BASE_PCT}%
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-muted/60 bg-primary-soft/30 px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 ring-1 ring-primary-muted/50">
              <Percent className="h-4 w-4 text-primary-strong" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Label
                  htmlFor="dealership-event"
                  className="text-sm font-semibold text-slate-900"
                >
                  이벤트 요율
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex text-slate-400 transition-colors hover:text-slate-600"
                      aria-label="이벤트 요율 안내"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    이벤트 중 유치한 고객에 적용됩니다. 종료 후에도 유지됩니다.
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-[12px] leading-snug text-muted-foreground">
                현재 유치 요율
              </p>
            </div>
          </div>
          {loading ? (
            <span className="text-sm text-muted-foreground">…</span>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Switch
                checked={eventEnabled}
                onCheckedChange={setEventEnabled}
                aria-label="이벤트 진행"
              />
              <RatePctSelect
                id="dealership-event"
                value={eventPct}
                options={EVENT_RATE_PCT_OPTIONS}
                onChange={setEventPct}
                emphasized
              />
            </div>
          )}
        </div>
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
                요율 변경 예약
              </Label>
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                해당일 0시(KST)부터 적용. 비우면 예약 없음.
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
              options={SCHEDULED_RATE_PCT_OPTIONS}
              onChange={setSchedulePct}
              disabled={!scheduleYmd}
            />
          </div>
        )}
      </div>
    </div>
  );
}
