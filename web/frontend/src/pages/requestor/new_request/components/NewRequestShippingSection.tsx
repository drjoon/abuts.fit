import { Button } from "@/components/ui/button";
import { FunctionalItemCard } from "@/shared/ui/components/FunctionalItemCard";
import { Truck, Zap } from "lucide-react";
import type { CaseInfos } from "../hooks/newRequestTypes";

type Props = {
  caseInfos?: CaseInfos;
  setCaseInfos: (updates: Partial<CaseInfos>) => void;
  disabled?: boolean;
  highlight: boolean;
  sectionHighlightClass: string;
  bulkShippingSummary: string;
  normalArrivalDate?: string;
  expressArrivalDate?: string;
  onOpenShippingSettings: () => void;
  onSelectExpress: () => void;
  onSubmit: () => void;
  onCancelAll: () => void;
};

export function NewRequestShippingSection({
  caseInfos,
  setCaseInfos,
  disabled,
  highlight,
  sectionHighlightClass,
  bulkShippingSummary,
  normalArrivalDate,
  expressArrivalDate,
  onOpenShippingSettings,
  onSelectExpress,
  onSubmit,
  onCancelAll,
}: Props) {
  const isDisabled = !!disabled;
  return (
    <div
      className={`app-surface app-surface--panel relative flex flex-col justify-center gap-2 border-2 border-gray-300 p-4 md:p-6 ${
        highlight ? sectionHighlightClass : ""
      }`}
    >
      <div className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <FunctionalItemCard
            onUpdate={isDisabled ? undefined : onOpenShippingSettings}
            disabled={isDisabled}
            className="col-span-1"
          >
            <button
              type="button"
              disabled={isDisabled}
              onClick={() =>
                setCaseInfos({
                  shippingMode: "normal",
                  requestedShipDate: undefined,
                })
              }
              className={`w-full flex items-center justify-center gap-2 p-3 rounded-lg border text-sm transition-all ${
                (caseInfos?.shippingMode || "normal") === "normal"
                  ? "border-primary bg-primary/5 text-primary font-medium"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              } ${
                isDisabled
                  ? "opacity-50 cursor-not-allowed hover:bg-transparent"
                  : ""
              }`}
            >
              <Truck className="w-4 h-4" />
              <span className="flex flex-col items-start leading-tight">
                <span>묶음 배송</span>
                <span className="text-[11px] md:text-xs opacity-80 font-normal">
                  {bulkShippingSummary}
                </span>
                {normalArrivalDate && (
                  <span
                    className={`text-[11px] md:text-xs ${
                      (caseInfos?.shippingMode || "normal") === "normal"
                        ? "text-primary"
                        : "text-gray-500"
                    }`}
                  >
                    도착 예정: {normalArrivalDate}
                  </span>
                )}
              </span>
            </button>
          </FunctionalItemCard>

          <button
            type="button"
            disabled={isDisabled}
            onClick={() => {
              if (isDisabled) return;
              onSelectExpress();
            }}
            className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-sm transition-all ${
              caseInfos?.shippingMode === "express"
                ? "border-orange-500 bg-orange-50 text-orange-600 font-medium"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            } ${
              isDisabled
                ? "opacity-50 cursor-not-allowed hover:bg-transparent"
                : ""
            }`}
          >
            <Zap className="w-4 h-4" />
            <span className="flex flex-col items-start leading-tight">
              <span>신속 배송</span>
              {expressArrivalDate && (
                <span
                  className={`text-[11px] md:text-xs ${
                    caseInfos?.shippingMode === "express"
                      ? "text-orange-700"
                      : "text-gray-500"
                  }`}
                >
                  도착 예정: {expressArrivalDate}
                </span>
              )}
            </span>
          </button>
        </div>
      </div>

      <div className="space-y-3 pt-4 border-gray-200">
        <div className="flex gap-2 flex-col sm:flex-row">
          <Button
            onClick={onSubmit}
            size="lg"
            className="w-full sm:flex-[2]"
            disabled={isDisabled}
          >
            의뢰하기
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full sm:flex-[1]"
            onClick={onCancelAll}
            disabled={isDisabled}
          >
            취소하기
          </Button>
        </div>
      </div>
    </div>
  );
}
