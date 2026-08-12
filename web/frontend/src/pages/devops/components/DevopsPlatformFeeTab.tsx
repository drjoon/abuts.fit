// change-log:
// - 2026-08-13: 저장 버튼·자동 저장 뱃지·마지막 저장 문구 제거, 조용한 자동 저장.
// - 2026-08-13: 카드 UI 정리 + 변경 시 디바운스 자동 저장.
// related files:
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
// - web/backend/controllers/users/user.controller.js
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Landmark, Percent, ShieldCheck } from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";

type DevopsSettings = {
  partnerFeeRate?: number;
  nonPartnerFeeRate?: number;
  updatedAt?: string | null;
};

const AUTO_SAVE_DELAY_MS = 700;

export const DevopsPlatformFeeTab = () => {
  const { toast } = useToast();
  const { token, loginWithToken } = useAuthStore();
  const [loading, setLoading] = useState(Boolean(token));
  const [partnerFeeRate, setPartnerFeeRate] = useState("0");
  const [nonPartnerFeeRate, setNonPartnerFeeRate] = useState("25");
  const hydratedRef = useRef(false);
  const savedRef = useRef({
    partnerFeeRate: "0",
    nonPartnerFeeRate: "25",
  });
  const valuesRef = useRef({
    partnerFeeRate: "0",
    nonPartnerFeeRate: "25",
  });
  valuesRef.current = { partnerFeeRate, nonPartnerFeeRate };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!token) {
        if (mounted) setLoading(false);
        return;
      }
      try {
        hydratedRef.current = false;
        const res = await request<{ data?: Record<string, unknown> }>({
          path: "/api/users/profile",
          method: "GET",
          token,
        });
        if (!res.ok || !mounted) return;

        const body = res.data || {};
        const profile = (body.data || body) as Record<string, unknown>;
        const settings =
          (profile.devopsPayoutSettings as DevopsSettings | undefined) || {};
        const snapshot = {
          partnerFeeRate: String(
            Math.round(Number(settings.partnerFeeRate ?? 0) * 100),
          ),
          nonPartnerFeeRate: String(
            Math.round(Number(settings.nonPartnerFeeRate ?? 0.25) * 100),
          ),
        };
        savedRef.current = snapshot;
        setPartnerFeeRate(snapshot.partnerFeeRate);
        setNonPartnerFeeRate(snapshot.nonPartnerFeeRate);
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

  const rateValues = useMemo(() => {
    const partner = Number(partnerFeeRate);
    const nonPartner = Number(nonPartnerFeeRate);
    return [partner, nonPartner].every(Number.isFinite)
      ? { partner, nonPartner }
      : null;
  }, [nonPartnerFeeRate, partnerFeeRate]);

  useEffect(() => {
    if (!hydratedRef.current || !token || loading) return;
    const current = valuesRef.current;
    if (
      current.partnerFeeRate === savedRef.current.partnerFeeRate &&
      current.nonPartnerFeeRate === savedRef.current.nonPartnerFeeRate
    ) {
      return;
    }

    const timer = window.setTimeout(async () => {
      const next = valuesRef.current;
      const partner = Number(next.partnerFeeRate);
      const nonPartner = Number(next.nonPartnerFeeRate);
      if (![partner, nonPartner].every(Number.isFinite)) {
        toast({
          title: "플랫폼 수수료율 오류",
          description: "수수료율은 숫자여야 합니다.",
          variant: "destructive",
        });
        return;
      }
      if ([partner, nonPartner].some((rate) => rate < 0 || rate > 100)) {
        toast({
          title: "플랫폼 수수료율 오류",
          description: "수수료율은 0~100% 범위여야 합니다.",
          variant: "destructive",
        });
        return;
      }
      if (partner > nonPartner) {
        toast({
          title: "플랫폼 수수료율 오류",
          description:
            "등록 치과 수수료율은 미등록 수수료율보다 클 수 없습니다.",
          variant: "destructive",
        });
        return;
      }

      try {
        const res = await request<{ message?: string }>({
          path: "/api/users/profile",
          method: "PUT",
          token,
          jsonBody: {
            devopsPayoutSettings: {
              partnerFeeRate: partner / 100,
              nonPartnerFeeRate: nonPartner / 100,
            },
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

        savedRef.current = {
          partnerFeeRate: String(partner),
          nonPartnerFeeRate: String(nonPartner),
        };
        window.dispatchEvent(new Event("abuts:profile:updated"));
        void loginWithToken(token);
      } catch {
        toast({
          title: "저장 실패",
          description: "저장에 실패했습니다.",
          variant: "destructive",
        });
      }
    }, AUTO_SAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [partnerFeeRate, nonPartnerFeeRate, token, loading, toast, loginWithToken]);

  const partnerPct = rateValues?.partner ?? 0;
  const nonPartnerPct = rateValues?.nonPartner ?? 25;

  return (
    <Card className="app-glass-card app-glass-card--lg overflow-hidden">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft/60 ring-1 ring-primary-muted/70">
            <Landmark className="h-5 w-5 text-primary-strong" />
          </span>
          <div className="min-w-0 space-y-1">
            <h3 className="text-base font-semibold tracking-tight text-slate-900">
              기공의뢰 플랫폼 수수료율
            </h3>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              등록·미등록 치과에 적용되는 플랫폼 수수료입니다.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/50 px-4 py-10 text-center text-sm text-muted-foreground">
            불러오는 중…
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-primary-muted/70 bg-primary-soft/25 p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/80 ring-1 ring-primary-muted/60">
                    <ShieldCheck className="h-4 w-4 text-primary-strong" />
                  </span>
                  <Label
                    htmlFor="rate-partner"
                    className="text-sm font-semibold text-primary-strong"
                  >
                    등록 치과
                  </Label>
                </div>
                <p className="mb-3 text-[12px] leading-relaxed text-slate-600">
                  기공소 소개 코드로 가입한 기존 거래 치과
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    id="rate-partner"
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={partnerFeeRate}
                    onChange={(event) => setPartnerFeeRate(event.target.value)}
                    className="h-11 w-24 rounded-xl border-primary-muted/50 bg-white text-center text-base font-semibold tabular-nums"
                  />
                  <span className="text-sm font-medium text-slate-500">%</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 ring-1 ring-slate-200/80">
                    <Building2 className="h-4 w-4 text-slate-600" />
                  </span>
                  <Label
                    htmlFor="rate-non-partner"
                    className="text-sm font-semibold text-slate-900"
                  >
                    미등록 치과
                  </Label>
                </div>
                <p className="mb-3 text-[12px] leading-relaxed text-slate-600">
                  거래처 등록 기한 후 미등록된 치과
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    id="rate-non-partner"
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={nonPartnerFeeRate}
                    onChange={(event) =>
                      setNonPartnerFeeRate(event.target.value)
                    }
                    className="h-11 w-24 rounded-xl border-slate-200 bg-slate-50/60 text-center text-base font-semibold tabular-nums"
                  />
                  <span className="text-sm font-medium text-slate-500">%</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4">
              <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Percent className="h-3.5 w-3.5" />
                  수수료 비교
                </span>
                <span className="tabular-nums">
                  등록 {partnerPct}% · 미등록 {nonPartnerPct}%
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="overflow-hidden rounded-full bg-white ring-1 ring-slate-200/80">
                  <div
                    className="flex h-8 items-center justify-center bg-primary-strong text-[11px] font-semibold tabular-nums text-white transition-all"
                    style={{
                      width: `${Math.max(12, Math.min(100, partnerPct || 0))}%`,
                      minWidth: partnerPct === 0 ? "2.5rem" : undefined,
                    }}
                  >
                    {partnerPct}%
                  </div>
                </div>
                <div className="overflow-hidden rounded-full bg-white ring-1 ring-slate-200/80">
                  <div
                    className="flex h-8 items-center justify-center bg-amber-500 text-[11px] font-semibold tabular-nums text-white transition-all"
                    style={{
                      width: `${Math.max(12, Math.min(100, nonPartnerPct || 0))}%`,
                      minWidth: nonPartnerPct === 0 ? "2.5rem" : undefined,
                    }}
                  >
                    {nonPartnerPct}%
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
