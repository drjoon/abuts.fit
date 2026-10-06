// change-log:
// - 2026-10-02: 갤러리는 끝까지 스크롤하면 다음 3개를 이어 붙인다.
// - 2026-10-02: 갤러리 좌우 화살표로 3개씩 다음 페이지를 불러온다.
// - 2026-10-02: 더미설정 모달은 내용 높이만큼 열어 세로 스크롤을 없앤다.
// - 2026-10-02: 환자 줄에 치아번호를 붙이고, 썸네일 오른쪽 여백과 제거 X를 키운다.
// - 2026-10-02: 썸네일·로트 코드·가공 시간은 카드 오른쪽 끝에 둔다.
// - 2026-10-02: 치과 정보는 기공소·치과·환자·치아번호를 라벨과 함께 보여 준다.
// - 2026-10-02: 더미를 골라도 아래 추천 갤러리는 그대로 둔다.
// - 2026-10-02: 환자 정보는 기공소/환자/치과/치아를 한 줄로만 보여 준다.
// - 2026-10-02: 가공 시간은 로트 코드 아래에 굵게 둔다.
// - 2026-10-02: 환자는 기공소/환자/치과/치아 한 줄. 썸네일에 닿으면 줄바꿈.
// - 2026-10-02: 로트 문장은 빼고 각인 3글자를 썸네일 아래에 굵게 둔다.
// - 2026-10-02: 더미 카드에 기공소명을 표시한다.
// - 2026-10-02: 썸네일은 환자 정보 오른쪽에 둔다.
// - 2026-10-02: 더미 카드에 로트번호와 환자 정보를 다시 표시한다.
// - 2026-10-02: 추천 갤러리는 카드 2.5장만 보이게 한다.
// - 2026-10-02: 로트 검색창은 직경 번호 오른쪽 같은 줄에 둔다.
// - 2026-10-02: 추천 카드는 가운데 정렬하고 문구가 한 줄로 들어가게 넓힌다.
// - 2026-10-02: 더미 후보는 가공 5분 이상만 보여 준다.
// - 2026-10-02: 직경을 누르면 로트 없이도 가공이 짧은 3개를 추천한다.
// - 2026-10-02: 검색 카드에 가공 시간을 다른 색으로 표시. 짧은 순은 서버 정렬.
// - 2026-10-02: 검색은 작은 카드 3개씩 좌우 갤러리. 임플란트만 표시.
// - 2026-10-02: 저장된 더미 카드에 제거 X.
// - 2026-10-02: 더미 카드는 환자·임플란트를 가로로 두고 폭을 늘린다.
// - 2026-10-02: 로트 검색은 고른 직경 구간만 보여 준다. 5.5는 6이다.
// - 2026-10-02: 더미설정은 6·8·10·12·14 버튼을 누르면 그 직경을 고른다.
// - 2026-10-06: 장비 더미 가공은 단계와 무관하게 Next Up으로 넣는다.
// - 2026-10-02: 더미설정은 소재 직경별 저장만. 가공은 장비 카드에서 Next Up에 넣는다.
// - 2026-10-02: 더미 후보가 여러 개면 의뢰카드 폭으로 가로 스크롤해 고른다.
// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningQueueBoard.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/components/MachineQueueCard.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/FilledStlCardThumbnail.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestInfoSummary.tsx
// - web/backend/controllers/cnc/dummyProduct.js
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/shared/hooks/use-toast";
import { FilledStlCardThumbnail } from "@/pages/manufacturer/worksheet/custom_abutment/components/FilledStlCardThumbnail";
import type { ManufacturerRequest } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";

export type DummyProduct = {
  _id: string;
  requestId: string;
  lotNumber: string;
  assignedMachine: string | null;
  manufacturerStage: string | null;
  createdAt: string | null;
  hasNc: boolean;
  diameterFits?: boolean;
  durationSeconds?: number | null;
  requestor?: { name?: string; business?: string } | null;
  caseInfos?: ManufacturerRequest["caseInfos"];
};

type SavedDummy = {
  diameterGroup: string;
  product: DummyProduct | null;
  missingRequestId?: string | null;
};

const DIAMETER_GROUPS = ["6", "8", "10", "12", "14"] as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token?: string | null;
};

type ConfirmProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token?: string | null;
  machineId: string;
  machineName?: string;
  diameterGroup: string;
  onEnqueued?: () => void;
};

const SELECTED_CARD_CLASS = "w-full max-w-[32rem]";
const SEARCH_CARD_CLASS = "w-max min-w-[19rem] shrink-0 snap-start";
const SEARCH_PAGE_SIZE = 3;

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

function asThumbnailRequest(item: DummyProduct): ManufacturerRequest {
  return {
    _id: item._id,
    requestId: item.requestId,
    caseInfos: item.caseInfos || undefined,
  } as ManufacturerRequest;
}

function joinParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => String(part || "").trim())
    .filter((part) => part && part !== "-")
    .join(" / ");
}

function FieldLine({
  label,
  value,
  compact,
}: {
  label: string;
  value: string;
  compact: boolean;
}) {
  return (
    <p
      className={`whitespace-nowrap ${
        compact ? "text-[12px]" : "text-[13px]"
      }`}
    >
      <span className="mr-1.5 text-[10px] font-semibold tracking-wide text-slate-400">
        {label}
      </span>
      <span className="font-medium text-slate-800">{value || "-"}</span>
    </p>
  );
}

function lotShortCode(value?: string | null): string {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  const tail = raw.includes("-")
    ? raw.slice(raw.lastIndexOf("-") + 1)
    : raw.slice(-3);
  return tail.replace(/[^A-Z]/g, "").slice(-3);
}

function implantLabel(item: DummyProduct): string {
  const caseInfos = item.caseInfos;
  return joinParts([
    caseInfos?.implantManufacturer,
    caseInfos?.implantBrand,
    caseInfos?.implantFamily,
    caseInfos?.implantType,
  ]);
}

function geometryLabel(item: DummyProduct): string {
  const caseInfos = item.caseInfos;
  const parts: string[] = [];
  const connection = Number(caseInfos?.connectionDiameter);
  const max = Number(caseInfos?.maxDiameter);
  const length = Number(
    (caseInfos as { totalLength?: number | null } | undefined)?.totalLength,
  );
  if (Number.isFinite(connection) && connection > 0) {
    parts.push(`커넥션 Ø${connection.toFixed(2)}`);
  }
  if (Number.isFinite(max) && max > 0) {
    parts.push(`최대 Ø${max.toFixed(3)}`);
  }
  if (Number.isFinite(length) && length > 0) {
    parts.push(`길이 ${length.toFixed(2)}`);
  }
  return parts.join(" · ");
}

function formatMachiningTime(seconds?: number | null): string {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return "";
  const sec = Math.floor(total);
  const minutes = Math.floor(sec / 60);
  const remain = sec % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

function ProductSummary({
  item,
  compact = false,
}: {
  item: DummyProduct;
  compact?: boolean;
}) {
  const caseInfos = item.caseInfos;
  const lab =
    String(item.requestor?.business || "").trim() ||
    String(item.requestor?.name || "").trim();
  const clinic = String(caseInfos?.clinicName || "").trim();
  const patient = String(caseInfos?.patientName || "").trim();
  const tooth =
    caseInfos?.tooth != null ? String(caseInfos.tooth).trim() : "";
  const patientLine = [patient, tooth].filter(Boolean).join(" ");
  const code = lotShortCode(item.lotNumber);
  const line = implantLabel(item);
  const geometry = geometryLabel(item);
  const machiningTime = formatMachiningTime(item.durationSeconds);
  return (
    <div className="flex w-full items-start justify-between gap-3">
      <div className="shrink-0 space-y-0.5">
        <FieldLine label="기공소" value={lab} compact={compact} />
        <FieldLine label="치과" value={clinic} compact={compact} />
        <FieldLine label="환자" value={patientLine} compact={compact} />
        <p className="text-[10px] font-semibold tracking-wide text-slate-400">
          임플란트
        </p>
        <p
          className={`whitespace-nowrap font-medium text-slate-800 ${
            compact ? "text-[12px]" : "text-[13px]"
          }`}
        >
          {line || "-"}
        </p>
        {geometry ? (
          <p className="whitespace-nowrap text-[11px] tabular-nums text-slate-500">
            {geometry}
          </p>
        ) : null}
      </div>
      <div className="ml-auto mr-2 flex shrink-0 flex-col items-center gap-1">
          <div
            className={`overflow-hidden rounded-md border border-slate-200 bg-slate-100 ${
              compact ? "h-16 w-16" : "h-[72px] w-[72px]"
            }`}
          >
            <FilledStlCardThumbnail request={asThumbnailRequest(item)} />
          </div>
          {code ? (
            <p className="text-xs font-bold tracking-wide text-slate-900">
              {code}
            </p>
          ) : null}
          {machiningTime ? (
            <p className="text-xs font-bold tabular-nums text-sky-700">
              {machiningTime}
            </p>
          ) : null}
        </div>
    </div>
  );
}

async function fetchDummyPage(params: {
  token: string;
  lot: string;
  diameterGroup: string;
  skip: number;
  signal?: AbortSignal;
}): Promise<{ items: DummyProduct[]; hasMore: boolean; nextSkip: number }> {
  const query = new URLSearchParams({
    lot: params.lot,
    diameterGroup: params.diameterGroup,
    skip: String(params.skip),
    limit: String(SEARCH_PAGE_SIZE),
  });
  const res = await fetch(
    `/api/cnc-machines/dummy-product/search?${query.toString()}`,
    { headers: authHeaders(params.token), signal: params.signal },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    throw new Error(body?.message || "검색에 실패했습니다.");
  }
  const items = Array.isArray(body?.data?.items) ? body.data.items : [];
  const nextSkip = Number(body?.data?.nextSkip);
  return {
    items,
    hasMore: Boolean(body?.data?.hasMore),
    nextSkip: Number.isFinite(nextSkip) ? nextSkip : params.skip + items.length,
  };
}

export function DummyMachiningModal({
  open,
  onOpenChange,
  token,
}: Props) {
  const { toast } = useToast();
  const [saved, setSaved] = useState<SavedDummy[]>([]);
  const [group, setGroup] = useState("");
  const [loading, setLoading] = useState(false);
  const [lotQuery, setLotQuery] = useState("");
  const [results, setResults] = useState<DummyProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextSkip, setNextSkip] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectingId, setSelectingId] = useState("");
  const [clearing, setClearing] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLLIElement>(null);
  const loadingMoreRef = useRef(false);
  const nextSkipRef = useRef(0);
  const hasMoreRef = useRef(false);
  const queryKeyRef = useRef("");

  const resetGallery = () => {
    setResults([]);
    setSearched(false);
    setHasMore(false);
    setNextSkip(0);
  };

  const openGroup = (next: string) => {
    setGroup(next);
    setLotQuery("");
    resetGallery();
  };

  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    setGroup("");
    setLotQuery("");
    resetGallery();
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/cnc-machines/dummy-product", {
          headers: authHeaders(token),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body?.success === false) {
          throw new Error(body?.message || "더미 제품을 불러오지 못했습니다.");
        }
        if (cancelled) return;
        setSaved(Array.isArray(body?.data?.items) ? body.data.items : []);
      } catch (error) {
        if (cancelled) return;
        setSaved([]);
        toast({
          title: "더미 조회 실패",
          description:
            error instanceof Error
              ? error.message
              : "더미 제품을 불러오지 못했습니다.",
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, token, toast]);

  useEffect(() => {
    if (!open || !token || !group) return;
    const lot = lotQuery.trim();
    const ac = new AbortController();
    const key = `${group}|${lot}`;
    queryKeyRef.current = key;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void (async () => {
        try {
          const page = await fetchDummyPage({
            token,
            lot,
            diameterGroup: group,
            skip: 0,
            signal: ac.signal,
          });
          if (queryKeyRef.current !== key) return;
          setResults(page.items);
          setHasMore(page.hasMore);
          setNextSkip(page.nextSkip);
          setSearched(true);
        } catch (error) {
          if ((error as { name?: string })?.name === "AbortError") return;
          if (queryKeyRef.current !== key) return;
          setResults([]);
          setHasMore(false);
          setNextSkip(0);
          setSearched(true);
          toast({
            title: "검색 실패",
            description:
              error instanceof Error ? error.message : "검색에 실패했습니다.",
            variant: "destructive",
          });
        } finally {
          if (!ac.signal.aborted) setSearching(false);
        }
      })();
    }, 300);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [open, lotQuery, token, toast, group]);

  useEffect(() => {
    nextSkipRef.current = nextSkip;
    hasMoreRef.current = hasMore;
    loadingMoreRef.current = loadingMore;
  }, [nextSkip, hasMore, loadingMore]);

  const loadMore = async () => {
    if (loadingMoreRef.current || searching || !token || !group || !hasMoreRef.current) {
      return;
    }
    const lot = lotQuery.trim();
    const key = `${group}|${lot}`;
    const skip = nextSkipRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchDummyPage({
        token,
        lot,
        diameterGroup: group,
        skip,
      });
      if (queryKeyRef.current !== key) return;
      setResults((prev) => {
        const seen = new Set(prev.map((item) => item.requestId));
        const extra = page.items.filter((item) => !seen.has(item.requestId));
        return extra.length ? [...prev, ...extra] : prev;
      });
      const more = Boolean(page.hasMore) && page.items.length > 0;
      hasMoreRef.current = more;
      nextSkipRef.current = page.nextSkip;
      setHasMore(more);
      setNextSkip(page.nextSkip);
    } catch (error) {
      if (queryKeyRef.current !== key) return;
      hasMoreRef.current = false;
      setHasMore(false);
      toast({
        title: "검색 실패",
        description:
          error instanceof Error ? error.message : "검색에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    const root = scrollerRef.current;
    const target = sentinelRef.current;
    if (!open || !token || !group || !root || !target || !hasMore || searching) {
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        void loadMore();
      },
      { root, rootMargin: "0px 80px 0px 0px", threshold: 0.1 },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [open, token, group, lotQuery, hasMore, searching, loadingMore, results.length, toast]);

  const scrollGallery = (direction: -1 | 1) => {
    const root = scrollerRef.current;
    if (!root) return;
    const nearEnd =
      root.scrollLeft + root.clientWidth >= root.scrollWidth - 24;
    if (direction > 0 && nearEnd) {
      void loadMore();
      return;
    }
    root.scrollBy({
      left: direction * Math.max(root.clientWidth * 0.8, 160),
      behavior: "smooth",
    });
  };

  const current = saved.find((row) => row.diameterGroup === group) || null;
  const product = current?.product || null;

  const selectProduct = async (requestId: string) => {
    if (!token || selectingId || !group) return;
    const target = results.find((item) => item.requestId === requestId);
    if (target?.diameterFits === false) return;
    setSelectingId(requestId);
    try {
      const res = await fetch("/api/cnc-machines/dummy-product", {
        method: "PUT",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requestId, diameterGroup: group }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) {
        throw new Error(body?.message || "더미 제품 저장에 실패했습니다.");
      }
      const nextProduct = body?.data?.product || null;
      setSaved((prev) => {
        const rest = prev.filter((row) => row.diameterGroup !== group);
        return [
          ...rest,
          { diameterGroup: group, product: nextProduct, missingRequestId: null },
        ];
      });
      toast({ title: `Ø${group} 더미를 저장했습니다.` });
    } catch (error) {
      toast({
        title: "저장 실패",
        description:
          error instanceof Error
            ? error.message
            : "더미 제품 저장에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setSelectingId("");
    }
  };

  const clearProduct = async () => {
    if (!token || !group || clearing) return;
    setClearing(true);
    try {
      const params = new URLSearchParams({ diameterGroup: group });
      const res = await fetch(
        `/api/cnc-machines/dummy-product?${params.toString()}`,
        { method: "DELETE", headers: authHeaders(token) },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) {
        throw new Error(body?.message || "더미 제거에 실패했습니다.");
      }
      setSaved((prev) => prev.filter((row) => row.diameterGroup !== group));
      toast({ title: `Ø${group} 더미를 제거했습니다.` });
    } catch (error) {
      toast({
        title: "제거 실패",
        description:
          error instanceof Error ? error.message : "더미 제거에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setClearing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`flex flex-col gap-0 overflow-hidden rounded-2xl border border-slate-200/80 p-0 sm:p-0 shadow-[0_24px_64px_rgba(15,23,42,0.28)] ${
          group ? "sm:max-w-[54rem]" : "sm:max-w-[24rem]"
        }`}
      >
        <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4 sm:px-6">
          <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">
            더미설정
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-xs text-slate-500">
            {group
              ? lotQuery.trim()
                ? `Ø${group} 소재에 맞는 제품을 로트번호로 찾습니다.`
                : "가공 5분 이상 중 짧은 3개를 추천합니다."
              : "직경을 누르면 더미를 고릅니다."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 px-5 py-4 sm:px-6">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">로딩…</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {DIAMETER_GROUPS.map((item) => {
                  const hasProduct = Boolean(
                    saved.find((row) => row.diameterGroup === item)?.product,
                  );
                  return (
                    <button
                      key={item}
                      type="button"
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                        item === group
                          ? "border-slate-900 bg-slate-900 text-white"
                          : hasProduct
                            ? "border-slate-900 bg-white text-slate-900 hover:bg-slate-50"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                      onClick={() => openGroup(item)}
                    >
                      {item}
                    </button>
                  );
                })}
                <input
                  value={lotQuery}
                  onChange={(event) => setLotQuery(event.target.value)}
                  placeholder="로트번호"
                  disabled={!group}
                  className="h-8 w-36 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary disabled:bg-slate-50"
                />
              </div>
              {group ? (
                <>
                  {product || current?.missingRequestId ? (
                    <div
                      className="relative mx-auto w-full max-w-[28rem] rounded-2xl border border-sky-200 bg-sky-50 py-3 pl-3 pr-12 shadow-[0_12px_28px_rgba(14,116,144,0.16)]"
                    >
                      <button
                        type="button"
                        title="더미 제거"
                        aria-label="더미 제거"
                        disabled={clearing}
                        className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-50"
                        onClick={() => void clearProduct()}
                      >
                        <X className="h-5 w-5" />
                      </button>
                      {product ? (
                        <ProductSummary item={product} />
                      ) : (
                        <p className="py-4 text-sm text-slate-500">
                          저장된 더미 제품을 찾지 못했습니다.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-center text-sm text-slate-500">더미가 없습니다.</p>
                  )}
                  <div className="relative mx-auto w-[calc(2.5*19rem+1.5rem)] max-w-full">
                    {results.length > 0 ? (
                      <>
                        <button
                          type="button"
                          title="이전"
                          aria-label="이전"
                          disabled={loadingMore}
                          className="absolute left-0 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md hover:bg-slate-50 disabled:opacity-30"
                          onClick={() => scrollGallery(-1)}
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          title="다음"
                          aria-label="다음"
                          disabled={loadingMore || searching}
                          className="absolute right-0 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md hover:bg-slate-50 disabled:opacity-30"
                          onClick={() => scrollGallery(1)}
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      </>
                    ) : null}
                    <div
                      ref={scrollerRef}
                      className="min-w-0 snap-x snap-mandatory overflow-x-auto px-10 py-1.5"
                    >
                      {searching ? (
                        <p className="py-6 text-center text-sm text-slate-500">
                          검색 중…
                        </p>
                      ) : results.length > 0 ? (
                        <ul className="flex w-max gap-3">
                          {results
                            .filter((item) => item.diameterFits !== false)
                            .map((item) => {
                              const selected =
                                product?.requestId === item.requestId;
                              const busy = selectingId === item.requestId;
                              return (
                                <li
                                  key={item._id || item.requestId}
                                  className={`${SEARCH_CARD_CLASS} app-glass-card flex flex-col gap-2 rounded-2xl px-3 py-3`}
                                >
                                  <ProductSummary item={item} compact />
                                  <button
                                    type="button"
                                    disabled={Boolean(selectingId) || selected}
                                    className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                                    onClick={() =>
                                      void selectProduct(item.requestId)
                                    }
                                  >
                                    {selected
                                      ? "선택됨"
                                      : busy
                                        ? "저장 중…"
                                        : "선택"}
                                  </button>
                                </li>
                              );
                            })}
                          <li
                            ref={sentinelRef}
                            className="w-px shrink-0 snap-none self-stretch"
                            aria-hidden
                          />
                          {loadingMore ? (
                            <li className="flex w-16 shrink-0 items-center text-[11px] text-slate-500">
                              불러오는 중…
                            </li>
                          ) : null}
                        </ul>
                      ) : searched ? (
                        <p className="py-6 text-center text-sm text-slate-500">
                          {lotQuery.trim()
                            ? "이 직경에 맞는 제품이 없습니다."
                            : "이 직경에 추천할 제품이 없습니다."}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DummyNextUpConfirm({
  open,
  onOpenChange,
  token,
  machineId,
  machineName,
  diameterGroup,
  onEnqueued,
}: ConfirmProps) {
  const { toast } = useToast();
  const [product, setProduct] = useState<DummyProduct | null>(null);
  const [missing, setMissing] = useState(false);
  const [otherGroups, setOtherGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !token || !diameterGroup) {
      if (open && !diameterGroup) {
        setProduct(null);
        setMissing(false);
        setOtherGroups([]);
        setLoading(false);
      }
      return;
    }
    let cancelled = false;
    setLoading(true);
    setProduct(null);
    setMissing(false);
    setOtherGroups([]);
    void (async () => {
      try {
        const res = await fetch("/api/cnc-machines/dummy-product", {
          headers: authHeaders(token),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body?.success === false) {
          throw new Error(body?.message || "더미 제품을 불러오지 못했습니다.");
        }
        if (cancelled) return;
        const items: SavedDummy[] = Array.isArray(body?.data?.items)
          ? body.data.items
          : [];
        const wanted = String(diameterGroup || "").trim();
        const row = items.find(
          (item) => String(item?.diameterGroup || "").trim() === wanted,
        );
        setProduct(row?.product || null);
        setMissing(Boolean(row?.missingRequestId) && !row?.product);
        setOtherGroups(
          items
            .filter(
              (item) =>
                item?.product &&
                String(item.diameterGroup || "").trim() &&
                String(item.diameterGroup || "").trim() !== wanted,
            )
            .map((item) => String(item.diameterGroup).trim()),
        );
      } catch (error) {
        if (cancelled) return;
        toast({
          title: "더미 조회 실패",
          description:
            error instanceof Error
              ? error.message
              : "더미 제품을 불러오지 못했습니다.",
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, token, diameterGroup, toast]);

  const canEnqueue = Boolean(product);

  const confirm = async () => {
    if (!token || !machineId || saving || !canEnqueue) return;
    setSaving(true);
    try {
      const res = await fetch("/api/cnc-machines/dummy-product/enqueue", {
        method: "POST",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ machineId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) {
        throw new Error(body?.message || "Next Up에 넣지 못했습니다.");
      }
      toast({
        title: "Next Up",
        description: `${machineName || machineId}의 첫 번째로 넣었습니다.`,
      });
      onOpenChange(false);
      onEnqueued?.();
    } catch (error) {
      toast({
        title: "넣기 실패",
        description:
          error instanceof Error ? error.message : "Next Up에 넣지 못했습니다.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden rounded-2xl border border-slate-200/80 p-0 shadow-[0_24px_64px_rgba(15,23,42,0.28)] sm:max-w-[36rem] sm:p-0">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4">
          <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">
            더미 가공
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-xs text-slate-500">
            {machineName || machineId} · Ø{diameterGroup}
          </DialogDescription>
        </DialogHeader>
        <div className="px-5 py-4">
          {loading ? (
            <p className="py-6 text-center text-sm text-slate-500">로딩…</p>
          ) : !diameterGroup ? (
            <p className="py-6 text-sm text-slate-500">소재 직경이 없습니다.</p>
          ) : product ? (
            <div className="mx-auto w-full max-w-[28rem] space-y-3">
              <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3 shadow-[0_12px_28px_rgba(14,116,144,0.16)]">
                <ProductSummary item={product} />
              </div>
              <p className="text-center text-xs text-slate-600">
                확인하면 Next Up 첫 번째로 넣습니다.
              </p>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">
              {missing ? (
                "저장된 더미 제품을 찾지 못했습니다."
              ) : otherGroups.length ? (
                <>
                  이 장비는 Ø{diameterGroup}입니다.
                  <br />
                  더미는 Ø{otherGroups.join(", Ø")}에 있습니다.
                </>
              ) : (
                `Ø${diameterGroup} 더미가 없습니다.`
              )}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => onOpenChange(false)}
          >
            취소
          </button>
          <button
            type="button"
            disabled={!canEnqueue || saving}
            className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            onClick={() => void confirm()}
          >
            {saving ? "넣는 중…" : "확인"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
