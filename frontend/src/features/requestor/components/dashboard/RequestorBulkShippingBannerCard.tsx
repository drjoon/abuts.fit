import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronRight, ArrowRightLeft } from "lucide-react";

type Props = {
  onOpenBulkModal: () => void;
};

interface ShippingPolicy {
  shippingMode: "countBased" | "weeklyBased";
  autoBatchThreshold?: number;
  weeklyBatchDays?: string[];
}

const STORAGE_KEY_PREFIX = "abutsfit:shipping-policy:v1:";

interface ShippingItem {
  id: string;
  name: string;
  count: number;
}

export const RequestorBulkShippingBannerCard = ({ onOpenBulkModal }: Props) => {
  const [policy, setPolicy] = useState<ShippingPolicy | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 샘플 데이터 (실제로는 API에서 가져올 데이터)
  const [bulkItems, setBulkItems] = useState<ShippingItem[]>([]);
  const [expressItems, setExpressItems] = useState<ShippingItem[]>([]);

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

  const getNextSummary = () => {
    const bulkCount = bulkItems.reduce((sum, i) => sum + i.count, 0);
    const expressCount = expressItems.reduce((sum, i) => sum + i.count, 0);
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

      const today = new Date();
      const dayOfWeek = today.getDay();

      let nextText = "-";

      if (
        policy?.shippingMode === "weeklyBased" &&
        policy.weeklyBatchDays?.length
      ) {
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
          (a, b) => order[a] - order[b]
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
          const next = new Date(today);
          next.setDate(today.getDate() + minDiff);
          const month = next.getMonth() + 1;
          const date = next.getDate();
          nextText = `${month}/${date}(${labels[targetDay]}) 예정`;
        }
      } else {
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        const month = tomorrow.getMonth() + 1;
        const date = tomorrow.getDate();
        nextText = `${month}/${date} 예정`;
      }

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
        (a, b) => order[a] - order[b]
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
      dateLabel: "다음 일정 준비 중",
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

  // 아이템 클릭 시 반대쪽으로 이동
  const handleMoveItem = (itemId: string, fromBulk: boolean) => {
    if (fromBulk) {
      const item = bulkItems.find((i) => i.id === itemId);
      if (item) {
        setBulkItems((prev) => prev.filter((i) => i.id !== itemId));
        setExpressItems((prev) => [...prev, item]);
      }
    } else {
      const item = expressItems.find((i) => i.id === itemId);
      if (item) {
        setExpressItems((prev) => prev.filter((i) => i.id !== itemId));
        setBulkItems((prev) => [...prev, item]);
      }
    }
  };

  // 전체 넘김
  const handleMoveAll = (fromBulk: boolean) => {
    if (fromBulk) {
      setExpressItems((prev) => [...prev, ...bulkItems]);
      setBulkItems([]);
    } else {
      setBulkItems((prev) => [...prev, ...expressItems]);
      setExpressItems([]);
    }
  };

  return (
    <>
      <Card className="relative flex flex-col rounded-2xl border border-orange-300 bg-orange-50/80 shadow-sm transition-all hover:shadow-lg flex-none">
        <CardHeader className="pb-0 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base font-semibold">
              다음 배송 안내
            </CardTitle>
            {(() => {
              const { modeLabel, countLabel, dateLabel } = getNextSummary();
              return (
                <div className="flex flex-col items-end text-xs text-orange-900/80">
                  <span className="font-semibold">{modeLabel}</span>
                  <span>{countLabel}</span>
                  <span className="text-[11px] text-orange-800/70">
                    {dateLabel}
                  </span>
                </div>
              );
            })()}
          </div>
          <CardDescription className="text-md leading-relaxed text-orange-900/90">
            {getCardMessage()}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-right pt-4">
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
            <p className="mt-1 text-mg text-gray-600">
              신속 배송시 묶음 배송 제품도 동봉합니다.
            </p>
          </DialogHeader>
          <div className="relative flex items-stretch gap-6 py-6">
            {/* 왼쪽: 묶음 배송 */}
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-1 w-1 rounded-full bg-blue-600"></div>
                  <h3 className="font-bold text-lg text-gray-900">묶음 배송</h3>
                </div>
                {bulkItems.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleMoveAll(true)}
                    className="text-xs"
                  >
                    전체 넘김
                  </Button>
                )}
              </div>
              <div className="relative flex flex-col rounded-2xl border border-gray-200 bg-white/80 shadow-sm hover:shadow-md transition-shadow p-6 space-y-2 max-h-96 overflow-y-auto">
                {bulkItems.length === 0 ? (
                  <div className="text-sm text-gray-500 text-center py-8">
                    묶음 배송 대기 중인 제품이 없습니다.
                  </div>
                ) : (
                  bulkItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleMoveItem(item.id, true)}
                      className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50 hover:bg-blue-50 hover:border-blue-300 transition-all cursor-pointer group"
                    >
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium text-gray-900">
                          {item.name}
                        </p>
                        <p className="text-xs text-gray-500">{item.count}개</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* 중앙: 화살표 */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-1/2 z-10">
              <ArrowRightLeft className="w-5 h-5 text-gray-400" />
            </div>

            {/* 오른쪽: 신속 배송 */}
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-1 w-1 rounded-full bg-red-600"></div>
                  <h3 className="font-bold text-lg text-gray-900">신속 배송</h3>
                </div>
                {expressItems.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleMoveAll(false)}
                    className="text-xs"
                  >
                    전체 넘김
                  </Button>
                )}
              </div>
              <div className="relative flex flex-col rounded-2xl border border-gray-200 bg-white/80 shadow-sm hover:shadow-md transition-shadow p-6 space-y-2 max-h-96 overflow-y-auto">
                {expressItems.length === 0 ? (
                  <div className="text-sm text-gray-500 text-center py-8">
                    신속 배송 제품이 없습니다.
                  </div>
                ) : (
                  expressItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleMoveItem(item.id, false)}
                      className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50 hover:bg-red-50 hover:border-red-300 transition-all cursor-pointer group"
                    >
                      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-red-600 transition-colors rotate-180" />
                      <div className="flex-1 text-right">
                        <p className="text-sm font-medium text-gray-900">
                          {item.name}
                        </p>
                        <p className="text-xs text-gray-500">{item.count}개</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
