// related files:
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
// - web/backend/controllers/credits/credit.controller.js
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Landmark, Loader2 } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

export const LabSettlementPayoutTab = () => {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const [settlementCredit, setSettlementCredit] = useState(0);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await request<{
        data?: { settlementCredit?: number };
      }>({
        path: "/api/credits/balance",
        method: "GET",
        token,
      });
      if (!res.ok) return;
      const bal = Number(res.data?.data?.settlementCredit || 0);
      setSettlementCredit(bal);
      setAmount(bal > 0 ? String(bal) : "");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!token) return;
    const n = Math.round(Number(amount || 0));
    if (!Number.isFinite(n) || n <= 0) {
      toast({
        title: "정산 금액을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await request<{
        success?: boolean;
        message?: string;
      }>({
        path: "/api/credits/settlement-payout",
        method: "POST",
        token,
        jsonBody: { amount: n },
      });
      if (!res.ok) {
        toast({
          title: "정산 요청 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "결제크레딧 정산을 요청했습니다." });
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        불러오는 중…
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Landmark className="h-4 w-4" />
          결제크레딧 정산
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-slate-600">
          기공의뢰로 적립된 결제크레딧을 등록된 입금 계좌로 정산합니다.
          의뢰·배송 크레딧과 분리되어 있습니다.
        </p>
        <div>
          <p className="text-xs text-slate-500">결제크레딧 잔액</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">
            {settlementCredit.toLocaleString()}원
          </p>
        </div>
        <div className="max-w-xs">
          <Label htmlFor="settlement-amount">정산 금액 (원)</Label>
          <Input
            id="settlement-amount"
            type="number"
            min={0}
            className="mt-1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <Button
          onClick={() => void submit()}
          disabled={submitting || settlementCredit <= 0}
        >
          {submitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          정산 요청
        </Button>
      </CardContent>
    </Card>
  );
};
