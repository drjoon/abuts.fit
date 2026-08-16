// related files:
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - web/backend/controllers/businesses/business.update.controller.js
// - web/backend/services/labAutoMatchParticipation.service.js
// - web/frontend/src/shared/practice/abutsLabCertification.ts
// - web/frontend/src/pages/devops/components/DevopsPlatformFeeTab.tsx
// change-log:
// - 2026-08-16: 인증 신청 → 기공 테스트 → 통과 후 참여. 미신청 안내.
// - 2026-08-15: 구독료 0원이면 결제일 대신 참여 안내 문구.
// - 2026-08-15: 참여 상태 카드 1/2열·가운데 정렬·버튼 우측·상단 여백.
// - 2026-08-15: 참여/해지 버튼 가로 1/3·가운데 정렬.
// - 2026-08-15: 라벨 — 월 구독료 / 구독료 없음 / 작업 완료시 발생(지정 치과 0%).
// - 2026-08-15: 월 참여 0원 정책(이벤트 취소선 제거). 성공 수수료만 안내.
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
import {
  ABUTS_LAB_CERT_STATUS_LABEL,
  type AbutsLabCertificationPublic,
  parseAbutsLabCertification,
} from "@/shared/practice/abutsLabCertification";

type ParticipationData = {
  practiceTransferAutoMatchEnabled?: boolean;
  autoMatchParticipationActive?: boolean;
  autoMatchParticipationCancelAtPeriodEnd?: boolean;
  autoMatchParticipationNextBillingAt?: string | null;
  platformFeeRate?: number;
  autoMatchMonthlyFee?: number;
  verified?: boolean;
  canReceivePracticeTransfer?: boolean;
  abutsLabCertification?: AbutsLabCertificationPublic;
};

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
      const payload = res.data?.data || null;
      if (payload) {
        payload.abutsLabCertification = parseAbutsLabCertification(
          payload.abutsLabCertification,
          {
            enabled: Boolean(
              payload.autoMatchParticipationActive ??
                payload.practiceTransferAutoMatchEnabled,
            ),
          },
        );
      }
      setData(payload);
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
  const successPct = Math.round(Number(data?.platformFeeRate ?? 0.1) * 100);
  const nextBillingLabel = data?.autoMatchParticipationNextBillingAt
    ? formatKstYmdToKo(toKstYmd(data.autoMatchParticipationNextBillingAt) || "")
    : null;
  const canAct =
    Boolean(data?.verified) && Boolean(data?.canReceivePracticeTransfer);
  const cert = parseAbutsLabCertification(data?.abutsLabCertification, {
    enabled: active,
  });
  const certStatus = cert.status;
  const isCertified = certStatus === "certified" || active;
  const canApply = certStatus === "none" || certStatus === "rejected";
  const isPendingReview =
    certStatus === "applied" || certStatus === "testing";

  const statusLabel = active
    ? cancelScheduled
      ? "인증 · 해지 예약"
      : "인증 기공소"
    : isPendingReview
      ? ABUTS_LAB_CERT_STATUS_LABEL[certStatus]
      : certStatus === "rejected"
        ? "반려 · 재신청 가능"
        : isCertified
          ? "인증됨 · 미참여"
          : "미신청";

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
          title: nextActive
            ? isCertified
              ? "참여 실패"
              : "신청 실패"
            : "해지 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
      const next = res.data?.data || {};
      setData((prev) => ({
        ...(prev || {}),
        ...next,
        abutsLabCertification: parseAbutsLabCertification(
          next.abutsLabCertification ?? prev?.abutsLabCertification,
          {
            enabled: Boolean(
              next.autoMatchParticipationActive ??
                next.practiceTransferAutoMatchEnabled,
            ),
          },
        ),
      }));
      toast({
        title:
          res.data?.message ||
          (nextActive
            ? isCertified
              ? "참여했습니다."
              : "인증을 신청했습니다."
            : "해지했습니다."),
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
              어벗츠 인증
            </h3>
            <div className="space-y-1 text-[13px] leading-relaxed text-muted-foreground">
              <p>
                가입 직후에는 미신청 상태입니다. 인증을 신청하면 어벗츠에서 기공
                테스트를 진행하고, 통과 시 인증 기공소로 등록됩니다.
              </p>
              <p>
                인증 기공소는 치과의 자동 매칭 의뢰에 참여할 수 있습니다. 계약
                체결 시 기공비의 {successPct}%는 플랫폼 수수료입니다.
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
                  월 구독료
                </p>
                <p className="text-[12px] leading-snug text-muted-foreground">
                  구독료 없음
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-baseline justify-end gap-x-2 gap-y-0.5">
              <span className="text-xl font-semibold tabular-nums tracking-tight text-slate-900">
                {formatWon(monthlyFee)}
              </span>
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
                  자동 매칭 작업 완료시 발생 (지정 치과는 0%)
                </p>
              </div>
            </div>
            <span className="text-xl font-semibold tabular-nums tracking-tight text-slate-900">
              {successPct}%
            </span>
          </div>
        </div>

        <div className="flex justify-center pt-4">
          <div
            className={cn(
              "w-full overflow-hidden rounded-2xl border bg-white/80 shadow-sm sm:w-1/2",
              active
                ? "border-primary-muted/70"
                : isPendingReview
                  ? "border-amber-200/90"
                  : "border-slate-200/80",
            )}
          >
            <div
              className={cn(
                "h-1 w-full",
                active
                  ? cancelScheduled
                    ? "bg-amber-400"
                    : "bg-primary-strong"
                  : isPendingReview
                    ? "bg-amber-400"
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
                        : isPendingReview
                          ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                          : "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
                    )}
                  >
                    {active
                      ? cancelScheduled
                        ? "해지 예약"
                        : "ON"
                      : ABUTS_LAB_CERT_STATUS_LABEL[certStatus]}
                  </span>
                </div>
                {active ? (
                  <p className="text-[12px] text-muted-foreground">
                    {cancelScheduled
                      ? nextBillingLabel
                        ? `${nextBillingLabel}까지 유지 · 이후 종료`
                        : "해지 예약됨 · 기간 말 이후 종료"
                      : monthlyFee > 0 && nextBillingLabel
                        ? `다음 결제일 ${nextBillingLabel}`
                        : "구독료 없음 · 성공 수수료만 적용"}
                  </p>
                ) : isPendingReview ? (
                  <p className="text-[12px] text-muted-foreground">
                    {certStatus === "testing"
                      ? "어벗츠에서 기공 테스트를 진행 중입니다."
                      : "신청이 접수되었습니다. 기공 테스트 후 인증됩니다."}
                  </p>
                ) : isCertified ? (
                  <p className="text-[12px] text-muted-foreground">
                    인증이 완료되었습니다. 자동 매칭에 다시 참여할 수 있습니다.
                  </p>
                ) : (
                  <p className="text-[12px] text-muted-foreground">
                    인증을 신청하면 기공 테스트 안내를 드립니다.
                  </p>
                )}
              </div>

              {!active && canApply ? (
                <Button
                  type="button"
                  disabled={submitting || !canAct}
                  onClick={() => void submit(true)}
                  className="h-10 shrink-0 rounded-xl px-4"
                >
                  {submitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  인증 신청
                </Button>
              ) : !active && isCertified ? (
                <Button
                  type="button"
                  disabled={submitting || !canAct}
                  onClick={() => void submit(true)}
                  className="h-10 shrink-0 rounded-xl px-4"
                >
                  {submitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  참여하기
                </Button>
              ) : !active && isPendingReview ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled
                  className="h-10 shrink-0 rounded-xl px-4"
                >
                  심사 중
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
              ) : active ? (
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
                    {monthlyFee > 0
                      ? "다음 결제일까지 유지되고, 이후 자동으로 종료됩니다."
                      : "예약된 종료일까지 유지되고, 이후 자동으로 종료됩니다."}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          </div>
        </div>

        {!canAct ? (
          <div className="flex gap-3 rounded-2xl border border-dashed border-amber-200/90 bg-amber-50/50 px-4 py-3.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-[13px] leading-relaxed text-amber-900/80">
              {!data?.verified
                ? "사업자 검증이 완료되면 인증을 신청할 수 있습니다."
                : "기공의뢰 수신이 가능한 기공소만 인증을 신청할 수 있습니다."}
            </p>
          </div>
        ) : canApply ? (
          <div className="flex gap-3 rounded-2xl border border-dashed border-primary-muted/70 bg-primary-soft/25 px-4 py-3.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" />
            <p className="text-[13px] leading-relaxed text-slate-700">
              아직 어벗츠 인증을 신청하지 않았습니다. 「인증 신청」을 누르면
              기공 테스트 일정 안내를 드립니다.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
