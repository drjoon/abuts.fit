import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { request } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";
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
import { Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PopbillQueuePanel } from "@/features/admin/popbill/PopbillQueuePanel";

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

type OrganizationCredit = {
  _id: string;
  name: string;
  companyName: string;
  businessNumber: string;
  balance: number;
  paidBalance: number;
  bonusBalance: number;
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
  const { toast } = useToast();
  const navigate = useNavigate();

  const [stats, setStats] = useState<CreditStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const [organizations, setOrganizations] = useState<OrganizationCredit[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);

  const [chargeOrders, setChargeOrders] = useState<ChargeOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("");

  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>(
    []
  );
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [txStatusFilter, setTxStatusFilter] = useState<string>("");

  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<BankTransaction | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<ChargeOrder | null>(null);
  const [matchNote, setMatchNote] = useState("");
  const [matchForce, setMatchForce] = useState(false);
  const [matching, setMatching] = useState(false);
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [processingApproval, setProcessingApproval] = useState(false);

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

  const loadOrganizations = async () => {
    if (!token) return;
    setLoadingOrgs(true);
    try {
      const res = await request<{
        success: boolean;
        data: { items: OrganizationCredit[] };
      }>({
        path: "/api/admin/credits/organizations?limit=100",
        method: "GET",
        token,
      });
      if (res.ok && res.data?.data?.items) {
        setOrganizations(res.data.data.items);
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

  const loadChargeOrders = async (status?: string) => {
    if (!token) return;
    setLoadingOrders(true);
    try {
      const query = status ? `?status=${status}` : "";
      const res = await request<{ success: boolean; data: ChargeOrder[] }>({
        path: `/api/admin/credits/b-plan/charge-orders${query}`,
        method: "GET",
        token,
      });
      if (res.ok && res.data?.data) {
        setChargeOrders(Array.isArray(res.data.data) ? res.data.data : []);
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

  const loadBankTransactions = async (status?: string) => {
    if (!token) return;
    setLoadingTransactions(true);
    try {
      const query = status ? `?status=${status}` : "";
      const res = await request<{ success: boolean; data: BankTransaction[] }>({
        path: `/api/admin/credits/b-plan/bank-transactions${query}`,
        method: "GET",
        token,
      });
      if (res.ok && res.data?.data) {
        setBankTransactions(Array.isArray(res.data.data) ? res.data.data : []);
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
        setMatchModalOpen(false);
        setSelectedTx(null);
        setSelectedOrder(null);
        setMatchNote("");
        setMatchForce(false);
        loadChargeOrders(orderStatusFilter);
        loadBankTransactions(txStatusFilter);
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
    loadOrganizations();
    loadChargeOrders();
    loadBankTransactions();
  }, [token]);

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

  return (
    <div className="space-y-6 p-6">
      {/* 팝빌 큐 안내 */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-sm font-medium text-blue-900">
                크레딧/세금계산서 작업은 큐 기반으로 처리됩니다
              </div>
              <div className="text-xs text-blue-700">
                입금 매칭, 세금계산서 발행 등 팝빌 연동 작업은 백그라운드 워커가
                비동기로 처리합니다. 상단 탭의 "큐 모니터링"에서 실시간 상태를
                바로 확인할 수 있습니다.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">총 조직 수</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingStats ? "..." : stats?.totalOrgs.toLocaleString() || 0}
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
            <CardTitle className="text-sm font-medium">미매칭 입금</CardTitle>
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
          <TabsTrigger value="match">수동 매칭</TabsTrigger>
          <TabsTrigger value="queue">큐 모니터링</TabsTrigger>
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
              ) : organizations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  조직이 없습니다.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>조직명</TableHead>
                      <TableHead>회사명</TableHead>
                      <TableHead>사업자번호</TableHead>
                      <TableHead className="text-right">총 잔액</TableHead>
                      <TableHead className="text-right">구매 크레딧</TableHead>
                      <TableHead className="text-right">무료 크레딧</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {organizations.map((org) => (
                      <TableRow key={org._id}>
                        <TableCell className="font-medium">
                          {org.name}
                        </TableCell>
                        <TableCell>{org.companyName || "-"}</TableCell>
                        <TableCell>{org.businessNumber || "-"}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {org.balance.toLocaleString()}원
                        </TableCell>
                        <TableCell className="text-right">
                          {org.paidBalance.toLocaleString()}원
                        </TableCell>
                        <TableCell className="text-right">
                          {org.bonusBalance.toLocaleString()}원
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                    variant={orderStatusFilter === "" ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setOrderStatusFilter("");
                      loadChargeOrders();
                    }}
                  >
                    전체
                  </Button>
                  <Button
                    variant={
                      orderStatusFilter === "PENDING" ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => {
                      setOrderStatusFilter("PENDING");
                      loadChargeOrders("PENDING");
                    }}
                  >
                    대기중
                  </Button>
                  <Button
                    variant={
                      orderStatusFilter === "MATCHED" ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => {
                      setOrderStatusFilter("MATCHED");
                      loadChargeOrders("MATCHED");
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
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
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
                            ? `${order.adminApprovalBy.name} (${
                                order.adminApprovalBy.email || "-"
                              })`
                            : "-"}
                          <div className="text-xs text-muted-foreground">
                            {formatDate(order.adminApprovalAt)}
                          </div>
                        </TableCell>
                        <TableCell>{formatDate(order.createdAt)}</TableCell>
                        <TableCell>{formatDate(order.expiresAt)}</TableCell>
                        <TableCell>{formatDate(order.matchedAt)}</TableCell>
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
                    팝빌 계좌 수집 결과를 기반으로 매칭 상태를 확인합니다.
                  </CardDescription>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant={txStatusFilter === "" ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setTxStatusFilter("");
                      loadBankTransactions();
                    }}
                  >
                    전체
                  </Button>
                  <Button
                    variant={txStatusFilter === "NEW" ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setTxStatusFilter("NEW");
                      loadBankTransactions("NEW");
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
                      loadBankTransactions("MATCHED");
                    }}
                  >
                    매칭완료
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingTransactions ? (
                <div className="text-center py-8 text-muted-foreground">
                  불러오는 중...
                </div>
              ) : bankTransactions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  입금 내역이 없습니다.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>상태</TableHead>
                      <TableHead>입금코드</TableHead>
                      <TableHead className="text-right">금액</TableHead>
                      <TableHead>입금자</TableHead>
                      <TableHead>발생일</TableHead>
                      <TableHead>매칭일</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bankTransactions.map((tx) => (
                      <TableRow key={tx._id}>
                        <TableCell>{getStatusBadge(tx.status)}</TableCell>
                        <TableCell className="font-mono">
                          {tx.depositCode || "-"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {tx.tranAmt.toLocaleString()}원
                        </TableCell>
                        <TableCell>{tx.printedContent}</TableCell>
                        <TableCell>{formatDate(tx.occurredAt)}</TableCell>
                        <TableCell>{formatDate(tx.matchedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="match" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>미매칭 입금 내역</CardTitle>
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
                                공급가: {order.supplyAmount.toLocaleString()}원
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold">
                                {order.amountTotal.toLocaleString()}원
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
              <CardTitle>매칭 실행</CardTitle>
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
                          금액: {selectedTx.tranAmt.toLocaleString()}원
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
                          금액: {selectedOrder.amountTotal.toLocaleString()}원
                        </div>
                        <div className="text-sm text-muted-foreground">
                          공급가: {selectedOrder.supplyAmount.toLocaleString()}
                          원
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="match-note">메모 (선택사항)</Label>
                    <Input
                      id="match-note"
                      value={matchNote}
                      onChange={(e) => setMatchNote(e.target.value)}
                      placeholder="매칭 사유나 특이사항을 입력하세요"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="match-force"
                      checked={matchForce}
                      onChange={(e) => setMatchForce(e.target.checked)}
                      className="rounded"
                    />
                    <Label htmlFor="match-force" className="cursor-pointer">
                      강제 매칭 (금액/코드 불일치 허용)
                    </Label>
                  </div>

                  <Button
                    onClick={handleManualMatch}
                    disabled={matching}
                    className="w-full"
                  >
                    {matching ? "매칭 중..." : "매칭 실행"}
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

        <TabsContent value="queue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>팝빌 큐 모니터링</CardTitle>
              <CardDescription>
                입금 수집(EasyFin), 매칭 알림, 세금계산서 발행 관련 큐 상태를
                확인하고 재시도/취소를 수행합니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PopbillQueuePanel
                allowedTaskTypes={[
                  "EASYFIN_BANK_REQUEST",
                  "EASYFIN_BANK_CHECK",
                  "TAX_INVOICE_ISSUE",
                  "TAX_INVOICE_CANCEL",
                  "NOTIFICATION_KAKAO",
                  "NOTIFICATION_SMS",
                  "NOTIFICATION_LMS",
                ]}
              />
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
                  loadChargeOrders(orderStatusFilter);
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
                  loadChargeOrders(orderStatusFilter);
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
