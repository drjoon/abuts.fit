// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { ChevronDown, ChevronUp, Copy } from "lucide-react";

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
    depositorName: string;
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

const CHARGE_UNIT = 500000;
const MIN_CHARGE_UNITS = 1;
const MAX_CHARGE_UNITS = 100;

function clampChargeUnits(raw: number) {
  if (!Number.isFinite(raw)) return MIN_CHARGE_UNITS;
  return Math.min(
    MAX_CHARGE_UNITS,
    Math.max(MIN_CHARGE_UNITS, Math.round(raw)),
  );
}

function unitsFromSupply(supply: number) {
  if (!Number.isFinite(supply) || supply <= 0) return MIN_CHARGE_UNITS;
  return clampChargeUnits(Math.round(supply / CHARGE_UNIT));
}

function formatManwon(amount: number) {
  const man = Math.round(amount / 10000);
  return `${man.toLocaleString()}만원`;
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

  const MIN = CHARGE_UNIT * MIN_CHARGE_UNITS;
  const MAX = CHARGE_UNIT * MAX_CHARGE_UNITS;
  if (supply < MIN || supply > MAX) {
    return "크레딧 충전 금액은 50만원 ~ 5,000만원 범위여야 합니다.";
  }

  if (supply % CHARGE_UNIT !== 0)
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
      seconds,
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
  const [depositAccount, setDepositAccount] = useState<{
    bankName: string;
    accountNumber: string;
    holderName: string;
  } | null>(null);

  const [balance, setBalance] = useState<number>(0);
  const [paidBalance, setPaidBalance] = useState<number>(0);
  const [freeBalance, setFreeBalance] = useState<number>(0);
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

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} 복사됨` });
    } catch {
      // ignore
    }
  };

  const [chargeUnits, setChargeUnits] = useState<number>(MIN_CHARGE_UNITS);
  const [unitsDraft, setUnitsDraft] = useState<string>(String(MIN_CHARGE_UNITS));
  const [didApplyRecommendedUnits, setDidApplyRecommendedUnits] =
    useState(false);

  const applyChargeUnits = (raw: number) => {
    const next = clampChargeUnits(raw);
    setChargeUnits(next);
    setUnitsDraft(String(next));
  };

  const supplyAmount = useMemo(
    () => chargeUnits * CHARGE_UNIT,
    [chargeUnits],
  );
  const totalAmount = supplyAmount;
  const displayAmount = pendingOrder
    ? Number(pendingOrder.amountTotal || pendingOrder.supplyAmount || 0)
    : totalAmount;

  const activeDepositAccount =
    pendingOrder?.depositAccount?.accountNumber
      ? pendingOrder.depositAccount
      : depositAccount;

  const recommendedUnits = useMemo(() => {
    const oneMonth = Number(spendInsights?.recommended?.oneMonthSupply || 0);
    if (!(oneMonth > 0)) return null;
    return unitsFromSupply(oneMonth);
  }, [spendInsights?.recommended?.oneMonthSupply]);

  const filteredOrders = useMemo(() => {
    const now = Date.now();
    const daysMap: Record<
      Extract<PeriodFilterValue, "30d" | "90d">,
      number
    > = {
      "30d": 30,
      "90d": 90,
    };

    const items = Array.isArray(orders) ? orders : [];

    if (ordersPeriod === "lastMonth" || ordersPeriod === "thisMonth") {
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth();

      const start =
        ordersPeriod === "thisMonth"
          ? new Date(year, month, 1)
          : new Date(year, month - 1, 1);
      const end =
        ordersPeriod === "thisMonth"
          ? new Date(year, month + 1, 1)
          : new Date(year, month, 1);

      return items
        .filter((o) => {
          const t = new Date(
            String(o.createdAt || o.matchedAt || o.expiresAt || ""),
          ).getTime();
          if (!Number.isFinite(t)) return true;
          return t >= start.getTime() && t < end.getTime();
        })
        .sort((a, b) => {
          const ta = new Date(
            String(a.createdAt || a.matchedAt || a.expiresAt || 0),
          ).getTime();
          const tb = new Date(
            String(b.createdAt || b.matchedAt || b.expiresAt || 0),
          ).getTime();
          return (
            (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0)
          );
        });
    }

    const days = daysMap[ordersPeriod as keyof typeof daysMap];
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    return items
      .filter((o) => {
        const t = new Date(
          String(o.createdAt || o.matchedAt || o.expiresAt || ""),
        ).getTime();
        if (!Number.isFinite(t)) return true;
        return t >= cutoff;
      })
      .sort((a, b) => {
        const ta = new Date(
          String(a.createdAt || a.matchedAt || a.expiresAt || 0),
        ).getTime();
        const tb = new Date(
          String(b.createdAt || b.matchedAt || b.expiresAt || 0),
        ).getTime();
        return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
      });
  }, [orders, ordersPeriod]);

  const [creatingOrder, setCreatingOrder] = useState(false);

  const reloadBalance = async () => {
    if (!token) return;
    setLoadingBalance(true);
    try {
      const res = await request<{
        data?: {
          balance?: number;
          paidCredit?: number;
          paidBalance?: number;
          freeRequestCredit?: number;
          freeShippingCredit?: number;
        };
        balance?: number;
        paidCredit?: number;
        paidBalance?: number;
        freeRequestCredit?: number;
        freeShippingCredit?: number;
      }>({
        path: "/api/credits/balance",
        method: "GET",
        token,
      });
      if (!res.ok) throw new Error("balance fetch failed");
      const body = res.data || {};
      const data = body.data || body;
      const freeRequest = Number(data?.freeRequestCredit ?? 0);
      const freeShipping = Number(data?.freeShippingCredit ?? 0);

      setBalance(Number(data?.balance || 0));
      setPaidBalance(Number(data?.paidCredit ?? data?.paidBalance ?? 0));
      setFreeBalance(freeRequest + freeShipping);
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
      const items = Array.isArray(data?.items)
        ? (data.items as CreditOrderItem[])
        : [];
      setOrders(items);

      const account = data?.depositAccount;
      if (account?.accountNumber) {
        setDepositAccount({
          bankName: String(account.bankName || ""),
          accountNumber: String(account.accountNumber || ""),
          holderName: String(account.holderName || ""),
        });
      }

      const pending = items.find((o) => String(o.status) === "PENDING");
      if (pending?._id) {
        setPendingOrder((prev) => {
          if (prev?.id && String(prev.id) === String(pending._id)) {
            return {
              ...prev,
              status: pending.status,
              depositCode: pending.depositCode,
              supplyAmount: pending.supplyAmount,
              vatAmount: pending.vatAmount,
              amountTotal: pending.amountTotal,
              expiresAt: String(pending.expiresAt || prev.expiresAt || ""),
              depositAccount: prev.depositAccount || account || depositAccount,
            };
          }
          return {
            id: String(pending._id),
            status: pending.status,
            depositCode: pending.depositCode,
            depositorName: pending.depositCode,
            supplyAmount: pending.supplyAmount,
            vatAmount: pending.vatAmount,
            amountTotal: pending.amountTotal,
            expiresAt: String(pending.expiresAt || ""),
            depositAccount: {
              bankName: String(account?.bankName || depositAccount?.bankName || ""),
              accountNumber: String(
                account?.accountNumber || depositAccount?.accountNumber || "",
              ),
              holderName: String(
                account?.holderName || depositAccount?.holderName || "",
              ),
            },
          };
        });
        const units = unitsFromSupply(Number(pending.supplyAmount || 0));
        setChargeUnits(units);
        setUnitsDraft(String(units));
      } else {
        setPendingOrder(null);
      }
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
      ["DONE", "REFUND_REQUESTED", "REFUNDED"].includes(String(o.status)),
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
    if (loadingOrders || loadingInsights) return;
    if (pendingOrder) return;
    if (isFirstCharge || didApplyRecommendedUnits) return;
    if (!recommendedUnits) return;
    applyChargeUnits(recommendedUnits);
    setDidApplyRecommendedUnits(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    didApplyRecommendedUnits,
    isFirstCharge,
    loadingInsights,
    loadingOrders,
    pendingOrder,
    recommendedUnits,
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

    if (!(user as any)?.businessAnchorId) {
      toast({
        title: "사업자 정보가 없습니다",
        description: "사업자 탭에서 사업자 정보를 먼저 등록해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!user?.name) {
      toast({
        title: "사용자 이름이 필요합니다",
        description: "계정 탭에서 이름을 등록한 뒤 다시 시도해주세요.",
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
      if (data?.depositAccount?.accountNumber) {
        setDepositAccount({
          bankName: String(data.depositAccount.bankName || ""),
          accountNumber: String(data.depositAccount.accountNumber || ""),
          holderName: String(data.depositAccount.holderName || ""),
        });
      }
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
          chargeOrderId,
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

  const statusLabel: Record<string, { text: string; cls: string }> = {
    PENDING: { text: "입금 대기", cls: "bg-amber-100 text-amber-700" },
    DONE: { text: "충전 완료", cls: "bg-blue-100 text-blue-700" },
    MATCHED: { text: "충전 완료", cls: "bg-blue-100 text-blue-700" },
    EXPIRED: { text: "만료", cls: "bg-gray-100 text-gray-500" },
    CANCELED: { text: "취소", cls: "bg-gray-100 text-gray-500" },
    REFUND_REQUESTED: {
      text: "환불 신청",
      cls: "bg-orange-100 text-orange-700",
    },
    REFUNDED: { text: "환불 완료", cls: "bg-gray-100 text-gray-500" },
  };

  return (
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader>
        <CardTitle>크레딧 결제</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 잔액 요약 */}
        {!isFirstCharge && (
          <div className="app-surface app-surface--panel p-4">
            <div className="text-sm text-muted-foreground mb-3">
              보유 크레딧
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">
                  총 보유(공급가)
                </div>
                <div className="text-2xl font-semibold">
                  {loadingBalance ? "..." : `${balance.toLocaleString()}원`}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">구매 크레딧</div>
                <div className="text-lg font-semibold">
                  {loadingBalance ? "..." : `${paidBalance.toLocaleString()}원`}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">무료 크레딧</div>
                <div className="text-lg font-semibold">
                  {loadingBalance
                    ? "..."
                    : `${freeBalance.toLocaleString()}원`}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 입금 정보(좌) + 충전 금액(우) */}
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
          <div className="grid md:grid-cols-2">
            {/* 왼쪽: 입금 계좌 / 코드 */}
            <div className="space-y-4 border-b border-slate-200/80 p-5 sm:p-6 md:border-b-0 md:border-r">
              <div className="flex items-center justify-between gap-3">
                {pendingOrder ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                      </span>
                      <span className="text-sm font-semibold">입금 대기중</span>
                    </div>
                    {pendingRemainingLabel ? (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                        {pendingRemainingLabel}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-sm font-semibold text-slate-700">
                    입금 정보
                  </span>
                )}
              </div>

              <div className="rounded-xl bg-slate-50/80 px-4 py-3">
                <div className="text-xs text-muted-foreground">입금 계좌</div>
                {activeDepositAccount?.accountNumber ? (
                  <div className="mt-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">
                        {activeDepositAccount.bankName}
                      </div>
                      <div className="truncate text-lg font-semibold tracking-wide">
                        {activeDepositAccount.accountNumber}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {activeDepositAccount.holderName}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() =>
                        copyToClipboard(
                          activeDepositAccount.accountNumber,
                          "계좌번호",
                        )
                      }
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      복사
                    </Button>
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-muted-foreground">—</div>
                )}
              </div>

              <div
                className={
                  pendingOrder
                    ? "rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3"
                    : "rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-4 py-3"
                }
              >
                <div
                  className={
                    pendingOrder
                      ? "text-xs font-medium text-amber-800"
                      : "text-xs text-muted-foreground"
                  }
                >
                  입금자명 코드
                </div>
                {pendingOrder ? (
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-2xl font-bold tracking-[0.2em] text-amber-700">
                      {pendingOrder.depositCode}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 bg-white"
                      onClick={() =>
                        copyToClipboard(pendingOrder.depositCode, "입금코드")
                      }
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      복사
                    </Button>
                  </div>
                ) : (
                  <div className="mt-2 text-2xl font-semibold tracking-[0.2em] text-slate-300">
                    ——
                  </div>
                )}
                <div
                  className={
                    pendingOrder
                      ? "mt-2 text-xs leading-relaxed text-amber-800/80"
                      : "mt-2 text-xs leading-relaxed text-muted-foreground"
                  }
                >
                  입금자명에 이 코드를 입력하면 자동으로 매칭됩니다.
                </div>
              </div>

              {pendingOrder ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    const found = orders.find(
                      (o) => String((o as any)._id || "") === pendingOrder.id,
                    );
                    if (found?._id) cancelOrder(String(found._id));
                    else setPendingOrder(null);
                  }}
                >
                  입금 취소
                </Button>
              ) : null}
            </div>

            {/* 오른쪽: 금액 선택 / 충전 */}
            <div className="flex flex-col justify-between gap-6 bg-gradient-to-b from-sky-50/50 to-white p-5 sm:p-6">
              <div>
                <div className="text-xs font-medium text-muted-foreground">
                  입금 금액
                </div>
                <div className="mt-2 text-4xl font-bold tracking-tight text-primary tabular-nums">
                  {formatManwon(displayAmount)}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  부가세 없음
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-stretch gap-2">
                  <div className="flex h-12 min-w-0 flex-1 items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={unitsDraft}
                      disabled={Boolean(pendingOrder)}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^\d]/g, "");
                        setUnitsDraft(raw);
                        if (!raw) return;
                        const parsed = Number(raw);
                        if (!Number.isFinite(parsed)) return;
                        setChargeUnits(clampChargeUnits(parsed));
                      }}
                      onBlur={() => {
                        const parsed = Number(unitsDraft);
                        applyChargeUnits(
                          Number.isFinite(parsed) ? parsed : MIN_CHARGE_UNITS,
                        );
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          applyChargeUnits(chargeUnits + 1);
                        } else if (e.key === "ArrowDown") {
                          e.preventDefault();
                          applyChargeUnits(chargeUnits - 1);
                        }
                      }}
                      className="h-full flex-1 border-0 bg-transparent text-center text-xl font-semibold tabular-nums shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-60"
                      aria-label="충전 배수"
                    />
                    <div className="flex w-10 flex-col border-l border-slate-200">
                      <button
                        type="button"
                        aria-label="배수 증가"
                        className="flex flex-1 items-center justify-center text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={
                          Boolean(pendingOrder) ||
                          chargeUnits >= MAX_CHARGE_UNITS
                        }
                        onClick={() => applyChargeUnits(chargeUnits + 1)}
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="배수 감소"
                        className="flex flex-1 items-center justify-center border-t border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={
                          Boolean(pendingOrder) ||
                          chargeUnits <= MIN_CHARGE_UNITS
                        }
                        onClick={() => applyChargeUnits(chargeUnits - 1)}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex h-12 min-w-0 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white text-base font-semibold text-slate-700 shadow-sm">
                    × 50만원
                  </div>
                </div>

                {!isFirstCharge &&
                !pendingOrder &&
                recommendedUnits &&
                recommendedUnits !== chargeUnits ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => applyChargeUnits(recommendedUnits)}
                  >
                    추천 {recommendedUnits}배
                  </button>
                ) : null}

                <Button
                  type="button"
                  className="h-11 w-full text-base"
                  onClick={handleCharge}
                  disabled={creatingOrder || Boolean(pendingOrder)}
                >
                  {pendingOrder
                    ? "입금 대기중"
                    : creatingOrder
                      ? "요청 중..."
                      : "충전하기"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* 충전 내역 */}
        {!isFirstCharge && (
          <div className="space-y-3">
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold">충전 내역</div>
              <PeriodFilter value={ordersPeriod} onChange={setOrdersPeriod} useStoreCustomRange={false} />
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
                    o.createdAt || o.matchedAt || null,
                  );
                  const shortId = formatOrderShortId(String(o._id || ""));
                  const sl = statusLabel[o.status] ?? {
                    text: o.status,
                    cls: "bg-gray-100 text-gray-500",
                  };

                  return (
                    <div
                      key={String(o._id || shortId || orderDate)}
                      className="app-surface app-surface--panel p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium">
                          크레딧 충전{orderDate ? ` · ${orderDate}` : ""}
                          {shortId ? ` · ${shortId}` : ""}
                        </div>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${sl.cls}`}
                        >
                          {sl.text}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <div className="text-sm">
                          결제금액{" "}
                          <span className="font-semibold">
                            {Number(o.amountTotal || 0).toLocaleString()}원
                          </span>
                        </div>
                        {o.depositCode && (
                          <div className="text-xs text-muted-foreground">
                            코드 {o.depositCode}
                          </div>
                        )}
                      </div>
                      {canCancel && (
                        <div className="mt-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
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
        )}
      </CardContent>
    </Card>
  );
};

export const PaymentTab = CreditPaymentTab;
