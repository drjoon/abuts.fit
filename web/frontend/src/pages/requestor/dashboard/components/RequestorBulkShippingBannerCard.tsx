// change-log:
// - 2026-08-06: 출고 카드/모달 문구·레이아웃 정리.
// - 2026-08-06: 카드 제목/설명 정리. 대기수량·다음출고 예정 제거.
// - 2026-08-06: 배송/발송 표기를 출고로 통일 (제조사 출발일).
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, Clock, Package, Zap } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { formatDateWithDay, formatDateOnly } from "@/utils/dateFormat";
import type { PeriodFilterValue } from "@/shared/ui/periodFilterValues";
import { periodToRange } from "@/store/usePeriodStore";

interface ShippingPackageSummaryItem {
  id: string;
  shipDateYmd: string;
  requestCount: number;
  shippingFeeSupply: number;
  createdAt?: string;
}

interface ShippingPackageSummaryRequest {
  id: string;
  requestId: string;
  title: string;
  caseInfos: any;
  manufacturerStage: string;
  createdAt?: string;
  timeline?: {
    nextEstimatedShipYmd?: string | null;
    estimatedShipYmd?: string | null;
    originalEstimatedShipYmd?: string | null;
  };
  _id?: string | null;
}

interface ShippingPackagesSummaryResponse {
  success: boolean;
  data: {
    today: {
      shipDateYmd: string;
      packageCount: number;
      shippingFeeSupplyTotal: number;
    };
    lastNDays: {
      days: number;
      packageCount: number;
      shippingFeeSupplyTotal: number;
    };
    items: ShippingPackageSummaryItem[];
  };
}

type Props = {
  onOpenBulkModal: () => void;
  bulkData?: {
    pre?: ShippingItemApi[];
    post?: ShippingItemApi[];
    waiting?: ShippingItemApi[];
  } | null;
  onRefresh?: () => void;
  /** 대시보드 기간 필터. 오늘 출고/대기 내역을 createdAt 기준으로 좁힌다. */
  period?: PeriodFilterValue;
};

const periodToShippingSummaryDays = (period: PeriodFilterValue): number => {
  if (period === "90d") return 90;
  if (period === "30d") return 30;
  const range = periodToRange(period, {
    customStartDate: "",
    customEndDate: "",
  });
  const startMs = new Date(range.startDate).getTime();
  const endMs = new Date(range.endDate).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return 30;
  }
  return Math.max(1, Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1);
};

const isCreatedAtInPeriod = (
  createdAt: unknown,
  period: PeriodFilterValue,
  options?: { includeMissing?: boolean },
): boolean => {
  if (!createdAt) return Boolean(options?.includeMissing);
  const createdMs = new Date(createdAt as string | Date).getTime();
  if (!Number.isFinite(createdMs)) return Boolean(options?.includeMissing);
  const range = periodToRange(period, {
    customStartDate: "",
    customEndDate: "",
  });
  const startMs = new Date(range.startDate).getTime();
  const endMs = new Date(range.endDate).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  return createdMs >= startMs && createdMs <= endMs;
};

type DiameterKey = "d6" | "d8" | "d10" | "d12";

type LeadTimeEntry = {
  minBusinessDays: number;
  maxBusinessDays: number;
};

type ManufacturerLeadTimeData = {
  leadTimes: Record<DiameterKey, LeadTimeEntry>;
  weeklyBatchDays: string[];
};

const DEFAULT_MANUFACTURER_LEAD_TIMES: Record<DiameterKey, LeadTimeEntry> = {
  d6: { minBusinessDays: 1, maxBusinessDays: 2 },
  d8: { minBusinessDays: 1, maxBusinessDays: 2 },
  d10: { minBusinessDays: 4, maxBusinessDays: 7 },
  d12: { minBusinessDays: 4, maxBusinessDays: 7 },
};

const DIAMETER_LABELS: Record<DiameterKey, string> = {
  d6: "직경 6mm",
  d8: "직경 8mm",
  d10: "직경 10mm",
  d12: "직경 12mm",
};

const SHIP_OUT_INFO_MESSAGE =
  "출고일은 리드타임 기준으로 계산됩니다. 묶음출고는 자정까지 접수시 다음 날 오후 4시 출고, 신속출고는 정오까지 접수시 당일 오후 4시 출고됩니다.";

type ShippingItemApi = {
  id: string;
  mongoId?: string;
  title?: string;
  clinic?: string;
  patient?: string;
  tooth?: string;
  diameter?: string;
  stageKey?: "request" | "cam" | "production" | "shipping" | "cancel";
  stageLabel?: string;
  shippingMode?: "normal" | "express";
  requestedShipDate?: string;
  shipDateYmd?: string | null;
  estimatedShipYmd?: string | null; // next ETA 우선(백엔드 매핑)
  originalEstimatedShipYmd?: string | null;
  nextEstimatedShipYmd?: string | null;
  createdAt?: string | Date | null;
};

export const RequestorBulkShippingBannerCard = ({
  onOpenBulkModal,
  bulkData,
  onRefresh,
  period = "30d",
}: Props) => {
  const { token, user } = useAuthStore();
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEtaReady, setIsEtaReady] = useState(false);
  const etaWaitStartRef = useRef<number | null>(null);
  const [leadTimeData, setLeadTimeData] =
    useState<ManufacturerLeadTimeData | null>(null);
  const [isLeadTimeLoading, setIsLeadTimeLoading] = useState(false);
  const [isLeadTimeModalOpen, setIsLeadTimeModalOpen] = useState(false);
  const [todayBoxDialogOpen, setTodayBoxDialogOpen] = useState(false);

  const canAccessShippingSummary = user?.role === "requestor";
  const shippingSummaryDays = periodToShippingSummaryDays(period);

  const { data: shippingSummaryData, isLoading: isShippingSummaryLoading } =
    useQuery({
      queryKey: ["requestor-shipping-packages-summary", period, shippingSummaryDays],
      enabled: Boolean(token && canAccessShippingSummary),
      queryFn: async () => {
        const params = new URLSearchParams();
        params.set("days", String(shippingSummaryDays));

        const res = await apiFetch<ShippingPackagesSummaryResponse>({
          path: `/api/requests/my/shipping-packages?${params.toString()}`,
          method: "GET",
          token,
        });

        if (!res.ok || !res.data?.success) {
          throw new Error("출고 패키지 요약 조회에 실패했습니다.");
        }
        return res.data.data;
      },
      staleTime: 60 * 1000,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    });

  const shippingMemo = useMemo(() => {
    if (!shippingSummaryData) {
      return {
        todayCount: 0,
        todayRequests: [] as ShippingPackageSummaryRequest[],
      };
    }

    const items = Array.isArray(shippingSummaryData.items)
      ? shippingSummaryData.items
      : [];
    const todayShipYmd = shippingSummaryData.today?.shipDateYmd;
    const todayPackages = items.filter((it) => it.shipDateYmd === todayShipYmd);
    const todayRequests = todayPackages
      .flatMap((it) =>
        Array.isArray((it as any).requests) ? (it as any).requests : [],
      )
      .filter((req: ShippingPackageSummaryRequest) =>
        isCreatedAtInPeriod(req?.createdAt, period, { includeMissing: false }),
      );

    // 기간 밖 의뢰만 남은 박스는 카운트에서 제외
    const todayCount = todayPackages.filter((pkg) => {
      const requests = Array.isArray((pkg as any).requests)
        ? (pkg as any).requests
        : [];
      if (requests.length === 0) {
        // 요청 상세가 없으면 패키지 단위는 유지(레거시 응답 호환)
        return true;
      }
      return requests.some((req: ShippingPackageSummaryRequest) =>
        isCreatedAtInPeriod(req?.createdAt, period, { includeMissing: false }),
      );
    }).length;

    return {
      todayCount,
      todayRequests: todayRequests ?? [],
    };
  }, [period, shippingSummaryData]);

  const [originalBulkEtaById, setOriginalBulkEtaById] = useState<
    Record<string, string | null>
  >({});

  // 샘플 데이터 (실제로는 API에서 가져올 데이터)
  const [items, setItems] = useState<ShippingItemApi[]>([]);

  useEffect(() => {
    const next: ShippingItemApi[] = [
      ...(bulkData?.pre || []),
      ...(bulkData?.post || []),
      ...(bulkData?.waiting || []),
    ]
      .filter(Boolean)
      // 스냅샷 재계산 전 createdAt 없는 레거시 항목은 유지
      .filter((it) =>
        isCreatedAtInPeriod(it?.createdAt, period, { includeMissing: true }),
      );
    setItems(next);
  }, [bulkData, period]);

  const hasAnyEta = useMemo(() => {
    return items.some((it) => Boolean(it.estimatedShipYmd));
  }, [items]);

  useEffect(() => {
    if (!isModalOpen) {
      etaWaitStartRef.current = null;
      setIsEtaReady(false);
      return;
    }

    if (!items.length) {
      setIsEtaReady(true);
      return;
    }

    if (hasAnyEta) {
      setIsEtaReady(true);
      return;
    }

    // ETA가 아직 도착하지 않은 경우: 중간 화면(ETA '-') 노출을 막고 스켈레톤을 유지
    // 다만 refetch가 반복되면 타이머가 계속 취소될 수 있으므로, 모달 오픈 시점부터 최대 대기시간을 보장한다.
    if (etaWaitStartRef.current == null) {
      etaWaitStartRef.current = Date.now();
    }

    const elapsed = Date.now() - etaWaitStartRef.current;
    const remaining = Math.max(500 - elapsed, 0);

    setIsEtaReady(false);
    const t = window.setTimeout(() => {
      setIsEtaReady(true);
    }, remaining);

    return () => window.clearTimeout(t);
  }, [isModalOpen, items.length, hasAnyEta]);

  useEffect(() => {
    // 묶음 배송(normal)인 아이템의 "원래 발송예정일"을 1회 저장 (신속→묶음 복귀 시 사용)
    // originalEstimatedShipYmd가 있으면 그것을 우선 사용
    setOriginalBulkEtaById((prev) => {
      const next = { ...prev };
      for (const it of items) {
        const mode = it.shippingMode || "normal";
        if (mode !== "normal") continue;
        if (!it.id) continue;
        if (next[it.id] !== undefined) continue;
        // Use originalEstimatedShipYmd if available, otherwise use current estimatedShipYmd
        next[it.id] =
          it.originalEstimatedShipYmd ?? it.estimatedShipYmd ?? null;
      }
      return next;
    });
  }, [items]);

  // Calculate earliest express ETA to determine which bulk items should be grouped with express
  const rawExpressItems = items.filter(
    (i) => (i.shippingMode || "normal") === "express",
  );

  // All items participate in bulk UI; express items are filtered separately
  const bulkItems = items.filter((i) => {
    const mode = i.shippingMode || "normal";
    return mode === "normal";
  });

  const handleOpenModal = () => {
    setIsModalOpen(true);
    onOpenBulkModal();
  };

  const handleLeadTimeButtonClick = () => {
    setIsLeadTimeModalOpen(true);
    if (!leadTimeData && !isLeadTimeLoading) {
      void handleFetchLeadTimes();
    }
  };

  const canToggleMode = (status?: string) => {
    if (!status) return false;
    return ["준비"].includes(status);
  };

  const patchShippingMode = async (
    requestIds: string[],
    shippingMode: "normal" | "express",
  ) => {
    if (!requestIds.length) {
      return {
        ok: true as const,
        updatedIds: [] as string[],
        rejectedIds: [] as string[],
      };
    }

    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
        duration: 3000,
      });
      return {
        ok: false as const,
        updatedIds: [] as string[],
        rejectedIds: [] as string[],
      };
    }

    const res = await apiFetch<any>({
      path: "/api/requests/my/shipping-mode",
      method: "PATCH",
      token,
      headers: {
        "Content-Type": "application/json",
      },
      jsonBody: {
        requestIds,
        shippingMode,
      },
    });

    if (!res.ok) {
      const serverMsg = res.data?.message;
      toast({
        title: "출고 방식 변경 실패",
        description: serverMsg || "다시 시도해주세요.",
        variant: "destructive",
        duration: 3000,
      });
      return {
        ok: false as const,
        updatedIds: [] as string[],
        rejectedIds: [] as string[],
      };
    }

    const rejectedIds = Array.isArray(res.data?.data?.rejectedIds)
      ? (res.data.data.rejectedIds as string[])
      : [];
    const updatedIds = Array.isArray(res.data?.data?.updatedIds)
      ? (res.data.data.updatedIds as string[])
      : requestIds;
    const shipDateYmd =
      typeof res.data?.data?.shipDateYmd === "string" &&
      res.data.data.shipDateYmd
        ? (res.data.data.shipDateYmd as string)
        : null;

    // 레거시 하위호환: 서버가 rejectedIds/updatedIds를 주지 않는 경우 프론트에서 전체 성공으로 처리
    const safeRejectedIds = Array.isArray(rejectedIds) ? rejectedIds : [];
    const safeUpdatedIds = Array.isArray(updatedIds) ? updatedIds : requestIds;

    return {
      ok: true as const,
      updatedIds: safeUpdatedIds,
      rejectedIds: safeRejectedIds,
      shipDateYmd,
    };
  };

  const getEtaKey = (it: ShippingItemApi) => {
    const raw =
      it.nextEstimatedShipYmd ||
      it.estimatedShipYmd ||
      it.originalEstimatedShipYmd;
    if (!raw) return "-";
    const s = String(raw);
    return s.length >= 10 ? s.slice(0, 10) : "-";
  };

  const formatEta = (raw?: string | null) => {
    return formatDateWithDay(raw, "확인 중");
  };

  const formatShipDate = (raw?: string | null) => {
    return formatDateOnly(raw);
  };

  const bulkGroups = (() => {
    const map = new Map<string, ShippingItemApi[]>();
    for (const it of bulkItems) {
      const key = getEtaKey(it);
      const list = map.get(key) || [];
      list.push(it);
      map.set(key, list);
    }
    const keys = Array.from(map.keys()).sort((a, b) => {
      if (a === "-") return 1;
      if (b === "-") return -1;
      return a.localeCompare(b);
    });
    return keys.map((k) => ({ etaKey: k, items: map.get(k) || [] }));
  })();

  const toggleSingleItem = async (item: ShippingItemApi) => {
    if (!canToggleMode(item.stageLabel)) {
      toast({
        title: "변경 불가",
        description: "의뢰 단계에서만 출고 방식을 변경할 수 있습니다.",
        duration: 3000,
        variant: "destructive",
      });
      return;
    }

    const currentMode = item.shippingMode || "normal";
    const nextMode: "normal" | "express" =
      currentMode === "express" ? "normal" : "express";

    if (nextMode === "express" && !originalBulkEtaById[item.id]) {
      setOriginalBulkEtaById((prev) => ({
        ...prev,
        [item.id]:
          item.originalEstimatedShipYmd ?? item.estimatedShipYmd ?? null,
      }));
    }

    const result = await patchShippingMode([item.id], nextMode);
    if (!result.ok) return;

    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== item.id) return it;
        if (nextMode === "normal") {
          const originalEta =
            it.originalEstimatedShipYmd ?? originalBulkEtaById[it.id];
          return {
            ...it,
            shippingMode: "normal",
            shipDateYmd: null,
            estimatedShipYmd:
              originalEta !== undefined && originalEta !== null
                ? originalEta
                : it.estimatedShipYmd,
            nextEstimatedShipYmd: null,
          };
        }
        return {
          ...it,
          shippingMode: "express",
          shipDateYmd: result.shipDateYmd ?? it.shipDateYmd ?? null,
          nextEstimatedShipYmd: it.estimatedShipYmd,
        };
      }),
    );

    if (onRefresh) {
      onRefresh();
    }
  };

  const toggleAllShippingMode = async () => {
    const hasNonEligible = items.some((it) => !canToggleMode(it.stageLabel));
    if (hasNonEligible) {
      toast({
        title: "변경 불가",
        description: "의뢰 단계에서만 출고 방식을 변경할 수 있습니다.",
        duration: 3000,
        variant: "destructive",
      });
      return;
    }

    const requestIds = items.map((i) => i.id).filter(Boolean);
    if (!requestIds.length) return;

    const hasExpress = rawExpressItems.length > 0;
    const nextMode: "normal" | "express" = hasExpress ? "normal" : "express";

    if (nextMode === "express") {
      setOriginalBulkEtaById((prev) => {
        const next = { ...prev };
        for (const it of bulkItems) {
          if (!it.id) continue;
          if (next[it.id] !== undefined) continue;
          // Preserve the original bulk ETA before converting to express
          next[it.id] =
            it.originalEstimatedShipYmd ?? it.estimatedShipYmd ?? null;
        }
        return next;
      });
    }

    const result = await patchShippingMode(requestIds, nextMode);
    if (!result.ok) return;

    const updatedSet = new Set(result.updatedIds);
    // 체감 속도 개선: 서버 응답 기준으로 즉시 리스트를 갱신
    setItems((prev) =>
      prev.map((it) => {
        if (!updatedSet.has(it.id)) return it;
        if (nextMode === "normal") {
          // Restore original bulk ETA from backend or local cache
          const originalEta =
            it.originalEstimatedShipYmd ?? originalBulkEtaById[it.id];
          return {
            ...it,
            shippingMode: "normal",
            shipDateYmd: null,
            estimatedShipYmd:
              originalEta !== undefined && originalEta !== null
                ? originalEta
                : it.estimatedShipYmd,
            nextEstimatedShipYmd: null,
          };
        }
        return {
          ...it,
          shippingMode: "express",
          shipDateYmd: result.shipDateYmd ?? it.shipDateYmd ?? null,
          nextEstimatedShipYmd: it.estimatedShipYmd,
        };
      }),
    );

    // 토글은 PATCH 1회로 끝내서 체감 속도를 극대화
  };

  const normalizeLeadTimes = (
    raw?: Record<string, Partial<LeadTimeEntry>>,
  ): Record<DiameterKey, LeadTimeEntry> => {
    const next = { ...DEFAULT_MANUFACTURER_LEAD_TIMES };
    (Object.keys(next) as DiameterKey[]).forEach((key) => {
      const entry = raw?.[key];
      if (!entry) return;
      const min = Number.isFinite(entry.minBusinessDays)
        ? Math.max(0, Math.floor(Number(entry.minBusinessDays)))
        : next[key].minBusinessDays;
      const max = Number.isFinite(entry.maxBusinessDays)
        ? Math.max(0, Math.floor(Number(entry.maxBusinessDays)))
        : next[key].maxBusinessDays;
      next[key] = {
        minBusinessDays: Math.min(min, max),
        maxBusinessDays: Math.max(min, max),
      };
    });
    return next;
  };

  const handleFetchLeadTimes = async () => {
    if (isLeadTimeLoading) return;
    setIsLeadTimeLoading(true);
    try {
      const res = await apiFetch<any>({
        path: "/api/businesses/manufacturer-lead-times",
        method: "GET",
      });
      if (!res.ok) {
        throw new Error(res.data?.message || "조회에 실패했습니다.");
      }
      const body: any = res.data || {};
      const data = body.data || body;
      setLeadTimeData({
        leadTimes: normalizeLeadTimes(data?.leadTimes),
        weeklyBatchDays: Array.isArray(data?.weeklyBatchDays)
          ? (data.weeklyBatchDays as string[])
          : [],
      });
      toast({ title: "제조사 리드타임을 불러왔습니다." });
    } catch (error: any) {
      toast({
        title: "리드타임 조회 실패",
        description: error?.message || "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setIsLeadTimeLoading(false);
    }
  };

  return (
    <>
      <Card className="app-glass-card app-glass-card--lg h-full min-w-0">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold text-foreground">
              출고
            </CardTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className="gap-1 border-sky-300 bg-sky-50 text-sky-700 font-medium"
              >
                <Package className="h-3 w-3" />
                묶음출고
              </Badge>
              <Badge
                variant="outline"
                className="gap-1 border-amber-300 bg-amber-50 text-amber-700 font-medium"
              >
                <Zap className="h-3 w-3" />
                신속출고
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 pb-4 text-sm text-foreground space-y-3">
          {isShippingSummaryLoading ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-6 text-center text-xs text-slate-500">
              출고 내역 불러오는 중...
            </div>
          ) : (
            <div className="rounded-xl border border-blue-200/80 bg-gradient-to-br from-blue-50 to-sky-50/80 px-4 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                    오늘 출고 예정
                  </p>
                  <p className="mt-1 text-2xl font-bold leading-none text-blue-900">
                    {shippingMemo.todayCount.toLocaleString()}
                    <span className="ml-1 text-sm font-semibold text-blue-700">
                      박스
                    </span>
                  </p>
                </div>
                <div className="h-10 w-px bg-blue-200/80" />
                <div className="min-w-0 text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    박스 구성
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-0.5 h-auto px-0 py-0 text-2xl font-bold leading-none text-slate-900 hover:bg-transparent hover:text-blue-700"
                    disabled={
                      shippingMemo.todayCount === 0 ||
                      shippingMemo.todayRequests.length === 0
                    }
                    onClick={() => setTodayBoxDialogOpen(true)}
                  >
                    {shippingMemo.todayRequests.length.toLocaleString()}
                    <span className="ml-1 text-sm font-semibold text-slate-600">
                      건
                    </span>
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3.5 space-y-3">
            <div className="flex items-start gap-2.5">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <p className="text-xs leading-relaxed text-slate-600">
                {SHIP_OUT_INFO_MESSAGE}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                variant="default"
                size="sm"
                className="h-9 w-full font-semibold"
                onClick={handleOpenModal}
              >
                출고 대기 내역
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-full font-semibold bg-white/80"
                onClick={handleLeadTimeButtonClick}
                disabled={isLeadTimeLoading}
              >
                {isLeadTimeLoading ? "조회 중..." : "리드타임 조회"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={todayBoxDialogOpen} onOpenChange={setTodayBoxDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Box className="h-5 w-5 text-blue-600" />
              오늘 출고 박스 내역
            </DialogTitle>
          </DialogHeader>
          {shippingMemo.todayRequests.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
              <Box className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">
                오늘 출고 예정인 박스가 없습니다
              </p>
              <p className="mt-1 text-xs text-slate-500">
                오늘 출고될 의뢰가 모이면 여기에 표시됩니다
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-auto pr-1">
              {shippingMemo.todayRequests.map(
                (req: ShippingPackageSummaryRequest) => {
                  const ci = req?.caseInfos || {};
                  const title =
                    String(req?.title || "").trim() ||
                    [ci?.patientName, ci?.tooth].filter(Boolean).join(" ") ||
                    String(req?.requestId || "");
                  const nextEta =
                    req?.timeline?.nextEstimatedShipYmd ||
                    req?.timeline?.estimatedShipYmd ||
                    req?.timeline?.originalEstimatedShipYmd ||
                    null;
                  return (
                    <div
                      key={String(req?.id || req?._id || Math.random())}
                      className="rounded-md border border-gray-200 bg-white px-3 py-2"
                    >
                      <div className="text-sm font-semibold text-gray-900 truncate">
                        {title}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        의뢰번호: {String(req?.requestId || "")}
                      </div>
                      {nextEta && (
                        <div className="text-[11px] text-blue-600 mt-1">
                          다음 출고일: {formatDateWithDay(nextEta)}
                        </div>
                      )}
                    </div>
                  );
                },
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader className="space-y-3">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Package className="h-5 w-5 text-primary" />
              출고 대기 현황
            </DialogTitle>
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
              <p className="text-xs leading-relaxed text-slate-600">
                {SHIP_OUT_INFO_MESSAGE}
              </p>
            </div>
          </DialogHeader>
          {!isEtaReady ? (
            <div className="py-6 space-y-4">
              <div className="flex items-center justify-between gap-6">
                <div className="flex-1">
                  <Skeleton className="h-5 w-24" />
                  <div className="mt-4 space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                </div>
                <div className="flex items-center justify-center w-16">
                  <Skeleton className="h-12 w-12 rounded-full" />
                </div>
                <div className="flex-1">
                  <Skeleton className="h-5 w-24" />
                  <div className="mt-4 space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {bulkItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center">
                  <Package className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                  <p className="text-sm font-medium text-slate-700">
                    출고 대기 중인 제품이 없습니다
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    의뢰 후 제조사 출고일이 여기에 표시됩니다
                  </p>
                </div>
              ) : (
                bulkGroups.map((group) => (
                  <div
                    key={group.etaKey}
                    className="rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div className="text-sm text-slate-700">
                        <span className="font-semibold text-foreground">
                          출고 예정일
                        </span>
                        <span className="ml-2 font-medium text-blue-700">
                          {group.etaKey === "-" ? "-" : formatEta(group.etaKey)}
                        </span>
                      </div>
                      <Badge variant="secondary" className="text-[11px]">
                        {group.items.length}개
                      </Badge>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {group.items.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5"
                        >
                          <p className="text-sm font-medium text-foreground truncate">
                            {item.title || item.id}
                          </p>
                          <p className="text-xs text-slate-600 truncate">
                            {item.clinic || ""}
                          </p>
                          <p className="text-xs text-slate-500">
                            {item.patient || "-"} / {item.tooth || "-"} /{" "}
                            {item.diameter || "-"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isLeadTimeModalOpen} onOpenChange={setIsLeadTimeModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader className="space-y-3">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Clock className="h-5 w-5 text-primary" />
              제조사 출고 리드타임
            </DialogTitle>
            <CardDescription className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
              직경별 예상 리드타임을 확인하세요. {SHIP_OUT_INFO_MESSAGE}
            </CardDescription>
          </DialogHeader>
          <div className="space-y-4">
            {leadTimeData ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(Object.keys(DIAMETER_LABELS) as DiameterKey[]).map(
                    (key) => {
                      const entry = leadTimeData.leadTimes[key];
                      return (
                        <div
                          key={key}
                          className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-center shadow-sm"
                        >
                          <p className="text-[12px] font-semibold text-slate-700">
                            {DIAMETER_LABELS[key]}
                          </p>
                          <p className="mt-2 text-base font-bold text-slate-900">
                            {entry
                              ? `${entry.minBusinessDays}~${entry.maxBusinessDays} 영업일`
                              : "-"}
                          </p>
                        </div>
                      );
                    },
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
