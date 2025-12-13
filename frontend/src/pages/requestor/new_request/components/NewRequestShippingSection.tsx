import { Button } from "@/components/ui/button";
import { FunctionalItemCard } from "@/components/FunctionalItemCard";
import { Truck, Zap } from "lucide-react";
import type { CaseInfos } from "@/features/requestor/hooks/new_requests/newRequestTypes";

type Props = {
  caseInfos?: CaseInfos;
  setCaseInfos: (updates: Partial<CaseInfos>) => void;
  highlight: boolean;
  sectionHighlightClass: string;
  bulkShippingSummary: string;
  expressArrivalDate?: string;
  onOpenShippingSettings: () => void;
  onSelectExpress: () => void;
  onSubmit: () => void;
  onCancelAll: () => void;
};

export function NewRequestShippingSection({
  caseInfos,
  setCaseInfos,
  highlight,
  sectionHighlightClass,
  bulkShippingSummary,
  expressArrivalDate,
  onOpenShippingSettings,
  onSelectExpress,
  onSubmit,
  onCancelAll,
}: Props) {
  return (
    <div
      className={`relative flex flex-col justify-center gap-2 rounded-2xl border-2 border-gray-300 p-4 md:p-6 transition-shadow hover:shadow-md ${
        highlight ? sectionHighlightClass : ""
      }`}
    >
      <div className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <FunctionalItemCard
            onUpdate={onOpenShippingSettings}
            className="col-span-1"
          >
            <button
              type="button"
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
              }`}
            >
              <Truck className="w-4 h-4" />
              <span className="flex flex-col items-start leading-tight">
                <span>묶음 배송</span>
                <span className="text-[11px] md:text-xs opacity-80 font-normal">
                  {bulkShippingSummary}
                </span>
              </span>
            </button>
          </FunctionalItemCard>

          <button
            type="button"
            onClick={onSelectExpress}
            className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-sm transition-all ${
              caseInfos?.shippingMode === "express"
                ? "border-orange-500 bg-orange-50 text-orange-600 font-medium"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
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
          <Button onClick={onSubmit} size="lg" className="w-full sm:flex-[2]">
            의뢰하기
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full sm:flex-[1]"
            onClick={onCancelAll}
          >
            취소하기
          </Button>
        </div>
      </div>
    </div>
  );
}
