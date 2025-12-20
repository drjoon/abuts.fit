import { useEffect, useMemo, useState } from "react";
import { request } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";

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
    status: string;
    depositCode: string;
    supplyAmount: number;
    vatAmount: number;
    amountTotal: number;
    expiresAt: string;
    depositAccount: {
      bankName: string;
      accountNumber: string;
      holderName: string;
    };
  };
  message?: string;
};

type CreditOrderItem = {
  _id?: string;
  status: string;
  depositCode: string;
  supplyAmount: number;
  vatAmount: number;
  amountTotal: number;
  expiresAt?: string;
  matchedAt?: string | null;
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

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}시간 ${String(minutes).padStart(2, "0")}분 ${String(
      seconds
    ).padStart(2, "0")}초`;
  }
  return `${minutes}분 ${String(seconds).padStart(2, "0")}초`;
}

export const CreditPaymentTab = ({ userData }: Props) => {
  const { toast } = useToast();
  const { token, user } = useAuthStore();

  const [pendingOrder, setPendingOrder] = useState<
    CreditOrderResponse["data"] | null
  >(null);

  const [balance, setBalance] = useState<number>(0);
  const [paidBalance, setPaidBalance] = useState<number>(0);
  const [bonusBalance, setBonusBalance] = useState<number>(0);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const [orders, setOrders] = useState<CreditOrderItem[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersPeriod, setOrdersPeriod] = useState<PeriodFilterValue>("30d");

  const [chargeVariant, setChargeVariant] = useState<
    "first" | "regular" | null
  >(null);

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

  const [pendingNow, setPendingNow] = useState(() => Date.now());

  const pendingExpiresAtMs = useMemo(() => {
    if (!pendingOrder?.expiresAt) return 0;
    const expiresAtMs = new Date(String(pendingOrder.expiresAt)).getTime();
    return Number.isFinite(expiresAtMs) ? expiresAtMs : 0;
  }, [pendingOrder?.expiresAt]);

  useEffect(() => {
    if (!pendingOrder?.expiresAt) return;
    const timer = window.setInterval(() => setPendingNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pendingOrder?.expiresAt]);

  const pendingRemainingLabel = useMemo(() => {
    if (!pendingExpiresAtMs) return "";
    return formatRemaining(pendingExpiresAtMs - pendingNow);
  }, [pendingExpiresAtMs, pendingNow]);

  useEffect(() => {
    if (!pendingOrder) return;
    if (!pendingExpiresAtMs) return;
    if (pendingNow >= pendingExpiresAtMs) {
      setPendingOrder(null);
    }
  }, [pendingExpiresAtMs, pendingNow, pendingOrder]);

  const pendingPanel = pendingOrder ? (
    <div className="relative mt-4 space-y-1 rounded-lg border border-gray-200 bg-white/70 p-3 text-sm">
      {pendingRemainingLabel ? (
        <div className="absolute right-3 top-3 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
          남은시간 {pendingRemainingLabel}
        </div>
      ) : null}

      <div className="font-medium">입금 대기중</div>
      <div>
        입금계좌: {pendingOrder.depositAccount.bankName}{" "}
        {pendingOrder.depositAccount.accountNumber}
      </div>
      <div>예금주: {pendingOrder.depositAccount.holderName}</div>
      <div>
        입금금액(부가세 포함):{" "}
        <span className="font-semibold">
          {Number(pendingOrder.amountTotal || 0).toLocaleString()}원
        </span>
      </div>
      <div>
        입금코드:{" "}
        <span className="font-semibold">{pendingOrder.depositCode}</span>
      </div>

      <div className="border-t border-dashed border-gray-200 pt-2 mt-2" />
      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
        <div>입금자 이름에 입금코드 기재해주세요.</div>
        <div className="mt-0.5">미기재시 수동 처리로 오래 걸려요.</div>
      </div>
    </div>
  ) : null;

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
          String(a.createdAt || a.matchedAt || a.expiresAt || 0)
        ).getTime();
        const tb = new Date(
          String(b.createdAt || b.matchedAt || b.expiresAt || 0)
        ).getTime();
        return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
      });
    }

    const days = daysMap[ordersPeriod];
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    return items
      .filter((o) => {
        const t = new Date(
          String(o.createdAt || o.matchedAt || o.expiresAt || "")
        ).getTime();
        if (!Number.isFinite(t)) return true;
        return t >= cutoff;
      })
      .sort((a, b) => {
        const ta = new Date(
          String(a.createdAt || a.matchedAt || a.expiresAt || 0)
        ).getTime();
        const tb = new Date(
          String(b.createdAt || b.matchedAt || b.expiresAt || 0)
        ).getTime();
        return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
      });
  }, [orders, ordersPeriod]);

  const [creatingOrder, setCreatingOrder] = useState(false);

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
        path: "/api/credits/b-plan/orders",
        method: "GET",
        token,
      });
      if (!res.ok) throw new Error("orders fetch failed");
      const body: any = res.data || {};
      const data = body.data || body;
      const items = data?.items;
      setOrders(Array.isArray(items) ? (items as CreditOrderItem[]) : []);
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

  useEffect(() => {
    if (!pendingOrder?.id) return;
    const id = String(pendingOrder.id);
    const found = orders.find((o) => {
      const orderId = String((o as any)?._id || (o as any)?.id || "");
      return orderId === id;
    });
    if (!found) return;
    const status = String(found.status || "");
    if (
      [
        "DONE",
        "MATCHED",
        "EXPIRED",
        "CANCELED",
        "REFUND_REQUESTED",
        "REFUNDED",
      ].includes(status)
    ) {
      setPendingOrder(null);
    }
  }, [orders, pendingOrder?.id]);

  const isFirstCharge = useMemo(() => {
    return chargeVariant === "first";
  }, [chargeVariant]);

  useEffect(() => {
    if (chargeVariant) return;
    if (loadingOrders) return;
    setChargeVariant(hasChargedBefore ? "regular" : "first");
  }, [chargeVariant, hasChargedBefore, loadingOrders]);

  useEffect(() => {
    if (!chargeVariant) return;
    if (chargeVariant === "first" && hasChargedBefore) {
      setChargeVariant("regular");
    }
  }, [chargeVariant, hasChargedBefore]);

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

    setCreatingOrder(true);
    try {
      const res = await request<CreditOrderResponse>({
        path: "/api/credits/b-plan/orders",
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
      if (!data?.id) {
        throw new Error("주문 정보가 올바르지 않습니다.");
      }

      setPendingOrder(data);
      await reloadOrders();
      toast({
        title: "충전 요청이 생성되었습니다",
        description: "입금 완료 후 크레딧이 자동 충전됩니다.",
      });
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

  const cancelOrder = async (chargeOrderId: string) => {
    if (!token) return;
    try {
      const res = await request<any>({
        path: `/api/credits/b-plan/orders/${encodeURIComponent(
          chargeOrderId
        )}/cancel`,
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
        <CardTitle>크레딧 충전</CardTitle>
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
                    const canCancel = o.status === "PENDING";

                    const orderDate = formatKoreanDate(
                      o.createdAt || o.matchedAt || null
                    );
                    const shortId = formatOrderShortId(String(o._id || ""));

                    return (
                      <div
                        key={String(o._id || shortId || orderDate)}
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
                            {Number(o.amountTotal || 0).toLocaleString()}원
                          </span>
                        </div>
                        {o.depositCode && (
                          <div className="mt-2 text-sm text-muted-foreground">
                            입금코드: {o.depositCode}
                          </div>
                        )}
                        {o.expiresAt && (
                          <div className="mt-1 text-sm text-muted-foreground">
                            만료일: {formatKoreanDate(o.expiresAt)}
                          </div>
                        )}

                        {canCancel && (
                          <div className="mt-3">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => cancelOrder(String(o._id || ""))}
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
                입금 확인 후 자동 충전됩니다.
              </div>
            </div>
          </>
        )}

        <div className="space-y-4">
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

                {pendingPanel}
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
                    : "최근 사용 내역이 부족하여 예상 소진일을 계산할 수 없습니다."}
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

                {pendingPanel}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export const PaymentTab = CreditPaymentTab;
