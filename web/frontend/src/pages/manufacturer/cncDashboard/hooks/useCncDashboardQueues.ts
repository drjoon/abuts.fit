import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiFetch } from "@/lib/apiClient";
import {
  onCncMachiningCompleted,
  onCncMachiningTimeout,
  onCncMachiningCanceled,
  onCncMachiningTick,
  onCncMachiningStarted,
  initializeSocket,
} from "@/lib/socket";

import type { Machine } from "../../cnc/types";
import type { CncJobItem } from "../../cnc/components/CncReservationModal";
import type { PlaylistJobItem } from "../../cnc/components/CncPlaylistDrawer";

type LastCompletedMachining = {
  machineId: string;
  jobId: string | null;
  requestId: string | null;
  displayLabel: string | null;
  completedAt: string;
  durationSeconds: number;
};

interface Params {
  machines: Machine[];
  setMachines: any;
  token: string;
  toast: any;
  ensureCncWriteAllowed: any;
  setError: any;
  callRaw: (uid: string, method: string, payload?: any) => Promise<any>;
  refreshStatusFor: (uid: string) => Promise<void>;
  fetchProgramList: () => Promise<void>;
}

export function useCncDashboardQueues({
  machines,
  setMachines,
  token,
  toast,
  ensureCncWriteAllowed,
  setError,
  callRaw,
  refreshStatusFor,
  fetchProgramList,
}: Params) {
  const machinesRef = useRef<Machine[]>(machines);
  useEffect(() => {
    machinesRef.current = Array.isArray(machines) ? machines : [];
  }, [machines]);

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

  const [reservationSummaryMap, setReservationSummaryMap] = useState<
    Record<string, string>
  >({});
  const [reservationJobsMap, setReservationJobsMap] = useState<
    Record<string, CncJobItem[]>
  >({});
  const reservationJobsMapRef = useRef<Record<string, CncJobItem[]>>({});
  useEffect(() => {
    reservationJobsMapRef.current = reservationJobsMap;
  }, [reservationJobsMap]);
  const [worksheetQueueCountMap, setWorksheetQueueCountMap] = useState<
    Record<string, number>
  >({});
  const [reservationTotalQtyMap, setReservationTotalQtyMap] = useState<
    Record<string, number>
  >({});

  const [machiningElapsedSecondsMap, setMachiningElapsedSecondsMap] = useState<
    Record<string, number>
  >({});

  const [lastCompletedMap, setLastCompletedMap] = useState<
    Record<string, LastCompletedMachining>
  >({});

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

  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [playlistTarget, setPlaylistTarget] = useState<Machine | null>(null);
  const [playlistReadOnly, setPlaylistReadOnly] = useState(false);
  const [playingNextMap, setPlayingNextMap] = useState<Record<string, boolean>>(
    {},
  );

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
            // 항상 최신 큐를 조회하기 위해 캐시를 우회한다.
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${token}`,
              "Cache-Control": "no-cache",
              Pragma: "no-cache",
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
            job?.originalFileName ||
            job?.fileName ||
            job?.programName ||
            (programNo != null ? `#${programNo}` : "-");
          const id = String(job?.id || `${uid}:${nameRaw}`);
          return {
            id,
            jobId: id as any,
            source: metaSource === "db" ? "db" : "bridge",
            kind: kindRaw || "",
            programNo,
            name: String(nameRaw || "-"),
            qty,
            paused,
            ...(job?.s3Key ? { s3Key: String(job.s3Key) } : {}),
            ...(job?.s3Bucket ? { s3Bucket: String(job.s3Bucket) } : {}),
            ...(bridgePath ? { bridgePath } : {}),
            storeScope: "direct_root",
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
    [setError, toast, token],
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
      // ignore
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

  // 가공 완료 처리 함수
  // 브리지 서버에서 가공 완료 후 자동으로 다음 작업을 시작하므로,
  // 프론트는 현재 작업만 제거하고 상태를 갱신한다.
  const handleMachiningCompleted = useCallback(
    (uid: string) => {
      // 1) 현재 작업 제거
      setReservationJobsMap((prev) => {
        const jobs = prev[uid] || [];
        const filtered = jobs.slice(1);
        if (filtered.length === 0) {
          const nextMap = { ...prev };
          delete nextMap[uid];
          return nextMap;
        }
        return { ...prev, [uid]: filtered };
      });

      // 2) Now Playing 상태 제거
      setNowPlayingMap((prev) => {
        const next = { ...prev };
        delete next[uid];
        return next;
      });

      // 3) 상태 갱신 + 큐 재조회
      void refreshStatusFor(uid);
      void fetchProgramList();
      const m = machines.find((x) => x.uid === uid);
      if (m) {
        void loadBridgeQueueForMachine(m, { silent: true });
      }
      void refreshDbQueuesForAllMachines();
    },
    [
      refreshStatusFor,
      fetchProgramList,
      machines,
      loadBridgeQueueForMachine,
      refreshDbQueuesForAllMachines,
    ],
  );

  useEffect(() => {
    if (!token) return;

    // 소켓 연결 초기화 (Hook 순서 변경 없이 기존 구독 effect 내부에서 처리)
    initializeSocket(token);

    const resolveMachineId = (raw: any) => {
      const mid = String(raw || "").trim();
      if (!mid) return "";
      const upper = mid.toUpperCase();
      const list = machinesRef.current || [];
      const found = list.find(
        (m) => String(m?.uid || "").toUpperCase() === upper,
      );
      return found?.uid || mid;
    };

    const unsubscribeTick = onCncMachiningTick((data) => {
      const mid = resolveMachineId(data?.machineId);
      if (!mid) return;
      const elapsed =
        typeof (data as any)?.elapsedSeconds === "number"
          ? Math.max(0, Math.floor((data as any).elapsedSeconds))
          : 0;
      const tickAtMs = data?.tickAt
        ? new Date(data.tickAt).getTime()
        : Date.now();
      machiningElapsedBaseRef.current[mid] = {
        elapsedSeconds: elapsed,
        tickAtMs: Number.isFinite(tickAtMs) ? tickAtMs : Date.now(),
      };

      if (import.meta.env.DEV) {
        console.log("[cnc][tick]", { machineId: mid, elapsedSeconds: elapsed });
      }
      setMachiningElapsedSecondsMap((prev) => {
        if (prev[mid] === elapsed) return prev;
        return { ...prev, [mid]: elapsed };
      });
    });

    // 브리지 서버 자동 가공 완료 시에도 UI 갱신
    const unsubscribeCompleted = onCncMachiningCompleted((data) => {
      const mid = resolveMachineId(data?.machineId);
      if (!mid) return;

      const rid =
        (data as any)?.requestId != null
          ? String((data as any).requestId).trim()
          : "";
      const jid =
        (data as any)?.jobId != null ? String((data as any).jobId).trim() : "";
      const jobs = reservationJobsMapRef.current?.[mid] || [];
      const found = jobs.find((j) => {
        if (!j || typeof j !== "object") return false;
        const jId = String((j as any)?.id || "").trim();
        const jReq = String((j as any)?.requestId || "").trim();
        if (rid && jReq === rid) return true;
        if (jid && jId === jid) return true;
        return false;
      });
      const displayLabelRaw = String((found as any)?.name || "").trim();
      const displayLabel = displayLabelRaw || rid || jid;

      const durationSeconds = (() => {
        const fromDuration =
          typeof (data as any)?.durationSeconds === "number" &&
          (data as any).durationSeconds >= 0
            ? Math.floor((data as any).durationSeconds)
            : null;
        if (fromDuration != null) return fromDuration;

        const fromElapsed =
          typeof (data as any)?.elapsedSeconds === "number" &&
          (data as any).elapsedSeconds >= 0
            ? Math.floor((data as any).elapsedSeconds)
            : null;
        if (fromElapsed != null) return fromElapsed;

        const fromBase = machiningElapsedBaseRef.current?.[mid]?.elapsedSeconds;
        if (typeof fromBase === "number" && fromBase >= 0) {
          return Math.floor(fromBase);
        }

        return 0;
      })();

      setLastCompletedMap((prev) => ({
        ...prev,
        [mid]: {
          machineId: mid,
          jobId:
            (data as any)?.jobId != null ? String((data as any).jobId) : null,
          requestId:
            (data as any)?.requestId != null
              ? String((data as any).requestId)
              : null,
          displayLabel: String(displayLabel || "").trim() || null,
          completedAt: String(
            (data as any)?.completedAt || new Date().toISOString(),
          ),
          durationSeconds,
        },
      }));

      if (import.meta.env.DEV) {
        console.log("[cnc][completed]", { machineId: mid, data });
      }
      handleMachiningCompleted(mid);
      setMachiningElapsedSecondsMap((prev) => {
        const next = { ...prev };
        delete next[mid];
        return next;
      });
    });

    return () => {
      unsubscribeTick();
      unsubscribeCompleted();
    };
  }, [token, handleMachiningCompleted]);

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

          ref.order = null;
          ref.qtyByJobId = {};
          ref.deleteJobIds = new Set();
          ref.t = null;

          try {
            const res = await fetch(
              `/api/cnc-machines/${encodeURIComponent(commitMachineId)}/bridge-queue/batch`,
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
      loadBridgeQueueForMachine,
      machines,
      setError,
      toast,
      token,
      queueBatchRef,
      queueCommitSeqRef,
    ],
  );

  const onTogglePause = useCallback(
    async (machine: Machine, jobId: string) => {
      if (!jobId) return;
      const uid = machine.uid;
      if (!uid) return;
      if (!token) return;

      const currentJobs = reservationJobsMap?.[uid] || [];
      const targetJob = currentJobs.find((j) => j.id === jobId);
      if (!targetJob) return;

      const currentPaused = !!targetJob.paused;
      const newPaused = !currentPaused;

      // 로컬 상태 즉시 업데이트
      setReservationJobsMap((prev) => {
        const current = prev[uid] || [];
        const nextJobs = current.map((j) =>
          j.id === jobId ? { ...j, paused: newPaused } : j,
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
          jsonBody: { paused: newPaused },
        });
        const pauseBody: any = pauseRes.data ?? {};
        if (!pauseRes.ok || pauseBody?.success === false) {
          throw new Error(
            pauseBody?.message || pauseBody?.error || "pause 상태 변경 실패",
          );
        }

        toast({
          title: newPaused ? "일시정지" : "재개",
          description: newPaused
            ? "다음 파일이 일시정지 상태로 설정되었습니다."
            : "다음 파일이 자동 시작 상태로 설정되었습니다.",
        });
      } catch (e: any) {
        const msg = e?.message ?? "pause 상태 변경 중 오류";
        setError(msg);
        toast({
          title: "상태 변경 실패",
          description: msg,
          variant: "destructive",
        });
        // 에러 시 원래 상태로 복구
        setReservationJobsMap((prev) => {
          const current = prev[uid] || [];
          const nextJobs = current.map((j) =>
            j.id === jobId ? { ...j, paused: currentPaused } : j,
          );
          return {
            ...prev,
            [uid]: nextJobs,
          };
        });
      }
    },
    [reservationJobsMap, setError, toast, token],
  );

  const handlePlayNextUp = useCallback(
    async (machineId: string) => {
      const uid = String(machineId || "").trim();
      if (!uid) return;

      const jobs = reservationJobsMap[uid] || [];
      const nextJob = jobs[0];
      if (!nextJob) {
        toast({
          title: "가공 시작 불가",
          description: "Next Up 작업이 없습니다.",
          variant: "destructive",
        });
        return;
      }

      const ok = await ensureCncWriteAllowed();
      if (!ok) return;

      // 알람 상태 확인 (mock 모드에서는 건너뜀, 실모드에서는 표시만)
      const isMockMode =
        machines.find((m) => m.uid === uid)?.dummySettings?.enabled !== false;
      if (!isMockMode) {
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
              jsonBody: { headType: 1 },
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
                      a ? `type ${a.type ?? "?"} / no ${a.no ?? "?"}` : "-",
                    )
                    .join(", ")
                : "-";
            toast({
              title: "알람 상태",
              description: `장비가 Alarm 상태입니다. (${alarmText})`,
              variant: "destructive",
            });
          }
        } catch (e: any) {
          // 상태 조회 실패 시에도 차단하지 않고 진행
        }
      }

      setPlayingNextMap((prev) => ({ ...prev, [uid]: true }));

      try {
        // bridge-queue의 order를 조정하고, 첫 job을 unpause 하여(auto-start 허용) 연속 가공 워커가 시작하도록 한다.
        const jobs = reservationJobsMap[uid] || [];
        const firstId = String(jobs?.[0]?.id || "").trim();
        const rest = jobs.slice(1);
        const order = [
          firstId,
          ...rest.map((j) => String(j?.id || "").trim()).filter(Boolean),
        ].filter(Boolean);
        if (!firstId) throw new Error("Now Playing 작업이 없습니다.");

        const batchRes = await apiFetch({
          path: `/api/cnc-machines/${encodeURIComponent(uid)}/bridge-queue/batch`,
          method: "POST",
          token,
          jsonBody: {
            order,
            // 첫 작업을 재생 상태로 전환 (allowAutoStart 추론: paused=false)
            pauseUpdates: [{ jobId: firstId, paused: false }],
          },
        });
        const batchBody: any = batchRes.data ?? {};
        if (!batchRes.ok || batchBody?.success === false) {
          throw new Error(
            batchBody?.message ||
              batchBody?.error ||
              "브리지 예약 큐 반영에 실패했습니다.",
          );
        }

        // Next Up → Now Playing 반영: 첫 작업 제거 후 재조회
        setReservationJobsMap((prev) => {
          const current = prev[uid] || [];
          const filtered = current.slice(1);
          if (filtered.length === 0) {
            const nextMap = { ...prev };
            delete nextMap[uid];
            return nextMap;
          }
          return { ...prev, [uid]: filtered };
        });

        // 상태/프로그램 목록/큐 다시 로드
        void refreshStatusFor(uid);
        void fetchProgramList();
        const m = machines.find((x) => x.uid === uid);
        if (m) {
          void loadBridgeQueueForMachine(m, { silent: true });
        }
      } catch (e: any) {
        const msg = e?.message ?? "가공 시작 요청 중 오류";
        setError(msg);
        toast({
          title: "가공 시작 오류",
          description: msg,
          variant: "destructive",
        });
      } finally {
        setPlayingNextMap((prev) => {
          const next = { ...prev };
          delete next[uid];
          return next;
        });
      }
    },
    [
      ensureCncWriteAllowed,
      fetchProgramList,
      loadBridgeQueueForMachine,
      machines,
      refreshStatusFor,
      reservationJobsMap,
      setError,
      toast,
      token,
    ],
  );

  // Now Playing에서 가공 시작 → 20분간 10초 폴링 → 완료 시 Next Up 자동 승격
  const [nowPlayingMap, setNowPlayingMap] = useState<Record<string, boolean>>(
    {},
  );

  const machiningElapsedBaseRef = useRef<
    Record<string, { elapsedSeconds: number; tickAtMs: number }>
  >({});

  // WS tick 주기가 느려도 Now Playing 경과시간이 1초 단위로 증가하도록 로컬 타이머 보강
  useEffect(() => {
    if (!token) return;

    const t = setInterval(() => {
      const base = machiningElapsedBaseRef.current;
      const now = Date.now();

      setMachiningElapsedSecondsMap((prev) => {
        let changed = false;
        const next: Record<string, number> = { ...prev };

        for (const [mid, v] of Object.entries(base)) {
          if (!v) continue;
          if (!nowPlayingMap[mid]) continue;
          const add = Math.max(0, Math.floor((now - v.tickAtMs) / 1000));
          const calc = Math.max(0, Math.floor(v.elapsedSeconds + add));
          if (next[mid] !== calc) {
            next[mid] = calc;
            changed = true;
          }
        }

        return changed ? next : prev;
      });
    }, 1000);

    return () => {
      clearInterval(t);
    };
  }, [nowPlayingMap, token]);

  // WS started/tick/completed/timeout 기반으로 Now Playing 타이머를 시작/종료한다.
  useEffect(() => {
    if (!token) return;

    const resolveMachineId = (raw: any) => {
      const mid = String(raw || "").trim();
      if (!mid) return "";
      const upper = mid.toUpperCase();
      const list = machinesRef.current || [];
      const found = list.find(
        (m) => String(m?.uid || "").toUpperCase() === upper,
      );
      return found?.uid || mid;
    };

    const unsubStarted = onCncMachiningStarted((data: any) => {
      const mid = resolveMachineId(data?.machineId);
      if (!mid) return;

      if (import.meta.env.DEV) {
        console.log("[cnc][started]", { machineId: mid, data });
      }
      setNowPlayingMap((prev) => ({ ...prev, [mid]: true }));
      const startedAtMs = data?.startedAt
        ? new Date(data.startedAt).getTime()
        : Date.now();
      machiningElapsedBaseRef.current[mid] = {
        elapsedSeconds: 0,
        tickAtMs: Number.isFinite(startedAtMs) ? startedAtMs : Date.now(),
      };
      setMachiningElapsedSecondsMap((prev) => ({ ...prev, [mid]: 0 }));
    });

    const unsubTick = onCncMachiningTick((data: any) => {
      const mid = resolveMachineId(data?.machineId);
      if (!mid) return;
      const elapsed =
        typeof data?.elapsedSeconds === "number"
          ? Math.max(0, Math.floor(data.elapsedSeconds))
          : 0;
      const tickAtMs = data?.tickAt
        ? new Date(data.tickAt).getTime()
        : Date.now();
      machiningElapsedBaseRef.current[mid] = {
        elapsedSeconds: elapsed,
        tickAtMs: Number.isFinite(tickAtMs) ? tickAtMs : Date.now(),
      };

      if (import.meta.env.DEV) {
        console.log("[cnc][tick]", { machineId: mid, elapsedSeconds: elapsed });
      }
      setNowPlayingMap((prev) => ({ ...prev, [mid]: true }));
      setMachiningElapsedSecondsMap((prev) => {
        if (prev[mid] === elapsed) return prev;
        return { ...prev, [mid]: elapsed };
      });
    });

    const stopFor = (mid: string) => {
      setNowPlayingMap((prev) => {
        if (!prev[mid]) return prev;
        const next = { ...prev };
        delete next[mid];
        return next;
      });
      setMachiningElapsedSecondsMap((prev) => {
        if (prev[mid] == null) return prev;
        const next = { ...prev };
        delete next[mid];
        return next;
      });
      delete machiningElapsedBaseRef.current[mid];
    };

    const unsubCompleted = onCncMachiningCompleted((data: any) => {
      const mid = resolveMachineId(data?.machineId);
      if (!mid) return;

      if (import.meta.env.DEV) {
        console.log("[cnc][completed]", { machineId: mid, data });
      }
      stopFor(mid);
    });

    const unsubTimeout = onCncMachiningTimeout((data: any) => {
      const mid = resolveMachineId(data?.machineId);
      if (!mid) return;
      stopFor(mid);
    });

    const unsubCanceled = onCncMachiningCanceled((data: any) => {
      const mid = resolveMachineId(data?.machineId);
      if (!mid) return;
      stopFor(mid);
    });

    return () => {
      unsubStarted?.();
      unsubTick?.();
      unsubCompleted?.();
      unsubTimeout?.();
      unsubCanceled?.();
    };
  }, [token]);

  const handlePlayNowPlaying = useCallback(
    async (machineId: string) => {
      const uid = String(machineId || "").trim();
      if (!uid) return;

      const machine = machines.find((m) => m?.uid === uid) || null;
      const dummyEnabled = machine?.dummySettings?.enabled !== false;

      const jobs = reservationJobsMap[uid] || [];
      const nowJob = jobs[0];
      if (!nowJob) {
        toast({
          title: "가공 시작 불가",
          description: "Now Playing 작업이 없습니다.",
          variant: "destructive",
        });
        return;
      }

      const ok = await ensureCncWriteAllowed();
      if (!ok) return;

      // 알람 상태 확인 (mock 모드에서는 건너뜀, 실모드에서는 표시만)
      const isMockMode =
        machines.find((m) => m.uid === uid)?.dummySettings?.enabled !== false;
      if (!isMockMode) {
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
              jsonBody: { headType: 1 },
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
                      a ? `type ${a.type ?? "?"} / no ${a.no ?? "?"}` : "-",
                    )
                    .join(", ")
                : "-";
            toast({
              title: "알람 상태",
              description: `장비가 Alarm 상태입니다. (${alarmText})`,
              variant: "destructive",
            });
          }
        } catch (e: any) {
          // 상태 조회 실패 시에도 차단하지 않고 진행
        }
      }

      // nowPlayingMap은 WS(started/tick) 이벤트로 켜진다.

      try {
        // bridge-queue에서 현재 Now Playing(job[0])을 unpause 하여(auto-start 허용) 연속 가공 워커가 시작하도록 한다.
        const jobs = reservationJobsMap[uid] || [];
        const firstId = String(jobs?.[0]?.id || "").trim();
        if (!firstId) throw new Error("Now Playing 작업이 없습니다.");

        const batchRes = await apiFetch({
          path: `/api/cnc-machines/${encodeURIComponent(uid)}/bridge-queue/batch`,
          method: "POST",
          token,
          jsonBody: {
            pauseUpdates: [{ jobId: firstId, paused: false }],
          },
        });
        const batchBody: any = batchRes.data ?? {};
        if (!batchRes.ok || batchBody?.success === false) {
          throw new Error(
            batchBody?.message ||
              batchBody?.error ||
              "브리지 예약 큐 반영에 실패했습니다.",
          );
        }

        toast({
          title: "가공 시작",
          description: `${nowJob.name || "작업"} 가공을 시작합니다.`,
        });
      } catch (e: any) {
        const msg = e?.message ?? "가공 시작 요청 중 오류";
        setError(msg);
        toast({
          title: "가공 시작 오류",
          description: msg,
          variant: "destructive",
        });
        setNowPlayingMap((prev) => {
          const next = { ...prev };
          delete next[uid];
          return next;
        });
        setMachiningElapsedSecondsMap((prev) => {
          const next = { ...prev };
          delete next[uid];
          return next;
        });
      }
    },
    [
      ensureCncWriteAllowed,
      fetchProgramList,
      refreshStatusFor,
      reservationJobsMap,
      setError,
      toast,
      token,
    ],
  );

  return {
    loadBridgeQueueForMachine,
    loadQueueForMachine,
    machiningElapsedSecondsMap,
    lastCompletedMap,
    refreshDbQueuesForAllMachines,
    reservationSummaryMap,
    reservationJobsMap,
    worksheetQueueCountMap,
    queueBatchRef,
    scheduleQueueBatchCommit,
    onTogglePause,
    setReservationJobsMap,
    setReservationSummaryMap,
    setReservationTotalQtyMap,
    reservationTotalQtyMap,
    playlistOpen,
    setPlaylistOpen,
    playlistTarget,
    setPlaylistTarget,
    playlistJobs,
    playlistReadOnly,
    setPlaylistReadOnly,
    handlePlayNextUp,
    handlePlayNowPlaying,
    playingNextMap,
    nowPlayingMap,
  };
}
