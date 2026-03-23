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
  manufacturerRate?: number; // 0~1 (e.g. 0.65 = 65%)
  baseCommissionRate?: number; // 0~1 (e.g. 0.05 = 5%)
  salesmanDirectRate?: number; // 0~1 (e.g. 0.05 = 5%)
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
  const [manufacturerRate, setManufacturerRate] = useState<string>("65");
  const [baseRate, setBaseRate] = useState<string>("5");
  const [salesmanRate, setSalesmanRate] = useState<string>("5");

  // 직전 저장 스냅샷 (취소 시 복원 기준)
  const savedRef = useRef({
    data: {
      bankName: "",
      accountNumber: "",
      holderName: "",
      updatedAt: null as string | null,
    },
    manufacturerRate: "65",
    baseRate: "5",
    salesmanRate: "5",
  });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!token) {
        if (mounted) setLoading(false);
        return;
      }
      try {
        const res = await request<any>({
          path: "/api/users/profile",
          method: "GET",
          token,
        });
        if (!res.ok || !mounted) return;
        const body: any = res.data || {};
        const profile = body.data || body;
        const pa = profile?.salesmanPayoutAccount || {};
        setData({
          bankName: String(pa?.bankName || ""),
          accountNumber: String(pa?.accountNumber || ""),
          holderName: String(pa?.holderName || ""),
          updatedAt: pa?.updatedAt ? String(pa.updatedAt) : null,
        });
        const ds: DevopsSettings = profile?.devopsPayoutSettings || {};
        const snap = {
          data: {
            bankName: String(pa?.bankName || ""),
            accountNumber: String(pa?.accountNumber || ""),
            holderName: String(pa?.holderName || ""),
            updatedAt: pa?.updatedAt ? String(pa.updatedAt) : null,
          },
          manufacturerRate: String(
            Math.round(Number(ds?.manufacturerRate ?? 0.65) * 100),
          ),
          baseRate: String(
            Math.round(Number(ds?.baseCommissionRate ?? 0.05) * 100),
          ),
          salesmanRate: String(
            Math.round(Number(ds?.salesmanDirectRate ?? 0.05) * 100),
          ),
        };
        savedRef.current = snap;
        setManufacturerRate(snap.manufacturerRate);
        setBaseRate(snap.baseRate);
        setSalesmanRate(snap.salesmanRate);
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
    const rateNum = Number(baseRate);
    const salesmanNum = Number(salesmanRate);
    const allRates = [mfrNum, rateNum, salesmanNum];
    if (allRates.some((r) => !Number.isFinite(r) || r < 0 || r > 100)) {
      toast({
        title: "수수료율 오류",
        description: "수수료율은 0~100% 범위여야 합니다.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    const maxTotal = mfrNum + rateNum * 2 + salesmanNum * 1.5;
    if (maxTotal > 100) {
      toast({
        title: "분배율 초과",
        description: `합계가 100%를 초과합니다. (현재 최대 ${maxTotal.toFixed(1)}%)`,
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    setSaving(true);
    try {
      const res = await request<any>({
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
            baseCommissionRate: rateNum / 100,
            salesmanDirectRate: salesmanNum / 100,
          },
        },
      });

      if (!res.ok) {
        const msg = String(
          (res.data as any)?.message || "저장에 실패했습니다.",
        );
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
      } catch {}

      if (token) {
        void loginWithToken(token);
      }

      const now = new Date().toISOString();
      const newData = { ...v.normalized, updatedAt: now } as PayoutAccount;
      setData((prev) => ({ ...prev, ...newData }));
      setManufacturerRate(String(mfrNum));
      setBaseRate(String(rateNum));
      setSalesmanRate(String(salesmanNum));
      savedRef.current = {
        data: {
          bankName: v.normalized.bankName,
          accountNumber: v.normalized.accountNumber,
          holderName: v.normalized.holderName,
          updatedAt: now,
        },
        manufacturerRate: String(mfrNum),
        baseRate: String(rateNum),
        salesmanRate: String(salesmanNum),
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
                <span>기본</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={baseRate}
                  onChange={(e) => setBaseRate(e.target.value)}
                  className="h-7 w-16 text-center text-sm px-1"
                />
                <span>% + 미설정</span>
                <span className="font-medium">
                  {isNaN(Number(salesmanRate)) ? "?" : salesmanRate}%
                </span>
                <span className="text-muted-foreground">= 최대</span>
                <span className="font-medium">
                  {isNaN(Number(baseRate)) || isNaN(Number(salesmanRate))
                    ? "?"
                    : Number(baseRate) + Number(salesmanRate)}
                  %
                </span>
              </div>
              <div className="text-xs pl-36 text-muted-foreground">
                영업자 소개 없는 의뢰자에 대해 영업자 수수료와 동일한 효과
              </div>
            </div>
            <div />

            {/* 영업자 */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-foreground">
                <span className="w-36 shrink-0 text-muted-foreground">
                  영업자(법인/개인)
                </span>
                <span>직접</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={salesmanRate}
                  onChange={(e) => setSalesmanRate(e.target.value)}
                  className="h-7 w-16 text-center text-sm px-1"
                />
                <span>% · 간접</span>
                <span className="font-medium">
                  {isNaN(Number(salesmanRate))
                    ? "?"
                    : (Number(salesmanRate) / 2).toFixed(1)}
                  %
                </span>
                <span className="text-muted-foreground">= 최대</span>
                <span className="font-medium">
                  {isNaN(Number(salesmanRate))
                    ? "?"
                    : (Number(salesmanRate) * 1.5).toFixed(1)}
                  %
                </span>
              </div>
              <div className="text-xs pl-36 text-muted-foreground">
                직접 소개 / 하위 영업자의 의뢰자 간접 소개
              </div>
            </div>
            <div />

            {/* 관리자 자동 계산 */}
            {(() => {
              const mfr = Number(manufacturerRate);
              const base = Number(baseRate);
              const sal = Number(salesmanRate);
              // \uc601\uc5c5\uc790\uc640 \uac1c\ubc1c\uc6b4\uc601\uc0ac \uc218\uc218\ub8cc\ub294 \ub3d9\uc77c \uac70\ub798\uc5d0 \uc911\ubcf5 \ud569\uc0b0\ub418\uc9c0 \uc54a\uc74c
              // \ucd5c\uc18c: \uac1c\ubc1c\uc6b4\uc601\uc0ac \uae30\ubcf8 + \uc601\uc5c5\uc790 \ucd5c\ub300(direct\xd71.5)\uc77c \ub54c
              // 영업자와 개발운영사 수수료는 동일 거래에 중복 합산되지 않음
              // 최소: 개발운영사 기본 + 영업자 최대(direct×1.5)일 때
              // 최대: 영업자 0, 개발운영사 기본+미설정(=기본+salesmanRate)일 때
              const adminMin = 100 - mfr - base - sal * 1.5;
              const adminMax = 100 - mfr - base - sal;
              const valid = [mfr, base, sal].every(Number.isFinite);
              return (
                <div className="flex items-center gap-2">
                  <span className="w-36 shrink-0 text-muted-foreground">
                    관리자(어벗츠)
                  </span>
                  <span className="font-medium text-foreground">
                    {valid
                      ? `${adminMin.toFixed(1)}~${adminMax.toFixed(1)}%`
                      : "?%"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    (자동 계산)
                  </span>
                </div>
              );
            })()}
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
                setBaseRate(s.baseRate);
                setSalesmanRate(s.salesmanRate);
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
