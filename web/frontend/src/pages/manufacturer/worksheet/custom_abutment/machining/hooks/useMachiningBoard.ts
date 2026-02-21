import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useToast } from "@/shared/hooks/use-toast";
import {
  initializeSocket,
  onCncMachiningCompleted,
  onCncMachiningTick,
  onCncMachiningStarted,
} from "@/shared/realtime/socket";
import { apiFetch } from "@/shared/api/apiClient";
import { getMockCncMachiningEnabled } from "@/shared/bridge/bridgeSettings";
import { useCncMachines } from "@/features/manufacturer/cnc/hooks/useCncMachines";
import { useCncProgramEditor } from "@/features/manufacturer/cnc/hooks/useCncProgramEditor";
import { useCncRaw } from "@/features/manufacturer/cnc/hooks/useCncRaw";
import { useMachineStatusStore } from "@/store/useMachineStatusStore";
import type { PlaylistJobItem } from "@/pages/manufacturer/equipment/cnc/components/CncPlaylistDrawer";
import type {
  QueueItem,
  QueueMap,
  LastCompletedMachining,
  NowPlayingHint,
  MachineStatus,
} from "../types";
import { formatMachiningLabel } from "../utils/label";
import { useCncDashboardMaterials } from "@/pages/manufacturer/equipment/cnc/hooks/useCncDashboardMaterials";

const isMachiningStatus = (status?: string) => {
  const s = String(status || "").trim();
  return s === "생산" || s === "가공";
};

const resolveCompletedDisplayLabel = (q: QueueItem | null) => {
  if (!q) return "-";
  return formatMachiningLabel(q);
};

export const useMachiningBoard = ({
  token,
}: {
  token: string | null | undefined;
}) => {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const { machines, setMachines } = useCncMachines();
  const { callRaw } = useCncRaw();
  const statusByUid = useMachineStatusStore((s) => s.statusByUid);
  const refreshStatuses = useMachineStatusStore((s) => s.refresh);

  const [isMockFromBackend, setIsMockFromBackend] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const enabled = await getMockCncMachiningEnabled(token);
        if (enabled === true) setIsMockFromBackend(true);
        else if (enabled === false) setIsMockFromBackend(false);
      } catch {
        // ignore
      }
    })();
  }, [token]);

  const [loading, setLoading] = useState(false);

  const [queueMap, setQueueMap] = useState<QueueMap>({});
  const queueMapRef = useRef<QueueMap>({});
  useEffect(() => {
    queueMapRef.current = queueMap;
  }, [queueMap]);

  const [machineStatusMap] = useState<Record<string, MachineStatus>>({});

  const [machiningElapsedSecondsMap, setMachiningElapsedSecondsMap] = useState<
    Record<string, number>
  >({});
  const machiningElapsedBaseRef = useRef<
    Record<string, { elapsedSeconds: number; tickAtMs: number }>
  >({});

  const [lastCompletedMap, setLastCompletedMap] = useState<
    Record<string, LastCompletedMachining>
  >({});

  const [nowPlayingHintMap, setNowPlayingHintMap] = useState<
    Record<string, NowPlayingHint>
  >({});

  const reconcileMachiningTimersFromQueues = useCallback((map: QueueMap) => {
    const nextBases: Record<
      string,
      { elapsedSeconds: number; tickAtMs: number }
    > = {
      ...machiningElapsedBaseRef.current,
    };
    const nextSecondsFromQueues: Record<string, number> = {};
    const nextHintsFromQueues: Record<string, NowPlayingHint> = {};

    for (const [midRaw, listRaw] of Object.entries(map || {})) {
      const mid = String(midRaw || "").trim();
      if (!mid) continue;
      const list = Array.isArray(listRaw) ? listRaw : [];
      const running = list.find((it: any) => {
        const rec = it?.machiningRecord;
        if (!rec || typeof rec !== "object") return false;
        const st = String(rec?.status || "")
          .trim()
          .toUpperCase();
        if (st === "RUNNING") return true;
        const startedAt = rec?.startedAt
          ? new Date(rec.startedAt).getTime()
          : 0;
        const completedAt = rec?.completedAt
          ? new Date(rec.completedAt).getTime()
          : 0;
        return startedAt > 0 && completedAt <= 0;
      });

      if (!running) {
        delete nextBases[mid];
        continue;
      }

      const rec = (running as any)?.machiningRecord || {};
      const startedAtMs = rec?.startedAt
        ? new Date(rec.startedAt).getTime()
        : 0;
      const baseElapsed =
        typeof rec?.elapsedSeconds === "number" && rec.elapsedSeconds >= 0
          ? Math.floor(rec.elapsedSeconds)
          : startedAtMs > 0
            ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000))
            : 0;

      nextBases[mid] = { elapsedSeconds: baseElapsed, tickAtMs: Date.now() };
      nextSecondsFromQueues[mid] = baseElapsed;

      const rid = String((running as any)?.requestId || "").trim();
      const jobId = rec?.jobId != null ? String(rec.jobId).trim() : null;
      nextHintsFromQueues[mid] = {
        machineId: mid,
        jobId,
        requestId: rid || null,
        bridgePath: null,
        startedAt: rec?.startedAt
          ? String(rec.startedAt)
          : new Date().toISOString(),
      };
    }

    machiningElapsedBaseRef.current = nextBases;
    setMachiningElapsedSecondsMap((prev) => ({
      ...prev,
      ...nextSecondsFromQueues,
    }));
    setNowPlayingHintMap((prev) => ({ ...prev, ...nextHintsFromQueues }));
  }, []);

  const refreshProductionQueues = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/cnc-machines/queues", {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) return;
      const map = body?.data && typeof body.data === "object" ? body.data : {};

      const normalized: QueueMap = {};
      Object.entries(map || {}).forEach(([mid, list]) => {
        const arr = Array.isArray(list) ? list : [];
        normalized[mid] = arr.map((item: any) => {
          const lotPart = String(
            item?.lotNumber?.part || item?.lotPart || item?.lotNumberPart || "",
          ).trim();
          const tooth = String(
            item?.tooth || item?.caseInfos?.tooth || "",
          ).trim();
          if (!lotPart && !tooth) return item;
          return {
            ...item,
            tooth: tooth || item?.tooth,
            lotNumber: lotPart
              ? {
                  ...(item?.lotNumber || {}),
                  part: lotPart,
                }
              : item?.lotNumber,
          } satisfies QueueItem;
        });
      });
      setQueueMap(normalized);
      reconcileMachiningTimersFromQueues(normalized);
    } catch {
      // ignore
    }
  }, [token, reconcileMachiningTimersFromQueues]);

  // 1초마다 로컬 타이머를 증가시켜 Now Playing 경과 시간을 표시한다.
  useEffect(() => {
    const id = window.setInterval(() => {
      const bases = machiningElapsedBaseRef.current || {};
      const now = Date.now();
      const updates: Record<string, number> = {};
      for (const [mid, base] of Object.entries(bases)) {
        if (!base || typeof base !== "object") continue;
        updates[mid] = Math.max(
          0,
          Math.floor(base.elapsedSeconds + (now - base.tickAtMs) / 1000),
        );
      }

      const keys = Object.keys(updates);
      if (!keys.length) return;
      setMachiningElapsedSecondsMap((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const k of keys) {
          if (next[k] !== updates[k]) {
            next[k] = updates[k];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const [statusRefreshing, setStatusRefreshing] = useState(false);
  const [statusRefreshedAt, setStatusRefreshedAt] = useState<string | null>(
    null,
  );
  const [statusRefreshError, setStatusRefreshError] = useState<string | null>(
    null,
  );
  const [statusRefreshErroredAt, setStatusRefreshErroredAt] = useState<
    string | null
  >("");

  const [eventLogRequestId, setEventLogRequestId] = useState<string | null>(
    null,
  );

  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [playlistMachineId, setPlaylistMachineId] = useState<string>("");
  const [playlistTitle, setPlaylistTitle] = useState<string>("");
  const [playlistJobs, setPlaylistJobs] = useState<PlaylistJobItem[]>([]);

  const [programEditorError, setProgramEditorError] = useState<string | null>(
    null,
  );
  const [workUid, setWorkUid] = useState<string>("");

  const [completedModalOpen, setCompletedModalOpen] = useState(false);
  const [completedModalMachineId, setCompletedModalMachineId] = useState("");
  const [completedModalTitle, setCompletedModalTitle] = useState<string>("");

  const [cncMachineMetaMap, setCncMachineMetaMap] = useState<
    Record<string, any>
  >({});

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    void (async () => {
      try {
        const res = await fetch("/api/cnc-machines", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body: any = await res.json().catch(() => ({}));
        if (!res.ok || body?.success === false) return;
        const list: any[] = Array.isArray(body?.data) ? body.data : [];
        const next: Record<string, any> = {};
        for (const item of list) {
          const machineId = String(item?.machineId || "");
          if (!machineId) continue;
          next[machineId] = item;
        }
        if (mounted) setCncMachineMetaMap(next);
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  const {
    materialModalOpen,
    setMaterialModalOpen,
    materialModalTarget,
    setMaterialModalTarget,
    handleReplaceMaterial,
    handleAddMaterial,
    refreshCncMachineMeta,
  } = useCncDashboardMaterials({ token, machines, setMachines, toast });

  const mergedMachines = useMemo(() => {
    return (machines || []).map((m: any) => {
      const meta = cncMachineMetaMap[m.uid];
      if (!meta) return m;
      return {
        ...m,
        currentMaterial: meta.currentMaterial || m.currentMaterial,
        scheduledMaterialChange:
          meta.scheduledMaterialChange || m.scheduledMaterialChange,
        maxModelDiameterGroups:
          meta.maxModelDiameterGroups || m.maxModelDiameterGroups,
        dummySettings: meta.dummySettings || m.dummySettings,
      };
    });
  }, [cncMachineMetaMap, machines]);

  const filteredMachines = useMemo(() => {
    return (mergedMachines || []).filter((m: any) => m.status !== "offline");
  }, [mergedMachines]);

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
    programSummary: null,
    callRaw,
    setError: setProgramEditorError,
    fetchProgramList: async () => {},
  });

  const loadProgramCodeForMachining = useCallback(
    async (prog: any) => {
      return loadProgramCode(prog);
    },
    [loadProgramCode],
  );

  const buildPlaylistJobsFromQueue = useCallback((raw: QueueItem[]) => {
    const jobs = (Array.isArray(raw) ? raw : [])
      .filter((q) => isMachiningStatus(q?.status))
      .map((q) => {
        const rid = String(q.requestId || "").trim();
        if (!rid) return null;
        const qty = Math.max(1, Number(q?.machiningQty ?? 1) || 1);
        const nc = q?.ncFile ?? null;
        const bridgePath = String(nc?.filePath || "").trim();
        const s3Key = String(nc?.s3Key || "").trim();
        const s3Bucket = String(nc?.s3Bucket || "").trim();
        return {
          id: rid,
          name: formatMachiningLabel(q),
          qty,
          bridgePath,
          s3Key,
          s3Bucket,
          requestId: rid,
          source: bridgePath ? "bridge_store" : s3Key ? "s3" : "db",
        } satisfies PlaylistJobItem;
      })
      .filter(Boolean) as PlaylistJobItem[];
    return jobs;
  }, []);

  const loadProductionQueueForMachine = useCallback(
    async (machineId: string, rawOverride?: QueueItem[]) => {
      const mid = String(machineId || "").trim();
      if (!mid) return;
      const raw = rawOverride ?? queueMap?.[mid] ?? [];
      setPlaylistJobs(buildPlaylistJobsFromQueue(raw));
    },
    [buildPlaylistJobsFromQueue, queueMap],
  );

  useEffect(() => {
    let mounted = true;
    if (!token) return;
    setLoading(true);
    void (async () => {
      try {
        await refreshProductionQueues();
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token, refreshProductionQueues]);

  const refreshLastCompletedFromServer = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/cnc-machines/machining/last-completed", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) return;
      const map =
        body?.data && typeof body.data === "object" ? (body.data as any) : {};
      setLastCompletedMap(map);
    } catch {
      // ignore
    }
  }, [token]);

  useEffect(() => {
    void refreshLastCompletedFromServer();
  }, [refreshLastCompletedFromServer]);

  // 가공 중에는 일정 주기로 queues/last-completed를 다시 불러와
  // 완료/큐 이동을 리프레시 없이 반영한다.
  useEffect(() => {
    if (!token) return;
    const hasActive =
      Object.keys(machiningElapsedBaseRef.current || {}).length > 0 ||
      Object.keys(nowPlayingHintMap || {}).length > 0;
    if (!hasActive) return;

    const id = window.setInterval(() => {
      void refreshProductionQueues();
      void refreshLastCompletedFromServer();
    }, 3000);

    return () => window.clearInterval(id);
  }, [
    token,
    nowPlayingHintMap,
    refreshLastCompletedFromServer,
    refreshProductionQueues,
  ]);

  useEffect(() => {
    if (!token) return;

    initializeSocket(token);

    const offStarted = onCncMachiningStarted((data: any) => {
      const mid = String(data?.machineId || "").trim();
      if (!mid) return;
      setNowPlayingHintMap((prev) => ({
        ...prev,
        [mid]: {
          machineId: mid,
          jobId: data?.jobId != null ? String(data.jobId).trim() : null,
          requestId:
            data?.requestId != null ? String(data.requestId).trim() : null,
          bridgePath:
            data?.bridgePath != null ? String(data.bridgePath).trim() : null,
          startedAt: String(data?.startedAt || new Date().toISOString()),
        },
      }));
      machiningElapsedBaseRef.current[mid] = {
        elapsedSeconds: 0,
        tickAtMs: Date.now(),
      };
      setMachiningElapsedSecondsMap((prev) => ({ ...prev, [mid]: 0 }));
      void refreshProductionQueues();
    });

    const offTick = onCncMachiningTick((data: any) => {
      const mid = String(data?.machineId || "").trim();
      if (!mid) return;
      const sec =
        typeof data?.elapsedSeconds === "number" && data.elapsedSeconds >= 0
          ? Math.floor(data.elapsedSeconds)
          : null;
      if (sec == null) return;
      machiningElapsedBaseRef.current[mid] = {
        elapsedSeconds: sec,
        tickAtMs: Date.now(),
      };
      setMachiningElapsedSecondsMap((prev) => ({ ...prev, [mid]: sec }));
    });

    const offCompleted = onCncMachiningCompleted((data: any) => {
      const mid = String(data?.machineId || "").trim();
      if (!mid) return;

      const rid = data?.requestId != null ? String(data.requestId).trim() : "";
      const jid = data?.jobId != null ? String(data.jobId).trim() : "";
      const jobs = Array.isArray(queueMapRef.current?.[mid])
        ? queueMapRef.current[mid]
        : [];
      const found = jobs.find((j) => {
        if (!j || typeof j !== "object") return false;
        const qRid = String((j as any)?.requestId || "").trim();
        if (rid && qRid === rid) return true;
        const qJobId = String((j as any)?.jobId || (j as any)?.id || "").trim();
        if (jid && qJobId === jid) return true;
        return false;
      });
      // 완료 시점에는 서버의 MachiningRecord 기반 "last-completed" 맵이
      // 가장 신뢰할 수 있는 데이터이므로, 별도 계산 대신 서버 맵을 다시 불러온다.
      void refreshLastCompletedFromServer();

      setNowPlayingHintMap((prev) => {
        const next = { ...prev };
        delete next[mid];
        return next;
      });

      delete machiningElapsedBaseRef.current[mid];
      setMachiningElapsedSecondsMap((prev) => ({ ...prev, [mid]: 0 }));
      void refreshProductionQueues();
    });

    return () => {
      offStarted?.();
      offTick?.();
      offCompleted?.();
    };
  }, [token, refreshLastCompletedFromServer, refreshProductionQueues]);

  const refreshMachineStatuses = useCallback(async () => {
    if (!token) return;
    setStatusRefreshing(true);
    setStatusRefreshError(null);
    setStatusRefreshErroredAt(null);
    try {
      const uids = (Array.isArray(machines) ? machines : [])
        .map((m) => String(m?.uid || "").trim())
        .filter(Boolean);
      await refreshStatuses({ token, uids });
      setStatusRefreshedAt(new Date().toLocaleTimeString());
    } catch (e: any) {
      setStatusRefreshError(e?.message || "status proxy failed");
      setStatusRefreshErroredAt(new Date().toLocaleTimeString());
    } finally {
      setStatusRefreshing(false);
    }
  }, [machines, refreshStatuses, token]);

  const lastRefreshAtRef = useRef(0);
  const handleBoardClickCapture = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshAtRef.current < 800) return;
    lastRefreshAtRef.current = now;
    void refreshMachineStatuses();
  }, [refreshMachineStatuses]);

  const updateMachineAuto = async (uid: string, next: boolean) => {
    if (!token) return;
    const target = (Array.isArray(machines) ? machines : []).find(
      (m) => m.uid === uid,
    );
    if (!target) return;

    const prev = target.allowAutoMachining === true;
    setMachines((prevList) =>
      prevList.map((m) =>
        m.uid === uid ? { ...m, allowAutoMachining: next } : m,
      ),
    );

    try {
      const res = await apiFetch({
        path: "/api/machines",
        method: "POST",
        token,
        jsonBody: {
          uid: target.uid,
          name: target.name,
          ip: target.ip,
          port: target.port,
          // 자동가공 설정은 allowAutoMachining만 변경하고,
          // 원격가공 허용(allowJobStart)은 현재 설정을 그대로 유지한다.
          allowJobStart: target.allowJobStart !== false,
          allowProgramDelete: target.allowProgramDelete === true,
          allowRequestAssign: target.allowRequestAssign !== false,
          allowAutoMachining: next,
        },
      });
      const body: any = res.data ?? {};
      if (!res.ok || body?.success === false) {
        throw new Error(body?.message || "자동 가공 설정 저장 실패");
      }

      if (next === true) {
        toast({
          title: "자동 가공 ON",
          description:
            "이 장비는 대기 중인 의뢰가 있으면 자동으로 가공을 시작합니다.",
        });

        if (token) {
          const name = target?.name || uid;
          try {
            const resp = await fetch(
              `/api/cnc-machines/machining/auto-trigger/${encodeURIComponent(
                uid,
              )}`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
              },
            );
            const body2: any = await resp.json().catch(() => ({}));
            if (!resp.ok || body2?.success === false) {
              throw new Error(
                body2?.message || body2?.error || "자동 가공 트리거 호출 실패",
              );
            }

            toast({
              title: "자동 가공 트리거 전송",
              description: `${name} 대기 의뢰 자동 시작을 요청했습니다.`,
            });
          } catch (err: any) {
            toast({
              title: "자동 가공 트리거 실패",
              description: err?.message || "잠시 후 다시 시도해주세요.",
              variant: "destructive",
            });
          }
        }
      }
    } catch (e: any) {
      setMachines((prevList) =>
        prevList.map((m) =>
          m.uid === uid ? { ...m, allowAutoMachining: prev } : m,
        ),
      );
      toast({
        title: "설정 저장 실패",
        description: e?.message || "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    }
  };

  const updateMachineRequestAssign = async (uid: string, next: boolean) => {
    if (!token) return;
    const target = (Array.isArray(machines) ? machines : []).find(
      (m) => m.uid === uid,
    );
    if (!target) return;

    const prev = target.allowRequestAssign !== false;
    setMachines((prevList) =>
      prevList.map((m) =>
        m.uid === uid ? { ...m, allowRequestAssign: next } : m,
      ),
    );

    try {
      const res = await apiFetch({
        path: "/api/machines",
        method: "POST",
        token,
        jsonBody: {
          uid: target.uid,
          name: target.name,
          ip: target.ip,
          port: target.port,
          allowJobStart: target.allowJobStart !== false,
          allowProgramDelete: target.allowProgramDelete === true,
          allowRequestAssign: next,
          allowAutoMachining: target.allowAutoMachining === true,
        },
      });
      const body: any = res.data ?? {};
      if (!res.ok || body?.success === false) {
        throw new Error(body?.message || "의뢰 배정 설정 저장 실패");
      }
    } catch (e: any) {
      setMachines((prevList) =>
        prevList.map((m) =>
          m.uid === uid ? { ...m, allowRequestAssign: prev } : m,
        ),
      );
      toast({
        title: "설정 저장 실패",
        description: e?.message || "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    }
  };

  const requestToggleMachineAuto = useCallback(
    (uid: string, next: boolean) => {
      if (!next) {
        void updateMachineAuto(uid, false);
        return;
      }

      const confirmed = window.confirm(
        "ON 하면 대기 중인 의뢰의 자동 가공이 즉시 시작될 수 있습니다. 계속 진행하시겠습니까?",
      );
      if (!confirmed) return;
      void updateMachineAuto(uid, true);
    },
    [updateMachineAuto],
  );

  const globalAutoEnabled = useMemo(() => {
    const list = Array.isArray(machines) ? machines : [];
    if (list.length === 0) return false;
    return list.every((m) => m.allowAutoMachining === true);
  }, [machines]);

  const setGlobalAutoEnabled = async (enabled: boolean) => {
    if (!token) return;
    const list = Array.isArray(machines) ? machines : [];
    if (list.length === 0) return;

    const prevMap = new Map(
      list.map((m) => [m.uid, m.allowAutoMachining === true]),
    );
    setMachines((prevList) =>
      prevList.map((m) => ({ ...m, allowAutoMachining: enabled })),
    );

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
            allowJobStart: m.allowJobStart !== false,
            allowProgramDelete: m.allowProgramDelete === true,
            allowRequestAssign: m.allowRequestAssign !== false,
            allowAutoMachining: enabled,
          },
        });
        const body: any = res.data ?? {};
        if (!res.ok || body?.success === false) {
          throw new Error(body?.message || "전체 자동 가공 설정 저장 실패");
        }
      }
    } catch (e: any) {
      setMachines((prevList) =>
        prevList.map((m) => ({
          ...m,
          allowAutoMachining: prevMap.get(m.uid) === true,
        })),
      );
      toast({
        title: "전체 자동 가공 설정 실패",
        description: e?.message || "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    }
  };

  const openReservationForMachine = useCallback(
    (uid: string) => {
      const machine = (Array.isArray(machines) ? machines : []).find(
        (m) => m.uid === uid,
      );

      setPlaylistMachineId(uid);
      setPlaylistTitle(machine?.name || uid);

      void (async () => {
        try {
          await loadProductionQueueForMachine(uid);
          setPlaylistOpen(true);
        } catch (e: any) {
          toast({
            title: "예약목록 조회 실패",
            description: e?.message || "잠시 후 다시 시도해주세요.",
            variant: "destructive",
          });
        }
      })();
    },
    [loadProductionQueueForMachine, machines, toast],
  );

  const openProgramDetailForMachining = useCallback(
    async (prog: any, mid: string) => {
      setWorkUid(String(mid || "").trim());
      await openProgramDetail(prog, mid);
    },
    [openProgramDetail],
  );

  const lastSearchMidRef = useRef<string>("");
  useEffect(() => {
    const targetMid = String(searchParams.get("mid") || "").trim();
    if (!targetMid) return;
    if (lastSearchMidRef.current === targetMid) return;
    lastSearchMidRef.current = targetMid;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("mid");
      return next;
    });
    void openReservationForMachine(targetMid);
  }, [openReservationForMachine, searchParams, setSearchParams]);

  const rollbackRequestInQueue = useCallback(
    async (machineId: string, requestId: string) => {
      if (!token) return;
      const mid = String(machineId || "").trim();
      const rid = String(requestId || "").trim();
      if (!mid || !rid) return;

      try {
        const res = await fetch(
          `/api/cnc-machines/${encodeURIComponent(mid)}/production-queue/batch`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ deleteRequestIds: [rid] }),
          },
        );
        const body: any = await res.json().catch(() => ({}));
        if (!res.ok || body?.success === false) {
          throw new Error(
            body?.message || body?.error || "CAM으로 되돌리기 실패",
          );
        }

        await refreshProductionQueues();
      } catch (e: any) {
        toast({
          title: "CAM으로 되돌리기 실패",
          description: e?.message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
      }
    },
    [refreshProductionQueues, toast, token],
  );

  return {
    machines,
    mergedMachines,
    filteredMachines,
    statusByUid,
    machineStatusMap,
    queueMap,
    setQueueMap,
    machiningElapsedSecondsMap,
    lastCompletedMap,
    nowPlayingHintMap,
    statusRefreshing,
    statusRefreshedAt,
    statusRefreshError,
    statusRefreshErroredAt,
    refreshMachineStatuses,
    handleBoardClickCapture,
    isMockFromBackend,
    loading,
    globalAutoEnabled,
    setGlobalAutoEnabled,
    updateMachineAuto,
    updateMachineRequestAssign,
    openReservationForMachine,
    openProgramDetailForMachining,
    workUid,
    programEditorOpen,
    programEditorTarget,
    isReadOnly,
    closeProgramEditor,
    loadProgramCodeForMachining,
    saveProgramCode,
    programEditorError,
    playlistOpen,
    setPlaylistOpen,
    playlistMachineId,
    playlistTitle,
    playlistJobs,
    setPlaylistJobs,
    buildPlaylistJobsFromQueue,
    loadProductionQueueForMachine,
    eventLogRequestId,
    setEventLogRequestId,
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
    refreshCncMachineMeta,
    rollbackRequestInQueue,
    token,
  };
};
