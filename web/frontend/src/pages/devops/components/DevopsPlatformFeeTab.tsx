// change-log:
// - 2026-08-17: 기공의뢰 신속처리 할증(배수) 설정 추가.
// - 2026-08-16: 지정 거래 카드 안에 적용 on/off + 툴팁. 별도 카드 제거.
// - 2026-08-16: 지정 거래 수수료 적용 on/off(기본 off=별도 공지 시까지 무료).
// - 2026-08-16: 월 참여(정책 0원) 카드 제거. 매칭·지정 %만 표시.
// - 2026-08-16: 매칭 10% / 지정 5% 성공 수수료 분리 입력.
// - 2026-08-15: 기공소 월 참여 기본 0(정책). 성공 수수료율과 함께 저장.
// - 2026-08-14: 기본 성공 수수료율 10%. 월 참여 수수료 기본 0.
// - 2026-08-14: 월 참여 수수료(원) 입력 추가. 성공 수수료율(%)과 함께 저장.
// - 2026-08-14: 카드 없이 인라인 수수료 입력만. 긴 안내 문구 제거.
// - 2026-08-14: 등록/미등록 2단계 폐지. 자동 매칭 성공 시 단일 플랫폼 수수료율.
// related files:
// - web/frontend/src/pages/devops/components/PracticeTransferAutoMatchTab.tsx
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
// - web/backend/controllers/admin/admin.settings.controller.js
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
import { Info, Percent, Zap } from "lucide-react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";
import { PRACTICE_RUSH_FEE_MULTIPLIER } from "@/shared/practice/labFeeSchedule";

type PlatformFeeSettings = {
  platformFeeRate?: number;
  directPlatformFeeEnabled?: boolean;
  directPlatformFeeRate?: number;
  nonPartnerFeeRate?: number;
  practiceRushFeeMultiplier?: number;
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

const toMultiplierString = (value: number, fallback: number) => {
  const n = Number(value);
  const m =
    Number.isFinite(n) && n > 1 && n <= 2
      ? Math.round(n * 100) / 100
      : fallback;
  return Number.isInteger(m) ? String(m) : String(m);
};

type Props = {
  className?: string;
};

/** 기공소 매칭 카드 안에 넣는 수수료 입력(자동 저장). */
export const DevopsPlatformFeeTab = ({ className }: Props) => {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(Boolean(token));
  const [platformFeeRate, setPlatformFeeRate] = useState("10");
  const [directFeeEnabled, setDirectFeeEnabled] = useState(false);
  const [directFeeRate, setDirectFeeRate] = useState("5");
  const [rushFeeMultiplier, setRushFeeMultiplier] = useState(
    toMultiplierString(PRACTICE_RUSH_FEE_MULTIPLIER, PRACTICE_RUSH_FEE_MULTIPLIER),
  );
  const hydratedRef = useRef(false);
  const savedMatchRef = useRef("10");
  const savedDirectEnabledRef = useRef(false);
  const savedDirectRef = useRef("5");
  const savedRushRef = useRef(
    toMultiplierString(PRACTICE_RUSH_FEE_MULTIPLIER, PRACTICE_RUSH_FEE_MULTIPLIER),
  );
  const matchRef = useRef("10");
  const directEnabledRef = useRef(false);
  const directRef = useRef("5");
  const rushRef = useRef(rushFeeMultiplier);
  matchRef.current = platformFeeRate;
  directEnabledRef.current = directFeeEnabled;
  directRef.current = directFeeRate;
  rushRef.current = rushFeeMultiplier;

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
        const matchPct = toPctString(
          Number(settings.platformFeeRate ?? settings.nonPartnerFeeRate),
          0.1,
        );
        const directPct = toPctString(
          Number(settings.directPlatformFeeRate),
          0.05,
        );
        const enabled = settings.directPlatformFeeEnabled === true;
        const rush = toMultiplierString(
          Number(settings.practiceRushFeeMultiplier),
          PRACTICE_RUSH_FEE_MULTIPLIER,
        );
        savedMatchRef.current = matchPct;
        savedDirectEnabledRef.current = enabled;
        savedDirectRef.current = directPct;
        savedRushRef.current = rush;
        setPlatformFeeRate(matchPct);
        setDirectFeeEnabled(enabled);
        setDirectFeeRate(directPct);
        setRushFeeMultiplier(rush);
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
      matchRef.current === savedMatchRef.current &&
      directEnabledRef.current === savedDirectEnabledRef.current &&
      directRef.current === savedDirectRef.current &&
      rushRef.current === savedRushRef.current
    ) {
      return;
    }

    const timer = window.setTimeout(async () => {
      const nextMatch = matchRef.current;
      const nextDirectEnabled = directEnabledRef.current;
      const nextDirect = directRef.current;
      const nextRush = rushRef.current;
      const match = Number(nextMatch);
      const direct = Number(nextDirect);
      const rush = Number(nextRush);
      if (!Number.isFinite(match) || !Number.isFinite(direct)) {
        toast({
          title: "플랫폼 수수료율 오류",
          description: "수수료율은 숫자여야 합니다.",
          variant: "destructive",
        });
        return;
      }
      if (match < 0 || match > 100 || direct < 0 || direct > 100) {
        toast({
          title: "플랫폼 수수료율 오류",
          description: "수수료율은 0~100% 범위여야 합니다.",
          variant: "destructive",
        });
        return;
      }
      if (!Number.isFinite(rush) || rush <= 1 || rush > 2) {
        toast({
          title: "신속처리 할증 오류",
          description: "할증 배수는 1 초과 2 이하여야 합니다.",
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
            platformFeeRate: match / 100,
            directPlatformFeeEnabled: nextDirectEnabled,
            directPlatformFeeRate: direct / 100,
            practiceRushFeeMultiplier: Math.round(rush * 100) / 100,
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
        savedMatchRef.current = saved
          ? toPctString(
              Number(saved.platformFeeRate ?? saved.nonPartnerFeeRate),
              match / 100,
            )
          : String(match);
        savedDirectEnabledRef.current =
          saved?.directPlatformFeeEnabled === true;
        savedDirectRef.current = saved
          ? toPctString(Number(saved.directPlatformFeeRate), direct / 100)
          : String(direct);
        savedRushRef.current = saved
          ? toMultiplierString(
              Number(saved.practiceRushFeeMultiplier),
              rush,
            )
          : toMultiplierString(rush, PRACTICE_RUSH_FEE_MULTIPLIER);
        void queryClient.invalidateQueries({ queryKey: ["credit-settings"] });
      } catch {
        toast({
          title: "저장 실패",
          description: "저장에 실패했습니다.",
          variant: "destructive",
        });
      }
    }, AUTO_SAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [
    platformFeeRate,
    directFeeEnabled,
    directFeeRate,
    rushFeeMultiplier,
    token,
    loading,
    toast,
    queryClient,
  ]);

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-muted/60 bg-primary-soft/30 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 ring-1 ring-primary-muted/50">
            <Percent className="h-4 w-4 text-primary-strong" />
          </span>
          <div className="min-w-0">
            <Label
              htmlFor="rate-match"
              className="text-sm font-semibold text-slate-900"
            >
              매칭 거래
            </Label>
            <p className="text-[12px] leading-snug text-muted-foreground">
              성공 수수료
            </p>
          </div>
        </div>
        {loading ? (
          <span className="text-sm text-muted-foreground">…</span>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              id="rate-match"
              type="number"
              min={0}
              max={100}
              step={1}
              value={platformFeeRate}
              onChange={(event) => setPlatformFeeRate(event.target.value)}
              className="h-11 w-[4.5rem] rounded-xl border-primary-muted/40 bg-white text-center text-base font-semibold tabular-nums shadow-sm"
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
                htmlFor="rate-direct"
                className="text-sm font-semibold text-slate-900"
              >
                지정 거래
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex text-slate-400 transition-colors hover:text-slate-600"
                    aria-label="지정 거래 수수료 안내"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[240px] text-[12px] leading-relaxed">
                  끄면 기공소·치과에 무료로 안내되고 실효 요율은 0%입니다.
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-[12px] leading-snug text-muted-foreground">
              {directFeeEnabled ? "성공 수수료" : "별도 공지 시까지 무료"}
            </p>
          </div>
        </div>
        {loading ? (
          <span className="text-sm text-muted-foreground">…</span>
        ) : (
          <div className="flex items-center gap-2.5">
            <Switch
              checked={directFeeEnabled}
              onCheckedChange={setDirectFeeEnabled}
              aria-label="지정 거래 수수료 적용"
            />
            <Input
              id="rate-direct"
              type="number"
              min={0}
              max={100}
              step={1}
              value={directFeeRate}
              onChange={(event) => setDirectFeeRate(event.target.value)}
              className="h-11 w-[4.5rem] rounded-xl border-primary-muted/40 bg-white text-center text-base font-semibold tabular-nums shadow-sm"
            />
            <span className="text-sm font-semibold text-slate-500">%</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-muted/60 bg-primary-soft/30 px-4 py-3.5 sm:col-span-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 ring-1 ring-primary-muted/50">
            <Zap className="h-4 w-4 text-primary-strong" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Label
                htmlFor="rush-fee-multiplier"
                className="text-sm font-semibold text-slate-900"
              >
                신속처리 할증
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex text-slate-400 transition-colors hover:text-slate-600"
                    aria-label="신속처리 할증 안내"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[260px] text-[12px] leading-relaxed">
                  3영업일 이하 납기 기공의뢰에 기공비·어벗츠 의뢰비에 곱합니다.
                  이미 생성된 의뢰의 스냅샷 배수는 바뀌지 않습니다.
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-[12px] leading-snug text-muted-foreground">
              기공·어벗츠 배수
            </p>
          </div>
        </div>
        {loading ? (
          <span className="text-sm text-muted-foreground">…</span>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              id="rush-fee-multiplier"
              type="number"
              min={1.01}
              max={2}
              step={0.1}
              value={rushFeeMultiplier}
              onChange={(event) => setRushFeeMultiplier(event.target.value)}
              className="h-11 w-[4.5rem] rounded-xl border-primary-muted/40 bg-white text-center text-base font-semibold tabular-nums shadow-sm"
            />
            <span className="text-sm font-semibold text-slate-500">배</span>
          </div>
        )}
      </div>
    </div>
  );
};
