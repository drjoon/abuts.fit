import type { RefObject } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import type { ChargeOrder } from "../adminCredit.types";
import { formatDate, getStatusBadge } from "../adminCredit.utils";

type RequestorOrdersTabProps = {
  orderStatusFilter: string;
  setOrderStatusFilter: (value: string) => void;
  setOrderSkip: (value: number) => void;
  setOrderHasMore: (value: boolean) => void;
  loadChargeOrders: (
    status?: string,
    options?: { reset?: boolean },
  ) => void | Promise<void>;
  loadingOrders: boolean;
  chargeOrders: ChargeOrder[];
  orderScrollRef: RefObject<HTMLDivElement | null>;
  orderSentinelRef: RefObject<HTMLDivElement | null>;
  setSelectedOrder: (order: ChargeOrder | null) => void;
  setApproveModalOpen: (open: boolean) => void;
  setRejectNote: (value: string) => void;
  setRejectModalOpen: (open: boolean) => void;
};

export function RequestorOrdersTab(props: RequestorOrdersTabProps) {
  const {
    orderStatusFilter,
    setOrderStatusFilter,
    setOrderSkip,
    setOrderHasMore,
    loadChargeOrders,
    loadingOrders,
    chargeOrders,
    orderScrollRef,
    orderSentinelRef,
    setSelectedOrder,
    setApproveModalOpen,
    setRejectNote,
    setRejectModalOpen,
  } = props;

  return (
    <TabsContent value="orders" className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>충전 주문</CardTitle>
              <CardDescription>
                입금 매칭된 주문을 승인하거나 거절합니다.
              </CardDescription>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant={orderStatusFilter === "" ? "default" : "outline"}
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
                  orderStatusFilter === "PENDING" ? "default" : "outline"
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
                  orderStatusFilter === "MATCHED" ? "default" : "outline"
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
              <Button
                variant={
                  orderStatusFilter === "AUTO_MATCHED" ? "default" : "outline"
                }
                size="sm"
                onClick={() => {
                  setOrderStatusFilter("AUTO_MATCHED");
                  setOrderSkip(0);
                  setOrderHasMore(true);
                  loadChargeOrders("AUTO_MATCHED", { reset: true });
                }}
              >
                자동매칭
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
            <div ref={orderScrollRef} className="h-[60vh] overflow-y-auto pr-1">
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
                          ? `${order.adminApprovalBy.name} (${order.adminApprovalBy.email || "-"})`
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
                            order.status === "CANCELED" ||
                            order.status === "EXPIRED"
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
                            order.status === "CANCELED" ||
                            order.status === "EXPIRED"
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
  );
}
