// change-log:
// - 2026-08-13: 충전 주문 탭 스타일·카피 모던화.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/admin/credits/components/RequestorCreditTab.tsx
// - web/frontend/src/pages/admin/credits/creditPageUi.tsx
import type { RefObject } from "react";
import { Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  CreditFilterChip,
  CreditPanel,
  CreditSectionHeader,
} from "../creditPageUi";

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

const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "전체" },
  { value: "PENDING", label: "대기" },
  { value: "MATCHED", label: "매칭" },
  { value: "AUTO_MATCHED", label: "자동매칭" },
];

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

  const applyFilter = (status: string) => {
    setOrderStatusFilter(status);
    setOrderSkip(0);
    setOrderHasMore(true);
    loadChargeOrders(status || undefined, { reset: true });
  };

  return (
    <TabsContent value="orders" className="space-y-4">
      <CreditPanel>
        <div className="space-y-5 p-5 sm:p-6">
          <CreditSectionHeader
            icon={Receipt}
            title="충전 주문"
            description="입금 매칭된 주문을 승인하거나 거절합니다."
            trailing={
              <div className="flex flex-wrap gap-1.5">
                {FILTERS.map((f) => (
                  <CreditFilterChip
                    key={f.value || "all"}
                    active={orderStatusFilter === f.value}
                    onClick={() => applyFilter(f.value)}
                  >
                    {f.label}
                  </CreditFilterChip>
                ))}
              </div>
            }
          />

          {loadingOrders && chargeOrders.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              불러오는 중…
            </div>
          ) : chargeOrders.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              충전 주문이 없습니다.
            </div>
          ) : (
            <div ref={orderScrollRef} className="overflow-x-auto rounded-2xl border border-slate-200/80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>상태</TableHead>
                    <TableHead>입금코드</TableHead>
                    <TableHead className="text-right">공급가</TableHead>
                    <TableHead className="text-right">총액</TableHead>
                    <TableHead>승인</TableHead>
                    <TableHead>승인자</TableHead>
                    <TableHead>생성</TableHead>
                    <TableHead>만료</TableHead>
                    <TableHead>매칭</TableHead>
                    <TableHead className="text-right">액션</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chargeOrders.map((order) => {
                    const canAct =
                      order.adminApprovalStatus === "PENDING" &&
                      order.status !== "CANCELED" &&
                      order.status !== "EXPIRED";
                    return (
                      <TableRow key={order._id}>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {order.depositCode}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {order.supplyAmount.toLocaleString()}원
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
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
                          {order.adminApprovalBy?.name || "-"}
                          <div className="text-xs text-muted-foreground">
                            {formatDate(order.adminApprovalAt)}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(order.createdAt)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(order.expiresAt)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(order.matchedAt)}
                        </TableCell>
                        <TableCell className="space-x-1.5 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-lg"
                            disabled={!canAct}
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
                            className="h-8 rounded-lg"
                            disabled={!canAct}
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
                    );
                  })}
                </TableBody>
              </Table>
              <div ref={orderSentinelRef} className="h-10" />
            </div>
          )}
        </div>
      </CreditPanel>
    </TabsContent>
  );
}
