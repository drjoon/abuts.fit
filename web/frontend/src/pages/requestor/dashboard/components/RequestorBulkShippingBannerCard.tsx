// change-log:
// - 2026-08-21: 출고예정 모달에 기공의뢰(PTX) 뱃지.
// - 2026-08-19: 출고예정 모달 — 진행중과 같은 가로폭, 신속 포함, 상태·출고·케이스 뱃지. 리드타임 안내 문구 제거.
// - 2026-08-19: 헤더 버튼 라벨 [출고예정 x건]. 취소 후 스냅샷 갱신과 맞춤.
// - 2026-08-18: 출고대기·리드타임·오늘출고 모달을 정책 안내와 같은 rounded-2xl 톤으로 정리.
// - 2026-08-18: variant=headerButton — 치과 어벗디자인 헤더 [출고예정 x건].
// - 2026-08-11: 오늘 출고 예정은 건 단위만 표시. 좌측 세로 버튼·우측 요약 배치.
// - 2026-08-11: 출고 안내 문구를 카드에서 제거하고 Info 빠른 툴팁으로 이동.
// - 2026-08-09: 디자인+생산 출고 +1영업일 안내를 SHIP_OUT_INFO_MESSAGE에 반영.
// - 2026-08-06: 출고 카드/모달 문구·레이아웃 정리.
// - 2026-08-06: 카드 제목/설명 정리. 대기수량·다음출고 예정 제거.
// - 2026-08-06: 배송/발송 표기를 출고로 통일 (제조사 출발일).
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/new_request/components/RequestorAbutmentPageHeader.tsx
// - web/frontend/src/shared/shipping/ShippingModeBadge.tsx
// - web/frontend/src/features/requestSettings/RequestCaseMetaBadges.tsx
// - web/frontend/src/shared/components/PastRequestsModal.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, Clock, Info, Package, Zap } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { ShippingModeBadge } from "@/shared/shipping/ShippingModeBadge";
import { RequestCaseMetaBadges } from "@/features/requestSettings/RequestCaseMetaBadges";
import { formatImplantDisplay } from "@/utils/implant";
import {
  STAGE_BADGE_STYLES,
  getProductModeBadgeClassName,
} from "@/shared/ui/semanticStatus";
import { PRODUCT_MODE } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { formatDateWithDay, formatDateOnly } from "@/utils/dateFormat";
import { getShippingModeBadgeClassName } from "@/shared/shipping/shippingMode";
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
  /** true면 카드 chrome은 유지하고 "오늘 출고 예정" 수치 영역만 스켈레톤 처리 */
  loading?: boolean;
  /** headerButton: 카드 없이 헤더용 [출고예정 x건] + 기존 모달 */
  variant?: "card" | "headerButton";
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
  "출고일은 리드타임 기준으로 계산됩니다. 묶음출고는 자정까지 접수시 다음 날 오후 4시 출고, 신속출고는 정오까지 접수시 당일 오후 4시 출고됩니다. 디자인+생산은 묶음·신속 모두 +1영업일입니다.";

type ShippingItemApi = {
  id: string;
  mongoId?: string;
  title?: string;
  clinic?: string;
  patient?: string;
  tooth?: string;
  diameter?: string;
  designSoftware?: string | null;
  anodizingEnabled?: boolean | null;
  hexVerificationSample?: boolean | null;
  practiceTransferLinked?: boolean | null;
  productMode?: string | null;
  implantManufacturer?: string | null;
  implantBrand?: string | null;
  implantFamily?: string | null;
  implantType?: string | null;
  stage?: string;
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

const STAGE_BADGE_BASE =
  "text-[10px] h-5 px-1.5 whitespace-nowrap leading-none flex items-center justify-center";

const PRODUCT_MODE_BADGE_LABEL: Record<string, string> = {
  [PRODUCT_MODE.DESIGN_CUSTOM_ABUTMENT]: "디자인+생산",
  [PRODUCT_MODE.CUSTOM_ABUTMENT]: "생산",
};

export const RequestorBulkShippingBannerCard = ({
  onOpenBulkModal,
  bulkData,
  onRefresh,
  period = "30d",
  loading = false,
  variant = "card",
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

    return {
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

  const waitingGroups = (() => {
    const map = new Map<string, ShippingItemApi[]>();
    for (const it of items) {
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
    return keys.map((k) => ({
      etaKey: k,
      items: (map.get(k) || []).slice().sort((a, b) => {
        const modeA = (a.shippingMode || "normal") === "express" ? 0 : 1;
        const modeB = (b.shippingMode || "normal") === "express" ? 0 : 1;
        if (modeA !== modeB) return modeA - modeB;
        return String(a.id || "").localeCompare(String(b.id || ""));
      }),
    }));
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

  const waitingCount = items.length;
  const isHeaderButton = variant === "headerButton";

  return (
    <>
      {isHeaderButton ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs"
          onClick={handleOpenModal}
        >
          출고예정 {waitingCount.toLocaleString()}건
        </Button>
      ) : (
      <Card className="app-glass-card app-glass-card--lg h-full min-w-0">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-base font-semibold text-foreground">
                출고
              </CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    aria-label="출고 안내"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  align="start"
                  className="max-w-xs text-xs leading-relaxed break-keep"
                >
                  {SHIP_OUT_INFO_MESSAGE}
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className={`gap-1 font-medium ${getShippingModeBadgeClassName("normal")}`}
              >
                <Package className="h-3 w-3" />
                묶음출고
              </Badge>
              <Badge
                variant="outline"
                className={`gap-1 font-medium ${getShippingModeBadgeClassName("express")}`}
              >
                <Zap className="h-3 w-3" />
                신속출고
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 pb-4 text-sm text-foreground">
          <div className="grid grid-cols-2 items-stretch gap-3">
            <div className="flex min-w-0 flex-col gap-2">
              <Button
                variant="default"
                size="sm"
                className="h-9 w-full px-2 text-xs font-semibold"
                onClick={handleOpenModal}
              >
                출고 대기 내역
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-full px-2 text-xs font-semibold bg-white/80"
                onClick={handleLeadTimeButtonClick}
                disabled={isLeadTimeLoading}
              >
                {isLeadTimeLoading ? "조회 중..." : "리드타임 조회"}
              </Button>
            </div>

            {loading || isShippingSummaryLoading ? (
              <div className="flex min-w-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <button
                type="button"
                className="min-w-0 rounded-xl border border-primary-muted/80 bg-gradient-to-br from-primary-soft to-primary-soft/80 px-4 py-3 text-center disabled:cursor-default disabled:opacity-100"
                disabled={shippingMemo.todayRequests.length === 0}
                onClick={() => setTodayBoxDialogOpen(true)}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-strong">
                  오늘 출고 예정
                </p>
                <p className="mt-1 text-2xl font-bold leading-none text-primary-strong">
                  {shippingMemo.todayRequests.length.toLocaleString()}
                  <span className="ml-1 text-sm font-semibold text-primary-strong">
                    건
                  </span>
                </p>
              </button>
            )}
          </div>
        </CardContent>
      </Card>
      )}

      <Dialog open={todayBoxDialogOpen} onOpenChange={setTodayBoxDialogOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg gap-0 overflow-hidden p-0 sm:rounded-2xl">
          <DialogHeader className="space-y-1.5 border-b border-slate-100 px-6 pb-4 pt-6 pr-12 text-left">
            <DialogTitle className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-900">
              <Box className="h-5 w-5 text-primary-strong" />
              오늘 출고 박스 내역
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              오늘 출고 예정인 의뢰를 박스 단위로 확인합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(85vh-5.5rem)] overflow-y-auto px-6 py-5">
            {shippingMemo.todayRequests.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
                <Box className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                <p className="text-sm font-medium text-slate-700">
                  오늘 출고 예정인 박스가 없습니다
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  오늘 출고될 의뢰가 모이면 여기에 표시됩니다
                </p>
              </div>
            ) : (
              <div className="space-y-2">
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
                        className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5"
                      >
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {title}
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          의뢰번호: {String(req?.requestId || "")}
                        </div>
                        {nextEta && (
                          <div className="mt-1 text-[11px] font-medium text-primary-strong">
                            다음 출고일: {formatDateWithDay(nextEta)}
                          </div>
                        )}
                      </div>
                    );
                  },
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="flex h-[min(85vh,800px)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden p-0 sm:w-[min(92vw,calc(100vw-2rem))] sm:max-w-[min(92vw,1440px)] sm:rounded-2xl">
          <DialogHeader className="space-y-1.5 border-b border-slate-100 px-4 pb-4 pt-5 pr-12 text-left sm:px-6 sm:pt-6">
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
              <Package className="h-5 w-5 text-primary" />
              출고 대기 현황
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              제조사 출고일이 잡힌 대기 의뢰를 예정일별로 확인합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            {!isEtaReady ? (
              <div className="space-y-3 py-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-14 w-full rounded-xl" />
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
                <Package className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                <p className="text-sm font-medium text-slate-700">
                  출고 대기 중인 제품이 없습니다
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  의뢰 후 제조사 출고일이 여기에 표시됩니다
                </p>
              </div>
            ) : (
              waitingGroups.map((group) => (
                <section
                  key={group.etaKey}
                  className="overflow-hidden rounded-xl border border-slate-200/80 bg-white"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5">
                    <div className="text-sm text-slate-700">
                      <span className="font-semibold text-slate-900">
                        출고 예정일
                      </span>
                      <span className="ml-2 font-medium text-primary-strong">
                        {group.etaKey === "-" ? "-" : formatEta(group.etaKey)}
                      </span>
                    </div>
                    <Badge variant="secondary" className="rounded-md text-[11px]">
                      {group.items.length}개
                    </Badge>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-[90px]">상태</TableHead>
                          <TableHead className="w-[88px]">출고</TableHead>
                          <TableHead className="w-[92px]">유형</TableHead>
                          <TableHead className="min-w-[240px]">케이스</TableHead>
                          <TableHead className="min-w-[220px]">임플란트</TableHead>
                          <TableHead className="w-[170px]">의뢰번호</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.items.map((item) => {
                          const stageLabel =
                            String(item.stageLabel || item.stage || "").trim() ||
                            "-";
                          const stageStyle =
                            STAGE_BADGE_STYLES[stageLabel] || {
                              variant: "outline" as const,
                            };
                          const productMode =
                            item.productMode ===
                            PRODUCT_MODE.DESIGN_CUSTOM_ABUTMENT
                              ? PRODUCT_MODE.DESIGN_CUSTOM_ABUTMENT
                              : item.productMode === PRODUCT_MODE.CUSTOM_ABUTMENT
                                ? PRODUCT_MODE.CUSTOM_ABUTMENT
                                : "";
                          const caseText =
                            [item.clinic, item.patient, item.tooth]
                              .map((v) => String(v || "").trim())
                              .filter(Boolean)
                              .join(" ") || "-";
                          const implantText = formatImplantDisplay(item);
                          return (
                            <TableRow key={item.id}>
                              <TableCell>
                                <Badge
                                  variant={stageStyle.variant}
                                  className={`${STAGE_BADGE_BASE} ${stageStyle.extra || ""}`.trim()}
                                >
                                  {stageLabel}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <ShippingModeBadge
                                  mode={item.shippingMode || "normal"}
                                  size="sm"
                                />
                              </TableCell>
                              <TableCell>
                                {productMode ? (
                                  <Badge
                                    variant="outline"
                                    className={`${STAGE_BADGE_BASE} ${getProductModeBadgeClassName(productMode)}`.trim()}
                                  >
                                    {PRODUCT_MODE_BADGE_LABEL[productMode]}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-slate-400">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-slate-700">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span>{caseText}</span>
                                  <RequestCaseMetaBadges
                                    designSoftware={item.designSoftware}
                                    anodizingEnabled={
                                      typeof item.anodizingEnabled === "boolean"
                                        ? item.anodizingEnabled
                                        : null
                                    }
                                    hexVerificationSample={Boolean(
                                      item.hexVerificationSample,
                                    )}
                                    practiceTransferLinked={Boolean(
                                      item.practiceTransferLinked,
                                    )}
                                  />
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-slate-700">
                                {implantText}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-slate-800">
                                {item.title || item.id}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isLeadTimeModalOpen} onOpenChange={setIsLeadTimeModalOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl gap-0 overflow-hidden p-0 sm:rounded-2xl">
          <DialogHeader className="space-y-1.5 border-b border-slate-100 px-6 pb-4 pt-6 pr-12 text-left">
            <DialogTitle className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-900">
              <Clock className="h-5 w-5 text-primary" />
              제조사 출고 리드타임
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              직경별 예상 리드타임을 확인하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(85vh-5.5rem)] space-y-4 overflow-y-auto px-6 py-5">
            <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-600">
              {SHIP_OUT_INFO_MESSAGE}
            </p>
            {leadTimeData ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.keys(DIAMETER_LABELS) as DiameterKey[]).map((key) => {
                  const entry = leadTimeData.leadTimes[key];
                  return (
                    <div
                      key={key}
                      className="rounded-xl border border-slate-200/80 bg-white px-3 py-4 text-center"
                    >
                      <p className="text-xs font-semibold text-slate-500">
                        {DIAMETER_LABELS[key]}
                      </p>
                      <p className="mt-2 text-base font-semibold tracking-tight text-slate-900">
                        {entry
                          ? `${entry.minBusinessDays}~${entry.maxBusinessDays} 영업일`
                          : "-"}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
