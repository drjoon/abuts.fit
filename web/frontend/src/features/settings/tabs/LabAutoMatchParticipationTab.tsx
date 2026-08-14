// related files:
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - web/backend/controllers/businesses/business.update.controller.js
// - web/backend/services/labAutoMatchParticipation.service.js
// - web/frontend/src/pages/devops/components/DevopsPlatformFeeTab.tsx
// change-log:
// - 2026-08-14: 기공소 매칭/수수료 스트립 최신 스타일 정렬.
// - 2026-08-14: 월 참여 수수료 이벤트 표시(정가 취소선 → 0원).
// - 2026-08-14: 기공소 자동 매칭 월 참여 탭. 치과 등록·소개 UI 대체.
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CalendarDays,
  FlaskConical,
  Info,
  Loader2,
  Percent,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { SettingsCardSkeleton } from "@/features/components/SettingsSkeletons";
import { formatKstYmdToKo, toKstYmd } from "@/shared/date/kst";
import { cn } from "@/shared/ui/cn";

type ParticipationData = {
  practiceTransferAutoMatchEnabled?: boolean;
  autoMatchParticipationActive?: boolean;
  autoMatchParticipationCancelAtPeriodEnd?: boolean;
  autoMatchParticipationNextBillingAt?: string | null;
  platformFeeRate?: number;
  autoMatchMonthlyFee?: number;
  verified?: boolean;
  canReceivePracticeTransfer?: boolean;
};

/** 안내용 정가. 실제 청구는 `autoMatchMonthlyFee`(이벤트 중 0원). */
const AUTO_MATCH_MONTHLY_FEE_LIST = 55_000;

const formatWon = (value: number) =>
  `${Math.max(0, Math.round(value || 0)).toLocaleString("ko-KR")}원`;

export const LabAutoMatchParticipationTab = () => {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<ParticipationData | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await request<{
        success?: boolean;
        message?: string;
        data?: ParticipationData;
      }>({
        path: "/api/businesses/me/auto-match-participation",
        method: "GET",
        token,
      });
      if (!res.ok) {
        toast({
          title: "조회 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
      setData(res.data?.data || null);
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = Boolean(
    data?.autoMatchParticipationActive ?? data?.practiceTransferAutoMatchEnabled,
  );
  const cancelScheduled =
    active && Boolean(data?.autoMatchParticipationCancelAtPeriodEnd);
  const monthlyFee = Math.max(0, Number(data?.autoMatchMonthlyFee) || 0);
  const monthlyFeePromo = monthlyFee < AUTO_MATCH_MONTHLY_FEE_LIST;
  const successPct = Math.round(Number(data?.platformFeeRate ?? 0.1) * 100);
  const nextBillingLabel = data?.autoMatchParticipationNextBillingAt
    ? formatKstYmdToKo(toKstYmd(data.autoMatchParticipationNextBillingAt) || "")
    : null;
  const canJoin =
    Boolean(data?.verified) && Boolean(data?.canReceivePracticeTransfer);

  const statusLabel = active
    ? cancelScheduled
      ? "참여 중 · 해지 예약"
      : "참여 중"
    : "미참여";

  const submit = async (nextActive: boolean) => {
    if (!token || submitting) return;
    setSubmitting(true);
    try {
      const res = await request<{
        success?: boolean;
        message?: string;
        data?: ParticipationData;
      }>({
        path: "/api/businesses/me/auto-match-participation",
        method: "POST",
        token,
        jsonBody: { active: nextActive },
      });
      if (!res.ok) {
        toast({
          title: nextActive ? "참여 실패" : "해지 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
      setData((prev) => ({ ...(prev || {}), ...(res.data?.data || {}) }));
      toast({
        title:
          res.data?.message || (nextActive ? "참여했습니다." : "해지했습니다."),
        duration: 2500,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <SettingsCardSkeleton />;
  }

  return (
    <Card className="app-glass-card app-glass-card--lg overflow-hidden">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft/60 ring-1 ring-primary-muted/70">
            <FlaskConical className="h-5 w-5 text-primary-strong" />
          </span>
          <div className="min-w-0 space-y-1">
            <h3 className="text-base font-semibold tracking-tight text-slate-900">
              자동 매칭 참여
            </h3>
            <div className="space-y-1 text-[13px] leading-relaxed text-muted-foreground">
              <p>
                매칭 참여 구독하시면 인증 기공소가 되어 치과의 자동 매칭 의뢰에
                참여할 수 있습니다.
              </p>
              <p>
                계약 체결 시 기공비의 {successPct}%는 플랫폼 수수료입니다.
              </p>
              <p>
                단, 자동 매칭이 아닌 지정 의뢰(치과에서 기공소를 직접 입력)는
                플랫폼 수수료 면제입니다.
              </p>
              <p>치과·기공소 식별 정보는 비공개입니다.</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-muted/60 bg-primary-soft/30 px-4 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 ring-1 ring-primary-muted/50">
                <CalendarDays className="h-4 w-4 text-primary-strong" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  월 참여 수수료
                </p>
                <p className="text-[12px] leading-snug text-muted-foreground">
                  매칭 참여 구독료
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-baseline justify-end gap-x-2 gap-y-0.5">
              {monthlyFeePromo ? (
                <span className="text-sm font-normal tabular-nums text-slate-400 line-through">
                  {formatWon(AUTO_MATCH_MONTHLY_FEE_LIST)}
                </span>
              ) : null}
              <span className="text-xl font-semibold tabular-nums tracking-tight text-slate-900">
                {formatWon(monthlyFee)}
              </span>
              {monthlyFeePromo ? (
                <span className="inline-flex items-center rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-primary-strong ring-1 ring-primary-muted">
                  이벤트 중
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-muted/60 bg-primary-soft/30 px-4 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 ring-1 ring-primary-muted/50">
                <Percent className="h-4 w-4 text-primary-strong" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">성공 수수료</p>
                <p className="text-[12px] leading-snug text-muted-foreground">
                  자동 매칭 성공 시 · 지정 0%
                </p>
              </div>
            </div>
            <span className="text-xl font-semibold tabular-nums tracking-tight text-slate-900">
              {successPct}%
            </span>
          </div>
        </div>

        <div
          className={cn(
            "overflow-hidden rounded-2xl border bg-white/80 shadow-sm",
            active ? "border-primary-muted/70" : "border-slate-200/80",
          )}
        >
          <div
            className={cn(
              "h-1 w-full",
              active
                ? cancelScheduled
                  ? "bg-amber-400"
                  : "bg-primary-strong"
                : "bg-slate-300",
            )}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  {statusLabel}
                </p>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    active
                      ? cancelScheduled
                        ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                        : "bg-primary-soft text-primary-strong ring-1 ring-primary-muted"
                      : "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
                  )}
                >
                  {active ? (cancelScheduled ? "해지 예약" : "ON") : "OFF"}
                </span>
              </div>
              {active && nextBillingLabel ? (
                <p className="text-[12px] text-muted-foreground">
                  {cancelScheduled
                    ? `${nextBillingLabel}까지 유지 · 이후 종료`
                    : `다음 결제일 ${nextBillingLabel}`}
                </p>
              ) : (
                <p className="text-[12px] text-muted-foreground">
                  인증 기공소만 참여할 수 있습니다.
                </p>
              )}
            </div>

            {!active ? (
              <Button
                type="button"
                disabled={submitting || !canJoin}
                onClick={() => void submit(true)}
                className="h-10 shrink-0 rounded-xl px-4"
              >
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                참여하기
              </Button>
            ) : cancelScheduled ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={submitting}
                    onClick={() => void submit(true)}
                    className="h-10 shrink-0 rounded-xl px-4"
                  >
                    {submitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    해지 취소
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  해지 예약을 취소하고 계속 참여합니다.
                </TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={submitting}
                    onClick={() => void submit(false)}
                    className="h-10 shrink-0 rounded-xl px-4"
                  >
                    {submitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    해지 예약
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  다음 결제일까지 유지되고, 이후 자동으로 종료됩니다.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {!canJoin ? (
          <div className="flex gap-3 rounded-2xl border border-dashed border-amber-200/90 bg-amber-50/50 px-4 py-3.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-[13px] leading-relaxed text-amber-900/80">
              {!data?.verified
                ? "사업자 검증이 완료되면 참여할 수 있습니다."
                : "기공의뢰 수신이 가능한 기공소만 참여할 수 있습니다."}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
