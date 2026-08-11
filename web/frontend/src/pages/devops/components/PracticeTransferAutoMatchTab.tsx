// related files:
// - web/backend/modules/devops/practiceTransferAutoMatch.routes.js
// - web/frontend/src/pages/devops/DevopsPartnerPage.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, Search } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";

const PAGE_LIMIT = 15;

type AutoMatchRow = {
  _id: string;
  name: string;
  businessNumberNormalized: string;
  status: string;
  representativeName: string;
  address: string;
  practiceTransferAutoMatchEnabled: boolean;
  verified: boolean;
  canReceivePracticeTransfer: boolean;
};

export const PracticeTransferAutoMatchTab = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [rows, setRows] = useState<AutoMatchRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [enabledCount, setEnabledCount] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);

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
          data?: AutoMatchRow[];
          pagination?: {
            page?: number;
            limit?: number;
            total?: number;
            hasMore?: boolean;
          };
          enabledCount?: number;
        }>({
          path: `/api/devops/practice-transfer-auto-match?${qs.toString()}`,
          method: "GET",
          token,
        });
        if (!res.ok) {
          throw new Error("목록 조회 실패");
        }
        const body: any = res.data || {};
        const list: AutoMatchRow[] = Array.isArray(body.data)
          ? body.data.map((row: any) => ({
              _id: String(row?._id || ""),
              name: String(row?.name || ""),
              businessNumberNormalized: String(
                row?.businessNumberNormalized || "",
              ),
              status: String(row?.status || ""),
              representativeName: String(row?.representativeName || "").trim(),
              address: String(row?.address || "").trim(),
              practiceTransferAutoMatchEnabled: Boolean(
                row?.practiceTransferAutoMatchEnabled,
              ),
              verified: Boolean(row?.verified),
              canReceivePracticeTransfer: Boolean(
                row?.canReceivePracticeTransfer,
              ),
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
        setEnabledCount(Number(body?.enabledCount || 0));
      } catch (error) {
        console.error("[PracticeTransferAutoMatchTab] load failed", error);
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
          setEnabledCount(0);
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

  // 페이지(뷰포트) 스크롤 무한로드 — 내부 스크롤 컨테이너 없음
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

  const onToggle = async (row: AutoMatchRow, enabled: boolean) => {
    if (!token || savingId) return;
    if (enabled && !row.verified) {
      toast({
        title: "검증 기공소만 가능",
        description: "검증된 기공소만 자동매칭을 ON할 수 있습니다.",
        variant: "destructive",
      });
      return;
    }
    if (enabled && !row.canReceivePracticeTransfer) {
      toast({
        title: "자동매칭 불가",
        description:
          "기공의뢰를 수신할 수 있는 기공소만 자동매칭을 ON할 수 있습니다.",
        variant: "destructive",
      });
      return;
    }
    setSavingId(row._id);
    const prev = rows;
    const prevEnabled = enabledCount;
    setRows((cur) =>
      cur.map((r) =>
        r._id === row._id
          ? { ...r, practiceTransferAutoMatchEnabled: enabled }
          : r,
      ),
    );
    setEnabledCount((c) => Math.max(0, c + (enabled ? 1 : -1)));
    try {
      const res = await request<{
        success?: boolean;
        data?: AutoMatchRow;
      }>({
        path: `/api/devops/practice-transfer-auto-match/${encodeURIComponent(row._id)}`,
        method: "PATCH",
        token,
        jsonBody: { enabled },
      });
      if (!res.ok) {
        throw new Error("저장 실패");
      }
      const body: any = res.data || {};
      if (body?.data?._id) {
        setRows((cur) =>
          cur.map((r) =>
            r._id === body.data._id
              ? {
                  ...r,
                  ...body.data,
                  representativeName: String(
                    body.data.representativeName || r.representativeName || "",
                  ).trim(),
                  address: String(body.data.address || r.address || "").trim(),
                  practiceTransferAutoMatchEnabled: Boolean(
                    body.data.practiceTransferAutoMatchEnabled,
                  ),
                  verified: Boolean(body.data.verified),
                }
              : r,
          ),
        );
      }
    } catch (error) {
      console.error("[PracticeTransferAutoMatchTab] patch failed", error);
      setRows(prev);
      setEnabledCount(prevEnabled);
      toast({
        title: "저장 실패",
        description: "자동매칭 설정을 저장하지 못했습니다.",
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FlaskConical className="h-5 w-5" />
              기공의뢰 자동매칭
            </CardTitle>
            <CardDescription>
              ON한 검증 기공소만 자동매칭 공개 풀을 보고 선착순 수락할 수 있습니다.
            </CardDescription>
          </div>
          {!loading && totalCount > 0 ? (
            <Badge variant="secondary" className="tabular-nums">
              지정 {enabledCount} / {totalCount}
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="기공소명 또는 사업자번호"
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="px-1 py-10 text-center text-sm text-muted-foreground">
            불러오는 중…
          </div>
        ) : rows.length === 0 ? (
          <div className="px-1 py-10 text-center text-sm text-muted-foreground">
            해당하는 기공소가 없습니다.
          </div>
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {rows.map((row) => {
                const canEnable =
                  row.verified && row.canReceivePracticeTransfer;
                const metaParts = [
                  row.verified ? "검증" : row.status || null,
                  !row.canReceivePracticeTransfer
                    ? "기공의뢰 수신 불가"
                    : null,
                  row.representativeName || null,
                  row.address || null,
                ].filter(Boolean);
                return (
                  <li
                    key={row._id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5 transition-colors",
                      "hover:bg-muted/40",
                      row.practiceTransferAutoMatchEnabled &&
                        "border-primary/20 bg-primary/[0.03]",
                      !canEnable && "opacity-70",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {row.name || "이름 없음"}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {metaParts.length > 0
                          ? metaParts.join(" · ")
                          : "대표자·주소 없음"}
                      </div>
                    </div>
                    <Switch
                      checked={Boolean(row.practiceTransferAutoMatchEnabled)}
                      disabled={
                        savingId === row._id ||
                        (!canEnable &&
                          !row.practiceTransferAutoMatchEnabled)
                      }
                      onCheckedChange={(checked) =>
                        void onToggle(row, checked)
                      }
                      aria-label={`${row.name} 기공의뢰 자동매칭`}
                      className="shrink-0"
                    />
                  </li>
                );
              })}
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
  );
};
