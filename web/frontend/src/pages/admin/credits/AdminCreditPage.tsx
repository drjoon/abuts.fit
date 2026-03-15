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

const normalizeDigits = (value: string) =>
  String(value || "").replace(/\D/g, "");

const formatBusinessSelectLabel = (business: BusinessCredit) => {
  const businessNumber =
    String(business.businessNumber || "").trim() || "사업자번호 없음";
  const businessAnchorId = String(business.businessAnchorId || "").trim();
  if (!businessAnchorId) return `${business.name} (${businessNumber})`;
  return `${business.name} (${businessNumber} / anchor ${businessAnchorId})`;
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

type BusinessCredit = {
  _id: string;
  businessAnchorId?: string | null;
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
  businessAnchorId?: string;
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

type FreeCreditAmount = 30000 | 50000;

type BonusGrantHistoryRow = {
  _id: string;
  businessNumber: string;
  amount: number;
  source?: string;
  overrideReason?: string;
  isOverride?: boolean;
  createdAt?: string;
  canceledAt?: string | null;
  cancelReason?: string;
  hasSpent?: boolean;
};

export default function AdminCreditPage() {
  const { token } = useAuthStore();
  const { period, setPeriod } = usePeriodStore();
  const { toast } = useToast();

  const [stats, setStats] = useState<CreditStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const [businesses, setBusinesses] = useState<BusinessCredit[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const loadingOrgsRef = useRef(false);
  const [orgSkip, setOrgSkip] = useState(0);
  const [orgHasMore, setOrgHasMore] = useState(true);

  const [orgLedgerOpen, setOrgLedgerOpen] = useState(false);
  const [orgLedgerBusiness, setOrgLedgerBusiness] =
    useState<BusinessCredit | null>(null);

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
  const [selectedBonusBusinessAnchorId, setSelectedBonusBusinessAnchorId] =
    useState("");
  const [selectedBonusAmount, setSelectedBonusAmount] =
    useState<FreeCreditAmount>(30000);
  const [bonusReason, setBonusReason] = useState("");
  const [grantingBonus, setGrantingBonus] = useState(false);
  const [grantCreditType, setGrantCreditType] = useState<
    "general" | "shipping"
  >("general");
  const [bonusGrantRows, setBonusGrantRows] = useState<BonusGrantHistoryRow[]>(
    [],
  );
  const [loadingBonusGrantRows, setLoadingBonusGrantRows] = useState(false);
  const [bonusGrantSearch, setBonusGrantSearch] = useState("");
  const [freeCreditMenu, setFreeCreditMenu] = useState<
    | "grant"
    | "grant-cancel"
    | "grant-history"
    | "usage-history"
    | "shipping-credit"
  >("grant");
  const [
    selectedShippingCreditBusinessAnchorId,
    setSelectedShippingCreditBusinessAnchorId,
  ] = useState("");
  const [selectedShippingCreditAmount, setSelectedShippingCreditAmount] =
    useState(3500);
  const [shippingCreditReason, setShippingCreditReason] = useState("");
  const [grantingShippingCredit, setGrantingShippingCredit] = useState(false);
  const [selectedCancelGrantId, setSelectedCancelGrantId] = useState("");
  const [cancelGrantReason, setCancelGrantReason] = useState("");
  const [cancelingGrant, setCancelingGrant] = useState(false);
  const [cancelStartDate, setCancelStartDate] = useState("");
  const [cancelEndDate, setCancelEndDate] = useState("");
  const [cancelSkip, setCancelSkip] = useState(0);
  const [cancelHasMore, setCancelHasMore] = useState(true);
  const cancelTableRef = useRef<HTMLDivElement | null>(null);

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
        title: "소개자 크레딧 조회 실패",
        description: "소개자 크레딧을 불러오는데 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoadingSalesmen(false);
    }
  };

  const loadOrganizations = async ({ reset = false } = {}) => {
    if (!token) return;
    if (loadingOrgsRef.current) return;
    loadingOrgsRef.current = true;
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
          items: BusinessCredit[];
          total?: number;
          skip?: number;
          limit?: number;
        };
      }>({
        path: `/api/admin/credits/businesses?${qs.toString()}`,
        method: "GET",
        token,
      });
      if (!res.ok || !res.data?.success) {
        setOrgHasMore(false);
        const message =
          String((res.data as any)?.message || "").trim() ||
          "사업자별 크레딧을 불러오는데 실패했습니다.";
        throw new Error(message);
      }
      if (res.ok && res.data?.data?.items) {
        const items = Array.isArray(res.data.data.items)
          ? res.data.data.items
          : [];
        setBusinesses((prev) => (reset ? items : [...prev, ...items]));
        const nextSkip = (reset ? 0 : orgSkip) + items.length;
        setOrgSkip(nextSkip);
        setOrgHasMore(items.length >= ORG_PAGE_SIZE);
      }
    } catch (error: any) {
      toast({
        title: "사업자 조회 실패",
        description:
          error?.message || "사업자별 크레딧을 불러오는데 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      loadingOrgsRef.current = false;
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

  const handleGrantFreeCredit = async () => {
    if (!token) return;

    const businessAnchorId = String(selectedBonusBusinessAnchorId || "").trim();
    const reason = String(bonusReason || "").trim();

    if (!businessAnchorId) {
      toast({
        title: "지급 대상 선택 필요",
        description: "무료 크레딧을 지급할 사업자를 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!reason) {
      toast({
        title: "지급 이유 입력 필요",
        description: "무료 크레딧 지급 이유를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    const targetBusiness = businesses.find(
      (business) => String(business._id) === businessAnchorId,
    );
    const businessNumber = String(targetBusiness?.businessNumber || "").trim();
    if (!businessNumber) {
      toast({
        title: "사업자등록번호 없음",
        description: "선택한 사업자의 사업자등록번호를 확인할 수 없습니다.",
        variant: "destructive",
      });
      return;
    }

    setGrantingBonus(true);
    try {
      const res = await request<any>({
        path: "/api/admin/bonus-grants/welcome-bonus/override",
        method: "POST",
        token,
        jsonBody: {
          businessAnchorId,
          businessNumber,
          amount: selectedBonusAmount,
          reason,
        },
      });

      if (!res.ok) {
        const message =
          String((res.data as any)?.message || "").trim() ||
          "무료 크레딧 지급에 실패했습니다.";
        throw new Error(message);
      }

      toast({
        title: "무료 크레딧 지급 완료",
        description: `${selectedBonusAmount.toLocaleString()}원이 지급되었습니다.`,
      });

      setBonusReason("");
      setSelectedBonusAmount(30000);

      setOrgSkip(0);
      setOrgHasMore(true);
      await Promise.all([
        loadStats(),
        loadOrganizations({ reset: true }),
        loadBonusGrantHistory(),
      ]);
    } catch (error: any) {
      toast({
        title: "무료 크레딧 지급 실패",
        description: error?.message || "다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setGrantingBonus(false);
    }
  };

  const handleGrantShippingCredit = async () => {
    if (!token) return;

    const businessAnchorId = String(
      selectedShippingCreditBusinessAnchorId || "",
    ).trim();
    const reason = String(shippingCreditReason || "").trim();

    if (!businessAnchorId) {
      toast({
        title: "지급 대상 선택 필요",
        description: "배송비 무료 크레딧을 지급할 사업자를 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!reason) {
      toast({
        title: "지급 이유 입력 필요",
        description: "배송비 무료 크레딧 지급 이유를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    const targetBusiness = businesses.find(
      (business) => String(business._id) === businessAnchorId,
    );
    const businessNumber = String(targetBusiness?.businessNumber || "").trim();
    if (!businessNumber) {
      toast({
        title: "사업자등록번호 없음",
        description: "선택한 사업자의 사업자등록번호를 확인할 수 없습니다.",
        variant: "destructive",
      });
      return;
    }

    setGrantingShippingCredit(true);
    try {
      const res = await request<any>({
        path: "/api/admin/bonus-grants/free-shipping-credit/grant",
        method: "POST",
        token,
        jsonBody: {
          businessAnchorId,
          businessNumber,
          amount: selectedShippingCreditAmount,
          reason,
        },
      });

      if (!res.ok) {
        const message =
          String((res.data as any)?.message || "").trim() ||
          "배송비 무료 크레딧 지급에 실패했습니다.";
        throw new Error(message);
      }

      toast({
        title: "배송비 무료 크레딧 지급 완료",
        description: `${selectedShippingCreditAmount.toLocaleString()}원이 지급되었습니다.`,
      });

      setShippingCreditReason("");
      setSelectedShippingCreditAmount(3500);
      setSelectedShippingCreditBusinessAnchorId("");

      setOrgSkip(0);
      setOrgHasMore(true);
      await Promise.all([loadStats(), loadOrganizations({ reset: true })]);
    } catch (error: any) {
      toast({
        title: "배송비 무료 크레딧 지급 실패",
        description: error?.message || "다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setGrantingShippingCredit(false);
    }
  };

  const loadBonusGrantHistory = async () => {
    if (!token) return;

    setLoadingBonusGrantRows(true);
    try {
      const res = await request<{
        success: boolean;
        data?: { rows: BonusGrantHistoryRow[] };
        message?: string;
      }>({
        path: "/api/admin/bonus-grants?type=WELCOME_BONUS",
        method: "GET",
        token,
      });

      if (!res.ok || !res.data?.success) {
        throw new Error(
          String(res.data?.message || "").trim() ||
            "무료 크레딧 지급 내역을 불러오는데 실패했습니다.",
        );
      }

      setBonusGrantRows(
        Array.isArray(res.data?.data?.rows) ? res.data.data.rows : [],
      );
    } catch (error: any) {
      setBonusGrantRows([]);
      toast({
        title: "무료 크레딧 지급 내역 조회 실패",
        description: error?.message || "다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setLoadingBonusGrantRows(false);
    }
  };

  const handleCancelFreeCredit = async () => {
    if (!token) return;

    const grantId = String(selectedCancelGrantId || "").trim();
    const reason = String(cancelGrantReason || "").trim();

    if (!grantId) {
      toast({
        title: "취소 대상 선택 필요",
        description: "취소할 지급 내역을 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!reason) {
      toast({
        title: "취소 사유 입력 필요",
        description: "무료 크레딧 지급 취소 사유를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    const selectedGrant = bonusGrantRows.find((r) => String(r._id) === grantId);
    if (selectedGrant?.hasSpent) {
      toast({
        title: "주의: 사용된 크레딧 취소",
        description:
          "이 지급건의 크레딧이 일부 사용되었습니다. 취소 시 잔액이 마이너스가 될 수 있습니다.",
        variant: "default",
      });
    }

    setCancelingGrant(true);
    try {
      const res = await request<any>({
        path: `/api/admin/bonus-grants/${grantId}/cancel`,
        method: "POST",
        token,
        jsonBody: { reason },
      });

      if (!res.ok) {
        throw new Error(
          String((res.data as any)?.message || "").trim() ||
            "무료 크레딧 지급 취소에 실패했습니다.",
        );
      }

      toast({
        title: "지급 취소 완료",
        description: "무료 크레딧 지급이 취소되었습니다.",
      });

      setSelectedCancelGrantId("");
      setCancelGrantReason("");
      setCancelSkip(0);

      await Promise.all([
        loadStats(),
        loadOrganizations({ reset: true }),
        loadBonusGrantHistory(),
      ]);
    } catch (error: any) {
      toast({
        title: "지급 취소 실패",
        description: error?.message || "다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setCancelingGrant(false);
    }
  };

  const loadMoreCancelGrants = async () => {
    if (!token || !cancelHasMore || loadingBonusGrantRows) return;

    setLoadingBonusGrantRows(true);
    try {
      const params = new URLSearchParams({
        type: "WELCOME_BONUS",
        skip: String(cancelSkip + 20),
        limit: "20",
      });

      if (cancelStartDate) {
        params.append("startDate", cancelStartDate);
      }
      if (cancelEndDate) {
        params.append("endDate", cancelEndDate);
      }

      const res = await request<any>({
        path: `/api/admin/bonus-grants?${params.toString()}`,
        method: "GET",
        token,
      });

      if (!res.ok || !res.data?.success) {
        throw new Error("더 이상 조회할 지급 내역이 없습니다.");
      }

      const newRows = Array.isArray(res.data?.data?.rows)
        ? res.data.data.rows
        : [];
      setBonusGrantRows((prev) => [...prev, ...newRows]);
      setCancelSkip((prev) => prev + 20);
      setCancelHasMore(res.data?.data?.hasMore ?? false);
    } catch (error: any) {
      toast({
        title: "더 이상 조회할 내역이 없습니다",
        description: error?.message || "다시 시도해주세요.",
        variant: "default",
      });
    } finally {
      setLoadingBonusGrantRows(false);
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
    loadBonusGrantHistory();
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
    if (!orgHasMore || loadingOrgsRef.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit) return;
        if (loadingOrgsRef.current || !orgHasMore) return;
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
    return (businesses || []).reduce(
      (acc, business) => acc + Number(business?.balance || 0),
      0,
    );
  }, [businesses]);

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

  const selectedBonusBusiness = useMemo(
    () =>
      businesses.find(
        (business) => String(business._id) === selectedBonusBusinessAnchorId,
      ) || null,
    [businesses, selectedBonusBusinessAnchorId],
  );

  const selectedShippingCreditBusiness = useMemo(
    () =>
      businesses.find(
        (business) =>
          String(business._id) === selectedShippingCreditBusinessAnchorId,
      ) || null,
    [businesses, selectedShippingCreditBusinessAnchorId],
  );

  const filteredBonusGrantRows = useMemo(() => {
    const selectedBusinessNumberDigits = normalizeDigits(
      String(selectedBonusBusiness?.businessNumber || ""),
    );
    const search = String(bonusGrantSearch || "")
      .trim()
      .toLowerCase();

    return bonusGrantRows.filter((row) => {
      if (selectedBonusBusinessAnchorId) {
        if (!selectedBusinessNumberDigits) return false;
        const rowBusinessNumberDigits = normalizeDigits(
          String(row.businessNumber || ""),
        );
        if (rowBusinessNumberDigits !== selectedBusinessNumberDigits) {
          return false;
        }
      }

      if (!search) return true;

      const sourceLabel = row.source === "admin" ? "관리자 지급" : "자동 지급";
      const haystack = [
        String(row.businessNumber || ""),
        normalizeDigits(String(row.businessNumber || "")),
        String(row.overrideReason || ""),
        sourceLabel,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  }, [
    bonusGrantRows,
    selectedBonusBusinessAnchorId,
    selectedBonusBusiness,
    bonusGrantSearch,
  ]);

  const filteredFreeCreditUsageRows = useMemo(() => {
    const search = String(bonusGrantSearch || "")
      .trim()
      .toLowerCase();
    return businesses
      .filter((business) => {
        if (
          selectedBonusBusinessAnchorId &&
          String(business._id) !== selectedBonusBusinessAnchorId
        ) {
          return false;
        }
        if (!search) return true;
        const haystack = [
          String(business.name || ""),
          String(business.companyName || ""),
          String(business.businessNumber || ""),
          normalizeDigits(String(business.businessNumber || "")),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(search);
      })
      .filter((business) => Number(business.spentBonusAmount || 0) > 0)
      .sort(
        (a, b) =>
          Number(b.spentBonusAmount || 0) - Number(a.spentBonusAmount || 0),
      );
  }, [businesses, selectedBonusBusinessAnchorId, bonusGrantSearch]);

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
    if (!token || !orgLedgerBusiness?._id) return;
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
        path: `/api/admin/credits/businesses/${orgLedgerBusiness._id}/ledger?${params.toString()}`,
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
              소개자
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
                  총 사업자 수
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
              <TabsTrigger value="organizations">사업자별 크레딧</TabsTrigger>
              <TabsTrigger value="free-credit">무료 크레딧</TabsTrigger>
              <TabsTrigger value="verification">자동 매칭 검증</TabsTrigger>
              <TabsTrigger value="orders">충전 주문</TabsTrigger>
              <TabsTrigger value="transactions">입금 내역</TabsTrigger>
            </TabsList>

            <TabsContent value="organizations" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>사업자별 크레딧 현황</CardTitle>
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
                      {businesses.length === 0 && !loadingOrgs ? (
                        <div className="text-center py-8 text-muted-foreground">
                          사업자가 없습니다.
                        </div>
                      ) : (
                        <div className="grid gap-4 md:grid-cols-3">
                          {[...businesses]
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
                            .map((business) => {
                              const chargedPaid = Number(
                                business.chargedPaidAmount || 0,
                              );
                              const chargedBonus = Number(
                                business.chargedBonusAmount || 0,
                              );
                              const spentPaid = Number(
                                business.spentPaidAmount || 0,
                              );
                              const spentBonus = Number(
                                business.spentBonusAmount || 0,
                              );
                              const paidRemain = Number(
                                business.paidBalance || 0,
                              );
                              const bonusRemain = Number(
                                business.bonusBalance || 0,
                              );
                              return (
                                <Card
                                  key={business._id}
                                  className="border-muted cursor-pointer"
                                  onClick={() => {
                                    setOrgLedgerBusiness(business);
                                    setOrgLedgerOpen(true);
                                  }}
                                >
                                  <CardHeader className="pb-3">
                                    <CardTitle className="text-base">
                                      {business.name}
                                    </CardTitle>
                                    <CardDescription className="space-y-1">
                                      <div>{business.companyName || "-"}</div>
                                      <div className="font-mono text-xs">
                                        {business.businessNumber || "-"}
                                      </div>
                                      <div className="font-mono text-[11px] text-muted-foreground">
                                        anchor:{" "}
                                        {business.businessAnchorId || "-"}
                                      </div>
                                      <div className="text-xs">
                                        {business.ownerName || "-"} ·{" "}
                                        {business.ownerEmail || "-"}
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
                      {loadingOrgs && businesses.length > 0 && (
                        <div className="text-center py-4 text-muted-foreground text-sm">
                          불러오는 중...
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="free-credit" className="space-y-4">
              <Card>
                <CardHeader className="space-y-4">
                  <div className="space-y-4">
                    <div className="flex flex-col gap-2">
                      <CardTitle>무료 크레딧</CardTitle>
                      <CardDescription>
                        대상 사업자를 선택하고 지급, 지급 내역, 사용 내역을
                        메뉴별로 확인합니다.
                      </CardDescription>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
                      <div className="space-y-2">
                        <Label
                          htmlFor="free-credit-business"
                          className="text-sm"
                        >
                          대상 사업자
                        </Label>
                        <div className="relative">
                          <select
                            id="free-credit-business"
                            className="h-11 w-full appearance-none rounded-lg border border-input bg-background px-3 pr-10 text-sm"
                            value={selectedBonusBusinessAnchorId}
                            onChange={(e) =>
                              setSelectedBonusBusinessAnchorId(e.target.value)
                            }
                          >
                            <option value="">전체 사업자</option>
                            {[...businesses]
                              .sort((a, b) =>
                                String(a.name || "").localeCompare(
                                  String(b.name || ""),
                                  "ko",
                                ),
                              )
                              .map((business) => (
                                <option key={business._id} value={business._id}>
                                  {formatBusinessSelectLabel(business)}
                                </option>
                              ))}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
                            <span className="text-xs">▼</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="free-credit-search" className="text-sm">
                          검색
                        </Label>
                        <Input
                          id="free-credit-search"
                          className="h-11"
                          value={bonusGrantSearch}
                          onChange={(e) => setBonusGrantSearch(e.target.value)}
                          placeholder="사업자번호, 사유, 구분"
                        />
                      </div>

                      <div className="flex items-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-11 px-4"
                          onClick={loadBonusGrantHistory}
                          disabled={loadingBonusGrantRows}
                        >
                          {loadingBonusGrantRows
                            ? "새로고침 중..."
                            : "새로고침"}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t pt-4">
                    <Button
                      type="button"
                      variant={
                        freeCreditMenu === "grant" ? "default" : "outline"
                      }
                      onClick={() => setFreeCreditMenu("grant")}
                      size="sm"
                    >
                      지급
                    </Button>
                    <Button
                      type="button"
                      variant={
                        freeCreditMenu === "grant-cancel"
                          ? "default"
                          : "outline"
                      }
                      onClick={() => setFreeCreditMenu("grant-cancel")}
                      size="sm"
                    >
                      지급 취소
                    </Button>
                    <Button
                      type="button"
                      variant={
                        freeCreditMenu === "grant-history"
                          ? "default"
                          : "outline"
                      }
                      onClick={() => setFreeCreditMenu("grant-history")}
                      size="sm"
                    >
                      지급 내역
                    </Button>
                    <Button
                      type="button"
                      variant={
                        freeCreditMenu === "usage-history"
                          ? "default"
                          : "outline"
                      }
                      onClick={() => setFreeCreditMenu("usage-history")}
                      size="sm"
                    >
                      사용 내역
                    </Button>
                  </div>
                </CardHeader>

                <CardContent>
                  {freeCreditMenu === "grant" ? (
                    <div className="space-y-4">
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="grant-business" className="text-sm">
                            대상 사업자
                          </Label>
                          <div className="relative">
                            <select
                              id="grant-business"
                              className="h-11 w-full appearance-none rounded-lg border border-input bg-background px-3 pr-10 text-sm"
                              value={
                                grantCreditType === "general"
                                  ? selectedBonusBusinessAnchorId
                                  : selectedShippingCreditBusinessAnchorId
                              }
                              onChange={(e) => {
                                if (grantCreditType === "general") {
                                  setSelectedBonusBusinessAnchorId(
                                    e.target.value,
                                  );
                                } else {
                                  setSelectedShippingCreditBusinessAnchorId(
                                    e.target.value,
                                  );
                                }
                              }}
                            >
                              <option value="">사업자 선택</option>
                              {[...businesses]
                                .sort((a, b) =>
                                  String(a.name || "").localeCompare(
                                    String(b.name || ""),
                                    "ko",
                                  ),
                                )
                                .map((business) => (
                                  <option
                                    key={business._id}
                                    value={business._id}
                                  >
                                    {formatBusinessSelectLabel(business)}
                                  </option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
                              <span className="text-xs">▼</span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>크레딧 종류</Label>
                          <div className="grid grid-cols-2 gap-3">
                            <Button
                              type="button"
                              className="h-11"
                              variant={
                                grantCreditType === "general"
                                  ? "default"
                                  : "outline"
                              }
                              onClick={() => {
                                setGrantCreditType("general");
                                setBonusReason("");
                                setSelectedBonusAmount(30000);
                              }}
                            >
                              일반 무료 크레딧
                            </Button>
                            <Button
                              type="button"
                              className="h-11"
                              variant={
                                grantCreditType === "shipping"
                                  ? "default"
                                  : "outline"
                              }
                              onClick={() => {
                                setGrantCreditType("shipping");
                                setShippingCreditReason("");
                                setSelectedShippingCreditAmount(3500);
                              }}
                            >
                              배송비 무료 크레딧
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-[minmax(460px,1.15fr)_minmax(360px,0.85fr)]">
                        <div className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary/5 p-5 shadow-sm">
                          <div className="space-y-2">
                            <Label>
                              {grantCreditType === "general"
                                ? "일반 무료 크레딧 금액"
                                : "배송비 무료 크레딧 금액"}
                            </Label>
                            <div className="grid grid-cols-5 gap-2">
                              {(grantCreditType === "general"
                                ? [30000, 50000]
                                : [3500, 7000, 10500, 14000, 17500]
                              ).map((amount) => (
                                <Button
                                  key={amount}
                                  type="button"
                                  className="h-12 w-full"
                                  variant={
                                    grantCreditType === "general"
                                      ? selectedBonusAmount === amount
                                        ? "default"
                                        : "outline"
                                      : selectedShippingCreditAmount === amount
                                        ? "default"
                                        : "outline"
                                  }
                                  onClick={() => {
                                    if (grantCreditType === "general") {
                                      setSelectedBonusAmount(
                                        amount as FreeCreditAmount,
                                      );
                                    } else {
                                      setSelectedShippingCreditAmount(amount);
                                    }
                                  }}
                                >
                                  {amount.toLocaleString()}원
                                </Button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="free-credit-reason">
                              {grantCreditType === "general"
                                ? "충전 이유"
                                : "지급 이유"}
                            </Label>
                            <Input
                              id="free-credit-reason"
                              className="h-12 bg-background"
                              value={
                                grantCreditType === "general"
                                  ? bonusReason
                                  : shippingCreditReason
                              }
                              onChange={(e) => {
                                if (grantCreditType === "general") {
                                  setBonusReason(e.target.value);
                                } else {
                                  setShippingCreditReason(e.target.value);
                                }
                              }}
                              placeholder={
                                grantCreditType === "general"
                                  ? "예: CS 보상, 수동 보정, 운영 정책 지급"
                                  : "예: 배송비 예외 처리, 운영 정책"
                              }
                            />
                            <div className="rounded-lg bg-background/70 p-3 text-xs text-muted-foreground ring-1 ring-primary/10">
                              {grantCreditType === "general"
                                ? "지급 사유는 최소 1자 이상 입력해야 하며, 내부 운영 로그에 기록됩니다."
                                : "배송비 무료 크레딧은 배송비 결제 시에만 사용되며, 의뢰 비용으로는 사용할 수 없습니다."}
                            </div>
                          </div>

                          <Button
                            className="h-12 justify-center"
                            onClick={
                              grantCreditType === "general"
                                ? handleGrantFreeCredit
                                : handleGrantShippingCredit
                            }
                            disabled={
                              grantCreditType === "general"
                                ? grantingBonus ||
                                  !selectedBonusBusinessAnchorId
                                : grantingShippingCredit ||
                                  !selectedShippingCreditBusinessAnchorId
                            }
                          >
                            {grantCreditType === "general"
                              ? grantingBonus
                                ? "지급 중..."
                                : "무료 크레딧 지급"
                              : grantingShippingCredit
                                ? "지급 중..."
                                : "배송비 무료 크레딧 지급"}
                          </Button>
                        </div>

                        <div className="flex flex-col gap-4">
                          <div className="rounded-xl border border-border/60 bg-muted/20 p-5">
                            <div className="text-sm font-medium">지급 요약</div>
                            <div className="mt-3 space-y-2 text-sm">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">
                                  선택 사업자
                                </span>
                                <span className="text-right font-medium">
                                  {grantCreditType === "general"
                                    ? selectedBonusBusiness?.name || "미선택"
                                    : selectedShippingCreditBusiness?.name ||
                                      "미선택"}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">
                                  사업자번호
                                </span>
                                <span className="font-mono">
                                  {grantCreditType === "general"
                                    ? selectedBonusBusiness?.businessNumber ||
                                      "-"
                                    : selectedShippingCreditBusiness?.businessNumber ||
                                      "-"}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">
                                  사업자 ID
                                </span>
                                <span className="font-mono text-xs">
                                  {grantCreditType === "general"
                                    ? selectedBonusBusiness?.businessAnchorId ||
                                      "-"
                                    : selectedShippingCreditBusiness?.businessAnchorId ||
                                      "-"}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">
                                  지급 금액
                                </span>
                                <span
                                  className={`font-semibold ${
                                    grantCreditType === "general"
                                      ? "text-primary"
                                      : "text-amber-600"
                                  }`}
                                >
                                  {grantCreditType === "general"
                                    ? selectedBonusAmount.toLocaleString()
                                    : selectedShippingCreditAmount.toLocaleString()}
                                  원
                                </span>
                              </div>
                            </div>
                          </div>

                          <div
                            className={`rounded-xl border p-5 ${
                              grantCreditType === "general"
                                ? "border-primary/20 bg-primary/5"
                                : "border-amber-200/30 bg-amber-50/50"
                            }`}
                          >
                            <div className="text-sm font-medium">지급 안내</div>
                            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                              {grantCreditType === "general" ? (
                                <>
                                  <div>
                                    선택한 사업자에 즉시 무료 크레딧이
                                    반영됩니다.
                                  </div>
                                  <div>
                                    지급 사유는 운영 로그와 지급 내역에 함께
                                    기록됩니다.
                                  </div>
                                  <div>
                                    내역 메뉴에서 지급 기록과 사용 기록을 바로
                                    확인할 수 있습니다.
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div>
                                    배송비 무료 크레딧은 배송비 결제 시에만
                                    사용됩니다.
                                  </div>
                                  <div>
                                    의뢰 비용이나 다른 수수료로는 사용할 수
                                    없습니다.
                                  </div>
                                  <div>지급 사유는 운영 로그에 기록됩니다.</div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : freeCreditMenu === "grant-cancel" ? (
                    <div className="grid gap-4 xl:grid-cols-[minmax(460px,1.15fr)_minmax(360px,0.85fr)]">
                      <div className="rounded-xl border border-border/60 bg-muted/20 p-5">
                        <div className="text-sm font-medium">
                          취소 가능 지급 내역
                        </div>

                        <div className="mt-4 space-y-3">
                          <div className="grid gap-2 grid-cols-2">
                            <div className="space-y-1">
                              <Label
                                htmlFor="cancel-start-date"
                                className="text-xs"
                              >
                                시작일
                              </Label>
                              <Input
                                id="cancel-start-date"
                                type="date"
                                className="h-10 text-sm"
                                value={cancelStartDate}
                                onChange={(e) => {
                                  setCancelStartDate(e.target.value);
                                  setCancelSkip(0);
                                  setBonusGrantRows([]);
                                  setCancelHasMore(true);
                                }}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label
                                htmlFor="cancel-end-date"
                                className="text-xs"
                              >
                                종료일
                              </Label>
                              <Input
                                id="cancel-end-date"
                                type="date"
                                className="h-10 text-sm"
                                value={cancelEndDate}
                                onChange={(e) => {
                                  setCancelEndDate(e.target.value);
                                  setCancelSkip(0);
                                  setBonusGrantRows([]);
                                  setCancelHasMore(true);
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        <div
                          className="mt-4 overflow-x-auto max-h-[400px] overflow-y-auto"
                          ref={cancelTableRef}
                        >
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[80px]">선택</TableHead>
                                <TableHead>지급일시</TableHead>
                                <TableHead>사업자번호</TableHead>
                                <TableHead className="text-right">
                                  금액
                                </TableHead>
                                <TableHead className="w-[60px]">상태</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredBonusGrantRows
                                .filter((row) => !row.canceledAt)
                                .map((row) => (
                                  <TableRow
                                    key={row._id}
                                    className={`cursor-pointer ${
                                      selectedCancelGrantId === String(row._id)
                                        ? "bg-primary/10"
                                        : ""
                                    }`}
                                    onClick={() =>
                                      setSelectedCancelGrantId(String(row._id))
                                    }
                                  >
                                    <TableCell>
                                      <input
                                        type="radio"
                                        name="cancel-grant"
                                        checked={
                                          selectedCancelGrantId ===
                                          String(row._id)
                                        }
                                        onChange={() =>
                                          setSelectedCancelGrantId(
                                            String(row._id),
                                          )
                                        }
                                      />
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      {formatDate(row.createdAt)}
                                    </TableCell>
                                    <TableCell className="font-mono text-sm">
                                      {row.businessNumber || "-"}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                      {Number(row.amount || 0).toLocaleString()}
                                      원
                                    </TableCell>
                                    <TableCell className="text-xs">
                                      {row.hasSpent ? (
                                        <span className="text-amber-600 font-medium">
                                          사용됨
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground">
                                          미사용
                                        </span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                        </div>

                        {cancelHasMore && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-4 w-full h-10"
                            onClick={loadMoreCancelGrants}
                            disabled={loadingBonusGrantRows}
                          >
                            {loadingBonusGrantRows
                              ? "더 불러오는 중..."
                              : "더 이전 내역 보기"}
                          </Button>
                        )}
                      </div>

                      <div className="flex flex-col gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="cancel-reason" className="text-sm">
                            취소 사유
                          </Label>
                          <Input
                            id="cancel-reason"
                            className="h-11"
                            value={cancelGrantReason}
                            onChange={(e) =>
                              setCancelGrantReason(e.target.value)
                            }
                            placeholder="예: 중복 지급, 사용자 요청, 오류 수정"
                          />
                        </div>

                        <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                          <div className="text-xs font-medium">선택 정보</div>
                          <div className="mt-3 space-y-2 text-xs">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">
                                선택 건
                              </span>
                              <span className="font-mono">
                                {selectedCancelGrantId ? "1건" : "미선택"}
                              </span>
                            </div>
                            {selectedCancelGrantId && (
                              <>
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-muted-foreground">
                                    취소 금액
                                  </span>
                                  <span className="font-semibold text-primary">
                                    {Number(
                                      bonusGrantRows.find(
                                        (r) =>
                                          String(r._id) ===
                                          selectedCancelGrantId,
                                      )?.amount || 0,
                                    ).toLocaleString()}
                                    원
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        <Button
                          className="h-11 justify-center"
                          onClick={handleCancelFreeCredit}
                          disabled={
                            cancelingGrant ||
                            !selectedCancelGrantId ||
                            !cancelGrantReason.trim()
                          }
                        >
                          {cancelingGrant ? "취소 중..." : "지급 취소"}
                        </Button>
                      </div>
                    </div>
                  ) : freeCreditMenu === "grant-history" ? (
                    loadingBonusGrantRows ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">
                        불러오는 중...
                      </div>
                    ) : filteredBonusGrantRows.length === 0 ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">
                        무료 크레딧 지급 내역이 없습니다.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>지급일시</TableHead>
                              <TableHead>사업자번호</TableHead>
                              <TableHead className="text-right">금액</TableHead>
                              <TableHead className="w-[140px] whitespace-nowrap">
                                구분
                              </TableHead>
                              <TableHead className="w-[320px] whitespace-nowrap">
                                사유
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredBonusGrantRows.map((row) => (
                              <TableRow key={row._id}>
                                <TableCell>
                                  {formatDate(row.createdAt)}
                                </TableCell>
                                <TableCell className="font-mono">
                                  {row.businessNumber || "-"}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {Number(row.amount || 0).toLocaleString()}원
                                </TableCell>
                                <TableCell className="whitespace-nowrap">
                                  <Badge
                                    variant={
                                      row.isOverride || row.source === "admin"
                                        ? "default"
                                        : "outline"
                                    }
                                  >
                                    {row.source === "admin"
                                      ? "관리자 지급"
                                      : "자동 지급"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="w-[320px] whitespace-nowrap text-sm">
                                  {String(row.overrideReason || "").trim() ||
                                    "-"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )
                  ) : freeCreditMenu === "shipping-credit" ? (
                    <div className="space-y-4">
                      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
                        <div className="space-y-2">
                          <Label
                            htmlFor="shipping-credit-business"
                            className="text-sm"
                          >
                            대상 사업자
                          </Label>
                          <div className="relative">
                            <select
                              id="shipping-credit-business"
                              className="h-11 w-full appearance-none rounded-lg border border-input bg-background px-3 pr-10 text-sm"
                              value={selectedShippingCreditBusinessAnchorId}
                              onChange={(e) =>
                                setSelectedShippingCreditBusinessAnchorId(
                                  e.target.value,
                                )
                              }
                            >
                              <option value="">사업자 선택</option>
                              {[...businesses]
                                .sort((a, b) =>
                                  String(a.name || "").localeCompare(
                                    String(b.name || ""),
                                    "ko",
                                  ),
                                )
                                .map((business) => (
                                  <option
                                    key={business._id}
                                    value={business._id}
                                  >
                                    {formatBusinessSelectLabel(business)}
                                  </option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
                              <span className="text-xs">▼</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-[minmax(460px,1.15fr)_minmax(360px,0.85fr)]">
                        <div className="flex flex-col gap-4 rounded-xl border border-amber-200/50 bg-amber-50/50 p-5 shadow-sm">
                          <div className="space-y-2">
                            <Label>배송비 무료 크레딧 금액</Label>
                            <div className="grid grid-cols-3 gap-3">
                              {[3500, 7000, 10500].map((amount) => (
                                <Button
                                  key={amount}
                                  type="button"
                                  className="h-12 w-full"
                                  variant={
                                    selectedShippingCreditAmount === amount
                                      ? "default"
                                      : "outline"
                                  }
                                  onClick={() =>
                                    setSelectedShippingCreditAmount(amount)
                                  }
                                >
                                  {amount.toLocaleString()}원
                                </Button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="shipping-credit-reason">
                              지급 이유
                            </Label>
                            <Input
                              id="shipping-credit-reason"
                              className="h-12 bg-background"
                              value={shippingCreditReason}
                              onChange={(e) =>
                                setShippingCreditReason(e.target.value)
                              }
                              placeholder="예: 배송비 예외 처리, 운영 정책"
                            />
                            <div className="rounded-lg bg-background/70 p-3 text-xs text-muted-foreground ring-1 ring-amber-200/30">
                              배송비 무료 크레딧은 배송비 결제 시에만 사용되며,
                              의뢰 비용으로는 사용할 수 없습니다.
                            </div>
                          </div>

                          <Button
                            className="h-12 justify-center"
                            onClick={handleGrantShippingCredit}
                            disabled={
                              grantingShippingCredit ||
                              !selectedShippingCreditBusinessAnchorId
                            }
                          >
                            {grantingShippingCredit
                              ? "지급 중..."
                              : "배송비 무료 크레딧 지급"}
                          </Button>
                        </div>

                        <div className="flex flex-col gap-4">
                          <div className="rounded-xl border border-border/60 bg-muted/20 p-5">
                            <div className="text-sm font-medium">지급 요약</div>
                            <div className="mt-3 space-y-2 text-sm">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">
                                  선택 사업자
                                </span>
                                <span className="text-right font-medium">
                                  {businesses.find(
                                    (business) =>
                                      String(business._id) ===
                                      selectedShippingCreditBusinessAnchorId,
                                  )?.name || "미선택"}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">
                                  사업자번호
                                </span>
                                <span className="font-mono">
                                  {businesses.find(
                                    (business) =>
                                      String(business._id) ===
                                      selectedShippingCreditBusinessAnchorId,
                                  )?.businessNumber || "-"}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">
                                  지급 금액
                                </span>
                                <span className="font-semibold text-amber-600">
                                  {selectedShippingCreditAmount.toLocaleString()}
                                  원
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-xl border border-amber-200/30 bg-amber-50/50 p-5">
                            <div className="text-sm font-medium">지급 안내</div>
                            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                              <div>
                                배송비 무료 크레딧은 배송비 결제 시에만
                                사용됩니다.
                              </div>
                              <div>
                                의뢰 비용이나 다른 수수료로는 사용할 수
                                없습니다.
                              </div>
                              <div>지급 사유는 운영 로그에 기록됩니다.</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : filteredFreeCreditUsageRows.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      무료 크레딧 사용 내역이 없습니다.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>사업자명</TableHead>
                            <TableHead>사업자번호</TableHead>
                            <TableHead className="text-right">
                              사용크레딧(무료)
                            </TableHead>
                            <TableHead className="text-right">
                              잔여크레딧(무료)
                            </TableHead>
                            <TableHead className="text-right">
                              충전크레딧(무료)
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredFreeCreditUsageRows.map((org) => (
                            <TableRow key={org._id}>
                              <TableCell>
                                <div className="font-medium">
                                  {org.name || "-"}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {org.companyName || "-"}
                                </div>
                              </TableCell>
                              <TableCell className="font-mono">
                                {org.businessNumber || "-"}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {Number(
                                  org.spentBonusAmount || 0,
                                ).toLocaleString()}
                                원
                              </TableCell>
                              <TableCell className="text-right">
                                {Number(org.bonusBalance || 0).toLocaleString()}
                                원
                              </TableCell>
                              <TableCell className="text-right">
                                {Number(
                                  org.chargedBonusAmount || 0,
                                ).toLocaleString()}
                                원
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
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
                  총 소개자 수
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
                  <CardTitle>소개자 크레딧</CardTitle>
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
                  소개자 데이터가 없습니다.
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
          if (!open) setOrgLedgerBusiness(null);
        }}
        businessAnchorId={orgLedgerBusiness?._id}
        titleSuffix={orgLedgerBusiness?.name}
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
