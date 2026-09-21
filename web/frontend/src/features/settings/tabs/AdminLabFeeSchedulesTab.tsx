// related files:
// - web/backend/controllers/admin/admin.labFeeSchedules.controller.js
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
// - web/frontend/src/shared/practice/labFeeSchedule.ts
// - web/frontend/src/pages/devops/components/PracticeTransferAutoMatchTab.tsx
// - 2026-09-21: freeRemakeYears 표시·관리자 편집.
// - 2026-08-16: 수가 ON 상단 정렬·클릭 모달.
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Banknote, Building2, Search } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";
import {
  FREE_REMAKE_YEARS_MAX,
  LAB_FEE_ITEM_UNIT_LABELS,
  formatFreeRemakeYearsLabel,
  normalizeFreeRemakeYears,
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
  freeRemakeYears: number | null;
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

const enabledItems = (row: LabFeeScheduleRow) =>
  row.items.filter((item) => item.enabled !== false && item.name);

const mapRow = (row: Partial<LabFeeScheduleRow>): LabFeeScheduleRow => ({
  _id: String(row?._id || ""),
  name: String(row?.name || ""),
  businessNumberNormalized: String(row?.businessNumberNormalized || ""),
  status: String(row?.status || ""),
  representativeName: String(row?.representativeName || "").trim(),
  address: String(row?.address || "").trim(),
  verified: Boolean(row?.verified),
  configured: Boolean(row?.configured),
  active: Boolean(row?.active),
  freeRemakeYears: normalizeFreeRemakeYears(row?.freeRemakeYears),
  items: Array.isArray(row?.items) ? row.items : [],
  updatedAt: row?.updatedAt ? String(row.updatedAt) : null,
});

const LabFeeScheduleBody = ({
  row,
  draftYears,
  saving,
  onDraftChange,
  onSave,
}: {
  row: LabFeeScheduleRow;
  draftYears: number | null;
  saving: boolean;
  onDraftChange: (years: number | null) => void;
  onSave: () => void;
}) => {
  const yearsUnset = draftYears == null;
  return (
    <div className="space-y-5">
      <div
        className={cn(
          "rounded-2xl border px-3 py-3",
          yearsUnset
            ? "border-red-300 bg-red-50/80 ring-2 ring-red-500 ring-offset-2"
            : "border-slate-200/80 bg-slate-50/60",
        )}
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <Label
              htmlFor={`admin-free-remake-${row._id}`}
              className={cn(
                "text-[13px] font-semibold",
                yearsUnset ? "text-red-700" : "text-slate-800",
              )}
            >
              무료 리메이크 기간
            </Label>
            <p className="text-[12px] leading-snug text-slate-500">
              0년=유료 · 1년 이상=해당 기간 무료 · 미설정이면 유료
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              id={`admin-free-remake-${row._id}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={FREE_REMAKE_YEARS_MAX}
              step={1}
              disabled={saving}
              value={draftYears == null ? "" : String(draftYears)}
              placeholder="설정"
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  onDraftChange(null);
                  return;
                }
                onDraftChange(
                  Math.max(
                    0,
                    Math.min(
                      FREE_REMAKE_YEARS_MAX,
                      Math.trunc(Number(raw) || 0),
                    ),
                  ),
                );
              }}
              className="h-10 w-[5.5rem] rounded-xl border-slate-200 bg-white text-center text-base font-semibold tabular-nums"
            />
            <span className="text-[13px] font-medium text-slate-600">년</span>
            <Button
              type="button"
              size="sm"
              className="h-10"
              disabled={saving || draftYears === row.freeRemakeYears}
              onClick={onSave}
            >
              저장
            </Button>
          </div>
        </div>
        <p
          className={cn(
            "mt-2 text-[12px]",
            yearsUnset ? "font-medium text-red-600" : "text-slate-600",
          )}
        >
          {yearsUnset
            ? "기간을 입력해 주세요."
            : `현재: ${formatFreeRemakeYearsLabel(draftYears)}`}
        </p>
      </div>

      {!row.configured ? (
        <p className="text-sm text-muted-foreground">
          기공비 수가가 설정되지 않았습니다.
        </p>
      ) : enabledItems(row).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          제공 중인 수가 항목이 없습니다.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {enabledItems(row).map((item) => (
            <li
              key={item.id}
              className="flex items-baseline justify-between gap-4 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {item.name}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {unitLabel(item.unit)}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums tracking-tight text-slate-900">
                {formatItemPrice(item)}
              </span>
            </li>
          ))}
        </ul>
      )}
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
  const [selected, setSelected] = useState<LabFeeScheduleRow | null>(null);
  const [draftYears, setDraftYears] = useState<number | null>(null);
  const [savingYears, setSavingYears] = useState(false);

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

  const openSelected = (row: LabFeeScheduleRow) => {
    setSelected(row);
    setDraftYears(row.freeRemakeYears);
  };

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
          ? body.data.map(mapRow)
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

  const saveSelectedFreeRemakeYears = async () => {
    if (!token || !selected) return;
    setSavingYears(true);
    try {
      const res = await request<{
        success?: boolean;
        data?: LabFeeScheduleRow;
        message?: string;
      }>({
        path: `/api/admin/settings/lab-fee-schedules/${selected._id}`,
        method: "PATCH",
        token,
        jsonBody: { freeRemakeYears: draftYears },
      });
      if (!res.ok) {
        toast({
          title: "저장 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
      const next = mapRow(res.data?.data || { ...selected, freeRemakeYears: draftYears });
      setSelected(next);
      setDraftYears(next.freeRemakeYears);
      setRows((prev) =>
        prev.map((row) => (row._id === next._id ? next : row)),
      );
      toast({
        title: "무료 리메이크 기간을 저장했습니다.",
        description: formatFreeRemakeYearsLabel(next.freeRemakeYears),
      });
    } finally {
      setSavingYears(false);
    }
  };

  return (
    <>
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
                  수가 ON 기공소가 위에 표시됩니다. 카드를 누르면 수가·무료
                  리메이크 기간을 확인·수정합니다.
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
            <>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {rows.map((row) => (
                  <li key={row._id}>
                    <button
                      type="button"
                      onClick={() => openSelected(row)}
                      className={cn(
                        "w-full overflow-hidden rounded-2xl border bg-white/80 text-left shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-muted",
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
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              row.freeRemakeYears == null
                                ? "bg-red-50 text-red-700 ring-1 ring-red-200"
                                : "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
                            )}
                          >
                            {formatFreeRemakeYearsLabel(row.freeRemakeYears)}
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
                    </button>
                  </li>
                ))}
              </ul>
              <div ref={sentinelRef} className="h-4 w-full" aria-hidden />
              {loadingMore ? (
                <div className="py-3 text-center text-xs text-muted-foreground">
                  더 불러오는 중…
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setDraftYears(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md sm:rounded-2xl">
          {selected ? (
            <>
              <DialogHeader className="shrink-0 border-b border-slate-100 px-6 pb-4 pt-6">
                <div className="flex flex-wrap items-center gap-2 pr-8">
                  <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
                    {selected.name || "이름 없음"}
                  </DialogTitle>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      selected.configured
                        ? "bg-primary-soft text-primary-strong ring-1 ring-primary-muted"
                        : "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
                    )}
                  >
                    {selected.configured ? "수가 ON" : "미설정"}
                  </span>
                </div>
                <DialogDescription className="text-sm text-slate-500">
                  {selected.representativeName
                    ? `대표 ${selected.representativeName}`
                    : "기공비 수가"}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-8">
                <LabFeeScheduleBody
                  row={selected}
                  draftYears={draftYears}
                  saving={savingYears}
                  onDraftChange={setDraftYears}
                  onSave={() => void saveSelectedFreeRemakeYears()}
                />
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
};
