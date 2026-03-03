import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowRightLeft } from "lucide-react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";

type Props = {
  onOpenBulkModal: () => void;
  bulkData?: {
    pre?: ShippingItemApi[];
    post?: ShippingItemApi[];
    waiting?: ShippingItemApi[];
  } | null;
  onRefresh?: () => void;
};

interface ShippingPolicy {
  shippingMode: "countBased" | "weeklyBased";
  autoBatchThreshold?: number;
  weeklyBatchDays?: string[];
}

const STORAGE_KEY_PREFIX = "abutsfit:shipping-policy:v1:";

type ShippingItemApi = {
  id: string;
  mongoId?: string;
  title?: string;
  clinic?: string;
  patient?: string;
  tooth?: string;
  diameter?: string;
  status?: string;
  stageKey?:
    | "request"
    | "cam"
    | "production"
    | "shipping"
    | "completed"
    | "cancel";
  stageLabel?: string;
  shippingMode?: "normal" | "express";
  requestedShipDate?: string;
  shipDateYmd?: string | null;
  estimatedShipYmd?: string | null; // next ETA 우선(백엔드 매핑)
  originalEstimatedShipYmd?: string | null;
  nextEstimatedShipYmd?: string | null;
};

export const RequestorBulkShippingBannerCard = ({
  onOpenBulkModal,
  bulkData,
  onRefresh,
}: Props) => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [policy, setPolicy] = useState<ShippingPolicy | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEtaReady, setIsEtaReady] = useState(false);
  const etaWaitStartRef = useRef<number | null>(null);

  const [originalBulkEtaById, setOriginalBulkEtaById] = useState<
    Record<string, string | null>
  >({});

  // 샘플 데이터 (실제로는 API에서 가져올 데이터)
  const [items, setItems] = useState<ShippingItemApi[]>([]);

  useEffect(() => {
    try {
      const email = localStorage.getItem("userEmail") || "guest";
      const storageKey = `${STORAGE_KEY_PREFIX}${email}`;
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setPolicy(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const next: ShippingItemApi[] = [
      ...(bulkData?.pre || []),
      ...(bulkData?.post || []),
      ...(bulkData?.waiting || []),
    ].filter(Boolean);
    setItems(next);
  }, [bulkData]);

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

  const earliestExpressEta = useMemo(() => {
    if (rawExpressItems.length === 0) return null;
    const dates = rawExpressItems
      .map((i) => i.estimatedShipYmd)
      .filter(Boolean)
      .map((d) => String(d))
      .filter((v) => v.length >= 10)
      .sort();
    return dates.length > 0 ? dates[0] : null;
  }, [rawExpressItems]);

  // All items are bulk shipping now (express shipping removed)
  const bulkItems = items.filter((i) => {
    const mode = i.shippingMode || "normal";
    return mode === "normal";
  });

  const expressItems = items.filter((i) => {
    const mode = i.shippingMode || "normal";
    return mode === "express";
  });

  const earliestEta = (list: ShippingItemApi[]) => {
    const dates = list
      .map((i) => i.estimatedShipYmd)
      .filter(Boolean)
      .map((d) => String(d))
      .filter((v) => v.length >= 10);
    if (!dates.length) return "확인 중";
    const ts = dates.sort()[0];
    const mm = Number(ts.slice(5, 7));
    const dd = Number(ts.slice(8, 10));
    if (!Number.isFinite(mm) || !Number.isFinite(dd)) return "확인 중";
    return `${mm}/${dd}`;
  };

  const getNextSummary = () => {
    const bulkCount = bulkItems.length;

    if (bulkCount === 0) {
      return {
        modeLabel: "배송 대기 없음",
        countLabel: "현재 대기 중인 제품이 없습니다.",
        dateLabel: "-",
      };
    }

    const nextText = earliestEta(bulkItems);

    return {
      modeLabel: "묶음 배송",
      countLabel: `대기 수량: ${bulkCount}개`,
      dateLabel: `다음 발송 예정: ${nextText}`,
    };
  };

  const getCardMessage = () => {
    if (!policy) {
      return "제조사 리드타임 기준으로 발송일이 계산됩니다.";
    }

    const dayLabels: Record<string, string> = {
      mon: "월",
      tue: "화",
      wed: "수",
      thu: "목",
      fri: "금",
    };
    const days = (policy.weeklyBatchDays || [])
      .map((d) => dayLabels[d])
      .join(", ");

    if (days) {
      return `${days}요일에 묶음 발송됩니다. 제조사 리드타임 기준으로 발송일이 계산됩니다.`;
    }

    return "제조사 리드타임 기준으로 발송일이 계산됩니다.";
  };

  const handleOpenModal = () => {
    setIsModalOpen(true);
    onOpenBulkModal();
  };

  const canToggleMode = (status?: string) => {
    if (!status) return false;
    return ["의뢰"].includes(status);
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
        "x-mock-role": "requestor",
      },
      jsonBody: {
        requestIds,
        shippingMode,
      },
    });

    if (!res.ok) {
      const serverMsg = res.data?.message;
      toast({
        title: "배송 방식 변경 실패",
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
    if (!raw) return "확인 중";
    const s = String(raw);
    if (s.length < 10) return "확인 중";
    const d = new Date(`${s.slice(0, 10)}T00:00:00+09:00`);
    if (Number.isNaN(d.getTime())) return "확인 중";
    return d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
  };

  const formatShipDate = (raw?: string | null) => {
    if (!raw) return "-";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("ko-KR");
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
    if (!canToggleMode(item.status)) {
      toast({
        title: "변경 불가",
        description: "의뢰 단계에서만 배송 방식을 변경할 수 있습니다.",
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
    const hasNonEligible = items.some((it) => !canToggleMode(it.status));
    if (hasNonEligible) {
      toast({
        title: "변경 불가",
        description: "의뢰 단계에서만 배송 방식을 변경할 수 있습니다.",
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

  return (
    <>
      <Card className="app-glass-card app-glass-card--lg flex-none">
        <CardHeader className="pb-2 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base font-semibold text-foreground">
              묶음 배송 안내
            </CardTitle>
            {(() => {
              const { modeLabel, countLabel, dateLabel } = getNextSummary();
              return (
                <div className="flex flex-col items-end text-xs text-slate-600">
                  <span className="font-semibold text-foreground">
                    {modeLabel}
                  </span>
                  <span className="text-foreground">{countLabel}</span>
                  <span className="text-[11px] text-slate-600">
                    {dateLabel}
                  </span>
                </div>
              );
            })()}
          </div>
          <CardDescription className="text-md leading-relaxed text-slate-600">
            {getCardMessage()}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-right pt-2">
          <Button
            variant="default"
            className="whitespace-nowrap px-4 py-2 h-11 bg-primary text-white font-semibold shadow-lg"
            onClick={handleOpenModal}
          >
            배송 대기 내역
          </Button>
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              배송 대기 현황
            </DialogTitle>
            <CardDescription className="text-xs text-muted-foreground">
              제조사 리드타임 기준 발송일이 계산됩니다.
            </CardDescription>
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
              <div className="app-glass-card app-glass-card--lg p-4 space-y-3 max-h-96 overflow-y-auto">
                {bulkItems.length === 0 ? (
                  <div className="text-sm text-slate-600 text-center py-8">
                    배송 대기 중인 제품이 없습니다.
                  </div>
                ) : (
                  bulkGroups.map((group) => (
                    <div
                      key={group.etaKey}
                      className="app-surface app-surface--panel"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-slate-700">
                          <span className="font-medium">발송 예정일:</span>{" "}
                          <span className="text-foreground font-medium">
                            {group.etaKey === "-"
                              ? "-"
                              : formatEta(group.etaKey)}
                          </span>
                          <span className="ml-2 text-slate-600">
                            ({group.items.length}개)
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {group.items.map((item) => (
                          <div
                            key={item.id}
                            className="app-surface app-surface--item p-2"
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
