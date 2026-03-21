import { Badge } from "@/components/ui/badge";
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
import { TabsContent } from "@/components/ui/tabs";
import type {
  BonusGrantHistoryRow,
  BusinessCredit,
  FreeCreditAmount,
} from "../adminCredit.types";
import { formatBusinessSelectLabel, formatDate } from "../adminCredit.utils";

type RequestorFreeCreditTabProps = {
  businesses: BusinessCredit[];
  selectedBonusBusinessAnchorId: string;
  setSelectedBonusBusinessAnchorId: (value: string) => void;
  bonusGrantSearch: string;
  setBonusGrantSearch: (value: string) => void;
  loadBonusGrantHistory: () => void | Promise<void>;
  loadingBonusGrantRows: boolean;
  freeCreditMenu:
    | "grant"
    | "grant-cancel"
    | "grant-history"
    | "usage-history"
    | "shipping-credit";
  setFreeCreditMenu: (
    value:
      | "grant"
      | "grant-cancel"
      | "grant-history"
      | "usage-history"
      | "shipping-credit",
  ) => void;
  grantCreditType: "general" | "shipping";
  setGrantCreditType: (value: "general" | "shipping") => void;
  selectedShippingCreditBusinessAnchorId: string;
  setSelectedShippingCreditBusinessAnchorId: (value: string) => void;
  selectedBonusAmount: FreeCreditAmount;
  setSelectedBonusAmount: (value: FreeCreditAmount) => void;
  selectedShippingCreditAmount: number;
  setSelectedShippingCreditAmount: (value: number) => void;
  bonusReason: string;
  setBonusReason: (value: string) => void;
  shippingCreditReason: string;
  setShippingCreditReason: (value: string) => void;
  handleGrantFreeCredit: () => void | Promise<void>;
  handleGrantShippingCredit: () => void | Promise<void>;
  grantingBonus: boolean;
  grantingShippingCredit: boolean;
  selectedBonusBusiness: BusinessCredit | null;
  selectedShippingCreditBusiness: BusinessCredit | null;
  cancelStartDate: string;
  setCancelStartDate: (value: string) => void;
  cancelEndDate: string;
  setCancelEndDate: (value: string) => void;
  setCancelSkip: (value: number) => void;
  setBonusGrantRows: (
    value:
      | BonusGrantHistoryRow[]
      | ((prev: BonusGrantHistoryRow[]) => BonusGrantHistoryRow[]),
  ) => void;
  setCancelHasMore: (value: boolean) => void;
  filteredBonusGrantRows: BonusGrantHistoryRow[];
  selectedCancelGrantId: string;
  setSelectedCancelGrantId: (value: string) => void;
  cancelHasMore: boolean;
  loadMoreCancelGrants: () => void | Promise<void>;
  cancelGrantReason: string;
  setCancelGrantReason: (value: string) => void;
  handleCancelFreeCredit: () => void | Promise<void>;
  cancelingGrant: boolean;
  bonusGrantRows: BonusGrantHistoryRow[];
  filteredFreeCreditUsageRows: BusinessCredit[];
};

export function RequestorFreeCreditTab(props: RequestorFreeCreditTabProps) {
  const {
    businesses,
    selectedBonusBusinessAnchorId,
    setSelectedBonusBusinessAnchorId,
    bonusGrantSearch,
    setBonusGrantSearch,
    loadBonusGrantHistory,
    loadingBonusGrantRows,
    freeCreditMenu,
    setFreeCreditMenu,
    grantCreditType,
    setGrantCreditType,
    selectedShippingCreditBusinessAnchorId,
    setSelectedShippingCreditBusinessAnchorId,
    selectedBonusAmount,
    setSelectedBonusAmount,
    selectedShippingCreditAmount,
    setSelectedShippingCreditAmount,
    bonusReason,
    setBonusReason,
    shippingCreditReason,
    setShippingCreditReason,
    handleGrantFreeCredit,
    handleGrantShippingCredit,
    grantingBonus,
    grantingShippingCredit,
    selectedBonusBusiness,
    selectedShippingCreditBusiness,
    cancelStartDate,
    setCancelStartDate,
    cancelEndDate,
    setCancelEndDate,
    setCancelSkip,
    setBonusGrantRows,
    setCancelHasMore,
    filteredBonusGrantRows,
    selectedCancelGrantId,
    setSelectedCancelGrantId,
    cancelHasMore,
    loadMoreCancelGrants,
    cancelGrantReason,
    setCancelGrantReason,
    handleCancelFreeCredit,
    cancelingGrant,
    bonusGrantRows,
    filteredFreeCreditUsageRows,
  } = props;
  const eligibleBusinesses = businesses.filter(
    (business) => String(business.businessType || "").trim() === "requestor",
  );

  return (
    <TabsContent value="free-credit" className="space-y-4">
      <Card>
        <CardHeader className="space-y-4">
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <CardTitle>무료 크레딧</CardTitle>
              <CardDescription>
                대상 사업자를 선택하고 지급, 지급 내역, 사용 내역을 메뉴별로
                확인합니다.
              </CardDescription>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
              <div className="space-y-2">
                <Label htmlFor="free-credit-business" className="text-sm">
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
                    <option value="">의뢰자 사업자 전체</option>
                    {[...eligibleBusinesses]
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
                  {loadingBonusGrantRows ? "새로고침 중..." : "새로고침"}
                </Button>
              </div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              무료 크레딧은 의뢰자 사업자에게만 지급할 수 있습니다.
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              type="button"
              variant={freeCreditMenu === "grant" ? "default" : "outline"}
              onClick={() => setFreeCreditMenu("grant")}
              size="sm"
            >
              지급
            </Button>
            <Button
              type="button"
              variant={
                freeCreditMenu === "grant-cancel" ? "default" : "outline"
              }
              onClick={() => setFreeCreditMenu("grant-cancel")}
              size="sm"
            >
              지급 취소
            </Button>
            <Button
              type="button"
              variant={
                freeCreditMenu === "grant-history" ? "default" : "outline"
              }
              onClick={() => setFreeCreditMenu("grant-history")}
              size="sm"
            >
              지급 내역
            </Button>
            <Button
              type="button"
              variant={
                freeCreditMenu === "usage-history" ? "default" : "outline"
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
                        if (grantCreditType === "general")
                          setSelectedBonusBusinessAnchorId(e.target.value);
                        else
                          setSelectedShippingCreditBusinessAnchorId(
                            e.target.value,
                          );
                      }}
                    >
                      <option value="">의뢰자 사업자 선택</option>
                      {[...eligibleBusinesses]
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
                  <Label>크레딧 종류</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      type="button"
                      className="h-11"
                      variant={
                        grantCreditType === "general" ? "default" : "outline"
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
                        grantCreditType === "shipping" ? "default" : "outline"
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
                            if (grantCreditType === "general")
                              setSelectedBonusAmount(
                                amount as FreeCreditAmount,
                              );
                            else setSelectedShippingCreditAmount(amount);
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
                        if (grantCreditType === "general")
                          setBonusReason(e.target.value);
                        else setShippingCreditReason(e.target.value);
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
                        ? grantingBonus || !selectedBonusBusinessAnchorId
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
                            : selectedShippingCreditBusiness?.name || "미선택"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">
                          사업자번호
                        </span>
                        <span className="font-mono">
                          {grantCreditType === "general"
                            ? selectedBonusBusiness?.businessNumber || "-"
                            : selectedShippingCreditBusiness?.businessNumber ||
                              "-"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">사업자 ID</span>
                        <span className="font-mono text-xs">
                          {grantCreditType === "general"
                            ? selectedBonusBusiness?.businessAnchorId || "-"
                            : selectedShippingCreditBusiness?.businessAnchorId ||
                              "-"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">지급 금액</span>
                        <span
                          className={`font-semibold ${grantCreditType === "general" ? "text-primary" : "text-amber-600"}`}
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
                    className={`rounded-xl border p-5 ${grantCreditType === "general" ? "border-primary/20 bg-primary/5" : "border-amber-200/30 bg-amber-50/50"}`}
                  >
                    <div className="text-sm font-medium">지급 안내</div>
                    <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                      {grantCreditType === "general" ? (
                        <>
                          <div>
                            선택한 사업자에 즉시 무료 크레딧이 반영됩니다.
                          </div>
                          <div>
                            지급 사유는 운영 로그와 지급 내역에 함께 기록됩니다.
                          </div>
                          <div>
                            내역 메뉴에서 지급 기록과 사용 기록을 바로 확인할 수
                            있습니다.
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            배송비 무료 크레딧은 배송비 결제 시에만 사용됩니다.
                          </div>
                          <div>
                            의뢰 비용이나 다른 수수료로는 사용할 수 없습니다.
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
                <div className="text-sm font-medium">취소 가능 지급 내역</div>
                <div className="mt-4 space-y-3">
                  <div className="grid gap-2 grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="cancel-start-date" className="text-xs">
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
                      <Label htmlFor="cancel-end-date" className="text-xs">
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

                <div className="mt-4 overflow-x-auto max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">선택</TableHead>
                        <TableHead>지급일시</TableHead>
                        <TableHead>사업자번호</TableHead>
                        <TableHead className="text-right">금액</TableHead>
                        <TableHead className="w-[60px]">상태</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBonusGrantRows
                        .filter((row) => !row.canceledAt)
                        .map((row) => (
                          <TableRow
                            key={row._id}
                            className={`cursor-pointer ${selectedCancelGrantId === String(row._id) ? "bg-primary/10" : ""}`}
                            onClick={() =>
                              setSelectedCancelGrantId(String(row._id))
                            }
                          >
                            <TableCell>
                              <input
                                type="radio"
                                name="cancel-grant"
                                checked={
                                  selectedCancelGrantId === String(row._id)
                                }
                                onChange={() =>
                                  setSelectedCancelGrantId(String(row._id))
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
                              {Number(row.amount || 0).toLocaleString()}원
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
                    onChange={(e) => setCancelGrantReason(e.target.value)}
                    placeholder="예: 중복 지급, 사용자 요청, 오류 수정"
                  />
                </div>

                <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                  <div className="text-xs font-medium">선택 정보</div>
                  <div className="mt-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">선택 건</span>
                      <span className="font-mono">
                        {selectedCancelGrantId ? "1건" : "미선택"}
                      </span>
                    </div>
                    {selectedCancelGrantId && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">취소 금액</span>
                        <span className="font-semibold text-primary">
                          {Number(
                            bonusGrantRows.find(
                              (r) => String(r._id) === selectedCancelGrantId,
                            )?.amount || 0,
                          ).toLocaleString()}
                          원
                        </span>
                      </div>
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
                      <TableHead className="w-[100px] whitespace-nowrap text-right">
                        회수
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBonusGrantRows.map((row) => (
                      <TableRow key={row._id}>
                        <TableCell>{formatDate(row.createdAt)}</TableCell>
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
                          {String(row.overrideReason || "").trim() || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            disabled={Boolean(row.canceledAt)}
                            onClick={() => {
                              setSelectedCancelGrantId(String(row._id));
                              setCancelGrantReason("");
                              setFreeCreditMenu("grant-cancel");
                            }}
                          >
                            {row.canceledAt ? "회수됨" : "회수"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
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
                        <div className="font-medium">{org.name || "-"}</div>
                        <div className="text-xs text-muted-foreground">
                          {org.companyName || "-"}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">
                        {org.businessNumber || "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {Number(org.spentBonusAmount || 0).toLocaleString()}원
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(org.bonusBalance || 0).toLocaleString()}원
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(org.chargedBonusAmount || 0).toLocaleString()}원
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
  );
}
