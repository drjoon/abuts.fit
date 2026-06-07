import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Landmark } from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";

type PayoutAccount = {
  bankName: string;
  accountNumber: string;
  holderName: string;
  updatedAt?: string | null;
};

type DevopsSettings = {
  manufacturerRate?: number; // 0~1 (e.g. 0.60 = 60%)
  devopsRate?: number; // 0~1 (e.g. 0.10 = 10%)
  salesmanRate?: number; // 0~1 (e.g. 0.10 = 10%)
  adminRate?: number; // 0~1 (e.g. 0.20 = 20%)
  updatedAt?: string | null;
};

export const DevopsPayoutAccountTab = () => {
  const { toast } = useToast();
  const { token, user, loginWithToken } = useAuthStore();

  const mockHeaders = useMemo(() => {
    return {} as Record<string, string>;
  }, []);

  const [loading, setLoading] = useState(Boolean(token));
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<PayoutAccount>({
    bankName: "",
    accountNumber: "",
    holderName: "",
    updatedAt: null,
  });
  // 분배율 — 0~100 정수(퍼센트) 단위로 관리
  const [manufacturerRate, setManufacturerRate] = useState<string>("60");
  const [devopsRate, setDevopsRate] = useState<string>("10");
  const [salesmanRate, setSalesmanRate] = useState<string>("10");
  const [adminRate, setAdminRate] = useState<string>("20");
  // 직전 저장 스냅샷 (취소 시 복원 기준)
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

  const validate = (v: PayoutAccount) => {
    const bankName = v.bankName.trim();
    const holderName = v.holderName.trim();
    const accountNumber = v.accountNumber.replace(/\s/g, "").trim();

    const allEmpty = !bankName && !holderName && !accountNumber;
    if (allEmpty) {
      return {
        ok: true,
        normalized: { bankName: "", holderName: "", accountNumber: "" },
      };
    }

    if (!bankName || !holderName || !accountNumber) {
      return {
        ok: false,
        message: "은행/계좌번호/예금주를 모두 입력해주세요.",
      };
    }

    return { ok: true, normalized: { bankName, holderName, accountNumber } };
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
        headers: mockHeaders,
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
        <CardContent className="py-8 text-sm text-muted-foreground">
          불러오는 중...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="h-5 w-5" />
          수익 분배
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border border-dashed p-4 space-y-3 text-sm text-muted-foreground">
          <div className="font-semibold text-foreground">
            현재 분배 규칙 (매출 100% 기준)
          </div>
          <div className="grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-3">
            {/* 제조사 */}
            <div className="flex items-center gap-2 text-foreground">
              <span className="w-36 shrink-0 text-muted-foreground">
                제조사(애크로덴트)
              </span>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={manufacturerRate}
                onChange={(e) => setManufacturerRate(e.target.value)}
                className="h-7 w-16 text-center text-sm px-1"
              />
              <span>%</span>
            </div>
            <div />

            {/* 개발운영사 */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-foreground">
                <span className="w-36 shrink-0 text-muted-foreground">
                  개발운영사(메이븐)
                </span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={devopsRate}
                  onChange={(e) => setDevopsRate(e.target.value)}
                  className="h-7 w-16 text-center text-sm px-1"
                />
                <span>%</span>
              </div>
              <div className="text-xs pl-36 text-muted-foreground">
                유료의뢰비 기준 개발·운영사 분배율
              </div>
            </div>
            <div />

            {/* 영업자 */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-foreground">
                <span className="w-36 shrink-0 text-muted-foreground">
                  영업자(법인/개인)
                </span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={salesmanRate}
                  onChange={(e) => setSalesmanRate(e.target.value)}
                  className="h-7 w-16 text-center text-sm px-1"
                />
                <span>%</span>
              </div>
              <div className="text-xs pl-36 text-muted-foreground">
                영업자 직접 소개 의뢰자 분배율
              </div>
            </div>
            <div />

            <div className="flex items-center gap-2 text-foreground">
              <span className="w-36 shrink-0 text-muted-foreground">
                관리자(어벗츠)
              </span>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={adminRate}
                onChange={(e) => setAdminRate(e.target.value)}
                className="h-7 w-16 text-center text-sm px-1"
              />
              <span>%</span>
            </div>
            <div />
          </div>
          <div className="text-xs text-muted-foreground">
            분배비는 개발운영사 설정에서 관리하며, 필요 시 관리자와 협의 후
            변경될 수 있습니다.
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          개발운영사 수익 분배금을 입금받을 계좌 정보를 입력해주세요.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="devops-bank">은행</Label>
            <Input
              id="devops-bank"
              value={data.bankName}
              onChange={(e) =>
                setData((p) => ({ ...p, bankName: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="devops-account">계좌번호</Label>
            <Input
              id="devops-account"
              value={data.accountNumber}
              onChange={(e) =>
                setData((p) => ({ ...p, accountNumber: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
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

        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="text-xs text-muted-foreground">
            {data.updatedAt
              ? `마지막 저장: ${new Date(data.updatedAt).toLocaleString()}`
              : ""}
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
              {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
