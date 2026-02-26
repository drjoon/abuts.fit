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
  weeklyBatchLabel: string;
  expressEstimatedShipYmd?: string;
  expressDisplayYmd?: string;
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
  weeklyBatchLabel,
  expressEstimatedShipYmd,
  expressDisplayYmd,
  onOpenShippingSettings,
  onSelectExpress,
  onSubmit,
  onCancelAll,
}: Props) {
  const isDisabled = !!disabled;
  const formatYmdWithDay = (ymd?: string) => {
    if (!ymd) return "";
    const safeYmd = String(ymd).trim();
    const date = new Date(`${safeYmd}T00:00:00`);
    if (Number.isNaN(date.getTime())) return safeYmd;
    const labels = ["일", "월", "화", "수", "목", "금", "토"];
    const label = labels[date.getDay()] || "";
    return label ? `${safeYmd} (${label})` : safeYmd;
  };
  const bulkLabelText = weeklyBatchLabel || "미설정";
  const expressDisplayText = formatYmdWithDay(
    expressEstimatedShipYmd || expressDisplayYmd,
  );
  const holidayRolloverNote = "공휴일이면 다음날 발송";
  return (
    <div
      className={`app-glass-card app-glass-card--lg relative flex flex-col justify-center gap-2 border-2 border-gray-300 p-2 md:p-3 ${
        highlight ? sectionHighlightClass : ""
      }`}
    >
      <div className="app-glass-card-content space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <FunctionalItemCard
            onUpdate={isDisabled ? undefined : onOpenShippingSettings}
            disabled={isDisabled}
            className={`col-span-1 app-glass-card app-glass-card--lg overflow-hidden border-2 ${
              (caseInfos?.shippingMode || "normal") === "normal"
                ? "border-primary bg-primary/5"
                : "border-transparent bg-white"
            }`}
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
              className={`w-full h-full flex items-center justify-center gap-2 p-3 rounded-lg border-0 text-sm transition-all ${
                (caseInfos?.shippingMode || "normal") === "normal"
                  ? "text-primary font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              } ${
                isDisabled
                  ? "opacity-50 cursor-not-allowed hover:bg-transparent"
                  : ""
              }`}
            >
              <Truck className="w-4 h-4" />
              <span className="flex flex-col items-start leading-tight text-lg">
                <span>묶음 배송</span>
                <span className="text-sm text-slate-500">
                  {bulkLabelText} 발송
                </span>
              </span>
            </button>
          </FunctionalItemCard>

          <div
            className={`app-glass-card app-glass-card--lg overflow-hidden border-2 ${
              caseInfos?.shippingMode === "express"
                ? "border-orange-500 bg-orange-50"
                : "border-transparent bg-white"
            }`}
          >
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => {
                if (isDisabled) return;
                onSelectExpress();
              }}
              className={`w-full h-full flex items-center justify-center gap-2 p-3 rounded-lg border-0 text-sm transition-all ${
                caseInfos?.shippingMode === "express"
                  ? "text-orange-600 font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              } ${
                isDisabled
                  ? "opacity-50 cursor-not-allowed hover:bg-transparent"
                  : ""
              }`}
            >
              <Zap className="w-4 h-4" />
              <span className="flex flex-col items-start leading-tight text-lg">
                <span>신속 배송</span>
                {expressDisplayText && (
                  <span
                    className={`text-sm ${
                      caseInfos?.shippingMode === "express"
                        ? "text-orange-600"
                        : "text-gray-500"
                    }`}
                  >
                    {expressDisplayText} 발송
                  </span>
                )}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="mt-2 text-center text-sm text-slate-600">
        {holidayRolloverNote}
      </div>

      <div className="app-glass-card-content space-y-3 pt-4 border-gray-200">
        <div className="flex gap-2 flex-col sm:flex-row">
          <Button
            onClick={onSubmit}
            size="lg"
            className="w-full sm:flex-[2] text-lg"
            disabled={isDisabled}
          >
            의뢰하기
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full sm:flex-[1] text-lg"
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
