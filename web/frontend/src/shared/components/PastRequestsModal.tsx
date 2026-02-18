import { useEffect, useMemo, useRef, useState } from "react";
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
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";

type ApiMyRequestsResponse = {
  success: boolean;
  data?: {
    requests?: any[];
    pagination?: { page: number; pages: number };
  };
  message?: string;
};

export type PastRequestsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  onSelectRequest: (request: any) => void;
  /** 기본: 완료/취소만 표시 */
  statusIn?: string[];
};

const DEFAULT_STATUS_IN = ["완료", "취소"];

const PAGE_SIZE = 50;

const formatDate = (iso?: string) => {
  const raw = String(iso || "");
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const pickRangeByPeriod = (period: PeriodFilterValue) => {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);

  if (period === "7d") start.setDate(start.getDate() - 7);
  else if (period === "30d") start.setDate(start.getDate() - 30);
  else if (period === "90d") start.setDate(start.getDate() - 90);
  else if (period === "thisMonth") {
    start.setDate(1);
  } else if (period === "lastMonth") {
    start.setMonth(start.getMonth() - 1);
    start.setDate(1);
    end.setDate(0);
  } else {
    return { start: "", end: "" };
  }

  const toYmd = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  return { start: toYmd(start), end: toYmd(end) };
};

export const PastRequestsModal = ({
  open,
  onOpenChange,
  title,
  onSelectRequest,
  statusIn,
}: PastRequestsModalProps) => {
  const { token } = useAuthStore();
  const { toast } = useToast();

  const initialStatusIn = useMemo(
    () =>
      (statusIn && statusIn.length ? statusIn : DEFAULT_STATUS_IN)
        .map((s) => String(s))
        .filter(Boolean),
    [statusIn],
  );

  const [period, setPeriod] = useState<PeriodFilterValue>("30d");
  const [statusMode, setStatusMode] = useState<
    "default" | "completed" | "cancel"
  >("default");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const effectiveStatusIn = useMemo(() => {
    if (statusMode === "completed") return ["완료"];
    if (statusMode === "cancel") return ["취소"];
    return initialStatusIn;
  }, [statusMode, initialStatusIn]);

  const resetFilters = () => {
    setPeriod("30d");
    setStatusMode("default");
    setQ("");
    setFrom("");
    setTo("");
  };

  const buildPath = (pageNum: number) => {
    const params = new URLSearchParams();
    params.set("page", String(pageNum));
    params.set("limit", String(PAGE_SIZE));
    params.set("sortBy", "createdAt");
    params.set("sortOrder", "desc");
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    effectiveStatusIn.forEach((s) => params.append("statusIn", s));
    return `/api/requests/my?${params.toString()}`;
  };

  const load = async (pageNum: number, reset: boolean) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch<ApiMyRequestsResponse>({
        path: buildPath(pageNum),
        method: "GET",
        token,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "의뢰 목록 조회에 실패했습니다.");
      }

      const d = res.data?.data || {};
      const fetched = Array.isArray(d?.requests) ? d.requests : [];
      setItems((prev) => (reset ? fetched : [...prev, ...fetched]));
      setHasMore(fetched.length >= PAGE_SIZE);
    } catch (e: any) {
      if (reset) setItems([]);
      toast({
        title: "의뢰 목록 조회 실패",
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
    const range = pickRangeByPeriod(period);
    if (!from && !to && (range.start || range.end)) {
      setFrom(range.start);
      setTo(range.end);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (period && !from && !to) {
      const range = pickRangeByPeriod(period);
      setFrom(range.start);
      setTo(range.end);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  useEffect(() => {
    if (!open) return;
    setPage(1);
    setHasMore(true);
    load(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, period, statusMode, from, to]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !hasMore || loading) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (loading || !hasMore) return;
        const nextPage = page + 1;
        setPage(nextPage);
        load(nextPage, false);
      },
      { root, rootMargin: "200px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, page, open]);

  const filteredRows = useMemo(() => {
    const keyword = String(q || "")
      .trim()
      .toLowerCase();
    if (!keyword) return items;
    return (items || []).filter((r: any) => {
      const ci = r?.caseInfos || {};
      const hay = [
        r?.requestId,
        r?.status,
        r?.manufacturerStage,
        ci?.clinicName,
        ci?.patientName,
        ci?.tooth,
        ci?.implantManufacturer,
        ci?.implantSystem,
        ci?.implantType,
      ]
        .map((v) => String(v || "").toLowerCase())
        .join("|");
      return hay.includes(keyword);
    });
  }, [items, q]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg">{title || "지난 의뢰"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 min-h-0 flex-1">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 py-0.5">
                <PeriodFilter value={period} onChange={setPeriod} />

                <div className="w-[140px]">
                  <Select
                    value={statusMode}
                    onValueChange={(v) => setStatusMode(v as any)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="전체" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">전체(완료/취소)</SelectItem>
                      <SelectItem value="completed">완료</SelectItem>
                      <SelectItem value="cancel">취소</SelectItem>
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
                placeholder="검색 (의뢰번호/치과/환자/임플란트)"
                className="h-9 w-full sm:w-[320px]"
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
                  <TableHead className="w-[90px]">상태</TableHead>
                  <TableHead className="min-w-[220px]">케이스</TableHead>
                  <TableHead className="min-w-[220px]">임플란트</TableHead>
                  <TableHead className="w-[160px]">의뢰번호</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((r: any) => {
                  const ci = r?.caseInfos || {};
                  const id = String(r?._id || r?.id || "");
                  const stage = String(
                    r?.status || r?.manufacturerStage || "-",
                  );
                  const caseText =
                    [ci?.clinicName, ci?.patientName, ci?.tooth]
                      .filter(Boolean)
                      .join(" ") || "-";
                  const implantText =
                    [
                      ci?.implantManufacturer,
                      ci?.implantSystem,
                      ci?.implantType,
                    ]
                      .filter(Boolean)
                      .join(" ") || "-";
                  const requestId = String(r?.requestId || "-");
                  return (
                    <TableRow
                      key={id || requestId}
                      className="cursor-pointer"
                      onClick={() => onSelectRequest(r)}
                    >
                      <TableCell className="text-xs">
                        {formatDate(r?.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {stage}
                      </TableCell>
                      <TableCell className="text-xs">{caseText}</TableCell>
                      <TableCell className="text-xs">{implantText}</TableCell>
                      <TableCell className="text-xs font-mono">
                        {requestId}
                      </TableCell>
                    </TableRow>
                  );
                })}

                {loading && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-sm text-muted-foreground py-4"
                    >
                      불러오는 중...
                    </TableCell>
                  </TableRow>
                )}

                {!loading && filteredRows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-sm text-muted-foreground py-8"
                    >
                      조회 결과가 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {hasMore && !loading && (
              <div ref={sentinelRef} className="h-8" aria-hidden="true" />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
