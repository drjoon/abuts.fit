// change-log:
// - 2026-08-16: 필터 상단 구분선·상태 뱃지 필터. 카드 테스트 드롭다운→상태 뱃지.
// - 2026-08-16: 「인증 기공소」라벨·테스트 여부·메모·인증 상태 편집.
// - 2026-08-14: 수수료 스트립을 같은 카드에 합치고 안내 문구 중복 제거.
// - 2026-08-14: 카드 제목「인증 기공소」·식별 비공개·자동매칭 참여 카피로 정리.
// - 2026-08-13: 목록·검색·카드 UI를 최신 파트너 설정 스타일로 정리.
// related files:
// - web/backend/modules/devops/practiceTransferAutoMatch.routes.js
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
// - web/frontend/src/pages/devops/components/DevopsPlatformFeeTab.tsx
// - web/frontend/src/shared/practice/abutsLabCertification.ts
// - web/backend/utils/practiceTransferAutoMatch.js
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Building2, FlaskConical, Search } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";
import { DevopsPlatformFeeTab } from "@/pages/devops/components/DevopsPlatformFeeTab";
import {
  type AbutsLabCertificationPublic,
  type AbutsLabCertStatus,
  parseAbutsLabCertification,
} from "@/shared/practice/abutsLabCertification";

const PAGE_LIMIT = 15;

/** 관리자 목록·카드 공통 상태 뱃지 (미신청 / 테스트중 / 인증) */
const CERT_BADGE_FILTERS = [
  { id: "none", label: "미신청", status: "none" as AbutsLabCertStatus },
  { id: "testing", label: "테스트중", status: "testing" as AbutsLabCertStatus },
  {
    id: "certified",
    label: "인증",
    status: "certified" as AbutsLabCertStatus,
  },
] as const;

type CertBadgeFilterId = (typeof CERT_BADGE_FILTERS)[number]["id"] | "all";

type AutoMatchRow = {
  _id: string;
  name: string;
  businessNumberNormalized: string;
  status: string;
  representativeName: string;
  address: string;
  practiceTransferAutoMatchEnabled: boolean;
  abutsLabCertification: AbutsLabCertificationPublic;
  verified: boolean;
  canReceivePracticeTransfer: boolean;
};

function resolveCertBadgeId(row: AutoMatchRow): CertBadgeFilterId {
  if (
    row.practiceTransferAutoMatchEnabled ||
    row.abutsLabCertification.status === "certified"
  ) {
    return "certified";
  }
  if (
    row.abutsLabCertification.status === "applied" ||
    row.abutsLabCertification.status === "testing"
  ) {
    return "testing";
  }
  return "none";
}

function mapRow(row: Partial<AutoMatchRow> & { _id?: string }): AutoMatchRow {
  const enabled = Boolean(row?.practiceTransferAutoMatchEnabled);
  return {
    _id: String(row?._id || ""),
    name: String(row?.name || ""),
    businessNumberNormalized: String(row?.businessNumberNormalized || ""),
    status: String(row?.status || ""),
    representativeName: String(row?.representativeName || "").trim(),
    address: String(row?.address || "").trim(),
    practiceTransferAutoMatchEnabled: enabled,
    abutsLabCertification: parseAbutsLabCertification(
      row?.abutsLabCertification,
      { enabled },
    ),
    verified: Boolean(row?.verified),
    canReceivePracticeTransfer: Boolean(row?.canReceivePracticeTransfer),
  };
}

function certBadgeClass(id: CertBadgeFilterId, active: boolean) {
  if (id === "certified") {
    return active
      ? "bg-primary-strong text-white ring-primary-strong"
      : "bg-primary-soft/50 text-primary-strong ring-primary-muted/70 hover:bg-primary-soft";
  }
  if (id === "testing") {
    return active
      ? "bg-amber-500 text-white ring-amber-500"
      : "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100";
  }
  return active
    ? "bg-slate-700 text-white ring-slate-700"
    : "bg-slate-100 text-slate-700 ring-slate-200 hover:bg-slate-200/80";
}

export const PracticeTransferAutoMatchTab = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [certFilter, setCertFilter] = useState<CertBadgeFilterId>("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [rows, setRows] = useState<AutoMatchRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [enabledCount, setEnabledCount] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [memoDrafts, setMemoDrafts] = useState<Record<string, string>>({});

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

  const mergeRows = useCallback((list: AutoMatchRow[], append: boolean) => {
    setRows((prev) => (append ? [...prev, ...list] : list));
    setMemoDrafts((prev) => {
      const next = append ? { ...prev } : {};
      for (const row of list) {
        next[row._id] = row.abutsLabCertification.memo || "";
      }
      return next;
    });
  }, []);

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
        if (certFilter !== "all") qs.set("certFilter", certFilter);

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
        const body = (res.data || {}) as {
          data?: AutoMatchRow[];
          pagination?: {
            page?: number;
            limit?: number;
            total?: number;
            hasMore?: boolean;
          };
          enabledCount?: number;
        };
        const list: AutoMatchRow[] = Array.isArray(body.data)
          ? body.data.map((row) => mapRow(row))
          : [];

        mergeRows(list, append);
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
    [certFilter, debouncedQ, mergeRows, toast, token],
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

  const patchRow = async (
    row: AutoMatchRow,
    patch: {
      enabled?: boolean;
      status?: AbutsLabCertStatus;
      memo?: string;
    },
  ) => {
    if (!token || savingId) return;
    if (
      (patch.enabled === true || patch.status === "certified") &&
      !row.verified
    ) {
      toast({
        title: "검증 기공소만 가능",
        description: "검증된 기공소만 인증(ON)할 수 있습니다.",
        variant: "destructive",
      });
      return;
    }
    if (
      (patch.enabled === true || patch.status === "certified") &&
      !row.canReceivePracticeTransfer
    ) {
      toast({
        title: "인증 불가",
        description:
          "기공의뢰를 수신할 수 있는 기공소만 인증(ON)할 수 있습니다.",
        variant: "destructive",
      });
      return;
    }
    setSavingId(row._id);
    const prev = rows;
    const prevEnabled = enabledCount;
    const wasEnabled = Boolean(row.practiceTransferAutoMatchEnabled);
    if (typeof patch.enabled === "boolean") {
      setRows((cur) =>
        cur.map((r) =>
          r._id === row._id
            ? { ...r, practiceTransferAutoMatchEnabled: patch.enabled === true }
            : r,
        ),
      );
      setEnabledCount((c) =>
        Math.max(0, c + (patch.enabled ? 1 : patch.enabled === false ? -1 : 0)),
      );
    }
    if (patch.status) {
      setRows((cur) =>
        cur.map((r) =>
          r._id === row._id
            ? {
                ...r,
                abutsLabCertification: {
                  ...r.abutsLabCertification,
                  status: patch.status as AbutsLabCertStatus,
                },
              }
            : r,
        ),
      );
    }
    try {
      const res = await request<{
        success?: boolean;
        data?: AutoMatchRow;
      }>({
        path: `/api/devops/practice-transfer-auto-match/${encodeURIComponent(row._id)}`,
        method: "PATCH",
        token,
        jsonBody: patch,
      });
      if (!res.ok) {
        throw new Error("저장 실패");
      }
      const body = (res.data || {}) as {
        data?: Partial<AutoMatchRow> & { _id?: string };
      };
      if (body?.data?._id) {
        const mapped = mapRow({ ...row, ...body.data });
        setRows((cur) =>
          cur.map((r) => (r._id === mapped._id ? mapped : r)),
        );
        setMemoDrafts((cur) => ({
          ...cur,
          [mapped._id]: mapped.abutsLabCertification.memo || "",
        }));
        if (mapped.practiceTransferAutoMatchEnabled !== wasEnabled) {
          if (typeof patch.enabled !== "boolean") {
            setEnabledCount((c) =>
              Math.max(
                0,
                c + (mapped.practiceTransferAutoMatchEnabled ? 1 : -1),
              ),
            );
          } else {
            setEnabledCount(
              Math.max(
                0,
                prevEnabled +
                  (mapped.practiceTransferAutoMatchEnabled ? 1 : 0) -
                  (wasEnabled ? 1 : 0),
              ),
            );
          }
        }
      }
    } catch (error) {
      console.error("[PracticeTransferAutoMatchTab] patch failed", error);
      setRows(prev);
      setEnabledCount(prevEnabled);
      toast({
        title: "저장 실패",
        description: "인증 기공소 설정을 저장하지 못했습니다.",
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card className="app-glass-card app-glass-card--lg overflow-hidden">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft/60 ring-1 ring-primary-muted/70">
              <FlaskConical className="h-5 w-5 text-primary-strong" />
            </span>
            <div className="min-w-0 space-y-1">
              <h3 className="text-base font-semibold tracking-tight text-slate-900">
                인증 기공소
              </h3>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                기공소 신청 → 기공 테스트 → 통과 시 인증. 인증 기공소만 자동
                매칭 풀에 참여합니다. 치과·기공소 식별 정보는 비공개입니다.
              </p>
            </div>
          </div>
          {!loading && totalCount > 0 ? (
            <span className="inline-flex items-center rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold tabular-nums text-primary-strong ring-1 ring-primary-muted">
              인증 {enabledCount} / {totalCount}
            </span>
          ) : null}
        </div>

        <DevopsPlatformFeeTab />

        <div className="space-y-4 border-t border-slate-200/80 pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="기공소명 또는 사업자번호"
                className="h-11 rounded-xl border-slate-200 bg-white pl-10 shadow-sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {CERT_BADGE_FILTERS.map((badge) => {
                const active = certFilter === badge.id;
                return (
                  <button
                    key={badge.id}
                    type="button"
                    onClick={() =>
                      setCertFilter((prev) =>
                        prev === badge.id ? "all" : badge.id,
                      )
                    }
                    className={cn(
                      "inline-flex items-center rounded-full px-3 py-1.5 text-[12px] font-semibold ring-1 transition-colors",
                      certBadgeClass(badge.id, active),
                    )}
                  >
                    {badge.label}
                  </button>
                );
              })}
            </div>
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
                검색어·상태 필터를 바꾸거나 다른 기공소를 확인해 보세요.
              </p>
            </div>
          ) : (
            <>
              <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {rows.map((row) => {
                  const canEnable =
                    row.verified && row.canReceivePracticeTransfer;
                  const enabled = Boolean(row.practiceTransferAutoMatchEnabled);
                  const cert = row.abutsLabCertification;
                  const badgeId = resolveCertBadgeId(row);
                  const busy = savingId === row._id;
                  return (
                    <li
                      key={row._id}
                      className={cn(
                        "overflow-hidden rounded-2xl border bg-white/80 shadow-sm transition-shadow hover:shadow-md",
                        enabled
                          ? "border-primary-muted/70"
                          : "border-slate-200/80",
                        !canEnable && !enabled && "opacity-70",
                      )}
                    >
                      <div
                        className={cn(
                          "h-1 w-full",
                          enabled
                            ? "bg-primary-strong"
                            : badgeId === "testing"
                              ? "bg-amber-400"
                              : row.verified
                                ? "bg-slate-300"
                                : "bg-amber-400",
                        )}
                      />
                      <div className="space-y-3 px-4 py-3.5">
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate font-semibold text-slate-900">
                                {row.name || "이름 없음"}
                              </p>
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
                                  certBadgeClass(badgeId, true),
                                )}
                              >
                                {
                                  CERT_BADGE_FILTERS.find((b) => b.id === badgeId)
                                    ?.label
                                }
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
                              {!row.canReceivePracticeTransfer ? (
                                <p className="text-[11px] text-amber-700">
                                  기공의뢰 수신 불가
                                </p>
                              ) : null}
                            </dl>
                          </div>
                          <Switch
                            checked={enabled}
                            disabled={busy || (!canEnable && !enabled)}
                            onCheckedChange={(checked) =>
                              void patchRow(row, { enabled: checked })
                            }
                            aria-label={`${row.name} 인증 기공소`}
                            className="mt-1 shrink-0"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <p className="text-[12px] font-medium text-slate-600">
                            기공 테스트
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {CERT_BADGE_FILTERS.map((badge) => {
                              const active = badgeId === badge.id;
                              return (
                                <button
                                  key={badge.id}
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    if (active) return;
                                    void patchRow(row, {
                                      status: badge.status,
                                    });
                                  }}
                                  className={cn(
                                    "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition-colors disabled:opacity-60",
                                    certBadgeClass(badge.id, active),
                                  )}
                                >
                                  {badge.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[12px] font-medium text-slate-600">
                            인증 메모
                          </label>
                          <Textarea
                            value={memoDrafts[row._id] ?? cert.memo}
                            disabled={busy}
                            rows={2}
                            placeholder="테스트 일정·결과·특이사항 등"
                            className="min-h-[64px] resize-y rounded-xl border-slate-200 bg-white text-sm"
                            onChange={(e) =>
                              setMemoDrafts((cur) => ({
                                ...cur,
                                [row._id]: e.target.value,
                              }))
                            }
                            onBlur={() => {
                              const next = String(
                                memoDrafts[row._id] ?? cert.memo,
                              ).trim();
                              if (next === String(cert.memo || "").trim())
                                return;
                              void patchRow(row, { memo: next });
                            }}
                          />
                        </div>
                      </div>
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
        </div>
      </CardContent>
    </Card>
  );
};
