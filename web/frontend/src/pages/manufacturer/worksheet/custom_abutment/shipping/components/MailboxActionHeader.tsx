import { Settings } from "lucide-react";

type MailboxActionHeaderProps = {
  isRequestingPickup: boolean;
  hasRequestedSelection: boolean;
  canCancelPickup: boolean;
  canRequestPickup: boolean;
  shouldShowModifyPickup: boolean;
  canModifyPickup: boolean;
  modifyTargetCount: number;
  pickupPrimaryLabel: string;
  modifyPickupLabel: string;
  selectedOccupiedCount: number;
  selectedRequestedCount: number;
  onOpenPrinterSettings: () => void;
  onPrimaryAction: () => void;
  onModifyAction: () => void;
};

export const MailboxActionHeader = ({
  isRequestingPickup,
  hasRequestedSelection,
  canCancelPickup,
  canRequestPickup,
  shouldShowModifyPickup,
  canModifyPickup,
  modifyTargetCount,
  pickupPrimaryLabel,
  modifyPickupLabel,
  selectedOccupiedCount,
  selectedRequestedCount,
  onOpenPrinterSettings,
  onPrimaryAction,
  onModifyAction,
}: MailboxActionHeaderProps) => {
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

        <div className="flex gap-2 justify-center">
          <button
            onClick={onPrimaryAction}
            disabled={
              isRequestingPickup ||
              (hasRequestedSelection ? !canCancelPickup : !canRequestPickup)
            }
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors border ${
              isRequestingPickup ||
              (hasRequestedSelection ? !canCancelPickup : !canRequestPickup)
                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                : hasRequestedSelection
                  ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 shadow-sm"
                  : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 shadow-sm"
            }`}
          >
            {isRequestingPickup
              ? hasRequestedSelection
                ? "취소 중..."
                : "접수 중..."
              : pickupPrimaryLabel}
          </button>
          {shouldShowModifyPickup ? (
            <button
              onClick={onModifyAction}
              disabled={
                isRequestingPickup || !canModifyPickup || modifyTargetCount === 0
              }
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors border ${
                isRequestingPickup || !canModifyPickup || modifyTargetCount === 0
                  ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-sm"
              }`}
            >
              {isRequestingPickup ? "수정 중..." : modifyPickupLabel}
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 pt-2 pb-3 px-2 text-center">
        <div className="text-xs text-slate-500">
          선택 {selectedOccupiedCount}개 / 접수됨 {selectedRequestedCount}개
        </div>
      </div>
    </>
  );
};
