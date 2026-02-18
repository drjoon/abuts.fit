import { useEffect, useRef, useState } from "react";
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
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { cn } from "@/shared/ui/cn";

type CreditLedgerType = "CHARGE" | "BONUS" | "SPEND" | "REFUND" | "ADJUST";

type CreditLedgerItem = {
  _id: string;
  type: CreditLedgerType;
  amount: number;
  spentPaidAmount?: number | null;
  spentBonusAmount?: number | null;
  refType?: string;
  refId?: string | null;
  refRequestId?: string;
  uniqueKey: string;
  createdAt: string;
};

export type CreditLedgerModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 관리자가 특정 조직의 원장을 볼 때 사용. 없으면 로그인 유저 기준 */
  organizationId?: string;
  /** 모달 제목 suffix (예: "· org-001") */
  titleSuffix?: string;
  /** 충전하기 버튼 클릭 시 이동할 경로. 없으면 버튼 숨김 */
  chargeNavPath?: string;
};

const PAGE_SIZE = 50;

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

const refTypeLabel = (refType?: string) => {
  const t = String(refType || "").trim();
  if (!t) return "-";
  if (t === "SHIPPING_FEE") return "배송비 (발송 1회)";
  if (t === "REQUEST") return "의뢰";
  return t;
};

const hashToBase36 = (input: string) => {
  const str = String(input || "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).toUpperCase();
};

const formatRequestIdSafe = (requestId?: string, seed?: string) => {
  const raw = String(requestId || "").trim();
  const m = raw.match(/^(\d{8})-(\d{6})$/);
  if (!m) return raw;
  const datePart = m[1];
  const code = hashToBase36(`${String(seed || raw)}|abuts|requestId`)
    .padStart(6, "0")
    .slice(-6);
  return `${datePart}-${code}`;
};

export const CreditLedgerModal = ({
  open,
  onOpenChange,
  organizationId,
  titleSuffix,
  chargeNavPath,
}: CreditLedgerModalProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { token, user } = useAuthStore();

  const [period, setPeriod] = useState<PeriodFilterValue>("30d");
  const [type, setType] = useState<"all" | CreditLedgerType>("all");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<CreditLedgerItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const resetFilters = () => {
    setPeriod("30d");
    setType("all");
    setQ("");
    setFrom("");
    setTo("");
  };

  const buildPath = (pageNum: number) => {
    const params = new URLSearchParams();
    if (period) params.set("period", period);
    if (type && type !== "all") params.set("type", type);
    if (q.trim()) params.set("q", q.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("page", String(pageNum));
    params.set("pageSize", String(PAGE_SIZE));

    if (organizationId) {
      return `/api/admin/credits/organizations/${organizationId}/ledger?${params.toString()}`;
    }
    return `/api/credits/ledger?${params.toString()}`;
  };

  const load = async (pageNum: number, reset: boolean) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch<{
        success: boolean;
        data: { items: CreditLedgerItem[]; total: number; page: number; pageSize: number };
        message?: string;
      }>({
        path: buildPath(pageNum),
        method: "GET",
        token,
      });

      if (!res.ok || !res.data?.success) {
        throw new Error((res.data as any)?.message || "크레딧 내역 조회에 실패했습니다.");
      }

      const data = res.data.data;
      const fetched = Array.isArray(data?.items) ? data.items : [];
      setItems((prev) => (reset ? fetched : [...prev, ...fetched]));
      setHasMore(fetched.length >= PAGE_SIZE);
    } catch (e: any) {
      if (reset) setItems([]);
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

  // 필터 변경 시 초기화
  useEffect(() => {
    if (!open) return;
    setPage(1);
    setHasMore(true);
    load(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, period, type, q, from, to, organizationId]);

  // 무한 스크롤
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

  const rows = Array.isArray(items) ? items : [];

  const canCharge =
    chargeNavPath &&
    (user?.role === "requestor" || user?.role === "admin");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-2">
          <div className="flex items-center justify-start gap-2">
            <DialogTitle className="text-lg">
              크레딧 내역{titleSuffix ? ` · ${titleSuffix}` : ""}
            </DialogTitle>
            {canCharge && (
              <Button
                type="button"
                size="sm"
                className="h-8"
                onClick={() => {
                  onOpenChange(false);
                  navigate(chargeNavPath!);
                }}
                disabled={loading}
              >
                충전하기
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3 min-h-0 flex-1">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 py-0.5">
                <PeriodFilter value={period} onChange={setPeriod} />

                <div className="w-[140px]">
                  <Select value={type} onValueChange={(v) => setType(v as any)}>
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

          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto overflow-x-auto rounded-md border"
          >
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
                  const spentPaid = Number(r.spentPaidAmount || 0);
                  const spentBonus = Number(r.spentBonusAmount || 0);
                  const showSplit =
                    String(r.type) === "SPEND" &&
                    (spentPaid > 0 || spentBonus > 0);
                  const safeRef = r.refRequestId
                    ? formatRequestIdSafe(
                        r.refRequestId,
                        `${String(r.refId || "")}::${String(r.uniqueKey || "")}`,
                      )
                    : "";
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
                          "font-medium tabular-nums",
                          isMinus ? "text-rose-600" : "text-blue-700",
                        )}
                      >
                        {showSplit ? (
                          <div className="flex flex-col leading-4">
                            {spentPaid > 0 && (
                              <div className="tabular-nums text-xs">
                                유료 -{spentPaid.toLocaleString()}원
                              </div>
                            )}
                            {spentBonus > 0 && (
                              <div className="tabular-nums text-xs">
                                무료 -{spentBonus.toLocaleString()}원
                              </div>
                            )}
                          </div>
                        ) : (
                          `${amount.toLocaleString()}원`
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-col leading-4">
                          <span className="font-mono text-xs font-semibold">
                            {safeRef ||
                              formatShortCode(String(r.uniqueKey || ""))}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {refTypeLabel(r.refType)}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}

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

            {hasMore && !loading && (
              <div ref={sentinelRef} className="h-8" aria-hidden="true" />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
