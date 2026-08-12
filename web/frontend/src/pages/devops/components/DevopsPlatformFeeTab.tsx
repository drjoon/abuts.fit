// related files:
// - web/frontend/src/pages/devops/DevopsPartnerPage.tsx
// - web/backend/controllers/users/user.controller.js
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Landmark } from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";

type DevopsSettings = {
  partnerFeeRate?: number;
  nonPartnerFeeRate?: number;
  updatedAt?: string | null;
};

export const DevopsPlatformFeeTab = () => {
  const { toast } = useToast();
  const { token, loginWithToken } = useAuthStore();
  const [loading, setLoading] = useState(Boolean(token));
  const [saving, setSaving] = useState(false);
  const [partnerFeeRate, setPartnerFeeRate] = useState("0");
  const [nonPartnerFeeRate, setNonPartnerFeeRate] = useState("25");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const savedRef = useRef({
    partnerFeeRate: "0",
    nonPartnerFeeRate: "25",
    updatedAt: null as string | null,
  });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!token) {
        if (mounted) setLoading(false);
        return;
      }
      try {
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
          updatedAt: settings.updatedAt ? String(settings.updatedAt) : null,
        };
        savedRef.current = snapshot;
        setPartnerFeeRate(snapshot.partnerFeeRate);
        setNonPartnerFeeRate(snapshot.nonPartnerFeeRate);
        setUpdatedAt(snapshot.updatedAt);
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

  const hasChanges =
    partnerFeeRate !== savedRef.current.partnerFeeRate ||
    nonPartnerFeeRate !== savedRef.current.nonPartnerFeeRate;

  const handleSave = async () => {
    if (!token || saving) return;
    if (!rateValues) {
      toast({
        title: "플랫폼 수수료율 오류",
        description: "수수료율은 숫자여야 합니다.",
        variant: "destructive",
      });
      return;
    }
    const { partner, nonPartner } = rateValues;
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
        description: "등록 치과 수수료율은 미등록 수수료율보다 클 수 없습니다.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
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

      const now = new Date().toISOString();
      const snapshot = {
        partnerFeeRate: String(partner),
        nonPartnerFeeRate: String(nonPartner),
        updatedAt: now,
      };
      savedRef.current = snapshot;
      setPartnerFeeRate(snapshot.partnerFeeRate);
      setNonPartnerFeeRate(snapshot.nonPartnerFeeRate);
      setUpdatedAt(now);
      window.dispatchEvent(new Event("abuts:profile:updated"));
      void loginWithToken(token);
      toast({ title: "저장되었습니다", duration: 2000 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="app-glass-card">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Landmark className="h-5 w-5" />
          기공의뢰 플랫폼 수수료율
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="py-4 text-sm text-muted-foreground">불러오는 중…</div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/80 bg-background/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <Label htmlFor="rate-partner" className="text-sm font-medium">
                      등록 치과
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      기공소 가입시 기존 거래하던 치과로서 기공소 소개 코드로 가입
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Input
                      id="rate-partner"
                      type="number"
                      min={0}
                      max={100}
                      step={5}
                      value={partnerFeeRate}
                      onChange={(event) => setPartnerFeeRate(event.target.value)}
                      className="h-9 w-[4.5rem] px-2 text-center text-sm tabular-nums"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border/80 bg-background/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <Label htmlFor="rate-non-partner" className="text-sm font-medium">
                      미등록 치과
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      거래처 등록 기한 지나서까지 등록되지 않은 치과
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Input
                      id="rate-non-partner"
                      type="number"
                      min={0}
                      max={100}
                      step={5}
                      value={nonPartnerFeeRate}
                      onChange={(event) => setNonPartnerFeeRate(event.target.value)}
                      className="h-9 w-[4.5rem] px-2 text-center text-sm tabular-nums"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
              <div className="text-xs text-muted-foreground">
                {updatedAt
                  ? `마지막 저장 · ${new Date(updatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`
                  : null}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const saved = savedRef.current;
                    setPartnerFeeRate(saved.partnerFeeRate);
                    setNonPartnerFeeRate(saved.nonPartnerFeeRate);
                    setUpdatedAt(saved.updatedAt);
                  }}
                  disabled={saving || !hasChanges}
                >
                  취소
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || !hasChanges}
                >
                  {saving ? "저장 중…" : "저장"}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
