import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import type { BankTransaction, ChargeOrder } from "../adminCredit.types";
import { formatDate, getStatusBadge } from "../adminCredit.utils";

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

  return (
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
                  variant={txStatusFilter === "" ? "default" : "outline"}
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
                  variant={txStatusFilter === "NEW" ? "default" : "outline"}
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
                  variant={txStatusFilter === "MATCHED" ? "default" : "outline"}
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
                      기본은 자동 매칭입니다. 자동 매칭이 실패한 케이스만
                      예외적으로 수동 연결하세요.
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
                              className={`rounded-lg border p-3 cursor-pointer transition-colors ${selectedTx?._id === tx._id ? "border-primary bg-primary/5" : "hover:bg-gray-50"}`}
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
                              className={`rounded-lg border p-3 cursor-pointer transition-colors ${selectedOrder?._id === order._id ? "border-primary bg-primary/5" : "hover:bg-gray-50"}`}
                              onClick={() => setSelectedOrder(order)}
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <div className="font-medium font-mono">
                                    {order.depositCode}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    공급가:{" "}
                                    {order.supplyAmount.toLocaleString()}원
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
                  <CardTitle>수동 연결 실행</CardTitle>
                  <CardDescription>
                    입금 내역과 충전 주문을 직접 연결합니다. 금액/코드가
                    불일치하면 기본적으로 막히며, 예외 허용을 켜면 강제 연결할
                    수 있습니다.
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
                              금액: {selectedOrder.amountTotal.toLocaleString()}
                              원
                            </div>
                            <div className="text-sm text-muted-foreground">
                              생성: {formatDate(selectedOrder.createdAt)}
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
                          onChange={(e) => setMatchForce(e.target.checked)}
                          className="rounded"
                        />
                        <Label htmlFor="match-force" className="cursor-pointer">
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
  );
}
