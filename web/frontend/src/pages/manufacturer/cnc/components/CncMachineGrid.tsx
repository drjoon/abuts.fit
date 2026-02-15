import React from "react";
import { Machine } from "@/pages/manufacturer/cnc/types";
import { MachineCard } from "@/pages/manufacturer/cnc/components/MachineCard";
import type { CncJobItem } from "@/pages/manufacturer/cnc/components/CncReservationModal";
import type { ContinuousMachiningState } from "../hooks/useCncContinuous";

interface CncMachineGridProps {
  machines: Machine[];
  workUid: string;
  loading: boolean;
  tempTooltipMap: Record<string, string>;
  toolTooltipMap: Record<string, string>;
  programSummary: { current?: any; list?: any[] } | null;
  machiningElapsedSecondsMap?: Record<string, number>;
  machiningRecordSummaryMap?: Record<
    string,
    {
      status?: string;
      startedAt?: string | Date;
      completedAt?: string | Date;
      durationSeconds?: number;
      elapsedSeconds?: number;
    } | null
  >;
  reservationJobsMap?: Record<string, CncJobItem[]>;
  worksheetQueueCountMap?: Record<string, number>;
  onSelectMachine: (uid: string) => void;
  onOpenMaterial?: (machine: Machine) => void;
  onTempClick: (machine: Machine) => void;
  onToolClick: (machine: Machine) => void;
  onOpenMachineInfo?: (uid: string) => void;
  onEditMachine: (machine: Machine) => void;
  onOpenProgramDetail: (prog: any, machineId?: string) => void;
  onSendControl: (uid: string, action: "reset" | "stop") => void;
  onOpenAddModal: () => void;
  onOpenJobConfig: (machine: Machine) => void;
  onUploadFiles?: (machine: Machine, files: FileList | File[]) => void;
  uploadProgress?: {
    machineId: string;
    fileName: string;
    percent: number;
  } | null;
  reservationSummaryMap?: Record<string, string>;
  reservationTotalQtyMap?: Record<string, number>;
  onCancelReservation?: (machine: Machine, jobId?: string) => void;
  onOpenReservationList?: (machine: Machine) => void;
  onTogglePause?: (machine: Machine, jobId: string) => void;
  onPlayNext?: (machine: Machine, jobId: string) => void;
  onPlayNowPlaying?: (machine: Machine, jobId: string) => void;
  onCancelNowPlaying?: (machine: Machine, jobId?: string) => void;
  onToggleAllowJobStart?: (machine: Machine, next: boolean) => void;
  onToggleDummyMachining?: (machine: Machine, next: boolean) => void;
  onPlayManualCard?: (machineId: string, itemId: string) => void;
  playingNextMap?: Record<string, boolean>;
  nowPlayingMap?: Record<string, boolean>;
  onReloadBridgeQueueForMachine?: (machine: Machine) => void;
}

export const CncMachineGrid: React.FC<CncMachineGridProps> = ({
  machines,
  workUid,
  loading,
  tempTooltipMap,
  toolTooltipMap,
  programSummary,
  machiningElapsedSecondsMap,
  machiningRecordSummaryMap,
  reservationJobsMap,
  worksheetQueueCountMap,
  onSelectMachine,
  onOpenMaterial,
  onTempClick,
  onToolClick,
  onOpenMachineInfo,
  onEditMachine,
  onOpenProgramDetail,
  onSendControl,
  onOpenAddModal,
  onOpenJobConfig,
  onUploadFiles,
  uploadProgress,
  reservationSummaryMap,
  reservationTotalQtyMap,
  onCancelReservation,
  onOpenReservationList,
  onTogglePause,
  onPlayNext,
  onPlayNowPlaying,
  onCancelNowPlaying,
  onToggleAllowJobStart,
  onToggleDummyMachining,
  onPlayManualCard,
  playingNextMap,
  nowPlayingMap,
  onReloadBridgeQueueForMachine,
}) => {
  return (
    <div className="mt-4 grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
      {machines.map((m) => {
        const isActive = workUid === m.uid;
        const currentProg: any = isActive ? programSummary?.current : null;
        const progList: any[] = Array.isArray(programSummary?.list)
          ? (programSummary?.list as any[])
          : [];
        const currentNo = currentProg?.programNo ?? currentProg?.no;

        const reservedJobs: CncJobItem[] = reservationJobsMap?.[m.uid] || [];
        const worksheetQueueCount = Math.max(
          0,
          Number(worksheetQueueCountMap?.[m.uid] ?? 0) || 0,
        );
        const originalTotalQty: number | undefined =
          reservationTotalQtyMap?.[m.uid];

        const allProgs: any[] =
          reservedJobs.length > 0
            ? reservedJobs.map((job) => {
                const programNo = job.programNo ?? null;
                return {
                  programNo,
                  no: programNo,
                  name: job.name,
                  jobId: job.id,
                  source: (job as any).source || "bridge",
                  requestId: (job as any).requestId,
                  s3Key: (job as any).s3Key,
                  s3Bucket: (job as any).s3Bucket,
                  bridgePath:
                    (job as any).bridgePath ||
                    (job as any).bridge_store_path ||
                    (job as any).path,
                  paused: job.paused ?? false,
                  qty: job.qty,
                };
              })
            : progList.filter((p: any) => {
                const no = p?.programNo ?? p?.no;
                return currentNo == null ? true : no !== currentNo;
              });

        const isPlayingNext = !!playingNextMap?.[m.uid];
        const isNowPlaying = !!nowPlayingMap?.[m.uid];
        // 첫 번째 예약 작업 → Now Playing, 나머지 → Next Up
        const displayCurrent =
          currentProg || (allProgs.length > 0 ? allProgs[0] : null);
        const displayNextProgs = currentProg
          ? allProgs
          : allProgs.length > 1
            ? allProgs.slice(1)
            : [];

        return (
          <MachineCard
            key={m.uid}
            machine={m}
            isActive={isActive}
            loading={loading}
            machiningElapsedSeconds={
              machiningElapsedSecondsMap?.[m.uid] ?? null
            }
            machiningRecordSummary={machiningRecordSummaryMap?.[m.uid] ?? null}
            worksheetQueueCount={worksheetQueueCount}
            tempTooltip={tempTooltipMap[m.uid] ?? ""}
            toolTooltip={toolTooltipMap[m.uid] ?? ""}
            currentProg={displayCurrent}
            nextProgs={displayNextProgs}
            isPlaying={isPlayingNext || isNowPlaying}
            reservedTotalQty={originalTotalQty}
            reservationSummary={reservationSummaryMap?.[m.uid]}
            uploadProgress={
              uploadProgress && uploadProgress.machineId === m.uid
                ? uploadProgress
                : null
            }
            onMaterialClick={(e) => {
              e.stopPropagation();
              if (!onOpenMaterial) return;
              onOpenMaterial(m);
            }}
            onInfoClick={(e) => {
              e.stopPropagation();
              if (!onOpenMachineInfo) return;
              onOpenMachineInfo(m.uid);
            }}
            onSelect={() => {
              onSelectMachine(m.uid);
            }}
            onTempClick={(e) => {
              e.stopPropagation();
              onTempClick(m);
            }}
            onToolClick={(e) => {
              e.stopPropagation();
              onToolClick(m);
            }}
            onEditClick={(e) => {
              e.stopPropagation();
              onEditMachine(m);
            }}
            onOpenCurrentProg={(e) => {
              e.stopPropagation();
              if (!currentProg) return;
              onOpenProgramDetail(currentProg, m.uid);
            }}
            onOpenNextProg={(prog, e) => {
              e.stopPropagation();
              if (!prog) return;
              onOpenProgramDetail(prog, m.uid);
            }}
            onResetClick={(e) => {
              e.stopPropagation();
              onSendControl(m.uid, "reset");
            }}
            onStopClick={(e) => {
              e.stopPropagation();
              onSendControl(m.uid, "stop");
            }}
            onOpenJobConfig={(e) => {
              e.stopPropagation();
              onOpenJobConfig(m);
            }}
            onReloadBridgeQueue={
              onReloadBridgeQueueForMachine
                ? () => onReloadBridgeQueueForMachine(m)
                : undefined
            }
            onUploadFiles={
              onUploadFiles
                ? (files) => {
                    onUploadFiles(m, files);
                  }
                : undefined
            }
            onCancelReservation={
              onCancelReservation
                ? (jobId, e) => {
                    e.stopPropagation();
                    onCancelReservation(m, jobId);
                  }
                : undefined
            }
            onTogglePause={
              onTogglePause
                ? (jobId, e) => {
                    e.stopPropagation();
                    if (!jobId) return;
                    onTogglePause(m, jobId);
                  }
                : undefined
            }
            onPlayNext={
              onPlayNext
                ? (jobId, e) => {
                    e.stopPropagation();
                    onPlayNext(m, jobId);
                  }
                : undefined
            }
            onPlayNowPlaying={
              onPlayNowPlaying
                ? (jobId, e) => {
                    e.stopPropagation();
                    if (jobId) onPlayNowPlaying(m, jobId);
                  }
                : undefined
            }
            onCancelNowPlaying={
              onCancelNowPlaying
                ? (jobId, e) => {
                    e.stopPropagation();
                    onCancelNowPlaying(m, jobId);
                  }
                : undefined
            }
            onOpenReservationList={
              onOpenReservationList
                ? (e) => {
                    e.stopPropagation();
                    onOpenReservationList(m);
                  }
                : undefined
            }
            onToggleAllowJobStart={
              onToggleAllowJobStart
                ? (next, e) => {
                    e.stopPropagation();
                    onToggleAllowJobStart(m, next);
                  }
                : undefined
            }
            onToggleDummyMachining={
              onToggleDummyMachining
                ? (next, e) => {
                    e.stopPropagation();
                    onToggleDummyMachining(m, next);
                  }
                : undefined
            }
            onPlayManualCard={
              onPlayManualCard
                ? (itemId) => {
                    onPlayManualCard(m.uid, itemId);
                  }
                : undefined
            }
          />
        );
      })}

      {/* + 새 장비 추가 카드 */}
      <button
        type="button"
        className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-white/70 p-6 text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/60 transition-colors shadow-sm"
        onClick={(e) => {
          e.stopPropagation();
          onOpenAddModal();
        }}
      >
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 text-blue-600 mb-3">
          {/* 아이콘은 상위에서 동일하게 Plus를 사용 중이므로, 여기서는 모양만 유지 */}
          <span className="text-3xl font-bold">+</span>
        </div>
      </button>
    </div>
  );
};
