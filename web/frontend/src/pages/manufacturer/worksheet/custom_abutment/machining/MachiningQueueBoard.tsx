import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ToastAction } from "@/components/ui/toast";
import { CncEventLogModal } from "@/features/cnc/components/CncEventLogModal";
import { CncProgramEditorPanel } from "@/pages/manufacturer/equipment/cnc/components/CncProgramEditorPanel";
import { CncPlaylistDrawer } from "@/pages/manufacturer/equipment/cnc/components/CncPlaylistDrawer";
import { CompletedMachiningRecordsModal } from "@/pages/manufacturer/equipment/cnc/components/CompletedMachiningRecordsModal";
import { MachineQueueCard } from "./components/MachineQueueCard";
import type { MachineStatus, QueueItem } from "./types";
import { useMachiningBoard } from "./hooks/useMachiningBoard";
import { CncMaterialModal } from "@/pages/manufacturer/equipment/cnc/components/CncMaterialModal";
import { MachiningRequestLabel } from "./components/MachiningRequestLabel";
import { buildLabelExtraProps } from "./utils/label";

export const MachiningQueueBoard = ({
  searchQuery,
}: {
  searchQuery?: string;
}) => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const board = useMachiningBoard({ token });
  const [activeMachineId, setActiveMachineId] = useState<string | null>(null);
  const [unassignedModalOpen, setUnassignedModalOpen] = useState(false);

  const {
    machines,
    filteredMachines,
    statusByUid,
    machineStatusMap,
    queueMap,
    setQueueMap,
    machiningElapsedSecondsMap,
    lastCompletedMap,
    nowPlayingHintMap,
    statusRefreshing,
    statusRefreshError,
    statusRefreshedAt,
    statusRefreshErroredAt,
    reassignProductionQueues,
    handleBoardClickCapture,
    isMockFromBackend,
    globalAutoEnabled,
    setGlobalAutoEnabled,
    updateMachineAuto,
    updateMachineRequestAssign,
    openReservationForMachine,
    openProgramDetailForMachining,
    isReadOnly,
    workUid,
    programEditorOpen,
    programEditorTarget,
    closeProgramEditor,
    loadProgramCodeForMachining,
    saveProgramCode,
    eventLogRequestId,
    setEventLogRequestId,
    playlistOpen,
    playlistTitle,
    playlistJobs,
    playlistMachineId,
    setPlaylistOpen,
    setPlaylistJobs,
    buildPlaylistJobsFromQueue,
    loadProductionQueueForMachine,
    completedModalOpen,
    setCompletedModalOpen,
    completedModalMachineId,
    setCompletedModalMachineId,
    completedModalTitle,
    setCompletedModalTitle,
    materialModalOpen,
    setMaterialModalOpen,
    materialModalTarget,
    setMaterialModalTarget,
    handleReplaceMaterial,
    handleAddMaterial,
    rollbackRequestInQueue,
    approveMachiningFromRollback,
  } = board;

  const requestToggleMachineAuto = useCallback(
    (uid: string, next: boolean) => {
      if (!next) {
        void updateMachineAuto(uid, false);
        return;
      }

      const t = (Array.isArray(machines) ? machines : []).find(
        (m: any) => m.uid === uid,
      );
      const name = t?.name || uid;

      toast({
        title: "자동 가공을 켤까요?",
        description:
          "ON 하면 대기 중인 의뢰의 자동 가공이 즉시 시작될 수 있습니다. 계속 진행하시겠습니까?",
        variant: "destructive",
        duration: 8000,
        action: (
          <ToastAction
            altText="자동 가공 ON"
            onClick={() => {
              void updateMachineAuto(uid, true);
            }}
          >
            {name} ON
          </ToastAction>
        ),
      });
    },
    [machines, toast, updateMachineAuto],
  );

  const displayMachines = useMemo(
    () =>
      (Array.isArray(filteredMachines) ? filteredMachines : []).filter(
        (m: any) => String(m?.uid || "").trim() !== "unassigned",
      ),
    [filteredMachines],
  );

  const unassignedQueue = useMemo(
    () =>
      Array.isArray(queueMap?.unassigned)
        ? (queueMap.unassigned as QueueItem[])
        : [],
    [queueMap],
  );

  const unassignedHead = unassignedQueue[0] || null;
  const unassignedRest = unassignedQueue.slice(1);
  const hasUnassigned = unassignedQueue.length > 0;

  const getLotShortCode = useCallback((slot?: QueueItem | null) => {
    return String(slot?.lotNumber?.value || "")
      .trim()
      .replace(/^CA(P)?/i, "")
      .slice(-3)
      .toUpperCase();
  }, []);

  return (
    <div
      className="space-y-4"
      onMouseDownCapture={handleBoardClickCapture}
      onTouchStartCapture={handleBoardClickCapture}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {isMockFromBackend != null ? (
            <Badge
              variant="outline"
              className={`shrink-0 text-[11px] font-extrabold px-2.5 py-1 border ${
                isMockFromBackend === true
                  ? "bg-violet-50 text-violet-700 border-violet-200"
                  : "bg-slate-50 text-slate-700 border-slate-200"
              }`}
              title={
                isMockFromBackend === true ? "더미(모의) 가공" : "실제 가공"
              }
            >
              {isMockFromBackend === true ? "MOCK" : "REAL"}
            </Badge>
          ) : null}

          <div className="rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-600 border border-slate-200 truncate">
            {statusRefreshing
              ? "장비 상태 조회중…"
              : statusRefreshError
                ? `장비 상태 조회 실패${
                    statusRefreshErroredAt ? ` ${statusRefreshErroredAt}` : ""
                  } (${statusRefreshError})`
                : statusRefreshedAt
                  ? `장비 상태 갱신 ${statusRefreshedAt}`
                  : ""}
          </div>
        </div>
        <div
          className="flex flex-wrap items-center justify-end gap-3"
          title="OFF로 전환하면 현재 가공 중인 건은 그대로 진행되며, 완료 후 다음 자동 시작은 실행되지 않습니다."
        >
          {hasUnassigned ? (
            <button
              type="button"
              className="min-w-0 max-w-[560px] rounded-xl border  px-3 py-1.5 text-left shadow-sm border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              onClick={() => {
                setUnassignedModalOpen(true);
              }}
              title={`미배정 ${unassignedQueue.length}건`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Badge
                  variant="outline"
                  className="shrink-0 text-[11px] border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                >
                  미배정 {unassignedQueue.length}건
                </Badge>
                <div className="min-w-0 flex-1 text-[12px] font-extrabold text-slate-800 truncate">
                  {unassignedHead ? (
                    <MachiningRequestLabel
                      clinicName={unassignedHead.clinicName}
                      patientName={unassignedHead.patientName}
                      tooth={(unassignedHead as any)?.tooth}
                      requestId={unassignedHead.requestId}
                      lotShortCode={getLotShortCode(unassignedHead)}
                      caseInfos={(unassignedHead as any)?.caseInfos}
                      className="text-[12px]"
                      {...buildLabelExtraProps(unassignedHead)}
                    />
                  ) : (
                    "미배정"
                  )}
                </div>
                {unassignedRest.length > 0 ? (
                  <span className="shrink-0 text-[11px] font-bold text-slate-500">
                    외 {unassignedRest.length}건
                  </span>
                ) : null}
              </div>
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-[12px] font-extrabold text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={() => {
              void reassignProductionQueues();
            }}
          >
            재배정
          </button>
          <div className="flex flex-col items-end leading-tight">
            <div className="text-[12px] font-extrabold text-slate-700">
              전체 자동 가공 시작
            </div>
            <div className="text-[10px] font-semibold text-slate-500">
              현재 가공은 그대로 유지
            </div>
          </div>
          <button
            type="button"
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              globalAutoEnabled ? "bg-emerald-500" : "bg-gray-300"
            }`}
            onClick={() => {
              void setGlobalAutoEnabled(!globalAutoEnabled);
            }}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                globalAutoEnabled ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 p-4 pb-8">
        {displayMachines.map((m) => {
          const statusFromStore = statusByUid?.[m.uid];
          const local = machineStatusMap?.[m.uid] ?? null;
          const mergedStatus: MachineStatus | null = local
            ? {
                ...local,
                status: String(
                  statusFromStore != null ? statusFromStore : local.status,
                ).trim(),
              }
            : statusFromStore != null
              ? {
                  uid: m.uid,
                  status: String(statusFromStore).trim(),
                }
              : null;

          const isActive = activeMachineId === m.uid;
          const machineQueue = Array.isArray(queueMap?.[m.uid])
            ? queueMap[m.uid]
            : [];
          const nowPlayingHint = nowPlayingHintMap?.[m.uid] || null;
          const machiningActive =
            nowPlayingHint != null ||
            machineQueue.some((item) => {
              const recordStatus = String(item?.machiningRecord?.status || "")
                .trim()
                .toUpperCase();
              if (recordStatus === "RUNNING" || recordStatus === "PROCESSING") {
                return true;
              }
              const startedAt = item?.machiningRecord?.startedAt
                ? new Date(item.machiningRecord.startedAt).getTime()
                : 0;
              const completedAt = item?.machiningRecord?.completedAt
                ? new Date(item.machiningRecord.completedAt).getTime()
                : 0;
              return startedAt > 0 && completedAt <= 0;
            });

          return (
            <MachineQueueCard
              key={m.uid}
              machineId={m.uid}
              machineName={m.name}
              machine={m}
              queue={machineQueue}
              machiningElapsedSeconds={
                typeof machiningElapsedSecondsMap?.[m.uid] === "number"
                  ? machiningElapsedSecondsMap[m.uid]
                  : null
              }
              lastCompleted={lastCompletedMap?.[m.uid] || null}
              nowPlayingHint={nowPlayingHint}
              onOpenRequestLog={(requestId) => setEventLogRequestId(requestId)}
              autoEnabled={m.allowAutoMachining === true}
              machiningActive={machiningActive}
              onToggleAuto={(next) => {
                requestToggleMachineAuto(m.uid, next);
              }}
              onToggleRequestAssign={(next) => {
                void updateMachineRequestAssign(m.uid, next);
              }}
              machineStatus={mergedStatus}
              statusRefreshing={statusRefreshing}
              isActive={isActive}
              onSelect={() => {
                setActiveMachineId(m.uid);
              }}
              onOpenReservation={() => openReservationForMachine(m.uid)}
              onOpenProgramCode={(prog, machineId) => {
                void openProgramDetailForMachining(prog, machineId);
              }}
              onRollbackNowPlaying={(requestId, mid) => {
                void rollbackRequestInQueue(mid, requestId);
              }}
              onRollbackNextUp={(requestId, mid) => {
                void rollbackRequestInQueue(mid, requestId);
              }}
              onRollbackCompleted={(requestId, mid) => {
                void rollbackRequestInQueue(mid, requestId);
              }}
              onApproveFromRollback={(requestMongoId) => {
                void approveMachiningFromRollback(requestMongoId);
              }}
              onOpenCompleted={(mid, name) => {
                setCompletedModalMachineId(String(mid || "").trim());
                setCompletedModalTitle(
                  `${String(name || mid || "").trim()} 가공 완료`,
                );
                setCompletedModalOpen(true);
              }}
              onOpenMaterial={() => {
                setMaterialModalTarget(m);
                setMaterialModalOpen(true);
              }}
            />
          );
        })}
      </div>

      <CompletedMachiningRecordsModal
        open={completedModalOpen}
        onOpenChange={setCompletedModalOpen}
        machineId={completedModalMachineId}
        title={completedModalTitle}
        pageSize={5}
        onRollbackRequest={(requestId, machineId) => {
          void rollbackRequestInQueue(machineId, requestId);
        }}
      />

      {eventLogRequestId ? (
        <CncEventLogModal
          open={!!eventLogRequestId}
          mode={{ kind: "request", requestId: eventLogRequestId }}
          onOpenChange={(next) => {
            if (!next) setEventLogRequestId(null);
          }}
        />
      ) : null}

      <CncPlaylistDrawer
        open={playlistOpen}
        title={playlistTitle}
        jobs={playlistJobs}
        readOnly={false}
        deleteVariant="worksheet"
        onApproveFromRollback={(requestMongoId) => {
          void approveMachiningFromRollback(requestMongoId);
        }}
        onClose={() => {
          setPlaylistOpen(false);
        }}
        onOpenCode={(jobId) => {
          const mid = String(playlistMachineId || "").trim();
          if (!mid) return;
          const job = (Array.isArray(playlistJobs) ? playlistJobs : []).find(
            (j) => j.id === jobId,
          );
          if (!job) return;
          // workUid는 openProgramDetailForMachining 내에서 설정됨
          const prog: any = {
            programNo: job.programNo ?? null,
            no: job.programNo ?? null,
            name: job.name,
            source: job.source || "db",
            s3Key: job.s3Key || "",
            s3Bucket: job.s3Bucket || "",
            bridgePath: job.bridgePath || "",
            requestId: job.requestId || "",
            headType: 1,
          };
          void openProgramDetailForMachining(prog, mid);
        }}
        onDelete={(jobId) => {
          void (async () => {
            try {
              if (!token) return;
              const mid = String(playlistMachineId || "").trim();
              if (!mid) return;
              const res = await fetch(
                `/api/cnc-machines/${encodeURIComponent(mid)}/production-queue/batch`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({ deleteRequestIds: [jobId] }),
                },
              );
              const body: any = await res.json().catch(() => ({}));
              if (!res.ok || body?.success === false) {
                throw new Error(
                  body?.message || body?.error || "CAM으로 되돌리기 실패",
                );
              }

              const qRes = await fetch("/api/cnc-machines/queues", {
                headers: { Authorization: `Bearer ${token}` },
              });
              const qBody: any = await qRes.json().catch(() => ({}));
              if (qRes.ok && qBody?.success !== false) {
                const map =
                  qBody?.data && typeof qBody.data === "object"
                    ? qBody.data
                    : {};
                setQueueMap(map);
                const rawNext = Array.isArray(map?.[mid]) ? map[mid] : [];
                setPlaylistJobs(buildPlaylistJobsFromQueue(rawNext));
                await loadProductionQueueForMachine(mid, rawNext);
                return;
              }
              await loadProductionQueueForMachine(mid);
            } catch (e: any) {
              toast({
                title: "CAM으로 되돌리기 실패",
                description: e?.message || "잠시 후 다시 시도해주세요.",
                variant: "destructive",
              });
            }
          })();
        }}
        onReorder={(nextOrder) => {
          void (async () => {
            try {
              if (!token) return;
              const mid = String(playlistMachineId || "").trim();
              if (!mid) return;
              const res = await fetch(
                `/api/cnc-machines/${encodeURIComponent(mid)}/production-queue/batch`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({ order: nextOrder }),
                },
              );
              const body: any = await res.json().catch(() => ({}));
              if (!res.ok || body?.success === false) {
                throw new Error(
                  body?.message || body?.error || "순서 변경 실패",
                );
              }

              const qRes = await fetch("/api/cnc-machines/queues", {
                headers: { Authorization: `Bearer ${token}` },
              });
              const qBody: any = await qRes.json().catch(() => ({}));
              if (qRes.ok && qBody?.success !== false) {
                const map =
                  qBody?.data && typeof qBody.data === "object"
                    ? qBody.data
                    : {};
                setQueueMap(map);
                const rawNext = Array.isArray(map?.[mid]) ? map[mid] : [];
                setPlaylistJobs(buildPlaylistJobsFromQueue(rawNext));
                await loadProductionQueueForMachine(mid, rawNext);
                return;
              }
              await loadProductionQueueForMachine(mid);
            } catch (e: any) {
              toast({
                title: "순서 변경 실패",
                description: e?.message || "잠시 후 다시 시도해주세요.",
                variant: "destructive",
              });
            }
          })();
        }}
        onChangeQty={(jobId, qty) => {
          void (async () => {
            try {
              if (!token) return;
              const mid = String(playlistMachineId || "").trim();
              if (!mid) return;
              const res = await fetch(
                `/api/cnc-machines/${encodeURIComponent(mid)}/production-queue/batch`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    qtyUpdates: [{ requestId: jobId, qty }],
                  }),
                },
              );
              const body: any = await res.json().catch(() => ({}));
              if (!res.ok || body?.success === false) {
                throw new Error(
                  body?.message || body?.error || "수량 변경 실패",
                );
              }

              const qRes = await fetch("/api/cnc-machines/queues", {
                headers: { Authorization: `Bearer ${token}` },
              });
              const qBody: any = await qRes.json().catch(() => ({}));
              if (qRes.ok && qBody?.success !== false) {
                const map =
                  qBody?.data && typeof qBody.data === "object"
                    ? qBody.data
                    : {};
                setQueueMap(map);
                const rawNext = Array.isArray(map?.[mid]) ? map[mid] : [];
                setPlaylistJobs(buildPlaylistJobsFromQueue(rawNext));
                await loadProductionQueueForMachine(mid, rawNext);
                return;
              }
              await loadProductionQueueForMachine(mid);
            } catch (e: any) {
              toast({
                title: "수량 변경 실패",
                description: e?.message || "잠시 후 다시 시도해주세요.",
                variant: "destructive",
              });
            }
          })();
        }}
      />

      {programEditorOpen && programEditorTarget ? (
        <CncProgramEditorPanel
          open={programEditorOpen}
          onClose={closeProgramEditor}
          workUid={workUid}
          selectedProgram={programEditorTarget}
          onLoadProgram={loadProgramCodeForMachining}
          onSaveProgram={saveProgramCode}
          readOnly={isReadOnly}
        />
      ) : null}

      {materialModalTarget && (
        <CncMaterialModal
          open={materialModalOpen}
          onClose={() => {
            setMaterialModalOpen(false);
            setMaterialModalTarget(null);
          }}
          machineId={materialModalTarget.uid}
          machineName={materialModalTarget.name}
          currentMaterial={materialModalTarget.currentMaterial || null}
          maxModelDiameterGroups={
            materialModalTarget.maxModelDiameterGroups || ["12"]
          }
          onReplace={handleReplaceMaterial}
          onAdd={handleAddMaterial}
        />
      )}

      <Dialog open={unassignedModalOpen} onOpenChange={setUnassignedModalOpen}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[80vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <span>미배정</span>
              <Badge
                variant="outline"
                className="border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              >
                {unassignedQueue.length}건
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              세척.패킹 롤백 시 온라인이면서 조건이 맞는 장비가 없어서 배정되지
              않은 의뢰건입니다.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3">
            {unassignedQueue.map((item, index) => (
              <div
                key={`${String(item.requestMongoId || item.requestId || index)}`}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-[11px] font-semibold text-slate-500">
                        #{index + 1}
                      </div>
                      {getLotShortCode(item) ? (
                        <Badge className="bg-slate-900 text-white border border-slate-900 text-[10px]">
                          {getLotShortCode(item)}
                        </Badge>
                      ) : null}
                      <div className="ml-auto flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 ${
                            String(item.requestId || "").trim()
                              ? ""
                              : "opacity-30 cursor-not-allowed"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            const rid = String(item.requestId || "").trim();
                            if (!rid) return;
                            void rollbackRequestInQueue(
                              "unassigned",
                              rid,
                              item.requestMongoId,
                            );
                          }}
                          disabled={!String(item.requestId || "").trim()}
                          title="CAM으로 되돌리기"
                        >
                          <ArrowLeft className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 ${
                            Number((item as any)?.rollbackCount || 0) > 0 &&
                            String(item.requestMongoId || "").trim()
                              ? ""
                              : "opacity-30 cursor-not-allowed"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            const rollbackCount = Number(
                              (item as any)?.rollbackCount || 0,
                            );
                            const id = String(item.requestMongoId || "").trim();
                            if (rollbackCount <= 0) return;
                            if (!id) return;
                            void approveMachiningFromRollback(id);
                          }}
                          disabled={
                            !(
                              Number((item as any)?.rollbackCount || 0) > 0 &&
                              String(item.requestMongoId || "").trim()
                            )
                          }
                          title="재가공 없이 승인"
                        >
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-1 text-[14px] font-extrabold text-slate-900 leading-tight">
                      <MachiningRequestLabel
                        clinicName={item.clinicName}
                        patientName={item.patientName}
                        tooth={(item as any)?.tooth}
                        requestId={item.requestId}
                        lotShortCode={getLotShortCode(item)}
                        caseInfos={(item as any)?.caseInfos}
                        className="text-[14px] leading-tight"
                        {...buildLabelExtraProps(item)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MachiningQueueBoard;
