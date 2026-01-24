import {
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
  Fragment,
} from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/lib/apiClient";
import { Machine, type MachineForm } from "./cnc/types";
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
import { CncMachineInfoModal } from "@/pages/manufacturer/cnc/components/CncMachineInfoModal";
import type { CncJobItem } from "@/pages/manufacturer/cnc/components/CncReservationModal";
import {
  CncPlaylistDrawer,
  type PlaylistJobItem,
} from "@/pages/manufacturer/cnc/components/CncPlaylistDrawer";
import { useCncQueueUpload } from "@/pages/manufacturer/cnc/hooks/useCncQueueUpload";
import { useCncProgramEditor } from "@/pages/manufacturer/cnc/hooks/useCncProgramEditor";
import { CncMaterialChangeModal } from "@/pages/manufacturer/cnc/components/CncMaterialChangeModal";
import {
  CncMaterialModal,
  type CncMaterialInfo,
} from "@/pages/manufacturer/cnc/components/CncMaterialModal";

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

  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [materialModalTarget, setMaterialModalTarget] =
    useState<Machine | null>(null);

  const [cncMachineMetaMap, setCncMachineMetaMap] = useState<
    Record<
      string,
      {
        currentMaterial?: CncMaterialInfo;
        scheduledMaterialChange?: any;
        dummySettings?: { programName?: string; schedules?: any[] };
      }
    >
  >({});

  const [tempHealthMap, setTempHealthMap] = useState<
    Record<string, HealthLevel>
  >({});
  const [toolHealthMap, setToolHealthMap] = useState<
    Record<string, HealthLevel>
  >({});
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

  const { toast } = useToast();
  const { ensureCncWriteAllowed, PinModal } = useCncWriteGuard();
  const { uploadLocalFiles } = useCncQueueUpload();

  const refreshCncMachineMeta = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/cnc-machines", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || body?.success === false) {
      throw new Error(body?.message || "CNC 소재 정보를 불러오지 못했습니다.");
    }
    const list: any[] = Array.isArray(body?.data) ? body.data : [];
    const nextMap: Record<
      string,
      {
        currentMaterial?: CncMaterialInfo;
        scheduledMaterialChange?: any;
        dummySettings?: {
          programName?: string;
          schedules?: any[];
          excludeHolidays?: boolean;
        };
      }
    > = {};
    for (const item of list) {
      const machineId = String(item?.machineId || "");
      if (!machineId) continue;
      nextMap[machineId] = {
        currentMaterial: item?.currentMaterial || undefined,
        scheduledMaterialChange: item?.scheduledMaterialChange || undefined,
        dummySettings: item?.dummySettings || undefined,
      };
    }
    setCncMachineMetaMap(nextMap);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void refreshCncMachineMeta().catch(() => {});
  }, [refreshCncMachineMeta, token]);

  const mergedMachines: Machine[] = useMemo(() => {
    return machines.map((m) => {
      const meta = cncMachineMetaMap[m.uid];
      if (!meta) return m;
      return {
        ...m,
        currentMaterial: meta.currentMaterial || m.currentMaterial,
        scheduledMaterialChange:
          meta.scheduledMaterialChange || m.scheduledMaterialChange,
        dummySettings: meta.dummySettings || m.dummySettings,
      };
    });
  }, [cncMachineMetaMap, machines]);

  const materialChangeScheduled = useMemo(() => {
    const s: any = materialChangeTarget?.scheduledMaterialChange;
    if (!s || !s.targetTime) return undefined;
    if (!s.newDiameterGroup) return undefined;
    const newDiameter =
      typeof s.newDiameter === "number"
        ? s.newDiameter
        : Number.parseInt(String(s.newDiameterGroup), 10);

    return {
      targetTime: String(s.targetTime),
      newDiameter: Number.isFinite(newDiameter) ? newDiameter : 0,
      newDiameterGroup: String(s.newDiameterGroup),
      notes: s.notes ? String(s.notes) : undefined,
    };
  }, [materialChangeTarget?.scheduledMaterialChange]);

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

  const [reservationSummaryMap, setReservationSummaryMap] = useState<
    Record<string, string>
  >({});

  const [reservationJobsMap, setReservationJobsMap] = useState<
    Record<string, CncJobItem[]>
  >({});

  const [reservationTotalQtyMap, setReservationTotalQtyMap] = useState<
    Record<string, number>
  >({});

  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [playlistTarget, setPlaylistTarget] = useState<Machine | null>(null);
  const [playlistReadOnly, setPlaylistReadOnly] = useState(false);

  const [machineInfoOpen, setMachineInfoOpen] = useState(false);
  const [machineInfoLoading, setMachineInfoLoading] = useState(false);
  const [machineInfoError, setMachineInfoError] = useState<string | null>(null);
  const [machineInfoProgram, setMachineInfoProgram] = useState<any | null>(
    null,
  );
  const [machineInfoAlarms, setMachineInfoAlarms] = useState<
    { type: number; no: number }[]
  >([]);
  const [machineInfoUid, setMachineInfoUid] = useState<string | null>(null);
  const [machineInfoClearing, setMachineInfoClearing] = useState(false);

  const playlistJobs: PlaylistJobItem[] = useMemo(() => {
    const m = playlistTarget;
    if (!m) return [];
    const list = reservationJobsMap[m.uid];
    const jobs = Array.isArray(list) ? list : [];
    return jobs.map((j) => ({
      id: j.id,
      name: j.name,
      qty: j.qty || 1,
      paused: j.paused,
    }));
  }, [playlistTarget, reservationJobsMap]);

  const loadBridgeQueueForMachine = useCallback(
    async (machine: Machine, options?: { silent?: boolean }) => {
      if (!token) return;
      const uid = machine.uid;
      if (!uid) return;

      try {
        const res = await fetch(
          `/api/cnc-machines/${encodeURIComponent(uid)}/bridge-queue`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );
        const body: any = await res.json().catch(() => ({}));
        if (!res.ok || body?.success === false) {
          throw new Error(
            body?.message ||
              body?.error ||
              "브리지 예약 큐를 불러오지 못했습니다.",
          );
        }

        const list: any[] = Array.isArray(body?.data) ? body.data : [];
        const jobs: CncJobItem[] = list.map((job) => {
          const programNo =
            typeof job?.programNo === "number" ||
            typeof job?.programNo === "string"
              ? job.programNo
              : null;
          const qtyRaw = job?.qty;
          const qty = Math.max(1, Number(qtyRaw ?? 1) || 1);
          const nameRaw =
            job?.fileName ||
            job?.programName ||
            (programNo != null ? `#${programNo}` : "-");
          return {
            id: String(job?.id || `${uid}:${nameRaw}`),
            source: "bridge",
            programNo,
            name: String(nameRaw || "-"),
            qty,
          };
        });

        setReservationJobsMap((prev) => ({
          ...prev,
          [uid]: jobs,
        }));

        if (jobs.length > 0) {
          const first = jobs[0];
          const baseName = first?.name || "-";
          setReservationSummaryMap((prev) => ({
            ...prev,
            [uid]: `[생산예약 : ${baseName}]`,
          }));

          const total = jobs.reduce((sum, j) => sum + (j.qty || 1), 0);
          setReservationTotalQtyMap((prev) => ({
            ...prev,
            [uid]: total,
          }));
        } else {
          setReservationSummaryMap((prev) => {
            const next = { ...prev };
            delete next[uid];
            return next;
          });
          setReservationTotalQtyMap((prev) => {
            const next = { ...prev };
            delete next[uid];
            return next;
          });
        }
      } catch (e: any) {
        const msg = e?.message || "브리지 예약 큐 조회 중 오류";
        if (!options?.silent) {
          setError(msg);
          toast({
            title: "예약 목록 조회 실패",
            description: msg,
            variant: "destructive",
          });
        }
        throw e;
      }
    },
    [token, toast, setError],
  );

  const loadDbQueueForMachine = useCallback(
    async (machine: Machine) => {
      if (!token) return;
      const uid = machine.uid;
      if (!uid) return;

      const res = await fetch(`/api/cnc-machines/queues`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) {
        throw new Error(body?.message || body?.error || "생산 큐 조회 실패");
      }

      const map = body?.data && typeof body.data === "object" ? body.data : {};
      const list: any[] = Array.isArray(map?.[uid]) ? map[uid] : [];
      const jobs: CncJobItem[] = list.map((item) => {
        const rid = String(item?.requestId || "").trim();
        const clinic = item?.clinicName ? String(item.clinicName) : "";
        const patient = item?.patientName ? String(item.patientName) : "";
        const label =
          clinic || patient
            ? `${clinic}${clinic && patient ? " " : ""}${patient}`
            : rid || "-";
        return {
          id: `db:${rid || label}:${uid}`,
          source: "db",
          programNo: null,
          name: rid ? `${label} (${rid})` : label,
          qty: 1,
          paused: false,
        };
      });

      setReservationJobsMap((prev) => ({
        ...prev,
        [uid]: jobs,
      }));

      if (jobs.length > 0) {
        const first = jobs[0];
        const baseName = first?.name || "-";
        setReservationSummaryMap((prev) => ({
          ...prev,
          [uid]: `[생산예약 : ${baseName}]`,
        }));

        const total = jobs.reduce((sum, j) => sum + (j.qty || 1), 0);
        setReservationTotalQtyMap((prev) => ({
          ...prev,
          [uid]: total,
        }));
      } else {
        setReservationSummaryMap((prev) => {
          const next = { ...prev };
          delete next[uid];
          return next;
        });
        setReservationTotalQtyMap((prev) => {
          const next = { ...prev };
          delete next[uid];
          return next;
        });
      }
    },
    [token],
  );

  const loadQueueForMachine = useCallback(
    async (machine: Machine) => {
      setPlaylistReadOnly(false);
      try {
        await loadBridgeQueueForMachine(machine, { silent: true });
        setPlaylistReadOnly(false);
      } catch {
        try {
          await loadDbQueueForMachine(machine);
          setPlaylistReadOnly(true);
        } catch (e: any) {
          const msg = e?.message || "예약 목록 조회 중 오류";
          setError(msg);
          toast({
            title: "예약 목록 조회 실패",
            description: msg,
            variant: "destructive",
          });
          throw e;
        }
      }
    },
    [loadBridgeQueueForMachine, loadDbQueueForMachine, setError, toast],
  );

  const openMachineInfo = async (uid: string) => {
    if (!uid) return;
    setMachineInfoOpen(true);
    setMachineInfoUid(uid);
    setMachineInfoLoading(true);
    setMachineInfoError(null);
    setMachineInfoProgram(null);
    setMachineInfoAlarms([]);

    try {
      const fetchRawDirect = async (dataType: string, payload: any = null) => {
        const res = await apiFetch({
          path: `/api/machines/${encodeURIComponent(uid)}/raw`,
          method: "POST",
          token,
          jsonBody: {
            uid,
            dataType,
            payload,
            bypassCooldown: true,
          },
        });
        const body = res.data ?? {};
        if (!res.ok || (body as any)?.success === false) {
          const msg =
            (body as any)?.message ||
            (body as any)?.error ||
            `${dataType} 호출 실패 (HTTP ${res.status})`;
          throw new Error(msg);
        }
        return body;
      };

      // headType:1(메인) / 2(서브) 모두 조회 후 병합
      const [progMainRes, progSubRes, alarmRes] = await Promise.all([
        fetchRawDirect("GetActivateProgInfo", 1),
        fetchRawDirect("GetActivateProgInfo", 2),
        apiFetch({
          path: `/api/machines/${encodeURIComponent(uid)}/alarm`,
          method: "POST",
          token,
          jsonBody: { headType: 1 },
        }).then((res) => {
          const body = res.data ?? {};
          if (!res.ok || (body as any)?.success === false) {
            const msg =
              (body as any)?.message ||
              (body as any)?.error ||
              `alarm 호출 실패 (HTTP ${res.status})`;
            throw new Error(msg);
          }
          return body;
        }),
      ]);

      const pickProg = (res: any) => {
        const raw = res && (res.data ?? res);
        const data = raw?.data ?? raw;
        return (
          data?.machineCurrentProgInfo ??
          (data &&
          (data.mainProgramName ||
            data.subProgramName ||
            data.MainProgramName ||
            data.SubProgramName)
            ? {
                mainProgramName:
                  data.mainProgramName ?? data.MainProgramName ?? null,
                mainProgramComment:
                  data.mainProgramComment ?? data.MainProgramComment ?? null,
                subProgramName:
                  data.subProgramName ?? data.SubProgramName ?? null,
                subProgramComment:
                  data.subProgramComment ?? data.SubProgramComment ?? null,
              }
            : null)
        );
      };

      const mainInfo = pickProg(progMainRes);
      const subInfo = pickProg(progSubRes);

      const curInfo = {
        mainProgramName: mainInfo?.mainProgramName ?? null,
        mainProgramComment: mainInfo?.mainProgramComment ?? null,
        subProgramName:
          subInfo?.subProgramName ??
          subInfo?.mainProgramName ?? // 일부 장비가 Sub 헤드를 Main 필드로 줄 수 있음
          null,
        subProgramComment:
          subInfo?.subProgramComment ?? subInfo?.mainProgramComment ?? null,
      };

      const hasAny =
        curInfo.mainProgramName ||
        curInfo.subProgramName ||
        mainInfo ||
        subInfo;
      if (!hasAny) {
        throw new Error(
          "GetActivateProgInfo 응답이 비어있습니다.(쿨다운/프록시/브리지 설정 확인)",
        );
      }
      if (!curInfo) {
        throw new Error(
          "GetActivateProgInfo 응답이 비어있습니다.(쿨다운/프록시/브리지 설정 확인)",
        );
      }
      setMachineInfoProgram(curInfo);

      const a = (alarmRes && (alarmRes.data ?? alarmRes)) as any;
      const list = a?.alarms;
      setMachineInfoAlarms(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setMachineInfoError(e?.message ?? "알 수 없는 오류");
    } finally {
      setMachineInfoLoading(false);
    }
  };

  const clearMachineAlarms = useCallback(async () => {
    if (!token || !machineInfoUid) return;
    setMachineInfoClearing(true);
    try {
      const res = await apiFetch({
        path: `/api/machines/${encodeURIComponent(machineInfoUid)}/alarm/clear`,
        method: "POST",
        token,
        jsonBody: {},
      });
      const body: any = res.data ?? {};
      if (!res.ok || body?.success === false) {
        throw new Error(
          body?.message || body?.error || `알람 해제 실패 (HTTP ${res.status})`,
        );
      }

      // 갱신
      await openMachineInfo(machineInfoUid);
    } catch (e: any) {
      toast({
        title: "알람 해제 실패",
        description: e?.message || "알람 해제 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setMachineInfoClearing(false);
    }
  }, [machineInfoUid, openMachineInfo, toast, token]);

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
      token,
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
      },
    );

    if (!res.ok) {
      throw new Error("소재 교체 예약에 실패했습니다.");
    }

    await refreshCncMachineMeta();
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
      },
    );

    if (!res.ok) {
      throw new Error("소재 교체 예약 취소에 실패했습니다.");
    }

    await refreshCncMachineMeta();
  };

  const handleReplaceMaterial = async (next: {
    materialType: string;
    heatNo: string;
    diameter: number;
    diameterGroup: "6" | "8" | "10" | "10+";
    remainingLength: number;
  }) => {
    if (!materialModalTarget || !token) return;
    const res = await fetch(
      `/api/cnc-machines/${encodeURIComponent(
        materialModalTarget.uid,
      )}/material`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(next),
      },
    );
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || body?.success === false) {
      throw new Error(body?.message || "소재교체에 실패했습니다.");
    }
    await refreshCncMachineMeta();
  };

  const handleAddMaterial = async (next: { remainingLength: number }) => {
    if (!materialModalTarget || !token) return;
    const res = await fetch(
      `/api/cnc-machines/${encodeURIComponent(
        materialModalTarget.uid,
      )}/material-remaining`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(next),
      },
    );
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || body?.success === false) {
      throw new Error(body?.message || "소재추가에 실패했습니다.");
    }
    await refreshCncMachineMeta();
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
                machines={mergedMachines}
                workUid={workUid}
                loading={loading}
                tempTooltipMap={tempTooltipMap}
                toolTooltipMap={toolTooltipMap}
                programSummary={programSummary}
                reservationJobsMap={reservationJobsMap}
                reservationSummaryMap={reservationSummaryMap}
                reservationTotalQtyMap={reservationTotalQtyMap}
                onUploadFiles={(machine, files) => {
                  void (async () => {
                    try {
                      await uploadLocalFiles(machine.uid, files);
                      await loadBridgeQueueForMachine(machine);
                      toast({
                        title: "업로드 완료",
                        description: "예약목록에 추가되었습니다.",
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
                onOpenMaterial={(machine) => {
                  setMaterialModalTarget(machine);
                  setMaterialModalOpen(true);
                }}
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
                onOpenProgramDetail={(prog) => {
                  void openProgramDetail(prog);
                }}
                onSendControl={(uid, action) => {
                  if (action === "reset") {
                    const target = machines.find((m) => m.uid === uid) || null;
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
                  setPlaylistTarget(machine);
                  void loadQueueForMachine(machine).finally(() => {
                    setPlaylistOpen(true);
                  });
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
                      0,
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

                  const currentJobs = reservationJobsMap?.[uid] || [];
                  const targetJob = currentJobs.find((j) => j.id === jobId);
                  if (!targetJob) return;

                  const wasPaused = !!targetJob.paused;
                  const nextPaused = !wasPaused;

                  setReservationJobsMap((prev) => {
                    const current = prev[uid] || [];
                    const nextJobs = current.map((j) =>
                      j.id === jobId ? { ...j, paused: nextPaused } : j,
                    );
                    return {
                      ...prev,
                      [uid]: nextJobs,
                    };
                  });

                  // 일시정지 → 재생으로 전환될 때만 실제 생산 시작 명령을 보낸다.
                  if (!(wasPaused && !nextPaused)) return;

                  const ok = await ensureCncWriteAllowed();
                  if (!ok) {
                    setReservationJobsMap((prev) => {
                      const current = prev[uid] || [];
                      const nextJobs = current.map((j) =>
                        j.id === jobId ? { ...j, paused: wasPaused } : j,
                      );
                      return {
                        ...prev,
                        [uid]: nextJobs,
                      };
                    });
                    return;
                  }

                  const programNoRaw = (targetJob as any)?.programNo ?? null;
                  const programNo = Number(programNoRaw);
                  if (!Number.isFinite(programNo) || programNo <= 0) {
                    const msg =
                      "프로그램 번호가 없어 생산을 시작할 수 없습니다. (예약 등록 시 프로그램 번호를 확인해 주세요.)";
                    setError(msg);
                    toast({
                      title: "생산 시작 실패",
                      description: msg,
                      variant: "destructive",
                    });
                    setReservationJobsMap((prev) => {
                      const current = prev[uid] || [];
                      const nextJobs = current.map((j) =>
                        j.id === jobId ? { ...j, paused: wasPaused } : j,
                      );
                      return {
                        ...prev,
                        [uid]: nextJobs,
                      };
                    });
                    return;
                  }

                  try {
                    // 1) NC 프로그램 로드(활성화)
                    const actRes = await callRaw(uid, "SetActivateProgram", {
                      headType: 1,
                      programNo,
                    });
                    const actOk =
                      actRes &&
                      actRes.success !== false &&
                      (actRes.result == null || actRes.result === 0);
                    if (!actOk) {
                      const msg =
                        actRes?.message ||
                        actRes?.error ||
                        "프로그램 로드 실패 (SetActivateProgram)";
                      throw new Error(msg);
                    }

                    // 2) 가공 시작
                    const res = await apiFetch({
                      path: `/api/machines/${encodeURIComponent(uid)}/start`,
                      method: "POST",
                      token,
                    });

                    if (!res.ok) {
                      throw new Error("가공 시작 실패");
                    }

                    void refreshStatusFor(uid);
                  } catch (e: any) {
                    const msg = e?.message ?? "가공 시작 요청 중 오류";
                    setError(msg);
                    toast({
                      title: "가공 시작 오류",
                      description: msg,
                      variant: "destructive",
                    });

                    // 실패 시 UI 상태 원복
                    setReservationJobsMap((prev) => {
                      const current = prev[uid] || [];
                      const nextJobs = current.map((j) =>
                        j.id === jobId ? { ...j, paused: wasPaused } : j,
                      );
                      return {
                        ...prev,
                        [uid]: nextJobs,
                      };
                    });
                  }
                }}
                onOpenReservationList={(machine) => {
                  setPlaylistTarget(machine);
                  void loadQueueForMachine(machine).finally(() => {
                    setPlaylistOpen(true);
                  });
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
          onClose={() => {
            setPlaylistOpen(false);
            setPlaylistTarget(null);
            setPlaylistReadOnly(false);
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
              headType: 0,
            };
            void openProgramDetail(prog);
          }}
          onDelete={(jobId) => {
            const m = playlistTarget;
            if (!m || !token) return;
            const uid = m.uid;
            void (async () => {
              try {
                const res = await fetch(
                  `/api/cnc-machines/${encodeURIComponent(
                    uid,
                  )}/bridge-queue/${encodeURIComponent(jobId)}`,
                  {
                    method: "DELETE",
                    headers: {
                      Authorization: `Bearer ${token}`,
                    },
                  },
                );
                const body: any = await res.json().catch(() => ({}));
                if (!res.ok || body?.success === false) {
                  throw new Error(
                    body?.message ||
                      body?.error ||
                      "예약 작업 삭제 중 오류가 발생했습니다.",
                  );
                }
                await loadBridgeQueueForMachine(m);
                toast({
                  title: "예약 취소",
                  description:
                    "선택한 생산 예약이 취소되고 CAM 단계로 되돌렸습니다.",
                });
              } catch (e: any) {
                const msg =
                  e?.message ||
                  "예약 작업 삭제 중 알 수 없는 오류가 발생했습니다.";
                setError(msg);
                toast({
                  title: "예약 취소 실패",
                  description: msg,
                  variant: "destructive",
                });
              }
            })();
          }}
          onReorder={(nextOrder) => {
            const m = playlistTarget;
            if (!m || !token) return;
            const uid = m.uid;
            void (async () => {
              try {
                const res = await fetch(
                  `/api/cnc-machines/${encodeURIComponent(uid)}/bridge-queue/reorder`,
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
                    body?.message || body?.error || "예약 순서 변경 실패",
                  );
                }
                await loadBridgeQueueForMachine(m);
              } catch (e: any) {
                const msg = e?.message || "예약 순서 변경 중 오류";
                setError(msg);
                toast({
                  title: "순서 변경 실패",
                  description: msg,
                  variant: "destructive",
                });
              }
            })();
          }}
          onChangeQty={(jobId, qty) => {
            const m = playlistTarget;
            if (!m || !token) return;
            const uid = m.uid;
            void (async () => {
              try {
                const res = await fetch(
                  `/api/cnc-machines/${encodeURIComponent(
                    uid,
                  )}/bridge-queue/${encodeURIComponent(jobId)}/qty`,
                  {
                    method: "PATCH",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ qty }),
                  },
                );
                const body: any = await res.json().catch(() => ({}));
                if (!res.ok || body?.success === false) {
                  throw new Error(
                    body?.message || body?.error || "수량 변경 실패",
                  );
                }
                await loadBridgeQueueForMachine(m);
              } catch (e: any) {
                const msg = e?.message || "수량 변경 중 오류";
                setError(msg);
                toast({
                  title: "수량 변경 실패",
                  description: msg,
                  variant: "destructive",
                });
              }
            })();
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

        <CncMachineInfoModal
          open={machineInfoOpen}
          loading={machineInfoLoading}
          error={machineInfoError}
          clearing={machineInfoClearing}
          programInfo={machineInfoProgram}
          alarms={machineInfoAlarms}
          onClearAlarms={clearMachineAlarms}
          onRequestClose={() => setMachineInfoOpen(false)}
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
          onReplace={handleReplaceMaterial}
          onAdd={handleAddMaterial}
        />
      </main>
    </div>
  );
};
