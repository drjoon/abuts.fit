import { useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { Machine } from "@/pages/manufacturer/cnc/types";
import { useCncMachines } from "@/pages/manufacturer/cnc/hooks/useCncMachines";
import { useCncWorkBoard } from "@/pages/manufacturer/cnc/hooks/useCncWorkBoard";
import { useCncRaw } from "@/pages/manufacturer/cnc/hooks/useCncRaw";
import { CncMachineGrid } from "@/pages/manufacturer/cnc/components/CncMachineGrid";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Plus, FileText, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { useCncWriteGuard } from "@/pages/manufacturer/cnc/hooks/useCncWriteGuard";
import { CncProgramEditorPanel } from "@/pages/manufacturer/cnc/components/CncProgramEditorPanel";
import type { HealthLevel } from "@/pages/manufacturer/cnc/components/MachineCard";
import { useCncToolPanels } from "@/pages/manufacturer/cnc/hooks/useCncToolPanels";
import { CncToolStatusModal } from "@/pages/manufacturer/cnc/components/CncToolStatusModal";
import { CncMachineManagerModal } from "@/pages/manufacturer/cnc/components/CncMachineManagerModal";
import { useCncDashboardCore } from "@/pages/manufacturer/cnc/hooks/useCncDashboardCore";
import { useCncTempPanel } from "@/pages/manufacturer/cnc/hooks/useCncTempPanel";
import { CncTempDetailModal } from "@/pages/manufacturer/cnc/components/CncTempDetailModal";
import { CncWorkBoardPanel } from "@/pages/manufacturer/cnc/components/CncWorkBoardPanel";
import {
  CncReservationModal,
  type CncJobItem,
} from "@/pages/manufacturer/cnc/components/CncReservationModal";
import { CncReservationListModal } from "@/pages/manufacturer/cnc/components/CncReservationListModal";
import { useCncProgramEditor } from "@/pages/manufacturer/cnc/hooks/useCncProgramEditor";
import { CncMaterialChangeModal } from "@/pages/manufacturer/cnc/components/CncMaterialChangeModal";

export const CncDashboardPage = () => {
  const { user, token } = useAuthStore();
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

  const [materialChangeModalOpen, setMaterialChangeModalOpen] = useState(false);
  const [materialChangeTarget, setMaterialChangeTarget] =
    useState<Machine | null>(null);

  const [tempHealthMap, setTempHealthMap] = useState<
    Record<string, HealthLevel>
  >({});
  const [toolHealthMap, setToolHealthMap] = useState<
    Record<string, HealthLevel>
  >({});
  const [tempTooltipMap, setTempTooltipMap] = useState<Record<string, string>>(
    {}
  );
  const [toolTooltipMap, setToolTooltipMap] = useState<Record<string, string>>(
    {}
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

  const { toast } = useToast();
  const { ensureCncWriteAllowed, PinModal } = useCncWriteGuard();

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

  const [reservationOpen, setReservationOpen] = useState(false);
  const [reservationTarget, setReservationTarget] = useState<Machine | null>(
    null
  );
  const [reservationSummaryMap, setReservationSummaryMap] = useState<
    Record<string, string>
  >({});

  const [reservationJobsMap, setReservationJobsMap] = useState<
    Record<string, CncJobItem[]>
  >({});

  const [reservationTotalQtyMap, setReservationTotalQtyMap] = useState<
    Record<string, number>
  >({});

  const [reservationListOpen, setReservationListOpen] = useState(false);
  const [reservationListTarget, setReservationListTarget] =
    useState<Machine | null>(null);

  const reservationListJobs: CncJobItem[] =
    reservationListTarget &&
    reservationJobsMap[reservationListTarget.uid] &&
    Array.isArray(reservationJobsMap[reservationListTarget.uid])
      ? reservationJobsMap[reservationListTarget.uid]
      : [];

  const reservationJobsForTarget: CncJobItem[] =
    reservationTarget && reservationJobsMap[reservationTarget.uid]
      ? reservationJobsMap[reservationTarget.uid]
      : [];

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
  const handleAddMachineFromModal = async () => {
    await handleAddMachine();
  };

  const handleDownloadProgram = async (prog: any) => {
    if (!prog) return;
    const code = await loadProgramCode(prog);
    const programNo = prog.programNo ?? prog.no ?? null;
    const baseName =
      prog.programName ??
      prog.name ??
      (programNo != null ? String(programNo) : "program");
    const normalizedName = String(baseName).replace(/^#\s*/, "");
    const safeName = normalizedName.replace(/[\\/:*?"<>|]/g, "_") || "program";

    const blob = new Blob([code ?? ""], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.nc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 에러 상태가 변경될 때 앱 공용 토스트로 표시
  useEffect(() => {
    if (!error) return;
    toast({
      title: "CNC 에러",
      description: error,
      variant: "destructive",
    });
  }, [error, toast]);

  const { refreshStatusFor, sendControlCommand, handleBackgroundRefresh } =
    useCncDashboardCore({
      machines,
      setMachines,
      loading,
      setLoading,
      setError,
      callRaw,
      ensureCncWriteAllowed,
    });

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await handleDeleteMachine(deleteTarget.name);
    toast({
      title: "장비 삭제",
      description: `${deleteTarget.name} 장비가 삭제되었습니다.`,
    });
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
    setAddModalOpen(false);
  };

  const handleScheduleMaterialChange = async (data: {
    targetTime: Date;
    newDiameter: number;
    newDiameterGroup: string;
    notes?: string;
  }) => {
    if (!materialChangeTarget || !token) return;

    const res = await fetch(
      `/api/cnc-machines/${materialChangeTarget.uid}/schedule-material-change`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      }
    );

    if (!res.ok) {
      throw new Error("소재 교체 예약에 실패했습니다.");
    }

    // 장비 목록 새로고침
    const updatedMachines = await fetch("/api/cnc-machines", {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json());

    if (updatedMachines.success) {
      setMachines(updatedMachines.data);
    }
  };

  const handleCancelMaterialChange = async () => {
    if (!materialChangeTarget || !token) return;

    const res = await fetch(
      `/api/cnc-machines/${materialChangeTarget.uid}/schedule-material-change`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!res.ok) {
      throw new Error("소재 교체 예약 취소에 실패했습니다.");
    }

    // 장비 목록 새로고침
    const updatedMachines = await fetch("/api/cnc-machines", {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json());

    if (updatedMachines.success) {
      setMachines(updatedMachines.data);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-gray-50 to-blue-100 text-gray-800 p-4 sm:p-6 lg:p-8 flex items-stretch">
      <main
        className="flex-1 min-h-full bg-white/80 backdrop-blur-xl p-6 sm:p-8 rounded-2xl shadow-lg cursor-pointer transition-shadow hover:shadow-xl"
        onClick={(e) => {
          // 배경 영역 클릭 시에만 전체 장비 상태를 갱신하고,
          // 카드/버튼 등 자식 요소 클릭 시에는 이벤트 버블링으로 인한 중복 갱신을 막는다.
          if (e.target === e.currentTarget) {
            handleBackgroundRefresh();
          }
        }}
      >
        <div className="flex flex-col sm:flex-row">
          <div className="flex-1 min-w-0">
            {/* 여기 아래부터는 장비 카드 그리드 */}
            {machines.length === 0 ? (
              <div className="mt-2 grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
                <button
                  type="button"
                  className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-white/70 p-6 text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/60 transition-colors shadow-sm"
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
              <CncMachineGrid
                machines={machines}
                workUid={workUid}
                loading={loading}
                tempHealthMap={tempHealthMap}
                toolHealthMap={toolHealthMap}
                tempTooltipMap={tempTooltipMap}
                toolTooltipMap={toolTooltipMap}
                programSummary={programSummary}
                reservationJobsMap={reservationJobsMap}
                reservationSummaryMap={reservationSummaryMap}
                reservationTotalQtyMap={reservationTotalQtyMap}
                onSelectMachine={(uid) => {
                  if (workUid !== uid) {
                    setWorkUid(uid);
                  }
                  void refreshStatusFor(uid);
                  void fetchProgramList();
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
                      // CncToolStatusModal 행 수준과 동일한 기준으로 집계:
                      // - 각 툴별 ratio = useCount/configCount
                      //   - ratio >= 1.0  => alarm (교체 필요)
                      //   - ratio >= 0.95 => warn  (주의)
                      //   - 그 외        => ok    (정상)
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
                        : "공구 정보가 없습니다."
                    );

                    openToolDetail(toolLife, level);
                  } catch (e: any) {
                    const msg = e?.message ?? "공구 상세 조회 중 오류";
                    setError(msg);
                    updateToolHealth(machine.uid, "alarm");
                    updateToolTooltip(machine.uid, msg);
                  }
                }}
                onEditMachine={handleEditMachine}
                onOpenProgramDetail={openProgramDetail}
                onSendControl={(uid, action) => {
                  if (action === "reset") {
                    const target = machines.find((m) => m.uid === uid) || null;
                    if (!target) return;
                    const status = (target.status || "").toUpperCase();
                    const isRunning = ["RUN", "RUNNING", "ONLINE", "OK"].some(
                      (k) => status.includes(k)
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
                  }
                }}
                onOpenAddModal={() => {
                  setAddModalMode("create");
                  setAddModalOpen(true);
                }}
                onOpenJobConfig={(machine) => {
                  if (workUid !== machine.uid) {
                    setWorkUid(machine.uid);
                  }
                  void refreshStatusFor(machine.uid);
                  void fetchProgramList();
                  setReservationTarget(machine);
                  setReservationOpen(true);
                }}
                onCancelReservation={(machine, jobId) => {
                  setReservationJobsMap((prev) => {
                    const jobs = prev[machine.uid] || [];
                    const filtered = jobId
                      ? jobs.filter((j) => j.id !== jobId)
                      : jobs.slice(1);

                    const nextMap = { ...prev };
                    if (filtered.length === 0) {
                      delete nextMap[machine.uid];
                    } else {
                      nextMap[machine.uid] = filtered;
                    }
                    return nextMap;
                  });

                  setReservationSummaryMap((prev) => {
                    const jobs = reservationJobsMap?.[machine.uid] || [];
                    const filtered = jobId
                      ? jobs.filter((j) => j.id !== jobId)
                      : jobs.slice(1);

                    const next = { ...prev };
                    if (filtered.length === 0) {
                      delete next[machine.uid];
                    } else {
                      const first = filtered[0];
                      const baseName =
                        first?.name ||
                        (first?.programNo != null
                          ? `#${first.programNo}`
                          : "-");
                      next[machine.uid] = `[생산예약 : ${baseName}]`;
                    }
                    return next;
                  });

                  setReservationTotalQtyMap((prev) => {
                    const jobs = reservationJobsMap?.[machine.uid] || [];
                    const filtered = jobId
                      ? jobs.filter((j) => j.id !== jobId)
                      : jobs.slice(1);
                    const total = filtered.reduce(
                      (sum, j) => sum + (j.qty || 1),
                      0
                    );
                    const next = { ...prev };
                    if (total <= 0) {
                      delete next[machine.uid];
                    } else {
                      next[machine.uid] = total;
                    }
                    return next;
                  });
                }}
                onTogglePause={async (machine, jobId) => {
                  if (!jobId) return;
                  const uid = machine.uid;

                  let shouldStart = false;
                  setReservationJobsMap((prev) => {
                    const current = prev[uid] || [];
                    const nextJobs = current.map((j) => {
                      if (j.id !== jobId) return j;
                      const wasPaused = !!j.paused;
                      const nextPaused = !wasPaused;
                      if (wasPaused && !nextPaused) {
                        // 일시정지 → 재생으로 전환될 때만 실제 생산 시작 명령을 보낸다.
                        shouldStart = true;
                      }
                      return { ...j, paused: nextPaused };
                    });
                    return {
                      ...prev,
                      [uid]: nextJobs,
                    };
                  });

                  if (!shouldStart) return;

                  const ok = await ensureCncWriteAllowed();
                  if (!ok) return;

                  try {
                    const res = await fetch(
                      `/api/core/machines/${encodeURIComponent(uid)}/start`,
                      {
                        method: "POST",
                      }
                    );

                    if (!res.ok) {
                      const body: any = await res.json().catch(() => ({}));
                      const msg =
                        body?.message ||
                        body?.error ||
                        "생산 시작(Start) 명령 실패";
                      setError(msg);
                      toast({
                        title: "생산 시작 실패",
                        description: msg,
                        variant: "destructive",
                      });
                      return;
                    }

                    // 생산 시작 후 상태를 한 번 갱신해준다.
                    void refreshStatusFor(uid);
                  } catch (e: any) {
                    const msg = e?.message ?? "생산 시작 요청 중 오류";
                    setError(msg);
                    toast({
                      title: "생산 시작 오류",
                      description: msg,
                      variant: "destructive",
                    });
                  }
                }}
                onOpenReservationList={(machine) => {
                  setReservationListTarget(machine);
                  setReservationListOpen(true);
                }}
              />
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
          onSubmit={handleAddMachineFromModal}
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
          title="생산 중단"
          description={resetTarget ? "생산이 중단되고 초기화됩니다." : null}
          confirmLabel="중단"
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

        <CncReservationModal
          open={reservationOpen}
          machine={reservationTarget}
          programList={(programSummary?.list as any[]) || []}
          initialJobs={reservationJobsForTarget}
          onRequestClose={() => {
            setReservationOpen(false);
            setReservationTarget(null);
          }}
          onOpenProgramDetail={openProgramDetail}
          onDownloadProgram={handleDownloadProgram}
          onDeleteProgram={async (programNo) => {
            if (!workUid || !programNo) return;
            try {
              await callRaw(workUid, "DeleteProgram", {
                headType: 0,
                programNo,
              });
              await fetchProgramList();
            } catch (e) {
              console.warn("DeleteProgram error", e);
            }
          }}
          onConfirm={(config) => {
            const target = reservationTarget;
            setReservationOpen(false);
            setReservationTarget(null);
            if (!target) return;
            if (config.mode === "reserved") {
              const jobsWithPause = config.jobs.map((job, idx) => ({
                ...job,
                paused: idx === 0,
              }));

              const first = jobsWithPause[0];
              const baseName =
                first?.name ||
                (first?.programNo != null ? `#${first.programNo}` : "-");
              let whenLabel = "";
              if (config.scheduledAt) {
                const now = new Date();
                const at = new Date(config.scheduledAt);
                const diffMs = at.getTime() - now.getTime();
                if (diffMs > 0) {
                  const diffMin = diffMs / 60000;
                  if (diffMin < 60) {
                    whenLabel = `${Math.round(diffMin)}분 후`;
                  } else if (diffMin < 60 * 24) {
                    whenLabel = `${Math.round(diffMin / 60)}시간 후`;
                  } else {
                    whenLabel = `${Math.round(diffMin / (60 * 24))}일 후`;
                  }
                }
              }
              const summary = whenLabel
                ? `[생산예약 : ${baseName}, 일시(${whenLabel})]`
                : `[생산예약 : ${baseName}]`;
              setReservationSummaryMap((prev) => ({
                ...prev,
                [target.uid]: summary,
              }));

              const totalQty = jobsWithPause.reduce(
                (sum, job) => sum + (job.qty || 1),
                0
              );

              setReservationJobsMap((prev) => ({
                ...prev,
                [target.uid]: jobsWithPause,
              }));

              setReservationTotalQtyMap((prev) => ({
                ...prev,
                [target.uid]: totalQty,
              }));
            } else {
              // 즉시생산일 때는 예약 요약을 제거한다.
              setReservationSummaryMap((prev) => {
                const next = { ...prev };
                delete next[target.uid];
                return next;
              });

              setReservationJobsMap((prev) => {
                const next = { ...prev };
                delete next[target.uid];
                return next;
              });

              setReservationTotalQtyMap((prev) => {
                const next = { ...prev };
                delete next[target.uid];
                return next;
              });
            }
          }}
          onCancelAll={(machine) => {
            setReservationOpen(false);
            setReservationTarget(null);
            if (!machine) return;
            const uid = machine.uid;
            setReservationSummaryMap((prev) => {
              const next = { ...prev };
              delete next[uid];
              return next;
            });
            setReservationJobsMap((prev) => {
              const next = { ...prev };
              delete next[uid];
              return next;
            });
            setReservationTotalQtyMap((prev) => {
              const next = { ...prev };
              delete next[uid];
              return next;
            });
          }}
        />
        <CncReservationListModal
          open={reservationListOpen}
          target={reservationListTarget}
          jobs={reservationListJobs}
          onClose={() => {
            setReservationListOpen(false);
            setReservationListTarget(null);
          }}
          onOpenProgram={(job) => {
            const programNo = job.programNo ?? null;
            const prog: any = {
              programNo,
              no: programNo,
              name: job.name,
              headType: 0,
            };
            void openProgramDetail(prog);
          }}
          onCancelJob={(job) => {
            const target = reservationListTarget;
            if (!target) return;
            const uid = target.uid;
            setReservationJobsMap((prev) => {
              const current = prev[uid] || [];
              const nextJobs = current.filter((j) => j.id !== job.id);
              return {
                ...prev,
                [uid]: nextJobs,
              };
            });
            setReservationSummaryMap((prev) => {
              const remaining = reservationJobsMap[uid] || [];
              const nextRemaining = remaining.filter((j) => j.id !== job.id);
              if (nextRemaining.length > 0) return prev;
              const next = { ...prev };
              delete next[uid];
              return next;
            });
          }}
          onCancelAll={(machine) => {
            if (!machine) return;
            const uid = machine.uid;
            setReservationListOpen(false);
            setReservationListTarget(null);
            setReservationSummaryMap((prev) => {
              const next = { ...prev };
              delete next[uid];
              return next;
            });
            setReservationJobsMap((prev) => {
              const next = { ...prev };
              delete next[uid];
              return next;
            });
          }}
          onDownloadProgram={(job) => {
            const programNo = job.programNo ?? null;
            const prog: any = {
              programNo,
              no: programNo,
              name: job.name,
              headType: 0,
            };
            return handleDownloadProgram(prog);
          }}
        />

        {PinModal}

        <ConfirmDialog
          open={toolLifeSaveConfirmOpen}
          title="공구 수명 저장"
          description="설정값이 변경되었습니다. 변경 내용을 저장하시겠습니까?"
          confirmLabel="적용"
          cancelLabel="취소"
          onConfirm={handleToolLifeSaveConfirm}
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

        <CncToolStatusModal
          open={modalOpen}
          title={modalTitle}
          body={modalBody}
          toolLifeDirty={toolLifeDirty}
          health={toolHealthMap[workUid] ?? "unknown"}
          onRequestClose={() => {
            // X 아이콘 / 바깥 클릭 시에는 변경 여부와 상관없이 바로 닫고,
            // 공구 수명 저장 ConfirmDialog도 함께 리셋한다.
            setToolLifeSaveConfirmOpen(false);
            setToolLifeDirty(false);
            setModalOpen(false);
          }}
          onOpenToolOffsetEditor={() => openToolOffsetEditor()}
          onSave={() => handleToolLifeSaveConfirm()}
        />

        <CncMaterialChangeModal
          open={materialChangeModalOpen}
          onClose={() => {
            setMaterialChangeModalOpen(false);
            setMaterialChangeTarget(null);
          }}
          machineId={materialChangeTarget?.uid || ""}
          machineName={materialChangeTarget?.name || ""}
          currentDiameter={8}
          currentDiameterGroup="8"
          onSchedule={handleScheduleMaterialChange}
          onCancel={handleCancelMaterialChange}
        />
      </main>
    </div>
  );
};
