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
import type { HealthLevel } from "@/pages/manufacturer/cnc/components/MachineCard";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Plus, FileText, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { useCncWriteGuard } from "@/pages/manufacturer/cnc/hooks/useCncWriteGuard";
import { CncProgramEditorPanel } from "@/pages/manufacturer/cnc/components/CncProgramEditorPanel";
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
import { useCncProgramEditor } from "@/pages/manufacturer/cnc/hooks/useCncProgramEditor";
import { CncMaterialChangeModal } from "@/pages/manufacturer/cnc/components/CncMaterialChangeModal";
import {
  CncMaterialModal,
  type CncMaterialInfo,
} from "@/pages/manufacturer/cnc/components/CncMaterialModal";
import { CncEventLogModal } from "@/components/CncEventLogModal";

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
        dummySettings?: {
          enabled?: boolean;
          programName?: string;
          schedules?: any[];
          excludeHolidays?: boolean;
        };
        maxModelDiameterGroups?: ("6" | "8" | "10" | "10+")[];
      }
    >
  >({});

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

  const { toast } = useToast();
  const { ensureCncWriteAllowed, PinModal } = useCncWriteGuard();

  const handleManualCardPlay = useCallback(
    async (machineId: string) => {
      const mid = String(machineId || "").trim();
      if (!mid) return;
      if (!token) {
        toast({
          title: "로그인이 필요합니다",
          description: "다시 로그인 후 시도해 주세요.",
          variant: "destructive",
        });
        return;
      }

      const ok = await ensureCncWriteAllowed();
      if (!ok) {
        toast({
          title: "가공 시작 불가",
          description: "CNC 가공 시작은 제조사 권한/PIN 확인이 필요합니다.",
          variant: "destructive",
        });
        return;
      }

      const res = await apiFetch({
        path: `/api/cnc-machines/${encodeURIComponent(mid)}/manual-file/play`,
        method: "POST",
        token,
      });
      const body: any = res.data ?? {};
      if (!res.ok || body?.success === false) {
        throw new Error(body?.message || body?.error || "가공 시작 실패");
      }

      const data = body?.data ?? body;
      const slotNo = data?.slotNo;
      toast({
        title: "가공 시작",
        description: slotNo
          ? `O${slotNo} 가공을 시작했습니다.`
          : "가공을 시작했습니다.",
      });
    },
    [ensureCncWriteAllowed, toast, token],
  );

  const queueBatchRef = useRef<{
    t: any | null;
    machineId: string | null;
    order: string[] | null;
    qtyByJobId: Record<string, number>;
    deleteJobIds: Set<string>;
  }>({
    t: null,
    machineId: null,
    order: null,
    qtyByJobId: {},
    deleteJobIds: new Set(),
  });

  const queueCommitSeqRef = useRef<Record<string, number>>({});

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
        maxModelDiameterGroups?: ("6" | "8" | "10" | "10+")[];
      }
    > = {};
    for (const item of list) {
      const machineId = String(item?.machineId || "");
      if (!machineId) continue;
      nextMap[machineId] = {
        currentMaterial: item?.currentMaterial || undefined,
        scheduledMaterialChange: item?.scheduledMaterialChange || undefined,
        dummySettings: item?.dummySettings || undefined,
        maxModelDiameterGroups: Array.isArray(item?.maxModelDiameterGroups)
          ? item.maxModelDiameterGroups
          : undefined,
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
        maxModelDiameterGroups:
          meta.maxModelDiameterGroups || m.maxModelDiameterGroups,
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

  const [worksheetQueueCountMap, setWorksheetQueueCountMap] = useState<
    Record<string, number>
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
        const metaSource = String(body?.meta?.source || "").trim();
        const jobs: CncJobItem[] = list.map((job) => {
          const jobSourceRaw = String(job?.source || "").trim();
          const pausedRaw = job?.paused;
          const paused = typeof pausedRaw === "boolean" ? pausedRaw : true;
          const kindRaw = String(job?.kind || "").trim();
          const bridgePath = String(
            job?.bridgePath || job?.bridge_store_path || job?.path || "",
          ).trim();
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
          const id = String(job?.id || `${uid}:${nameRaw}`);
          return {
            id,
            jobId: id as any,
            source:
              metaSource === "db"
                ? "db"
                : jobSourceRaw === "manual_insert"
                  ? "manual_insert"
                  : "bridge",
            kind:
              kindRaw ||
              (jobSourceRaw === "manual_insert" ? "manual_file" : ""),
            programNo,
            name: String(nameRaw || "-"),
            qty,
            paused,
            ...(job?.s3Key ? { s3Key: String(job.s3Key) } : {}),
            ...(job?.s3Bucket ? { s3Bucket: String(job.s3Bucket) } : {}),
            ...(bridgePath ? { bridgePath } : {}),
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

  const uploadManualCardFiles = useCallback(
    async (machineId: string, files: FileList | File[]) => {
      const mid = String(machineId || "").trim();
      if (!mid) throw new Error("장비 ID가 올바르지 않습니다.");
      if (!token) throw new Error("로그인이 필요합니다.");

      const list = Array.isArray(files) ? files : Array.from(files || []);
      if (list.length === 0) return;

      // 장비카드는 1개 파일만 처리(프리로드 슬롯 토글을 단순화)
      const file = list[0];
      if (!file) return;

      const ok = await ensureCncWriteAllowed();
      if (!ok) {
        toast({
          title: "업로드 불가",
          description: "CNC 업로드는 제조사 권한/PIN 확인이 필요합니다.",
          variant: "destructive",
        });
        return;
      }

      const form = new FormData();
      form.append("file", file);

      const res = await apiFetch({
        path: `/api/cnc-machines/${encodeURIComponent(mid)}/manual-file/upload`,
        method: "POST",
        token,
        body: form,
        headers: {},
      });

      const body: any = res.data ?? {};
      if (!res.ok || body?.success === false) {
        throw new Error(
          body?.message || body?.error || "장비카드 업로드에 실패했습니다.",
        );
      }

      const data = body?.data ?? body;
      const slotNo = data?.slotNo;
      toast({
        title: "업로드 완료",
        description: slotNo
          ? `CNC 슬롯 O${slotNo}에 업로드되었습니다.`
          : "업로드되었습니다.",
      });

      const m = machines.find((x) => x?.uid === mid) || null;
      if (m) {
        await loadBridgeQueueForMachine(m, { silent: true });
      }
    },
    [ensureCncWriteAllowed, loadBridgeQueueForMachine, machines, toast, token],
  );

  const refreshDbQueuesForAllMachines = useCallback(async () => {
    if (!token) return;
    const list = Array.isArray(machines) ? machines : [];
    if (list.length === 0) return;

    try {
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

      const nextWorksheetCountMap: Record<string, number> = {};

      for (const m of list) {
        const uid = String(m?.uid || "").trim();
        if (!uid) continue;

        const raw: any[] = Array.isArray(map?.[uid]) ? map[uid] : [];
        const filtered = raw.filter((it) => {
          const s = String(it?.status || "").trim();
          return s === "생산" || s === "가공";
        });

        nextWorksheetCountMap[uid] = filtered.length;
      }

      setWorksheetQueueCountMap((prev) => ({
        ...prev,
        ...nextWorksheetCountMap,
      }));
    } catch {
      // ignore (UI에서는 기존 값 유지)
    }
  }, [machines, token]);

  useEffect(() => {
    if (!token) return;
    const list = Array.isArray(machines) ? machines : [];
    if (list.length === 0) return;
    void refreshDbQueuesForAllMachines();
  }, [machines, refreshDbQueuesForAllMachines, token]);

  const refreshBridgeQueuesForAllMachines = useCallback(async () => {
    if (!token) return;
    const list = Array.isArray(machines) ? machines : [];
    if (list.length === 0) return;
    await Promise.all(
      list.map((m) => loadBridgeQueueForMachine(m, { silent: true })),
    ).catch(() => {});
  }, [loadBridgeQueueForMachine, machines, token]);

  useEffect(() => {
    if (!token) return;
    const list = Array.isArray(machines) ? machines : [];
    if (list.length === 0) return;
    void refreshBridgeQueuesForAllMachines();
  }, [machines, refreshBridgeQueuesForAllMachines, token]);

  const loadQueueForMachine = useCallback(
    async (machine: Machine) => {
      try {
        await loadBridgeQueueForMachine(machine);
        setPlaylistReadOnly(false);
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
    },
    [loadBridgeQueueForMachine, setError, toast],
  );

  const scheduleQueueBatchCommit = useCallback(
    (machineId: string) => {
      if (!token) return;
      if (!machineId) return;
      const ref = queueBatchRef.current;
      ref.machineId = machineId;
      if (ref.t) {
        clearTimeout(ref.t);
        ref.t = null;
      }
      ref.t = setTimeout(() => {
        void (async () => {
          const commitMachineId = String(
            ref.machineId || machineId || "",
          ).trim();
          if (!commitMachineId) return;

          const nextSeq = (queueCommitSeqRef.current[commitMachineId] || 0) + 1;
          queueCommitSeqRef.current[commitMachineId] = nextSeq;

          const payload = {
            order: ref.order,
            qtyUpdates: Object.entries(ref.qtyByJobId).map(([jobId, qty]) => ({
              jobId,
              qty,
            })),
            deleteJobIds: Array.from(ref.deleteJobIds),
          };

          // reset first (allow new batch while request in-flight)
          ref.order = null;
          ref.qtyByJobId = {};
          ref.deleteJobIds = new Set();
          ref.t = null;

          try {
            const res = await fetch(
              `/api/cnc-machines/${encodeURIComponent(
                commitMachineId,
              )}/bridge-queue/batch`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
              },
            );
            const body: any = await res.json().catch(() => ({}));
            if (!res.ok || body?.success === false) {
              throw new Error(body?.message || body?.error || "예약 변경 실패");
            }

            const currentSeq = queueCommitSeqRef.current[commitMachineId] || 0;
            if (currentSeq !== nextSeq) return;

            const m = machines.find((x) => x?.uid === commitMachineId) || null;
            if (m) {
              await loadBridgeQueueForMachine(m, { silent: true });
            }
          } catch (e: any) {
            const msg = e?.message || "예약 변경 중 오류";
            setError(msg);
            toast({
              title: "예약 변경 실패",
              description: msg,
              variant: "destructive",
            });
          }
        })();
      }, 700);
    },
    [
      token,
      toast,
      setError,
      queueBatchRef,
      queueCommitSeqRef,
      machines,
      loadBridgeQueueForMachine,
      setReservationJobsMap,
      setReservationSummaryMap,
      setReservationTotalQtyMap,
    ],
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

  const globalDummyEnabled = useMemo(() => {
    const list = Array.isArray(machines) ? machines : [];
    if (list.length === 0) return false;
    return list.every(
      (m) => cncMachineMetaMap[m.uid]?.dummySettings?.enabled !== false,
    );
  }, [cncMachineMetaMap, machines]);

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

  const setGlobalDummyEnabled = useCallback(
    (enabled: boolean) => {
      if (!token) return;

      const list = Array.isArray(machines) ? machines : [];
      if (list.length === 0) return;

      const prevMap = new Map(
        list.map((m) => [
          m.uid,
          cncMachineMetaMap[m.uid]?.dummySettings?.enabled !== false,
        ]),
      );
      const baselineEnabled = globalDummyEnabled;

      setCncMachineMetaMap((prev) => {
        const next = { ...prev };
        for (const m of list) {
          const existing = next[m.uid] || {};
          next[m.uid] = {
            ...existing,
            dummySettings: {
              ...(existing as any).dummySettings,
              enabled,
            },
          } as any;
        }
        return next;
      });

      scheduleDebounced("global:dummy", enabled, baselineEnabled, () => {
        void (async () => {
          try {
            for (const m of list) {
              const res = await fetch(
                `/api/cnc-machines/${encodeURIComponent(m.uid)}/dummy-settings`,
                {
                  method: "PATCH",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({ enabled }),
                },
              );
              const body: any = await res.json().catch(() => ({}));
              if (!res.ok || body?.success === false) {
                throw new Error(
                  body?.message || "전체 더미 가공 설정 저장 실패",
                );
              }
            }
            await refreshCncMachineMeta();
          } catch (e: any) {
            setCncMachineMetaMap((prev) => {
              const next = { ...prev };
              for (const m of list) {
                const existing = next[m.uid] || {};
                next[m.uid] = {
                  ...existing,
                  dummySettings: {
                    ...(existing as any).dummySettings,
                    enabled: prevMap.get(m.uid) !== false,
                  },
                } as any;
              }
              return next;
            });
            toast({
              title: "전체 더미 가공 설정 실패",
              description: e?.message || "잠시 후 다시 시도해주세요.",
              variant: "destructive",
            });
          }
        })();
      });
    },
    [
      cncMachineMetaMap,
      globalDummyEnabled,
      machines,
      refreshCncMachineMeta,
      scheduleDebounced,
      toast,
      token,
    ],
  );

  const updateMachineDummyEnabled = useCallback(
    (machineId: string, enabled: boolean) => {
      const uid = String(machineId || "").trim();
      if (!uid || !token) return;

      const prevEnabled =
        cncMachineMetaMap[uid]?.dummySettings?.enabled !== false;

      setCncMachineMetaMap((prev) => {
        const next = { ...prev };
        const existing = next[uid] || {};
        next[uid] = {
          ...existing,
          dummySettings: {
            ...(existing as any).dummySettings,
            enabled,
          },
        } as any;
        return next;
      });

      scheduleDebounced(
        `machine:${uid}:dummyEnabled`,
        enabled,
        prevEnabled,
        () => {
          void (async () => {
            try {
              const res = await fetch(
                `/api/cnc-machines/${encodeURIComponent(uid)}/dummy-settings`,
                {
                  method: "PATCH",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({ enabled }),
                },
              );
              const body: any = await res.json().catch(() => ({}));
              if (!res.ok || body?.success === false) {
                throw new Error(body?.message || "더미 가공 설정 저장 실패");
              }
              await refreshCncMachineMeta();
            } catch (e: any) {
              setCncMachineMetaMap((prev) => {
                const next = { ...prev };
                const existing = next[uid] || {};
                next[uid] = {
                  ...existing,
                  dummySettings: {
                    ...(existing as any).dummySettings,
                    enabled: prevEnabled,
                  },
                } as any;
                return next;
              });
              toast({
                title: "설정 저장 실패",
                description: e?.message || "잠시 후 다시 시도해주세요.",
                variant: "destructive",
              });
            }
          })();
        },
      );
    },
    [
      cncMachineMetaMap,
      refreshCncMachineMeta,
      scheduleDebounced,
      setCncMachineMetaMap,
      toast,
      token,
    ],
  );

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

  const handleBackgroundRefresh = useCallback(() => {
    void refreshDbQueuesForAllMachines();
    coreHandleBackgroundRefresh();
  }, [coreHandleBackgroundRefresh, refreshDbQueuesForAllMachines]);

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
    maxModelDiameterGroups: ("6" | "8" | "10" | "10+")[];
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
            {/* 여기 아래부터는 장비 카드 그리드 */}
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
                  onToggleAllowJobStart={(machine, next) => {
                    updateMachineFlags(machine, { allowJobStart: next });
                  }}
                  onToggleDummyMachining={(machine, next) => {
                    updateMachineDummyEnabled(machine.uid, next);
                  }}
                  onUploadFiles={(machine, files) => {
                    void (async () => {
                      try {
                        // 장비카드 업로드는 즉시 CNC 메모리(O4000/O4001)에 프리로드한다.
                        await uploadManualCardFiles(machine.uid, files);
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
                      setWorkUid(uid);
                    }
                    if (isConfigured) {
                      void refreshStatusFor(uid);
                      void fetchProgramList();
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

                    setReservationJobsMap((prev) => {
                      const jobs = prev[uid] || [];
                      const filtered = jobId
                        ? jobs.filter((j) => j.id !== jobId)
                        : jobs.slice(1);

                      setReservationSummaryMap((prevSummary) => {
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

                      setReservationTotalQtyMap((prevTotal) => {
                        const total = filtered.reduce(
                          (sum, j) => sum + (j.qty || 1),
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
                    if (!jobId) return;
                    const uid = machine.uid;

                    const currentJobs = reservationJobsMap?.[uid] || [];
                    const targetJob = currentJobs.find((j) => j.id === jobId);
                    if (!targetJob) return;

                    const kind = String((targetJob as any)?.kind || "").trim();
                    const source = String(
                      (targetJob as any)?.source || "",
                    ).trim();
                    if (kind === "manual_file" || source === "manual_insert") {
                      await handleManualCardPlay(uid);
                      return;
                    }

                    const wasPaused = !!targetJob.paused;
                    // pause(일시정지)로 전환이면 여기서 처리하고 종료
                    if (!wasPaused) {
                      setReservationJobsMap((prev) => {
                        const current = prev[uid] || [];
                        const nextJobs = current.map((j) =>
                          j.id === jobId ? { ...j, paused: true } : j,
                        );
                        return {
                          ...prev,
                          [uid]: nextJobs,
                        };
                      });

                      try {
                        const pauseRes = await apiFetch({
                          path: `/api/cnc-machines/${encodeURIComponent(uid)}/bridge-queue/${encodeURIComponent(
                            jobId,
                          )}/pause`,
                          method: "PATCH",
                          token,
                          jsonBody: { paused: true },
                        });
                        const pauseBody: any = pauseRes.data ?? {};
                        if (!pauseRes.ok || pauseBody?.success === false) {
                          throw new Error(
                            pauseBody?.message ||
                              pauseBody?.error ||
                              "일시정지 상태 저장 실패",
                          );
                        }
                      } catch (e: any) {
                        const msg = e?.message ?? "일시정지 변경 중 오류";
                        setError(msg);
                        toast({
                          title: "일시정지 변경 실패",
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
                      }
                      return;
                    }

                    const ok = await ensureCncWriteAllowed();
                    if (!ok) {
                      return;
                    }

                    try {
                      // 1.5) Alarm 상태면 시작을 막고 사용자에게 원인을 안내한다.
                      try {
                        const [statusRes, alarmRes] = await Promise.all([
                          apiFetch({
                            path: `/api/machines/${encodeURIComponent(uid)}/status`,
                            method: "GET",
                            token,
                          }),
                          apiFetch({
                            path: `/api/machines/${encodeURIComponent(uid)}/alarm`,
                            method: "POST",
                            token,
                            jsonBody: { headType: 0 },
                          }),
                        ]);

                        const statusBody: any = statusRes.data ?? {};
                        const machineStatus = String(
                          statusBody?.status ?? statusBody?.data?.status ?? "",
                        ).trim();
                        const isAlarm =
                          machineStatus.toLowerCase() === "alarm" ||
                          machineStatus.toLowerCase().includes("alarm");

                        const alarmBody: any = alarmRes.data ?? {};
                        const alarmData =
                          alarmBody?.data != null ? alarmBody.data : alarmBody;
                        const alarms: any[] = Array.isArray(alarmData?.alarms)
                          ? alarmData.alarms
                          : [];

                        if (isAlarm || alarms.length > 0) {
                          const alarmText =
                            alarms.length > 0
                              ? alarms
                                  .map((a) =>
                                    a
                                      ? `type ${a.type ?? "?"} / no ${a.no ?? "?"}`
                                      : "-",
                                  )
                                  .join(", ")
                              : "-";
                          throw new Error(
                            `장비가 Alarm 상태입니다. (${alarmText})`,
                          );
                        }
                      } catch (e: any) {
                        const msg =
                          e?.message ||
                          "장비 상태가 Alarm이라 가공을 시작할 수 없습니다.";
                        toast({
                          title: "가공 시작 불가 (알람)",
                          description: msg,
                          variant: "destructive",
                        });

                        return;
                      }

                      const res = await apiFetch({
                        path: `/api/machines/${encodeURIComponent(uid)}/start`,
                        method: "POST",
                        token,
                      });

                      const startBody: any = res.data ?? {};
                      if (!res.ok || startBody?.success === false) {
                        throw new Error(
                          startBody?.message ||
                            startBody?.error ||
                            "가공 시작 실패",
                        );
                      }

                      // 2) 브리지/장비가 실제로 시작됐는지(=Now Playing/active program이 뜨는지) 짧게 검증한다.
                      let verified = false;
                      let lastVerifyError: string | null = null;
                      for (let i = 0; i < 6; i += 1) {
                        try {
                          const activeRes = await apiFetch({
                            path: `/api/cnc-machines/${encodeURIComponent(uid)}/programs/active`,
                            method: "GET",
                            token,
                          });
                          const activeBody: any = activeRes.data ?? {};
                          const activeData =
                            activeBody?.data != null
                              ? activeBody.data
                              : activeBody;
                          if (
                            activeRes.ok &&
                            activeBody?.success !== false &&
                            (activeData?.programNo != null ||
                              activeData?.no != null ||
                              String(activeData?.name || "").trim().length > 0)
                          ) {
                            verified = true;
                            break;
                          }
                          if (activeBody?.message) {
                            lastVerifyError = String(activeBody.message);
                          }
                        } catch (e: any) {
                          lastVerifyError = e?.message || null;
                        }

                        await new Promise((r) => setTimeout(r, 500));
                      }

                      if (!verified) {
                        throw new Error(
                          lastVerifyError ||
                            "가공이 시작되지 않았습니다. (Now Playing 확인 실패)",
                        );
                      }

                      // 2) 성공 시 UI에서 Next Up을 제거(=Now Playing으로 넘어간 것처럼 표시)하고 갱신한다.
                      setReservationJobsMap((prev) => {
                        const current = prev[uid] || [];
                        const filtered = current.filter((j) => j.id !== jobId);
                        if (filtered.length === 0) {
                          const nextMap = { ...prev };
                          delete nextMap[uid];
                          return nextMap;
                        }
                        return { ...prev, [uid]: filtered };
                      });

                      void refreshStatusFor(uid);
                    } catch (e: any) {
                      const msg = e?.message ?? "가공 시작 요청 중 오류";
                      setError(msg);
                      toast({
                        title: "가공 시작 오류",
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

                      // DB(SSOT)도 원복(best-effort)
                      try {
                        await apiFetch({
                          path: `/api/cnc-machines/${encodeURIComponent(uid)}/bridge-queue/${encodeURIComponent(
                            jobId,
                          )}/pause`,
                          method: "PATCH",
                          token,
                          jsonBody: { paused: true },
                        });
                      } catch {
                        // ignore
                      }
                    }
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
              headType: 0,
            };
            void openProgramDetail(prog, m.uid);
          }}
          onDelete={(jobId) => {
            const m = playlistTarget;
            if (!m || !token) return;
            const uid = m.uid;
            queueBatchRef.current.machineId = uid;
            queueBatchRef.current.deleteJobIds.add(jobId);
            scheduleQueueBatchCommit(uid);
          }}
          onReorder={(nextOrder) => {
            const m = playlistTarget;
            if (!m || !token) return;
            const uid = m.uid;
            queueBatchRef.current.machineId = uid;
            queueBatchRef.current.order = nextOrder;
            scheduleQueueBatchCommit(uid);
          }}
          onChangeQty={(jobId, qty) => {
            const m = playlistTarget;
            if (!m || !token) return;
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
          maxModelDiameterGroups={
            (materialModalTarget?.maxModelDiameterGroups as any) || ["10+"]
          }
          onReplace={handleReplaceMaterial}
          onAdd={handleAddMaterial}
        />
      </main>
    </div>
  );
};
