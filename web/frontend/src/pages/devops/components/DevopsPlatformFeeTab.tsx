// change-log:
// - 2026-08-14: 월 참여 수수료(원) 입력 추가. 성공 수수료율(%)과 함께 저장.
// - 2026-08-14: 카드 없이 인라인 수수료 입력만. 긴 안내 문구 제거.
// - 2026-08-14: 등록/미등록 2단계 폐지. 자동 매칭 성공 시 단일 플랫폼 수수료율.
// related files:
// - web/frontend/src/pages/devops/components/PracticeTransferAutoMatchTab.tsx
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
// - web/backend/controllers/admin/admin.settings.controller.js
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarDays, Percent } from "lucide-react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";

type PlatformFeeSettings = {
  platformFeeRate?: number;
  nonPartnerFeeRate?: number;
  autoMatchMonthlyFee?: number;
  updatedAt?: string | null;
};

type PlatformFeeApiResponse = {
  success?: boolean;
  message?: string;
  data?: {
    platformFeeSettings?: PlatformFeeSettings;
  };
};

const AUTO_SAVE_DELAY_MS = 700;

const toPctString = (rate: number, fallback: number) =>
  String(Math.round((Number.isFinite(rate) ? rate : fallback) * 100));

const toWonString = (won: number) =>
  String(Math.max(0, Math.round(Number.isFinite(won) ? won : 0)));

type Props = {
  className?: string;
};

/** 기공소 매칭 카드 안에 넣는 수수료 입력(자동 저장). */
export const DevopsPlatformFeeTab = ({ className }: Props) => {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(Boolean(token));
  const [platformFeeRate, setPlatformFeeRate] = useState("25");
  const [monthlyFee, setMonthlyFee] = useState("0");
  const hydratedRef = useRef(false);
  const savedRateRef = useRef("25");
  const savedMonthlyRef = useRef("0");
  const rateRef = useRef("25");
  const monthlyRef = useRef("0");
  rateRef.current = platformFeeRate;
  monthlyRef.current = monthlyFee;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!token) {
        if (mounted) setLoading(false);
        return;
      }
      try {
        hydratedRef.current = false;
        const res = await apiFetch<PlatformFeeApiResponse>({
          path: "/api/admin/settings/platform-fees",
          method: "GET",
          token,
          skipCache: true,
        });
        if (!res.ok || !mounted) return;

        const settings = res.data?.data?.platformFeeSettings || {};
        const pct = toPctString(
          Number(settings.platformFeeRate ?? settings.nonPartnerFeeRate),
          0.25,
        );
        const won = toWonString(Number(settings.autoMatchMonthlyFee));
        savedRateRef.current = pct;
        savedMonthlyRef.current = won;
        setPlatformFeeRate(pct);
        setMonthlyFee(won);
        hydratedRef.current = true;
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [token]);

  useEffect(() => {
    if (!hydratedRef.current || !token || loading) return;
    if (
      rateRef.current === savedRateRef.current &&
      monthlyRef.current === savedMonthlyRef.current
    ) {
      return;
    }

    const timer = window.setTimeout(async () => {
      const nextRate = rateRef.current;
      const nextMonthly = monthlyRef.current;
      const rate = Number(nextRate);
      const monthly = Number(nextMonthly);
      if (!Number.isFinite(rate)) {
        toast({
          title: "플랫폼 수수료율 오류",
          description: "수수료율은 숫자여야 합니다.",
          variant: "destructive",
        });
        return;
      }
      if (rate < 0 || rate > 100) {
        toast({
          title: "플랫폼 수수료율 오류",
          description: "수수료율은 0~100% 범위여야 합니다.",
          variant: "destructive",
        });
        return;
      }
      if (!Number.isFinite(monthly) || monthly < 0) {
        toast({
          title: "월 참여 수수료 오류",
          description: "월 수수료는 0원 이상이어야 합니다.",
          variant: "destructive",
        });
        return;
      }

      try {
        const res = await apiFetch<PlatformFeeApiResponse>({
          path: "/api/admin/settings/platform-fees",
          method: "PATCH",
          token,
          jsonBody: {
            platformFeeRate: rate / 100,
            autoMatchMonthlyFee: Math.round(monthly),
          },
        });
        if (!res.ok) {
          toast({
            title: "저장 실패",
            description: res.data?.message || "저장에 실패했습니다.",
            variant: "destructive",
          });
          return;
        }

        const saved = res.data?.data?.platformFeeSettings;
        savedRateRef.current = saved
          ? toPctString(
              Number(saved.platformFeeRate ?? saved.nonPartnerFeeRate),
              rate / 100,
            )
          : String(rate);
        savedMonthlyRef.current = saved
          ? toWonString(Number(saved.autoMatchMonthlyFee))
          : String(Math.round(monthly));
      } catch {
        toast({
          title: "저장 실패",
          description: "저장에 실패했습니다.",
          variant: "destructive",
        });
      }
    }, AUTO_SAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [platformFeeRate, monthlyFee, token, loading, toast]);

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-muted/60 bg-primary-soft/30 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 ring-1 ring-primary-muted/50">
            <CalendarDays className="h-4 w-4 text-primary-strong" />
          </span>
          <div className="min-w-0">
            <Label
              htmlFor="fee-monthly"
              className="text-sm font-semibold text-slate-900"
            >
              월 참여 수수료
            </Label>
            <p className="text-[12px] leading-snug text-muted-foreground">
              매칭 참여 구독료
            </p>
          </div>
        </div>
        {loading ? (
          <span className="text-sm text-muted-foreground">…</span>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              id="fee-monthly"
              type="number"
              min={0}
              step={1000}
              value={monthlyFee}
              onChange={(event) => setMonthlyFee(event.target.value)}
              className="h-11 w-[6.5rem] rounded-xl border-primary-muted/40 bg-white text-right text-base font-semibold tabular-nums shadow-sm"
            />
            <span className="text-sm font-semibold text-slate-500">원</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-muted/60 bg-primary-soft/30 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 ring-1 ring-primary-muted/50">
            <Percent className="h-4 w-4 text-primary-strong" />
          </span>
          <div className="min-w-0">
            <Label
              htmlFor="rate-platform"
              className="text-sm font-semibold text-slate-900"
            >
              성공 수수료
            </Label>
            <p className="text-[12px] leading-snug text-muted-foreground">
              자동 매칭 성공 시 · 지정 0%
            </p>
          </div>
        </div>
        {loading ? (
          <span className="text-sm text-muted-foreground">…</span>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              id="rate-platform"
              type="number"
              min={0}
              max={100}
              step={5}
              value={platformFeeRate}
              onChange={(event) => setPlatformFeeRate(event.target.value)}
              className="h-11 w-[4.5rem] rounded-xl border-primary-muted/40 bg-white text-center text-base font-semibold tabular-nums shadow-sm"
            />
            <span className="text-sm font-semibold text-slate-500">%</span>
          </div>
        )}
      </div>
    </div>
  );
};
