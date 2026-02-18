import { useState, useEffect, useMemo, useRef } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { usePeriodStore, periodToRangeQuery } from "@/store/usePeriodStore";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
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
};

type SalesmanCreditRow = {
  salesmanId: string;
  name: string;
  email: string;
  referralCode?: string;
  active: boolean;
  wallet: {
    earnedAmount: number;
    paidOutAmount: number;
    adjustedAmount: number;
    balanceAmount: number;
  };
  performance30d: {
    referredOrgCount: number;
    revenueAmount: number;
    orderCount: number;
    commissionAmount: number;
  };
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

  const [selectedOrg, setSelectedOrg] = useState<OrganizationCredit | null>(
    null,
  );

  const closeOrgModal = () => setSelectedOrg(null);

  const [salesmen, setSalesmen] = useState<SalesmanCreditRow[]>([]);
  const [loadingSalesmen, setLoadingSalesmen] = useState(false);
  const [salesmanSkip, setSalesmanSkip] = useState(0);
  const [salesmanHasMore, setSalesmanHasMore] = useState(true);

  const [creditTab, setCreditTab] = useState<"requestor" | "salesman">(
    "requestor",
  );

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

  const ORG_PAGE_SIZE = 10;
  const SALESMAN_PAGE_SIZE = 40;
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
      const res = await request<{
        success: boolean;
        data: {
          items: OrganizationCredit[];
          total?: number;
          skip?: number;
          limit?: number;
        };
      }>({
        path: `/api/admin/credits/organizations?limit=${ORG_PAGE_SIZE}&skip=${reset ? 0 : orgSkip}`,
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
    if (!token) return;
    setSalesmanSkip(0);
    setSalesmanHasMore(true);
    loadSalesmen({ reset: true });
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
    const totalSalesmen = (salesmen || []).length;
    const totalBalance = (salesmen || []).reduce(
      (acc, s) => acc + Number(s?.wallet?.balanceAmount || 0),
      0,
    );
    const totalEarned = (salesmen || []).reduce(
      (acc, s) => acc + Number(s?.wallet?.earnedAmount || 0),
      0,
    );
    const totalPaidOut = (salesmen || []).reduce(
      (acc, s) => acc + Number(s?.wallet?.paidOutAmount || 0),
      0,
    );
    const totalCommission30d = (salesmen || []).reduce(
      (acc, s) => acc + Number(s?.performance30d?.commissionAmount || 0),
      0,
    );
    return {
      totalSalesmen,
      totalBalance,
      totalEarned,
      totalPaidOut,
      totalCommission30d,
    };
  }, [salesmen]);

  return (
    <div className="space-y-6 p-6">
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
                <CardTitle className="text-sm font-medium">총 충전액</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loadingStats
                    ? "..."
                    : `${(stats?.totalCharged || 0).toLocaleString()}원`}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">총 잔액</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loadingOrgs
                    ? "..."
                    : `${requestorTotalBalance.toLocaleString()}원`}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">총 사용액</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loadingStats
                    ? "..."
                    : `${(stats?.totalSpent || 0).toLocaleString()}원`}
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
                  <CardTitle>조직별 크레딧 현황</CardTitle>
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
                          {organizations.map((org) => {
                            const chargedPaid = Number(
                              org.chargedPaidAmount || 0,
                            );
                            const chargedBonus = Number(
                              org.chargedBonusAmount || 0,
                            );
                            const spentPaid = Number(org.spentPaidAmount || 0);
                            const spentBonus = Number(
                              org.spentBonusAmount || 0,
                            );
                            const paidRemain = Number(org.paidBalance || 0);
                            const bonusRemain = Number(org.bonusBalance || 0);
                            return (
                              <Card
                                key={org._id}
                                className="border-muted cursor-pointer"
                                onClick={() => setSelectedOrg(org)}
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
                  {loadingSalesmen
                    ? "..."
                    : salesmanSummary.totalSalesmen.toLocaleString()}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">총 적립</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loadingSalesmen
                    ? "..."
                    : `${salesmanSummary.totalEarned.toLocaleString()}원`}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  수수료(기간)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loadingSalesmen
                    ? "..."
                    : `${salesmanSummary.totalCommission30d.toLocaleString()}원`}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">총 잔액</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loadingSalesmen
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
                  {loadingSalesmen
                    ? "..."
                    : `${salesmanSummary.totalPaidOut.toLocaleString()}원`}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>영업자 크레딧(성과/정산 전 잔액)</CardTitle>
              <CardDescription>
                최근 30일 직접 소개 조직 기준 매출/수수료 + 영업자 지갑 잔액
              </CardDescription>
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
                  <div className="grid gap-4 md:grid-cols-2">
                    {salesmen.map((s) => (
                      <Card key={s.salesmanId} className="border-muted">
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
                            <Badge variant={s.active ? "default" : "secondary"}>
                              {s.active ? "활성" : "비활성"}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <div className="text-muted-foreground">잔액</div>
                            <div className="font-semibold">
                              {Number(
                                s.wallet?.balanceAmount || 0,
                              ).toLocaleString()}
                              원
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">
                              누적 적립
                            </div>
                            <div className="font-medium">
                              {Number(
                                s.wallet?.earnedAmount || 0,
                              ).toLocaleString()}
                              원
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">
                              누적 정산
                            </div>
                            <div className="font-medium">
                              {Number(
                                s.wallet?.paidOutAmount || 0,
                              ).toLocaleString()}
                              원
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">
                              소개 조직수(30일)
                            </div>
                            <div className="font-medium">
                              {Number(
                                s.performance30d?.referredOrgCount || 0,
                              ).toLocaleString()}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">
                              매출(30일)
                            </div>
                            <div className="font-medium">
                              {Number(
                                s.performance30d?.revenueAmount || 0,
                              ).toLocaleString()}
                              원
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">
                              수수료(30일)
                            </div>
                            <div className="font-medium">
                              {Number(
                                s.performance30d?.commissionAmount || 0,
                              ).toLocaleString()}
                              원
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

      <Dialog open={Boolean(selectedOrg)} onOpenChange={closeOrgModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedOrg?.name || "조직 상세"}</DialogTitle>
            <DialogDescription>
              {selectedOrg?.ownerName || "-"} · {selectedOrg?.ownerEmail || "-"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">사업자명</span> ·{" "}
              {selectedOrg?.companyName || "-"}
            </div>
            <div>
              <span className="text-muted-foreground">사업자번호</span> ·{" "}
              <span className="font-mono">
                {selectedOrg?.businessNumber || "-"}
              </span>
            </div>
            <div className="pt-2 grid grid-cols-2 gap-2">
              <div>
                <div className="text-muted-foreground">잔여(구매)</div>
                <div className="font-semibold">
                  {Number(selectedOrg?.paidBalance || 0).toLocaleString()}원
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">잔여(무료)</div>
                <div className="font-semibold">
                  {Number(selectedOrg?.bonusBalance || 0).toLocaleString()}원
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">사용(구매)</div>
                <div className="font-medium">
                  {Number(selectedOrg?.spentPaidAmount || 0).toLocaleString()}원
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">사용(무료)</div>
                <div className="font-medium">
                  {Number(selectedOrg?.spentBonusAmount || 0).toLocaleString()}
                  원
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeOrgModal}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
