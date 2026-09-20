// related files:
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
// - web/backend/controllers/admin/admin.settings.controller.js
// - web/backend/services/creditRevenuePolicy.service.js
// change-log:
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
import { Info, Percent, Truck } from "lucide-react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";

type CreditSettingsPayload = {
  dealershipBaseCommissionRate?: number;
  dealershipEventCommissionRate?: number;
  dealershipEventCommissionEnabled?: boolean;
  dealershipEventStartedAt?: string | Date | null;
  dealershipEventEndedAt?: string | Date | null;
};

type CreditsApiResponse = {
  success?: boolean;
  message?: string;
  data?: {
    creditSettings?: CreditSettingsPayload;
  };
};

const AUTO_SAVE_DELAY_MS = 700;

const toPctString = (rate: number, fallback: number) =>
  String(Math.round((Number.isFinite(rate) ? rate : fallback) * 100));

const toRate = (pct: string, fallback: number) => {
  const n = Number(pct);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(1, Math.round(n) / 100);
};

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

function dateInputToIsoEnd(ymd: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return `${ymd}T00:00:00+09:00`;
}

/** 플랫폼 설정 · 딜러십 영업 수수료. */
export function AdminDealershipSettingsTab({
  className,
}: {
  className?: string;
}) {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(Boolean(token));
  const [basePct, setBasePct] = useState("10");
  const [eventPct, setEventPct] = useState("15");
  const [eventEnabled, setEventEnabled] = useState(true);
  const [startedYmd, setStartedYmd] = useState("");
  const [endedYmd, setEndedYmd] = useState("");
  const hydratedRef = useRef(false);
  const savedSigRef = useRef("");
  const stateRef = useRef({
    basePct: "10",
    eventPct: "15",
    eventEnabled: true,
    startedYmd: "",
    endedYmd: "",
  });
  stateRef.current = {
    basePct,
    eventPct,
    eventEnabled,
    startedYmd,
    endedYmd,
  };

  const buildSig = (s: typeof stateRef.current) =>
    [
      s.basePct,
      s.eventPct,
      String(s.eventEnabled),
      s.startedYmd,
      s.endedYmd,
    ].join("|");

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
        const nextBase = toPctString(
          Number(settings.dealershipBaseCommissionRate),
          0.1,
        );
        const nextEvent = toPctString(
          Number(settings.dealershipEventCommissionRate),
          0.15,
        );
        const nextEnabled = settings.dealershipEventCommissionEnabled !== false;
        const nextStart = toDateInputValue(settings.dealershipEventStartedAt);
        const nextEnd = toDateInputValue(settings.dealershipEventEndedAt);
        setBasePct(nextBase);
        setEventPct(nextEvent);
        setEventEnabled(nextEnabled);
        setStartedYmd(nextStart);
        setEndedYmd(nextEnd);
        savedSigRef.current = buildSig({
          basePct: nextBase,
          eventPct: nextEvent,
          eventEnabled: nextEnabled,
          startedYmd: nextStart,
          endedYmd: nextEnd,
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
        const payload: CreditSettingsPayload = {
          dealershipBaseCommissionRate: toRate(cur.basePct, 0.1),
          dealershipEventCommissionRate: toRate(cur.eventPct, 0.15),
          dealershipEventCommissionEnabled: cur.eventEnabled,
          dealershipEventStartedAt: cur.startedYmd
            ? dateInputToIsoStart(cur.startedYmd)
            : null,
          dealershipEventEndedAt: cur.endedYmd
            ? dateInputToIsoEnd(cur.endedYmd)
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
  }, [
    basePct,
    eventPct,
    eventEnabled,
    startedYmd,
    endedYmd,
    token,
    loading,
    toast,
    queryClient,
  ]);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">딜러십 영업 수수료</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          심플웨이·커스텀어벗 판매가 기준(배송비 제외). 유치(가입) 시점이 이벤트
          창 안이면 이벤트 요율, 아니면 기본 요율입니다.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-200">
              <Percent className="h-4 w-4 text-slate-700" />
            </span>
            <div className="min-w-0">
              <Label
                htmlFor="dealership-base"
                className="text-sm font-semibold text-slate-900"
              >
                기본 요율
              </Label>
              <p className="text-[12px] leading-snug text-muted-foreground">
                이벤트 기간 외 유치 고객
              </p>
            </div>
          </div>
          {loading ? (
            <span className="text-sm text-muted-foreground">…</span>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                id="dealership-base"
                type="number"
                min={0}
                max={100}
                step={1}
                value={basePct}
                onChange={(e) => setBasePct(e.target.value)}
                className="h-11 w-[4.5rem] rounded-xl text-center text-base font-semibold tabular-nums"
              />
              <span className="text-sm font-semibold text-slate-500">%</span>
            </div>
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
                    이벤트 기간 내 유치(가입)한 치과·기공소에 적용됩니다. 종료
                    후에도 해당 고객은 이벤트 요율을 유지합니다.
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-[12px] leading-snug text-muted-foreground">
                이벤트 기간 내 유치 고객
              </p>
            </div>
          </div>
          {loading ? (
            <span className="text-sm text-muted-foreground">…</span>
          ) : (
            <div className="flex items-center gap-3">
              <Switch
                checked={eventEnabled}
                onCheckedChange={setEventEnabled}
                aria-label="이벤트 진행"
              />
              <div className="flex items-center gap-2">
                <Input
                  id="dealership-event"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={eventPct}
                  onChange={(e) => setEventPct(e.target.value)}
                  className="h-11 w-[4.5rem] rounded-xl border-primary-muted/40 bg-white text-center text-base font-semibold tabular-nums shadow-sm"
                />
                <span className="text-sm font-semibold text-slate-500">%</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm">
          <Label
            htmlFor="dealership-start"
            className="text-sm font-semibold text-slate-900"
          >
            이벤트 시작일 (KST)
          </Label>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            비우면 이벤트 on 동안 전원 이벤트 요율
          </p>
          <Input
            id="dealership-start"
            type="date"
            value={startedYmd}
            onChange={(e) => setStartedYmd(e.target.value)}
            disabled={loading}
            className="mt-2 h-10"
          />
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm">
          <Label
            htmlFor="dealership-end"
            className="text-sm font-semibold text-slate-900"
          >
            이벤트 종료일 (KST)
          </Label>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            비우면 진행 중 · off 시 자동 기록
          </p>
          <Input
            id="dealership-end"
            type="date"
            value={endedYmd}
            onChange={(e) => setEndedYmd(e.target.value)}
            disabled={loading}
            className="mt-2 h-10"
          />
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
        <Truck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p>
          배송비는 수신자(치과 또는 기공소) 부담이며 수수료 산정에서 제외됩니다.
          대시보드·정산은 유치 고객별로 이벤트/기본 요율을 구분해 표시합니다.
        </p>
      </div>
    </div>
  );
}
