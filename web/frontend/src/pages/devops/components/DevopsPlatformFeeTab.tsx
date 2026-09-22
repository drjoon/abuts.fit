// change-log:
// - 2026-09-22: 지정 수수료 UI 제거. 하청 %만.
// - 2026-09-20: 하청 기본 표시 5%.
// - 2026-08-16: 월 참여(정책 0원) 카드 제거.
// related files:
// - web/frontend/src/pages/devops/components/PracticeTransferAutoMatchTab.tsx
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
// - web/backend/controllers/admin/admin.settings.controller.js
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Percent } from "lucide-react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";

type PlatformFeeSettings = {
  platformFeeRate?: number;
  subcontractFeeRate?: number;
  nonPartnerFeeRate?: number;
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

type Props = {
  className?: string;
};

/** 기공소 매칭 카드 안에 넣는 하청 수수료 입력(자동 저장). */
export const DevopsPlatformFeeTab = ({ className }: Props) => {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(Boolean(token));
  const [subcontractFeeRate, setSubcontractFeeRate] = useState("5");
  const hydratedRef = useRef(false);
  const savedRef = useRef("5");
  const rateRef = useRef("5");
  rateRef.current = subcontractFeeRate;

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
          Number(
            settings.subcontractFeeRate ??
              settings.platformFeeRate ??
              settings.nonPartnerFeeRate,
          ),
          0.05,
        );
        savedRef.current = pct;
        setSubcontractFeeRate(pct);
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
    if (rateRef.current === savedRef.current) return;

    const timer = window.setTimeout(async () => {
      const next = rateRef.current;
      const match = Number(next);
      if (!Number.isFinite(match)) {
        toast({
          title: "하청 수수료율 오류",
          description: "수수료율은 숫자여야 합니다.",
          variant: "destructive",
        });
        return;
      }
      if (match < 0 || match > 100) {
        toast({
          title: "하청 수수료율 오류",
          description: "수수료율은 0~100% 범위여야 합니다.",
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
            subcontractFeeRate: match / 100,
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
        savedRef.current = saved
          ? toPctString(
              Number(
                saved.subcontractFeeRate ??
                  saved.platformFeeRate ??
                  saved.nonPartnerFeeRate,
              ),
              match / 100,
            )
          : String(match);
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
  }, [subcontractFeeRate, token, loading, toast, queryClient]);

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-muted/60 bg-primary-soft/30 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 ring-1 ring-primary-muted/50">
            <Percent className="h-4 w-4 text-primary-strong" />
          </span>
          <div className="min-w-0">
            <Label
              htmlFor="rate-subcontract"
              className="text-sm font-semibold text-slate-900"
            >
              하청 수수료
            </Label>
            <p className="text-[12px] leading-snug text-muted-foreground">
              어벗츠 의뢰건 하청시
            </p>
          </div>
        </div>
        {loading ? (
          <span className="text-sm text-muted-foreground">…</span>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              id="rate-subcontract"
              type="number"
              min={0}
              max={100}
              step={1}
              value={subcontractFeeRate}
              onChange={(event) => setSubcontractFeeRate(event.target.value)}
              className="h-11 w-[4.5rem] rounded-xl border-primary-muted/40 bg-white text-center text-base font-semibold tabular-nums shadow-sm"
            />
            <span className="text-sm font-semibold text-slate-500">%</span>
          </div>
        )}
      </div>
    </div>
  );
};
