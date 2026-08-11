// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/devops/DevopsSettingsPage.tsx
// - web/frontend/src/pages/salesman/components/SalesmanPayoutAccountTab.tsx
import { useEffect, useRef, useState } from "react";
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

export const DevopsDepositAccountTab = () => {
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
  const savedRef = useRef<PayoutAccount>({
    bankName: "",
    accountNumber: "",
    holderName: "",
    updatedAt: null,
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
        const next = {
          bankName: String(pa?.bankName || ""),
          accountNumber: String(pa?.accountNumber || ""),
          holderName: String(pa?.holderName || ""),
          updatedAt: pa?.updatedAt ? String(pa.updatedAt) : null,
        };
        setData(next);
        savedRef.current = next;
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
      savedRef.current = {
        bankName: v.normalized.bankName,
        accountNumber: v.normalized.accountNumber,
        holderName: v.normalized.holderName,
        updatedAt: now,
      };
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    data.bankName !== savedRef.current.bankName ||
    data.accountNumber !== savedRef.current.accountNumber ||
    data.holderName !== savedRef.current.holderName;

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
          입금 계좌
        </CardTitle>
        <CardDescription>개발운영사 분배금 수령 계좌</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
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
              onClick={() => setData(savedRef.current)}
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
