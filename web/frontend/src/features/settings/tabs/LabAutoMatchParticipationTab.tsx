// related files:
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - web/backend/controllers/businesses/business.update.controller.js
// - web/backend/services/labAutoMatchParticipation.service.js
// - web/frontend/src/shared/practice/abutsLabCertification.ts
// - web/frontend/src/pages/devops/components/DevopsPlatformFeeTab.tsx
// change-log:
// - 2026-08-16: 수수료 문구·지정 ~~요율~~ 0% · 인증 상태 라벨 SSOT.
// - 2026-08-16: 지정 거래 수수료 — 적용 off면 무료(별도 공지 시까지) 안내.
// - 2026-08-16: 매칭 10% / 지정 5% 성공 수수료 표시.
// - 2026-08-16: 문구 정리 · 3단계 진행 · 인증 테스트 신청 · 인증 뱃지.
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
  BadgeCheck,
  Check,
  FlaskConical,
  Info,
  Loader2,
  Percent,
  Star,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { SettingsCardSkeleton } from "@/features/components/SettingsSkeletons";
import { formatKstYmdToKo, toKstYmd } from "@/shared/date/kst";
import { cn } from "@/shared/ui/cn";
import {
  type AbutsLabCertificationPublic,
  type AbutsLabCertStatus,
  ABUTS_LAB_CERT_STATUS_LABEL,
  parseAbutsLabCertification,
} from "@/shared/practice/abutsLabCertification";
import {
  AUTO_MATCH_RATING_COUNT_GRACE,
  DEFAULT_EFFECTIVE_LAB_STARS,
  parseLabRatingSummary,
  type LabRatingSummary,
} from "@/shared/practice/practiceLabRating";

type ParticipationData = {
  practiceTransferAutoMatchEnabled?: boolean;
  autoMatchParticipationActive?: boolean;
  autoMatchParticipationCancelAtPeriodEnd?: boolean;
  autoMatchParticipationNextBillingAt?: string | null;
  platformFeeRate?: number;
  directPlatformFeeEnabled?: boolean;
  directPlatformFeeRate?: number;
  autoMatchMonthlyFee?: number;
  verified?: boolean;
  canReceivePracticeTransfer?: boolean;
  abutsLabCertification?: AbutsLabCertificationPublic;
  labRatingSummary?: LabRatingSummary | null;
};

const CERT_STEPS = [
  { id: "apply", label: "신청중" },
  { id: "test", label: "테스트중" },
  { id: "cert", label: "인증" },
] as const;

function resolveCertStepIndex(status: AbutsLabCertStatus): number {
  if (status === "certified") return 2;
  if (status === "testing") return 1;
  if (status === "applied") return 1;
  if (status === "rejected") return 0;
  return 0;
}

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
        );
        payload.labRatingSummary = parseLabRatingSummary(
          payload.labRatingSummary,
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
  const matchPct = Math.round(Number(data?.platformFeeRate ?? 0.1) * 100);
  const directFeeEnabled = data?.directPlatformFeeEnabled === true;
  const directPct = Math.round(
    Number(data?.directPlatformFeeRate ?? 0.05) * 100,
  );
  const nextBillingLabel = data?.autoMatchParticipationNextBillingAt
    ? formatKstYmdToKo(toKstYmd(data.autoMatchParticipationNextBillingAt) || "")
    : null;
  const canAct =
    Boolean(data?.verified) && Boolean(data?.canReceivePracticeTransfer);
  const cert = parseAbutsLabCertification(data?.abutsLabCertification);
  const certStatus = cert.status;
  // 레거시 풀 ON만 있고 status 없으면 인증 완료로 표시(참여 UI 유지).
  const isCertified = certStatus === "certified" || active;
  const canApply =
    !active && (certStatus === "none" || certStatus === "rejected");
  const isPendingReview =
    certStatus === "applied" || certStatus === "testing";
  const stepIndex = isCertified
    ? 2
    : resolveCertStepIndex(certStatus);

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
        ),
      }));
      toast({
        title:
          res.data?.message ||
          (nextActive
            ? isCertified
              ? "참여했습니다."
              : "인증 테스트를 신청했습니다."
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
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold tracking-tight text-slate-900">
                어벗츠 인증
              </h3>
              {isCertified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-semibold text-primary-strong ring-1 ring-primary-muted">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  인증 기공소
                </span>
              ) : null}
            </div>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              신청 → 기공 테스트 → 통과 시 인증. 인증·별점 2점 이상만 매칭에
              참여합니다.
            </p>
            <p className="text-[12px] leading-relaxed text-muted-foreground/90">
              매칭 거래 {matchPct}%
              <span className="text-muted-foreground/80">
                (식별 정보 비공개)
              </span>
              {" · 지정 거래 "}
              {directFeeEnabled ? (
                `${directPct}%`
              ) : (
                <>
                  <span className="line-through opacity-60">{directPct}%</span>{" "}
                  0%
                </>
              )}
            </p>
          </div>
        </div>

        {(() => {
          const summary = parseLabRatingSummary(data?.labRatingSummary);
          const displayStars =
            summary.ratingCount > AUTO_MATCH_RATING_COUNT_GRACE &&
            summary.stars != null
              ? summary.stars
              : DEFAULT_EFFECTIVE_LAB_STARS;
          const starsLabel =
            Number.isFinite(displayStars) && displayStars % 1 !== 0
              ? displayStars.toFixed(1)
              : String(Math.round(displayStars * 10) / 10);
          return (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-amber-50/80 to-white px-4 py-3.5 sm:px-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100/80 text-amber-600 ring-1 ring-amber-200/80">
                <Star className="h-5 w-5 fill-current" />
              </span>
              <div className="min-w-0 space-y-0.5">
                <p className="text-[13px] font-semibold text-slate-900">
                  내 별점 {starsLabel}
                  <span className="ml-1.5 text-[12px] font-normal text-slate-500">
                    (평가 {summary.ratingCount}회)
                  </span>
                </p>
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  {summary.ratingCount <= AUTO_MATCH_RATING_COUNT_GRACE
                    ? `평가 ${AUTO_MATCH_RATING_COUNT_GRACE + 1}회부터 실제 평균이 적용됩니다. 현재는 ${DEFAULT_EFFECTIVE_LAB_STARS}점.`
                    : "치과 정보는 비공개입니다."}
                </p>
              </div>
            </div>
          );
        })()}

        <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4 sm:px-5">
          <p className="mb-3 text-[12px] font-semibold tracking-wide text-slate-500">
            인증 진행
          </p>
          <ol className="flex items-start justify-between gap-1">
            {CERT_STEPS.map((step, index) => {
              const done = index < stepIndex || (isCertified && index <= stepIndex);
              const current = !isCertified && index === stepIndex;
              const rejectedHere =
                certStatus === "rejected" && index === 0 && !isCertified;
              return (
                <li
                  key={step.id}
                  className="relative flex min-w-0 flex-1 flex-col items-center gap-2"
                >
                  {index < CERT_STEPS.length - 1 ? (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute left-[calc(50%+14px)] right-[calc(-50%+14px)] top-[15px] h-0.5",
                        index < stepIndex || isCertified
                          ? "bg-primary-strong"
                          : "bg-slate-200",
                      )}
                    />
                  ) : null}
                  <span
                    className={cn(
                      "relative z-[1] flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-semibold ring-2",
                      done || isCertified
                        ? "bg-primary-strong text-white ring-primary-strong"
                        : current
                          ? rejectedHere
                            ? "bg-amber-50 text-amber-800 ring-amber-300"
                            : "bg-primary-soft text-primary-strong ring-primary-muted"
                          : "bg-slate-50 text-slate-400 ring-slate-200",
                    )}
                  >
                    {done || isCertified ? (
                      <Check className="h-4 w-4" strokeWidth={2.5} />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-center text-[12px] font-medium",
                      done || isCertified || current
                        ? "text-slate-900"
                        : "text-slate-400",
                    )}
                  >
                    {step.label}
                    {current && certStatus === "applied" ? (
                      <span className="mt-0.5 block text-[10px] font-normal text-amber-700">
                        신청중
                      </span>
                    ) : null}
                    {current && certStatus === "testing" ? (
                      <span className="mt-0.5 block text-[10px] font-normal text-amber-700">
                        테스트중
                      </span>
                    ) : null}
                    {rejectedHere ? (
                      <span className="mt-0.5 block text-[10px] font-normal text-rose-700">
                        인증보류
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-muted/60 bg-primary-soft/30 px-4 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 ring-1 ring-primary-muted/50">
                <Percent className="h-4 w-4 text-primary-strong" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">매칭 거래</p>
                <p className="text-[12px] leading-snug text-muted-foreground">
                  성공 수수료
                </p>
              </div>
            </div>
            <span className="text-xl font-semibold tabular-nums tracking-tight text-slate-900">
              {matchPct}%
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-muted/60 bg-primary-soft/30 px-4 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 ring-1 ring-primary-muted/50">
                <Percent className="h-4 w-4 text-primary-strong" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">지정 거래</p>
                <p className="text-[12px] leading-snug text-muted-foreground">
                  {directFeeEnabled
                    ? "성공 수수료"
                    : "별도 공지가 있을 때까지 무료"}
                </p>
              </div>
            </div>
            <span className="flex items-baseline gap-1.5 text-xl font-semibold tabular-nums tracking-tight text-slate-900">
              {directFeeEnabled ? (
                `${directPct}%`
              ) : (
                <>
                  <span className="text-base line-through opacity-50">
                    {directPct}%
                  </span>
                  0%
                </>
              )}
            </span>
          </div>
        </div>

        <div className="flex justify-center pt-1">
          <div
            className={cn(
              "w-full overflow-hidden rounded-2xl border bg-white/80 shadow-sm sm:w-1/2",
              isCertified
                ? "border-primary-muted/70"
                : isPendingReview
                  ? "border-amber-200/90"
                  : "border-slate-200/80",
            )}
          >
            <div
              className={cn(
                "h-1 w-full",
                isCertified
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
                    {isCertified
                      ? cancelScheduled
                        ? "인증 · 해지 예약"
                        : ABUTS_LAB_CERT_STATUS_LABEL.certified
                      : ABUTS_LAB_CERT_STATUS_LABEL[certStatus]}
                  </p>
                  {isCertified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary-strong ring-1 ring-primary-muted">
                      <BadgeCheck className="h-3 w-3" />
                      {cancelScheduled ? "해지 예약" : "인증"}
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        isPendingReview
                          ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                          : certStatus === "rejected"
                            ? "bg-rose-50 text-rose-800 ring-1 ring-rose-200"
                            : "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
                      )}
                    >
                      {ABUTS_LAB_CERT_STATUS_LABEL[certStatus]}
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-muted-foreground">
                  {isCertified
                    ? cancelScheduled
                      ? nextBillingLabel
                        ? `${nextBillingLabel}까지 유지 후 종료`
                        : "기간 말 이후 종료"
                      : monthlyFee > 0 && nextBillingLabel
                        ? `다음 결제일 ${nextBillingLabel}`
                        : "자동 매칭 참여 중"
                    : isPendingReview
                      ? certStatus === "testing"
                        ? "어벗츠에서 기공 테스트를 진행합니다."
                        : "접수 완료. 곧 테스트 일정을 안내합니다."
                      : certStatus === "rejected"
                        ? "인증이 보류되었습니다. 다시 신청할 수 있습니다."
                        : "인증 테스트를 신청해 주세요."}
                </p>
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
                  인증 테스트 신청
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
                  진행 중
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
                      ? "다음 결제일까지 유지된 뒤 종료됩니다."
                      : "예약일까지 유지된 뒤 종료됩니다."}
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
                ? "사업자 검증 후 인증 테스트를 신청할 수 있습니다."
                : "기공의뢰 수신이 가능한 기공소만 신청할 수 있습니다."}
            </p>
          </div>
        ) : canApply ? (
          <div className="flex gap-3 rounded-2xl border border-dashed border-primary-muted/70 bg-primary-soft/25 px-4 py-3.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" />
            <div className="min-w-0 space-y-1 text-[13px] leading-relaxed text-slate-700">
              <p className="font-semibold text-slate-900">인증 테스트 신청</p>
              <p>
                신청하면 어벗츠에서 기공 테스트를 진행합니다. 통과 시 인증
                기공소 뱃지가 부여되고 자동 매칭에 참여할 수 있습니다.
              </p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
