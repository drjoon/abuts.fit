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

type PayoutAccount = {
  bankName: string;
  accountNumber: string;
  holderName: string;
  updatedAt?: string | null;
};

type DevopsSettings = {
  manufacturerRate?: number;
  devopsRate?: number;
  salesmanRate?: number;
  adminRate?: number;
  updatedAt?: string | null;
};

type RateField = {
  key: "manufacturer" | "devops" | "salesman" | "admin";
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
};

export const DevopsPayoutAccountTab = () => {
  const { toast } = useToast();
  const { token, loginWithToken } = useAuthStore();

  const [loading, setLoading] = useState(Boolean(token));
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<PayoutAccount>({
    bankName: "",
    accountNumber: "",
    holderName: "",
    updatedAt: null,
  });
  const [manufacturerRate, setManufacturerRate] = useState<string>("60");
  const [devopsRate, setDevopsRate] = useState<string>("10");
  const [salesmanRate, setSalesmanRate] = useState<string>("10");
  const [adminRate, setAdminRate] = useState<string>("20");
  const savedRef = useRef({
    data: {
      bankName: "",
      accountNumber: "",
      holderName: "",
      updatedAt: null as string | null,
    },
    manufacturerRate: "60",
    devopsRate: "10",
    salesmanRate: "10",
    adminRate: "20",
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
        const pa = (profile.salesmanPayoutAccount || {}) as Record<
          string,
          unknown
        >;
        setData({
          bankName: String(pa?.bankName || ""),
          accountNumber: String(pa?.accountNumber || ""),
          holderName: String(pa?.holderName || ""),
          updatedAt: pa?.updatedAt ? String(pa.updatedAt) : null,
        });
        const ds: DevopsSettings =
          (profile.devopsPayoutSettings as DevopsSettings) || {};
        const snap = {
          data: {
            bankName: String(pa?.bankName || ""),
            accountNumber: String(pa?.accountNumber || ""),
            holderName: String(pa?.holderName || ""),
            updatedAt: pa?.updatedAt ? String(pa.updatedAt) : null,
          },
          manufacturerRate: String(
            Math.round(Number(ds?.manufacturerRate ?? 0.6) * 100),
          ),
          devopsRate: String(Math.round(Number(ds?.devopsRate ?? 0.1) * 100)),
          salesmanRate: String(
            Math.round(Number(ds?.salesmanRate ?? 0.1) * 100),
          ),
          adminRate: String(Math.round(Number(ds?.adminRate ?? 0.2) * 100)),
        };
        savedRef.current = snap;
        setManufacturerRate(snap.manufacturerRate);
        setDevopsRate(snap.devopsRate);
        setSalesmanRate(snap.salesmanRate);
        setAdminRate(snap.adminRate);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [token]);

  const rateTotal = useMemo(() => {
    const nums = [manufacturerRate, devopsRate, salesmanRate, adminRate].map(
      (v) => Number(v),
    );
    if (nums.some((n) => !Number.isFinite(n))) return null;
    return nums.reduce((a, b) => a + b, 0);
  }, [adminRate, devopsRate, manufacturerRate, salesmanRate]);

  const rateTotalOk = rateTotal !== null && Math.abs(rateTotal - 100) <= 0.01;

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

  const validate = (v: PayoutAccount) => {
    const bankName = v.bankName.trim();
    const holderName = v.holderName.trim();
    const accountNumber = v.accountNumber.replace(/\s/g, "").trim();

    const allEmpty = !bankName && !holderName && !accountNumber;
    if (allEmpty) {
      return {
        ok: true as const,
        normalized: { bankName: "", holderName: "", accountNumber: "" },
      };
    }

    if (!bankName || !holderName || !accountNumber) {
      return {
        ok: false as const,
        message: "은행/계좌번호/예금주를 모두 입력해주세요.",
      };
    }

    return {
      ok: true as const,
      normalized: { bankName, holderName, accountNumber },
    };
  };

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

    const v = validate(data);
    if (!v.ok) {
      toast({
        title: "입력값을 확인해주세요",
        description: v.message,
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    const mfrNum = Number(manufacturerRate);
    const devopsNum = Number(devopsRate);
    const salesmanNum = Number(salesmanRate);
    const adminNum = Number(adminRate);
    const allRates = [mfrNum, devopsNum, salesmanNum, adminNum];
    if (allRates.some((r) => !Number.isFinite(r) || r < 0 || r > 100)) {
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
    setSaving(true);
    try {
      const res = await request<{ message?: string; [key: string]: unknown }>({
        path: "/api/users/profile",
        method: "PUT",
        token,
        jsonBody: {
          salesmanPayoutAccount: {
            bankName: v.normalized.bankName,
            accountNumber: v.normalized.accountNumber,
            holderName: v.normalized.holderName,
          },
          devopsPayoutSettings: {
            manufacturerRate: mfrNum / 100,
            devopsRate: devopsNum / 100,
            salesmanRate: salesmanNum / 100,
            adminRate: adminNum / 100,
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
      const newData = { ...v.normalized, updatedAt: now } as PayoutAccount;
      setData((prev) => ({ ...prev, ...newData }));
      setManufacturerRate(String(mfrNum));
      setDevopsRate(String(devopsNum));
      setSalesmanRate(String(salesmanNum));
      setAdminRate(String(adminNum));
      savedRef.current = {
        data: {
          bankName: v.normalized.bankName,
          accountNumber: v.normalized.accountNumber,
          holderName: v.normalized.holderName,
          updatedAt: now,
        },
        manufacturerRate: String(mfrNum),
        devopsRate: String(devopsNum),
        salesmanRate: String(salesmanNum),
        adminRate: String(adminNum),
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
          수익 분배
        </CardTitle>
        <CardDescription>
          매출 100% 기준 분배율과 입금 계좌를 관리합니다.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-8">
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold tracking-tight">분배율</h3>
            <Badge
              variant="outline"
              className={cn(
                "tabular-nums font-medium",
                rateTotalOk
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700",
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

        <section className="space-y-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold tracking-tight">입금 계좌</h3>
            <p className="text-sm text-muted-foreground">
              개발운영사 분배금 수령 계좌
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="devops-bank">은행</Label>
              <Input
                id="devops-bank"
                value={data.bankName}
                onChange={(e) =>
                  setData((p) => ({ ...p, bankName: e.target.value }))
                }
                placeholder="예: 국민은행"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="devops-account">계좌번호</Label>
              <Input
                id="devops-account"
                value={data.accountNumber}
                onChange={(e) =>
                  setData((p) => ({ ...p, accountNumber: e.target.value }))
                }
                placeholder="숫자만 입력"
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="devops-holder">예금주</Label>
              <Input
                id="devops-holder"
                value={data.holderName}
                onChange={(e) =>
                  setData((p) => ({ ...p, holderName: e.target.value }))
                }
              />
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
          <div className="text-xs text-muted-foreground">
            {data.updatedAt
              ? `마지막 저장 · ${new Date(data.updatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`
              : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const s = savedRef.current;
                setData(s.data);
                setManufacturerRate(s.manufacturerRate);
                setDevopsRate(s.devopsRate);
                setSalesmanRate(s.salesmanRate);
                setAdminRate(s.adminRate);
              }}
              disabled={saving}
            >
              취소
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? "저장 중…" : "저장"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
