// change-log:
// - 2026-09-05: 관리자 무료크레딧 수동 지급 UI 복원(가입 환영 자동 지급은 유지 폐지).
// - 2026-08-13: 일반/배송 무료크레딧 통합 — 단일 지급 UI, 문구·스타일 정리.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/admin/credits/components/RequestorCreditTab.tsx
// - web/frontend/src/pages/admin/credits/creditPageUi.tsx
import { Gift, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { TabsContent } from "@/components/ui/tabs";
import { cn } from "@/shared/ui/cn";
import type {
  FreeCreditGrantHistoryRow,
  BusinessCredit,
  FreeCreditAmount,
} from "../adminCredit.types";
import { formatBusinessSelectLabel, formatDate } from "../adminCredit.utils";
import {
  CreditFilterChip,
  CreditPanel,
  CreditSectionHeader,
} from "../creditPageUi";

type FreeCreditMenu = "grant" | "grant-cancel" | "grant-history" | "usage-history";

type RequestorFreeCreditTabProps = {
  businesses: BusinessCredit[];
  selectedFreeCreditBusinessAnchorId: string;
  setSelectedFreeCreditBusinessAnchorId: (value: string) => void;
  freeCreditGrantSearch: string;
  setFreeCreditGrantSearch: (value: string) => void;
  loadFreeCreditGrantHistory: () => void | Promise<void>;
  loadingFreeCreditGrantRows: boolean;
  freeCreditMenu: FreeCreditMenu;
  setFreeCreditMenu: (value: FreeCreditMenu) => void;
  selectedFreeCreditAmount: FreeCreditAmount;
  setSelectedFreeCreditAmount: (value: FreeCreditAmount) => void;
  freeCreditReason: string;
  setFreeCreditReason: (value: string) => void;
  handleGrantFreeCredit: () => void | Promise<void>;
  grantingFreeCredit: boolean;
  selectedFreeCreditBusiness: BusinessCredit | null;
  cancelStartDate: string;
  setCancelStartDate: (value: string) => void;
  cancelEndDate: string;
  setCancelEndDate: (value: string) => void;
  setCancelSkip: (value: number) => void;
  setFreeCreditGrantRows: (
    value:
      | FreeCreditGrantHistoryRow[]
      | ((prev: FreeCreditGrantHistoryRow[]) => FreeCreditGrantHistoryRow[]),
  ) => void;
  setCancelHasMore: (value: boolean) => void;
  filteredFreeCreditGrantRows: FreeCreditGrantHistoryRow[];
  selectedCancelGrantId: string;
  setSelectedCancelGrantId: (value: string) => void;
  cancelHasMore: boolean;
  loadMoreCancelGrants: () => void | Promise<void>;
  cancelGrantReason: string;
  setCancelGrantReason: (value: string) => void;
  handleCancelFreeCredit: () => void | Promise<void>;
  cancelingGrant: boolean;
  freeCreditGrantRows: FreeCreditGrantHistoryRow[];
  filteredFreeCreditUsageRows: BusinessCredit[];
};

const FREE_CREDIT_AMOUNTS: FreeCreditAmount[] = [
  7000, 30000, 50000, 300000, 500000,
];

function getFreeBalance(business: BusinessCredit) {
  const freeCredit = Number(business.freeCredit ?? NaN);
  if (Number.isFinite(freeCredit)) return freeCredit;
  const freeBalance = Number(business.freeBalance ?? NaN);
  if (Number.isFinite(freeBalance)) return freeBalance;
  return (
    Number(business.freeRequestCredit ?? 0) +
    Number(business.freeShippingCredit ?? 0)
  );
}

function getSpentFreeTotal(business: BusinessCredit) {
  const spentFreeAmount = Number(business.spentFreeAmount ?? 0);
  if (spentFreeAmount > 0) return spentFreeAmount;
  return (
    Number(business.spentFreeRequestAmount ?? 0) +
    Number(business.spentFreeShippingAmount ?? 0)
  );
}

function getChargedFreeTotal(business: BusinessCredit) {
  const chargedFreeAmount = Number(business.chargedFreeAmount ?? 0);
  if (chargedFreeAmount > 0) return chargedFreeAmount;
  return (
    Number(business.chargedFreeRequestAmount ?? 0) +
    Number(business.chargedFreeShippingAmount ?? 0)
  );
}

export function RequestorFreeCreditTab(props: RequestorFreeCreditTabProps) {
  const {
    businesses,
    selectedFreeCreditBusinessAnchorId,
    setSelectedFreeCreditBusinessAnchorId,
    freeCreditGrantSearch,
    setFreeCreditGrantSearch,
    loadFreeCreditGrantHistory,
    loadingFreeCreditGrantRows,
    freeCreditMenu,
    setFreeCreditMenu,
    selectedFreeCreditAmount,
    setSelectedFreeCreditAmount,
    freeCreditReason,
    setFreeCreditReason,
    handleGrantFreeCredit,
    grantingFreeCredit,
    selectedFreeCreditBusiness,
    cancelStartDate,
    setCancelStartDate,
    cancelEndDate,
    setCancelEndDate,
    setCancelSkip,
    setFreeCreditGrantRows,
    setCancelHasMore,
    filteredFreeCreditGrantRows,
    selectedCancelGrantId,
    setSelectedCancelGrantId,
    cancelHasMore,
    loadMoreCancelGrants,
    cancelGrantReason,
    setCancelGrantReason,
    handleCancelFreeCredit,
    cancelingGrant,
    freeCreditGrantRows,
    filteredFreeCreditUsageRows,
  } = props;

  const eligibleBusinesses = businesses.filter((business) => {
    if (typeof business.isFreeCreditEligible === "boolean") {
      return business.isFreeCreditEligible;
    }
    return String(business.businessType || "").trim() === "requestor";
  });

  const menuItems: { id: FreeCreditMenu; label: string }[] = [
    { id: "grant", label: "지급" },
    { id: "grant-cancel", label: "회수" },
    { id: "grant-history", label: "지급 내역" },
    { id: "usage-history", label: "사용 현황" },
  ];

  return (
    <TabsContent value="free-credit" className="space-y-4">
      <CreditPanel>
        <div className="space-y-5 p-5 sm:p-6">
          <CreditSectionHeader
            icon={Gift}
            title="무료 크레딧"
            description="의뢰·배송 구분 없이 하나의 무료 잔액으로 지급·회수합니다."
            trailing={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-xl"
                onClick={loadFreeCreditGrantHistory}
                disabled={loadingFreeCreditGrantRows}
              >
                <RefreshCw
                  className={cn(
                    "mr-1.5 h-3.5 w-3.5",
                    loadingFreeCreditGrantRows && "animate-spin",
                  )}
                />
                새로고침
              </Button>
            }
          />

          <div className="flex flex-wrap items-center gap-2">
            {menuItems.map((item) => (
              <CreditFilterChip
                key={item.id}
                active={freeCreditMenu === item.id}
                onClick={() => setFreeCreditMenu(item.id)}
              >
                {item.label}
              </CreditFilterChip>
            ))}
            <Input
              className="h-8 w-52 rounded-full border-slate-200 text-sm"
              value={freeCreditGrantSearch}
              onChange={(e) => setFreeCreditGrantSearch(e.target.value)}
              placeholder="사업자번호 · 사유 검색"
            />
          </div>

          <div className="max-w-xl space-y-2">
            <Label htmlFor="free-credit-business" className="text-sm">
              대상 사업자
            </Label>
            <select
              id="free-credit-business"
              className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50/60 px-3 text-sm"
              value={selectedFreeCreditBusinessAnchorId}
              onChange={(e) =>
                setSelectedFreeCreditBusinessAnchorId(e.target.value)
              }
            >
              <option value="">전체 사업자</option>
              {[...eligibleBusinesses]
                .sort((a, b) =>
                  String(a.name || "").localeCompare(String(b.name || ""), "ko"),
                )
                .map((business) => (
                  <option key={business._id} value={business._id}>
                    {formatBusinessSelectLabel(business)}
                  </option>
                ))}
            </select>
          </div>

          {freeCreditMenu === "grant" ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
              <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-slate-50/40 p-5">
                <div className="space-y-2">
                  <Label>금액</Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {FREE_CREDIT_AMOUNTS.map((amount) => (
                      <Button
                        key={amount}
                        type="button"
                        className="h-11 rounded-xl"
                        variant={
                          selectedFreeCreditAmount === amount
                            ? "default"
                            : "outline"
                        }
                        onClick={() => setSelectedFreeCreditAmount(amount)}
                      >
                        {amount.toLocaleString()}원
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="free-credit-reason">지급 사유</Label>
                  <Input
                    id="free-credit-reason"
                    className="h-11 rounded-xl bg-white"
                    value={freeCreditReason}
                    onChange={(e) => setFreeCreditReason(e.target.value)}
                    placeholder="예: CS 보상, 운영 정책"
                  />
                </div>

                <Button
                  className="h-11 w-full rounded-xl"
                  onClick={handleGrantFreeCredit}
                  disabled={
                    grantingFreeCredit || !selectedFreeCreditBusinessAnchorId
                  }
                >
                  {grantingFreeCredit ? "지급 중…" : "무료 크레딧 지급"}
                </Button>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white p-5">
                <div className="text-sm font-semibold text-slate-900">요약</div>
                <div className="mt-3 space-y-2.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">사업자</span>
                    <span className="text-right font-medium">
                      {selectedFreeCreditBusiness?.name || "미선택"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">사업자번호</span>
                    <span className="font-mono text-xs">
                      {selectedFreeCreditBusiness?.businessNumber || "-"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">금액</span>
                    <span className="font-semibold text-primary">
                      {selectedFreeCreditAmount.toLocaleString()}원
                    </span>
                  </div>
                </div>
                <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                  지급 즉시 무료 잔액에 반영되며, 의뢰·배송 어디서든 사용할 수
                  있습니다.
                </p>
              </div>
            </div>
          ) : freeCreditMenu === "grant-cancel" ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/40 p-5">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="cancel-start-date" className="text-xs">
                      시작일
                    </Label>
                    <Input
                      id="cancel-start-date"
                      type="date"
                      className="h-10 rounded-xl text-sm"
                      value={cancelStartDate}
                      onChange={(e) => {
                        setCancelStartDate(e.target.value);
                        setCancelSkip(0);
                        setFreeCreditGrantRows([]);
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
                      className="h-10 rounded-xl text-sm"
                      value={cancelEndDate}
                      onChange={(e) => {
                        setCancelEndDate(e.target.value);
                        setCancelSkip(0);
                        setFreeCreditGrantRows([]);
                        setCancelHasMore(true);
                      }}
                    />
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/80 bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[64px]">선택</TableHead>
                        <TableHead>지급일시</TableHead>
                        <TableHead>사업자번호</TableHead>
                        <TableHead className="text-right">금액</TableHead>
                        <TableHead className="w-[72px]">상태</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredFreeCreditGrantRows
                        .filter((row) => !row.canceledAt)
                        .map((row) => (
                          <TableRow
                            key={row._id}
                            className={cn(
                              "cursor-pointer",
                              selectedCancelGrantId === String(row._id) &&
                                "bg-primary/10",
                            )}
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
                            <TableCell className="text-right font-medium tabular-nums">
                              {Number(row.amount || 0).toLocaleString()}원
                            </TableCell>
                            <TableCell className="text-xs">
                              {row.hasSpent ? (
                                <span className="font-medium text-accent-strong">
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

                {cancelHasMore ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 h-10 w-full rounded-xl"
                    onClick={loadMoreCancelGrants}
                    disabled={loadingFreeCreditGrantRows}
                  >
                    {loadingFreeCreditGrantRows
                      ? "불러오는 중…"
                      : "이전 내역 더보기"}
                  </Button>
                ) : null}
              </div>

              <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5">
                <div className="space-y-2">
                  <Label htmlFor="cancel-reason">회수 사유</Label>
                  <Input
                    id="cancel-reason"
                    className="h-11 rounded-xl"
                    value={cancelGrantReason}
                    onChange={(e) => setCancelGrantReason(e.target.value)}
                    placeholder="예: 중복 지급, 오류 수정"
                  />
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">선택</span>
                    <span className="font-medium">
                      {selectedCancelGrantId ? "1건" : "미선택"}
                    </span>
                  </div>
                  {selectedCancelGrantId ? (
                    <div className="mt-1.5 flex justify-between gap-2">
                      <span className="text-muted-foreground">금액</span>
                      <span className="font-semibold tabular-nums text-primary">
                        {Number(
                          freeCreditGrantRows.find(
                            (r) => String(r._id) === selectedCancelGrantId,
                          )?.amount || 0,
                        ).toLocaleString()}
                        원
                      </span>
                    </div>
                  ) : null}
                </div>
                <Button
                  className="h-11 w-full rounded-xl"
                  onClick={handleCancelFreeCredit}
                  disabled={
                    cancelingGrant ||
                    !selectedCancelGrantId ||
                    !cancelGrantReason.trim()
                  }
                >
                  {cancelingGrant ? "회수 중…" : "지급 회수"}
                </Button>
              </div>
            </div>
          ) : freeCreditMenu === "grant-history" ? (
            loadingFreeCreditGrantRows ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                불러오는 중…
              </div>
            ) : filteredFreeCreditGrantRows.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                지급 내역이 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>지급일시</TableHead>
                      <TableHead>사업자번호</TableHead>
                      <TableHead className="text-right">금액</TableHead>
                      <TableHead>구분</TableHead>
                      <TableHead>사유</TableHead>
                      <TableHead className="text-right">회수</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredFreeCreditGrantRows.map((row) => (
                      <TableRow key={row._id}>
                        <TableCell>{formatDate(row.createdAt)}</TableCell>
                        <TableCell className="font-mono">
                          {row.businessNumber || "-"}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {Number(row.amount || 0).toLocaleString()}원
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              row.isOverride || row.source === "admin"
                                ? "default"
                                : "outline"
                            }
                          >
                            {row.source === "admin"
                              ? "관리자"
                              : "자동"}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate text-sm">
                          {String(row.overrideReason || "").trim() || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg"
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
            <div className="py-10 text-center text-sm text-muted-foreground">
              사용 내역이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>사업자</TableHead>
                    <TableHead>사업자번호</TableHead>
                    <TableHead className="text-right">사용</TableHead>
                    <TableHead className="text-right">잔여</TableHead>
                    <TableHead className="text-right">충전</TableHead>
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
                      <TableCell className="text-right font-medium tabular-nums">
                        {getSpentFreeTotal(org).toLocaleString()}원
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {getFreeBalance(org).toLocaleString()}원
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {getChargedFreeTotal(org).toLocaleString()}원
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CreditPanel>
    </TabsContent>
  );
}
