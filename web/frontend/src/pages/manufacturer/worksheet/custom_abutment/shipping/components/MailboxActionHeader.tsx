import { Settings } from "lucide-react";

type HeaderActionButton = {
  disabled: boolean;
  label: string;
  loading: boolean;
  loadingLabel?: string;
  onClick: () => void;
  variant?: "blue" | "rose" | "slate" | "white";
};

type MailboxActionHeaderProps = {
  isRequestingPickup: boolean;
  actionButtons: HeaderActionButton[];
  selectedOccupiedCount: number;
  selectedPrintedCount: number;
  selectedRequestedCount: number;
  onOpenPrinterSettings: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  disableSelectAll: boolean;
  disableClearSelection: boolean;
};

export const MailboxActionHeader = ({
  isRequestingPickup,
  actionButtons,
  selectedOccupiedCount,
  selectedPrintedCount,
  selectedRequestedCount,
  onOpenPrinterSettings,
  onSelectAll,
  onClearSelection,
  disableSelectAll,
  disableClearSelection,
}: MailboxActionHeaderProps) => {
  const getButtonClass = (variant: HeaderActionButton["variant"]) => {
    if (variant === "rose") {
      return "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 shadow-sm";
    }
    if (variant === "slate") {
      return "bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-sm";
    }
    if (variant === "white") {
      return "bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-sm";
    }
    return "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 shadow-sm";
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4 pb-1 px-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenPrinterSettings}
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
            aria-label="프린터 설정"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 justify-center">
          {actionButtons.map((button) => (
            <button
              key={button.label}
              onClick={button.onClick}
              disabled={isRequestingPickup || button.disabled}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors border ${
                isRequestingPickup || button.disabled
                  ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                  : getButtonClass(button.variant)
              }`}
            >
              {button.loading
                ? button.loadingLabel || "처리 중..."
                : button.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 pt-2 pb-3 px-2 text-center">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            disabled={disableSelectAll || isRequestingPickup}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors border ${
              disableSelectAll || isRequestingPickup
                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-sm"
            }`}
          >
            전체선택
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            disabled={disableClearSelection || isRequestingPickup}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors border ${
              disableClearSelection || isRequestingPickup
                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-sm"
            }`}
          >
            전체해제
          </button>
        </div>
        <div className="text-xs text-slate-500">
          선택 {selectedOccupiedCount}개 / 출력 {selectedPrintedCount}개 / 접수{" "}
          {selectedRequestedCount}개
        </div>
      </div>
    </>
  );
};
