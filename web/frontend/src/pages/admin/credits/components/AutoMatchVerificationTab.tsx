import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { request } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  organizationId?: {
    _id: string;
    companyName: string;
  };
};

function formatDate(dateStr?: string) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

  const loadOrders = async (statusFilter?: string) => {
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
  };

  useEffect(() => {
    loadOrders("MATCHED");
  }, [token]);

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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>자동 매칭 검증</CardTitle>
            <div className="flex gap-2">
              <Button
                variant={filter === "unverified" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("unverified")}
              >
                미검증 (
                {orders.filter((o) => !o.adminVerified && !o.isLocked).length})
              </Button>
              <Button
                variant={filter === "verified" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("verified")}
              >
                검증완료 (
                {orders.filter((o) => o.adminVerified && !o.isLocked).length})
              </Button>
              <Button
                variant={filter === "locked" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("locked")}
              >
                잠김 ({orders.filter((o) => o.isLocked).length})
              </Button>
              <Button
                variant={filter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("all")}
              >
                전체
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              불러오는 중...
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {filter === "unverified" && "검증이 필요한 주문이 없습니다."}
              {filter === "verified" && "검증된 주문이 없습니다."}
              {filter === "locked" && "잠긴 주문이 없습니다."}
              {filter === "all" && "자동 매칭된 주문이 없습니다."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>상태</TableHead>
                  <TableHead>기공소</TableHead>
                  <TableHead>입금자명</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead>매칭일</TableHead>
                  <TableHead>검증일</TableHead>
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
                        <Badge variant="default">검증완료</Badge>
                      ) : (
                        <Badge variant="secondary">미검증</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {typeof order.organizationId === "object"
                        ? order.organizationId?.companyName
                        : "-"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {order.depositorName}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {order.amountTotal.toLocaleString()}원
                    </TableCell>
                    <TableCell>{formatDate(order.matchedAt)}</TableCell>
                    <TableCell>{formatDate(order.adminVerifiedAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        {order.isLocked ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedOrder(order);
                                setUnlockModalOpen(true);
                              }}
                              disabled={processing}
                            >
                              잠금 해제
                            </Button>
                            <div className="text-xs text-muted-foreground max-w-[200px]">
                              {order.lockedReason}
                            </div>
                          </>
                        ) : (
                          <>
                            {!order.adminVerified && (
                              <Button
                                size="sm"
                                onClick={() => handleVerify(order._id)}
                                disabled={processing}
                              >
                                검증
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="destructive"
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
          )}
        </CardContent>
      </Card>

      {/* Lock Modal */}
      <Dialog open={lockModalOpen} onOpenChange={setLockModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>충전 주문 잠금</DialogTitle>
            <DialogDescription>
              이 충전 주문을 잠그면 해당 조직의 크레딧 사용이 제한됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>잠금 사유</Label>
              <Textarea
                placeholder="잠금 사유를 입력하세요 (예: 오입금 확인 필요)"
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
                rows={3}
              />
            </div>
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
              {processing ? "처리 중..." : "잠금"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unlock Modal */}
      <Dialog open={unlockModalOpen} onOpenChange={setUnlockModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>충전 주문 잠금 해제</DialogTitle>
            <DialogDescription>
              이 충전 주문의 잠금을 해제하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlockModalOpen(false)}>
              취소
            </Button>
            <Button onClick={handleUnlock} disabled={processing}>
              {processing ? "처리 중..." : "잠금 해제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
