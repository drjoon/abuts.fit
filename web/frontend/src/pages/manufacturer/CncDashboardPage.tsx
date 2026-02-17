import {
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
  Fragment,
} from "react";
import { useToast } from "@/shared/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/shared/api/apiClient";
import { Machine, type MachineForm } from "./cnc/types";
import { useCncMachines } from "@/features/manufacturer/cnc/hooks/useCncMachines";
import { useCncWorkBoard } from "@/features/manufacturer/cnc/hooks/useCncWorkBoard";
import { useCncRaw } from "@/features/manufacturer/cnc/hooks/useCncRaw";
import type { HealthLevel } from "@/pages/manufacturer/cnc/components/MachineCard";
import { useCncWriteGuard } from "@/features/manufacturer/cnc/hooks/useCncWriteGuard";
import { useCncToolPanels } from "@/features/manufacturer/cnc/hooks/useCncToolPanels";
import { useCncDashboardCore } from "@/features/manufacturer/cnc/hooks/useCncDashboardCore";
import { useCncTempPanel } from "@/features/manufacturer/cnc/hooks/useCncTempPanel";
import type { CncJobItem } from "@/pages/manufacturer/cnc/components/CncReservationModal";
import type { PlaylistJobItem } from "@/pages/manufacturer/cnc/components/CncPlaylistDrawer";
import { useCncProgramEditor } from "@/features/manufacturer/cnc/hooks/useCncProgramEditor";
import { type CncMaterialInfo } from "@/pages/manufacturer/cnc/components/CncMaterialModal";
import { CncDashboardPageView } from "./cncDashboard/CncDashboardPageView";
import { useCncDashboardQueues } from "@/features/manufacturer/cncDashboard/hooks/useCncDashboardQueues";
import { useCncDashboardMachineInfo } from "@/features/manufacturer/cncDashboard/hooks/useCncDashboardMachineInfo";
import { useCncDashboardMaterials } from "@/features/manufacturer/cncDashboard/hooks/useCncDashboardMaterials";
import { useMachineStatusStore } from "@/store/useMachineStatusStore";
import { useSocket } from "@/shared/hooks/useSocket";

export const CncDashboardPage = () => {
  const { user, token } = useAuthStore();
  useSocket();
  const refreshMachineStatuses = useMachineStatusStore((s) => s.refresh);
  const {
    machines,
    setMachines,
    loading,
    setLoading,
    error,
    setError,
    form,
    setForm,
    addModalOpen,
    setAddModalOpen,
    addModalMode,
    setAddModalMode,
    handleChange,
    handleEditMachine,
    handleDeleteMachine,
    handleAddMachine,
  } = useCncMachines();

  const { callRaw } = useCncRaw();

  const [workUid, setWorkUid] = useState<string>("");

  useEffect(() => {
    if (machines.length > 0 && !workUid) {
      setWorkUid(machines[0].uid);
    }
  }, [machines, workUid]);

  const {
    opStatus,
    motorTemp,
    toolSummary,
    programSummary,
    scanStatus,
    scanError,
    lastScanAt,
    scanHistory,
    refreshWorkBoard,
    fetchMotorTemp,
    fetchToolLife,
    fetchProgramList,
    setOpStatus,
    togglePanelIO,
  } = useCncWorkBoard(workUid, machines, setLoading, setError, callRaw);

  const [deleteTarget, setDeleteTarget] = useState<Machine | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const [tempHealthMap, setTempHealthMap] = useState<
    Record<string, HealthLevel>
  >({});
  const [toolHealthMap, setToolHealthMap] = useState<
    Record<string, HealthLevel>
  >({});

  const [eventLogMachineId, setEventLogMachineId] = useState<string | null>(
    null,
  );

  const [tempTooltipMap, setTempTooltipMap] = useState<Record<string, string>>(
    {},
  );
  const [toolTooltipMap, setToolTooltipMap] = useState<Record<string, string>>(
    {},
  );

  const updateTempHealth = (uid: string, level: HealthLevel) => {
    if (!uid) return;
    setTempHealthMap((prev) => ({ ...prev, [uid]: level }));
  };

  const updateTempTooltip = (uid: string, msg: string) => {
    if (!uid) return;
    setTempTooltipMap((prev) => ({ ...prev, [uid]: msg }));
  };

  const updateToolHealth = (uid: string, level: HealthLevel) => {
    if (!uid) return;
    setToolHealthMap((prev) => ({ ...prev, [uid]: level }));
  };

  const updateToolTooltip = (uid: string, msg: string) => {
    if (!uid) return;
    setToolTooltipMap((prev) => ({ ...prev, [uid]: msg }));
  };

  // RAW 호출은 useCncRaw 훅에서 제공하는 callRaw를 사용

  const {
    programEditorOpen,
    programEditorTarget,
    isReadOnly,
    openProgramDetail,
    closeProgramEditor,
    loadProgramCode,
    saveProgramCode,
  } = useCncProgramEditor({
    workUid,
    machines,
    programSummary,
    callRaw,
    setError,
    fetchProgramList,
  });

  const [machiningRecordSummaryMap, setMachiningRecordSummaryMap] = useState<
    Record<
      string,
      {
        status?: string;
        startedAt?: string | Date;
        completedAt?: string | Date;
        durationSeconds?: number;
        elapsedSeconds?: number;
      } | null
    >
  >({});

  const { toast } = useToast();
  const { ensureCncWriteAllowed, PinModal } = useCncWriteGuard();

  const materials = useCncDashboardMaterials({
    token,
    machines,
    setMachines,
    toast,
  });

  const {
    modalOpen,
    modalTitle,
    modalBody,
    toolLifeRows,
    toolLifeDirty,
    toolLifeSaveConfirmOpen,
    setModalOpen,
    setModalTitle,
    setModalBody,
    setToolLifeRows,
    setToolLifeDirty,
    setToolLifeSaveConfirmOpen,
    openToolDetail,
    openToolOffsetEditor,
    handleToolLifeSaveConfirm,
  } = useCncToolPanels({
    workUid,
    callRaw,
    ensureCncWriteAllowed,
    setError,
    setToolHealth: (level) => {
      if (!workUid) return;
      updateToolHealth(workUid, level);
    },
    setToolTooltip: (msg) => {
      if (!workUid) return;
      updateToolTooltip(workUid, msg);
    },
  });

  const { tempModalOpen, tempModalBody, setTempModalOpen, openTempDetail } =
    useCncTempPanel({
      callRaw,
      setError,
      setTempHealth: updateTempHealth,
      setTempTooltip: updateTempTooltip,
    });

  const [machineManagerOpen, setMachineManagerOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<Machine | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const {
    machineInfoOpen,
    setMachineInfoOpen,
    machineInfoLoading,
    machineInfoError,
    machineInfoClearing,
    machineInfoProgram,
    machineInfoAlarms,
    openMachineInfo,
    clearMachineAlarms,
  } = useCncDashboardMachineInfo({ token, toast });

  // 제조사 대시보드 요약 (할당된 의뢰 기준)
  const { data: cncDashboardSummary } = useQuery({
    queryKey: ["manufacturer-dashboard-summary-cnc"],
    enabled: !!user && user.role === "manufacturer",
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    queryFn: async () => {
      const res = await fetch("/api/requests/assigned/dashboard-summary", {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : undefined,
      });
      if (res.status === 401) {
        // 비로그인 상태이거나 제조사 권한이 없으면 요약 카드는 숨기고 에러는 발생시키지 않는다.
        return null;
      }
      if (!res.ok) {
        throw new Error("제조사 대시보드 요약 조회에 실패했습니다.");
      }
      return res.json();
    },
  });

  // 장비 추가/수정 모달
  const handleAddMachineFromModal = async (snapshot?: MachineForm) => {
    await handleAddMachine(snapshot);
  };

  const debounceTimersRef = useRef<
    Record<string, ReturnType<typeof setTimeout> | null>
  >({});
  const debounceBaselineRef = useRef<Record<string, any>>({});
  const debounceLatestRef = useRef<Record<string, any>>({});

  const scheduleDebounced = useCallback(
    (key: string, nextValue: any, baselineValue: any, commit: () => void) => {
      debounceLatestRef.current[key] = nextValue;

      if (debounceTimersRef.current[key] == null) {
        debounceBaselineRef.current[key] = baselineValue;
      }

      const existing = debounceTimersRef.current[key];
      if (existing) {
        clearTimeout(existing);
      }

      debounceTimersRef.current[key] = setTimeout(() => {
        const latest = debounceLatestRef.current[key];
        const baseline = debounceBaselineRef.current[key];

        debounceTimersRef.current[key] = null;
        delete debounceLatestRef.current[key];
        delete debounceBaselineRef.current[key];

        if (latest === baseline) return;
        commit();
      }, 700);
    },
    [],
  );

  const updateMachineFlags = useCallback(
    (
      machine: Machine,
      next: { allowJobStart?: boolean; allowAutoMachining?: boolean },
    ) => {
      if (!token) return;

      const uid = machine.uid;
      const prevAllowJobStart = machine.allowJobStart !== false;
      const prevAllowAutoMachining = machine.allowAutoMachining === true;

      if (typeof next.allowJobStart === "boolean") {
        const desired = next.allowJobStart;
        setMachines((prev) =>
          prev.map((m) =>
            m.uid === uid ? { ...m, allowJobStart: desired } : m,
          ),
        );
        scheduleDebounced(
          `machine:${uid}:allowJobStart`,
          desired,
          prevAllowJobStart,
          () => {
            void (async () => {
              try {
                const res = await apiFetch({
                  path: "/api/machines",
                  method: "POST",
                  token,
                  jsonBody: {
                    uid: machine.uid,
                    name: machine.name,
                    ip: machine.ip,
                    port: machine.port,
                    allowJobStart: desired,
                    allowAutoMachining: prevAllowAutoMachining,
                  },
                });

                const body: any = res.data ?? {};
                if (!res.ok || body?.success === false) {
                  throw new Error(body?.message || "장비 설정 저장 실패");
                }
              } catch (e: any) {
                setMachines((prev) =>
                  prev.map((m) =>
                    m.uid === uid
                      ? { ...m, allowJobStart: prevAllowJobStart }
                      : m,
                  ),
                );
                toast({
                  title: "설정 저장 실패",
                  description: e?.message || "잠시 후 다시 시도해주세요.",
                  variant: "destructive",
                });
              }
            })();
          },
        );
      }

      if (typeof next.allowAutoMachining === "boolean") {
        const desired = next.allowAutoMachining;
        setMachines((prev) =>
          prev.map((m) =>
            m.uid === uid ? { ...m, allowAutoMachining: desired } : m,
          ),
        );
        scheduleDebounced(
          `machine:${uid}:allowAutoMachining`,
          desired,
          prevAllowAutoMachining,
          () => {
            void (async () => {
              try {
                const res = await apiFetch({
                  path: "/api/machines",
                  method: "POST",
                  token,
                  jsonBody: {
                    uid: machine.uid,
                    name: machine.name,
                    ip: machine.ip,
                    port: machine.port,
                    allowJobStart: prevAllowJobStart,
                    allowAutoMachining: desired,
                  },
                });

                const body: any = res.data ?? {};
                if (!res.ok || body?.success === false) {
                  throw new Error(body?.message || "장비 설정 저장 실패");
                }
              } catch (e: any) {
                setMachines((prev) =>
                  prev.map((m) =>
                    m.uid === uid
                      ? { ...m, allowAutoMachining: prevAllowAutoMachining }
                      : m,
                  ),
                );
                toast({
                  title: "설정 저장 실패",
                  description: e?.message || "잠시 후 다시 시도해주세요.",
                  variant: "destructive",
                });
              }
            })();
          },
        );
      }
    },
    [scheduleDebounced, setMachines, toast, token],
  );

  const globalRemoteEnabled = useMemo(() => {
    if (!Array.isArray(machines) || machines.length === 0) return false;
    return machines.every((m) => m.allowJobStart !== false);
  }, [machines]);

  const setGlobalRemoteEnabled = useCallback(
    (enabled: boolean) => {
      if (!token) return;

      const list = Array.isArray(machines) ? machines : [];
      if (list.length === 0) return;

      const prevMap = new Map(
        list.map((m) => [m.uid, m.allowJobStart !== false]),
      );
      const baselineEnabled = globalRemoteEnabled;

      setMachines((prev) =>
        prev.map((m) => ({ ...m, allowJobStart: enabled })),
      );

      scheduleDebounced("global:remote", enabled, baselineEnabled, () => {
        void (async () => {
          try {
            for (const m of list) {
              const res = await apiFetch({
                path: "/api/machines",
                method: "POST",
                token,
                jsonBody: {
                  uid: m.uid,
                  name: m.name,
                  ip: m.ip,
                  port: m.port,
                  allowJobStart: enabled,
                },
              });
              const body: any = res.data ?? {};
              if (!res.ok || body?.success === false) {
                throw new Error(
                  body?.message || "전체 원격 가공 설정 저장 실패",
                );
              }
            }
          } catch (e: any) {
            setMachines((prev) =>
              prev.map((m) => ({
                ...m,
                allowJobStart: prevMap.get(m.uid) !== false,
              })),
            );
            toast({
              title: "전체 원격 가공 설정 실패",
              description: e?.message || "잠시 후 다시 시도해주세요.",
              variant: "destructive",
            });
          }
        })();
      });
    },
    [
      globalRemoteEnabled,
      machines,
      scheduleDebounced,
      setMachines,
      toast,
      token,
    ],
  );

  const {
    refreshStatusFor,
    sendControlCommand,
    handleBackgroundRefresh: coreHandleBackgroundRefresh,
  } = useCncDashboardCore({
    machines,
    setMachines,
    loading,
    setLoading,
    setError,
    callRaw,
    ensureCncWriteAllowed,
    token,
  });

  const queues = useCncDashboardQueues({
    machines,
    setMachines,
    token,
    toast,
    ensureCncWriteAllowed,
    setError,
    callRaw,
    refreshStatusFor,
    fetchProgramList,
  });

  const handleBackgroundRefresh = useCallback(() => {
    void queues.refreshDbQueuesForAllMachines();

    const uids = (Array.isArray(machines) ? machines : [])
      .map((m) => String(m?.uid || "").trim())
      .filter(Boolean);
    if (token && uids.length > 0) {
      void refreshMachineStatuses({ token, uids });
    }

    // 기존 로컬 상태 갱신도 유지(상태 텍스트/lastUpdated 등을 위해)
    coreHandleBackgroundRefresh();
  }, [
    coreHandleBackgroundRefresh,
    machines,
    queues,
    refreshMachineStatuses,
    token,
  ]);

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    void (async () => {
      try {
        const res = await fetch("/api/cnc-machines/queues", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body: any = await res.json().catch(() => ({}));
        if (!res.ok || body?.success === false) return;
        const map =
          body?.data && typeof body.data === "object" ? body.data : {};

        const next: Record<string, any> = {};
        for (const [mid, items] of Object.entries(map)) {
          const list: any[] = Array.isArray(items) ? (items as any[]) : [];
          const head = list[0] || null;
          next[String(mid)] = head?.machiningRecord || null;
        }
        if (mounted) setMachiningRecordSummaryMap(next);
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    await handleDeleteMachine(deleteTarget.name);
    toast({
      title: "장비 삭제",
      description: `${deleteTarget.name} 장비가 삭제되었습니다.`,
    });
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
    setAddModalOpen(false);
  }, [deleteTarget, handleDeleteMachine, setAddModalOpen, toast]);

  return (
    <CncDashboardPageView
      machines={machines}
      mergedMachines={materials.mergedMachines}
      workUid={workUid}
      loading={loading}
      globalDummyEnabled={materials.globalDummyEnabled}
      globalRemoteEnabled={globalRemoteEnabled}
      setGlobalDummyEnabled={materials.setGlobalDummyEnabled}
      setGlobalRemoteEnabled={setGlobalRemoteEnabled}
      handleBackgroundRefresh={handleBackgroundRefresh}
      tempTooltipMap={tempTooltipMap}
      toolTooltipMap={toolTooltipMap}
      toolHealthMap={toolHealthMap}
      programSummary={programSummary}
      machiningElapsedSecondsMap={queues.machiningElapsedSecondsMap}
      lastCompletedMap={queues.lastCompletedMap}
      machiningRecordSummaryMap={machiningRecordSummaryMap}
      reservationJobsMap={queues.reservationJobsMap}
      worksheetQueueCountMap={queues.worksheetQueueCountMap}
      reservationSummaryMap={queues.reservationSummaryMap}
      reservationTotalQtyMap={queues.reservationTotalQtyMap}
      updateMachineFlags={updateMachineFlags}
      updateMachineDummyEnabled={materials.updateMachineDummyEnabled}
      setWorkUid={(uid: string) => {
        setWorkUid(uid);
        if (token && uid) {
          void queues.loadBridgeQueueForMachine(
            machines.find((m) => m.uid === uid)!,
            {
              silent: true,
            },
          );
        }
      }}
      refreshStatusFor={refreshStatusFor}
      fetchProgramList={fetchProgramList}
      openTempDetail={openTempDetail}
      callRaw={callRaw}
      openToolDetail={openToolDetail}
      updateToolTooltip={updateToolTooltip}
      updateToolHealth={updateToolHealth}
      handleEditMachine={handleEditMachine}
      openMachineInfo={openMachineInfo}
      openProgramDetail={openProgramDetail}
      sendControlCommand={sendControlCommand}
      setResetTarget={setResetTarget}
      setResetConfirmOpen={setResetConfirmOpen}
      setPlaylistTarget={queues.setPlaylistTarget}
      loadQueueForMachine={queues.loadQueueForMachine}
      setPlaylistOpen={queues.setPlaylistOpen}
      queueBatchRef={queues.queueBatchRef}
      scheduleQueueBatchCommit={queues.scheduleQueueBatchCommit}
      onTogglePause={queues.onTogglePause}
      setReservationJobsMap={queues.setReservationJobsMap}
      setReservationSummaryMap={queues.setReservationSummaryMap}
      setReservationTotalQtyMap={queues.setReservationTotalQtyMap}
      ensureCncWriteAllowed={ensureCncWriteAllowed}
      toast={toast}
      setError={setError}
      addModalOpen={addModalOpen}
      addModalMode={addModalMode}
      form={form}
      handleChange={handleChange}
      setAddModalOpen={setAddModalOpen}
      setAddModalMode={setAddModalMode}
      handleAddMachineFromModal={handleAddMachineFromModal}
      deleteConfirmOpen={deleteConfirmOpen}
      deleteTarget={deleteTarget}
      handleDeleteConfirm={handleDeleteConfirm}
      setDeleteConfirmOpen={setDeleteConfirmOpen}
      setDeleteTarget={setDeleteTarget}
      programEditorOpen={programEditorOpen}
      programEditorTarget={programEditorTarget}
      closeProgramEditor={closeProgramEditor}
      loadProgramCode={loadProgramCode}
      saveProgramCode={saveProgramCode}
      isReadOnly={isReadOnly}
      resetConfirmOpen={resetConfirmOpen}
      resetTarget={resetTarget}
      playlistOpen={queues.playlistOpen}
      playlistTarget={queues.playlistTarget}
      playlistJobs={queues.playlistJobs}
      playlistReadOnly={queues.playlistReadOnly}
      setPlaylistReadOnly={queues.setPlaylistReadOnly}
      loadBridgeQueueForMachine={queues.loadBridgeQueueForMachine}
      PinModal={PinModal}
      toolLifeSaveConfirmOpen={toolLifeSaveConfirmOpen}
      handleToolLifeSaveConfirm={handleToolLifeSaveConfirm}
      setToolLifeSaveConfirmOpen={setToolLifeSaveConfirmOpen}
      toolLifeDirty={toolLifeDirty}
      setToolLifeDirty={setToolLifeDirty}
      setModalOpen={setModalOpen}
      tempModalOpen={tempModalOpen}
      tempModalBody={tempModalBody}
      setTempModalOpen={setTempModalOpen}
      machineInfoOpen={machineInfoOpen}
      machineInfoLoading={machineInfoLoading}
      machineInfoError={machineInfoError}
      machineInfoClearing={machineInfoClearing}
      machineInfoProgram={machineInfoProgram}
      machineInfoAlarms={machineInfoAlarms}
      clearMachineAlarms={clearMachineAlarms}
      setMachineInfoOpen={setMachineInfoOpen}
      modalOpen={modalOpen}
      modalTitle={modalTitle}
      modalBody={modalBody}
      openToolOffsetEditor={openToolOffsetEditor}
      materialChangeModalOpen={materials.materialChangeModalOpen}
      setMaterialChangeModalOpen={materials.setMaterialChangeModalOpen}
      setMaterialChangeTarget={materials.setMaterialChangeTarget}
      materialChangeTarget={materials.materialChangeTarget}
      materialChangeScheduled={materials.materialChangeScheduled}
      handleScheduleMaterialChange={materials.handleScheduleMaterialChange}
      handleCancelMaterialChange={materials.handleCancelMaterialChange}
      materialModalOpen={materials.materialModalOpen}
      setMaterialModalOpen={materials.setMaterialModalOpen}
      setMaterialModalTarget={materials.setMaterialModalTarget}
      materialModalTarget={materials.materialModalTarget}
      handleReplaceMaterial={materials.handleReplaceMaterial}
      handleAddMaterial={materials.handleAddMaterial}
      eventLogMachineId={eventLogMachineId}
      setEventLogMachineId={setEventLogMachineId}
      playingNextMap={queues.playingNextMap}
      handlePlayNextUp={queues.handlePlayNextUp}
      handlePlayNowPlaying={queues.handlePlayNowPlaying}
      nowPlayingMap={queues.nowPlayingMap}
      refreshDbQueuesForAllMachines={queues.refreshDbQueuesForAllMachines}
    />
  );
};
