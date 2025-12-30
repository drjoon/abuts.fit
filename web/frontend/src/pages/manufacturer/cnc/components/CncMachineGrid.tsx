import React from "react";
import { Machine } from "@/pages/manufacturer/cnc/types";
import {
  MachineCard,
  HealthLevel,
} from "@/pages/manufacturer/cnc/components/MachineCard";
import type { CncJobItem } from "@/pages/manufacturer/cnc/components/CncReservationModal";

interface CncMachineGridProps {
  machines: Machine[];
  workUid: string;
  loading: boolean;
  tempHealthMap: Record<string, HealthLevel>;
  toolHealthMap: Record<string, HealthLevel>;
  tempTooltipMap: Record<string, string>;
  toolTooltipMap: Record<string, string>;
  programSummary: { current?: any; list?: any[] } | null;
  reservationJobsMap?: Record<string, CncJobItem[]>;
  onSelectMachine: (uid: string) => void;
  onTempClick: (machine: Machine) => void;
  onToolClick: (machine: Machine) => void;
  onEditMachine: (machine: Machine) => void;
  onOpenProgramDetail: (prog: any) => void;
  onSendControl: (uid: string, action: "reset") => void;
  onOpenAddModal: () => void;
  onOpenJobConfig: (machine: Machine) => void;
  reservationSummaryMap?: Record<string, string>;
  reservationTotalQtyMap?: Record<string, number>;
  onCancelReservation?: (machine: Machine, jobId?: string) => void;
  onOpenReservationList?: (machine: Machine) => void;
  onTogglePause?: (machine: Machine, jobId: string) => void;
}

export const CncMachineGrid: React.FC<CncMachineGridProps> = ({
  machines,
  workUid,
  loading,
  tempHealthMap,
  toolHealthMap,
  tempTooltipMap,
  toolTooltipMap,
  programSummary,
  reservationJobsMap,
  onSelectMachine,
  onTempClick,
  onToolClick,
  onEditMachine,
  onOpenProgramDetail,
  onSendControl,
  onOpenAddModal,
  onOpenJobConfig,
  reservationSummaryMap,
  reservationTotalQtyMap,
  onCancelReservation,
  onOpenReservationList,
  onTogglePause,
}) => {
  return (
    <div className="mt-4 grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
      {machines.map((m) => {
        const isActive = workUid === m.uid;
        const currentProg: any = programSummary?.current;
        const progList: any[] = Array.isArray(programSummary?.list)
          ? (programSummary?.list as any[])
          : [];
        const currentNo = currentProg?.programNo ?? currentProg?.no;

        const reservedJobs: CncJobItem[] = reservationJobsMap?.[m.uid] || [];
        const originalTotalQty: number | undefined =
          reservationTotalQtyMap?.[m.uid];

        const nextProgs: any[] =
          reservedJobs.length > 0
            ? reservedJobs.map((job) => {
                const programNo = job.programNo ?? null;
                return {
                  programNo,
                  no: programNo,
                  name: job.name,
                  jobId: job.id,
                  paused: job.paused ?? false,
                  qty: job.qty,
                };
              })
            : progList.filter((p: any) => {
                const no = p?.programNo ?? p?.no;
                return currentNo == null ? true : no !== currentNo;
              });

        return (
          <MachineCard
            key={m.uid}
            machine={m}
            isActive={isActive}
            loading={loading}
            tempHealth={tempHealthMap[m.uid] ?? "unknown"}
            toolHealth={toolHealthMap[m.uid] ?? "unknown"}
            tempTooltip={tempTooltipMap[m.uid] ?? ""}
            toolTooltip={toolTooltipMap[m.uid] ?? ""}
            currentProg={currentProg}
            nextProgs={nextProgs}
            reservedTotalQty={originalTotalQty}
            reservationSummary={reservationSummaryMap?.[m.uid]}
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
              if (!currentProg || !isActive) return;
              const statusUpper = (m.status || "").toUpperCase();
              const isRunning = ["RUN", "RUNNING", "ONLINE", "OK"].some((k) =>
                statusUpper.includes(k)
              );

              // '생산중' 버튼은 비생산중 상태에서 현재 프로그램을 열어 편집할 때만 사용한다.
              if (isRunning) return;
              onOpenProgramDetail(currentProg);
            }}
            onOpenNextProg={(prog, e) => {
              e.stopPropagation();
              if (!prog || !isActive) return;
              onOpenProgramDetail(prog);
            }}
            onResetClick={(e) => {
              e.stopPropagation();
              onSendControl(m.uid, "reset");
            }}
            onOpenJobConfig={(e) => {
              e.stopPropagation();
              onOpenJobConfig(m);
            }}
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
            onOpenReservationList={
              onOpenReservationList
                ? (e) => {
                    e.stopPropagation();
                    onOpenReservationList(m);
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
