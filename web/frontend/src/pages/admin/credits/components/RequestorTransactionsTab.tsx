// change-log:
// - 2026-08-13: 입금 내역 탭 스타일·카피 모던화.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/admin/credits/components/RequestorCreditTab.tsx
// - web/frontend/src/pages/admin/credits/creditPageUi.tsx
import type { RefObject } from "react";
import { Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/shared/ui/cn";
import type { BankTransaction, ChargeOrder } from "../adminCredit.types";
import { formatDate, getStatusBadge } from "../adminCredit.utils";
import {
  CreditFilterChip,
  CreditPanel,
  CreditSectionHeader,
} from "../creditPageUi";

type RequestorTransactionsTabProps = {
  txTab: "auto" | "manual";
  setTxTab: (value: "auto" | "manual") => void;
  txStatusFilter: string;
  setTxStatusFilter: (value: string) => void;
  setTxSkip: (value: number) => void;
  setTxHasMore: (value: boolean) => void;
  loadBankTransactions: (
    status?: string,
    options?: { reset?: boolean },
  ) => void | Promise<void>;
  loadingTransactions: boolean;
  bankTransactions: BankTransaction[];
  txScrollRef: RefObject<HTMLDivElement | null>;
  txSentinelRef: RefObject<HTMLDivElement | null>;
  loadingOrders: boolean;
  chargeOrders: ChargeOrder[];
  selectedTx: BankTransaction | null;
  setSelectedTx: (value: BankTransaction | null) => void;
  selectedOrder: ChargeOrder | null;
  setSelectedOrder: (value: ChargeOrder | null) => void;
  matchNote: string;
  setMatchNote: (value: string) => void;
  matchForce: boolean;
  setMatchForce: (value: boolean) => void;
  handleManualMatch: () => void | Promise<void>;
  matching: boolean;
};

const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "전체" },
  { value: "NEW", label: "미매칭" },
  { value: "MATCHED", label: "매칭완료" },
];

export function RequestorTransactionsTab(props: RequestorTransactionsTabProps) {
  const {
    txTab,
    setTxTab,
    txStatusFilter,
    setTxStatusFilter,
    setTxSkip,
    setTxHasMore,
    loadBankTransactions,
    loadingTransactions,
    bankTransactions,
    txScrollRef,
    txSentinelRef,
    loadingOrders,
    chargeOrders,
    selectedTx,
    setSelectedTx,
    selectedOrder,
    setSelectedOrder,
    matchNote,
    setMatchNote,
    matchForce,
    setMatchForce,
    handleManualMatch,
    matching,
  } = props;

  const applyFilter = (status: string) => {
    setTxStatusFilter(status);
    setTxSkip(0);
    setTxHasMore(true);
    loadBankTransactions(status || undefined, { reset: true });
  };

  return (
    <TabsContent value="transactions" className="space-y-4">
      <CreditPanel>
        <div className="space-y-5 p-5 sm:p-6">
          <CreditSectionHeader
            icon={Landmark}
            title="입금 내역"
            description="팝빌 웹훅 입금 기준으로 자동 매칭합니다. 실패 건만 수동 연결하세요."
          />

          <Tabs
            value={txTab}
            onValueChange={(v) => setTxTab(v as "auto" | "manual")}
          >
            <TabsList className="h-10 rounded-xl bg-slate-100/80 p-1">
              <TabsTrigger value="auto" className="rounded-lg px-4">
                자동 매칭
              </TabsTrigger>
              <TabsTrigger value="manual" className="rounded-lg px-4">
                수동 연결
              </TabsTrigger>
            </TabsList>

            <TabsContent value="auto" className="mt-4 space-y-3">
              <div className="flex flex-wrap justify-end gap-1.5">
                {FILTERS.map((f) => (
                  <CreditFilterChip
                    key={f.value || "all"}
                    active={txStatusFilter === f.value}
                    onClick={() => applyFilter(f.value)}
                  >
                    {f.label}
                  </CreditFilterChip>
                ))}
              </div>

              {loadingTransactions && bankTransactions.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  불러오는 중…
                </div>
              ) : bankTransactions.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  입금 내역이 없습니다.
                </div>
              ) : (
                <div
                  ref={txScrollRef}
                  className="overflow-x-auto rounded-2xl border border-slate-200/80"
                >
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>상태</TableHead>
                        <TableHead>입금코드</TableHead>
                        <TableHead className="text-right">금액</TableHead>
                        <TableHead>입금자</TableHead>
                        <TableHead>발생</TableHead>
                        <TableHead>매칭</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bankTransactions.map((tx) => (
                        <TableRow key={tx._id}>
                          <TableCell>{getStatusBadge(tx.status)}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {tx.depositCode || "-"}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {tx.tranAmt.toLocaleString()}원
                          </TableCell>
                          <TableCell>{tx.printedContent}</TableCell>
                          <TableCell className="text-sm">
                            {formatDate(tx.occurredAt)}
                          </TableCell>
                          <TableCell className="text-sm">
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

            <TabsContent value="manual" className="mt-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/40 p-4">
                  <div className="text-sm font-semibold text-slate-900">
                    미매칭 입금
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    자동 매칭 실패 건만 선택하세요.
                  </p>
                  <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                    {loadingTransactions ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">
                        불러오는 중…
                      </div>
                    ) : (
                      bankTransactions
                        .filter((tx) => tx.status === "NEW")
                        .map((tx) => (
                          <button
                            key={tx._id}
                            type="button"
                            onClick={() => setSelectedTx(tx)}
                            className={cn(
                              "w-full rounded-xl border p-3 text-left transition-colors",
                              selectedTx?._id === tx._id
                                ? "border-primary bg-primary/5"
                                : "border-slate-200 bg-white hover:bg-slate-50",
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate font-medium">
                                  {tx.printedContent}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {tx.depositCode || "코드 없음"}
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="font-semibold tabular-nums">
                                  {tx.tranAmt.toLocaleString()}원
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {formatDate(tx.occurredAt)}
                                </div>
                              </div>
                            </div>
                          </button>
                        ))
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/40 p-4">
                  <div className="text-sm font-semibold text-slate-900">
                    대기 충전 주문
                  </div>
                  <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                    {loadingOrders ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">
                        불러오는 중…
                      </div>
                    ) : (
                      chargeOrders
                        .filter((order) => order.status === "PENDING")
                        .map((order) => (
                          <button
                            key={order._id}
                            type="button"
                            onClick={() => setSelectedOrder(order)}
                            className={cn(
                              "w-full rounded-xl border p-3 text-left transition-colors",
                              selectedOrder?._id === order._id
                                ? "border-primary bg-primary/5"
                                : "border-slate-200 bg-white hover:bg-slate-50",
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-mono text-sm font-medium">
                                  {order.depositCode}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  공급가 {order.supplyAmount.toLocaleString()}원
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-semibold tabular-nums">
                                  {order.amountTotal.toLocaleString()}원
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {formatDate(order.createdAt)}
                                </div>
                              </div>
                            </div>
                          </button>
                        ))
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white p-5">
                <div className="text-sm font-semibold text-slate-900">
                  수동 연결
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  금액·코드 불일치는 기본적으로 막힙니다. 예외 허용 시에만 강제
                  연결됩니다.
                </p>

                {selectedTx && selectedOrder ? (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl bg-slate-50 p-3 text-sm">
                        <div className="text-xs text-muted-foreground">입금</div>
                        <div className="mt-1 font-medium">
                          {selectedTx.printedContent}
                        </div>
                        <div className="tabular-nums text-muted-foreground">
                          {selectedTx.tranAmt.toLocaleString()}원 ·{" "}
                          {selectedTx.depositCode || "코드 없음"}
                        </div>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3 text-sm">
                        <div className="text-xs text-muted-foreground">주문</div>
                        <div className="mt-1 font-mono font-medium">
                          {selectedOrder.depositCode}
                        </div>
                        <div className="tabular-nums text-muted-foreground">
                          {selectedOrder.amountTotal.toLocaleString()}원
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="match-note">메모</Label>
                      <Input
                        id="match-note"
                        className="h-10 rounded-xl"
                        value={matchNote}
                        onChange={(e) => setMatchNote(e.target.value)}
                        placeholder="(선택)"
                      />
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        id="match-force"
                        checked={matchForce}
                        onChange={(e) => setMatchForce(e.target.checked)}
                        className="rounded"
                      />
                      예외 허용 (금액/코드 불일치)
                    </label>

                    <Button
                      onClick={handleManualMatch}
                      disabled={matching}
                      className="h-11 w-full rounded-xl"
                    >
                      {matching ? "연결 중…" : "연결 실행"}
                    </Button>
                  </div>
                ) : (
                  <div className="mt-6 py-6 text-center text-sm text-muted-foreground">
                    입금과 주문을 각각 선택하세요.
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </CreditPanel>
    </TabsContent>
  );
}
