import React from "react";
import {
  Thermometer,
  Wrench,
  Settings,
  X,
  ShieldOff,
  Pause,
  Play,
} from "lucide-react";
import { Machine } from "@/pages/manufacturer/cnc/types";

export type HealthLevel = "ok" | "warn" | "alarm" | "unknown";

interface MachineCardProps {
  machine: Machine;
  isActive: boolean;
  loading: boolean;
  tempHealth: HealthLevel;
  toolHealth: HealthLevel;
  tempTooltip: string;
  toolTooltip: string;
  currentProg: any | null;
  nextProgs: any[];
  reservationSummary?: string | null;
  reservedTotalQty?: number;
  onSelect: () => void;
  onTempClick: (e: React.MouseEvent) => void;
  onToolClick: (e: React.MouseEvent) => void;
  onEditClick: (e: React.MouseEvent) => void;
  onOpenCurrentProg: (e: React.MouseEvent) => void;
  onOpenNextProg: (prog: any, e: React.MouseEvent) => void;
  onOpenJobConfig: (e: React.MouseEvent) => void;
  onResetClick: (e: React.MouseEvent) => void;
  onCancelReservation?: (
    jobId: string | undefined,
    e: React.MouseEvent
  ) => void;
  onOpenReservationList?: (e: React.MouseEvent) => void;
  onTogglePause?: (jobId: string | undefined, e: React.MouseEvent) => void;
}

const getMachineStatusChip = (status: string) => {
  const s = (status || "").toUpperCase();

  let color = "bg-gray-400";
  let label = "대기";

  if (["RUN", "RUNNING", "ONLINE", "OK"].some((k) => s.includes(k))) {
    color = "bg-emerald-500";
    label = "생산 중";
  } else if (["WARN", "WARNING"].some((k) => s.includes(k))) {
    color = "bg-amber-400";
    label = "주의";
  } else if (["ALARM", "ERROR", "FAULT"].some((k) => s.includes(k))) {
    color = "bg-red-500";
    label = "알람";
  } else if (["STOP", "IDLE"].some((k) => s.includes(k))) {
    color = "bg-slate-400";
    label = "정지";
  }

  return (
    <div className="flex items-center">
      <div
        className={`w-3.5 h-3.5 rounded-full ${color} shadow-inner`}
        title={label}
      />
    </div>
  );
};

const getHealthColorClass = (level: HealthLevel) => {
  switch (level) {
    case "ok":
      return "text-emerald-500";
    case "warn":
      return "text-amber-400";
    case "alarm":
      return "text-red-500";
    default:
      return "text-gray-400";
  }
};

export const MachineCard: React.FC<MachineCardProps> = ({
  machine,
  isActive,
  loading,
  tempHealth,
  toolHealth,
  tempTooltip,
  toolTooltip,
  currentProg,
  nextProgs,
  reservationSummary,
  reservedTotalQty,
  onSelect,
  onTempClick,
  onToolClick,
  onEditClick,
  onOpenCurrentProg,
  onOpenNextProg,
  onOpenJobConfig,
  onResetClick,
  onCancelReservation,
  onOpenReservationList,
  onTogglePause,
}) => {
  const hasReservation = !!reservationSummary;
  const hasNextProgs =
    hasReservation && Array.isArray(nextProgs) && nextProgs.length > 0;
  const nextProg = hasNextProgs ? nextProgs[0] : null;
  const originalTotal =
    typeof reservedTotalQty === "number" && reservedTotalQty > 0
      ? reservedTotalQty
      : undefined;

  const remainingTotal = hasNextProgs
    ? nextProgs.reduce((sum, p: any) => sum + (p.qty || 1), 0)
    : 0;

  // 이 장비 전체 예약 개수 중에서 현재까지 몇 개를 생산했는지를 계산하기 위해 originalTotal/remainingTotal을 사용한다.
  // 단, 표시되는 분모는 현재 "다음 생산" 프로그램 하나의 예약 개수(nextProg.qty)가 되어야 한다.
  const currentJobQty = (nextProg as any)?.qty ?? 0;
  let totalReservedCount = currentJobQty;
  let currentIndex =
    totalReservedCount - remainingTotal > 0
      ? totalReservedCount - remainingTotal + 1
      : remainingTotal === 0 && totalReservedCount > 0
      ? 1
      : 0;

  // 예약이 모두 삭제되었거나 다음 생산이 없으면 진행 표시를 숨기기 위해 0으로 리셋한다.
  if (!hasNextProgs) {
    totalReservedCount = 0;
    currentIndex = 0;
  }

  // 방어적으로 인덱스를 1~total 사이로 클램프한다.
  if (totalReservedCount > 0) {
    currentIndex = Math.min(totalReservedCount, Math.max(1, currentIndex));
  }

  const showReservationCounter =
    hasNextProgs && totalReservedCount > 0 && currentIndex > 0;
  const statusUpper = (machine.status || "").toUpperCase();
  const isRunning = ["RUN", "RUNNING", "ONLINE", "OK"].some((k) =>
    statusUpper.includes(k)
  );

  return (
    <div
      onClick={onSelect}
      className={`relative flex flex-col rounded-2xl border bg-white/80 p-4 sm:p-5 shadow-sm transition-all hover:shadow-lg cursor-pointer min-h-[220px] sm:min-h-[240px] ${
        isActive ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg font-bold text-gray-900">
            {machine.name}
          </span>
          {getMachineStatusChip(machine.status)}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            className="inline-flex items-center justify-center rounded-full w-8 h-8 bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 hover:text-gray-900 transition-colors disabled:opacity-40"
            onClick={onTempClick}
            title={
              tempTooltip || "모터 온도를 조회해 축별 온도 분포를 확인합니다."
            }
            disabled={loading}
          >
            <Thermometer
              className={`h-4 w-4 ${getHealthColorClass(tempHealth)}`}
            />
          </button>
          <button
            className="inline-flex items-center justify-center rounded-full w-8 h-8 bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 hover:text-gray-900 transition-colors disabled:opacity-40"
            onClick={onToolClick}
            title={toolTooltip || "공구 수명과 교체 시점을 확인합니다."}
            disabled={loading}
          >
            <Wrench className={`h-4 w-4 ${getHealthColorClass(toolHealth)}`} />
          </button>
          <button
            className="inline-flex items-center justify-center rounded-full w-8 h-8 bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            onClick={onEditClick}
          >
            {machine.allowJobStart === false ? (
              <ShieldOff className="h-4 w-4 text-red-500" />
            ) : (
              <Settings className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {machine.lastError && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 border border-red-200">
          마지막 오류: {machine.lastError}
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 text-sm">
        <div className="flex flex-col gap-2">
          <button
            className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
            onClick={onOpenCurrentProg}
            disabled={
              !currentProg || !currentProg.name || !isActive || isRunning
            }
          >
            <span>
              {currentProg
                ? `생산중: ${currentProg.name ?? "쉬는 중"}`
                : "생산중: 쉬는 중"}
            </span>
            {currentProg && isActive && isRunning && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (
                    !currentProg ||
                    !currentProg.name ||
                    !isActive ||
                    !isRunning
                  )
                    return;
                  onResetClick(e);
                }}
                disabled={
                  !currentProg || !currentProg.name || !isActive || loading
                }
                className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs text-blue-500 hover:bg-blue-100 hover:text-blue-700 disabled:opacity-40"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </button>

          <button
            className="flex flex-col gap-1 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50 text-left"
            onClick={(e) => {
              if (!nextProg || !isActive) return;
              onOpenNextProg(nextProg, e);
            }}
            disabled={!isActive || !nextProg}
          >
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="truncate">
                {nextProg
                  ? (() => {
                      const name = String(nextProg.name ?? "");
                      const full = `다음 생산: ${name}`.trim();
                      return full.length > 24
                        ? `${full.slice(0, 21)}...`
                        : full;
                    })()
                  : "다음 생산: 없음"}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                {showReservationCounter && (
                  <span className="mr-0.5">
                    {currentIndex}/{totalReservedCount}
                  </span>
                )}
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!onTogglePause || !nextProg) return;
                    onTogglePause(nextProg.jobId as string | undefined, e);
                  }}
                  disabled={!isActive || !nextProg}
                >
                  {nextProg && (nextProg as any).paused ? (
                    // 예약이 일시정지(paused=true) 상태이면 Play 아이콘으로 표시하여 생산 시작을 의미하게 한다.
                    <Play className="h-3.5 w-3.5" />
                  ) : (
                    // 예약이 재생(paused=false) 상태이면 Pause 아이콘으로 표시하여 일시정지를 의미하게 한다.
                    <Pause className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!onCancelReservation || !nextProg) return;
                    onCancelReservation(
                      nextProg.jobId as string | undefined,
                      e
                    );
                  }}
                  disabled={!isActive || !nextProg}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
          </button>
        </div>

        <div className="mt-1 flex items-center justify-between gap-2">
          {hasNextProgs && (
            <button
              type="button"
              onClick={(e) => {
                if (!onOpenReservationList) return;
                e.stopPropagation();
                onOpenReservationList(e);
              }}
              disabled={!isActive}
              className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              예약목록
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenJobConfig(e);
            }}
            disabled={loading}
            className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            생산 예약하기
          </button>
        </div>
      </div>
    </div>
  );
};
