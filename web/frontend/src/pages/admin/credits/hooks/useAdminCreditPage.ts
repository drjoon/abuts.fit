import { useEffect, useMemo, useRef, useState } from "react";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { usePeriodStore, periodToRangeQuery } from "@/store/usePeriodStore";
import { useAuthStore } from "@/store/useAuthStore";
import type {
  BankTransaction,
  BonusGrantHistoryRow,
  BusinessCredit,
  ChargeOrder,
  CreditStats,
  FreeCreditAmount,
  SalesmanCreditRow,
  SalesmanCreditsOverview,
} from "../adminCredit.types";
import { normalizeDigits } from "../adminCredit.utils";

type ApiMessageResponse = {
  success?: boolean;
  message?: string;
};

const getResponseMessage = (
  data: ApiMessageResponse | null | undefined,
  fallback: string,
) => {
  const message = String(data?.message || "").trim();
  return message || fallback;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) {
    const message = String(error.message || "").trim();
    return message || fallback;
  }
  return fallback;
};

export function useAdminCreditPage() {
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
  const [orderStatusFilter, setOrderStatusFilter] = useState("");
  const [orderSkip, setOrderSkip] = useState(0);
  const [orderHasMore, setOrderHasMore] = useState(true);
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>(
    [],
  );
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [txStatusFilter, setTxStatusFilter] = useState("");
  const [txSkip, setTxSkip] = useState(0);
  const [txHasMore, setTxHasMore] = useState(true);
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

  const ORG_PAGE_SIZE = 9;
  const SALESMAN_PAGE_SIZE = 9;
  const ORDER_PAGE_SIZE = 50;
  const TX_PAGE_SIZE = 50;

  const loadStats = async () => {
    if (!token) return;
    setLoadingStats(true);
    try {
      const res = await request<{ success: boolean; data: CreditStats }>({
        path: "/api/admin/credits/stats",
        method: "GET",
        token,
      });
      if (res.ok && res.data?.data) setStats(res.data.data);
    } catch {
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
      if (res.ok && res.data?.success && res.data?.data)
        setSalesmanOverview(res.data.data);
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
        data: { items: SalesmanCreditRow[] };
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
    } catch {
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
        data: { items: BusinessCredit[] };
      }>({
        path: `/api/admin/credits/businesses?${qs.toString()}`,
        method: "GET",
        token,
      });
      if (!res.ok || !res.data?.success) {
        setOrgHasMore(false);
        throw new Error(
          getResponseMessage(
            res.data,
            "사업자별 크레딧을 불러오는데 실패했습니다.",
          ),
        );
      }
      const items = Array.isArray(res.data.data.items)
        ? res.data.data.items
        : [];
      setBusinesses((prev) => (reset ? items : [...prev, ...items]));
      setOrgSkip((reset ? 0 : orgSkip) + items.length);
      setOrgHasMore(items.length >= ORG_PAGE_SIZE);
    } catch (error: unknown) {
      toast({
        title: "사업자 조회 실패",
        description: getErrorMessage(
          error,
          "사업자별 크레딧을 불러오는데 실패했습니다.",
        ),
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
        data: { items: ChargeOrder[] };
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
    } catch {
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
        data: { items: BankTransaction[] };
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
    } catch {
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
      if (!res.ok) throw new Error("매칭 실패");
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
    } catch (error: unknown) {
      toast({
        title: "매칭 실패",
        description: getErrorMessage(error, "매칭에 실패했습니다."),
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
    if (String(targetBusiness?.businessType || "").trim() !== "requestor") {
      toast({
        title: "지급 대상 제한",
        description: "무료 크레딧은 의뢰자 사업자에게만 지급할 수 있습니다.",
        variant: "destructive",
      });
      return;
    }
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
      const res = await request<ApiMessageResponse>({
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
        throw new Error(
          getResponseMessage(res.data, "무료 크레딧 지급에 실패했습니다."),
        );
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
    } catch (error: unknown) {
      toast({
        title: "무료 크레딧 지급 실패",
        description: getErrorMessage(error, "다시 시도해주세요."),
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
    if (String(targetBusiness?.businessType || "").trim() !== "requestor") {
      toast({
        title: "지급 대상 제한",
        description:
          "배송비 무료 크레딧은 의뢰자 사업자에게만 지급할 수 있습니다.",
        variant: "destructive",
      });
      return;
    }
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
      const res = await request<ApiMessageResponse>({
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
        throw new Error(
          getResponseMessage(
            res.data,
            "배송비 무료 크레딧 지급에 실패했습니다.",
          ),
        );
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
    } catch (error: unknown) {
      toast({
        title: "배송비 무료 크레딧 지급 실패",
        description: getErrorMessage(error, "다시 시도해주세요."),
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
      if (!res.ok || !res.data?.success)
        throw new Error(
          String(res.data?.message || "").trim() ||
            "무료 크레딧 지급 내역을 불러오는데 실패했습니다.",
        );
      setBonusGrantRows(
        Array.isArray(res.data?.data?.rows) ? res.data.data.rows : [],
      );
    } catch (error: unknown) {
      setBonusGrantRows([]);
      toast({
        title: "무료 크레딧 지급 내역 조회 실패",
        description: getErrorMessage(error, "다시 시도해주세요."),
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
    if (selectedGrant?.hasSpent)
      toast({
        title: "주의: 사용된 크레딧 취소",
        description:
          "이 지급건의 크레딧이 일부 사용되었습니다. 취소 시 잔액이 마이너스가 될 수 있습니다.",
        variant: "default",
      });
    setCancelingGrant(true);
    try {
      const res = await request<ApiMessageResponse>({
        path: `/api/admin/bonus-grants/${grantId}/cancel`,
        method: "POST",
        token,
        jsonBody: { reason },
      });
      if (!res.ok)
        throw new Error(
          getResponseMessage(res.data, "무료 크레딧 지급 취소에 실패했습니다."),
        );
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
    } catch (error: unknown) {
      toast({
        title: "지급 취소 실패",
        description: getErrorMessage(error, "다시 시도해주세요."),
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
      if (cancelStartDate) params.append("startDate", cancelStartDate);
      if (cancelEndDate) params.append("endDate", cancelEndDate);
      const res = await request<{
        success?: boolean;
        data?: { rows?: BonusGrantHistoryRow[]; hasMore?: boolean };
        message?: string;
      }>({
        path: `/api/admin/bonus-grants?${params.toString()}`,
        method: "GET",
        token,
      });
      if (!res.ok || !res.data?.success)
        throw new Error("더 이상 조회할 지급 내역이 없습니다.");
      const newRows = Array.isArray(res.data?.data?.rows)
        ? res.data.data.rows
        : [];
      setBonusGrantRows((prev) => [...prev, ...newRows]);
      setCancelSkip((prev) => prev + 20);
      setCancelHasMore(res.data?.data?.hasMore ?? false);
    } catch (error: unknown) {
      toast({
        title: "더 이상 조회할 내역이 없습니다",
        description: getErrorMessage(error, "다시 시도해주세요."),
        variant: "default",
      });
    } finally {
      setLoadingBonusGrantRows(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedOrder || !token) return;
    setProcessingApproval(true);
    try {
      const res = await request<ApiMessageResponse>({
        path: `/api/admin/credits/b-plan/charge-orders/${selectedOrder._id}/approve`,
        method: "POST",
        token,
        jsonBody: { note: matchNote || "" },
      });
      if (!res.ok) throw new Error(getResponseMessage(res.data, "승인 실패"));
      toast({ title: "승인 완료", description: "충전 주문을 승인했습니다." });
      setApproveModalOpen(false);
      setSelectedOrder(null);
      setOrderSkip(0);
      setOrderHasMore(true);
      loadChargeOrders(orderStatusFilter, { reset: true });
    } catch (error: unknown) {
      toast({
        title: "승인 실패",
        description: getErrorMessage(error, "승인에 실패했습니다."),
        variant: "destructive",
      });
    } finally {
      setProcessingApproval(false);
    }
  };

  const handleReject = async () => {
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
      const res = await request<ApiMessageResponse>({
        path: `/api/admin/credits/b-plan/charge-orders/${selectedOrder._id}/reject`,
        method: "POST",
        token,
        jsonBody: { note: rejectNote },
      });
      if (!res.ok) throw new Error(getResponseMessage(res.data, "거절 실패"));
      toast({ title: "거절 완료", description: "충전 주문을 거절했습니다." });
      setRejectModalOpen(false);
      setSelectedOrder(null);
      setRejectNote("");
      setOrderSkip(0);
      setOrderHasMore(true);
      loadChargeOrders(orderStatusFilter, { reset: true });
    } catch (error: unknown) {
      toast({
        title: "거절 실패",
        description: getErrorMessage(error, "거절에 실패했습니다."),
        variant: "destructive",
      });
    } finally {
      setProcessingApproval(false);
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
  }, [period, token]);

  useEffect(() => {
    const sentinel = orgSentinelRef.current;
    const root = orgScrollRef.current;
    if (!sentinel || !root || !orgHasMore || loadingOrgsRef.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((e) => e.isIntersecting) &&
          !loadingOrgsRef.current &&
          orgHasMore
        )
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
    if (!sentinel || !root || !salesmanHasMore || loadingSalesmen) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((e) => e.isIntersecting) &&
          !loadingSalesmen &&
          salesmanHasMore
        )
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
    if (!sentinel || !root || !orderHasMore || loadingOrders) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((e) => e.isIntersecting) &&
          !loadingOrders &&
          orderHasMore
        )
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
    if (!sentinel || !root || !txHasMore || loadingTransactions) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((e) => e.isIntersecting) &&
          !loadingTransactions &&
          txHasMore
        )
          loadBankTransactions(txStatusFilter, { reset: false });
      },
      { root, rootMargin: "400px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [txHasMore, loadingTransactions, txSkip, txStatusFilter, token]);

  const salesmanSummary = useMemo(() => {
    const fallback = {
      totalSalesmen: salesmen.length,
      totalBalance: salesmen.reduce(
        (acc, s) => acc + Number(s?.wallet?.balanceAmountPeriod || 0),
        0,
      ),
      totalEarned: salesmen.reduce(
        (acc, s) =>
          acc +
          Number(
            (s?.performance30d?.myCommissionAmount ?? 0) +
              (s?.performance30d?.level1CommissionAmount ?? 0),
          ),
        0,
      ),
      totalPaidOut: salesmen.reduce(
        (acc, s) => acc + Number(s?.wallet?.paidOutAmountPeriod || 0),
        0,
      ),
      totalReferredRevenue30d: salesmen.reduce(
        (acc, s) => acc + Number(s?.performance30d?.revenueAmount || 0),
        0,
      ),
      totalReferredBonus30d: salesmen.reduce(
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
        if (
          normalizeDigits(String(row.businessNumber || "")) !==
          selectedBusinessNumberDigits
        )
          return false;
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
        )
          return false;
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

  return {
    token,
    period,
    setPeriod,
    stats,
    loadingStats,
    businesses,
    loadingOrgs,
    orgSkip,
    setOrgSkip,
    orgHasMore,
    setOrgHasMore,
    orgLedgerOpen,
    setOrgLedgerOpen,
    orgLedgerBusiness,
    setOrgLedgerBusiness,
    salesmanLedgerOpen,
    setSalesmanLedgerOpen,
    salesmanLedgerRow,
    setSalesmanLedgerRow,
    salesmen,
    loadingSalesmen,
    salesmanSkip,
    setSalesmanSkip,
    salesmanHasMore,
    setSalesmanHasMore,
    salesmanOverview,
    loadingSalesmanOverview,
    creditTab,
    setCreditTab,
    salesmanSortKey,
    setSalesmanSortKey,
    orgSortKey,
    setOrgSortKey,
    chargeOrders,
    loadingOrders,
    orderStatusFilter,
    setOrderStatusFilter,
    orderSkip,
    setOrderSkip,
    orderHasMore,
    setOrderHasMore,
    bankTransactions,
    loadingTransactions,
    txStatusFilter,
    setTxStatusFilter,
    txSkip,
    setTxSkip,
    txHasMore,
    setTxHasMore,
    txTab,
    setTxTab,
    selectedBonusBusinessAnchorId,
    setSelectedBonusBusinessAnchorId,
    selectedBonusAmount,
    setSelectedBonusAmount,
    bonusReason,
    setBonusReason,
    grantingBonus,
    grantCreditType,
    setGrantCreditType,
    bonusGrantRows,
    setBonusGrantRows,
    loadingBonusGrantRows,
    bonusGrantSearch,
    setBonusGrantSearch,
    freeCreditMenu,
    setFreeCreditMenu,
    selectedShippingCreditBusinessAnchorId,
    setSelectedShippingCreditBusinessAnchorId,
    selectedShippingCreditAmount,
    setSelectedShippingCreditAmount,
    shippingCreditReason,
    setShippingCreditReason,
    grantingShippingCredit,
    selectedCancelGrantId,
    setSelectedCancelGrantId,
    cancelGrantReason,
    setCancelGrantReason,
    cancelingGrant,
    cancelStartDate,
    setCancelStartDate,
    cancelEndDate,
    setCancelEndDate,
    cancelSkip,
    setCancelSkip,
    cancelHasMore,
    setCancelHasMore,
    selectedTx,
    setSelectedTx,
    selectedOrder,
    setSelectedOrder,
    matchNote,
    setMatchNote,
    matchForce,
    setMatchForce,
    matching,
    approveModalOpen,
    setApproveModalOpen,
    rejectModalOpen,
    setRejectModalOpen,
    rejectNote,
    setRejectNote,
    processingApproval,
    orgScrollRef,
    orgSentinelRef,
    salesmanScrollRef,
    salesmanSentinelRef,
    orderScrollRef,
    orderSentinelRef,
    txScrollRef,
    txSentinelRef,
    loadStats,
    loadSalesmanOverview,
    loadSalesmen,
    loadOrganizations,
    loadChargeOrders,
    loadBankTransactions,
    handleManualMatch,
    handleGrantFreeCredit,
    handleGrantShippingCredit,
    loadBonusGrantHistory,
    handleCancelFreeCredit,
    loadMoreCancelGrants,
    handleApprove,
    handleReject,
    salesmanSummary,
    selectedBonusBusiness,
    selectedShippingCreditBusiness,
    filteredBonusGrantRows,
    filteredFreeCreditUsageRows,
  };
}
