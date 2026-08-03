// related files:
// - web/frontend/rules.md
// - web/frontend/websocket-realtime-update-checklist.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/backend/controllers/requests/common.review.controller.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/shared/hooks/use-toast";
import {
  initializeSocket,
  onCncMachiningAlarm,
  onCncMachiningCompleted,
  onCncMachiningFailed,
  onCncMachiningTick,
  onCncMachiningStarted,
  onCncMachineSettingsChanged,
} from "@/shared/realtime/socket";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";
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
  return s === "가공";
};

const resolveCompletedDisplayLabel = (q: QueueItem | null) => {
  if (!q) return "-";
  const rolledBackCount = Number((q as any)?.rollbackCount || 0);
  if (rolledBackCount > 0) return "-";
  return formatMachiningLabel(q);
};

const isQueueItemRunning = (item?: QueueItem | null) => {
  const rec = item?.machiningRecord;
  if (!rec || typeof rec !== "object") return false;
  const recStatus = String(rec?.status || "")
    .trim()
    .toUpperCase();
  if (recStatus === "RUNNING" || recStatus === "PROCESSING") return true;
  const startedAt = rec?.startedAt ? new Date(rec.startedAt).getTime() : 0;
  const completedAt = rec?.completedAt
    ? new Date(rec.completedAt).getTime()
    : 0;
  return startedAt > 0 && completedAt <= 0;
};

type MachiningAlertItem = {
  machineId: string;
  requestId: string | null;
  errorCode: string | null;
  message: string;
  alarmText: string;
  updatedAt: string;
  count: number;
};

const MACHINING_ALERT_STORAGE_KEY = "abuts:machining-alert-map";
const GHOST_HINT_CLEAR_GRACE_SECONDS = 8;
const GHOST_HINT_SWEEP_INTERVAL_MS = 2000;

export const useMachiningBoard = ({
  token,
}: {
  token: string | null | undefined;
}) => {
  const { toast, dismiss } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    machines,
    setMachines,
    machinesLoaded,
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

  const machinesRef = useRef(machines);
  useEffect(() => {
    machinesRef.current = machines;
  }, [machines]);

  const lastAlarmToastAtRef = useRef<Record<string, number>>({});
  const recentAlertFingerprintRef = useRef<Record<string, number>>({});

  const [machiningAlertMap, setMachiningAlertMap] = useState<
    Record<string, MachiningAlertItem>
  >({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(MACHINING_ALERT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      setMachiningAlertMap(parsed as Record<string, MachiningAlertItem>);
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        MACHINING_ALERT_STORAGE_KEY,
        JSON.stringify(machiningAlertMap),
      );
    } catch {
      // noop
    }
  }, [machiningAlertMap]);

  const upsertMachiningAlert = useCallback(
    (payload: {
      machineId?: string | null;
      requestId?: string | null;
      errorCode?: string | null;
      message?: string | null;
      alarmText?: string | null;
    }) => {
      const mid = String(payload?.machineId || "").trim();
      if (!mid) return;
      const rid = String(payload?.requestId || "").trim() || null;
      const code = String(payload?.errorCode || "").trim() || null;
      const msg =
        String(payload?.message || payload?.alarmText || "").trim() ||
        "CNC 알람";
      const text = String(payload?.alarmText || payload?.message || "").trim();

      const fingerprint = `${mid}|${rid || ""}|${code || ""}|${msg}`;
      const now = Date.now();
      const last = recentAlertFingerprintRef.current[fingerprint] ?? 0;
      if (now - last < 5000) return;
      recentAlertFingerprintRef.current[fingerprint] = now;

      setMachiningAlertMap((prev) => {
        const prevItem = prev[mid];
        const sameReason =
          prevItem &&
          prevItem.requestId === rid &&
          prevItem.errorCode === code &&
          prevItem.message === msg;

        return {
          ...prev,
          [mid]: {
            machineId: mid,
            requestId: rid,
            errorCode: code,
            message: msg,
            alarmText: text || msg,
            updatedAt: new Date().toISOString(),
            count: sameReason
              ? Number(prevItem?.count || 0) + 1
              : Number(prevItem?.count || 0) + 1,
          },
        };
      });
    },
    [],
  );

  const clearMachiningAlerts = useCallback((machineId?: string) => {
    const mid = String(machineId || "").trim();
    if (!mid) {
      setMachiningAlertMap({});
      return;
    }
    setMachiningAlertMap((prev) => {
      if (!prev[mid]) return prev;
      const next = { ...prev };
      delete next[mid];
      return next;
    });
  }, []);

  const updateMachineAuto = useCallback(
    async (uid: string, next: boolean) => {
      if (!token) return;
      const target = (
        Array.isArray(machinesRef.current) ? machinesRef.current : []
      ).find((m) => m.uid === uid);
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
            // 정책 구분:
            // - allowAutoMachining: 작업 페이지 의뢰건 자동 가공 허용
            // - allowJobStart: 장비 페이지 수동/샘플 가공 시작 허용
            // 따라서 작업 페이지 자동가공 토글은 allowAutoMachining만 변경하고,
            // allowJobStart는 건드리지 않는다.
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
          const machineQueue = Array.isArray(queueMapRef.current?.[uid])
            ? (queueMapRef.current[uid] as QueueItem[])
            : [];
          const hasRunningNowPlaying = machineQueue.some((item) =>
            isQueueItemRunning(item),
          );

          toast({
            title: "자동 가공 ON",
            description: hasRunningNowPlaying
              ? "현재 가공 중인 건 완료 후 Next Up부터 자동 연속 가공됩니다."
              : "이 장비는 대기 중인 의뢰가 있으면 자동으로 가공을 시작합니다.",
          });

          if (!hasRunningNowPlaying && token) {
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
                  body2?.message ||
                    body2?.error ||
                    "자동 가공 트리거 호출 실패",
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
    },
    [setMachines, toast, token],
  );

  const updateMachineAutoRef = useRef(updateMachineAuto);
  useEffect(() => {
    updateMachineAutoRef.current = updateMachineAuto;
  }, [updateMachineAuto]);

  const [machiningElapsedSecondsMap, setMachiningElapsedSecondsMap] = useState<
    Record<string, number>
  >({});
  const machiningElapsedBaseRef = useRef<Record<string, number>>({});

  const [lastCompletedMap, setLastCompletedMap] = useState<
    Record<string, LastCompletedMachining>
  >({});

  const [nowPlayingHintMap, setNowPlayingHintMap] = useState<
    Record<string, NowPlayingHint>
  >({});

  const reconcileMachiningTimersFromQueues = useCallback((map: QueueMap) => {
    const nextBases: Record<string, number> = {};
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

      // 타이머 베이스를 밀리초 타임스탬프로 저장 (현재 시간 - 경과 시간)
      nextBases[mid] = Date.now() - baseElapsed * 1000;
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

    // 레이스 방지: 이 함수를 호출하는 refreshProductionQueues 요청은
    // 소켓(cnc-machining-started)보다 먼저 보낸 요청이 높은 확률로 느리게 도착해,
    // 스낵샷에 machiningRecord가 아직 반영되지 않은 오래된(stale) 데이터일 수 있다.
    // 이 스낵샷에서 running을 못 찾았다고 기존 힌트를 무조건 지우면,
    // 방금 소켓으로 정상 반영된 Now Playing이 잠시 후 Next Up으로 원복되는 레이스가 발생한다.
    // 해당 힌트의 requestId가 이 머신의 큐에 여전히 존재하면(=진짜로 끝난 것이 아니면)
    // 기존 힌트를 그대로 유지한다.
    machiningElapsedBaseRef.current = {
      ...machiningElapsedBaseRef.current,
      ...nextBases,
    };
    setMachiningElapsedSecondsMap((prev) => ({ ...prev, ...nextSecondsFromQueues }));
    setNowPlayingHintMap((prev) => {
      const merged: Record<string, NowPlayingHint> = { ...prev, ...nextHintsFromQueues };
      for (const mid of Object.keys(prev)) {
        if (nextHintsFromQueues[mid]) continue;
        const hintRid = String(prev[mid]?.requestId || "").trim();
        const list = Array.isArray(map?.[mid]) ? map[mid] : [];
        const stillPresent =
          !!hintRid &&
          list.some(
            (it: any) => String(it?.requestId || "").trim() === hintRid,
          );
        if (!stillPresent) {
          delete merged[mid];
          delete machiningElapsedBaseRef.current[mid];
        }
      }
      return merged;
    });
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
            item?.lotNumber?.value ||
              item?.lotPart ||
              item?.lotNumberValue ||
              "",
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
                  value: lotPart,
                }
              : item?.lotNumber,
          };
        });
      });
      setQueueMap(normalized);
      reconcileMachiningTimersFromQueues(normalized);
    } catch {
      // ignore
    }
  }, [token, reconcileMachiningTimersFromQueues]);

  const ncQueueVerifyTimerRef = useRef<number | null>(null);
  const scheduleNcQueueVerifyRefresh = useCallback(() => {
    if (ncQueueVerifyTimerRef.current != null) {
      window.clearTimeout(ncQueueVerifyTimerRef.current);
    }
    ncQueueVerifyTimerRef.current = window.setTimeout(() => {
      ncQueueVerifyTimerRef.current = null;
      void refreshProductionQueues();
    }, 180);
  }, [refreshProductionQueues]);

  const patchQueueNcMetaFromRequest = useCallback((requestRaw: any) => {
    const requestId = String(requestRaw?.requestId || "").trim();
    const requestMongoId = String(requestRaw?._id || requestRaw?.id || "").trim();
    if (!requestId && !requestMongoId) return;

    const requestCaseInfos =
      requestRaw?.caseInfos && typeof requestRaw.caseInfos === "object"
        ? requestRaw.caseInfos
        : null;
    const requestNcFile =
      requestCaseInfos?.ncFile && typeof requestCaseInfos.ncFile === "object"
        ? requestCaseInfos.ncFile
        : requestRaw?.ncFile && typeof requestRaw.ncFile === "object"
          ? requestRaw.ncFile
          : null;

    if (!requestCaseInfos && !requestNcFile) return;

    setQueueMap((prev) => {
      let changed = false;
      const next: QueueMap = {};

      Object.entries(prev || {}).forEach(([machineId, list]) => {
        const arr = Array.isArray(list) ? list : [];
        let machineChanged = false;
        const patched = arr.map((item: any) => {
          const itemRequestId = String(item?.requestId || "").trim();
          const itemMongoId = String(item?.requestMongoId || "").trim();
          const isTarget =
            (requestId && itemRequestId === requestId) ||
            (requestMongoId && itemMongoId === requestMongoId);
          if (!isTarget) return item;

          machineChanged = true;
          changed = true;

          const prevCaseInfos =
            item?.caseInfos && typeof item.caseInfos === "object"
              ? item.caseInfos
              : {};
          const prevNcFile =
            item?.ncFile && typeof item.ncFile === "object"
              ? item.ncFile
              : prevCaseInfos?.ncFile && typeof prevCaseInfos.ncFile === "object"
                ? prevCaseInfos.ncFile
                : {};

          const mergedNcFile = requestNcFile
            ? {
                ...prevNcFile,
                ...requestNcFile,
              }
            : prevNcFile;

          const mergedCaseInfos = requestCaseInfos
            ? {
                ...prevCaseInfos,
                ...requestCaseInfos,
                ncFile: mergedNcFile,
              }
            : {
                ...prevCaseInfos,
                ncFile: mergedNcFile,
              };

          return {
            ...item,
            clinicName:
              String(requestRaw?.clinicName || "").trim() || item?.clinicName,
            patientName:
              String(requestRaw?.patientName || "").trim() || item?.patientName,
            tooth:
              String(requestRaw?.tooth || requestCaseInfos?.tooth || "").trim() ||
              item?.tooth,
            caseInfos: mergedCaseInfos,
            ncFile: mergedNcFile,
          };
        });

        next[machineId] = machineChanged ? patched : arr;
      });

      return changed ? next : prev;
    });
  }, []);

  const reassignProductionQueues = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/cnc-machines/queues/reassign", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) {
        throw new Error(body?.message || "생산 큐 재배정 실패");
      }
      window.dispatchEvent(new Event("cnc-queues-updated"));
      toast({
        title: "재배정 완료",
        description: "현재 설정 기준으로 생산 큐를 재배정했습니다.",
      });
    } catch (e: any) {
      toast({
        title: "재배정 실패",
        description: e?.message || "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    }
  }, [toast, token]);

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

  const queueOnlyMachines = useMemo(() => {
    const knownIds = new Set(
      (mergedMachines || [])
        .map((m: any) => String(m?.uid || "").trim())
        .filter(Boolean),
    );

    return Object.entries(queueMap || {})
      .map(([mid, list]) => {
        const machineId = String(mid || "").trim();
        if (!machineId || knownIds.has(machineId)) return null;
        const items = Array.isArray(list) ? list : [];
        if (!items.length) return null;
        return {
          uid: machineId,
          name: machineId === "unassigned" ? "미배정" : machineId,
          status: "offline",
          allowRequestAssign: machineId === "unassigned",
          allowAutoMachining: false,
          currentMaterial: null,
          maxModelDiameterGroups: [],
        };
      })
      .filter(Boolean);
  }, [mergedMachines, queueMap]);

  const machinesForBoard = useMemo(() => {
    return [...(mergedMachines || []), ...(queueOnlyMachines as any[])];
  }, [mergedMachines, queueOnlyMachines]);

  const filteredMachines = useMemo(() => {
    return (machinesForBoard || []).filter((m: any) => {
      if (m.status !== "offline") return true;
      const mid = String(m?.uid || "").trim();
      if (!mid) return false;
      return Array.isArray(queueMap?.[mid]) && queueMap[mid].length > 0;
    });
  }, [machinesForBoard, queueMap]);

  useEffect(() => {
    const knownIds = new Set(
      (mergedMachines || [])
        .map((m: any) => String(m?.uid || "").trim())
        .filter(Boolean),
    );
    if (!machinesLoaded) return;
    const danglingQueueIds = Object.entries(queueMap || {})
      .map(([mid, list]) => ({
        machineId: String(mid || "").trim(),
        count: Array.isArray(list) ? list.length : 0,
        requestIds: (Array.isArray(list) ? list : [])
          .map((item: any) => String(item?.requestId || "").trim())
          .filter(Boolean),
      }))
      .filter(
        (entry) =>
          entry.machineId &&
          entry.machineId !== "unassigned" &&
          !knownIds.has(entry.machineId),
      );

    if (danglingQueueIds.length > 0) {
      console.warn("[MACHINING_BOARD] queue has unknown machine ids", {
        danglingQueueIds,
        knownMachineIds: Array.from(knownIds),
        machinesLoaded,
      });
    }
  }, [machinesLoaded, mergedMachines, queueMap]);

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
    fetchProgramList: refreshProductionQueues,
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
        const rid = String(q?.requestId || "").trim();
        if (!rid) return null;
        const requestMongoId =
          q && (q as any).requestMongoId != null
            ? String((q as any).requestMongoId)
            : null;
        const nc = q?.ncFile ?? null;
        const bridgePath = String(nc?.filePath || "").trim();
        const s3Key = String(nc?.s3Key || "").trim();
        const s3Bucket = String(nc?.s3Bucket || "").trim();
        const rollbackCount = Number((q as any)?.rollbackCount || 0);
        const anodizingEnabled = (
          q as { caseInfos?: { anodizingEnabled?: boolean } }
        )?.caseInfos?.anodizingEnabled;
        return {
          id: rid,
          name: formatMachiningLabel(q),
          qty: Number(q?.machiningQty || 1) || 1,
          paused: q?.paused === true,
          bridgePath,
          s3Key,
          s3Bucket,
          requestId: rid,
          requestMongoId,
          source: bridgePath ? "bridge_store" : s3Key ? "s3" : "db",
          rollbackCount,
          anodizingEnabled,
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
      const nextJobs = buildPlaylistJobsFromQueue(raw);
      setPlaylistJobs(nextJobs);
    },
    [buildPlaylistJobsFromQueue, queueMap],
  );

  useEffect(() => {
    let mounted = true;
    if (!token) return;
    // Remove setLoading(true) here to prevent full page flash when navigating or on initial socket events.
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

  useEffect(() => {
    return () => {
      if (ncQueueVerifyTimerRef.current != null) {
        window.clearTimeout(ncQueueVerifyTimerRef.current);
        ncQueueVerifyTimerRef.current = null;
      }
    };
  }, []);

  useAppEventListener({
    enabled: Boolean(token),
    eventTypes: ["request:stage-changed", "request:stl-metadata-updated"],
    onMatch: (evt) => {
      const type = String(evt?.type || "").trim();
      const payload = (evt?.data ?? {}) as Record<string, unknown>;
      const source = String(payload["source"] || "").trim();
      const reviewStage = String(payload["reviewStage"] || "").trim();
      const eventRequest = payload["request"] || null;

      // 브리지 가공 시작 콜백을 백엔드가 수신해 발행한 app-event를
      // 프론트에서 직접 받아 Now Playing으로 즉시 반영한다.
      if (
        type === "request:stage-changed" &&
        source === "bridge-machining-start" &&
        eventRequest &&
        typeof eventRequest === "object"
      ) {
        const reqAny = eventRequest as any;
        const machineId = String(
          reqAny?.productionSchedule?.machiningProgress?.machineId ||
            reqAny?.productionSchedule?.assignedMachine ||
            reqAny?.assignedMachine ||
            "",
        ).trim();
        const requestId = String(
          payload["requestId"] || reqAny?.requestId || "",
        ).trim();
        const jobId = String(
          reqAny?.productionSchedule?.machiningProgress?.jobId || "",
        ).trim();
        const startedAt = String(
          reqAny?.productionSchedule?.machiningProgress?.startedAt ||
            new Date().toISOString(),
        );

        if (machineId && requestId) {
          setNowPlayingHintMap((prev) => ({
            ...prev,
            [machineId]: {
              machineId,
              jobId: jobId || null,
              requestId,
              bridgePath: null,
              startedAt,
            },
          }));

          setQueueMap((prev) => {
            const list = Array.isArray(prev?.[machineId]) ? prev[machineId] : [];
            if (!list.length) return prev;
            const idx = list.findIndex(
              (item) => String((item as any)?.requestId || "").trim() === requestId,
            );
            const targetIdx = idx >= 0 ? idx : 0;
            if (targetIdx < 0) return prev;

            const nextList = list.map((item, i) => {
              if (i !== targetIdx) return item;
              const prevRec =
                item?.machiningRecord && typeof item.machiningRecord === "object"
                  ? item.machiningRecord
                  : null;
              return {
                ...(item as any),
                machiningRecord: {
                  ...(prevRec || {}),
                  status: "RUNNING",
                  startedAt,
                  completedAt: null,
                  machineId,
                  jobId:
                    jobId ||
                    String((item as any)?.jobId || (item as any)?.id || "").trim() ||
                    null,
                },
              } as QueueItem;
            });

            return {
              ...prev,
              [machineId]: nextList,
            };
          });

          machiningElapsedBaseRef.current[machineId] = Date.now();
          setMachiningElapsedSecondsMap((prev) => ({
            ...prev,
            [machineId]: -1,
          }));

          window.setTimeout(() => {
            void refreshProductionQueues();
          }, 180);
        }
      }

      if (!eventRequest || typeof eventRequest !== "object") return;

      const hasNc = Boolean(
        (eventRequest as any)?.caseInfos?.ncFile?.s3Key ||
          (eventRequest as any)?.ncFile?.s3Key,
      );

      const isNcReadyEvent =
        hasNc &&
        (source === "bg-file-processed" ||
          reviewStage === "cam" ||
          type === "request:stl-metadata-updated");

      if (!isNcReadyEvent) return;

      patchQueueNcMetaFromRequest(eventRequest as any);
      scheduleNcQueueVerifyRefresh();
    },
  });

  useEffect(() => {
    const handleQueuesUpdated = () => {
      void refreshProductionQueues();
    };

    window.addEventListener("cnc-queues-updated", handleQueuesUpdated);
    return () => {
      window.removeEventListener("cnc-queues-updated", handleQueuesUpdated);
    };
  }, [refreshProductionQueues]);

  const refreshLastCompletedFromServer = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(
        "/api/cnc-machines/machining/last-completed?includeRequests=true",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) return;
      const map =
        body?.data && typeof body.data === "object" ? (body.data as any) : {};
      setLastCompletedMap((prev) => ({ ...prev, ...map }));
    } catch {
      // ignore
    }
  }, [token]);

  useEffect(() => {
    void refreshLastCompletedFromServer();
  }, [refreshLastCompletedFromServer]);

  // 가공 중에는 1초 간격으로 경과 시간을 업데이트한다.
  // 경과 시간은 Socket.io tick 이벤트로 패치되며, 프론트엔드 타이머로 부드럽게 표시된다.
  useEffect(() => {
    const hasActive =
      Object.keys(machiningElapsedBaseRef.current || {}).length > 0 ||
      Object.keys(nowPlayingHintMap || {}).length > 0;
    if (!hasActive) return;

    const id = window.setInterval(() => {
      setMachiningElapsedSecondsMap((prev) => {
        const next = { ...prev };
        for (const mid of Object.keys(machiningElapsedBaseRef.current || {})) {
          const base = machiningElapsedBaseRef.current[mid];
          if (base && typeof base === "number") {
            const elapsed = Math.max(
              0,
              Math.floor(((Date.now() as number) - base) / 1000),
            );
            next[mid] = elapsed;
          }
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [nowPlayingHintMap]);

  // 유령 타이머 자동 정리:
  // - nowPlayingHint/elapsed가 남아있지만 실제 가공 큐 항목이 없는 경우 일정 시간 후 제거
  // - 힌트 없이 elapsed만 고아로 남은 경우도 제거
  useEffect(() => {
    const hasRuntimeState =
      Object.keys(nowPlayingHintMap || {}).length > 0 ||
      Object.keys(machiningElapsedSecondsMap || {}).length > 0;
    if (!hasRuntimeState) return;

    const id = window.setInterval(() => {
      const nowMs = Date.now();
      const staleIds = new Set<string>();

      for (const mid of Object.keys(nowPlayingHintMap || {})) {
        const q = Array.isArray(queueMapRef.current?.[mid])
          ? queueMapRef.current[mid]
          : [];
        const hasMachiningQueue = q.some((item) =>
          isMachiningStatus(item?.status),
        );
        if (hasMachiningQueue) continue;

        const hint = nowPlayingHintMap[mid];
        const startedAtMs = hint?.startedAt
          ? new Date(hint.startedAt).getTime()
          : 0;
        const elapsedSec =
          typeof machiningElapsedSecondsMap?.[mid] === "number"
            ? machiningElapsedSecondsMap[mid]
            : -1;
        const ageSec =
          elapsedSec >= 0
            ? elapsedSec
            : startedAtMs > 0
              ? Math.max(0, Math.floor((nowMs - startedAtMs) / 1000))
              : 0;

        if (ageSec >= GHOST_HINT_CLEAR_GRACE_SECONDS) {
          staleIds.add(mid);
        }
      }

      for (const mid of Object.keys(machiningElapsedSecondsMap || {})) {
        if (nowPlayingHintMap?.[mid]) continue;
        const q = Array.isArray(queueMapRef.current?.[mid])
          ? queueMapRef.current[mid]
          : [];
        const hasMachiningQueue = q.some((item) =>
          isMachiningStatus(item?.status),
        );
        if (!hasMachiningQueue) staleIds.add(mid);
      }

      if (staleIds.size === 0) return;
      const mids = Array.from(staleIds);

      setNowPlayingHintMap((prev) => {
        const next = { ...prev };
        for (const mid of mids) delete next[mid];
        return next;
      });

      setMachiningElapsedSecondsMap((prev) => {
        const next = { ...prev };
        for (const mid of mids) delete next[mid];
        return next;
      });

      for (const mid of mids) delete machiningElapsedBaseRef.current[mid];

      console.warn("[MACHINING_BOARD] cleared ghost runtime state", {
        machineIds: mids,
      });
    }, GHOST_HINT_SWEEP_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [nowPlayingHintMap, machiningElapsedSecondsMap]);

  useEffect(() => {
    if (!token) return;

    // 웹소켓 실시간 업데이트: 가공 보드 상태는 이벤트 기반으로 부분 반영하고,
    // 화면 리로드/모달 재마운트 없이 큐/런타임 상태만 갱신한다.
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
      // Set to -1 to indicate "just started, waiting for tick"
      machiningElapsedBaseRef.current[mid] = Date.now();
      setMachiningElapsedSecondsMap((prev) => ({ ...prev, [mid]: -1 }));
    });

    const offTick = onCncMachiningTick((data: any) => {
      const mid = String(data?.machineId || "").trim();
      if (!mid) return;

      const phase = String(data?.phase || "")
        .trim()
        .toUpperCase();
      if (phase === "ALARM") {
        const rid = data?.requestId != null ? String(data.requestId).trim() : "";
        let alarmText = String(data?.message || "").trim();
        if (alarmText) {
          try {
            const parsed = JSON.parse(alarmText);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const summary = parsed
                .slice(0, 3)
                .map(
                  (alarm: any) =>
                    alarm?.displayText ||
                    alarm?.message ||
                    `type=${String(alarm?.type ?? "")}, no=${String(alarm?.no ?? "")}`,
                )
                .join(" / ");
              if (summary) alarmText = summary;
            }
          } catch {
            // message가 JSON 문자열이 아닐 수 있음
          }
        }

        upsertMachiningAlert({
          machineId: mid,
          requestId: rid || null,
          errorCode: null,
          message: "ALARM",
          alarmText: alarmText || "CNC 알람 감지",
        });
      }

      const sec =
        typeof data?.elapsedSeconds === "number" && data.elapsedSeconds >= 0
          ? Math.floor(data.elapsedSeconds)
          : null;
      if (sec == null) return;
      // 서버의 경과 시간을 기준으로 타이머 베이스를 업데이트
      // 이후 프론트엔드 타이머가 이 기준점에서 계속 진행
      const now = Date.now();
      machiningElapsedBaseRef.current[mid] = now - sec * 1000;
      setMachiningElapsedSecondsMap((prev) => ({ ...prev, [mid]: sec }));
    });

    const offCompleted = onCncMachiningCompleted((data: any) => {
      const mid = String(data?.machineId || "").trim();
      if (!mid) return;

      const rid = data?.requestId != null ? String(data.requestId).trim() : "";
      const jid = data?.jobId != null ? String(data.jobId).trim() : "";

      // 완료된 건을 즉시 lastCompletedMap에 반영하기 위해 서버에서 최신 상태를 패치한다.
      // (기존의 단순 낙관적 업데이트는 병원/환자명 등이 누락되는 문제가 있었음)
      void refreshLastCompletedFromServer();

      setNowPlayingHintMap((prev) => {
        const next = { ...prev };
        delete next[mid];
        return next;
      });

      // 큐에서 완료된 건을 제거하여 상단 카운터 자동 갱신
      setQueueMap((prev) => {
        const next = { ...prev };
        if (Array.isArray(next[mid])) {
          next[mid] = next[mid].filter((j) => {
            if (!j || typeof j !== "object") return true;
            const qRid = String((j as any)?.requestId || "").trim();
            if (rid && qRid === rid) return false;
            const qJobId = String(
              (j as any)?.jobId || (j as any)?.id || "",
            ).trim();
            if (jid && qJobId === jid) return false;
            return true;
          });
        }
        return next;
      });

      delete machiningElapsedBaseRef.current[mid];
      setMachiningElapsedSecondsMap((prev) => {
        const next = { ...prev };
        delete next[mid];
        return next;
      });

      void refreshProductionQueues();
    });

    const clearMachiningRuntimeState = (mid: string) => {
      setNowPlayingHintMap((prev) => {
        const next = { ...prev };
        delete next[mid];
        return next;
      });

      delete machiningElapsedBaseRef.current[mid];
      setMachiningElapsedSecondsMap((prev) => {
        const next = { ...prev };
        delete next[mid];
        return next;
      });
    };

    const offFailed = onCncMachiningFailed((data: any) => {
      const mid = String(data?.machineId || "").trim();
      if (!mid) return;

      clearMachiningRuntimeState(mid);

      const alarms = Array.isArray(data?.alarms) ? data.alarms : [];
      const alarmSummary = alarms.length
        ? alarms
            .slice(0, 3)
            .map(
              (alarm: any) =>
                alarm?.displayText ||
                alarm?.message ||
                `type=${String(alarm?.type ?? "")}, no=${String(alarm?.no ?? "")}`,
            )
            .join(" / ")
        : null;

      const failedMessage = alarmSummary
        ? `${alarmSummary}${data?.reason ? ` · ${String(data.reason)}` : ""}${data?.errorCode ? ` · 코드: ${String(data.errorCode)}` : ""}`
        : `${String(data?.reason || "CNC 알람으로 가공이 중단되었습니다.")}${data?.errorCode ? ` · 코드: ${String(data.errorCode)}` : ""}`;

      upsertMachiningAlert({
        machineId: mid,
        requestId: data?.requestId != null ? String(data.requestId) : null,
        errorCode: data?.errorCode != null ? String(data.errorCode) : null,
        message: String(data?.reason || "FAILED"),
        alarmText: failedMessage,
      });

      toast({
        title: `${mid} 가공 알람`,
        description: failedMessage,
        variant: "destructive",
      });

      void refreshProductionQueues();
      void refreshLastCompletedFromServer();
    });

    const offAlarm = onCncMachiningAlarm((data: any) => {
      const mid = String(data?.machineId || "").trim();
      if (!mid) return;

      clearMachiningRuntimeState(mid);

      const alarms = Array.isArray(data?.alarms) ? data.alarms : [];
      const alarmText = alarms.length
        ? alarms
            .slice(0, 3)
            .map(
              (alarm: any) =>
                alarm?.displayText ||
                alarm?.message ||
                `type=${String(alarm?.type ?? "")}, no=${String(alarm?.no ?? "")}`,
            )
            .join(" / ")
        : `${String(data?.message || "CNC 알람이 감지되었습니다.")}${data?.errorCode ? ` · 코드: ${String(data.errorCode)}` : ""}`;

      const alarmToastKey = `${mid}:${alarmText}`;
      const now = Date.now();
      const lastAlarmToastAt = lastAlarmToastAtRef.current[alarmToastKey] ?? 0;
      if (now - lastAlarmToastAt < 15000) {
        return;
      }
      lastAlarmToastAtRef.current[alarmToastKey] = now;

      upsertMachiningAlert({
        machineId: mid,
        requestId: data?.requestId != null ? String(data.requestId) : null,
        errorCode: data?.errorCode != null ? String(data.errorCode) : null,
        message: String(data?.message || data?.reason || "ALARM"),
        alarmText,
      });

      toast({
        title: `${mid} CNC 알람 감지`,
        description: alarmText,
        variant: "destructive",
      });
    });

    const offSettingsChanged = onCncMachineSettingsChanged((data: any) => {
      const mid = String(data?.machineId || "").trim();
      if (!mid || !data?.settings) return;

      setMachines((prevList) => {
        const targetIdx = prevList.findIndex((m) => m.uid === mid);
        if (targetIdx === -1) return prevList;

        const nextList = [...prevList];
        const target = nextList[targetIdx];

        // Update relevant settings from the event
        if (typeof data.settings.allowAutoMachining === "boolean") {
          target.allowAutoMachining = data.settings.allowAutoMachining;
        }
        if (typeof data.settings.allowJobStart === "boolean") {
          target.allowJobStart = data.settings.allowJobStart;
        }
        if (typeof data.settings.allowProgramDelete === "boolean") {
          target.allowProgramDelete = data.settings.allowProgramDelete;
        }
        if (typeof data.settings.allowRequestAssign === "boolean") {
          target.allowRequestAssign = data.settings.allowRequestAssign;
        }

        return nextList;
      });
    });

    return () => {
      offStarted?.();
      offTick?.();
      offCompleted?.();
      offFailed?.();
      offAlarm?.();
      offSettingsChanged?.();
    };
  }, [
    refreshLastCompletedFromServer,
    refreshProductionQueues,
    toast,
    token,
    setMachines,
    upsertMachiningAlert,
  ]);

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

  useEffect(() => {
    if (!token) return;
    if (!Array.isArray(machines) || machines.length === 0) return;

    void refreshMachineStatuses();
  }, [machines, refreshMachineStatuses, token]);

  const lastRefreshAtRef = useRef(0);
  const handleBoardClickCapture = useCallback(
    (event?: { target?: EventTarget | null }) => {
      const target = event?.target;
      if (target instanceof Element) {
        const skipRefresh = target.closest(
          '[data-no-status-refresh="true"], button, [role="dialog"]',
        );
        if (skipRefresh) return;
      }
      const now = Date.now();
      if (now - lastRefreshAtRef.current < 800) return;
      lastRefreshAtRef.current = now;
      void refreshMachineStatuses();
    },
    [refreshMachineStatuses],
  );

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

        if (enabled === true) {
          const machineQueue = Array.isArray(queueMapRef.current?.[m.uid])
            ? (queueMapRef.current[m.uid] as QueueItem[])
            : [];
          const hasRunningNowPlaying = machineQueue.some((item) =>
            isQueueItemRunning(item),
          );
          if (!hasRunningNowPlaying) {
            const resp = await fetch(
              `/api/cnc-machines/machining/auto-trigger/${encodeURIComponent(m.uid)}`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
              },
            );
            const triggerBody: any = await resp.json().catch(() => ({}));
            if (!resp.ok || triggerBody?.success === false) {
              throw new Error(
                triggerBody?.message ||
                  triggerBody?.error ||
                  `${m.name || m.uid} 자동 가공 트리거 호출 실패`,
              );
            }
          }
        }
      }

      if (enabled) {
        toast({
          title: "전체 자동 가공 ON",
          description:
            "각 장비의 자동 연속 가공을 활성화했습니다. (가공 중 장비는 완료 후 다음 건부터 적용)",
        });
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
    async (
      machineId: string,
      requestId: string,
      requestMongoId?: string | null,
    ) => {
      if (!token) return;
      const rid = String(requestId || "").trim();
      const directMongoId = String(requestMongoId || "").trim();
      if (!rid && !directMongoId) return;

      const prevMachineQueue = Array.isArray(queueMapRef.current?.[machineId])
        ? [...queueMapRef.current[machineId]]
        : [];
      const prevHint = nowPlayingHintMap[machineId] || null;
      const prevElapsed = machiningElapsedSecondsMap[machineId];
      const prevBase = machiningElapsedBaseRef.current[machineId];

      const matchesTarget = (slot?: QueueItem | null) => {
        const slotRid = String(slot?.requestId || "").trim();
        const slotMongoId = String(slot?.requestMongoId || "").trim();
        if (rid && slotRid && slotRid === rid) return true;
        if (directMongoId && slotMongoId && slotMongoId === directMongoId)
          return true;
        return false;
      };

      const removedIndex = prevMachineQueue.findIndex((slot) =>
        matchesTarget(slot),
      );
      const removedSlot =
        removedIndex >= 0 ? (prevMachineQueue[removedIndex] ?? null) : null;
      const removedWasRunning = isQueueItemRunning(removedSlot);

      if (removedSlot) {
        setQueueMap((prev) => {
          const list = Array.isArray(prev?.[machineId]) ? [...prev[machineId]] : [];
          const idx = list.findIndex((slot) => matchesTarget(slot));
          if (idx < 0) return prev;
          list.splice(idx, 1);
          return {
            ...prev,
            [machineId]: list,
          };
        });

        setNowPlayingHintMap((prev) => {
          const hint = prev?.[machineId];
          if (!hint) return prev;
          const hintRid = String(hint.requestId || "").trim();
          const removedRid = String(removedSlot.requestId || "").trim();
          if (!removedRid || hintRid !== removedRid) return prev;
          const next = { ...prev };
          delete next[machineId];
          return next;
        });

        if (removedWasRunning) {
          setMachiningElapsedSecondsMap((prev) => {
            if (!Object.prototype.hasOwnProperty.call(prev, machineId)) return prev;
            const next = { ...prev };
            delete next[machineId];
            return next;
          });
          delete machiningElapsedBaseRef.current[machineId];
        }
      }

      const rollbackPendingToast = toast({
        title: "준비 롤백 요청 전송됨",
        description: "가공 건을 준비 단계로 되돌리는 중입니다. 잠시만 기다려주세요.",
        duration: 3000,
        skipDuplicateCheck: true,
      });

      try {
        let reqId = directMongoId;
        if (!reqId) {
          reqId = String(removedSlot?.requestMongoId || "").trim();
        }
        if (!reqId) {
          const res = await fetch(
            `/api/requests/by-request/${encodeURIComponent(rid)}/summary`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          );
          const body: any = await res.json().catch(() => ({}));
          reqId = String(body?.data?._id || "").trim();
          if (!res.ok || body?.success === false || !reqId) {
            throw new Error(
              body?.message || body?.error || "롤백 대상 의뢰 조회 실패",
            );
          }
        }

        const rollbackRes = await fetch(
          `/api/requests/${encodeURIComponent(reqId)}/stage-file?stage=machining&rollbackOnly=1`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );
        const rollbackBody: any = await rollbackRes.json().catch(() => ({}));
        if (!rollbackRes.ok || rollbackBody?.success === false) {
          throw new Error(
            rollbackBody?.message ||
              rollbackBody?.error ||
              "준비로 되돌리기 실패",
          );
        }

        if (rollbackPendingToast?.id) {
          dismiss(rollbackPendingToast.id);
        }

        window.dispatchEvent(new Event("cnc-queues-updated"));
        window.dispatchEvent(new Event("request-rollback"));
        void refreshProductionQueues();
        void refreshLastCompletedFromServer();
        void queryClient.invalidateQueries({
          queryKey: ["worksheet-assigned-summary"],
        });
        void queryClient.refetchQueries({
          queryKey: ["worksheet-assigned-summary"],
          type: "active",
        });
      } catch (e: any) {
        if (rollbackPendingToast?.id) {
          dismiss(rollbackPendingToast.id);
        }

        if (removedSlot) {
          setQueueMap((prev) => ({
            ...prev,
            [machineId]: prevMachineQueue,
          }));

          if (prevHint) {
            setNowPlayingHintMap((prev) => ({
              ...prev,
              [machineId]: prevHint,
            }));
          }

          if (removedWasRunning) {
            if (typeof prevElapsed === "number") {
              setMachiningElapsedSecondsMap((prev) => ({
                ...prev,
                [machineId]: prevElapsed,
              }));
            }
            if (typeof prevBase === "number") {
              machiningElapsedBaseRef.current[machineId] = prevBase;
            }
          }
        }

        toast({
          title: "준비로 되돌리기 실패",
          description: e?.message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
      }
    },
    [
      machiningElapsedSecondsMap,
      nowPlayingHintMap,
      queryClient,
      refreshLastCompletedFromServer,
      refreshProductionQueues,
      toast,
      dismiss,
      token,
    ],
  );

  const approveMachiningFromRollback = useCallback(
    async (requestMongoId: string) => {
      if (!token) return;
      const id = String(requestMongoId || "").trim();
      if (!id) return;

      try {
        const res = await fetch(
          `/api/requests/${encodeURIComponent(id)}/review-status`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              stage: "machining",
              status: "APPROVED",
              reason: "",
            }),
          },
        );

        const body: any = await res.json().catch(() => ({}));
        if (!res.ok || body?.success === false) {
          throw new Error(body?.message || body?.error || "승인 처리 실패");
        }

        window.dispatchEvent(new Event("cnc-queues-updated"));
        await refreshProductionQueues();
        void queryClient.invalidateQueries({
          queryKey: ["worksheet-assigned-summary"],
        });
        void queryClient.refetchQueries({
          queryKey: ["worksheet-assigned-summary"],
          type: "active",
        });
        toast({
          title: "승인 완료",
          description: "재가공 없이 다음 단계로 전환했습니다.",
          duration: 2500,
        });
      } catch (e: any) {
        toast({
          title: "승인 실패",
          description: e?.message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
      }
    },
    [queryClient, refreshProductionQueues, toast, token],
  );

  const machiningAlerts = useMemo(
    () =>
      Object.values(machiningAlertMap || {}).sort((a, b) =>
        String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || "")),
      ),
    [machiningAlertMap],
  );

  return {
    machines,
    mergedMachines,
    filteredMachines,
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
    reassignProductionQueues,
    handleBoardClickCapture,
    isMockFromBackend,
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
    approveMachiningFromRollback,
    machiningAlerts,
    clearMachiningAlerts,
    token,
  };
};
