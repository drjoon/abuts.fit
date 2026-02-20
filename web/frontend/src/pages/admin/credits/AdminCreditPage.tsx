import { useState, useEffect, useMemo, useRef } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { usePeriodStore, periodToRangeQuery } from "@/store/usePeriodStore";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { SnapshotRecalcAllButton } from "@/shared/components/SnapshotRecalcAllButton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AutoMatchVerificationTab } from "./components/AutoMatchVerificationTab";
import { CreditLedgerModal } from "@/shared/components/CreditLedgerModal";
import { SalesmanLedgerModal } from "@/shared/components/SalesmanLedgerModal";

type AdminCreditLedgerType = "CHARGE" | "BONUS" | "SPEND" | "REFUND" | "ADJUST";

type AdminLedgerItem = {
  _id: string;
  type: AdminCreditLedgerType;
  amount: number;
  spentPaidAmount?: number | null;
  spentBonusAmount?: number | null;
  refType?: string;
  refId?: string | null;
  refRequestId?: string;
  uniqueKey: string;
  createdAt: string;
};

type AdminLedgerResponse = {
  success: boolean;
  data: {
    items: AdminLedgerItem[];
    total: number;
    page: number;
    pageSize: number;
  };
  message?: string;
};

const formatLedgerDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatShortCode = (value: string) => {
  const raw = String(value || "");
  if (!raw) return "-";
  const tail = raw.replace(/[^a-zA-Z0-9]/g, "");
  const s = tail.slice(-4).toUpperCase();
  return s || "-";
};

const creditTypeLabel = (t: AdminCreditLedgerType) => {
  if (t === "CHARGE") return "충전";
  if (t === "BONUS") return "보너스";
  if (t === "SPEND") return "사용";
  if (t === "REFUND") return "환불";
  return "조정";
};

const refTypeLabel = (refType?: string) => {
  const t = String(refType || "").trim();
  if (!t) return "-";
  if (t === "SHIPPING_FEE") return "배송비 (발송 1회)";
  if (t === "REQUEST") return "의뢰";
  return t;
};

type CreditStats = {
  totalOrgs: number;
  totalChargeOrders: number;
  totalBankTransactions: number;
  pendingChargeOrders: number;
  matchedChargeOrders: number;
  newBankTransactions: number;
  matchedBankTransactions: number;
  totalCharged: number;
  totalSpent: number;
  totalBonus: number;
  totalSpentPaidAmount?: number;
  totalSpentBonusAmount?: number;
  totalPaidBalance?: number;
  totalBonusBalance?: number;
};

type SalesmanCreditRow = {
  salesmanId: string;
  name: string;
  email: string;
  referralCode?: string;
  active: boolean;
  referredSalesmanCount?: number;
  wallet: {
    earnedAmount: number;
    paidOutAmount: number;
    adjustedAmount: number;
    balanceAmount: number;
    earnedAmountPeriod: number;
    paidOutAmountPeriod: number;
    adjustedAmountPeriod: number;
    balanceAmountPeriod: number;
  };
  performance30d: {
    referredOrgCount: number;
    level1OrgCount?: number;
    revenueAmount: number;
    directRevenueAmount?: number;
    level1RevenueAmount?: number;
    bonusAmount?: number;
    directBonusAmount?: number;
    level1BonusAmount?: number;
    orderCount: number;
    commissionAmount: number;
    myCommissionAmount?: number;
    level1CommissionAmount?: number;
  };
};

type SalesmanCreditsOverview = {
  ymd: string;
  periodKey: string;
  rangeStartUtc: string;
  rangeEndUtc: string;
  salesmenCount: number;
  referral: {
    paidRevenueAmount: number;
    bonusRevenueAmount: number;
    orderCount: number;
  };
  commission: {
    totalAmount: number;
    directAmount: number;
    indirectAmount: number;
  };
  walletPeriod: {
    earnedAmount: number;
    paidOutAmount: number;
    adjustedAmount: number;
    balanceAmount: number;
  };
  computedAt?: string | null;
};

type OrganizationCredit = {
  _id: string;
  name: string;
  companyName: string;
  businessNumber: string;
  ownerName?: string;
  ownerEmail?: string;
  balance: number;
  paidBalance: number;
  bonusBalance: number;
  spentAmount?: number;
  chargedPaidAmount?: number;
  chargedBonusAmount?: number;
  spentPaidAmount?: number;
  spentBonusAmount?: number;
};

type ChargeOrder = {
  _id: string;
  status: string;
  depositCode: string;
  supplyAmount: number;
  vatAmount: number;
  amountTotal: number;
  expiresAt?: string;
  matchedAt?: string;
  createdAt?: string;
  organizationId?: string;
  adminApprovalStatus?: "PENDING" | "APPROVED" | "REJECTED";
  adminApprovalNote?: string;
  adminApprovalAt?: string;
  adminApprovalBy?: { name?: string; email?: string };
};

type BankTransaction = {
  _id: string;
  externalId: string;
  tranAmt: number;
  printedContent: string;
  occurredAt: string;
  status: string;
  depositCode?: string;
  chargeOrderId?: string;
  matchedAt?: string;
};

export default function AdminCreditPage() {
  const { token } = useAuthStore();
  const { period, setPeriod } = usePeriodStore();
  const { toast } = useToast();

  const [stats, setStats] = useState<CreditStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const [organizations, setOrganizations] = useState<OrganizationCredit[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [orgSkip, setOrgSkip] = useState(0);
  const [orgHasMore, setOrgHasMore] = useState(true);

  const [orgLedgerOpen, setOrgLedgerOpen] = useState(false);
  const [orgLedgerOrg, setOrgLedgerOrg] = useState<OrganizationCredit | null>(
    null,
  );

  const [salesmanLedgerOpen, setSalesmanLedgerOpen] = useState(false);
  const [salesmanLedgerRow, setSalesmanLedgerRow] =
    useState<SalesmanCreditRow | null>(null);

  const [salesmen, setSalesmen] = useState<SalesmanCreditRow[]>([]);
  const [loadingSalesmen, setLoadingSalesmen] = useState(false);
  const [salesmanSkip, setSalesmanSkip] = useState(0);
  const [salesmanHasMore, setSalesmanHasMore] = useState(true);

  const [salesmanOverview, setSalesmanOverview] =
    useState<SalesmanCreditsOverview | null>(null);
  const [loadingSalesmanOverview, setLoadingSalesmanOverview] = useState(false);

  const [creditTab, setCreditTab] = useState<"requestor" | "salesman">(
    "requestor",
  );
  const [salesmanSortKey, setSalesmanSortKey] = useState<
    "balance" | "commission" | "revenue" | "name"
  >("balance");
  const [orgSortKey, setOrgSortKey] = useState<
    "paidBalance" | "bonusBalance" | "spentPaid" | "name"
  >("paidBalance");

  const [chargeOrders, setChargeOrders] = useState<ChargeOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("");
  const [orderSkip, setOrderSkip] = useState(0);
  const [orderHasMore, setOrderHasMore] = useState(true);

  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>(
    [],
  );
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [txStatusFilter, setTxStatusFilter] = useState<string>("");
  const [txSkip, setTxSkip] = useState(0);
  const [txHasMore, setTxHasMore] = useState(true);

  const ORG_PAGE_SIZE = 9;
  const SALESMAN_PAGE_SIZE = 9;
  const ORDER_PAGE_SIZE = 50;
  const TX_PAGE_SIZE = 50;

  const [txTab, setTxTab] = useState<"auto" | "manual">("auto");

  const [selectedTx, setSelectedTx] = useState<BankTransaction | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<ChargeOrder | null>(null);
  const [matchNote, setMatchNote] = useState("");
  const [matchForce, setMatchForce] = useState(false);
  const [matching, setMatching] = useState(false);
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [processingApproval, setProcessingApproval] = useState(false);

  const orgScrollRef = useRef<HTMLDivElement | null>(null);
  const orgSentinelRef = useRef<HTMLDivElement | null>(null);
  const salesmanScrollRef = useRef<HTMLDivElement | null>(null);
  const salesmanSentinelRef = useRef<HTMLDivElement | null>(null);
  const orderScrollRef = useRef<HTMLDivElement | null>(null);
  const orderSentinelRef = useRef<HTMLDivElement | null>(null);
  const txScrollRef = useRef<HTMLDivElement | null>(null);
  const txSentinelRef = useRef<HTMLDivElement | null>(null);

  const loadStats = async () => {
    if (!token) return;
    setLoadingStats(true);
    try {
      const res = await request<{ success: boolean; data: CreditStats }>({
        path: "/api/admin/credits/stats",
        method: "GET",
        token,
      });
      if (res.ok && res.data?.data) {
        setStats(res.data.data);
      }
    } catch (error) {
      toast({
        title: "통계 조회 실패",
        description: "크레딧 통계를 불러오는데 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoadingStats(false);
    }
  };

  const loadSalesmanOverview = async () => {
    if (!token) return;
    setLoadingSalesmanOverview(true);
    try {
      const qs = new URLSearchParams({ period });
      const res = await request<{
        success: boolean;
        data: SalesmanCreditsOverview;
      }>({
        path: `/api/admin/credits/salesmen/overview?${qs.toString()}`,
        method: "GET",
        token,
      });
      if (res.ok && res.data?.success && res.data?.data) {
        setSalesmanOverview(res.data.data);
      }
    } catch {
      setSalesmanOverview(null);
    } finally {
      setLoadingSalesmanOverview(false);
    }
  };

  const loadSalesmen = async ({ reset = false } = {}) => {
    if (!token) return;
    setLoadingSalesmen(true);
    try {
      const nextSkip = reset ? 0 : salesmanSkip;
      const qs = new URLSearchParams({
        limit: String(SALESMAN_PAGE_SIZE),
        skip: String(nextSkip),
      });
      const rangeQ = periodToRangeQuery(period);
      if (rangeQ) {
        const rp = new URLSearchParams(rangeQ.replace(/^\?/, ""));
        rp.forEach((v, k) => qs.set(k, v));
      }
      const res = await request<{
        success: boolean;
        data: {
          items: SalesmanCreditRow[];
          total?: number;
          skip?: number;
          limit?: number;
        };
      }>({
        path: `/api/admin/credits/salesmen?${qs.toString()}`,
        method: "GET",
        token,
      });
      if (res.ok && res.data?.data?.items) {
        const items = Array.isArray(res.data.data.items)
          ? res.data.data.items
          : [];
        setSalesmen((prev) => (reset ? items : [...prev, ...items]));
        setSalesmanSkip(nextSkip + items.length);
        setSalesmanHasMore(items.length >= SALESMAN_PAGE_SIZE);
      }
    } catch (error) {
      toast({
        title: "영업자 크레딧 조회 실패",
        description: "영업자 크레딧을 불러오는데 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoadingSalesmen(false);
    }
  };

  const loadOrganizations = async ({ reset = false } = {}) => {
    if (!token) return;
    setLoadingOrgs(true);
    try {
      const qs = new URLSearchParams({
        limit: String(ORG_PAGE_SIZE),
        skip: String(reset ? 0 : orgSkip),
      });
      const rangeQ = periodToRangeQuery(period);
      if (rangeQ) {
        const rp = new URLSearchParams(rangeQ.replace(/^\?/, ""));
        rp.forEach((v, k) => qs.set(k, v));
      }
      const res = await request<{
        success: boolean;
        data: {
          items: OrganizationCredit[];
          total?: number;
          skip?: number;
          limit?: number;
        };
      }>({
        path: `/api/admin/credits/organizations?${qs.toString()}`,
        method: "GET",
        token,
      });
      if (res.ok && res.data?.data?.items) {
        const items = Array.isArray(res.data.data.items)
          ? res.data.data.items
          : [];
        setOrganizations((prev) => (reset ? items : [...prev, ...items]));
        const nextSkip = (reset ? 0 : orgSkip) + items.length;
        setOrgSkip(nextSkip);
        setOrgHasMore(items.length >= ORG_PAGE_SIZE);
      }
    } catch (error) {
      toast({
        title: "조직 조회 실패",
        description: "조직별 크레딧을 불러오는데 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoadingOrgs(false);
    }
  };

  const loadChargeOrders = async (status?: string, { reset = false } = {}) => {
    if (!token) return;
    setLoadingOrders(true);
    try {
      const nextSkip = reset ? 0 : orderSkip;
      const qs = new URLSearchParams({
        limit: String(ORDER_PAGE_SIZE),
        skip: String(nextSkip),
      });
      if (status) qs.set("status", status);

      const res = await request<{
        success: boolean;
        data: {
          items: ChargeOrder[];
          total: number;
          skip: number;
          limit: number;
        };
      }>({
        path: `/api/admin/credits/b-plan/charge-orders?${qs.toString()}`,
        method: "GET",
        token,
      });
      if (res.ok && res.data?.data?.items) {
        const items = Array.isArray(res.data.data.items)
          ? res.data.data.items
          : [];
        setChargeOrders((prev) => (reset ? items : [...prev, ...items]));
        setOrderSkip(nextSkip + items.length);
        setOrderHasMore(items.length >= ORDER_PAGE_SIZE);
      }
    } catch (error) {
      toast({
        title: "충전 주문 조회 실패",
        description: "충전 주문을 불러오는데 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoadingOrders(false);
    }
  };

  const loadBankTransactions = async (
    status?: string,
    { reset = false } = {},
  ) => {
    if (!token) return;
    setLoadingTransactions(true);
    try {
      const nextSkip = reset ? 0 : txSkip;
      const qs = new URLSearchParams({
        limit: String(TX_PAGE_SIZE),
        skip: String(nextSkip),
      });
      if (status) qs.set("status", status);

      const res = await request<{
        success: boolean;
        data: {
          items: BankTransaction[];
          total: number;
          skip: number;
          limit: number;
        };
      }>({
        path: `/api/admin/credits/b-plan/bank-transactions?${qs.toString()}`,
        method: "GET",
        token,
      });
      if (res.ok && res.data?.data?.items) {
        const items = Array.isArray(res.data.data.items)
          ? res.data.data.items
          : [];
        setBankTransactions((prev) => (reset ? items : [...prev, ...items]));
        setTxSkip(nextSkip + items.length);
        setTxHasMore(items.length >= TX_PAGE_SIZE);
      }
    } catch (error) {
      toast({
        title: "입금 내역 조회 실패",
        description: "입금 내역을 불러오는데 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoadingTransactions(false);
    }
  };

  const handleManualMatch = async () => {
    if (!selectedTx || !selectedOrder || !token) return;

    setMatching(true);
    try {
      const res = await request<{ success: boolean }>({
        path: "/api/admin/credits/b-plan/match",
        method: "POST",
        token,
        jsonBody: {
          bankTransactionId: selectedTx._id,
          chargeOrderId: selectedOrder._id,
          note: matchNote,
          force: matchForce,
        },
      });

      if (res.ok) {
        toast({
          title: "매칭 완료",
          description: "입금 내역과 충전 주문이 매칭되었습니다.",
        });
        setSelectedTx(null);
        setSelectedOrder(null);
        setMatchNote("");
        setMatchForce(false);
        setOrderSkip(0);
        setOrderHasMore(true);
        setTxSkip(0);
        setTxHasMore(true);
        loadChargeOrders(orderStatusFilter, { reset: true });
        loadBankTransactions(txStatusFilter, { reset: true });
        loadStats();
      } else {
        throw new Error("매칭 실패");
      }
    } catch (error: any) {
      toast({
        title: "매칭 실패",
        description: error?.message || "매칭에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setMatching(false);
    }
  };

  useEffect(() => {
    loadStats();
    setOrgSkip(0);
    setOrgHasMore(true);
    setSalesmanSkip(0);
    setSalesmanHasMore(true);
    setOrderSkip(0);
    setOrderHasMore(true);
    setTxSkip(0);
    setTxHasMore(true);
    loadOrganizations({ reset: true });
    loadChargeOrders(orderStatusFilter, { reset: true });
    loadBankTransactions(txStatusFilter, { reset: true });
    loadSalesmen({ reset: true });
  }, [token]);

  useEffect(() => {
    setSalesmen([]);
    setSalesmanSkip(0);
    setSalesmanHasMore(true);
    loadSalesmen({ reset: true });
    loadSalesmanOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, token]);

  useEffect(() => {
    const sentinel = orgSentinelRef.current;
    const root = orgScrollRef.current;
    if (!sentinel || !root) return;
    if (!orgHasMore || loadingOrgs) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit) return;
        if (loadingOrgs || !orgHasMore) return;
        loadOrganizations({ reset: false });
      },
      { root, rootMargin: "400px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [orgHasMore, loadingOrgs, orgSkip, token]);

  useEffect(() => {
    const sentinel = salesmanSentinelRef.current;
    const root = salesmanScrollRef.current;
    if (!sentinel || !root) return;
    if (!salesmanHasMore || loadingSalesmen) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit) return;
        if (loadingSalesmen || !salesmanHasMore) return;
        loadSalesmen({ reset: false });
      },
      { root, rootMargin: "400px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [salesmanHasMore, loadingSalesmen, salesmanSkip, token]);

  useEffect(() => {
    const sentinel = orderSentinelRef.current;
    const root = orderScrollRef.current;
    if (!sentinel || !root) return;
    if (!orderHasMore || loadingOrders) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit) return;
        if (loadingOrders || !orderHasMore) return;
        loadChargeOrders(orderStatusFilter, { reset: false });
      },
      { root, rootMargin: "400px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [orderHasMore, loadingOrders, orderSkip, orderStatusFilter, token]);

  useEffect(() => {
    const sentinel = txSentinelRef.current;
    const root = txScrollRef.current;
    if (!sentinel || !root) return;
    if (!txHasMore || loadingTransactions) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit) return;
        if (loadingTransactions || !txHasMore) return;
        loadBankTransactions(txStatusFilter, { reset: false });
      },
      { root, rootMargin: "400px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [txHasMore, loadingTransactions, txSkip, txStatusFilter, token]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    return d.toLocaleString("ko-KR");
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<
      string,
      "default" | "secondary" | "destructive" | "outline"
    > = {
      PENDING: "outline",
      MATCHED: "default",
      EXPIRED: "destructive",
      CANCELED: "secondary",
      NEW: "outline",
      IGNORED: "secondary",
    };
    return <Badge variant={variants[status] || "default"}>{status}</Badge>;
  };

  const requestorTotalBalance = useMemo(() => {
    return (organizations || []).reduce(
      (acc, org) => acc + Number(org?.balance || 0),
      0,
    );
  }, [organizations]);

  const salesmanSummary = useMemo(() => {
    const fallback = {
      totalSalesmen: (salesmen || []).length,
      totalBalance: (salesmen || []).reduce(
        (acc, s) => acc + Number(s?.wallet?.balanceAmountPeriod || 0),
        0,
      ),
      totalEarned: (salesmen || []).reduce(
        (acc, s) =>
          acc +
          Number(
            (s?.performance30d?.myCommissionAmount ?? 0) +
              (s?.performance30d?.level1CommissionAmount ?? 0),
          ),
        0,
      ),
      totalPaidOut: (salesmen || []).reduce(
        (acc, s) => acc + Number(s?.wallet?.paidOutAmountPeriod || 0),
        0,
      ),
      totalReferredRevenue30d: (salesmen || []).reduce(
        (acc, s) => acc + Number(s?.performance30d?.revenueAmount || 0),
        0,
      ),
      totalReferredBonus30d: (salesmen || []).reduce(
        (acc, s) => acc + Number(s?.performance30d?.bonusAmount || 0),
        0,
      ),
    };

    if (!salesmanOverview) return fallback;
    return {
      totalSalesmen: Number(salesmanOverview.salesmenCount || 0),
      totalBalance: Number(salesmanOverview.walletPeriod?.balanceAmount || 0),
      totalEarned: Number(salesmanOverview.commission?.totalAmount || 0),
      totalPaidOut: Number(salesmanOverview.walletPeriod?.paidOutAmount || 0),
      totalReferredRevenue30d: Number(
        salesmanOverview.referral?.paidRevenueAmount || 0,
      ),
      totalReferredBonus30d: Number(
        salesmanOverview.referral?.bonusRevenueAmount || 0,
      ),
    };
  }, [salesmanOverview, salesmen]);

  const [orgLedgerPeriod, setOrgLedgerPeriod] = useState<
    "7d" | "30d" | "90d" | "thisMonth" | "lastMonth"
  >("30d");
  const [orgLedgerType, setOrgLedgerType] = useState<
    "all" | AdminCreditLedgerType
  >("all");
  const [orgLedgerQ, setOrgLedgerQ] = useState("");
  const [orgLedgerFrom, setOrgLedgerFrom] = useState("");
  const [orgLedgerTo, setOrgLedgerTo] = useState("");
  const [orgLedgerPage, setOrgLedgerPage] = useState(1);
  const [orgLedgerLoading, setOrgLedgerLoading] = useState(false);
  const [orgLedgerItems, setOrgLedgerItems] = useState<AdminLedgerItem[]>([]);
  const [orgLedgerTotal, setOrgLedgerTotal] = useState(0);

  const LEDGER_PAGE_SIZE = 50;

  const resetOrgLedgerFilters = () => {
    setOrgLedgerPeriod("30d");
    setOrgLedgerType("all");
    setOrgLedgerQ("");
    setOrgLedgerFrom("");
    setOrgLedgerTo("");
    setOrgLedgerPage(1);
  };

  const loadOrgLedger = async () => {
    if (!token || !orgLedgerOrg?._id) return;
    setOrgLedgerLoading(true);
    try {
      const params = new URLSearchParams();
      if (orgLedgerPeriod) params.set("period", orgLedgerPeriod);
      if (orgLedgerType && orgLedgerType !== "all")
        params.set("type", orgLedgerType);
      if (orgLedgerQ.trim()) params.set("q", orgLedgerQ.trim());
      if (orgLedgerFrom) params.set("from", orgLedgerFrom);
      if (orgLedgerTo) params.set("to", orgLedgerTo);
      params.set("page", String(orgLedgerPage));
      params.set("pageSize", String(LEDGER_PAGE_SIZE));

      const res = await request<AdminLedgerResponse>({
        path: `/api/admin/credits/organizations/${orgLedgerOrg._id}/ledger?${params.toString()}`,
        method: "GET",
        token,
      });

      if (!res.ok || !res.data?.success) {
        const msg = (res.data as any)?.message;
        throw new Error(msg || "크레딧 내역 조회에 실패했습니다.");
      }

      const data = res.data.data;
      setOrgLedgerItems(Array.isArray(data?.items) ? data.items : []);
      setOrgLedgerTotal(Number(data?.total || 0));
    } catch (e: any) {
      setOrgLedgerItems([]);
      setOrgLedgerTotal(0);
      toast({
        title: "크레딧 내역 조회 실패",
        description: e?.message || "다시 시도해주세요.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setOrgLedgerLoading(false);
    }
  };

  useEffect(() => {
    if (!orgLedgerOpen) return;
    if (orgLedgerPage !== 1) return;
    loadOrgLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgLedgerOpen]);

  useEffect(() => {
    if (!orgLedgerOpen) return;
    loadOrgLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    orgLedgerPeriod,
    orgLedgerType,
    orgLedgerQ,
    orgLedgerFrom,
    orgLedgerTo,
    orgLedgerPage,
  ]);

  return (
    <div className="space-y-6 p-6 overflow-hidden">
      <Tabs value={creditTab} onValueChange={(v) => setCreditTab(v as any)}>
        <div className="flex items-center justify-between">
          <TabsList className="h-12">
            <TabsTrigger value="requestor" className="px-6 text-base">
              의뢰자
            </TabsTrigger>
            <TabsTrigger value="salesman" className="px-6 text-base">
              영업자
            </TabsTrigger>
          </TabsList>

          {creditTab === "salesman" ? (
            <SnapshotRecalcAllButton
              token={token}
              periodKey={period}
              className="h-9"
              onSuccess={loadSalesmanOverview}
            />
          ) : null}
        </div>

        <TabsContent value="requestor" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  총 조직 수
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loadingStats
                    ? "..."
                    : stats?.totalOrgs.toLocaleString() || 0}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  크레딧 충전액
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loadingStats
                    ? "..."
                    : `${(
                        Number(stats?.totalCharged || 0) +
                        Number(stats?.totalBonus || 0)
                      ).toLocaleString()}원`}
                </div>
                <div className="text-xs text-muted-foreground">
                  유료 {(stats?.totalCharged || 0).toLocaleString()}원
                </div>
                <div className="text-xs text-muted-foreground">
                  무료 {(stats?.totalBonus || 0).toLocaleString()}원
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  크레딧 잔여액
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loadingStats
                    ? "..."
                    : `${(
                        (stats?.totalPaidBalance || 0) +
                        (stats?.totalBonusBalance || 0)
                      ).toLocaleString()}원`}
                </div>
                <div className="text-xs text-muted-foreground">
                  유료 {(stats?.totalPaidBalance || 0).toLocaleString()}원
                </div>
                <div className="text-xs text-muted-foreground">
                  무료 {(stats?.totalBonusBalance || 0).toLocaleString()}원
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  크레딧 사용액
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loadingStats
                    ? "..."
                    : `${(stats?.totalSpent || 0).toLocaleString()}원`}
                </div>
                <div className="text-xs text-muted-foreground">
                  유료 {(stats?.totalSpentPaidAmount || 0).toLocaleString()}원
                </div>
                <div className="text-xs text-muted-foreground">
                  무료 {(stats?.totalSpentBonusAmount || 0).toLocaleString()}원
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  미매칭 입금
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600">
                  {loadingStats ? "..." : stats?.newBankTransactions || 0}
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="organizations" className="space-y-4">
            <TabsList>
              <TabsTrigger value="organizations">조직별 크레딧</TabsTrigger>
              <TabsTrigger value="verification">자동 매칭 검증</TabsTrigger>
              <TabsTrigger value="orders">충전 주문</TabsTrigger>
              <TabsTrigger value="transactions">입금 내역</TabsTrigger>
            </TabsList>

            <TabsContent value="organizations" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>조직별 크레딧 현황</CardTitle>
                    <div className="w-[180px]">
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={orgSortKey}
                        onChange={(e) => setOrgSortKey(e.target.value as any)}
                      >
                        <option value="paidBalance">정렬: 유료잔액순</option>
                        <option value="bonusBalance">정렬: 무료잔액순</option>
                        <option value="spentPaid">정렬: 유료사용순</option>
                        <option value="name">정렬: 이름순</option>
                      </select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingOrgs ? (
                    <div className="text-center py-8 text-muted-foreground">
                      불러오는 중...
                    </div>
                  ) : (
                    <div
                      ref={orgScrollRef}
                      className="h-[60vh] overflow-y-auto pr-1"
                    >
                      {organizations.length === 0 && !loadingOrgs ? (
                        <div className="text-center py-8 text-muted-foreground">
                          조직이 없습니다.
                        </div>
                      ) : (
                        <div className="grid gap-4 md:grid-cols-3">
                          {[...organizations]
                            .sort((a, b) => {
                              if (orgSortKey === "paidBalance")
                                return (
                                  Number(b.paidBalance || 0) -
                                  Number(a.paidBalance || 0)
                                );
                              if (orgSortKey === "bonusBalance")
                                return (
                                  Number(b.bonusBalance || 0) -
                                  Number(a.bonusBalance || 0)
                                );
                              if (orgSortKey === "spentPaid")
                                return (
                                  Number(b.spentPaidAmount || 0) -
                                  Number(a.spentPaidAmount || 0)
                                );
                              return String(a.name || "").localeCompare(
                                String(b.name || ""),
                                "ko",
                              );
                            })
                            .map((org) => {
                              const chargedPaid = Number(
                                org.chargedPaidAmount || 0,
                              );
                              const chargedBonus = Number(
                                org.chargedBonusAmount || 0,
                              );
                              const spentPaid = Number(
                                org.spentPaidAmount || 0,
                              );
                              const spentBonus = Number(
                                org.spentBonusAmount || 0,
                              );
                              const paidRemain = Number(org.paidBalance || 0);
                              const bonusRemain = Number(org.bonusBalance || 0);
                              return (
                                <Card
                                  key={org._id}
                                  className="border-muted cursor-pointer"
                                  onClick={() => {
                                    setOrgLedgerOrg(org);
                                    setOrgLedgerOpen(true);
                                  }}
                                >
                                  <CardHeader className="pb-3">
                                    <CardTitle className="text-base">
                                      {org.name}
                                    </CardTitle>
                                    <CardDescription className="space-y-1">
                                      <div>{org.companyName || "-"}</div>
                                      <div className="font-mono text-xs">
                                        {org.businessNumber || "-"}
                                      </div>
                                      <div className="text-xs">
                                        {org.ownerName || "-"} ·{" "}
                                        {org.ownerEmail || "-"}
                                      </div>
                                    </CardDescription>
                                  </CardHeader>
                                  <CardContent className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                      <div className="text-muted-foreground">
                                        잔여크레딧(구매)
                                      </div>
                                      <div className="font-semibold">
                                        {paidRemain.toLocaleString()}원
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-muted-foreground">
                                        잔여크레딧(무료)
                                      </div>
                                      <div className="font-semibold">
                                        {bonusRemain.toLocaleString()}원
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-muted-foreground">
                                        충전크레딧(구매)
                                      </div>
                                      <div className="font-medium">
                                        {chargedPaid.toLocaleString()}원
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-muted-foreground">
                                        충전크레딧(무료)
                                      </div>
                                      <div className="font-medium">
                                        {chargedBonus.toLocaleString()}원
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-muted-foreground">
                                        사용크레딧(구매)
                                      </div>
                                      <div className="font-medium">
                                        {spentPaid.toLocaleString()}원
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-muted-foreground">
                                        사용크레딧(무료)
                                      </div>
                                      <div className="font-medium">
                                        {spentBonus.toLocaleString()}원
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })}
                        </div>
                      )}
                      <div ref={orgSentinelRef} className="h-6" />
                      {loadingOrgs && organizations.length > 0 && (
                        <div className="text-center py-4 text-muted-foreground text-sm">
                          불러오는 중...
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="verification" className="space-y-4">
              <AutoMatchVerificationTab />
            </TabsContent>

            <TabsContent value="orders" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="text-sm text-muted-foreground">
                      승인 상태: 대기(PENDING), 승인(APPROVED), 거절(REJECTED)
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant={
                          orderStatusFilter === "" ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => {
                          setOrderStatusFilter("");
                          setOrderSkip(0);
                          setOrderHasMore(true);
                          loadChargeOrders(undefined, { reset: true });
                        }}
                      >
                        전체
                      </Button>
                      <Button
                        variant={
                          orderStatusFilter === "PENDING"
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() => {
                          setOrderStatusFilter("PENDING");
                          setOrderSkip(0);
                          setOrderHasMore(true);
                          loadChargeOrders("PENDING", { reset: true });
                        }}
                      >
                        대기중
                      </Button>
                      <Button
                        variant={
                          orderStatusFilter === "MATCHED"
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() => {
                          setOrderStatusFilter("MATCHED");
                          setOrderSkip(0);
                          setOrderHasMore(true);
                          loadChargeOrders("MATCHED", { reset: true });
                        }}
                      >
                        매칭완료
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingOrders ? (
                    <div className="text-center py-8 text-muted-foreground">
                      불러오는 중...
                    </div>
                  ) : chargeOrders.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      충전 주문이 없습니다.
                    </div>
                  ) : (
                    <div
                      ref={orderScrollRef}
                      className="h-[60vh] overflow-y-auto pr-1"
                    >
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>상태</TableHead>
                            <TableHead>입금코드</TableHead>
                            <TableHead className="text-right">공급가</TableHead>
                            <TableHead className="text-right">총액</TableHead>
                            <TableHead>승인 상태</TableHead>
                            <TableHead>승인자/시각</TableHead>
                            <TableHead>생성일</TableHead>
                            <TableHead>만료일</TableHead>
                            <TableHead>매칭일</TableHead>
                            <TableHead className="text-right">액션</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {chargeOrders.map((order) => (
                            <TableRow key={order._id}>
                              <TableCell>
                                {getStatusBadge(order.status)}
                              </TableCell>
                              <TableCell className="font-mono">
                                {order.depositCode}
                              </TableCell>
                              <TableCell className="text-right">
                                {order.supplyAmount.toLocaleString()}원
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {order.amountTotal.toLocaleString()}원
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    order.adminApprovalStatus === "APPROVED"
                                      ? "default"
                                      : order.adminApprovalStatus === "REJECTED"
                                        ? "destructive"
                                        : "outline"
                                  }
                                >
                                  {order.adminApprovalStatus || "PENDING"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">
                                {order.adminApprovalBy?.name
                                  ? `${order.adminApprovalBy.name} (${order.adminApprovalBy.email || "-"})`
                                  : "-"}
                                <div className="text-xs text-muted-foreground">
                                  {formatDate(order.adminApprovalAt)}
                                </div>
                              </TableCell>
                              <TableCell>
                                {formatDate(order.createdAt)}
                              </TableCell>
                              <TableCell>
                                {formatDate(order.expiresAt)}
                              </TableCell>
                              <TableCell>
                                {formatDate(order.matchedAt)}
                              </TableCell>
                              <TableCell className="text-right space-x-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={
                                    order.adminApprovalStatus !== "PENDING" ||
                                    order.status === "CANCELED"
                                  }
                                  onClick={() => {
                                    setSelectedOrder(order);
                                    setApproveModalOpen(true);
                                  }}
                                >
                                  승인
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={
                                    order.adminApprovalStatus !== "PENDING" ||
                                    order.status === "CANCELED"
                                  }
                                  onClick={() => {
                                    setSelectedOrder(order);
                                    setRejectNote("");
                                    setRejectModalOpen(true);
                                  }}
                                >
                                  거절
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <div ref={orderSentinelRef} className="h-10" />
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="transactions" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <CardTitle>입금 내역</CardTitle>
                      <CardDescription>
                        팝빌 웹훅으로 수신된 입금 내역을 기반으로 자동 매칭을
                        처리합니다.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs value={txTab} onValueChange={(v) => setTxTab(v as any)}>
                    <TabsList>
                      <TabsTrigger value="auto">자동 매칭</TabsTrigger>
                      <TabsTrigger value="manual">수동 연결(예외)</TabsTrigger>
                    </TabsList>

                    <TabsContent value="auto" className="pt-4">
                      <div className="flex gap-2 flex-wrap justify-end pb-3">
                        <Button
                          variant={
                            txStatusFilter === "" ? "default" : "outline"
                          }
                          size="sm"
                          onClick={() => {
                            setTxStatusFilter("");
                            setTxSkip(0);
                            setTxHasMore(true);
                            loadBankTransactions(undefined, { reset: true });
                          }}
                        >
                          전체
                        </Button>
                        <Button
                          variant={
                            txStatusFilter === "NEW" ? "default" : "outline"
                          }
                          size="sm"
                          onClick={() => {
                            setTxStatusFilter("NEW");
                            setTxSkip(0);
                            setTxHasMore(true);
                            loadBankTransactions("NEW", { reset: true });
                          }}
                        >
                          미매칭
                        </Button>
                        <Button
                          variant={
                            txStatusFilter === "MATCHED" ? "default" : "outline"
                          }
                          size="sm"
                          onClick={() => {
                            setTxStatusFilter("MATCHED");
                            setTxSkip(0);
                            setTxHasMore(true);
                            loadBankTransactions("MATCHED", { reset: true });
                          }}
                        >
                          매칭완료
                        </Button>
                      </div>

                      {loadingTransactions ? (
                        <div className="text-center py-8 text-muted-foreground">
                          불러오는 중...
                        </div>
                      ) : bankTransactions.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          입금 내역이 없습니다.
                        </div>
                      ) : (
                        <div
                          ref={txScrollRef}
                          className="h-[60vh] overflow-y-auto pr-1"
                        >
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>상태</TableHead>
                                <TableHead>입금코드</TableHead>
                                <TableHead className="text-right">
                                  금액
                                </TableHead>
                                <TableHead>입금자</TableHead>
                                <TableHead>발생일</TableHead>
                                <TableHead>매칭일</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {bankTransactions.map((tx) => (
                                <TableRow key={tx._id}>
                                  <TableCell>
                                    {getStatusBadge(tx.status)}
                                  </TableCell>
                                  <TableCell className="font-mono">
                                    {tx.depositCode || "-"}
                                  </TableCell>
                                  <TableCell className="text-right font-semibold">
                                    {tx.tranAmt.toLocaleString()}원
                                  </TableCell>
                                  <TableCell>{tx.printedContent}</TableCell>
                                  <TableCell>
                                    {formatDate(tx.occurredAt)}
                                  </TableCell>
                                  <TableCell>
                                    {formatDate(tx.matchedAt)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          <div ref={txSentinelRef} className="h-10" />
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="manual" className="pt-4 space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                          <CardHeader>
                            <CardTitle>미매칭 입금 내역</CardTitle>
                            <CardDescription>
                              기본은 자동 매칭입니다. 자동 매칭이 실패한
                              케이스만 예외적으로 수동 연결하세요.
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            {loadingTransactions ? (
                              <div className="text-center py-8 text-muted-foreground">
                                불러오는 중...
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {bankTransactions
                                  .filter((tx) => tx.status === "NEW")
                                  .map((tx) => (
                                    <div
                                      key={tx._id}
                                      className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                                        selectedTx?._id === tx._id
                                          ? "border-primary bg-primary/5"
                                          : "hover:bg-gray-50"
                                      }`}
                                      onClick={() => setSelectedTx(tx)}
                                    >
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <div className="font-medium">
                                            {tx.printedContent}
                                          </div>
                                          <div className="text-sm text-muted-foreground">
                                            코드: {tx.depositCode || "없음"}
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <div className="font-semibold">
                                            {tx.tranAmt.toLocaleString()}원
                                          </div>
                                          <div className="text-xs text-muted-foreground">
                                            {formatDate(tx.occurredAt)}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <CardTitle>대기중인 충전 주문</CardTitle>
                          </CardHeader>
                          <CardContent>
                            {loadingOrders ? (
                              <div className="text-center py-8 text-muted-foreground">
                                불러오는 중...
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {chargeOrders
                                  .filter((order) => order.status === "PENDING")
                                  .map((order) => (
                                    <div
                                      key={order._id}
                                      className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                                        selectedOrder?._id === order._id
                                          ? "border-primary bg-primary/5"
                                          : "hover:bg-gray-50"
                                      }`}
                                      onClick={() => setSelectedOrder(order)}
                                    >
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <div className="font-medium font-mono">
                                            {order.depositCode}
                                          </div>
                                          <div className="text-sm text-muted-foreground">
                                            공급가:{" "}
                                            {order.supplyAmount.toLocaleString()}
                                            원
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <div className="font-semibold">
                                            {order.amountTotal.toLocaleString()}
                                            원
                                          </div>
                                          <div className="text-xs text-muted-foreground">
                                            {formatDate(order.createdAt)}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>

                      <Card>
                        <CardHeader>
                          <CardTitle>수동 연결 실행</CardTitle>
                          <CardDescription>
                            입금 내역과 충전 주문을 직접 연결합니다. 금액/코드가
                            불일치하면 기본적으로 막히며, 예외 허용을 켜면 강제
                            연결할 수 있습니다.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {selectedTx && selectedOrder ? (
                            <>
                              <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                  <Label>선택된 입금 내역</Label>
                                  <div className="rounded-lg border p-3 bg-gray-50">
                                    <div className="font-medium">
                                      {selectedTx.printedContent}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      금액:{" "}
                                      {selectedTx.tranAmt.toLocaleString()}원
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      코드: {selectedTx.depositCode || "없음"}
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <Label>선택된 충전 주문</Label>
                                  <div className="rounded-lg border p-3 bg-gray-50">
                                    <div className="font-medium font-mono">
                                      {selectedOrder.depositCode}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      금액:{" "}
                                      {selectedOrder.amountTotal.toLocaleString()}
                                      원
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      생성:{" "}
                                      {formatDate(selectedOrder.createdAt)}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="match-note">메모</Label>
                                <Input
                                  id="match-note"
                                  value={matchNote}
                                  onChange={(e) => setMatchNote(e.target.value)}
                                  placeholder="(선택) 메모"
                                />
                              </div>

                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id="match-force"
                                  checked={matchForce}
                                  onChange={(e) =>
                                    setMatchForce(e.target.checked)
                                  }
                                  className="rounded"
                                />
                                <Label
                                  htmlFor="match-force"
                                  className="cursor-pointer"
                                >
                                  예외 허용 (금액/코드 불일치 허용)
                                </Label>
                              </div>

                              <Button
                                onClick={handleManualMatch}
                                disabled={matching}
                                className="w-full"
                              >
                                {matching ? "연결 중..." : "연결 실행"}
                              </Button>
                            </>
                          ) : (
                            <div className="text-center py-8 text-muted-foreground">
                              입금 내역과 충전 주문을 각각 선택하세요.
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="salesman" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  총 영업자 수
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loadingSalesmanOverview
                    ? "..."
                    : salesmanSummary.totalSalesmen.toLocaleString()}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  소개 매출 (기간)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loadingSalesmanOverview
                    ? "..."
                    : `${(
                        Number(salesmanSummary.totalReferredRevenue30d || 0) +
                        Number(salesmanSummary.totalReferredBonus30d || 0)
                      ).toLocaleString()}원`}
                </div>
                <div className="text-xs text-muted-foreground">
                  유료{" "}
                  {Number(
                    salesmanSummary.totalReferredRevenue30d || 0,
                  ).toLocaleString()}
                  원
                </div>
                <div className="text-xs text-muted-foreground">
                  무료{" "}
                  {Number(
                    salesmanSummary.totalReferredBonus30d || 0,
                  ).toLocaleString()}
                  원
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">수수료</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loadingSalesmanOverview
                    ? "..."
                    : `${salesmanSummary.totalEarned.toLocaleString()}원`}
                </div>
                <div className="text-xs text-muted-foreground">
                  수수료율{" "}
                  {(() => {
                    const base = Number(
                      salesmanSummary.totalReferredRevenue30d || 0,
                    );
                    const comm = Number(salesmanSummary.totalEarned || 0);
                    if (base <= 0) return "-";
                    return `${((comm / base) * 100).toFixed(1)}%`;
                  })()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">기간 잔액</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loadingSalesmanOverview
                    ? "..."
                    : `${salesmanSummary.totalBalance.toLocaleString()}원`}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">총 정산</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loadingSalesmanOverview
                    ? "..."
                    : `${salesmanSummary.totalPaidOut.toLocaleString()}원`}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle>영업자 크레딧</CardTitle>
                </div>
                <div className="w-[170px]">
                  <select
                    className="h-9 w-full rounded-md border border-input bg-muted/40 px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={salesmanSortKey}
                    onChange={(e) => setSalesmanSortKey(e.target.value as any)}
                  >
                    <option value="balance">정렬: 잔액순</option>
                    <option value="commission">정렬: 수수료순</option>
                    <option value="revenue">정렬: 매출순</option>
                    <option value="name">정렬: 이름순</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingSalesmen ? (
                <div className="text-center py-8 text-muted-foreground">
                  불러오는 중...
                </div>
              ) : salesmen.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  영업자 데이터가 없습니다.
                </div>
              ) : (
                <div
                  ref={salesmanScrollRef}
                  className="h-[60vh] overflow-y-auto pr-1"
                >
                  <div className="grid gap-4 md:grid-cols-3">
                    {[...salesmen]
                      .sort((a, b) => {
                        if (salesmanSortKey === "balance")
                          return (
                            Number(b.wallet?.balanceAmountPeriod || 0) -
                            Number(a.wallet?.balanceAmountPeriod || 0)
                          );
                        if (salesmanSortKey === "commission")
                          return (
                            Number(b.performance30d?.commissionAmount || 0) -
                            Number(a.performance30d?.commissionAmount || 0)
                          );
                        if (salesmanSortKey === "revenue")
                          return (
                            Number(b.performance30d?.revenueAmount || 0) -
                            Number(a.performance30d?.revenueAmount || 0)
                          );
                        return String(a.name || "").localeCompare(
                          String(b.name || ""),
                          "ko",
                        );
                      })
                      .map((s) => (
                        <Card
                          key={s.salesmanId}
                          className="border-muted cursor-pointer"
                          onClick={() => {
                            setSalesmanLedgerRow(s);
                            setSalesmanLedgerOpen(true);
                          }}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <CardTitle className="text-base">
                                  {s.name}
                                </CardTitle>
                                <CardDescription className="space-y-1">
                                  <div>{s.email}</div>
                                  <div className="font-mono">
                                    code: {s.referralCode || "-"}
                                  </div>
                                </CardDescription>
                              </div>
                              <Badge
                                variant={s.active ? "default" : "secondary"}
                              >
                                {s.active ? "활성" : "비활성"}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3 text-sm">
                            {/* 잔액/정산 행 */}
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <div className="text-muted-foreground text-xs">
                                  기간 잔액
                                </div>
                                <div className="font-semibold">
                                  {Number(
                                    s.wallet?.balanceAmountPeriod || 0,
                                  ).toLocaleString()}
                                  원
                                </div>
                              </div>
                              <div>
                                <div className="text-muted-foreground text-xs">
                                  기간 적립
                                </div>
                                <div className="font-medium">
                                  {Number(
                                    s.wallet?.earnedAmountPeriod || 0,
                                  ).toLocaleString()}
                                  원
                                </div>
                              </div>
                              <div>
                                <div className="text-muted-foreground text-xs">
                                  기간 정산
                                </div>
                                <div className="font-medium">
                                  {Number(
                                    s.wallet?.paidOutAmountPeriod || 0,
                                  ).toLocaleString()}
                                  원
                                </div>
                              </div>
                            </div>
                            {/* 소개 조직/영업자 수 */}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="text-muted-foreground text-xs">
                                  소개 조직수
                                </div>
                                <div className="font-medium">
                                  {Number(
                                    s.performance30d?.referredOrgCount || 0,
                                  )}
                                  직접
                                  {" / "}
                                  {Number(
                                    s.performance30d?.level1OrgCount || 0,
                                  )}
                                  간접
                                </div>
                              </div>
                              <div>
                                <div className="text-muted-foreground text-xs">
                                  소개 영업자수
                                </div>
                                <div className="font-medium">
                                  {Number(s.referredSalesmanCount || 0)}
                                </div>
                              </div>
                            </div>
                            {/* 직접 수수료 블록 */}
                            <div className="rounded-md bg-muted/40 px-3 py-2 space-y-0.5">
                              <div className="text-xs font-semibold text-muted-foreground mb-1">
                                직접 수수료
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">
                                  직접 유료 매출{" "}
                                  {Number(
                                    s.performance30d?.directRevenueAmount || 0,
                                  ).toLocaleString()}
                                  원
                                  {Number(
                                    s.performance30d?.directBonusAmount || 0,
                                  ) > 0 && (
                                    <span className="text-muted-foreground/70">
                                      {" "}
                                      (무료{" "}
                                      {Number(
                                        s.performance30d?.directBonusAmount ||
                                          0,
                                      ).toLocaleString()}
                                      원)
                                    </span>
                                  )}
                                </span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">
                                  직접 소개 수수료
                                </span>
                                <span className="font-semibold text-blue-700">
                                  {Number(
                                    s.performance30d?.myCommissionAmount ?? 0,
                                  ).toLocaleString()}
                                  원
                                  <span className="text-muted-foreground font-normal ml-1">
                                    (매출 × 5%)
                                  </span>
                                </span>
                              </div>
                            </div>
                            {/* 간접 수수료 블록 */}
                            <div className="rounded-md bg-muted/40 px-3 py-2 space-y-0.5">
                              <div className="text-xs font-semibold text-muted-foreground mb-1">
                                간접 수수료
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">
                                  간접 유료 매출{" "}
                                  {Number(
                                    s.performance30d?.level1RevenueAmount || 0,
                                  ).toLocaleString()}
                                  원
                                  {Number(
                                    s.performance30d?.level1BonusAmount || 0,
                                  ) > 0 && (
                                    <span className="text-muted-foreground/70">
                                      {" "}
                                      (무료{" "}
                                      {Number(
                                        s.performance30d?.level1BonusAmount ||
                                          0,
                                      ).toLocaleString()}
                                      원)
                                    </span>
                                  )}
                                </span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">
                                  간접 소개 수수료
                                </span>
                                <span className="font-semibold text-blue-700">
                                  {Number(
                                    s.performance30d?.level1CommissionAmount ??
                                      0,
                                  ).toLocaleString()}
                                  원
                                  <span className="text-muted-foreground font-normal ml-1">
                                    (매출 × 2.5%)
                                  </span>
                                </span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                  <div ref={salesmanSentinelRef} className="h-10" />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={approveModalOpen} onOpenChange={setApproveModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>충전 주문 승인</DialogTitle>
            <DialogDescription>
              승인 시 조직 크레딧 적립이 유지됩니다. 승인자는 작성자가 될 수
              없습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="font-mono">
              코드: {selectedOrder?.depositCode || "-"}
            </div>
            <div>금액: {selectedOrder?.amountTotal.toLocaleString()}원</div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setApproveModalOpen(false)}
              disabled={processingApproval}
            >
              취소
            </Button>
            <Button
              onClick={async () => {
                if (!selectedOrder || !token) return;
                setProcessingApproval(true);
                try {
                  const res = await request<any>({
                    path: `/api/admin/credits/b-plan/charge-orders/${selectedOrder._id}/approve`,
                    method: "POST",
                    token,
                    jsonBody: { note: matchNote || "" },
                  });
                  if (!res.ok)
                    throw new Error((res.data as any)?.message || "승인 실패");
                  toast({
                    title: "승인 완료",
                    description: "충전 주문을 승인했습니다.",
                  });
                  setApproveModalOpen(false);
                  setSelectedOrder(null);
                  setOrderSkip(0);
                  setOrderHasMore(true);
                  loadChargeOrders(orderStatusFilter, { reset: true });
                } catch (error: any) {
                  toast({
                    title: "승인 실패",
                    description: error?.message || "승인에 실패했습니다.",
                    variant: "destructive",
                  });
                } finally {
                  setProcessingApproval(false);
                }
              }}
              disabled={!selectedOrder || processingApproval}
            >
              {processingApproval ? "처리 중..." : "승인"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreditLedgerModal
        open={orgLedgerOpen}
        onOpenChange={(open) => {
          setOrgLedgerOpen(open);
          if (!open) setOrgLedgerOrg(null);
        }}
        organizationId={orgLedgerOrg?._id}
        titleSuffix={orgLedgerOrg?.name}
      />

      <SalesmanLedgerModal
        open={salesmanLedgerOpen}
        onOpenChange={(open) => {
          setSalesmanLedgerOpen(open);
          if (!open) setSalesmanLedgerRow(null);
        }}
        salesmanId={salesmanLedgerRow?.salesmanId}
        titleSuffix={salesmanLedgerRow?.name}
      />

      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>충전 주문 거절</DialogTitle>
            <DialogDescription>거절 사유를 남겨주세요.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-sm font-mono">
              코드: {selectedOrder?.depositCode || "-"}
            </div>
            <div className="text-sm">
              금액: {selectedOrder?.amountTotal.toLocaleString()}원
            </div>
            <div className="space-y-2">
              <Label htmlFor="reject-note">거절 사유</Label>
              <Input
                id="reject-note"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="사유 입력"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectModalOpen(false)}
              disabled={processingApproval}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!selectedOrder || !token) return;
                if (!rejectNote.trim()) {
                  toast({
                    title: "거절 사유 필요",
                    description: "note를 입력해주세요.",
                    variant: "destructive",
                  });
                  return;
                }
                setProcessingApproval(true);
                try {
                  const res = await request<any>({
                    path: `/api/admin/credits/b-plan/charge-orders/${selectedOrder._id}/reject`,
                    method: "POST",
                    token,
                    jsonBody: { note: rejectNote },
                  });
                  if (!res.ok)
                    throw new Error((res.data as any)?.message || "거절 실패");
                  toast({
                    title: "거절 완료",
                    description: "충전 주문을 거절했습니다.",
                  });
                  setRejectModalOpen(false);
                  setSelectedOrder(null);
                  setRejectNote("");
                  setOrderSkip(0);
                  setOrderHasMore(true);
                  loadChargeOrders(orderStatusFilter, { reset: true });
                } catch (error: any) {
                  toast({
                    title: "거절 실패",
                    description: error?.message || "거절에 실패했습니다.",
                    variant: "destructive",
                  });
                } finally {
                  setProcessingApproval(false);
                }
              }}
              disabled={!selectedOrder || processingApproval}
            >
              {processingApproval ? "처리 중..." : "거절"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
