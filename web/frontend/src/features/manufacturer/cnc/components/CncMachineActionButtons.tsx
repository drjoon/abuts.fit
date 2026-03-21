import { Info, ListChecks, Settings, Thermometer, Wrench } from "lucide-react";

export type CncToolAlertLevel = "ok" | "warn" | "alarm" | "unknown" | "disabled";

interface CncMachineActionButtonsProps {
  loading?: boolean;
  tempLevel?: CncToolAlertLevel;
  toolLevel?: CncToolAlertLevel;
  tempTooltip?: string;
  toolTooltip?: string;
  onInfoClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onQueueClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onTempClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onToolClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onSettingsClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

const getToneClass = (level?: CncToolAlertLevel) => {
  if (level === "alarm") {
    return "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800";
  }
  if (level === "warn") {
    return "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800";
  }
  return "border-slate-200 bg-white/80 text-slate-700 hover:bg-white hover:text-slate-900";
};

const baseClass =
  "inline-flex items-center justify-center rounded-full h-8 w-8 border transition-colors shadow-sm disabled:opacity-40";

export const CncMachineActionButtons = ({
  loading,
  tempLevel,
  toolLevel,
  tempTooltip,
  toolTooltip,
  onInfoClick,
  onQueueClick,
  onTempClick,
  onToolClick,
  onSettingsClick,
}: CncMachineActionButtonsProps) => {
  return (
    <div className="flex flex-nowrap items-center justify-end gap-1.5">
      <button
        type="button"
        className={`${baseClass} border-slate-200 bg-white/80 text-slate-700 hover:bg-white hover:text-slate-900`}
        onClick={onInfoClick}
        title="현재 프로그램/알람 정보"
        disabled={loading || !onInfoClick}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={`${baseClass} border-slate-200 bg-white/80 text-slate-700 hover:bg-white hover:text-slate-900`}
        onClick={onQueueClick}
        title="큐 관리"
        disabled={loading || !onQueueClick}
      >
        <ListChecks className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={`${baseClass} ${getToneClass(tempLevel)}`}
        onClick={onTempClick}
        title={tempTooltip || "온도 정보 확인"}
        disabled={loading || !onTempClick}
      >
        <Thermometer className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={`${baseClass} ${getToneClass(toolLevel)}`}
        onClick={onToolClick}
        title={toolTooltip || "공구 수명, 교체 확인"}
        disabled={loading || !onToolClick}
      >
        <Wrench className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={`${baseClass} border-slate-200 bg-white/80 text-slate-700 hover:bg-white hover:text-slate-900`}
        onClick={onSettingsClick}
        title="장비 설정"
        disabled={loading || !onSettingsClick}
      >
        <Settings className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
