import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { request } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";

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

type CreditSpendInsightsResponse = {
  success: boolean;
  data?: {
    windowDays: number;
    spentSupply90: number;
    avgDailySpendSupply: number;
    avgMonthlySpendSupply: number;
    estimatedDaysFor500k: number | null;
    hasUsageData: boolean;
    recommended: {
      oneMonthSupply: number;
      threeMonthsSupply: number;
    };
  };
  message?: string;
};

function roundVat(supply: number) {
  return Math.round(supply * 0.1);
}

function normalizeSupplyAmount(supply: number) {
  const MIN = 500000;
  const MAX = 5000000;
  if (!Number.isFinite(supply)) return MIN;

  const clamped = Math.min(MAX, Math.max(MIN, Math.round(supply)));
  return Math.round(clamped / 500000) * 500000;
}

function formatOrderShortId(orderId: string) {
  const raw = String(orderId || "");
  if (!raw) return "";
  const tail = raw.replace(/[^a-zA-Z0-9]/g, "");
  return tail.slice(-4).toUpperCase();
}

function formatKoreanDate(value?: string | null) {
  if (!value) return "";
  const t = new Date(String(value)).getTime();
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

function validateSupplyAmount(supply: number) {
  if (!Number.isFinite(supply) || supply <= 0)
    return "유효하지 않은 금액입니다.";

  const MIN = 500000;
  const MAX = 5000000;
  if (supply < MIN || supply > MAX) {
    return "크레딧 충전 금액은 50만원 ~ 500만원 범위여야 합니다.";
  }

  if (supply % 500000 !== 0)
    return "크레딧 충전 금액은 50만원 단위로만 충전할 수 있습니다.";

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
  const [paidBalance, setPaidBalance] = useState<number>(0);
  const [bonusBalance, setBonusBalance] = useState<number>(0);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const [orders, setOrders] = useState<CreditOrderItem[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersPeriod, setOrdersPeriod] = useState<PeriodFilterValue>("30d");

  const [spendInsights, setSpendInsights] = useState<
    CreditSpendInsightsResponse["data"] | null
  >(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  const reloadSpendInsights = async () => {
    if (!token) return;
    setLoadingInsights(true);
    try {
      const res = await request<CreditSpendInsightsResponse>({
        path: "/api/credits/insights/spend",
        method: "GET",
        token,
      });
      if (!res.ok) throw new Error("insights fetch failed");
      const body: any = res.data || {};
      const data = body.data || body;
      setSpendInsights(data || null);
    } catch {
      setSpendInsights(null);
    } finally {
      setLoadingInsights(false);
    }
  };

  const [selectedSupply, setSelectedSupply] = useState<number>(500000);
  const [selectedPlan, setSelectedPlan] = useState<"1m" | "3m">("1m");
  const supplyAmount = useMemo(() => selectedSupply, [selectedSupply]);

  const oneMonthSupply = useMemo(() => {
    return normalizeSupplyAmount(
      Number(spendInsights?.recommended?.oneMonthSupply || 500000)
    );
  }, [spendInsights?.recommended?.oneMonthSupply]);

  const threeMonthsSupply = useMemo(() => {
    return normalizeSupplyAmount(oneMonthSupply * 3);
  }, [oneMonthSupply]);

  useEffect(() => {
    setSelectedSupply(
      selectedPlan === "3m" ? threeMonthsSupply : oneMonthSupply
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlan, oneMonthSupply, threeMonthsSupply]);

  const totalAmount = useMemo(
    () => supplyAmount + roundVat(supplyAmount),
    [supplyAmount]
  );

  const filteredOrders = useMemo(() => {
    const now = Date.now();
    const daysMap: Record<Exclude<PeriodFilterValue, "all">, number> = {
      "7d": 7,
      "30d": 30,
      "90d": 90,
    };

    const items = Array.isArray(orders) ? orders : [];
    if (ordersPeriod === "all") {
      return [...items].sort((a, b) => {
        const ta = new Date(
          String(a.createdAt || a.approvedAt || a.depositedAt || 0)
        ).getTime();
        const tb = new Date(
          String(b.createdAt || b.approvedAt || b.depositedAt || 0)
        ).getTime();
        return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
      });
    }

    const days = daysMap[ordersPeriod];
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    return items
      .filter((o) => {
        const t = new Date(
          String(o.createdAt || o.approvedAt || o.depositedAt || "")
        ).getTime();
        if (!Number.isFinite(t)) return true;
        return t >= cutoff;
      })
      .sort((a, b) => {
        const ta = new Date(
          String(a.createdAt || a.approvedAt || a.depositedAt || 0)
        ).getTime();
        const tb = new Date(
          String(b.createdAt || b.approvedAt || b.depositedAt || 0)
        ).getTime();
        return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
      });
  }, [orders, ordersPeriod]);

  const [creatingOrder, setCreatingOrder] = useState(false);

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
      setPaidBalance(Number(data?.paidBalance || 0));
      setBonusBalance(Number(data?.bonusBalance || 0));
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
    reloadSpendInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const hasChargedBefore = useMemo(() => {
    return orders.some((o) =>
      ["DONE", "REFUND_REQUESTED", "REFUNDED"].includes(String(o.status))
    );
  }, [orders]);

  const isFirstCharge = useMemo(() => {
    if (loadingOrders) return false;
    return !hasChargedBefore;
  }, [hasChargedBefore, loadingOrders]);

  useEffect(() => {
    if (loadingOrders) return;
    if (isFirstCharge) {
      setSelectedSupply(500000);
      return;
    }

    const oneMonth = Number(spendInsights?.recommended?.oneMonthSupply || 0);
    if (oneMonth && selectedSupply === 500000) {
      setSelectedSupply(oneMonth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isFirstCharge,
    loadingOrders,
    spendInsights?.recommended?.oneMonthSupply,
  ]);

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
        {!isFirstCharge && (
          <>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="text-sm text-muted-foreground">보유 크레딧</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="text-xs text-muted-foreground">
                    총 보유(공급가)
                  </div>
                  <div className="text-2xl font-semibold">
                    {loadingBalance ? "..." : `${balance.toLocaleString()}원`}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    구매 크레딧(공급가)
                  </div>
                  <div className="text-lg font-semibold">
                    {loadingBalance
                      ? "..."
                      : `${paidBalance.toLocaleString()}원`}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    무료 크레딧(공급가)
                  </div>
                  <div className="text-lg font-semibold">
                    {loadingBalance
                      ? "..."
                      : `${bonusBalance.toLocaleString()}원`}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                결제는 크레딧 차감으로 진행되며, 부가세는 충전 시점에 포함되어
                결제됩니다.
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-lg font-medium">충전 내역</div>
                <PeriodFilter value={ordersPeriod} onChange={setOrdersPeriod} />
              </div>
              {loadingOrders ? (
                <div className="text-sm text-muted-foreground">
                  불러오는 중...
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  해당 기간에 충전 내역이 없습니다.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredOrders.slice(0, 10).map((o) => {
                    const bank = o.virtualAccount?.bank || "";
                    const acc = o.virtualAccount?.accountNumber || "";
                    const due = o.virtualAccount?.dueDate || "";
                    const isWaiting = o.status === "WAITING_FOR_DEPOSIT";
                    const canCancel =
                      o.status === "WAITING_FOR_DEPOSIT" ||
                      o.status === "CREATED";

                    const orderDate = formatKoreanDate(
                      o.createdAt || o.approvedAt || o.depositedAt || null
                    );
                    const shortId = formatOrderShortId(o.orderId);

                    return (
                      <div
                        key={o.orderId}
                        className="rounded-lg border border-gray-200 bg-white p-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="space-y-0.5">
                            <div className="text-sm font-medium">
                              크레딧 충전
                              {orderDate ? ` · ${orderDate}` : ""}
                              {shortId ? ` · 참조 ${shortId}` : ""}
                            </div>
                          </div>
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
                가상계좌는 입금 완료 후 자동 충전됩니다.
              </div>
            </div>
          </>
        )}

        <div className="space-y-4">
          <div className="text-lg font-medium">크레딧 충전</div>

          {isFirstCharge ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4">
                <div className="text-sm font-medium">첫 충전</div>
                <div className="text-sm text-muted-foreground">
                  가입 후 첫 충전은 50만원(공급가)으로 진행됩니다.
                </div>
                <div className="text-sm">
                  충전 크레딧(공급가):{" "}
                  <span className="font-semibold">50만원</span>
                </div>
                <div className="text-sm">
                  결제금액(부가세 포함):{" "}
                  <span className="font-semibold">55만원</span>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
                <div className="text-xs text-muted-foreground">결제금액</div>
                <div className="text-3xl font-bold text-primary">55만원</div>
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleCharge}
                  disabled={creatingOrder}
                >
                  {creatingOrder ? "요청 중..." : "충전하기"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
                <div className="text-sm text-muted-foreground">
                  최근 3개월 사용량 기반 추천 충전액입니다.
                </div>

                <RadioGroup
                  value={selectedPlan}
                  onValueChange={(v) => {
                    if (v === "3m" || v === "1m") setSelectedPlan(v);
                  }}
                  className="grid gap-2"
                >
                  <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2">
                    <RadioGroupItem value="1m" id="credit-plan-1m" />
                    <Label
                      htmlFor="credit-plan-1m"
                      className="flex w-full items-baseline justify-between"
                    >
                      <span>1개월 추천</span>
                      <span className="font-semibold">
                        {oneMonthSupply.toLocaleString()}원
                      </span>
                    </Label>
                  </div>
                  <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2">
                    <RadioGroupItem value="3m" id="credit-plan-3m" />
                    <Label
                      htmlFor="credit-plan-3m"
                      className="flex w-full items-baseline justify-between"
                    >
                      <span>3개월 추천</span>
                      <span className="font-semibold">
                        {threeMonthsSupply.toLocaleString()}원
                      </span>
                    </Label>
                  </div>
                </RadioGroup>

                <div className="text-xs text-muted-foreground">
                  {loadingInsights
                    ? "추천 정보를 계산하는 중..."
                    : spendInsights?.estimatedDaysFor500k
                    ? `50만원(공급가) 예상 소진: 약 ${spendInsights.estimatedDaysFor500k}일`
                    : "사용 내역이 부족하여 50만원 기준으로 안내합니다."}
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
                <div className="text-xs text-muted-foreground">결제금액</div>
                <div className="text-3xl font-bold text-primary">
                  {totalAmount.toLocaleString()}원
                </div>
                <div className="text-xs text-muted-foreground">
                  공급가 {supplyAmount.toLocaleString()}원 + VAT
                  {roundVat(supplyAmount).toLocaleString()}원
                </div>

                {paidBalance > 0 && (
                  <div className="text-xs text-muted-foreground">
                    환불: 계좌해지시 남아있는 구매 크레딧(공급가)만 환불되며,
                    무료 크레딧(공급가)은 환불되지 않습니다. VAT는 잔액 비율대로
                    환불됩니다.
                  </div>
                )}

                <Button
                  type="button"
                  className="w-full"
                  onClick={handleCharge}
                  disabled={creatingOrder}
                >
                  {creatingOrder ? "요청 중..." : "충전하기"}
                </Button>
              </div>
            </div>
          )}

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
      </CardContent>
    </Card>
  );
};

export const PaymentTab = CreditPaymentTab;
