import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiFetch } from "@/lib/apiClient";

import type { Machine } from "../../cnc/types";
import type { CncJobItem } from "../../cnc/components/CncReservationModal";
import type { PlaylistJobItem } from "../../cnc/components/CncPlaylistDrawer";

interface Params {
  token: string | null;
  machines: Machine[];
  ensureCncWriteAllowed: () => Promise<boolean>;
  toast: (args: any) => void;
  setError: (msg: string | null) => void;
  callRaw: (uid: string, method: string, payload?: any) => Promise<any>;
  refreshStatusFor: (uid: string) => Promise<void>;
  fetchProgramList: () => Promise<void>;
  handleManualCardPlay: (machineId: string) => Promise<void>;
}

export function useCncDashboardQueues({
  token,
  machines,
  ensureCncWriteAllowed,
  toast,
  setError,
  callRaw,
  refreshStatusFor,
  fetchProgramList,
  handleManualCardPlay,
}: Params) {
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
  const [worksheetQueueCountMap, setWorksheetQueueCountMap] = useState<
    Record<string, number>
  >({});
  const [reservationTotalQtyMap, setReservationTotalQtyMap] = useState<
    Record<string, number>
  >({});

  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [playlistTarget, setPlaylistTarget] = useState<Machine | null>(null);
  const [playlistReadOnly, setPlaylistReadOnly] = useState(false);

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
    [setError, toast, token],
  );

  const uploadManualCardFiles = useCallback(
    async (machineId: string, files: FileList | File[]) => {
      const mid = String(machineId || "").trim();
      if (!mid) throw new Error("장비 ID가 올바르지 않습니다.");
      if (!token) throw new Error("로그인이 필요합니다.");

      const list = Array.isArray(files) ? files : Array.from(files || []);
      if (list.length === 0) return;

      const ok = await ensureCncWriteAllowed();
      if (!ok) {
        toast({
          title: "업로드 불가",
          description: "CNC 업로드는 제조사 권한/PIN 확인이 필요합니다.",
          variant: "destructive",
        });
        return;
      }

      let uploadedCount = 0;
      let lastSlotNo: any = null;
      for (const file of list) {
        if (!file) continue;

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
        lastSlotNo = data?.slotNo ?? lastSlotNo;
        uploadedCount += 1;
      }

      toast({
        title: "업로드 완료",
        description:
          uploadedCount <= 1
            ? lastSlotNo
              ? `CNC 슬롯 O${lastSlotNo}에 업로드되었습니다.`
              : "업로드되었습니다."
            : `${uploadedCount}개 파일이 업로드되었습니다.`,
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

      const kind = String((targetJob as any)?.kind || "").trim();
      const source = String((targetJob as any)?.source || "").trim();
      if (kind === "manual_file" || source === "manual_insert") {
        await handleManualCardPlay(uid);
        return;
      }

      const wasPaused = !!targetJob.paused;
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
      if (!ok) return;

      try {
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
                      a ? `type ${a.type ?? "?"} / no ${a.no ?? "?"}` : "-",
                    )
                    .join(", ")
                : "-";
            throw new Error(`장비가 Alarm 상태입니다. (${alarmText})`);
          }
        } catch (e: any) {
          const msg =
            e?.message || "장비 상태가 Alarm이라 가공을 시작할 수 없습니다.";
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
            startBody?.message || startBody?.error || "가공 시작 실패",
          );
        }

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
              activeBody?.data != null ? activeBody.data : activeBody;
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
        void fetchProgramList();
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
    },
    [
      ensureCncWriteAllowed,
      fetchProgramList,
      handleManualCardPlay,
      refreshStatusFor,
      reservationJobsMap,
      setError,
      toast,
      token,
    ],
  );

  return {
    queueBatchRef,
    scheduleQueueBatchCommit,

    reservationSummaryMap,
    reservationJobsMap,
    worksheetQueueCountMap,
    reservationTotalQtyMap,

    playlistOpen,
    setPlaylistOpen,
    playlistTarget,
    setPlaylistTarget,
    playlistReadOnly,
    setPlaylistReadOnly,
    playlistJobs,

    loadBridgeQueueForMachine,
    loadQueueForMachine,
    uploadManualCardFiles,
    refreshDbQueuesForAllMachines,

    setReservationJobsMap,
    setReservationSummaryMap,
    setReservationTotalQtyMap,

    onTogglePause,
  };
}
