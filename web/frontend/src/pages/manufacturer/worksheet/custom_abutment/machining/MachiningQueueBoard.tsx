import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/use-toast";
import {
  initializeSocket,
  onCncMachiningCompleted,
  onCncMachiningTick,
  onCncMachiningStarted,
} from "@/lib/socket";
import { useCncMachines } from "@/features/manufacturer/cnc/hooks/useCncMachines";
import { useCncProgramEditor } from "@/features/manufacturer/cnc/hooks/useCncProgramEditor";
import { useCncRaw } from "@/features/manufacturer/cnc/hooks/useCncRaw";
import { apiFetch } from "@/lib/apiClient";
import { getMockCncMachiningEnabled } from "@/lib/bridgeSettings";
import { Badge } from "@/components/ui/badge";
import { ToastAction } from "@/components/ui/toast";
import { CncEventLogModal } from "@/components/CncEventLogModal";
import { CncProgramEditorPanel } from "@/pages/manufacturer/cnc/components/CncProgramEditorPanel";
import { useMachineStatusStore } from "@/store/useMachineStatusStore";
import {
  CncPlaylistDrawer,
  type PlaylistJobItem,
} from "@/pages/manufacturer/cnc/components/CncPlaylistDrawer";
import { CompletedMachiningRecordsModal } from "@/pages/manufacturer/cnc/components/CompletedMachiningRecordsModal";
import type {
  MachineStatus,
  NowPlayingHint,
  QueueItem,
  QueueMap,
  LastCompletedMachining,
} from "./types";
import { formatMachiningLabel } from "./utils/label";
import { MachineQueueCard } from "./components/MachineQueueCard";

const isMachiningStatus = (status?: string) => {
  const s = String(status || "").trim();
  return s === "생산" || s === "가공";
};

const resolveCompletedDisplayLabel = (q: QueueItem | null) => {
  if (!q) return "-";
  return formatMachiningLabel(q);
};

export const MachiningQueueBoard = ({
  searchQuery,
}: {
  searchQuery?: string;
}) => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [isMockFromBackend, setIsMockFromBackend] = useState<boolean | null>(
    null,
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const { machines, setMachines } = useCncMachines();
  const { callRaw } = useCncRaw();
  const statusByUid = useMachineStatusStore((s) => s.statusByUid);
  const refreshStatuses = useMachineStatusStore((s) => s.refresh);

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

  const [machineStatusMap, setMachineStatusMap] = useState<
    Record<string, MachineStatus>
  >({});

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

  const filteredMachines = useMemo(() => {
    const q = String(searchQuery || "")
      .trim()
      .toLowerCase();
    const list = Array.isArray(mergedMachines) ? mergedMachines : [];
    if (!q) return list;
    return list.filter((m) => {
      const fields = [m.name, m.uid, m.ip].filter(Boolean);
      return fields.some((f) => String(f).toLowerCase().indexOf(q) >= 0);
    });
  }, [mergedMachines, searchQuery]);

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

  const globalAutoEnabled = useMemo(() => {
    const list = Array.isArray(machines) ? machines : [];
    if (list.length === 0) return false;
    return list.every((m) => m.allowAutoMachining === true);
  }, [machines]);

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
    [machines, toast],
  );

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

  const openProgramDetailForMachining = useCallback(
    async (prog: any, mid: string) => {
      setWorkUid(String(mid || "").trim());
      await openProgramDetail(prog, mid);
    },
    [openProgramDetail],
  );

  const loadProgramCodeForPanel = useCallback(
    async (prog: any) => loadProgramCodeForMachining(prog),
    [loadProgramCodeForMachining],
  );

  const loadProgramCodeForMachiningWrapper = loadProgramCodeForPanel;

  const saveProgramCodeWrapper = saveProgramCode;

  useEffect(() => {
    const targetMid = String(searchParams.get("mid") || "").trim();
    if (!targetMid) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("mid");
      return next;
    });
    void openReservationForMachine(targetMid);
  }, [openReservationForMachine, searchParams, setSearchParams]);

  return (
    <div
      className="space-y-4"
      onMouseDownCapture={handleBoardClickCapture}
      onTouchStartCapture={handleBoardClickCapture}
    >
      <div className="flex items-center justify-between">
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
          className="app-surface app-surface--panel flex items-center gap-3 px-4 py-3"
          title="OFF로 전환하면 현재 가공 중인 건은 그대로 진행되며, 완료 후 다음 자동 시작은 실행되지 않습니다."
        >
          <div className="text-[12px] font-extrabold text-slate-700">
            전체 자동 가공 허용
          </div>
          <button
            type="button"
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              globalAutoEnabled ? "bg-emerald-500" : "bg-gray-300"
            }`}
            onClick={() => {
              void setGlobalAutoEnabled(!globalAutoEnabled);
            }}
            disabled={loading}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                globalAutoEnabled ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {filteredMachines.map((m) => {
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

          return (
            <MachineQueueCard
              key={m.uid}
              machineId={m.uid}
              machineName={m.name}
              machine={m}
              queue={Array.isArray(queueMap?.[m.uid]) ? queueMap[m.uid] : []}
              machiningElapsedSeconds={
                typeof machiningElapsedSecondsMap?.[m.uid] === "number"
                  ? machiningElapsedSecondsMap[m.uid]
                  : null
              }
              lastCompleted={lastCompletedMap?.[m.uid] || null}
              nowPlayingHint={nowPlayingHintMap?.[m.uid] || null}
              onOpenRequestLog={(requestId) => setEventLogRequestId(requestId)}
              autoEnabled={m.allowAutoMachining === true}
              onToggleAuto={(next) => {
                requestToggleMachineAuto(m.uid, next);
              }}
              onToggleRequestAssign={(next) => {
                void updateMachineRequestAssign(m.uid, next);
              }}
              machineStatus={mergedStatus}
              statusRefreshing={statusRefreshing}
              onOpenReservation={() => openReservationForMachine(m.uid)}
              onOpenProgramCode={(prog, machineId) => {
                void openProgramDetailForMachining(prog, machineId);
              }}
              onOpenCompleted={(mid, name) => {
                setCompletedModalMachineId(String(mid || "").trim());
                setCompletedModalTitle(
                  `${String(name || mid || "").trim()} 가공 완료`,
                );
                setCompletedModalOpen(true);
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
          setWorkUid(mid);
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
          onLoadProgram={loadProgramCodeForMachiningWrapper}
          onSaveProgram={saveProgramCodeWrapper}
          readOnly={isReadOnly}
        />
      ) : null}
    </div>
  );
};

export default MachiningQueueBoard;
