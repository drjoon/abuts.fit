import { useEffect, useMemo, useState } from "react";
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

export const SalesmanPayoutAccountTab = () => {
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
      setData((prev) => ({ ...prev, ...v.normalized, updatedAt: now }));
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
          입금 계좌
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          소개 수수료를 입금받을 계좌 정보를 입력해주세요.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="salesman-bank">은행</Label>
            <Input
              id="salesman-bank"
              value={data.bankName}
              onChange={(e) =>
                setData((p) => ({ ...p, bankName: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="salesman-account">계좌번호</Label>
            <Input
              id="salesman-account"
              value={data.accountNumber}
              onChange={(e) =>
                setData((p) => ({ ...p, accountNumber: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="salesman-holder">예금주</Label>
            <Input
              id="salesman-holder"
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
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "저장 중..." : "저장"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
