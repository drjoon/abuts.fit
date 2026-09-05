// change-log:
// - 2026-09-05: 사용 현황 단일 화면 — 행별 지급/회수·내역 모달, 상단 필터 UI 제거.
// - 2026-09-05: 사용 현황 테이블 헤더 중앙 정렬·클릭 정렬.
// - 2026-09-05: 사용 현황 행에서 금액 드롭다운 원클릭 지급.
// - 2026-09-05: 관리자 무료크레딧 수동 지급 UI 복원(가입 환영 자동 지급은 유지 폐지).
// - 2026-08-13: 일반/배송 무료크레딧 통합 — 단일 지급 UI, 문구·스타일 정리.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/admin/credits/components/RequestorCreditTab.tsx
// - web/frontend/src/pages/admin/credits/creditPageUi.tsx
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Gift } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { formatDate } from "../adminCredit.utils";
import { CreditPanel, CreditSectionHeader } from "../creditPageUi";

type UsageSortKey =
  | "name"
  | "businessNumber"
  | "spent"
  | "remaining"
  | "charged";
type SortDirection = "asc" | "desc";

type GrantFreeCreditOptions = {
  businessAnchorId?: string;
  amount?: FreeCreditAmount;
  reason?: string;
};

type RequestorFreeCreditTabProps = {
  loadFreeCreditGrantHistory: (options?: {
    businessNumber?: string;
  }) => void | Promise<void>;
  loadingFreeCreditGrantRows: boolean;
  handleGrantFreeCredit: (options?: GrantFreeCreditOptions) => void | Promise<void>;
  grantingFreeCredit: boolean;
  freeCreditGrantRows: FreeCreditGrantHistoryRow[];
  handleCancelFreeCredit: (options?: {
    grantId?: string;
    reason?: string;
  }) => boolean | Promise<boolean>;
  cancelingGrant: boolean;
  filteredFreeCreditUsageRows: BusinessCredit[];
};

const FREE_CREDIT_AMOUNTS: FreeCreditAmount[] = [
  30000, 70000, 100000, 300000, 500000,
];

function normalizeDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

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

function UsageSortIcon({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) {
  if (!active) {
    return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />;
  }
  return direction === "asc" ? (
    <ArrowUp className="h-3.5 w-3.5 text-foreground" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5 text-foreground" />
  );
}

export function RequestorFreeCreditTab(props: RequestorFreeCreditTabProps) {
  const {
    loadFreeCreditGrantHistory,
    loadingFreeCreditGrantRows,
    handleGrantFreeCredit,
    grantingFreeCredit,
    freeCreditGrantRows,
    handleCancelFreeCredit,
    cancelingGrant,
    filteredFreeCreditUsageRows,
  } = props;

  const [usageSort, setUsageSort] = useState<{
    key: UsageSortKey;
    direction: SortDirection;
  }>({ key: "remaining", direction: "asc" });

  const [historyBusiness, setHistoryBusiness] = useState<BusinessCredit | null>(
    null,
  );
  const [cancelBusiness, setCancelBusiness] = useState<BusinessCredit | null>(
    null,
  );
  const [cancelGrantId, setCancelGrantId] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const toggleUsageSort = (key: UsageSortKey) => {
    setUsageSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : {
            key,
            direction:
              key === "name" || key === "businessNumber" ? "asc" : "desc",
          },
    );
  };

  const sortedUsageRows = useMemo(() => {
    const rows = [...filteredFreeCreditUsageRows];
    const dir = usageSort.direction === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (usageSort.key === "name") {
        return (
          dir *
          String(a.name || "").localeCompare(String(b.name || ""), "ko")
        );
      }
      if (usageSort.key === "businessNumber") {
        return (
          dir *
          String(a.businessNumber || "").localeCompare(
            String(b.businessNumber || ""),
            "ko",
          )
        );
      }
      if (usageSort.key === "spent") {
        return dir * (getSpentFreeTotal(a) - getSpentFreeTotal(b));
      }
      if (usageSort.key === "charged") {
        return dir * (getChargedFreeTotal(a) - getChargedFreeTotal(b));
      }
      return dir * (getFreeBalance(a) - getFreeBalance(b));
    });
    return rows;
  }, [filteredFreeCreditUsageRows, usageSort]);

  const historyRows = useMemo(() => {
    if (!historyBusiness) return [];
    const digits = normalizeDigits(String(historyBusiness.businessNumber || ""));
    if (!digits) return [];
    return freeCreditGrantRows.filter(
      (row) => normalizeDigits(String(row.businessNumber || "")) === digits,
    );
  }, [historyBusiness, freeCreditGrantRows]);

  const cancelCandidates = useMemo(() => {
    if (!cancelBusiness) return [];
    const digits = normalizeDigits(String(cancelBusiness.businessNumber || ""));
    if (!digits) return [];
    return freeCreditGrantRows.filter(
      (row) =>
        normalizeDigits(String(row.businessNumber || "")) === digits &&
        !row.canceledAt,
    );
  }, [cancelBusiness, freeCreditGrantRows]);

  useEffect(() => {
    if (!cancelBusiness || cancelGrantId) return;
    if (cancelCandidates.length === 1) {
      setCancelGrantId(String(cancelCandidates[0]._id));
    }
  }, [cancelBusiness, cancelCandidates, cancelGrantId]);

  const openHistory = async (business: BusinessCredit) => {
    setHistoryBusiness(business);
    await loadFreeCreditGrantHistory({
      businessNumber: String(business.businessNumber || ""),
    });
  };

  const openCancel = async (business: BusinessCredit) => {
    setCancelBusiness(business);
    setCancelGrantId("");
    setCancelReason("");
    await loadFreeCreditGrantHistory({
      businessNumber: String(business.businessNumber || ""),
    });
  };

  const closeCancel = () => {
    setCancelBusiness(null);
    setCancelGrantId("");
    setCancelReason("");
  };

  return (
    <TabsContent value="free-credit" className="space-y-4">
      <CreditPanel>
        <div className="space-y-5 p-5 sm:p-6">
          <CreditSectionHeader icon={Gift} title="무료 크레딧" />

          {filteredFreeCreditUsageRows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              지급 가능한 사업자가 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {(
                      [
                        { key: "name", label: "사업자" },
                        { key: "businessNumber", label: "사업자번호" },
                        { key: "spent", label: "사용" },
                        { key: "remaining", label: "잔여" },
                        { key: "charged", label: "충전" },
                      ] as const
                    ).map((col) => (
                      <TableHead key={col.key} className="text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                          onClick={() => toggleUsageSort(col.key)}
                        >
                          {col.label}
                          <UsageSortIcon
                            active={usageSort.key === col.key}
                            direction={usageSort.direction}
                          />
                        </button>
                      </TableHead>
                    ))}
                    <TableHead className="w-[220px] text-center">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedUsageRows.map((org) => {
                    const remaining = getFreeBalance(org);
                    return (
                      <TableRow key={org._id}>
                        <TableCell className="text-center">
                          <div className="font-medium">{org.name || "-"}</div>
                          <div className="text-xs text-muted-foreground">
                            {org.companyName || "-"}
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-mono">
                          {org.businessNumber || "-"}
                        </TableCell>
                        <TableCell className="text-center font-medium tabular-nums">
                          {getSpentFreeTotal(org).toLocaleString()}원
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {remaining.toLocaleString()}원
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {getChargedFreeTotal(org).toLocaleString()}원
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="inline-flex items-center justify-center gap-1.5">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-8 rounded-lg"
                                  disabled={grantingFreeCredit}
                                >
                                  {grantingFreeCredit ? "…" : "지급"}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="center"
                                className="min-w-[9rem]"
                              >
                                {FREE_CREDIT_AMOUNTS.map((amount) => (
                                  <DropdownMenuItem
                                    key={amount}
                                    disabled={grantingFreeCredit}
                                    onSelect={() => {
                                      void handleGrantFreeCredit({
                                        businessAnchorId: String(org._id),
                                        amount,
                                        reason: "관리자 지급",
                                      });
                                    }}
                                  >
                                    {amount.toLocaleString()}원
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-lg"
                              disabled={remaining <= 0 || cancelingGrant}
                              onClick={() => void openCancel(org)}
                            >
                              회수
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 rounded-lg"
                              onClick={() => void openHistory(org)}
                            >
                              내역
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CreditPanel>

      <Dialog
        open={Boolean(historyBusiness)}
        onOpenChange={(open) => {
          if (!open) setHistoryBusiness(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>지급 내역</DialogTitle>
            <DialogDescription>
              {historyBusiness?.name || "사업자"} ·{" "}
              {historyBusiness?.businessNumber || "-"}
            </DialogDescription>
          </DialogHeader>
          {loadingFreeCreditGrantRows ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              불러오는 중…
            </div>
          ) : historyRows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              지급 내역이 없습니다.
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-auto rounded-xl border border-slate-200/80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center">일시</TableHead>
                    <TableHead className="text-center">금액</TableHead>
                    <TableHead className="text-center">구분</TableHead>
                    <TableHead className="text-center">사유</TableHead>
                    <TableHead className="text-center">상태</TableHead>
                    <TableHead className="w-[88px] text-center">회수</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyRows.map((row) => (
                    <TableRow key={row._id}>
                      <TableCell className="text-center text-sm">
                        {formatDate(row.createdAt)}
                      </TableCell>
                      <TableCell className="text-center font-medium tabular-nums">
                        {Number(row.amount || 0).toLocaleString()}원
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            row.isOverride || row.source === "admin"
                              ? "default"
                              : "outline"
                          }
                        >
                          {row.source === "admin" ? "관리자" : "자동"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-center text-sm">
                        {String(row.overrideReason || "").trim() || "-"}
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {row.canceledAt ? (
                          <span className="text-muted-foreground">회수됨</span>
                        ) : row.hasSpent ? (
                          <span className="font-medium text-accent-strong">
                            사용됨
                          </span>
                        ) : (
                          <span className="text-muted-foreground">미사용</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg"
                          disabled={Boolean(row.canceledAt) || cancelingGrant}
                          onClick={() => {
                            setHistoryBusiness(null);
                            setCancelBusiness(historyBusiness);
                            setCancelGrantId(String(row._id));
                            setCancelReason("");
                          }}
                        >
                          회수
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(cancelBusiness)}
        onOpenChange={(open) => {
          if (!open) closeCancel();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>무료 크레딧 회수</DialogTitle>
            <DialogDescription>
              {cancelBusiness?.name || "사업자"} ·{" "}
              {cancelBusiness?.businessNumber || "-"}
            </DialogDescription>
          </DialogHeader>

          {loadingFreeCreditGrantRows ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              불러오는 중…
            </div>
          ) : cancelCandidates.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              회수 가능한 지급 건이 없습니다.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">회수 대상</Label>
                <div className="max-h-48 space-y-1.5 overflow-auto rounded-xl border border-slate-200/80 p-2">
                  {cancelCandidates.map((row) => (
                    <button
                      key={row._id}
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                        cancelGrantId === String(row._id)
                          ? "bg-primary/10 text-foreground"
                          : "hover:bg-slate-50",
                      )}
                      onClick={() => setCancelGrantId(String(row._id))}
                    >
                      <span className="text-muted-foreground">
                        {formatDate(row.createdAt)}
                      </span>
                      <span className="font-semibold tabular-nums">
                        {Number(row.amount || 0).toLocaleString()}원
                        {row.hasSpent ? (
                          <span className="ml-2 text-xs font-medium text-accent-strong">
                            사용됨
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cancel-free-credit-reason">회수 사유</Label>
                <Input
                  id="cancel-free-credit-reason"
                  className="h-11 rounded-xl"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="예: 중복 지급, 오류 수정"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeCancel}>
              닫기
            </Button>
            <Button
              type="button"
              disabled={
                cancelingGrant ||
                !cancelGrantId ||
                !cancelReason.trim() ||
                cancelCandidates.length === 0
              }
              onClick={() => {
                void (async () => {
                  const ok = await handleCancelFreeCredit({
                    grantId: cancelGrantId,
                    reason: cancelReason.trim(),
                  });
                  if (ok) closeCancel();
                })();
              }}
            >
              {cancelingGrant ? "회수 중…" : "회수"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TabsContent>
  );
}
