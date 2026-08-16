// related files:
// - web/backend/controllers/admin/admin.labFeeSchedules.controller.js
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
// - web/frontend/src/shared/practice/labFeeSchedule.ts
// - web/frontend/src/pages/devops/components/PracticeTransferAutoMatchTab.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Banknote, Building2, Search } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";
import {
  LAB_FEE_ITEM_UNIT_LABELS,
  type LabFeeItem,
  type LabFeeItemUnit,
} from "@/shared/practice/labFeeSchedule";
import { formatWon } from "@/shared/practice/practiceTransferFeeQuote";

const PAGE_LIMIT = 15;

type LabFeeScheduleRow = {
  _id: string;
  name: string;
  businessNumberNormalized: string;
  status: string;
  representativeName: string;
  address: string;
  verified: boolean;
  configured: boolean;
  active: boolean;
  items: LabFeeItem[];
  updatedAt: string | null;
};

const unitLabel = (unit: LabFeeItemUnit) =>
  LAB_FEE_ITEM_UNIT_LABELS[unit] || unit;

const formatItemPrice = (item: LabFeeItem) => {
  if (item.unit === "perNTeeth" && item.tiers?.[0]) {
    const tier = item.tiers[0];
    return `${tier.n}개 ${formatWon(tier.price)}`;
  }
  return formatWon(item.price);
};

const LabFeeTooltipBody = ({ row }: { row: LabFeeScheduleRow }) => {
  if (!row.configured) {
    return (
      <p className="text-muted-foreground">기공비 수가가 설정되지 않았습니다.</p>
    );
  }
  const items = row.items.filter((item) => item.enabled !== false && item.name);
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground">제공 중인 수가 항목이 없습니다.</p>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="font-medium text-foreground">기공비 수가</p>
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-baseline justify-between gap-3 tabular-nums"
          >
            <span className="min-w-0 truncate">
              {item.name}
              <span className="ml-1 text-[10px] text-muted-foreground">
                {unitLabel(item.unit)}
              </span>
            </span>
            <span className="shrink-0 font-medium">{formatItemPrice(item)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const AdminLabFeeSchedulesTab = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [rows, setRows] = useState<LabFeeScheduleRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [configuredCount, setConfiguredCount] = useState(0);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(false);
  const pageRef = useRef(1);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  const loadPage = useCallback(
    async (targetPage: number, append: boolean) => {
      if (!token) return;
      if (append) {
        if (loadingMoreRef.current) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      try {
        const qs = new URLSearchParams({
          page: String(targetPage),
          limit: String(PAGE_LIMIT),
        });
        if (debouncedQ) qs.set("q", debouncedQ);

        const res = await request<{
          success?: boolean;
          data?: LabFeeScheduleRow[];
          pagination?: {
            page?: number;
            limit?: number;
            total?: number;
            hasMore?: boolean;
          };
          configuredCount?: number;
        }>({
          path: `/api/admin/settings/lab-fee-schedules?${qs.toString()}`,
          method: "GET",
          token,
        });
        if (!res.ok) {
          throw new Error("목록 조회 실패");
        }
        const body = (res.data || {}) as {
          data?: LabFeeScheduleRow[];
          pagination?: {
            page?: number;
            limit?: number;
            total?: number;
            hasMore?: boolean;
          };
          configuredCount?: number;
        };
        const list: LabFeeScheduleRow[] = Array.isArray(body.data)
          ? body.data.map((row) => ({
              _id: String(row?._id || ""),
              name: String(row?.name || ""),
              businessNumberNormalized: String(
                row?.businessNumberNormalized || "",
              ),
              status: String(row?.status || ""),
              representativeName: String(row?.representativeName || "").trim(),
              address: String(row?.address || "").trim(),
              verified: Boolean(row?.verified),
              configured: Boolean(row?.configured),
              active: Boolean(row?.active),
              items: Array.isArray(row?.items) ? row.items : [],
              updatedAt: row?.updatedAt
                ? String(row.updatedAt)
                : null,
            }))
          : [];

        setRows((prev) => (append ? [...prev, ...list] : list));
        const nextPage = Number(body?.pagination?.page || targetPage);
        const nextHasMore = Boolean(body?.pagination?.hasMore);
        setPage(nextPage);
        setHasMore(nextHasMore);
        pageRef.current = nextPage;
        hasMoreRef.current = nextHasMore;
        setTotalCount(Number(body?.pagination?.total || 0));
        setConfiguredCount(Number(body?.configuredCount || 0));
      } catch (error) {
        console.error("[AdminLabFeeSchedulesTab] load failed", error);
        toast({
          title: "목록 불러오기 실패",
          description: "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
        if (!append) {
          setRows([]);
          setHasMore(false);
          hasMoreRef.current = false;
          setTotalCount(0);
          setConfiguredCount(0);
        }
      } finally {
        if (append) {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    },
    [debouncedQ, toast, token],
  );

  useEffect(() => {
    setRows([]);
    setPage(1);
    pageRef.current = 1;
    setHasMore(false);
    hasMoreRef.current = false;
    void loadPage(1, false);
  }, [loadPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loading || loadingMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((e) => e.isIntersecting) &&
          hasMoreRef.current &&
          !loadingMoreRef.current
        ) {
          void loadPage(pageRef.current + 1, true);
        }
      },
      { root: null, rootMargin: "240px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [hasMore, loading, loadingMore, page, rows.length, loadPage]);

  return (
    <Card className="app-glass-card app-glass-card--lg overflow-hidden">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft/60 ring-1 ring-primary-muted/70">
              <Banknote className="h-5 w-5 text-primary-strong" />
            </span>
            <div className="min-w-0 space-y-1">
              <h3 className="text-base font-semibold tracking-tight text-slate-900">
                기공소 수가
              </h3>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                기공소 목록입니다. 카드에 마우스를 올리면 기공비 수가를 볼 수
                있습니다.
              </p>
            </div>
          </div>
          {!loading && totalCount > 0 ? (
            <span className="inline-flex items-center rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold tabular-nums text-primary-strong ring-1 ring-primary-muted">
              설정 {configuredCount} / {totalCount}
            </span>
          ) : null}
        </div>

        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="기공소명 또는 사업자번호"
            className="h-11 rounded-xl border-slate-200 bg-white pl-10 shadow-sm"
          />
        </div>

        {loading ? (
          <div className="rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/40 px-6 py-12 text-center text-sm text-muted-foreground">
            불러오는 중…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/40 px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white ring-1 ring-slate-200/80">
              <Building2 className="h-5 w-5 text-slate-400" />
            </span>
            <p className="mt-3 text-sm font-medium text-slate-700">
              해당하는 기공소가 없습니다
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              검색어를 바꾸거나 다른 기공소를 확인해 보세요.
            </p>
          </div>
        ) : (
          <TooltipProvider>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {rows.map((row) => (
                <li key={row._id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          "cursor-default overflow-hidden rounded-2xl border bg-white/80 shadow-sm transition-shadow hover:shadow-md",
                          row.configured
                            ? "border-primary-muted/70"
                            : "border-slate-200/80",
                        )}
                      >
                        <div
                          className={cn(
                            "h-1 w-full",
                            row.configured
                              ? "bg-primary-strong"
                              : row.verified
                                ? "bg-slate-300"
                                : "bg-amber-400",
                          )}
                        />
                        <div className="space-y-2 px-4 py-3.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-semibold text-slate-900">
                              {row.name || "이름 없음"}
                            </p>
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                row.configured
                                  ? "bg-primary-soft text-primary-strong ring-1 ring-primary-muted"
                                  : row.verified
                                    ? "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
                                    : "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
                              )}
                            >
                              {row.configured
                                ? "수가 ON"
                                : row.verified
                                  ? "미설정"
                                  : row.status || "미검증"}
                            </span>
                          </div>
                          <dl className="space-y-1.5 text-[13px]">
                            <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2">
                              <dt className="text-slate-500">대표</dt>
                              <dd className="min-w-0 truncate text-slate-700">
                                {row.representativeName || "—"}
                              </dd>
                            </div>
                            <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2">
                              <dt className="text-slate-500">주소</dt>
                              <dd className="min-w-0 break-words text-slate-700">
                                {row.address || "—"}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="max-w-[20rem] p-3 text-xs leading-relaxed"
                    >
                      <LabFeeTooltipBody row={row} />
                    </TooltipContent>
                  </Tooltip>
                </li>
              ))}
            </ul>
            <div ref={sentinelRef} className="h-4 w-full" aria-hidden />
            {loadingMore ? (
              <div className="py-3 text-center text-xs text-muted-foreground">
                더 불러오는 중…
              </div>
            ) : null}
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
};
