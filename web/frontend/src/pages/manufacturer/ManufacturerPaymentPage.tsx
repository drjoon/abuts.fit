import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PaymentItem = {
  _id: string;
  amount: number;
  occurredAt: string;
  status: "CONFIRMED" | "PENDING" | "CANCELLED";
  note?: string;
  externalId?: string;
  printedContent?: string;
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

const statusLabel = (s: string) => {
  if (s === "CONFIRMED") return "확정";
  if (s === "PENDING") return "대기";
  if (s === "CANCELLED") return "취소";
  return s;
};

const statusColor = (s: string) => {
  if (s === "CONFIRMED") return "text-blue-700";
  if (s === "PENDING") return "text-yellow-600";
  if (s === "CANCELLED") return "text-rose-600";
  return "";
};

const periodToDays = (period: PeriodFilterValue): number | null => {
  if (period === "7d") return 7;
  if (period === "30d") return 30;
  if (period === "90d") return 90;
  return null;
};

export const ManufacturerPaymentPage = () => {
  const { token, user } = useAuthStore();
  const { toast } = useToast();

  const [period, setPeriod] = useState<PeriodFilterValue>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<PaymentItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalAmount, setTotalAmount] = useState(0);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  if (!user || user.role !== "manufacturer") return null;

  const resetFilters = () => {
    setPeriod("30d");
    setFrom("");
    setTo("");
    setQ("");
  };

  const buildParams = (p: number) => {
    const params = new URLSearchParams({
      page: String(p),
      limit: String(PAGE_SIZE),
    });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const days = periodToDays(period);
    if (days && !from && !to) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      params.set("from", cutoff.toISOString().slice(0, 10));
    }
    if (q.trim()) params.set("q", q.trim());
    return params.toString();
  };

  const load = async (p: number, reset: boolean) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch<any>({
        path: `/api/manufacturer/payments?${buildParams(p)}`,
        method: "GET",
        token,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "조회 실패");
      }
      const fetched: PaymentItem[] = Array.isArray(res.data.data)
        ? res.data.data
        : [];
      setItems((prev) => (reset ? fetched : [...prev, ...fetched]));
      setHasMore(fetched.length >= PAGE_SIZE);
      setPage(p);
      if (reset) {
        const sum = fetched
          .filter((x) => x.status === "CONFIRMED")
          .reduce((acc, x) => acc + Number(x.amount || 0), 0);
        setTotalAmount(sum);
      }
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
    setPage(1);
    setHasMore(true);
    load(1, true);
  }, [period, from, to, q, token]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !hasMore || loading) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && hasMore && !loading) {
          load(page + 1, false);
        }
      },
      { root, rootMargin: "200px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [hasMore, loading, page]);

  return (
    <DashboardShell
      title="정산 내역"
      subtitle="제조사 입금 및 정산 내역을 확인하세요."
      stats={null}
      mainLeft={
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  기간 내 확정 금액
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loading ? "..." : `₩${totalAmount.toLocaleString()}`}
                </div>
                <div className="text-xs text-muted-foreground">
                  CONFIRMED 상태 합계
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <PeriodFilter value={period} onChange={setPeriod} />
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
                placeholder="검색 (메모/외부ID)"
                className="h-9 w-full sm:w-[280px]"
              />
            </div>
          </div>

          <div
            ref={scrollRef}
            className="overflow-y-auto overflow-x-auto rounded-md border max-h-[60vh]"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">일시</TableHead>
                  <TableHead className="w-[80px]">상태</TableHead>
                  <TableHead className="w-[130px] text-right">금액</TableHead>
                  <TableHead>메모</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell className="text-xs">
                      {formatDate(String(r.occurredAt || r._id))}
                    </TableCell>
                    <TableCell
                      className={`text-xs font-medium ${statusColor(r.status)}`}
                    >
                      {statusLabel(r.status)}
                    </TableCell>
                    <TableCell className="text-right text-xs font-semibold text-blue-700 tabular-nums">
                      ₩{Number(r.amount || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.note || r.printedContent || r.externalId || "-"}
                    </TableCell>
                  </TableRow>
                ))}
                {loading && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-sm text-muted-foreground py-4"
                    >
                      불러오는 중...
                    </TableCell>
                  </TableRow>
                )}
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
            {hasMore && !loading && <div ref={sentinelRef} className="h-8" />}
          </div>
        </div>
      }
    />
  );
};
