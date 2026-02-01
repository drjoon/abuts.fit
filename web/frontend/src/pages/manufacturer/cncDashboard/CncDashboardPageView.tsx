import { Plus } from "lucide-react";

import type { Machine } from "../cnc/types";
import type { HealthLevel } from "../cnc/components/MachineCard";
import type { CncJobItem } from "../cnc/components/CncReservationModal";
import {
  CncPlaylistDrawer,
  type PlaylistJobItem,
} from "../cnc/components/CncPlaylistDrawer";
import { CncMachineGrid } from "../cnc/components/CncMachineGrid";
import { CncMachineManagerModal } from "../cnc/components/CncMachineManagerModal";
import { CncProgramEditorPanel } from "../cnc/components/CncProgramEditorPanel";
import { CncToolStatusModal } from "../cnc/components/CncToolStatusModal";
import { CncTempDetailModal } from "../cnc/components/CncTempDetailModal";
import { CncMachineInfoModal } from "../cnc/components/CncMachineInfoModal";
import { CncMaterialChangeModal } from "../cnc/components/CncMaterialChangeModal";
import { CncMaterialModal } from "../cnc/components/CncMaterialModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CncEventLogModal } from "@/components/CncEventLogModal";

export function CncDashboardPageView(props: any) {
  const {
    machines,
    mergedMachines,
    workUid,
    loading,
    globalDummyEnabled,
    globalRemoteEnabled,
    setGlobalDummyEnabled,
    setGlobalRemoteEnabled,
    handleBackgroundRefresh,
    tempTooltipMap,
    toolTooltipMap,
    toolHealthMap,
    programSummary,
    reservationJobsMap,
    worksheetQueueCountMap,
    reservationSummaryMap,
    reservationTotalQtyMap,
    uploadProgress,
    updateMachineFlags,
    updateMachineDummyEnabled,
    uploadManualCardFiles,
    refreshDbQueuesForAllMachines,
    setWorkUid,
    refreshStatusFor,
    fetchProgramList,
    openTempDetail,
    callRaw,
    openToolDetail,
    updateToolTooltip,
    updateToolHealth,
    handleEditMachine,
    openMachineInfo,
    openProgramDetail,
    sendControlCommand,
    setResetTarget,
    setResetConfirmOpen,
    setPlaylistTarget,
    loadQueueForMachine,
    setPlaylistOpen,
    queueBatchRef,
    scheduleQueueBatchCommit,
    onTogglePause,
    handleManualCardPlay,
    setReservationJobsMap,
    setReservationSummaryMap,
    setReservationTotalQtyMap,
    ensureCncWriteAllowed,
    toast,
    setError,
    addModalOpen,
    addModalMode,
    form,
    handleChange,
    setAddModalOpen,
    setAddModalMode,
    handleAddMachineFromModal,
    deleteConfirmOpen,
    deleteTarget,
    handleDeleteConfirm,
    setDeleteConfirmOpen,
    setDeleteTarget,
    programEditorOpen,
    programEditorTarget,
    closeProgramEditor,
    loadProgramCode,
    saveProgramCode,
    isReadOnly,
    resetConfirmOpen,
    resetTarget,
    playlistOpen,
    playlistTarget,
    playlistJobs,
    playlistReadOnly,
    setPlaylistReadOnly,
    loadBridgeQueueForMachine,
    PinModal,
    toolLifeSaveConfirmOpen,
    handleToolLifeSaveConfirm,
    setToolLifeSaveConfirmOpen,
    toolLifeDirty,
    setToolLifeDirty,
    setModalOpen,
    tempModalOpen,
    tempModalBody,
    setTempModalOpen,
    machineInfoOpen,
    machineInfoLoading,
    machineInfoError,
    machineInfoClearing,
    machineInfoProgram,
    machineInfoAlarms,
    clearMachineAlarms,
    setMachineInfoOpen,
    modalOpen,
    modalTitle,
    modalBody,
    openToolOffsetEditor,
    materialChangeModalOpen,
    setMaterialChangeModalOpen,
    setMaterialChangeTarget,
    materialChangeTarget,
    materialChangeScheduled,
    handleScheduleMaterialChange,
    handleCancelMaterialChange,
    materialModalOpen,
    setMaterialModalOpen,
    setMaterialModalTarget,
    materialModalTarget,
    handleReplaceMaterial,
    handleAddMaterial,
    eventLogMachineId,
    setEventLogMachineId,
  } = props;

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-gray-50 to-blue-100 text-gray-800 p-4 sm:p-6 lg:p-8 flex items-stretch">
      <main
        className="flex-1 min-h-full bg-white/80 backdrop-blur-xl p-6 sm:p-8 rounded-2xl shadow-lg cursor-pointer transition-shadow hover:shadow-xl"
        onClick={(e) => {
          if (e.target !== e.currentTarget) return;
          handleBackgroundRefresh();
        }}
      >
        <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
          <div className="app-surface app-surface--panel flex items-center gap-3 px-4 py-3">
            <div className="text-[12px] font-extrabold text-slate-700">
              전체 더미 가공 허용
            </div>
            <button
              type="button"
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                globalDummyEnabled ? "bg-blue-500" : "bg-gray-300"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                void setGlobalDummyEnabled(!globalDummyEnabled);
              }}
              disabled={loading}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  globalDummyEnabled ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="app-surface app-surface--panel flex items-center gap-3 px-4 py-3">
            <div className="text-[12px] font-extrabold text-slate-700">
              전체 원격 가공 허용
            </div>
            <button
              type="button"
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                globalRemoteEnabled ? "bg-blue-500" : "bg-gray-300"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                void setGlobalRemoteEnabled(!globalRemoteEnabled);
              }}
              disabled={loading}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  globalRemoteEnabled ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row">
          <div className="flex-1 min-w-0">
            {machines.length === 0 ? (
              <div className="mt-2 grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
                <button
                  type="button"
                  className="app-surface app-surface--panel flex flex-col items-center justify-center border-2 border-dashed border-gray-300 p-6 text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/60 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAddModalMode("create");
                    setAddModalOpen(true);
                  }}
                >
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 text-blue-600 mb-3">
                    <Plus className="w-6 h-6" />
                  </div>
                </button>
              </div>
            ) : (
              <>
                <CncMachineGrid
                  machines={mergedMachines}
                  workUid={workUid}
                  loading={loading}
                  tempTooltipMap={tempTooltipMap}
                  toolTooltipMap={toolTooltipMap}
                  programSummary={programSummary}
                  reservationJobsMap={reservationJobsMap}
                  worksheetQueueCountMap={worksheetQueueCountMap}
                  reservationSummaryMap={reservationSummaryMap}
                  reservationTotalQtyMap={reservationTotalQtyMap}
                  uploadProgress={uploadProgress}
                  onToggleAllowJobStart={(machine, next) => {
                    updateMachineFlags(machine, { allowJobStart: next });
                  }}
                  onToggleDummyMachining={(machine, next) => {
                    updateMachineDummyEnabled(machine.uid, next);
                  }}
                  onPlayManualCard={handleManualCardPlay}
                  onUploadFiles={(machine, files) => {
                    void (async () => {
                      try {
                        await uploadManualCardFiles(machine.uid, files);
                        // 업로드 후 수동 카드 큐 다시 로드 (완료 대기)
                        if (refreshDbQueuesForAllMachines) {
                          await refreshDbQueuesForAllMachines();
                        }
                        toast({
                          title: "업로드 완료",
                          description: "파일이 업로드되었습니다.",
                        });
                      } catch (e: any) {
                        const msg =
                          e?.message || "업로드 중 오류가 발생했습니다.";
                        setError(msg);
                        toast({
                          title: "업로드 실패",
                          description: msg,
                          variant: "destructive",
                        });
                      }
                    })();
                  }}
                  onOpenAddModal={() => {
                    setAddModalMode("create");
                    setAddModalOpen(true);
                  }}
                  onOpenJobConfig={(machine) => {
                    setPlaylistTarget(machine);
                    void loadQueueForMachine(machine).finally(() => {
                      setPlaylistOpen(true);
                    });
                  }}
                  onOpenMaterial={(machine) => {
                    setMaterialModalTarget(machine);
                    setMaterialModalOpen(true);
                  }}
                  onSelectMachine={(uid) => {
                    const selected = mergedMachines.find((m) => m.uid === uid);
                    const isConfigured = !!(
                      selected?.ip && Number(selected?.port || 0) > 0
                    );
                    if (workUid !== uid) {
                      // workUid 변경 시 작업 보드(useCncWorkBoard)가 자동으로 상태/프로그램 정보를 로드한다.
                      setWorkUid(uid);
                      return;
                    }

                    // 같은 장비 카드를 다시 클릭한 경우(workUid 변화 없음)에도
                    // 상태 갱신은 1회 수행되어야 한다.
                    if (isConfigured) {
                      void refreshStatusFor(uid);
                    }
                  }}
                  onTempClick={(machine) => {
                    void openTempDetail(machine.uid);
                  }}
                  onToolClick={async (machine) => {
                    try {
                      const res = await callRaw(machine.uid, "GetToolLifeInfo");
                      const data: any = res?.data ?? res;
                      const toolLife =
                        data?.machineToolLife?.toolLife ??
                        data?.machineToolLife?.toolLifeInfo ??
                        [];

                      let level: HealthLevel = "unknown";
                      if (Array.isArray(toolLife) && toolLife.length) {
                        let anyAlarm = false;
                        let anyWarn = false;
                        for (const t of toolLife) {
                          const use = t.useCount ?? 0;
                          const cfg = t.configCount ?? 0;
                          if (cfg <= 0) continue;
                          const ratio = use / cfg;
                          if (ratio >= 1) {
                            anyAlarm = true;
                          } else if (ratio >= 0.95) {
                            anyWarn = true;
                          }
                        }

                        if (anyAlarm) level = "alarm";
                        else if (anyWarn) level = "warn";
                        else level = "ok";
                      }

                      updateToolTooltip(
                        machine.uid,
                        Array.isArray(toolLife) && toolLife.length
                          ? `공구 ${toolLife.length}개 상태 조회 완료`
                          : "공구 정보가 없습니다.",
                      );

                      openToolDetail(toolLife, level);
                    } catch (e: any) {
                      const msg = e?.message ?? "공구 상세 조회 중 오류";
                      setError(msg);
                      updateToolHealth(machine.uid, "alarm");
                      updateToolTooltip(machine.uid, msg);
                    }
                  }}
                  onEditMachine={(machine) => {
                    handleEditMachine(machine);
                  }}
                  onOpenMachineInfo={(uid) => {
                    void openMachineInfo(uid);
                  }}
                  onOpenProgramDetail={(prog, machineId) => {
                    void openProgramDetail(prog, machineId);
                  }}
                  onSendControl={(uid, action) => {
                    if (action === "reset") {
                      const target =
                        machines.find((m) => m.uid === uid) || null;
                      if (!target) return;
                      const status = (target.status || "").toUpperCase();
                      const isRunning = ["RUN", "RUNNING", "ONLINE", "OK"].some(
                        (k) => status.includes(k),
                      );

                      if (!isRunning) {
                        toast({
                          title: "생산 중단",
                          description: "현재 정지 상태입니다.",
                        });
                        return;
                      }

                      setResetTarget(target);
                      setResetConfirmOpen(true);
                    } else if (action === "stop") {
                      void sendControlCommand(uid, "stop");
                    }
                  }}
                  onOpenReservationList={(machine) => {
                    setPlaylistTarget(machine);
                    void loadQueueForMachine(machine).finally(() => {
                      setPlaylistOpen(true);
                    });
                  }}
                  onCancelReservation={(machine, jobId) => {
                    const uid = machine.uid;
                    if (jobId) {
                      queueBatchRef.current.machineId = uid;
                      queueBatchRef.current.deleteJobIds.add(jobId);
                      scheduleQueueBatchCommit(uid);
                    }

                    setReservationJobsMap((prev: any) => {
                      const jobs = prev[uid] || [];
                      const filtered = jobId
                        ? jobs.filter((j: any) => j.id !== jobId)
                        : jobs.slice(1);

                      setReservationSummaryMap((prevSummary: any) => {
                        const next = { ...prevSummary };
                        if (filtered.length === 0) {
                          delete next[uid];
                        } else {
                          const first = filtered[0];
                          const baseName =
                            first?.name ||
                            (first?.programNo != null
                              ? `#${first.programNo}`
                              : "-");
                          next[uid] = `[생산예약 : ${baseName}]`;
                        }
                        return next;
                      });

                      setReservationTotalQtyMap((prevTotal: any) => {
                        const total = filtered.reduce(
                          (sum: number, j: any) => sum + (j.qty || 1),
                          0,
                        );
                        const next = { ...prevTotal };
                        if (total <= 0) {
                          delete next[uid];
                        } else {
                          next[uid] = total;
                        }
                        return next;
                      });

                      const nextMap = { ...prev };
                      if (filtered.length === 0) {
                        delete nextMap[uid];
                      } else {
                        nextMap[uid] = filtered;
                      }
                      return nextMap;
                    });
                  }}
                  onTogglePause={async (machine, jobId) => {
                    await onTogglePause(machine, jobId);
                  }}
                />

                {eventLogMachineId ? (
                  <CncEventLogModal
                    open={!!eventLogMachineId}
                    onOpenChange={(v) => {
                      if (!v) setEventLogMachineId(null);
                    }}
                    mode={{ kind: "machine", machineId: eventLogMachineId }}
                  />
                ) : null}
              </>
            )}
          </div>
        </div>

        <CncMachineManagerModal
          open={addModalOpen}
          mode={addModalMode}
          form={form}
          loading={loading}
          onChange={handleChange}
          onRequestClose={() => setAddModalOpen(false)}
          onSubmit={(snapshot) => {
            void handleAddMachineFromModal(snapshot);
          }}
          onRequestDelete={
            addModalMode === "edit"
              ? () => {
                  setDeleteTarget({ name: form.name } as Machine);
                  setDeleteConfirmOpen(true);
                }
              : undefined
          }
        />

        <ConfirmDialog
          open={deleteConfirmOpen}
          title="장비 삭제"
          description={
            deleteTarget ? (
              <span>
                <strong>{deleteTarget.name}</strong> 장비를 삭제하시겠습니까? 이
                작업은 되돌릴 수 없습니다.
              </span>
            ) : null
          }
          confirmLabel="삭제"
          cancelLabel="취소"
          onConfirm={handleDeleteConfirm}
          onCancel={() => {
            setDeleteConfirmOpen(false);
            setDeleteTarget(null);
          }}
        />

        <CncProgramEditorPanel
          open={programEditorOpen}
          onClose={closeProgramEditor}
          workUid={workUid}
          selectedProgram={programEditorTarget}
          onLoadProgram={loadProgramCode}
          onSaveProgram={saveProgramCode}
          readOnly={isReadOnly}
        />

        <ConfirmDialog
          open={resetConfirmOpen}
          title="리셋(Reset)"
          description={
            resetTarget
              ? "장비를 리셋합니다. 진행 중인 작업이 영향을 받을 수 있습니다."
              : null
          }
          confirmLabel="리셋"
          cancelLabel="취소"
          onConfirm={async () => {
            if (!resetTarget) return;
            await sendControlCommand(resetTarget.uid, "reset");
            setResetConfirmOpen(false);
            setResetTarget(null);
          }}
          onCancel={() => {
            setResetConfirmOpen(false);
            setResetTarget(null);
          }}
        />

        <CncPlaylistDrawer
          open={playlistOpen}
          title={playlistTarget?.name || ""}
          jobs={playlistJobs}
          readOnly={playlistReadOnly}
          deleteVariant="cnc"
          onClose={() => {
            const target = playlistTarget;
            setPlaylistOpen(false);
            setPlaylistTarget(null);
            setPlaylistReadOnly(false);
            if (target) {
              void loadBridgeQueueForMachine(target, { silent: true });
            }
          }}
          onOpenCode={(jobId) => {
            const m = playlistTarget;
            if (!m) return;
            const jobs = reservationJobsMap[m.uid] || [];
            const job = jobs.find((j) => j.id === jobId);
            if (!job) return;
            const programNo = job.programNo ?? null;
            const prog: any = {
              programNo,
              no: programNo,
              name: job.name,
              source: (job as any)?.source ?? "db",
              s3Key: (job as any)?.s3Key ?? "",
              s3Bucket: (job as any)?.s3Bucket ?? "",
              bridgePath: (job as any)?.bridgePath ?? "",
              headType: 1,
            };
            void openProgramDetail(prog, m.uid);
          }}
          onDelete={(jobId) => {
            const m = playlistTarget;
            if (!m) return;
            const uid = m.uid;
            queueBatchRef.current.machineId = uid;
            queueBatchRef.current.deleteJobIds.add(jobId);
            scheduleQueueBatchCommit(uid);
          }}
          onReorder={(nextOrder) => {
            const m = playlistTarget;
            if (!m) return;
            const uid = m.uid;
            queueBatchRef.current.machineId = uid;
            queueBatchRef.current.order = nextOrder;
            scheduleQueueBatchCommit(uid);
          }}
          onChangeQty={(jobId, qty) => {
            const m = playlistTarget;
            if (!m) return;
            const uid = m.uid;
            queueBatchRef.current.machineId = uid;
            queueBatchRef.current.qtyByJobId[jobId] = qty;
            scheduleQueueBatchCommit(uid);
          }}
        />

        {PinModal}

        <ConfirmDialog
          open={toolLifeSaveConfirmOpen}
          title="공구 수명 저장"
          description="설정값이 변경되었습니다. 변경 내용을 저장하시겠습니까?"
          confirmLabel="적용"
          cancelLabel="취소"
          onConfirm={() => {
            void handleToolLifeSaveConfirm();
          }}
          onCancel={() => {
            setToolLifeSaveConfirmOpen(false);
            setToolLifeDirty(false);
            setModalOpen(false);
          }}
        />

        <CncTempDetailModal
          open={tempModalOpen}
          body={tempModalBody}
          onRequestClose={() => setTempModalOpen(false)}
        />

        <CncMachineInfoModal
          open={machineInfoOpen}
          loading={machineInfoLoading}
          error={machineInfoError}
          clearing={machineInfoClearing}
          programInfo={machineInfoProgram}
          alarms={machineInfoAlarms}
          onClearAlarms={() => {
            void clearMachineAlarms();
          }}
          onRequestClose={() => setMachineInfoOpen(false)}
        />

        <CncToolStatusModal
          open={modalOpen}
          title={modalTitle}
          body={modalBody}
          toolLifeDirty={toolLifeDirty}
          health={toolHealthMap[workUid] ?? "unknown"}
          onRequestClose={() => {
            setToolLifeSaveConfirmOpen(false);
            setToolLifeDirty(false);
            setModalOpen(false);
          }}
          onOpenToolOffsetEditor={() => openToolOffsetEditor()}
          onSave={() => {
            void handleToolLifeSaveConfirm();
          }}
        />

        <CncMaterialChangeModal
          open={materialChangeModalOpen}
          onClose={() => {
            setMaterialChangeModalOpen(false);
            setMaterialChangeTarget(null);
          }}
          machineId={materialChangeTarget?.uid || ""}
          machineName={materialChangeTarget?.name || ""}
          currentDiameter={materialChangeTarget?.currentMaterial?.diameter ?? 8}
          currentDiameterGroup={
            materialChangeTarget?.currentMaterial?.diameterGroup ?? "8"
          }
          scheduledChange={materialChangeScheduled}
          onSchedule={handleScheduleMaterialChange}
          onCancel={handleCancelMaterialChange}
        />

        <CncMaterialModal
          open={materialModalOpen}
          onClose={() => {
            setMaterialModalOpen(false);
            setMaterialModalTarget(null);
          }}
          machineId={materialModalTarget?.uid || ""}
          machineName={materialModalTarget?.name || ""}
          currentMaterial={materialModalTarget?.currentMaterial || null}
          maxModelDiameterGroups={
            (materialModalTarget?.maxModelDiameterGroups as any) || ["10+"]
          }
          onReplace={handleReplaceMaterial}
          onAdd={handleAddMaterial}
        />
      </main>
    </div>
  );
}
