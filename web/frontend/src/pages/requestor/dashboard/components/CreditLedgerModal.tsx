import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/use-toast";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { cn } from "@/lib/utils";

type CreditLedgerType = "CHARGE" | "BONUS" | "SPEND" | "REFUND" | "ADJUST";

type CreditLedgerItem = {
  _id: string;
  type: CreditLedgerType;
  amount: number;
  refType?: string;
  refId?: string | null;
  refRequestId?: string;
  uniqueKey: string;
  createdAt: string;
};

type CreditLedgerResponse = {
  success: boolean;
  data: {
    items: CreditLedgerItem[];
    total: number;
    page: number;
    pageSize: number;
  };
  message?: string;
};

export type CreditLedgerModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const typeLabel = (t: CreditLedgerType) => {
  if (t === "CHARGE") return "충전";
  if (t === "BONUS") return "보너스";
  if (t === "SPEND") return "사용";
  if (t === "REFUND") return "환불";
  return "조정";
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatShortCode = (value: string) => {
  const raw = String(value || "");
  if (!raw) return "-";
  const tail = raw.replace(/[^a-zA-Z0-9]/g, "");
  const s = tail.slice(-4).toUpperCase();
  return s || "-";
};

export const CreditLedgerModal = ({
  open,
  onOpenChange,
}: CreditLedgerModalProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { token, user } = useAuthStore();

  const PAGE_SIZE = 50;

  const canAccess =
    user?.role === "requestor" &&
    (user.position === "principal" || user.position === "vice_principal");

  const [period, setPeriod] = useState<PeriodFilterValue>("30d");
  const [type, setType] = useState<"all" | CreditLedgerType>("all");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<CreditLedgerItem[]>([]);
  const [total, setTotal] = useState(0);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(total / PAGE_SIZE));
  }, [PAGE_SIZE, total]);

  const resetFilters = () => {
    setPeriod("30d");
    setType("all");
    setQ("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  const load = async () => {
    if (!token || !canAccess) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (period) params.set("period", period);
      if (type && type !== "all") params.set("type", type);
      if (q.trim()) params.set("q", q.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));

      const res = await apiFetch<CreditLedgerResponse>({
        path: `/api/credits/ledger?${params.toString()}`,
        method: "GET",
        token,
        headers: token
          ? {
              "x-mock-role": "requestor",
              "x-mock-position": user?.position || "staff",
            }
          : undefined,
      });

      if (!res.ok || !res.data?.success) {
        const serverMsg = (res.data as any)?.message;
        throw new Error(serverMsg || "크레딧 내역 조회에 실패했습니다.");
      }

      const data = res.data.data;
      setItems(Array.isArray(data?.items) ? data.items : []);
      setTotal(Number(data?.total || 0));
    } catch (e: any) {
      setItems([]);
      setTotal(0);
      toast({
        title: "크레딧 내역 조회 실패",
        description: e?.message || "다시 시도해주세요.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (page !== 1) {
      setPage(1);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, period, type, q, from, to, page]);

  const rows = Array.isArray(items) ? items : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg">크레딧 사용 내역</DialogTitle>
        </DialogHeader>

        {!canAccess ? (
          <div className="p-4 text-sm text-muted-foreground">
            크레딧 내역은 주대표/부대표만 확인할 수 있습니다.
          </div>
        ) : (
          <div className="flex flex-col gap-3 min-h-0 flex-1">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 py-0.5">
                  <PeriodFilter value={period} onChange={setPeriod} />

                  <div className="w-[140px]">
                    <Select
                      value={type}
                      onValueChange={(v) => setType(v as any)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="전체" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">전체</SelectItem>
                        <SelectItem value="SPEND">사용</SelectItem>
                        <SelectItem value="CHARGE">충전</SelectItem>
                        <SelectItem value="REFUND">환불</SelectItem>
                        <SelectItem value="BONUS">보너스</SelectItem>
                        <SelectItem value="ADJUST">조정</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="h-9"
                    onClick={resetFilters}
                    disabled={loading}
                  >
                    초기화
                  </Button>
                </div>

                <div className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8"
                      onClick={() => {
                        onOpenChange(false);
                        navigate("/dashboard/settings?tab=payment");
                      }}
                      disabled={loading}
                    >
                      충전하기
                    </Button>
                    <span>
                      {loading
                        ? "불러오는 중..."
                        : `${total.toLocaleString()}건`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 py-0.5">
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-9 w-[150px]"
                />
                <span className="text-xs text-muted-foreground">~</span>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-9 w-[150px]"
                />

                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="검색 (참조/코드/refId)"
                  className="h-9 w-full sm:w-[320px]"
                />
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-scroll overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[170px]">일시</TableHead>
                    <TableHead className="w-[90px]">유형</TableHead>
                    <TableHead className="w-[110px] text-right">금액</TableHead>
                    <TableHead className="w-[160px]">참조</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const amount = Number(r.amount || 0);
                    const isMinus = amount < 0;
                    return (
                      <TableRow key={r._id}>
                        <TableCell className="text-xs">
                          {formatDate(String(r.createdAt || ""))}
                        </TableCell>
                        <TableCell className="text-xs font-medium">
                          {typeLabel(r.type)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right text-xs font-semibold",
                            isMinus ? "text-rose-600" : "text-blue-700"
                          )}
                        >
                          {amount.toLocaleString()}원
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-col leading-4">
                            <span className="font-mono text-xs font-semibold">
                              {String(r.refRequestId || "").trim() ||
                                formatShortCode(String(r.uniqueKey || ""))}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {String(r.refType || "-")}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {!loading && rows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-sm text-muted-foreground py-8"
                      >
                        조회 결과가 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="text-xs text-muted-foreground">
                {totalPages > 0 ? `${page} / ${totalPages}` : "1 / 1"}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 px-3"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={loading || page <= 1}
                >
                  이전
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 px-3"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={loading || page >= totalPages}
                >
                  다음
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
