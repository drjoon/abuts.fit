// change-log:
// - 2026-08-12: 충전 화면 제목·안내문에 기공료 선입금(선납) 명시. 선불페이와 구분.
// - 2026-08-11: compact — 크레딧 충전 탭용. 잔액/충전내역 숨기고 입금 패널만 표시(스크롤·중앙 배치).
// - 2026-08-11: 외곽 glass 카드 제거. 입금정보/입금금액 패널만 남기고 수직 중앙 배치.
// - 2026-08-11: 페이지 제목(크레딧 결제) 제거 — 탭 라벨로 충분.
// - 2026-08-11: 1회차 판별 — MATCHED/AUTO_MATCHED 반영, variant 미결정 시 2회차 기본(3) 적용 방지.
// - 2026-08-23: 2회차 기본값 — 월 사용량 추정치(충전 단위 반올림). 1회차는 치과 100만/기공소 50만(1배).
// - 2026-08-11: 충전 단위 — 기공소 50만원, 치과 100만원.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/business/useRequestorBusinessAccess.ts
// - web/backend/utils/creditChargeUnit.js
// - web/backend/controllers/credits/creditBPlan.controller.js
// - web/backend/controllers/credits/credit.controller.js
// - web/frontend/src/shared/legal/creditPrepaidCopy.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import { isCreditEventForBusiness } from "@/shared/realtime/creditBalanceEvent";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { periodToRange } from "@/store/usePeriodStore";
import { ChevronDown, ChevronUp, Copy } from "lucide-react";
import {
  CREDIT_CHARGE_NOTICE_BODY,
  CREDIT_CHARGE_NOTICE_TITLE,
  CREDIT_PREPAID_BALANCE_LABEL,
} from "@/shared/legal/creditPrepaidCopy";

type Props = {
  userData: {
    id?: string;
    name?: string;
    email?: string;
  };
  /** true면 잔액 요약·충전 내역을 숨기고 입금/충전 패널만 표시 */
  compact?: boolean;
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
    chargeUnit?: number;
    requestorKind?: "practice" | "lab" | null;
    recommended: {
      chargeSupply?: number;
      oneMonthSupply: number;
      oneMonthFullSupply?: number;
      threeMonthsSupply: number;
    };
  };
  message?: string;
};

const CHARGE_UNIT_LAB = 500_000;
const CHARGE_UNIT_PRACTICE = 1_000_000;
const MAX_CHARGE_SUPPLY = 50_000_000;
const MIN_CHARGE_UNITS = 1;

function resolveChargeUnit(kind: "practice" | "lab" | null | undefined) {
  return kind === "practice" ? CHARGE_UNIT_PRACTICE : CHARGE_UNIT_LAB;
}

function maxChargeUnitsFor(unit: number) {
  if (!Number.isFinite(unit) || unit <= 0) return 1;
  return Math.max(1, Math.floor(MAX_CHARGE_SUPPLY / unit));
}

function clampChargeUnits(raw: number, maxUnits: number) {
  if (!Number.isFinite(raw)) return MIN_CHARGE_UNITS;
  return Math.min(maxUnits, Math.max(MIN_CHARGE_UNITS, Math.round(raw)));
}

/** 공급가 → 배수 (반올림). 0이 되면 최소 1단위 */
function unitsFromSupply(supply: number, unit: number, maxUnits: number) {
  if (!Number.isFinite(supply) || !(unit > 0)) {
    return MIN_CHARGE_UNITS;
  }
  if (supply <= 0) return MIN_CHARGE_UNITS;
  return clampChargeUnits(Math.round(supply / unit), maxUnits);
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

function validateSupplyAmount(supply: number, unit: number) {
  if (!Number.isFinite(supply) || supply <= 0)
    return "유효하지 않은 금액입니다.";

  const unitLabel = formatManwon(unit);
  if (supply < unit || supply > MAX_CHARGE_SUPPLY) {
    return `크레딧 충전 금액은 ${unitLabel} ~ 5,000만원 범위여야 합니다.`;
  }

  if (supply % unit !== 0)
    return `크레딧 충전 금액은 ${unitLabel} 단위로만 충전할 수 있습니다.`;

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

export const CreditPaymentTab = ({ userData, compact = false }: Props) => {
  const { toast } = useToast();
  const { token, user } = useAuthStore();
  const { kind: accessKind } = useRequestorBusinessAccess();

  const requestorKind =
    accessKind ||
    (user?.requestorKind === "practice" || user?.requestorKind === "lab"
      ? user.requestorKind
      : null);

  const chargeUnit = useMemo(
    () => resolveChargeUnit(requestorKind),
    [requestorKind],
  );
  const maxChargeUnits = useMemo(
    () => maxChargeUnitsFor(chargeUnit),
    [chargeUnit],
  );

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
  const [ordersCustomStartDate, setOrdersCustomStartDate] = useState("");
  const [ordersCustomEndDate, setOrdersCustomEndDate] = useState("");
  const ordersRequestSequence = useRef(0);

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
    const next = clampChargeUnits(raw, maxChargeUnits);
    setChargeUnits(next);
    setUnitsDraft(String(next));
  };

  const supplyAmount = useMemo(
    () => chargeUnits * chargeUnit,
    [chargeUnits, chargeUnit],
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
    // 2회차 기본·추천 버튼 공통: 한 달 사용량(충전 단위 반올림).
    const fromApi = Number(
      spendInsights?.recommended?.oneMonthFullSupply ??
        spendInsights?.avgMonthlySpendSupply ??
        0,
    );
    if (fromApi > 0) {
      return unitsFromSupply(fromApi, chargeUnit, maxChargeUnits);
    }
    return MIN_CHARGE_UNITS;
  }, [
    chargeUnit,
    maxChargeUnits,
    spendInsights?.avgMonthlySpendSupply,
    spendInsights?.recommended?.oneMonthFullSupply,
  ]);

  // 단위가 바뀌면(치과/기공소) 배수·추천 적용 상태를 다시 맞춘다.
  useEffect(() => {
    setDidApplyRecommendedUnits(false);
    applyChargeUnits(MIN_CHARGE_UNITS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargeUnit]);

  const filteredOrders = useMemo(() => {
    const items = Array.isArray(orders) ? orders : [];
    const range = periodToRange(ordersPeriod, {
      customStartDate: ordersCustomStartDate,
      customEndDate: ordersCustomEndDate,
    });
    const startMs = range?.startDate
      ? new Date(range.startDate).getTime()
      : Number.NaN;
    const endMs = range?.endDate
      ? new Date(range.endDate).getTime()
      : Number.NaN;

    return items
      .filter((o) => {
        const t = new Date(
          String(o.createdAt || o.matchedAt || o.expiresAt || ""),
        ).getTime();
        if (!Number.isFinite(t)) return true;
        if (Number.isFinite(startMs) && t < startMs) return false;
        if (Number.isFinite(endMs) && t > endMs) return false;
        return true;
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
  }, [orders, ordersPeriod, ordersCustomStartDate, ordersCustomEndDate]);

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
    const requestSequence = ++ordersRequestSequence.current;
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
      if (requestSequence !== ordersRequestSequence.current) return;
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
        const units = unitsFromSupply(
          Number(pending.supplyAmount || 0),
          chargeUnit,
          maxChargeUnits,
        );
        setChargeUnits(units);
        setUnitsDraft(String(units));
      } else {
        setPendingOrder(null);
      }
    } catch {
      // A newer response is authoritative; stale failures must not alter UI.
    } finally {
      if (requestSequence === ordersRequestSequence.current) {
        setLoadingOrders(false);
      }
    }
  };

  useEffect(() => {
    reloadBalance();
    reloadOrders();
    reloadSpendInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useAppEventDebouncedReload({
    enabled: Boolean(token) && Boolean(user?.businessAnchorId),
    eventTypes: ["credit:balance-updated"],
    delayMs: 80,
    shouldHandle: (evt) =>
      isCreditEventForBusiness(evt, user?.businessAnchorId),
    onMatch: () => {
      void reloadBalance();
      void reloadOrders();
      void reloadSpendInsights();
    },
  });

  const hasChargedBefore = useMemo(() => {
    return orders.some((o) =>
      [
        "DONE",
        "MATCHED",
        "AUTO_MATCHED",
        "REFUND_REQUESTED",
        "REFUNDED",
      ].includes(String(o.status)),
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
        "AUTO_MATCHED",
        "EXPIRED",
        "CANCELED",
        "REFUND_REQUESTED",
        "REFUNDED",
      ].includes(status)
    ) {
      setPendingOrder(null);
    }
  }, [orders, pendingOrder?.id]);

  // 주문 목록 로딩 전에는 1회차로 간주(미결정 시 2회차 UI/배수 3 적용 방지).
  const isFirstCharge = loadingOrders || !hasChargedBefore;

  useEffect(() => {
    if (loadingOrders) return;
    if (hasChargedBefore && loadingInsights) return;
    if (pendingOrder) return;
    if (didApplyRecommendedUnits) return;
    applyChargeUnits(hasChargedBefore ? recommendedUnits : MIN_CHARGE_UNITS);
    setDidApplyRecommendedUnits(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    didApplyRecommendedUnits,
    hasChargedBefore,
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

    const validationError = validateSupplyAmount(supplyAmount, chargeUnit);
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
        title: "거래 선수금 충전 요청이 생성되었습니다",
        description: "입금 완료 후 거래 선수금(크레딧)이 자동 반영됩니다.",
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
    PENDING: { text: "입금 대기", cls: "bg-accent-soft text-accent-strong" },
    DONE: { text: "충전 완료", cls: "bg-primary-soft text-primary-strong" },
    MATCHED: { text: "충전 완료", cls: "bg-primary-soft text-primary-strong" },
    EXPIRED: { text: "만료", cls: "bg-gray-100 text-gray-500" },
    CANCELED: { text: "취소", cls: "bg-gray-100 text-gray-500" },
    REFUND_REQUESTED: {
      text: "환불 신청",
      cls: "bg-accent-soft text-accent-strong",
    },
    REFUNDED: { text: "환불 완료", cls: "bg-gray-100 text-gray-500" },
  };

  return (
    <div className="space-y-6">
      {/* 잔액 요약 */}
      {!compact && !isFirstCharge && (
        <div className="app-surface app-surface--panel p-4">
          <div className="text-sm text-muted-foreground mb-3">
            {CREDIT_PREPAID_BALANCE_LABEL}
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
      <div className="w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
        <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-3 sm:px-6">
          <div className="text-sm font-semibold text-slate-800">
            {CREDIT_CHARGE_NOTICE_TITLE}
          </div>
          <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
            {CREDIT_CHARGE_NOTICE_BODY}
          </p>
        </div>
        <div className="grid md:grid-cols-2">
          {/* 왼쪽: 입금 계좌 / 코드 */}
          <div className="space-y-4 border-b border-slate-200/80 p-5 sm:p-6 md:border-b-0 md:border-r">
              <div className="flex items-center justify-between gap-3">
                {pendingOrder ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/80 opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
                      </span>
                      <span className="text-sm font-semibold">입금 대기중</span>
                    </div>
                    {pendingRemainingLabel ? (
                      <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-strong">
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
                    ? "rounded-xl border border-accent-muted bg-accent-soft/70 px-4 py-3"
                    : "rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-4 py-3"
                }
              >
                <div
                  className={
                    pendingOrder
                      ? "text-xs font-medium text-accent-strong"
                      : "text-xs text-muted-foreground"
                  }
                >
                  입금자명 코드
                </div>
                {pendingOrder ? (
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-2xl font-bold tracking-[0.2em] text-accent-strong">
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
                      ? "mt-2 text-xs leading-relaxed text-accent-strong/80"
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
            <div className="flex flex-col justify-between gap-6 bg-gradient-to-b from-primary-soft/50 to-white p-5 sm:p-6">
              <div>
                <div className="text-xs font-medium text-muted-foreground">
                  입금 금액
                </div>
                <div className="mt-2 text-4xl font-bold tracking-tight text-primary tabular-nums">
                  {formatManwon(displayAmount)}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  부가세 없음 · 면세 계산서
                </div>
              </div>

              <div className="space-y-4">
                <div className="min-h-5">
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
                </div>

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
                        setChargeUnits(clampChargeUnits(parsed, maxChargeUnits));
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
                          chargeUnits >= maxChargeUnits
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
                    × {formatManwon(chargeUnit)}
                  </div>
                </div>

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
      {!compact && !isFirstCharge && (
        <div className="space-y-3">
          <Separator />
          <div className="flex items-center justify-between gap-3">
            <div className="text-base font-semibold">충전 내역</div>
            <PeriodFilter
              value={ordersPeriod}
              onChange={setOrdersPeriod}
              useStoreCustomRange={false}
              customStartDate={ordersCustomStartDate}
              customEndDate={ordersCustomEndDate}
              onCustomRangeChange={({ startDate, endDate }) => {
                setOrdersCustomStartDate(startDate);
                setOrdersCustomEndDate(endDate);
              }}
              onClearCustomRange={() => {
                setOrdersCustomStartDate("");
                setOrdersCustomEndDate("");
              }}
            />
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
                        거래 선수금{orderDate ? ` · ${orderDate}` : ""}
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
            입금 확인 후 거래 선수금(크레딧)으로 자동 반영됩니다. (세금)계산서는 사용분 기준 월말 발행입니다.
          </div>
        </div>
      )}
    </div>
  );
};

export const PaymentTab = CreditPaymentTab;
