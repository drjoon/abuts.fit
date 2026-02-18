import { useEffect, useRef, useState } from "react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type SalesmanLedgerType = "EARN" | "PAYOUT" | "ADJUST";

type LedgerItem = {
  _id: string;
  type: SalesmanLedgerType;
  amount: number;
  refType?: string;
  refId?: string | null;
  uniqueKey: string;
  createdAt: string;
};

export type SalesmanLedgerModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesmanId?: string | null;
  titleSuffix?: string;
  mode?: "admin" | "self";
};

const PAGE_SIZE = 50;

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
  return tail.slice(-4).toUpperCase() || "-";
};

const typeLabel = (t: SalesmanLedgerType) => {
  if (t === "EARN") return "적립";
  if (t === "PAYOUT") return "정산";
  return "조정";
};

const refTypeLabel = (refType?: string) => {
  const t = String(refType || "").trim();
  if (!t) return "-";
  if (t === "COMMISSION") return "수수료";
  if (t === "ADMIN_PAYOUT") return "관리자 정산";
  if (t === "ADJUST") return "조정";
  return t;
};

export const SalesmanLedgerModal = ({
  open,
  onOpenChange,
  salesmanId,
  titleSuffix,
  mode,
}: SalesmanLedgerModalProps) => {
  const { token } = useAuthStore();
  const { toast } = useToast();

  const [period, setPeriod] = useState<PeriodFilterValue>("30d");
  const [type, setType] = useState<"all" | SalesmanLedgerType>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<LedgerItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const resetFilters = () => {
    setPeriod("30d");
    setType("all");
    setFrom("");
    setTo("");
    setQ("");
  };

  const buildQs = (p: number) => {
    const qs = new URLSearchParams({
      page: String(p),
      pageSize: String(PAGE_SIZE),
    });
    if (period && period !== "all") qs.set("period", period);
    if (type !== "all") qs.set("type", type);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (q.trim()) qs.set("q", q.trim());
    return qs.toString();
  };

  const loadPage = async (p: number, reset = false) => {
    if (!token) return;
    setLoading(true);
    try {
      const effectiveMode: "admin" | "self" = mode
        ? mode
        : salesmanId
          ? "admin"
          : "self";
      if (effectiveMode === "admin" && !salesmanId) return;

      const path =
        effectiveMode === "self"
          ? `/api/salesman/ledger?${buildQs(p)}`
          : `/api/admin/credits/salesmen/${salesmanId}/ledger?${buildQs(p)}`;
      const res = await request<any>({
        path,
        method: "GET",
        token,
      });
      if (!res.ok) throw new Error((res.data as any)?.message || "조회 실패");
      const data = res.data?.data;
      const fetched: LedgerItem[] = Array.isArray(data?.items)
        ? data.items
        : [];
      setItems((prev) => (reset ? fetched : [...prev, ...fetched]));
      setHasMore(fetched.length >= PAGE_SIZE);
      setPage(p);
    } catch (err: any) {
      toast({
        title: "조회 실패",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const effectiveMode: "admin" | "self" = mode
      ? mode
      : salesmanId
        ? "admin"
        : "self";
    if (effectiveMode === "admin" && !salesmanId) return;
    setItems([]);
    setHasMore(true);
    loadPage(1, true);
  }, [open, salesmanId, mode, period, type, from, to, q]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !hasMore || loading) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && hasMore && !loading) {
          loadPage(page + 1, false);
        }
      },
      { root, rootMargin: "200px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [hasMore, loading, page, salesmanId]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetFilters();
      }}
    >
      <DialogContent className="w-[92vw] max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg">
            정산 내역{titleSuffix ? ` · ${titleSuffix}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 min-h-0 flex-1">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <PeriodFilter value={period} onChange={setPeriod} />
              <div className="w-[130px]">
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                >
                  <option value="all">전체</option>
                  <option value="EARN">적립</option>
                  <option value="PAYOUT">정산</option>
                  <option value="ADJUST">조정</option>
                </select>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-9"
                onClick={resetFilters}
              >
                초기화
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
                className="h-9 w-full sm:w-[280px]"
              />
            </div>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto overflow-x-auto rounded-md border"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[170px]">일시</TableHead>
                  <TableHead className="w-[80px]">유형</TableHead>
                  <TableHead className="w-[120px] text-right">금액</TableHead>
                  <TableHead>참조</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => {
                  const amount = Number(r.amount || 0);
                  return (
                    <TableRow key={r._id}>
                      <TableCell className="text-xs">
                        {formatDate(String(r.createdAt || ""))}
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {typeLabel(r.type)}
                      </TableCell>
                      <TableCell
                        className={`text-right text-xs font-semibold ${amount < 0 ? "text-rose-600" : "text-blue-700"}`}
                      >
                        {amount.toLocaleString()}원
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-col leading-4">
                          <span className="font-mono text-xs font-semibold">
                            {formatShortCode(String(r.uniqueKey || ""))}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {refTypeLabel(r.refType)}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!loading && items.length === 0 && (
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
            <div ref={sentinelRef} className="h-6" />
            {loading && (
              <div className="text-center py-4 text-muted-foreground text-sm">
                불러오는 중...
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
