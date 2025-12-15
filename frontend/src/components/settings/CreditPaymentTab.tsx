import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { request } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { loadPaymentWidget } from "@tosspayments/payment-widget-sdk";

type Props = {
  userData: {
    id?: string;
    name?: string;
    email?: string;
  };
};

type CreditOrderResponse = {
  success: boolean;
  data?: {
    id: string;
    orderId: string;
    status: string;
    supplyAmount: number;
    vatAmount: number;
    totalAmount: number;
  };
  message?: string;
};

type CreditOrderItem = {
  _id?: string;
  orderId: string;
  status: string;
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
  paymentKey?: string | null;
  approvedAt?: string | null;
  depositedAt?: string | null;
  virtualAccount?: {
    bank?: string;
    accountNumber?: string;
    customerName?: string;
    dueDate?: string;
  };
  refundedSupplyAmount?: number;
  refundedVatAmount?: number;
  refundedTotalAmount?: number;
  createdAt?: string;
};

const BANK_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "06", label: "국민" },
  { code: "88", label: "신한" },
  { code: "20", label: "우리" },
  { code: "81", label: "하나" },
  { code: "11", label: "농협" },
  { code: "03", label: "기업" },
  { code: "90", label: "카카오" },
  { code: "92", label: "토스" },
];

function roundVat(supply: number) {
  return Math.round(supply * 0.1);
}

function validateSupplyAmount(supply: number) {
  if (!Number.isFinite(supply) || supply <= 0)
    return "유효하지 않은 금액입니다.";

  const MIN = 500000;
  const MAX = 5000000;
  if (supply < MIN || supply > MAX) {
    return "크레딧 충전 금액은 50만원 ~ 500만원 범위여야 합니다.";
  }

  if (supply <= 1000000) {
    if (supply % 500000 !== 0)
      return "100만원 이하는 50만원 단위로만 충전할 수 있습니다.";
  } else {
    if (supply % 1000000 !== 0)
      return "100만원 초과는 100만원 단위로만 충전할 수 있습니다.";
  }

  return null;
}

export const CreditPaymentTab = ({ userData }: Props) => {
  const { toast } = useToast();
  const { token, user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const [pendingOrder, setPendingOrder] = useState<{
    orderId: string;
    amount: number;
    supplyAmount: number;
  } | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paymentWidget, setPaymentWidget] = useState<any>(null);

  const resetPaymentWidget = () => {
    setPendingOrder(null);
    setWidgetReady(false);
    setPaying(false);
    setPaymentWidget(null);

    try {
      const pm = document.querySelector("#toss-payment-methods");
      if (pm instanceof HTMLElement) pm.innerHTML = "";
      const ag = document.querySelector("#toss-agreement");
      if (ag instanceof HTMLElement) ag.innerHTML = "";
    } catch {
      // ignore
    }
  };

  const [balance, setBalance] = useState<number>(0);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const [orders, setOrders] = useState<CreditOrderItem[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const [selectedSupply, setSelectedSupply] = useState<number>(500000);
  const [customSupply, setCustomSupply] = useState<string>("");
  const supplyAmount = useMemo(() => {
    const raw = customSupply.trim();
    if (!raw) return selectedSupply;
    const asNumber = Number(raw);
    return Number.isFinite(asNumber) ? asNumber : selectedSupply;
  }, [customSupply, selectedSupply]);

  const totalAmount = useMemo(
    () => supplyAmount + roundVat(supplyAmount),
    [supplyAmount]
  );

  const [creatingOrder, setCreatingOrder] = useState(false);

  const [refundSupplyAmount, setRefundSupplyAmount] = useState<string>("");
  const [refundBankCode, setRefundBankCode] = useState<string>(
    BANK_OPTIONS[0]?.code || ""
  );
  const [refundAccountNumber, setRefundAccountNumber] = useState<string>("");
  const [refundHolderName, setRefundHolderName] = useState<string>("");
  const [refunding, setRefunding] = useState(false);

  const tossClientKey = String(
    (import.meta as any).env?.VITE_TOSS_CLIENT_KEY || ""
  ).trim();

  const successUrl = useMemo(() => {
    const origin = window.location.origin;
    return `${origin}/dashboard/settings?tab=payment`;
  }, []);

  const failUrl = useMemo(() => {
    const origin = window.location.origin;
    return `${origin}/dashboard/settings?tab=payment&payResult=fail`;
  }, []);

  const customerKey = useMemo(() => {
    return String(userData?.id || user?.id || user?.email || "guest").trim();
  }, [user?.email, user?.id, userData?.id]);

  const reloadBalance = async () => {
    if (!token) return;
    setLoadingBalance(true);
    try {
      const res = await request<any>({
        path: "/api/credits/balance",
        method: "GET",
        token,
      });
      if (!res.ok) throw new Error("balance fetch failed");
      const body: any = res.data || {};
      const data = body.data || body;
      setBalance(Number(data?.balance || 0));
    } catch {
      // ignore
    } finally {
      setLoadingBalance(false);
    }
  };

  const reloadOrders = async () => {
    if (!token) return;
    setLoadingOrders(true);
    try {
      const res = await request<any>({
        path: "/api/credits/orders",
        method: "GET",
        token,
      });
      if (!res.ok) throw new Error("orders fetch failed");
      const body: any = res.data || {};
      const data = body.data || body;
      setOrders(Array.isArray(data) ? (data as CreditOrderItem[]) : []);
    } catch {
      // ignore
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    reloadBalance();
    reloadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const payResult = searchParams.get("payResult");
    const code = searchParams.get("code");
    const message = searchParams.get("message");

    if (payResult === "fail") {
      toast({
        title: "결제에 실패했습니다",
        description:
          message || code || "결제 요청이 취소되었거나 실패했습니다.",
        variant: "destructive",
      });
      resetPaymentWidget();
      setSearchParams({ tab: "payment" });
      return;
    }

    const paymentKey = searchParams.get("paymentKey");
    const orderId = searchParams.get("orderId");
    const amount = searchParams.get("amount");

    if (!paymentKey || !orderId || !amount) return;
    if (!token) return;

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount)) return;

    const run = async () => {
      try {
        const res = await request<any>({
          path: "/api/credits/payments/confirm",
          method: "POST",
          token,
          jsonBody: {
            paymentKey,
            orderId,
            amount: parsedAmount,
          },
        });

        if (!res.ok) {
          const body: any = res.data || {};
          throw new Error(body?.message || "결제 승인에 실패했습니다.");
        }

        await reloadBalance();
        await reloadOrders();
        toast({
          title: "결제 요청이 완료되었습니다",
          description: "입금 완료 후 크레딧이 자동 충전됩니다.",
        });
        resetPaymentWidget();
        setSearchParams({ tab: "payment" });
      } catch (e: any) {
        toast({
          title: "결제 승인 처리 실패",
          description: String(e?.message || "결제 승인 처리에 실패했습니다."),
          variant: "destructive",
        });
        resetPaymentWidget();
        setSearchParams({ tab: "payment" });
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, token]);

  const handleCharge = async () => {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        description: "크레딧 충전은 로그인 후 이용할 수 있습니다.",
        variant: "destructive",
      });
      return;
    }

    const validationError = validateSupplyAmount(supplyAmount);
    if (validationError) {
      toast({
        title: "금액을 확인해주세요",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    if (!tossClientKey) {
      toast({
        title: "결제 설정이 필요합니다",
        description: "VITE_TOSS_CLIENT_KEY 환경변수를 설정해주세요.",
        variant: "destructive",
      });
      return;
    }

    setCreatingOrder(true);
    try {
      const res = await request<CreditOrderResponse>({
        path: "/api/credits/orders",
        method: "POST",
        token,
        jsonBody: { supplyAmount },
      });

      if (!res.ok) {
        const body: any = res.data || {};
        throw new Error(body?.message || "주문 생성에 실패했습니다.");
      }

      const body: any = res.data || {};
      const data = body.data || body;
      const orderId = String(data?.orderId || "");
      const amount = Number(data?.totalAmount);

      if (!orderId || !Number.isFinite(amount)) {
        throw new Error("주문 정보가 올바르지 않습니다.");
      }

      setPendingOrder({ orderId, amount, supplyAmount });
    } catch (e: any) {
      toast({
        title: "충전 요청 실패",
        description: String(e?.message || "충전 요청에 실패했습니다."),
        variant: "destructive",
      });
    } finally {
      setCreatingOrder(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      if (!pendingOrder) return;
      if (!tossClientKey) return;

      setWidgetReady(false);

      try {
        const widget: any = await loadPaymentWidget(tossClientKey, customerKey);
        setPaymentWidget(widget);

        try {
          const pm = document.querySelector("#toss-payment-methods");
          if (pm instanceof HTMLElement) pm.innerHTML = "";
          const ag = document.querySelector("#toss-agreement");
          if (ag instanceof HTMLElement) ag.innerHTML = "";

          widget.renderPaymentMethods("#toss-payment-methods", {
            value: pendingOrder.amount,
          });
          widget.renderAgreement("#toss-agreement");
        } catch {
          // ignore
        }

        setWidgetReady(true);
      } catch (e: any) {
        toast({
          title: "결제 위젯 로드 실패",
          description: String(e?.message || "결제 위젯 로드에 실패했습니다."),
          variant: "destructive",
        });
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOrder?.orderId, pendingOrder?.amount, tossClientKey, customerKey]);

  const handlePayNow = async () => {
    if (!pendingOrder || !paymentWidget) return;
    if (!widgetReady) return;
    setPaying(true);
    try {
      await paymentWidget.requestPayment({
        orderId: pendingOrder.orderId,
        orderName: `크레딧 충전 ${Math.floor(
          pendingOrder.supplyAmount / 10000
        )}만원`,
        successUrl,
        failUrl,
        customerName: userData?.name || user?.name || "사용자",
        customerEmail: userData?.email || user?.email || "",
      });
    } catch (e: any) {
      toast({
        title: "결제 요청 실패",
        description: String(e?.message || "결제 요청에 실패했습니다."),
        variant: "destructive",
      });
    } finally {
      setPaying(false);
    }
  };

  const handleRefund = async () => {
    if (!token) {
      toast({ title: "로그인이 필요합니다", variant: "destructive" });
      return;
    }

    const desired = refundSupplyAmount.trim()
      ? Number(refundSupplyAmount.trim())
      : undefined;
    if (desired !== undefined && (!Number.isFinite(desired) || desired <= 0)) {
      toast({ title: "환불 금액을 확인해주세요", variant: "destructive" });
      return;
    }

    if (
      !refundBankCode ||
      !refundAccountNumber.trim() ||
      !refundHolderName.trim()
    ) {
      toast({ title: "환불 계좌 정보를 입력해주세요", variant: "destructive" });
      return;
    }

    setRefunding(true);
    try {
      const res = await request<any>({
        path: "/api/credits/refunds",
        method: "POST",
        token,
        jsonBody: {
          refundSupplyAmount: desired,
          refundReceiveAccount: {
            bankCode: refundBankCode,
            accountNumber: refundAccountNumber.trim(),
            holderName: refundHolderName.trim(),
          },
        },
      });

      if (!res.ok) {
        const body: any = res.data || {};
        throw new Error(body?.message || "환불 요청에 실패했습니다.");
      }

      await reloadBalance();
      await reloadOrders();

      toast({
        title: "환불 요청이 접수되었습니다",
        description: "가상계좌 환불은 영업일 기준 시간이 소요될 수 있습니다.",
      });

      setRefundSupplyAmount("");
    } catch (e: any) {
      toast({
        title: "환불 요청 실패",
        description: String(e?.message || "환불 요청에 실패했습니다."),
        variant: "destructive",
      });
    } finally {
      setRefunding(false);
    }
  };

  const cancelOrder = async (orderId: string) => {
    if (!token) return;
    try {
      const res = await request<any>({
        path: `/api/credits/orders/${encodeURIComponent(orderId)}/cancel`,
        method: "POST",
        token,
      });

      if (!res.ok) {
        const body: any = res.data || {};
        throw new Error(body?.message || "주문 취소에 실패했습니다.");
      }

      await reloadOrders();
      await reloadBalance();
      toast({
        title: "주문 취소 완료",
        description: "주문이 취소되었습니다.",
      });
    } catch (e: any) {
      toast({
        title: "주문 취소 실패",
        description: String(e?.message || "주문 취소에 실패했습니다."),
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="relative flex flex-col rounded-2xl border border-gray-200 bg-white/80 shadow-sm transition-all hover:shadow-lg">
      <CardHeader>
        <CardTitle>크레딧 결제</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">
            보유 크레딧(공급가)
          </div>
          <div className="text-2xl font-semibold">
            {loadingBalance ? "..." : `${balance.toLocaleString()}원`}
          </div>
          <div className="text-sm text-muted-foreground">
            결제는 크레딧 차감으로 진행되며, 부가세는 크레딧 충전 시점에
            포함되어 결제됩니다.
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="text-lg font-medium">충전 내역</div>
          {loadingOrders ? (
            <div className="text-sm text-muted-foreground">불러오는 중...</div>
          ) : orders.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              충전 내역이 없습니다.
            </div>
          ) : (
            <div className="space-y-2">
              {orders.slice(0, 5).map((o) => {
                const bank = o.virtualAccount?.bank || "";
                const acc = o.virtualAccount?.accountNumber || "";
                const due = o.virtualAccount?.dueDate || "";
                const isWaiting = o.status === "WAITING_FOR_DEPOSIT";
                const canCancel =
                  o.status === "WAITING_FOR_DEPOSIT" || o.status === "CREATED";

                return (
                  <div
                    key={o.orderId}
                    className="rounded-lg border border-gray-200 bg-white p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">{o.orderId}</div>
                      <div className="text-sm text-muted-foreground">
                        {o.status}
                      </div>
                    </div>
                    <div className="mt-1 text-sm">
                      결제금액(부가세 포함):{" "}
                      <span className="font-semibold">
                        {Number(o.totalAmount || 0).toLocaleString()}원
                      </span>
                    </div>
                    {isWaiting && (bank || acc) && (
                      <div className="mt-2 text-sm text-muted-foreground">
                        입금계좌: {bank} {acc}
                        {due ? ` (기한: ${due})` : ""}
                      </div>
                    )}

                    {canCancel && (
                      <div className="mt-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => cancelOrder(o.orderId)}
                        >
                          주문 취소
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            가상계좌는 입금 완료 후 웹훅으로 자동 충전됩니다.
          </div>
        </div>

        <div className="space-y-4">
          <div className="text-lg font-medium">크레딧 충전</div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={
                selectedSupply === 500000 && !customSupply
                  ? "default"
                  : "outline"
              }
              onClick={() => {
                setSelectedSupply(500000);
                setCustomSupply("");
              }}
            >
              50만원
            </Button>
            <Button
              type="button"
              variant={
                selectedSupply === 1000000 && !customSupply
                  ? "default"
                  : "outline"
              }
              onClick={() => {
                setSelectedSupply(1000000);
                setCustomSupply("");
              }}
            >
              100만원
            </Button>
            <Button
              type="button"
              variant={
                selectedSupply === 2000000 && !customSupply
                  ? "default"
                  : "outline"
              }
              onClick={() => {
                setSelectedSupply(2000000);
                setCustomSupply("");
              }}
            >
              200만원
            </Button>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="customSupply">사용자 입력(공급가)</Label>
            <Input
              id="customSupply"
              inputMode="numeric"
              placeholder="예: 500000"
              value={customSupply}
              onChange={(e) => setCustomSupply(e.target.value)}
            />
            <div className="text-sm text-muted-foreground">
              50만~100만: 50만원 단위 / 100만 초과~500만: 100만원 단위
            </div>
          </div>

          <div className="text-sm">
            결제금액(부가세 포함):{" "}
            <span className="font-semibold">
              {totalAmount.toLocaleString()}원
            </span>
          </div>

          <Button
            type="button"
            className="w-full"
            onClick={handleCharge}
            disabled={creatingOrder}
          >
            {creatingOrder ? "요청 중..." : "충전하기"}
          </Button>

          {pendingOrder && (
            <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
              <div className="text-sm text-muted-foreground">
                결제 수단 선택 후 결제를 진행하세요. (결제금액:{" "}
                {pendingOrder.amount.toLocaleString()}원)
              </div>
              <div id="toss-payment-methods" />
              <div id="toss-agreement" />
              <Button
                type="button"
                className="w-full"
                onClick={handlePayNow}
                disabled={!widgetReady || paying}
              >
                {paying ? "진행 중..." : "결제 진행"}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={resetPaymentWidget}
              >
                닫기
              </Button>
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="text-lg font-medium">크레딧 환불</div>

          <div className="grid gap-2">
            <Label htmlFor="refundSupply">환불할 크레딧(공급가)</Label>
            <Input
              id="refundSupply"
              inputMode="numeric"
              placeholder={`비우면 전액 환불 (${balance.toLocaleString()}원)`}
              value={refundSupplyAmount}
              onChange={(e) => setRefundSupplyAmount(e.target.value)}
            />
            <div className="text-sm text-muted-foreground">
              환불 시 부가세는 환불 크레딧(공급가) 기준으로 10% 반올림하여 함께
              환불됩니다.
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>은행</Label>
              <Select value={refundBankCode} onValueChange={setRefundBankCode}>
                <SelectTrigger>
                  <SelectValue placeholder="은행 선택" />
                </SelectTrigger>
                <SelectContent>
                  {BANK_OPTIONS.map((b) => (
                    <SelectItem key={b.code} value={b.code}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="refundAccount">계좌번호</Label>
              <Input
                id="refundAccount"
                value={refundAccountNumber}
                onChange={(e) => setRefundAccountNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="refundHolder">예금주</Label>
              <Input
                id="refundHolder"
                value={refundHolderName}
                onChange={(e) => setRefundHolderName(e.target.value)}
              />
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleRefund}
            disabled={refunding}
          >
            {refunding ? "요청 중..." : "환불 요청"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export const PaymentTab = CreditPaymentTab;
