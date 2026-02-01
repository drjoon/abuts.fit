import React, { useEffect, useRef, useState } from "react";
import {
  Thermometer,
  Wrench,
  Settings,
  Info,
  X,
  ShieldOff,
  Pause,
  Play,
  Cylinder,
  Plus,
  Minus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/store/useAuthStore";
import { useMachineStatusStore } from "@/store/useMachineStatusStore";
import { useToast } from "@/hooks/use-toast";
import { parseProgramNoFromName } from "../lib/programNaming";
import { Machine } from "@/pages/manufacturer/cnc/types";
import {
  getMachineStatusDotClass,
  getMachineStatusLabel,
} from "@/pages/manufacturer/cnc/lib/machineStatus";
import type { ContinuousMachiningState } from "../hooks/useCncContinuous";

export type HealthLevel = "ok" | "warn" | "alarm" | "unknown";

interface MachineCardProps {
  machine: Machine;
  isActive: boolean;
  loading: boolean;
  worksheetQueueCount?: number;
  tempTooltip: string;
  toolTooltip: string;
  currentProg: any | null;
  nextProgs: any[];
  reservationSummary?: string | null;
  reservedTotalQty?: number;
  uploadProgress?: {
    machineId: string;
    fileName: string;
    percent: number;
  } | null;
  continuousState?: ContinuousMachiningState | null;
  onSelect: () => void;
  onMaterialClick?: (e: React.MouseEvent) => void;
  onTempClick: (e: React.MouseEvent) => void;
  onToolClick: (e: React.MouseEvent) => void;
  onOpenMachineInfo?: (e: React.MouseEvent) => void;
  onInfoClick?: (e: React.MouseEvent) => void;
  onEditClick: (e: React.MouseEvent) => void;
  onOpenCurrentProg: (e: React.MouseEvent) => void;
  onOpenNextProg: (prog: any, e: React.MouseEvent) => void;
  onPlayManualCard?: (itemId: string) => void;
  onResetClick: (e: React.MouseEvent) => void;
  onStopClick?: (e: React.MouseEvent) => void;
  onOpenJobConfig: (e: React.MouseEvent) => void;
  onUploadFiles?: (files: FileList | File[]) => void;
  onCancelReservation?: (
    jobId: string | undefined,
    e: React.MouseEvent,
  ) => void;
  onOpenReservationList?: (e: React.MouseEvent) => void;
  onTogglePause?: (jobId: string | undefined, e: React.MouseEvent) => void;
  onToggleAllowJobStart?: (next: boolean, e: React.MouseEvent) => void;
  onToggleDummyMachining?: (next: boolean, e: React.MouseEvent) => void;
}

const getMachineStatusChip = (status: string) => {
  const color = getMachineStatusDotClass(status);
  return (
    <div className="flex items-center">
      <div className={`w-3.5 h-3.5 rounded-full ${color} shadow-inner`} />
    </div>
  );
};

export const MachineCard = (props: MachineCardProps) => {
  const {
    machine,
    isActive,
    loading,
    worksheetQueueCount,
    tempTooltip,
    toolTooltip,
    currentProg,
    nextProgs,
    reservationSummary,
    reservedTotalQty,
    uploadProgress,
    continuousState,
    onSelect,
    onMaterialClick,
    onTempClick,
    onToolClick,
    onOpenMachineInfo,
    onInfoClick,
    onEditClick,
    onOpenCurrentProg,
    onOpenNextProg,
    onPlayManualCard,
    onResetClick,
    onStopClick,
    onOpenJobConfig,
    onUploadFiles,
    onCancelReservation,
    onOpenReservationList,
    onTogglePause,
    onToggleAllowJobStart,
    onToggleDummyMachining,
  } = props;

  const { token } = useAuthStore();
  const { toast } = useToast();
  const statusByUid = useMachineStatusStore((s) => s.statusByUid);
  const effectiveStatus = statusByUid[machine.uid] ?? machine.status ?? "";
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dropping, setDropping] = useState(false);
  const [dummyOpen, setDummyOpen] = useState(false);
  const [dummyProgram, setDummyProgram] = useState("O0100");
  const [dummySchedules, setDummySchedules] = useState<
    { id: number; time: string; enabled: boolean }[]
  >([
    { id: 1, time: "08:00", enabled: true },
    { id: 2, time: "16:00", enabled: true },
  ]);
  const [dummyExcludeHolidays, setDummyExcludeHolidays] = useState(false);
  const [dummySaving, setDummySaving] = useState(false);

  useEffect(() => {
    if (!machine?.dummySettings) return;
    const { programName, schedules, excludeHolidays } = machine.dummySettings;
    if (programName) {
      setDummyProgram(programName);
    }
    const next = Array.isArray(machine?.dummySettings?.schedules)
      ? machine.dummySettings!.schedules!
      : [];
    const mapped =
      next.length > 0
        ? next.map((s, idx) => ({
            id: idx + 1,
            time: s.time || "08:00",
            enabled: s.enabled !== false,
          }))
        : [
            { id: 1, time: "08:00", enabled: true },
            { id: 2, time: "16:00", enabled: true },
          ];
    setDummySchedules(mapped);
    if (typeof excludeHolidays === "boolean") {
      setDummyExcludeHolidays(excludeHolidays);
    }
  }, [machine?.dummySettings, machine?.uid]);
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
  const statusUpper = String(effectiveStatus || "").toUpperCase();
  const isRunning = ["RUN", "RUNNING", "ONLINE", "OK"].some((k) =>
    statusUpper.includes(k),
  );

  const worksheetCount =
    typeof worksheetQueueCount === "number" && worksheetQueueCount > 0
      ? worksheetQueueCount
      : 0;
  const statusLabel = getMachineStatusLabel(effectiveStatus);

  const showContinuousInfo =
    continuousState && (continuousState.isRunning || continuousState.nextJob);
  const continuousElapsedMin = continuousState?.isRunning
    ? Math.floor(continuousState.elapsedSeconds / 60)
    : 0;

  return (
    <div
      onClick={onSelect}
      onDragOver={(e) => {
        if (!onUploadFiles) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!onUploadFiles) return;
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDropping(false);
        }
      }}
      onDrop={(e) => {
        if (!onUploadFiles) return;
        e.preventDefault();
        setDropping(false);
        const { files } = e.dataTransfer;
        if (files && files.length > 0) {
          onUploadFiles(files);
        }
      }}
      className={`app-glass-card app-glass-card--xl flex flex-col cursor-pointer min-h-[240px] sm:min-h-[260px] ${
        isActive ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200"
      }`}
    >
      <div className="app-glass-card-content mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <div className="text-[16px] font-extrabold text-slate-900">
              {machine.name}
            </div>
            {getMachineStatusChip(String(effectiveStatus || ""))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="text-[11px] font-extrabold text-slate-700">
              더미 가공
            </div>
            <button
              type="button"
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                machine.dummySettings?.enabled !== false
                  ? "bg-blue-500"
                  : "bg-gray-300"
              } ${!onToggleDummyMachining ? "opacity-50" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                if (!onToggleDummyMachining) return;
                const next = machine.dummySettings?.enabled === false;
                onToggleDummyMachining(next, e);
              }}
              disabled={loading || !onToggleDummyMachining}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  machine.dummySettings?.enabled !== false
                    ? "translate-x-5"
                    : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-[11px] font-extrabold text-slate-700">
              원격 가공
            </div>
            <button
              type="button"
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                machine.allowJobStart !== false ? "bg-blue-500" : "bg-gray-300"
              } ${!onToggleAllowJobStart ? "opacity-50" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                if (!onToggleAllowJobStart) return;
                const next = machine.allowJobStart === false;
                onToggleAllowJobStart(next, e);
              }}
              disabled={loading || !onToggleAllowJobStart}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  machine.allowJobStart !== false
                    ? "translate-x-5"
                    : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {uploadProgress && (
        <div className="absolute top-2 left-2 right-2 z-20 rounded-2xl border border-blue-200 bg-blue-600/95 px-4 py-3 shadow-[0_18px_45px_rgba(37,99,235,0.35)]">
          <div className="flex items-center justify-between gap-2 text-[12px] text-white">
            <span className="truncate font-extrabold">
              업로드 중: {uploadProgress.fileName}
            </span>
            <span className="tabular-nums font-black">
              {uploadProgress.percent}%
            </span>
          </div>
          <div className="mt-2 h-2.5 w-full rounded-full bg-white/25">
            <div
              className="h-2.5 rounded-full bg-white"
              style={{ width: `${uploadProgress.percent}%` }}
            />
          </div>
        </div>
      )}
      {dropping && (
        <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-blue-400 bg-blue-50/60 z-20 flex items-center justify-center">
          <div className="text-sm font-semibold text-blue-700">
            파일을 놓으면 예약목록에 추가됩니다
          </div>
        </div>
      )}
      <div className="relative flex items-start justify-end gap-3 mb-4">
        <div className="flex flex-nowrap items-center justify-end gap-1.5">
          {onUploadFiles && (
            <>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-full w-8 h-8 bg-white/80 text-slate-700 border border-slate-200 hover:bg-white hover:text-slate-900 transition-colors disabled:opacity-40 shadow-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                disabled={loading}
                title="파일 업로드"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".nc,.txt"
                className="hidden"
                multiple
                onChange={(e) => {
                  const files = e.target.files;
                  if (!files || files.length === 0) return;
                  onUploadFiles(files);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
              />
            </>
          )}
          <button
            className="inline-flex items-center justify-center rounded-full w-8 h-8 bg-white/80 text-slate-700 border border-slate-200 hover:bg-white hover:text-slate-900 transition-colors shadow-sm"
            onClick={(e) => {
              e.stopPropagation();
              setDummyOpen(true);
            }}
            title="더미 작업"
          >
            <Cylinder className="h-3.5 w-3.5" />
          </button>
          <button
            className="inline-flex items-center justify-center rounded-full w-8 h-8 bg-white/80 text-slate-700 border border-slate-200 hover:bg-white hover:text-slate-900 transition-colors disabled:opacity-40 shadow-sm"
            onClick={onInfoClick}
            title="현재 프로그램/알람 정보"
            disabled={loading || !onInfoClick}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
          <button
            className="inline-flex items-center justify-center rounded-full w-8 h-8 bg-white/80 text-slate-700 border border-slate-200 hover:bg-white hover:text-slate-900 transition-colors disabled:opacity-40 text-[11px] font-bold shadow-sm"
            onClick={onMaterialClick}
            title="원소재"
            disabled={loading || !onMaterialClick}
          >
            {machine.currentMaterial?.diameter
              ? `Ø${machine.currentMaterial.diameter}`
              : "Ø"}
          </button>
          <button
            className="inline-flex items-center justify-center rounded-full w-8 h-8 bg-white/80 text-slate-700 border border-slate-200 hover:bg-white hover:text-slate-900 transition-colors shadow-sm"
            onClick={onToolClick}
            title={toolTooltip || "공구 수명, 교체 확인"}
            disabled={loading}
          >
            <Wrench className="h-3.5 w-3.5" />
          </button>
          <button
            className="inline-flex items-center justify-center rounded-full w-8 h-8 bg-white/80 text-slate-700 border border-slate-200 hover:bg-white hover:text-slate-900 transition-colors shadow-sm"
            onClick={onEditClick}
            title="장비 설정"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="relative h-10 -mt-1 mb-2">
        {machine.lastError ? (
          <div className="absolute inset-x-0 top-0 rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-700 border border-red-200 truncate">
            마지막 오류: {machine.lastError}
          </div>
        ) : machine.lastUpdated ? (
          <div className="absolute inset-x-0 top-0 rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-600 border border-slate-200 truncate">
            장비 상태 갱신 {machine.lastUpdated}
          </div>
        ) : (
          <div className="absolute inset-x-0 top-0 rounded-2xl bg-transparent px-3 py-2 text-xs text-transparent border border-transparent">
            -
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-col gap-3 text-sm relative">
        <div className="-mt-1">
          <div className="rounded-2xl bg-slate-50 px-3 py-2 text-[11px] font-extrabold text-slate-700 border border-slate-200">
            {statusLabel} · 의뢰건 가공 대기 {worksheetCount}건
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <div
            role="button"
            tabIndex={0}
            className={`group rounded-2xl px-4 py-3 border shadow-sm transition-all ${
              !currentProg || !currentProg.name
                ? "bg-white/55 border-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-white/85 border-slate-200 hover:bg-white cursor-pointer"
            }`}
            onClick={(e) => {
              if (!currentProg || !currentProg.name) return;
              onOpenCurrentProg(e);
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-slate-500">
                  Now Playing
                </div>
                <div className="mt-0.5 truncate text-[15px] font-extrabold text-slate-900">
                  {currentProg ? (currentProg.name ?? "없음") : "없음"}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const hasNow = !!currentProg && !!currentProg.name;
                    if (!hasNow || !isActive) return;

                    if (isRunning) {
                      if (!onStopClick) return;
                      onStopClick(e);
                      return;
                    }

                    // play 버튼: 가공 시작 (Alarm 체크 필수)
                    // 현재는 에디터를 열도록 구현되어 있으나, 향후 가공 시작으로 변경 필요
                    onOpenCurrentProg(e);
                  }}
                  disabled={
                    loading || !isActive || !currentProg || !currentProg.name
                  }
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40"
                  title={isRunning ? "정지(Stop)" : "프로그램 열기"}
                >
                  {isRunning ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div
            role="button"
            tabIndex={0}
            className={`group rounded-2xl px-4 py-3 border shadow-sm transition-all ${
              !nextProg
                ? "bg-white/55 border-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-white/85 border-slate-200 hover:bg-white cursor-pointer"
            }`}
            onClick={(e) => {
              if (!nextProg) return;
              onOpenNextProg(nextProg, e);
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-slate-500">
                  Next Up
                </div>
                <div className="mt-0.5 truncate text-[15px] font-extrabold text-slate-900">
                  {nextProg ? String(nextProg.name ?? "") : "없음"}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {showReservationCounter && (
                  <div className="mr-1 rounded-full bg-white/70 border border-slate-200 px-2 py-1 text-[11px] font-extrabold text-slate-700">
                    {currentIndex}/{totalReservedCount}
                  </div>
                )}

                {(() => {
                  const nextJobId = nextProg
                    ? ((nextProg as any).jobId as string | undefined)
                    : undefined;
                  const canControlNext =
                    !!isActive && !!nextProg && !!nextJobId;
                  const pausedRaw = (nextProg as any)?.paused;
                  const paused =
                    typeof pausedRaw === "boolean" ? pausedRaw : true;

                  return (
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/80 border border-slate-200 text-slate-700 hover:bg-white disabled:opacity-40"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!canControlNext || !nextProg) return;

                        if (!onTogglePause) return;
                        onTogglePause(nextJobId, e);
                      }}
                      disabled={!canControlNext}
                      title={
                        !nextProg
                          ? "-"
                          : !canControlNext
                            ? "예약된 작업이 없습니다."
                            : paused
                              ? "재생"
                              : "일시정지"
                      }
                    >
                      {paused ? (
                        <Play className="h-4 w-4" />
                      ) : (
                        <Pause className="h-4 w-4" />
                      )}
                    </button>
                  );
                })()}
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/80 border border-slate-200 text-slate-700 hover:bg-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!onCancelReservation || !nextProg) return;
                    onCancelReservation(
                      nextProg.jobId as string | undefined,
                      e,
                    );
                  }}
                  disabled={!nextProg || !onCancelReservation}
                  title="예약 취소"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {showContinuousInfo && (
          <div className="mt-2 rounded-lg bg-purple-50 px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-purple-700">연속가공</span>
              {continuousState?.isRunning && (
                <span className="text-purple-600">
                  {continuousElapsedMin}분 경과
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2 text-purple-600">
              <span>현재: O{continuousState?.currentSlot}</span>
              <span>→</span>
              <span>대기: O{continuousState?.nextSlot}</span>
            </div>
            {continuousState?.nextJob && (
              <div className="mt-1 text-purple-600 truncate">
                다음: {continuousState.nextJob}
              </div>
            )}
          </div>
        )}

        <div className="mt-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenJobConfig(e);
            }}
            disabled={loading}
            className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-2 text-xs font-extrabold text-white hover:from-blue-700 hover:to-sky-600 disabled:opacity-50 shadow-sm"
          >
            예약 관리
          </button>
        </div>
      </div>

      {dummyOpen && (
        <Dialog open={dummyOpen} onOpenChange={(open) => setDummyOpen(open)}>
          <DialogContent className="w-full max-w-[16rem] rounded-2xl p-6">
            <DialogHeader>
              <DialogTitle>더미 작업 설정</DialogTitle>
            </DialogHeader>
            <div className="space-y-5">
              <div className="space-y-3 text-sm text-gray-800">
                <label className="flex flex-col gap-2">
                  <span className="font-semibold">더미 프로그램명</span>
                  <input
                    value={dummyProgram}
                    onChange={(e) => setDummyProgram(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </label>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">더미 가공 스케줄</span>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200"
                      onClick={() => {
                        const nextId =
                          dummySchedules.reduce(
                            (max, s) => Math.max(max, s.id),
                            0,
                          ) + 1;
                        setDummySchedules((prev) => [
                          ...prev,
                          { id: nextId, time: "12:00", enabled: true },
                        ]);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <label className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-gray-700 border border-slate-100">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 accent-blue-600"
                      checked={dummyExcludeHolidays}
                      onChange={(e) =>
                        setDummyExcludeHolidays(e.target.checked)
                      }
                    />
                    <div className="flex flex-col leading-tight">
                      <span className="font-medium text-xs">쉬는 날 제외</span>
                    </div>
                  </label>
                  <div className="space-y-2">
                    {dummySchedules.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 shadow-inner"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 accent-blue-600"
                          checked={item.enabled}
                          onChange={(e) =>
                            setDummySchedules((prev) =>
                              prev.map((s) =>
                                s.id === item.id
                                  ? { ...s, enabled: e.target.checked }
                                  : s,
                              ),
                            )
                          }
                        />
                        <input
                          type="time"
                          step={600}
                          value={item.time}
                          onChange={(e) =>
                            setDummySchedules((prev) =>
                              prev.map((s) =>
                                s.id === item.id
                                  ? { ...s, time: e.target.value }
                                  : s,
                              ),
                            )
                          }
                          className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-50 text-red-500 hover:bg-red-100 border border-red-200"
                          onClick={() =>
                            setDummySchedules((prev) =>
                              prev.filter((s) => s.id !== item.id),
                            )
                          }
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {dummySchedules.length === 0 && (
                      <div className="text-xs text-gray-500">
                        스케줄이 없습니다.
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="w-full rounded-xl bg-blue-600 text-white font-semibold py-2.5 hover:bg-blue-700 transition-colors disabled:opacity-60"
                disabled={dummySaving}
                onClick={async () => {
                  if (!token) {
                    toast({
                      title: "로그인이 필요합니다",
                      description: "다시 로그인 후 시도해 주세요.",
                      variant: "destructive",
                    });
                    return;
                  }
                  setDummySaving(true);
                  try {
                    const payload = {
                      programName: dummyProgram,
                      schedules: dummySchedules.map((s) => ({
                        time: s.time,
                        enabled: s.enabled !== false,
                      })),
                      excludeHolidays: dummyExcludeHolidays,
                    };
                    const res = await fetch(
                      `/api/cnc-machines/${encodeURIComponent(
                        machine.uid,
                      )}/dummy-settings`,
                      {
                        method: "PATCH",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify(payload),
                      },
                    );
                    const body: any = await res.json().catch(() => ({}));
                    if (!res.ok || body?.success === false) {
                      throw new Error(
                        body?.message || "더미 설정 저장에 실패했습니다.",
                      );
                    }

                    const progNo = parseProgramNoFromName(dummyProgram || "");
                    if (progNo == null) {
                      throw new Error(
                        "더미 프로그램명에서 프로그램 번호를 찾을 수 없습니다. 예: O0100",
                      );
                    }

                    const rawRes = await fetch(
                      `/api/machines/${encodeURIComponent(machine.uid)}/raw`,
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                          dataType: "SetActivateProgram",
                          payload: { headType: 1, programNo: progNo },
                          timeoutMilliseconds: 5000,
                        }),
                      },
                    );
                    const rawBody: any = await rawRes.json().catch(() => ({}));
                    if (!rawRes.ok || rawBody?.success === false) {
                      throw new Error(
                        rawBody?.message ||
                          rawBody?.error ||
                          "더미 프로그램 활성화에 실패했습니다.",
                      );
                    }

                    const startRes = await fetch(
                      `/api/machines/${encodeURIComponent(machine.uid)}/start`,
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({ status: 0, ioUid: 0 }),
                      },
                    );
                    const startBody: any = await startRes
                      .json()
                      .catch(() => ({}));
                    if (!startRes.ok || startBody?.success === false) {
                      throw new Error(
                        startBody?.message ||
                          startBody?.error ||
                          "더미 가공 시작에 실패했습니다.",
                      );
                    }

                    toast({
                      title: "즉시 가공 시작",
                      description: `프로그램 ${
                        dummyProgram || `O${String(progNo).padStart(4, "0")}`
                      } 즉시 가공을 시작했습니다.`,
                    });
                    setDummyOpen(false);
                  } catch (e: any) {
                    toast({
                      title: "즉시 가공 실패",
                      description:
                        e?.message ??
                        "더미 즉시 가공 처리 중 오류가 발생했습니다.",
                      variant: "destructive",
                    });
                  } finally {
                    setDummySaving(false);
                  }
                }}
              >
                {dummySaving ? "즉시 가공 중..." : "즉시 가공"}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
