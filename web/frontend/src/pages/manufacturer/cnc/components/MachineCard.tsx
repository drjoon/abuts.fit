import React, { useEffect, useRef, useState } from "react";
import {
  Thermometer,
  Wrench,
  Settings,
  Info,
  X,
  ListChecks,
  Pause,
  Play,
  Cylinder,
  Layers,
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
import { Machine } from "@/pages/manufacturer/cnc/types";
import {
  getMachineStatusDotClass,
  getMachineStatusLabel,
} from "@/pages/manufacturer/cnc/lib/machineStatus";
import type { ContinuousMachiningState } from "../hooks/useCncContinuous";
import { useQueueSlots } from "../hooks/useQueueSlots";
import { CncCirclePlayPauseButton } from "./CncCirclePlayPauseButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getMockCncMachiningEnabled } from "@/lib/bridgeSettings";

export type HealthLevel = "ok" | "warn" | "alarm" | "unknown";

const parseProgramNoFromName = (name: string): number | null => {
  const str = String(name || "");
  const m = str.match(/O(\d{1,5})/i);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
};

interface MachineCardProps {
  machine: Machine;
  isActive: boolean;
  loading: boolean;
  isPlaying?: boolean;
  machiningElapsedSeconds?: number | null;
  lastCompleted?: {
    machineId: string;
    jobId: string | null;
    requestId: string | null;
    displayLabel?: string | null;
    completedAt: string;
    durationSeconds: number;
  } | null;
  machiningRecordSummary?: {
    status?: string;
    startedAt?: string | Date;
    completedAt?: string | Date;
    durationSeconds?: number;
    elapsedSeconds?: number;
  } | null;
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
  onPlayNext?: (jobId: string | undefined, e: React.MouseEvent) => void;
  onPlayNowPlaying?: (jobId: string | undefined, e: React.MouseEvent) => void;
  onCancelNowPlaying?: (jobId: string | undefined, e: React.MouseEvent) => void;
  onToggleAllowJobStart?: (next: boolean, e: React.MouseEvent) => void;
  onToggleDummyMachining?: (next: boolean, e: React.MouseEvent) => void;
  onReloadBridgeQueue?: () => void;
}

const getMachineStatusChip = (status: string, isRunning: boolean) => {
  const color = getMachineStatusDotClass(status);
  return (
    <div className="flex items-center">
      <div
        className={`w-3.5 h-3.5 rounded-full ${color} shadow-inner ${
          isRunning ? "animate-pulse" : ""
        }`}
      />
    </div>
  );
};

export const MachineCard = (props: MachineCardProps) => {
  const {
    machine,
    isActive,
    loading,
    isPlaying = false,
    machiningElapsedSeconds,
    lastCompleted,
    machiningRecordSummary,
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
    onResetClick,
    onStopClick,
    onOpenJobConfig,
    onUploadFiles,
    onCancelReservation,
    onOpenReservationList,
    onTogglePause,
    onPlayNext,
    onPlayNowPlaying,
    onCancelNowPlaying,
    onToggleAllowJobStart,
    onToggleDummyMachining,
    onReloadBridgeQueue,
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

  const [queueAdminOpen, setQueueAdminOpen] = useState(false);
  const [queueAdminLoading, setQueueAdminLoading] = useState(false);
  const [queueAdminJobs, setQueueAdminJobs] = useState<
    {
      id: string;
      fileName?: string;
      originalFileName?: string;
      source?: string;
      createdAtUtc?: string;
      paused?: boolean;
      qty?: number;
    }[]
  >([]);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [isMockFromBackend, setIsMockFromBackend] = useState<boolean | null>(
    null,
  );

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

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const enabled = await getMockCncMachiningEnabled(token);
        if (enabled === true) setIsMockFromBackend(true);
        else if (enabled === false) setIsMockFromBackend(false);
      } catch {
        // keep previous state on failure
      }
    })();
  }, [token]);

  const badgeIsMock = isMockFromBackend === true;
  const isDummyEnabled = machine.dummySettings?.enabled !== false;
  const isMockUi = badgeIsMock;

  const loadQueueAdmin = async (options?: { silent?: boolean }) => {
    if (!token) return;
    const uid = String(machine?.uid || "").trim();
    if (!uid) return;
    if (!options?.silent) setQueueAdminLoading(true);
    try {
      const res = await fetch(
        `/api/cnc-machines/${encodeURIComponent(uid)}/bridge-queue`,
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        },
      );
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) {
        throw new Error(body?.message || body?.error || "큐 조회 실패");
      }
      const list: any[] = Array.isArray(body?.data) ? body.data : [];
      setQueueAdminJobs(
        list.map((j) => ({
          id: String(j?.id || "").trim(),
          fileName: j?.fileName ? String(j.fileName) : undefined,
          originalFileName: j?.originalFileName
            ? String(j.originalFileName)
            : undefined,
          source: j?.source ? String(j.source) : undefined,
          createdAtUtc: j?.createdAtUtc ? String(j.createdAtUtc) : undefined,
          paused: j?.paused === true,
          qty:
            typeof j?.qty === "number" && Number.isFinite(j.qty)
              ? j.qty
              : undefined,
        })),
      );
      if (onReloadBridgeQueue) onReloadBridgeQueue();
    } catch (e: any) {
      const msg = e?.message || "큐 조회 중 오류";
      toast({
        title: "큐 조회 실패",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setQueueAdminLoading(false);
    }
  };

  const deleteQueueJobAdmin = async (jobId: string) => {
    if (!token) return;
    const uid = String(machine?.uid || "").trim();
    const jid = String(jobId || "").trim();
    if (!uid || !jid) return;
    setQueueAdminLoading(true);
    try {
      const res = await fetch(
        `/api/cnc-machines/${encodeURIComponent(uid)}/bridge-queue/${encodeURIComponent(
          jid,
        )}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) {
        throw new Error(body?.message || body?.error || "삭제 실패");
      }
      toast({ title: "삭제 완료" });
      await loadQueueAdmin({ silent: true });
    } catch (e: any) {
      const msg = e?.message || "삭제 중 오류";
      toast({ title: "삭제 실패", description: msg, variant: "destructive" });
    } finally {
      setQueueAdminLoading(false);
    }
  };

  const clearQueueAdmin = async () => {
    if (!token) return;
    const uid = String(machine?.uid || "").trim();
    if (!uid) return;
    setQueueAdminLoading(true);
    try {
      const res = await fetch(
        `/api/cnc-machines/${encodeURIComponent(uid)}/bridge-queue/clear`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) {
        throw new Error(body?.message || body?.error || "전체 삭제 실패");
      }
      toast({ title: "큐 비움 완료" });
      await loadQueueAdmin({ silent: true });
    } catch (e: any) {
      const msg = e?.message || "전체 삭제 중 오류";
      toast({
        title: "큐 비움 실패",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setQueueAdminLoading(false);
    }
  };
  const hasReservation = !!reservationSummary;
  const validNextProgs = Array.isArray(nextProgs) ? nextProgs : [];
  const { currentSlot: nextProg } = useQueueSlots(validNextProgs);
  const hasNextProgs = hasReservation && nextProg != null;
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
  const isRunningUi = isRunning || isPlaying;

  const worksheetCount =
    typeof worksheetQueueCount === "number" && worksheetQueueCount > 0
      ? worksheetQueueCount
      : 0;
  const statusLabel = getMachineStatusLabel(effectiveStatus);
  const materialDiameterLabel = (() => {
    const diameter = machine.currentMaterial?.diameter;
    if (
      typeof diameter === "number" &&
      Number.isFinite(diameter) &&
      diameter > 0
    ) {
      return Number.isInteger(diameter)
        ? String(diameter)
        : diameter.toFixed(1);
    }
    const group = machine.currentMaterial?.diameterGroup;
    if (group) {
      const parsed = Number.parseInt(group, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return String(parsed);
      }
      const numeric = group.replace(/[^0-9.]/g, "");
      if (numeric) return numeric;
    }
    return "0";
  })();

  const showContinuousInfo =
    continuousState && (continuousState.isRunning || continuousState.nextJob);
  const continuousElapsedMin = continuousState?.isRunning
    ? Math.floor(continuousState.elapsedSeconds / 60)
    : 0;

  const elapsedLabel = (() => {
    const sec =
      typeof machiningElapsedSeconds === "number" &&
      machiningElapsedSeconds >= 0
        ? Math.floor(machiningElapsedSeconds)
        : null;
    if (sec == null) return "";
    const mm = String(Math.floor(sec / 60)).padStart(2, "0");
    const ss = String(sec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  })();

  const recordLabel = (() => {
    const rec = machiningRecordSummary || null;
    if (!rec) return null;
    const status = String(rec.status || "")
      .trim()
      .toUpperCase();
    const startedAt = rec.startedAt ? new Date(rec.startedAt) : null;
    const completedAt = rec.completedAt ? new Date(rec.completedAt) : null;
    const durationSecRaw =
      typeof rec.durationSeconds === "number"
        ? rec.durationSeconds
        : typeof rec.elapsedSeconds === "number"
          ? rec.elapsedSeconds
          : null;
    const durationSec =
      typeof durationSecRaw === "number" && durationSecRaw >= 0
        ? Math.floor(durationSecRaw)
        : null;

    const toHHMM = (d: Date | null) => {
      if (!d) return "-";
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    };
    const toMMSS = (sec: number | null) => {
      if (sec == null) return "-";
      const m = String(Math.floor(sec / 60)).padStart(2, "0");
      const s = String(sec % 60).padStart(2, "0");
      return `${m}:${s}`;
    };
    const statusLabel =
      status === "COMPLETED"
        ? "가공완료"
        : status === "FAILED"
          ? "가공실패"
          : status === "CANCELED"
            ? "취소"
            : status === "RUNNING"
              ? "가공중"
              : status || "-";

    return {
      statusLabel,
      startedAtLabel: toHHMM(startedAt),
      completedAtLabel: toHHMM(completedAt),
      durationLabel: toMMSS(durationSec),
    };
  })();

  const derivedCompleted = (() => {
    if (lastCompleted) return lastCompleted;
    const rec = machiningRecordSummary || null;
    if (!rec) return null;
    const status = String(rec.status || "")
      .trim()
      .toUpperCase();
    if (!status || !["COMPLETED", "FAILED", "CANCELED"].includes(status)) {
      return null;
    }
    const completedAt = rec.completedAt
      ? String(rec.completedAt)
      : (rec as any)?.lastTickAt
        ? String((rec as any).lastTickAt)
        : new Date().toISOString();
    const durationSecondsRaw =
      typeof rec.durationSeconds === "number"
        ? rec.durationSeconds
        : typeof rec.elapsedSeconds === "number"
          ? rec.elapsedSeconds
          : null;
    const durationSeconds =
      typeof durationSecondsRaw === "number" && durationSecondsRaw >= 0
        ? Math.floor(durationSecondsRaw)
        : 0;
    const requestId = (currentProg as any)?.requestId
      ? String((currentProg as any).requestId)
      : null;
    const jobId = (currentProg as any)?.jobId
      ? String((currentProg as any).jobId)
      : (currentProg as any)?.id
        ? String((currentProg as any).id)
        : null;
    return {
      machineId: machine.uid,
      jobId,
      requestId,
      displayLabel: null,
      completedAt,
      durationSeconds,
    };
  })();

  const lastCompletedSummary = (() => {
    const base = derivedCompleted;
    if (!base) return null;
    const completedAt = base.completedAt ? new Date(base.completedAt) : null;
    const durationSec =
      typeof base.durationSeconds === "number" && base.durationSeconds >= 0
        ? Math.floor(base.durationSeconds)
        : null;

    const hhmm = completedAt
      ? `${String(completedAt.getHours()).padStart(2, "0")}:${String(
          completedAt.getMinutes(),
        ).padStart(2, "0")}`
      : "-";

    const mmss =
      durationSec == null
        ? "-"
        : `${String(Math.floor(durationSec / 60)).padStart(2, "0")}:${String(
            durationSec % 60,
          ).padStart(2, "0")}`;

    return { completedAtLabel: hhmm, durationLabel: mmss };
  })();

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
            {getMachineStatusChip(String(effectiveStatus || ""), isRunningUi)}
            <div
              className={`rounded-full px-2 py-0.5 text-[10px] font-black tracking-wide border ${
                isMockUi
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-slate-50 text-slate-700 border-slate-200"
              }`}
              title={isMockUi ? "더미(모의) 가공" : "실제 가공"}
            >
              {isMockUi ? "MOCK" : "REAL"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="text-[11px] font-extrabold text-slate-700">
              더미가공
            </div>
            <button
              type="button"
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isDummyEnabled ? "bg-blue-500" : "bg-gray-300"
              } ${!onToggleDummyMachining ? "opacity-50" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                if (!onToggleDummyMachining) return;
                const next = !isDummyEnabled;
                onToggleDummyMachining(next, e);
              }}
              disabled={loading || !onToggleDummyMachining}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isDummyEnabled ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-[11px] font-extrabold text-slate-700">
              원격가공
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
      <ConfirmDialog
        open={clearConfirmOpen}
        title="큐 전체 비우기"
        description="이 장비의 작업 큐를 모두 삭제합니다. 계속할까요?"
        confirmLabel="전체 비우기"
        cancelLabel="취소"
        onCancel={() => setClearConfirmOpen(false)}
        onConfirm={async () => {
          setClearConfirmOpen(false);
          await clearQueueAdmin();
        }}
      />
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
          {onMaterialClick && (
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full w-8 h-8 bg-white/80 text-slate-700 border border-slate-200 hover:bg-white hover:text-slate-900 transition-colors disabled:opacity-40 shadow-sm text-[11px] font-extrabold"
              onClick={(e) => {
                e.stopPropagation();
                onMaterialClick(e);
              }}
              title="소재 선택"
              disabled={loading}
            >
              {materialDiameterLabel}
            </button>
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
            className="inline-flex items-center justify-center rounded-full w-8 h-8 bg-white/80 text-slate-700 border border-slate-200 hover:bg-white hover:text-slate-900 transition-colors shadow-sm disabled:opacity-40"
            onClick={(e) => {
              e.stopPropagation();
              const next = !queueAdminOpen;
              setQueueAdminOpen(next);
              if (next) void loadQueueAdmin();
            }}
            title="큐 관리"
            disabled={loading}
          >
            <ListChecks className="h-3.5 w-3.5" />
          </button>
          <button
            className="inline-flex items-center justify-center rounded-full w-8 h-8 bg-white/80 text-slate-700 border border-slate-200 hover:bg-white hover:text-slate-900 transition-colors shadow-sm"
            onClick={onTempClick}
            title={tempTooltip || "소재 정보 확인"}
            disabled={loading}
          >
            <Thermometer className="h-3.5 w-3.5" />
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

      {queueAdminOpen && (
        <div
          className="mb-4 rounded-2xl border border-slate-200 bg-white/70 px-3 py-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] font-extrabold text-slate-800">
              큐 관리
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                disabled={queueAdminLoading}
                onClick={() => void loadQueueAdmin()}
              >
                새로고침
              </button>
              <button
                type="button"
                className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-extrabold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                disabled={queueAdminLoading}
                onClick={() => setClearConfirmOpen(true)}
              >
                전체 비우기
              </button>
            </div>
          </div>

          <div className="mt-2 max-h-[160px] overflow-auto rounded-xl border border-slate-100 bg-white">
            {queueAdminJobs.length === 0 ? (
              <div className="px-3 py-3 text-[12px] text-slate-500">
                비어있음
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {queueAdminJobs.map((j) => {
                  const title =
                    j.originalFileName || j.fileName || j.id || "(unknown)";
                  return (
                    <div
                      key={j.id}
                      className="flex items-center justify-between gap-2 px-3 py-2"
                      title={title}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-bold text-slate-800">
                          {title}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {j.source ? `source=${j.source}` : ""}
                          {j.qty ? `  qty=${j.qty}` : ""}
                          {j.paused ? "  paused" : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        disabled={queueAdminLoading}
                        onClick={() => void deleteQueueJobAdmin(j.id)}
                      >
                        삭제
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
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
          <div className="group rounded-2xl px-4 py-3 border shadow-sm bg-white/65 border-slate-200">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="mt-0.5 text-[11px] font-semibold text-slate-600">
                  Complete
                  <span className="ml-4 mr-4">
                    종료 {lastCompletedSummary?.completedAtLabel || ""}
                  </span>
                  <span>소요 {lastCompletedSummary?.durationLabel || ""}</span>
                </div>
                <div className="mt-0.5 truncate text-[15px] font-extrabold text-slate-900">
                  {derivedCompleted
                    ? String(
                        (derivedCompleted as any)?.displayLabel || "",
                      ).trim() ||
                      (derivedCompleted.requestId
                        ? `의뢰 (${String(derivedCompleted.requestId)})`
                        : derivedCompleted.jobId
                          ? `작업 (${String(derivedCompleted.jobId)})`
                          : "")
                    : "없음"}
                </div>
              </div>
              <div className="flex items-center gap-1" />
            </div>
          </div>

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
                <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                  <span>Now Playing</span>
                  {!!elapsedLabel && (
                    <span className="text-blue-600 font-bold">
                      {elapsedLabel}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-[15px] font-extrabold text-slate-900">
                  {currentProg ? (currentProg.name ?? "없음") : "없음"}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {currentProg && (currentProg as any)?.qty > 0 && (
                  <div className="mr-1 rounded-full bg-white/70 border border-slate-200 px-2 py-1 text-[11px] font-extrabold text-slate-700">
                    1/{(currentProg as any).qty}
                  </div>
                )}
                <CncCirclePlayPauseButton
                  paused={!isRunningUi}
                  running={isRunningUi}
                  disabled={!currentProg || !currentProg.name}
                  title={isRunningUi ? "정지(Stop)" : "가공 시작"}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!currentProg || !currentProg.name) return;

                    if (isRunningUi) {
                      if (onStopClick) onStopClick(e);
                      return;
                    }

                    if (onPlayNowPlaying) {
                      const jobId =
                        (currentProg as any)?.jobId || (currentProg as any)?.id;
                      onPlayNowPlaying(jobId, e);
                    }
                  }}
                  className={
                    isRunningUi
                      ? "bg-white border-slate-200 text-slate-700"
                      : "bg-white border-slate-200 text-slate-700"
                  }
                />
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/80 border border-slate-200 text-slate-700 hover:bg-white disabled:opacity-40"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!onCancelNowPlaying || !currentProg) return;
                    const jobId =
                      (currentProg as any)?.jobId || (currentProg as any)?.id;
                    onCancelNowPlaying(jobId, e);
                  }}
                  disabled={!currentProg || !onCancelNowPlaying || isRunningUi}
                  title="삭제"
                >
                  <X className="h-4 w-4" />
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
                  const nextJobIdRaw = nextProg
                    ? ((nextProg as any).jobId as string | undefined)
                    : undefined;
                  const nextJobId = nextJobIdRaw || (nextProg as any)?.id;
                  const pausedRaw = (nextProg as any)?.paused;
                  const paused =
                    typeof pausedRaw === "boolean" ? pausedRaw : true;

                  return (
                    <CncCirclePlayPauseButton
                      paused={paused}
                      disabled={!nextProg}
                      title={
                        !nextProg ? "-" : paused ? "자동 시작" : "일시정지"
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!nextProg || !onTogglePause) return;
                        onTogglePause(nextJobId, e);
                      }}
                    />
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
                    <span className="font-semibold">더미가공 스케줄</span>
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

                    if (isDummyEnabled) {
                      // smart/start 없이, bridge-queue에서 첫 작업을 unpause하여 연속 가공이 시작되도록 한다.
                      const qRes = await fetch(
                        `/api/cnc-machines/${encodeURIComponent(machine.uid)}/bridge-queue`,
                        {
                          method: "GET",
                          headers: {
                            Authorization: `Bearer ${token}`,
                            "Cache-Control": "no-cache",
                            Pragma: "no-cache",
                          },
                        },
                      );
                      const qBody: any = await qRes.json().catch(() => ({}));
                      const list: any[] = Array.isArray(qBody?.data)
                        ? qBody.data
                        : [];
                      const firstId = String(list?.[0]?.id || "").trim();
                      if (!firstId) {
                        throw new Error("브리지 예약 큐에 작업이 없습니다.");
                      }

                      const batchRes = await fetch(
                        `/api/cnc-machines/${encodeURIComponent(machine.uid)}/bridge-queue/batch`,
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                          },
                          body: JSON.stringify({
                            pauseUpdates: [{ jobId: firstId, paused: false }],
                          }),
                        },
                      );
                      const batchBody: any = await batchRes
                        .json()
                        .catch(() => ({}));
                      if (!batchRes.ok || batchBody?.success === false) {
                        throw new Error(
                          batchBody?.message ||
                            batchBody?.error ||
                            "브리지 예약 큐 반영에 실패했습니다.",
                        );
                      }
                    } else {
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
                      const rawBody: any = await rawRes
                        .json()
                        .catch(() => ({}));
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
                            "더미가공 시작에 실패했습니다.",
                        );
                      }
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
