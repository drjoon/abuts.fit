import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import {
  initializeSocket,
  onCncMachiningCompleted,
  onCncMachiningTick,
  onCncMachiningStarted,
} from "@/lib/socket";
import { apiFetch } from "@/lib/apiClient";
import { getMockCncMachiningEnabled } from "@/lib/bridgeSettings";
import { useCncMachines } from "@/features/manufacturer/cnc/hooks/useCncMachines";
import { useCncProgramEditor } from "@/features/manufacturer/cnc/hooks/useCncProgramEditor";
import { useCncRaw } from "@/features/manufacturer/cnc/hooks/useCncRaw";
import { useMachineStatusStore } from "@/store/useMachineStatusStore";
import type { PlaylistJobItem } from "@/pages/manufacturer/cnc/components/CncPlaylistDrawer";
import type {
  QueueItem,
  QueueMap,
  LastCompletedMachining,
  NowPlayingHint,
  MachineStatus,
} from "../types";
import { formatMachiningLabel } from "../utils/label";

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
    } catch {
      // ignore
    }
  }, [token]);

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
      const bridgePath = String(
        prog?.bridgePath || prog?.bridge_store_path || prog?.path || "",
      ).trim();
      const requestId = String(prog?.requestId || "").trim();
      const s3Key = String(prog?.s3Key || "").trim();

      if (bridgePath && token) {
        const url = `/api/bridge-store/file?path=${encodeURIComponent(bridgePath)}&_ts=${Date.now()}`;
        const res = await fetch(url, {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        });
        const body: any = await res.json().catch(() => ({}));
        if (
          res.ok &&
          body?.success !== false &&
          typeof body?.content === "string"
        ) {
          return body.content;
        }

        if (requestId && s3Key) {
          const ensureRes = await fetch(
            `/api/requests/by-request/${encodeURIComponent(requestId)}/nc-file/ensure-bridge`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ bridgePath }),
            },
          );
          const ensureBody: any = await ensureRes.json().catch(() => ({}));
          if (!ensureRes.ok || ensureBody?.success === false) {
            throw new Error(
              ensureBody?.message || ensureBody?.error || "NC 파일 동기화 실패",
            );
          }

          const nextPath = String(
            ensureBody?.data?.bridgePath ||
              ensureBody?.data?.filePath ||
              bridgePath,
          ).trim();
          if (nextPath) {
            const retry = await fetch(
              `/api/bridge-store/file?path=${encodeURIComponent(nextPath)}&_ts=${Date.now()}`,
              {
                method: "GET",
                cache: "no-store",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Cache-Control": "no-cache",
                  Pragma: "no-cache",
                },
              },
            );
            const retryBody: any = await retry.json().catch(() => ({}));
            if (
              retry.ok &&
              retryBody?.success !== false &&
              typeof retryBody?.content === "string"
            ) {
              return retryBody.content;
            }
          }
        }
      }

      return loadProgramCode(prog);
    },
    [loadProgramCode, token],
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
    fetch("/api/cnc-machines/queues", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) =>
        res
          .json()
          .catch(() => ({}))
          .then((body: any) => ({ res, body })),
      )
      .then(({ res, body }) => {
        if (!res.ok || body?.success === false) {
          throw new Error(body?.message || body?.error || "생산 큐 조회 실패");
        }
        const map =
          body?.data && typeof body.data === "object" ? body.data : {};
        if (mounted) setQueueMap(map);
      })
      .catch((e: any) => {
        toast({
          title: "생산 큐 조회 실패",
          description: e?.message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [token, toast]);

  useEffect(() => {
    let mounted = true;
    if (!token) return;

    fetch("/api/cnc-machines/machining/last-completed", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) =>
        res
          .json()
          .catch(() => ({}))
          .then((body: any) => ({ res, body })),
      )
      .then(({ res, body }) => {
        if (!mounted) return;
        if (!res.ok || body?.success === false) return;
        const map =
          body?.data && typeof body.data === "object" ? (body.data as any) : {};
        setLastCompletedMap((prev) => ({ ...map, ...prev }));
      })
      .catch(() => {
        // ignore
      });

    return () => {
      mounted = false;
    };
  }, [token]);

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
      const displayLabel = found ? resolveCompletedDisplayLabel(found) : rid;

      const durationSeconds = (() => {
        const fromDuration =
          typeof data?.durationSeconds === "number" && data.durationSeconds >= 0
            ? Math.floor(data.durationSeconds)
            : null;
        if (fromDuration != null) return fromDuration;

        const fromElapsed =
          typeof data?.elapsedSeconds === "number" && data.elapsedSeconds >= 0
            ? Math.floor(data.elapsedSeconds)
            : null;
        if (fromElapsed != null) return fromElapsed;

        const fromBase = machiningElapsedBaseRef.current?.[mid]?.elapsedSeconds;
        if (typeof fromBase === "number" && fromBase >= 0)
          return Math.floor(fromBase);

        const fromMap = machiningElapsedSecondsMap?.[mid];
        if (typeof fromMap === "number" && fromMap >= 0)
          return Math.floor(fromMap);

        return 0;
      })();

      setLastCompletedMap((prev) => ({
        ...prev,
        [mid]: {
          machineId: mid,
          jobId: data?.jobId != null ? String(data.jobId) : null,
          requestId: data?.requestId != null ? String(data.requestId) : null,
          displayLabel: String(displayLabel || "").trim() || null,
          completedAt: String(data?.completedAt || new Date().toISOString()),
          durationSeconds,
        },
      }));

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
  }, [token, refreshProductionQueues, machiningElapsedSecondsMap]);

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
          allowJobStart: next ? true : target.allowJobStart !== false,
          allowProgramDelete: target.allowProgramDelete === true,
          allowRequestAssign: target.allowRequestAssign !== false,
          allowAutoMachining: next,
        },
      });
      const body: any = res.data ?? {};
      if (!res.ok || body?.success === false) {
        throw new Error(body?.message || "자동 가공 설정 저장 실패");
      }

      const trigger = body?.autoMachiningTrigger;
      if (next === true) {
        if (trigger?.attempted) {
          toast({
            title: "자동 가공 ON",
            description: trigger?.requestId
              ? `대기 의뢰(${String(trigger.requestId)}) 자동 시작을 트리거했습니다.`
              : "자동 시작을 트리거했습니다.",
          });
        } else {
          toast({
            title: "자동 가공 ON",
            description: "대기 의뢰가 없어 자동 시작 트리거를 건너뜁니다.",
          });
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

      const t = (Array.isArray(machines) ? machines : []).find(
        (m) => m.uid === uid,
      );
      const name = t?.name || uid;

      toast({
        title: "자동 가공을 켤까요?",
        description:
          "ON 하면 대기 중인 의뢰의 자동 가공이 즉시 시작될 수 있습니다. 계속 진행하시겠습니까?",
        variant: "destructive",
        duration: 8000,
      });
    },
    [machines, toast],
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

  return {
    machines,
    mergedMachines,
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
    token,
  };
};
