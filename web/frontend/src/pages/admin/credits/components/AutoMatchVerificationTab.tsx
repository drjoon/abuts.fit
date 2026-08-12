// change-log:
// - 2026-08-13: 자동 매칭 검증 탭 스타일·카피 모던화.
// - 2026-08-03: Hook dependency fix — wrapped loadOrders in useCallback and adjusted useEffect dependency to avoid missing-deps warning.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/admin/credits/components/RequestorCreditTab.tsx
// - web/frontend/src/pages/admin/credits/creditPageUi.tsx
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { formatDate } from "../adminCredit.utils";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  CreditFilterChip,
  CreditPanel,
  CreditSectionHeader,
} from "../creditPageUi";

type ChargeOrder = {
  _id: string;
  status: string;
  depositCode: string;
  depositorName: string;
  supplyAmount: number;
  vatAmount: number;
  amountTotal: number;
  matchedAt?: string;
  createdAt?: string;
  adminVerified: boolean;
  adminVerifiedAt?: string;
  isLocked: boolean;
  lockedAt?: string;
  lockedReason?: string;
  businessAnchorId?: {
    _id: string;
    name?: string;
    metadata?: { companyName?: string };
  } | null;
};

export function AutoMatchVerificationTab() {
  const { token } = useAuthStore();
  const { toast } = useToast();

  const [orders, setOrders] = useState<ChargeOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<
    "all" | "unverified" | "verified" | "locked"
  >("unverified");

  const [lockModalOpen, setLockModalOpen] = useState(false);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ChargeOrder | null>(null);
  const [lockReason, setLockReason] = useState("");
  const [processing, setProcessing] = useState(false);

  const loadOrders = useCallback(async (statusFilter?: string) => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append("status", statusFilter);

      const res = await request<any>({
        path: `/api/admin/credits/b-plan/charge-orders?${params.toString()}`,
        method: "GET",
        token,
      });

      if (res.ok) {
        const data = res.data?.data || res.data || [];
        setOrders(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Failed to load charge orders:", error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadOrders("MATCHED");
  }, [loadOrders]);

  const handleVerify = async (orderId: string) => {
    if (!token) return;
    setProcessing(true);
    try {
      const res = await request<any>({
        path: "/api/admin/credits/b-plan/charge-orders/verify",
        method: "POST",
        token,
        jsonBody: { chargeOrderId: orderId },
      });

      if (res.ok) {
        toast({
          title: "검증 완료",
          description: "충전 주문이 검증되었습니다.",
        });
        loadOrders("MATCHED");
      } else {
        throw new Error(res.data?.message || "검증 실패");
      }
    } catch (error: any) {
      toast({
        title: "검증 실패",
        description: error.message || "검증에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleLock = async () => {
    if (!selectedOrder || !token) return;
    setProcessing(true);
    try {
      const res = await request<any>({
        path: "/api/admin/credits/b-plan/charge-orders/lock",
        method: "POST",
        token,
        jsonBody: {
          chargeOrderId: selectedOrder._id,
          reason: lockReason || "관리자 검토 필요",
        },
      });

      if (res.ok) {
        toast({
          title: "잠금 완료",
          description:
            "충전 주문이 잠겼습니다. 해당 조직의 크레딧 사용이 제한됩니다.",
        });
        setLockModalOpen(false);
        setSelectedOrder(null);
        setLockReason("");
        loadOrders("MATCHED");
      } else {
        throw new Error(res.data?.message || "잠금 실패");
      }
    } catch (error: any) {
      toast({
        title: "잠금 실패",
        description: error.message || "잠금에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleUnlock = async () => {
    if (!selectedOrder || !token) return;
    setProcessing(true);
    try {
      const res = await request<any>({
        path: "/api/admin/credits/b-plan/charge-orders/unlock",
        method: "POST",
        token,
        jsonBody: { chargeOrderId: selectedOrder._id },
      });

      if (res.ok) {
        toast({
          title: "잠금 해제 완료",
          description: "충전 주문 잠금이 해제되었습니다.",
        });
        setUnlockModalOpen(false);
        setSelectedOrder(null);
        loadOrders("MATCHED");
      } else {
        throw new Error(res.data?.message || "잠금 해제 실패");
      }
    } catch (error: any) {
      toast({
        title: "잠금 해제 실패",
        description: error.message || "잠금 해제에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const filteredOrders = orders.filter((order) => {
    if (filter === "unverified") return !order.adminVerified && !order.isLocked;
    if (filter === "verified") return order.adminVerified && !order.isLocked;
    if (filter === "locked") return order.isLocked;
    return true;
  });

  const unverifiedCount = orders.filter(
    (o) => !o.adminVerified && !o.isLocked,
  ).length;
  const verifiedCount = orders.filter(
    (o) => o.adminVerified && !o.isLocked,
  ).length;
  const lockedCount = orders.filter((o) => o.isLocked).length;

  return (
    <>
      <CreditPanel>
        <div className="space-y-5 p-5 sm:p-6">
          <CreditSectionHeader
            icon={ShieldCheck}
            title="자동 매칭 검증"
            description="자동 매칭된 충전 주문을 검증하거나 잠급니다."
            trailing={
              <div className="flex flex-wrap gap-1.5">
                <CreditFilterChip
                  active={filter === "unverified"}
                  onClick={() => setFilter("unverified")}
                >
                  미검증 ({unverifiedCount})
                </CreditFilterChip>
                <CreditFilterChip
                  active={filter === "verified"}
                  onClick={() => setFilter("verified")}
                >
                  검증 ({verifiedCount})
                </CreditFilterChip>
                <CreditFilterChip
                  active={filter === "locked"}
                  onClick={() => setFilter("locked")}
                >
                  잠김 ({lockedCount})
                </CreditFilterChip>
                <CreditFilterChip
                  active={filter === "all"}
                  onClick={() => setFilter("all")}
                >
                  전체
                </CreditFilterChip>
              </div>
            }
          />

          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              불러오는 중…
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {filter === "unverified" && "검증할 주문이 없습니다."}
              {filter === "verified" && "검증된 주문이 없습니다."}
              {filter === "locked" && "잠긴 주문이 없습니다."}
              {filter === "all" && "자동 매칭 주문이 없습니다."}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>상태</TableHead>
                    <TableHead>사업자</TableHead>
                    <TableHead>입금자</TableHead>
                    <TableHead className="text-right">금액</TableHead>
                    <TableHead>매칭</TableHead>
                    <TableHead>검증</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order._id}>
                      <TableCell>
                        {order.isLocked ? (
                          <Badge variant="destructive">잠김</Badge>
                        ) : order.adminVerified ? (
                          <Badge variant="default">검증</Badge>
                        ) : (
                          <Badge variant="secondary">미검증</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {typeof order.businessAnchorId === "object" &&
                        order.businessAnchorId
                          ? order.businessAnchorId?.metadata?.companyName ||
                            order.businessAnchorId?.name
                          : "-"}
                      </TableCell>
                      <TableCell className="font-medium">
                        {order.depositorName}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {order.amountTotal.toLocaleString()}원
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(order.matchedAt)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(order.adminVerifiedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          {order.isLocked ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-lg"
                                onClick={() => {
                                  setSelectedOrder(order);
                                  setUnlockModalOpen(true);
                                }}
                                disabled={processing}
                              >
                                해제
                              </Button>
                              {order.lockedReason ? (
                                <span className="max-w-[160px] truncate text-xs text-muted-foreground self-center">
                                  {order.lockedReason}
                                </span>
                              ) : null}
                            </>
                          ) : (
                            <>
                              {!order.adminVerified ? (
                                <Button
                                  size="sm"
                                  className="h-8 rounded-lg"
                                  onClick={() => handleVerify(order._id)}
                                  disabled={processing}
                                >
                                  검증
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-8 rounded-lg"
                                onClick={() => {
                                  setSelectedOrder(order);
                                  setLockModalOpen(true);
                                }}
                                disabled={processing}
                              >
                                잠금
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CreditPanel>

      <Dialog open={lockModalOpen} onOpenChange={setLockModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>충전 주문 잠금</DialogTitle>
            <DialogDescription>
              잠그면 해당 사업자의 크레딧 사용이 제한됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>사유</Label>
            <Textarea
              placeholder="예: 오입금 확인 필요"
              value={lockReason}
              onChange={(e) => setLockReason(e.target.value)}
              rows={3}
              className="rounded-xl"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLockModalOpen(false)}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleLock}
              disabled={processing}
            >
              {processing ? "처리 중…" : "잠금"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={unlockModalOpen} onOpenChange={setUnlockModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>잠금 해제</DialogTitle>
            <DialogDescription>
              이 충전 주문의 잠금을 해제할까요?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlockModalOpen(false)}>
              취소
            </Button>
            <Button onClick={handleUnlock} disabled={processing}>
              {processing ? "처리 중…" : "해제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
