// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/devops/DevopsPartnerPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Landmark } from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";

type DevopsSettings = {
  manufacturerRate?: number;
  devopsRate?: number;
  salesmanRate?: number;
  adminRate?: number;
  labReferredFeeRate?: number;
  nonPartnerFeeRate?: number;
  updatedAt?: string | null;
};

type RateField = {
  key: "manufacturer" | "devops" | "salesman" | "admin";
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
};

function formatRatePct(n: number) {
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export const DevopsPayoutAccountTab = () => {
  const { toast } = useToast();
  const { token, loginWithToken } = useAuthStore();

  const [loading, setLoading] = useState(Boolean(token));
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [manufacturerRate, setManufacturerRate] = useState<string>("60");
  const [devopsRate, setDevopsRate] = useState<string>("10");
  const [salesmanRate, setSalesmanRate] = useState<string>("10");
  const [adminRate, setAdminRate] = useState<string>("20");
  const [labReferredFeeRate, setLabReferredFeeRate] = useState<string>("10");
  const [nonPartnerFeeRate, setNonPartnerFeeRate] = useState<string>("10");
  const savedRef = useRef({
    manufacturerRate: "60",
    devopsRate: "10",
    salesmanRate: "10",
    adminRate: "20",
    labReferredFeeRate: "10",
    nonPartnerFeeRate: "10",
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
        const res = await request<{
          data?: Record<string, unknown>;
          [key: string]: unknown;
        }>({
          path: "/api/users/profile",
          method: "GET",
          token,
        });
        if (!res.ok || !mounted) return;
        const body = (res.data || {}) as {
          data?: Record<string, unknown>;
          [key: string]: unknown;
        };
        const profile = (body.data || body) as Record<string, unknown>;
        const ds: DevopsSettings =
          (profile.devopsPayoutSettings as DevopsSettings) || {};
        const snap = {
          manufacturerRate: String(
            Math.round(Number(ds?.manufacturerRate ?? 0.6) * 100),
          ),
          devopsRate: String(Math.round(Number(ds?.devopsRate ?? 0.1) * 100)),
          salesmanRate: String(
            Math.round(Number(ds?.salesmanRate ?? 0.1) * 100),
          ),
          adminRate: String(Math.round(Number(ds?.adminRate ?? 0.2) * 100)),
          labReferredFeeRate: String(
            Math.round(Number(ds?.labReferredFeeRate ?? 0.1) * 100),
          ),
          nonPartnerFeeRate: String(
            Math.round(Number(ds?.nonPartnerFeeRate ?? 0.2) * 100),
          ),
          updatedAt: ds?.updatedAt ? String(ds.updatedAt) : null,
        };
        savedRef.current = snap;
        setManufacturerRate(snap.manufacturerRate);
        setDevopsRate(snap.devopsRate);
        setSalesmanRate(snap.salesmanRate);
        setAdminRate(snap.adminRate);
        setLabReferredFeeRate(snap.labReferredFeeRate);
        setNonPartnerFeeRate(snap.nonPartnerFeeRate);
        setUpdatedAt(snap.updatedAt);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [token]);

  const rateNums = useMemo(() => {
    const mfr = Number(manufacturerRate);
    const devops = Number(devopsRate);
    const salesman = Number(salesmanRate);
    const admin = Number(adminRate);
    if (![mfr, devops, salesman, admin].every(Number.isFinite)) return null;
    return { mfr, devops, salesman, admin };
  }, [adminRate, devopsRate, manufacturerRate, salesmanRate]);

  const rateTotal = rateNums
    ? rateNums.mfr + rateNums.devops + rateNums.salesman + rateNums.admin
    : null;
  const rateTotalOk = rateTotal !== null && Math.abs(rateTotal - 100) <= 0.01;

  const hasChanges =
    manufacturerRate !== savedRef.current.manufacturerRate ||
    devopsRate !== savedRef.current.devopsRate ||
    salesmanRate !== savedRef.current.salesmanRate ||
    adminRate !== savedRef.current.adminRate ||
    labReferredFeeRate !== savedRef.current.labReferredFeeRate ||
    nonPartnerFeeRate !== savedRef.current.nonPartnerFeeRate;

  const feeRateNums = useMemo(() => {
    const referred = Number(labReferredFeeRate);
    const nonPartner = Number(nonPartnerFeeRate);
    if (![referred, nonPartner].every(Number.isFinite)) return null;
    return { referred, nonPartner };
  }, [labReferredFeeRate, nonPartnerFeeRate]);

  // 영업자 없을 때: 영업자 분배비의 절반 → 제조사, 나머지 절반 → 관리자
  const withoutSalesmanPreview = useMemo(() => {
    if (!rateNums) return null;
    const half = rateNums.salesman / 2;
    return {
      manufacturer: rateNums.mfr + half,
      devops: rateNums.devops,
      salesman: 0,
      admin: rateNums.admin + half,
      half,
    };
  }, [rateNums]);

  const rateFields: RateField[] = [
    {
      key: "manufacturer",
      label: "제조사 (애크로덴트)",
      value: manufacturerRate,
      onChange: setManufacturerRate,
    },
    {
      key: "devops",
      label: "개발운영사 (메이븐)",
      hint: "유료 의뢰비 기준",
      value: devopsRate,
      onChange: setDevopsRate,
    },
    {
      key: "salesman",
      label: "영업자 (법인/개인)",
      hint: "소개 의뢰자 1단계",
      value: salesmanRate,
      onChange: setSalesmanRate,
    },
    {
      key: "admin",
      label: "관리자 (어벗츠)",
      value: adminRate,
      onChange: setAdminRate,
    },
  ];

  const save = async () => {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    if (saving) return;

    if (!rateNums) {
      toast({
        title: "수수료율 오류",
        description: "수수료율은 숫자여야 합니다.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    const { mfr: mfrNum, devops: devopsNum, salesman: salesmanNum, admin: adminNum } =
      rateNums;
    const allRates = [mfrNum, devopsNum, salesmanNum, adminNum];
    if (allRates.some((r) => r < 0 || r > 100)) {
      toast({
        title: "수수료율 오류",
        description: "수수료율은 0~100% 범위여야 합니다.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    const total = mfrNum + devopsNum + salesmanNum + adminNum;
    if (Math.abs(total - 100) > 0.01) {
      toast({
        title: "분배율 오류",
        description: `합계는 100%여야 합니다. (현재 ${total.toFixed(2)}%)`,
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    if (!feeRateNums) {
      toast({
        title: "플랫폼 수수료율 오류",
        description: "수수료율은 숫자여야 합니다.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    const { referred: referredNum, nonPartner: nonPartnerNum } = feeRateNums;
    if ([referredNum, nonPartnerNum].some((r) => r < 0 || r > 100)) {
      toast({
        title: "플랫폼 수수료율 오류",
        description: "수수료율은 0~100% 범위여야 합니다.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    if (referredNum > nonPartnerNum) {
      toast({
        title: "플랫폼 수수료율 오류",
        description: "소개 수수료율은 미거래처 수수료율보다 클 수 없습니다.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    setSaving(true);
    try {
      const res = await request<{ message?: string; [key: string]: unknown }>({
        path: "/api/users/profile",
        method: "PUT",
        token,
        jsonBody: {
          devopsPayoutSettings: {
            manufacturerRate: mfrNum / 100,
            devopsRate: devopsNum / 100,
            salesmanRate: salesmanNum / 100,
            adminRate: adminNum / 100,
            labReferredFeeRate: referredNum / 100,
            nonPartnerFeeRate: nonPartnerNum / 100,
          },
        },
      });

      if (!res.ok) {
        const errorMessage =
          typeof res.data === "object" &&
          res.data !== null &&
          "message" in res.data
            ? (res.data as { message?: unknown }).message
            : null;
        const msg = String(errorMessage || "저장에 실패했습니다.");
        toast({
          title: "저장 실패",
          description: msg,
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      toast({
        title: "저장되었습니다",
        duration: 2000,
      });

      try {
        window.dispatchEvent(new Event("abuts:profile:updated"));
      } catch (_error) {
        void _error;
      }

      if (token) {
        void loginWithToken(token);
      }

      const now = new Date().toISOString();
      setManufacturerRate(String(mfrNum));
      setDevopsRate(String(devopsNum));
      setSalesmanRate(String(salesmanNum));
      setAdminRate(String(adminNum));
      setLabReferredFeeRate(String(referredNum));
      setNonPartnerFeeRate(String(nonPartnerNum));
      setUpdatedAt(now);
      savedRef.current = {
        manufacturerRate: String(mfrNum),
        devopsRate: String(devopsNum),
        salesmanRate: String(salesmanNum),
        adminRate: String(adminNum),
        labReferredFeeRate: String(referredNum),
        nonPartnerFeeRate: String(nonPartnerNum),
        updatedAt: now,
      };
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="app-glass-card app-glass-card--lg">
        <CardContent className="py-10 text-sm text-muted-foreground">
          불러오는 중…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Landmark className="h-5 w-5" />
          입금
        </CardTitle>
        <CardDescription>
          매출 100% 기준 분배율. 영업자 소개가 없으면 영업자 몫을 제조사·관리자가
          절반씩 가져갑니다.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-8">
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold tracking-tight">
              분배율 (영업자 소개 있음)
            </h3>
            <Badge
              variant="outline"
              className={cn(
                "tabular-nums font-medium",
                rateTotalOk
                  ? "border-primary-muted bg-primary-soft text-primary-strong"
                  : "border-accent-muted bg-accent-soft text-accent-strong",
              )}
            >
              합계 {rateTotal === null ? "—" : `${rateTotal}%`}
              {rateTotalOk ? " · OK" : " · 100% 필요"}
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {rateFields.map((field) => (
              <div
                key={field.key}
                className="rounded-xl border border-border/80 bg-background/60 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <Label
                      htmlFor={`rate-${field.key}`}
                      className="text-sm font-medium text-foreground"
                    >
                      {field.label}
                    </Label>
                    {field.hint ? (
                      <p className="text-xs text-muted-foreground">
                        {field.hint}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Input
                      id={`rate-${field.key}`}
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.value)}
                      className="h-9 w-[4.5rem] px-2 text-center text-sm tabular-nums"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {withoutSalesmanPreview ? (
          <section className="space-y-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold tracking-tight">
                영업자 없을 때 (자동 적용)
              </h3>
              <p className="text-sm text-muted-foreground">
                영업자 {formatRatePct(rateNums?.salesman ?? 0)}% 중{" "}
                {formatRatePct(withoutSalesmanPreview.half)}%p씩 제조사·관리자에
                가산
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  {
                    key: "manufacturer",
                    label: "제조사 (애크로덴트)",
                    value: withoutSalesmanPreview.manufacturer,
                  },
                  {
                    key: "devops",
                    label: "개발운영사 (메이븐)",
                    value: withoutSalesmanPreview.devops,
                  },
                  {
                    key: "salesman",
                    label: "영업자 (법인/개인)",
                    value: withoutSalesmanPreview.salesman,
                  },
                  {
                    key: "admin",
                    label: "관리자 (어벗츠)",
                    value: withoutSalesmanPreview.admin,
                  },
                ] as const
              ).map((row) => (
                <div
                  key={row.key}
                  className="rounded-xl border border-dashed border-border/80 bg-muted/30 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">
                      {row.label}
                    </span>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {formatRatePct(row.value)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-3 border-t border-border/70 pt-6">
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold tracking-tight">
              기공의뢰 플랫폼 수수료율
            </h3>
            <p className="text-sm text-muted-foreground">
              치과 거래 관계별 청구 총액(기공비+어벗) 대비 플랫폼 수수료율.
              소개치과(60일 이내 등록)는 0%이며, 걷힌 수수료는 위 분배율로
              제조사·개발운영사·영업자·관리자가 나눕니다.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/80 bg-background/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <Label
                    htmlFor="rate-lab-referred"
                    className="text-sm font-medium text-foreground"
                  >
                    소개 치과
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    60일 등록 기간 이후 기공소 소개로 등록
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Input
                    id="rate-lab-referred"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={labReferredFeeRate}
                    onChange={(e) => setLabReferredFeeRate(e.target.value)}
                    className="h-9 w-[4.5rem] px-2 text-center text-sm tabular-nums"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border/80 bg-background/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <Label
                    htmlFor="rate-non-partner"
                    className="text-sm font-medium text-foreground"
                  >
                    그 외 (미등록) 치과
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    거래처 등록·소개 모두 아닌 경우
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Input
                    id="rate-non-partner"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={nonPartnerFeeRate}
                    onChange={(e) => setNonPartnerFeeRate(e.target.value)}
                    className="h-9 w-[4.5rem] px-2 text-center text-sm tabular-nums"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
            </div>
          </div>
        </section>

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
                const s = savedRef.current;
                setManufacturerRate(s.manufacturerRate);
                setDevopsRate(s.devopsRate);
                setSalesmanRate(s.salesmanRate);
                setAdminRate(s.adminRate);
                setLabReferredFeeRate(s.labReferredFeeRate);
                setNonPartnerFeeRate(s.nonPartnerFeeRate);
                setUpdatedAt(s.updatedAt);
              }}
              disabled={saving || !hasChanges}
            >
              취소
            </Button>
            <Button
              type="button"
              onClick={save}
              disabled={saving || !hasChanges}
            >
              {saving ? "저장 중…" : "저장"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
