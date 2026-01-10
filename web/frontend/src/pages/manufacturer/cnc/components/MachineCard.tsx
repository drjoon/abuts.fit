import React, { useEffect, useState } from "react";
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
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/use-toast";
import { parseProgramNoFromName } from "../lib/programNaming";
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
  onMaterialClick?: (e: React.MouseEvent) => void;
  onTempClick: (e: React.MouseEvent) => void;
  onToolClick: (e: React.MouseEvent) => void;
  onInfoClick?: (e: React.MouseEvent) => void;
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
  onMaterialClick,
  onTempClick,
  onToolClick,
  onInfoClick,
  onEditClick,
  onOpenCurrentProg,
  onOpenNextProg,
  onOpenJobConfig,
  onResetClick,
  onCancelReservation,
  onOpenReservationList,
  onTogglePause,
}) => {
  const { token } = useAuthStore();
  const { toast } = useToast();
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
            className="inline-flex items-center justify-center rounded-full w-8 h-8 bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setDummyOpen(true);
            }}
            title="더미 작업"
          >
            <Cylinder className="h-4 w-4" />
          </button>
          <button
            className="inline-flex items-center justify-center rounded-full w-8 h-8 bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 hover:text-gray-900 transition-colors disabled:opacity-40"
            onClick={onInfoClick}
            title="현재 프로그램/알람 정보"
            disabled={loading || !onInfoClick}
          >
            <Info className="h-4 w-4" />
          </button>
          <button
            className="inline-flex items-center justify-center rounded-full w-8 h-8 bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 hover:text-gray-900 transition-colors disabled:opacity-40 text-xs font-medium"
            onClick={onMaterialClick}
            title="원소재"
            disabled={loading || !onMaterialClick}
          >
            {machine.currentMaterial?.diameter
              ? `Ø${machine.currentMaterial.diameter}`
              : "Ø"}
          </button>
          <button
            className="inline-flex items-center justify-center rounded-full w-8 h-8 bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 hover:text-gray-900 transition-colors disabled:opacity-40"
            onClick={onToolClick}
            title={toolTooltip || "공구 수명, 교체 확인"}
            disabled={loading}
          >
            <Wrench className={`h-4 w-4 ${getHealthColorClass(toolHealth)}`} />
          </button>
          <button
            className="inline-flex items-center justify-center rounded-full w-8 h-8 bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 hover:text-gray-900 transition-colors disabled:opacity-40"
            onClick={onTempClick}
            title={tempTooltip || "모터 온도"}
            disabled={loading}
          >
            <Thermometer
              className={`h-4 w-4 ${getHealthColorClass(tempHealth)}`}
            />
          </button>
          <button
            className="inline-flex items-center justify-center rounded-full w-8 h-8 bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            onClick={onEditClick}
            title="장비 설정"
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
          <div
            role="button"
            tabIndex={0}
            className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
              !currentProg || !currentProg.name || !isActive || isRunning
                ? "bg-blue-50 text-blue-300 cursor-not-allowed"
                : "bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer"
            }`}
            onClick={(e) => {
              if (!currentProg || !currentProg.name || !isActive || isRunning)
                return;
              onOpenCurrentProg(e);
            }}
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
          </div>

          <div
            role="button"
            tabIndex={0}
            className={`flex flex-col gap-1 rounded-lg px-3 py-2.5 text-sm font-semibold text-left ${
              !isActive || !nextProg
                ? "bg-emerald-50 text-emerald-300 cursor-not-allowed"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
            }`}
            onClick={(e) => {
              if (!nextProg || !isActive) return;
              onOpenNextProg(nextProg, e);
            }}
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
          </div>
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

      {dummyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={(e) => {
            e.stopPropagation();
            setDummyOpen(false);
          }}
        >
          <div
            className="bg-white w-full max-w-[16rem] rounded-2xl shadow-[0_20px_50px_rgba(15,23,42,0.25)] border border-gray-100 p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 tracking-tight">
                더미 작업 설정
              </h3>
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 text-gray-600"
                onClick={() => setDummyOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
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
                          0
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
                    onChange={(e) => setDummyExcludeHolidays(e.target.checked)}
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
                                : s
                            )
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
                                : s
                            )
                          )
                        }
                        className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-50 text-red-500 hover:bg-red-100 border border-red-200"
                        onClick={() =>
                          setDummySchedules((prev) =>
                            prev.filter((s) => s.id !== item.id)
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
                  // 1) 더미 설정 저장 (프로그램명/스케줄)
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
                      machine.uid
                    )}/dummy-settings`,
                    {
                      method: "PATCH",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                      },
                      body: JSON.stringify(payload),
                    }
                  );
                  const body: any = await res.json().catch(() => ({}));
                  if (!res.ok || body?.success === false) {
                    throw new Error(
                      body?.message || "더미 설정 저장에 실패했습니다."
                    );
                  }

                  // 2) 더미 프로그램 번호 파싱 (예: "O0100" → 100)
                  const progNo = parseProgramNoFromName(dummyProgram || "");
                  if (progNo == null) {
                    throw new Error(
                      "더미 프로그램명에서 프로그램 번호를 찾을 수 없습니다. 예: O0100"
                    );
                  }

                  // 3) 브리지 raw 호출로 프로그램 활성화(UpdateActivateProg)
                  const rawRes = await fetch(
                    `/api/machines/${encodeURIComponent(machine.uid)}/raw`,
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                      },
                      body: JSON.stringify({
                        dataType: "UpdateActivateProg",
                        payload: { headType: 0, programNo: progNo },
                        timeoutMilliseconds: 5000,
                      }),
                    }
                  );
                  const rawBody: any = await rawRes.json().catch(() => ({}));
                  if (!rawRes.ok || rawBody?.success === false) {
                    throw new Error(
                      rawBody?.message ||
                        rawBody?.error ||
                        "더미 프로그램 활성화에 실패했습니다."
                    );
                  }

                  // 4) 가공 시작 제어 명령(/start)
                  const startRes = await fetch(
                    `/api/machines/${encodeURIComponent(machine.uid)}/start`,
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                      },
                      body: JSON.stringify({ status: 0, ioUid: 0 }),
                    }
                  );
                  const startBody: any = await startRes
                    .json()
                    .catch(() => ({}));
                  if (!startRes.ok || startBody?.success === false) {
                    throw new Error(
                      startBody?.message ||
                        startBody?.error ||
                        "더미 가공 시작에 실패했습니다."
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
        </div>
      )}
    </div>
  );
};
