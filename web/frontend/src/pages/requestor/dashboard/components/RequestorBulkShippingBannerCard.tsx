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
  estimatedShipYmd?: string | null;
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
    setOriginalBulkEtaById((prev) => {
      const next = { ...prev };
      for (const it of items) {
        const mode = it.shippingMode || "normal";
        if (mode !== "normal") continue;
        if (!it.id) continue;
        if (next[it.id] !== undefined) continue;
        next[it.id] = it.estimatedShipYmd ?? null;
      }
      return next;
    });
  }, [items]);

  const bulkItems = items.filter(
    (i) => (i.shippingMode || "normal") === "normal",
  );
  const expressItems = items.filter(
    (i) => (i.shippingMode || "normal") === "express",
  );

  const earliestEta = (list: ShippingItemApi[]) => {
    const dates = list
      .map((i) => i.estimatedShipYmd)
      .filter(Boolean)
      .map((d) => String(d))
      .filter((v) => v.length >= 10);
    if (!dates.length) return "-";
    const ts = dates.sort()[0];
    const mm = Number(ts.slice(5, 7));
    const dd = Number(ts.slice(8, 10));
    if (!Number.isFinite(mm) || !Number.isFinite(dd)) return "-";
    return `${mm}/${dd}`;
  };

  const getNextSummary = () => {
    const bulkCount = bulkItems.length;
    const expressCount = expressItems.length;
    const totalCount = bulkCount + expressCount;

    if (totalCount === 0) {
      return {
        modeLabel: "예정 없음",
        countLabel: "대기 중인 제품이 없습니다.",
        dateLabel: "-",
      };
    }

    const hasExpress = expressItems.length > 0;

    // 신속 배송이 하나라도 있으면: 전체를 신속 기준으로 안내
    if (hasExpress) {
      const modeLabel = "신속 배송";
      const nextText = earliestEta(expressItems);

      return {
        modeLabel,
        countLabel: `총 ${totalCount}개 배송 예정`,
        dateLabel: nextText,
      };
    }

    // 묶음 배송만 있는 경우
    const modeLabel = "묶음 배송";

    if (policy?.shippingMode === "countBased") {
      const threshold = policy.autoBatchThreshold || 20;
      const remaining = Math.max(threshold - bulkCount, 0);

      return {
        modeLabel,
        countLabel: `${bulkCount} / ${threshold}개 모임`,
        dateLabel:
          remaining === 0 ? "기준 수량 충족" : `기준까지 ${remaining}개 남음`,
      };
    }

    if (
      policy?.shippingMode === "weeklyBased" &&
      policy.weeklyBatchDays?.length
    ) {
      const today = new Date();
      const dayOfWeek = today.getDay();

      const order: Record<string, number> = {
        sun: 0,
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6,
      };

      const labels: Record<string, string> = {
        sun: "일",
        mon: "월",
        tue: "화",
        wed: "수",
        thu: "목",
        fri: "금",
        sat: "토",
      };

      const sorted = [...policy.weeklyBatchDays].sort(
        (a, b) => order[a] - order[b],
      );

      let minDiff = 7;
      let targetDay: string | null = null;

      for (const d of sorted) {
        const diff = (order[d] - dayOfWeek + 7) % 7 || 7;
        if (diff < minDiff) {
          minDiff = diff;
          targetDay = d;
        }
      }

      if (targetDay) {
        const dayLabel = labels[targetDay];
        const diffLabel = minDiff === 0 ? "오늘" : `${minDiff}일 남음`;

        return {
          modeLabel,
          countLabel: `총 ${bulkCount}개 묶음 대기`,
          dateLabel: `${diffLabel} (다음 ${dayLabel})`,
        };
      }
    }

    return {
      modeLabel,
      countLabel: `총 ${bulkCount}개 묶음 대기`,
      dateLabel: earliestEta(bulkItems),
    };
  };

  const getCardMessage = () => {
    if (!policy) {
      return "배송 대기중인 묶음/신속 배송 제품을 확인해보세요.";
    }

    if (policy.shippingMode === "countBased") {
      return `${
        policy.autoBatchThreshold || 20
      }개 이상 모이면 자동 묶음 배송됩니다. 배송비를 절감하고 출고 일정을 관리해 보세요.`;
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
    return `${days} 오후에 묶음 배송됩니다. 배송비를 절감하고 출고 일정을 관리해 보세요.`;
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
    const raw = it.estimatedShipYmd;
    if (!raw) return "-";
    const s = String(raw);
    return s.length >= 10 ? s.slice(0, 10) : "-";
  };

  const formatEta = (raw?: string | null) => {
    if (!raw) return "-";
    const s = String(raw);
    if (s.length < 10) return "-";
    const d = new Date(`${s.slice(0, 10)}T00:00:00+09:00`);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
  };

  const formatShipDate = (raw?: string | null) => {
    if (!raw) return "-";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("ko-KR");
  };

  const getExpressEtaText = () => {
    if (!expressItems.length) return "-";

    // '발송 예정일' 표시는 반드시 estimatedShipYmd를 사용해야 한다.
    return earliestEta(expressItems);
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

    const hasExpress = expressItems.length > 0;
    const nextMode: "normal" | "express" = hasExpress ? "normal" : "express";

    if (nextMode === "express") {
      setOriginalBulkEtaById((prev) => {
        const next = { ...prev };
        for (const it of bulkItems) {
          if (!it.id) continue;
          if (next[it.id] !== undefined) continue;
          next[it.id] = it.estimatedShipYmd ?? null;
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
          const originalEta = originalBulkEtaById[it.id];
          return {
            ...it,
            shippingMode: "normal",
            shipDateYmd: null,
            estimatedShipYmd:
              originalEta !== undefined ? originalEta : it.estimatedShipYmd,
          };
        }
        return {
          ...it,
          shippingMode: "express",
          shipDateYmd: result.shipDateYmd ?? it.shipDateYmd ?? null,
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
              다음 배송 안내
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
            className="whitespace-nowrap"
            onClick={handleOpenModal}
          >
            배송 대기 내역
          </Button>
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              배송 대기 내역
            </DialogTitle>
            <p className="mt-1 text-mg text-slate-700">
              신속 배송시 묶음 배송 제품도 동봉합니다.
            </p>
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
            <div className="relative flex items-stretch gap-6 py-6">
              {/* 왼쪽: 묶음 배송 */}
              <div className="flex-1 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-1 rounded-full bg-blue-600"></div>
                    <h3 className="font-bold text-lg text-foreground">
                      묶음 배송
                    </h3>
                  </div>
                </div>
                <div className="app-glass-card app-glass-card--lg p-6 space-y-3 max-h-96 overflow-y-auto">
                  {bulkItems.length === 0 ? (
                    <div className="text-sm text-slate-600 text-center py-8">
                      묶음 배송 대기 중인 제품이 없습니다.
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

                        <div className="mt-2 space-y-2">
                          {group.items.map((item) => (
                            <div
                              key={item.id}
                              className="app-surface app-surface--item flex items-center justify-between p-2"
                            >
                              <div className="flex-1 text-left">
                                <p className="text-sm font-medium text-foreground">
                                  {item.title || item.id}
                                </p>
                                <p className="text-xs text-slate-600">
                                  {item.clinic || ""}
                                  {(item.patient ||
                                    item.tooth ||
                                    item.diameter) &&
                                    ` • ${item.patient || "-"} / ${
                                      item.tooth || "-"
                                    } / ${item.diameter || "-"}`}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 중앙: 화살표 */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-1/2 z-10">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-12 rounded-full border-2 border-blue-500 bg-white shadow-md hover:bg-blue-50"
                  onClick={toggleAllShippingMode}
                >
                  <ArrowRightLeft className="h-6 w-6 text-blue-600" />
                </Button>
              </div>

              {/* 오른쪽: 신속 배송 */}
              <div className="flex-1 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-1 rounded-full bg-red-600"></div>
                    <h3 className="font-bold text-lg text-foreground">
                      신속 배송
                    </h3>
                  </div>
                  {expressItems.length > 0 && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                      <span className="font-medium">발송 예정일:</span>{" "}
                      <span className="text-red-900">
                        {getExpressEtaText()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="app-glass-card app-glass-card--lg p-6 space-y-2 max-h-96 overflow-y-auto">
                  {expressItems.length === 0 ? (
                    <div className="text-sm text-slate-600 text-center py-8">
                      신속 배송 제품이 없습니다.
                    </div>
                  ) : (
                    expressItems.map((item) => (
                      <div
                        key={item.id}
                        className="app-surface app-surface--item flex items-center justify-between p-3"
                      >
                        <div className="flex-1 text-right">
                          <p className="text-sm font-medium text-foreground">
                            {item.title || item.id}
                          </p>
                          <p className="text-xs text-slate-600">
                            {item.clinic || ""}
                            {(item.patient || item.tooth || item.diameter) &&
                              ` • ${item.patient || "-"} / ${
                                item.tooth || "-"
                              } / ${item.diameter || "-"}`}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
