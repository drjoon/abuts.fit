import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiFetch } from "@/lib/apiClient";
import {
  subscribeCncMachining,
  unsubscribeCncMachining,
  onCncMachiningCompleted,
  onCncMachiningTimeout,
  onCncMachiningTick,
} from "@/lib/socket";

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
  handleManualCardPlay: (machineId: string, itemId?: string) => Promise<void>;
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

  const [uploadProgress, setUploadProgress] = useState<{
    machineId: string;
    fileName: string;
    percent: number;
  } | null>(null);

  const [machiningElapsedSecondsMap, setMachiningElapsedSecondsMap] = useState<
    Record<string, number>
  >({});

  const uploadSeqRef = useRef(0);

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

      const seq = (uploadSeqRef.current += 1);
      const setProgressSafe = (
        next: { machineId: string; fileName: string; percent: number } | null,
      ) => {
        if (uploadSeqRef.current !== seq) return;
        setUploadProgress(next as any);
      };

      const uploadOne = async (file: File) => {
        return await new Promise<any>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.timeout = 10 * 60 * 1000;
          xhr.open(
            "POST",
            `/api/cnc-machines/${encodeURIComponent(mid)}/manual-file/upload`,
          );
          xhr.setRequestHeader("Authorization", `Bearer ${token}`);

          const fileName = String(file?.name || "").trim() || "(unknown)";
          setProgressSafe({ machineId: mid, fileName, percent: 0 });
          xhr.upload.onprogress = (evt) => {
            if (!evt.lengthComputable) return;
            const percent = Math.max(
              0,
              Math.min(100, Math.round((evt.loaded / evt.total) * 100)),
            );
            setProgressSafe({ machineId: mid, fileName, percent });
          };

          xhr.onload = () => {
            let parsed: any = {};
            try {
              parsed = xhr.responseText ? JSON.parse(xhr.responseText) : {};
            } catch {
              parsed = {};
            }
            if (xhr.status >= 200 && xhr.status < 300) {
              setProgressSafe({ machineId: mid, fileName, percent: 100 });
              resolve(parsed);
              return;
            }
            const msg =
              parsed?.message ||
              parsed?.error ||
              `장비카드 업로드에 실패했습니다. (HTTP ${xhr.status})`;
            reject(new Error(msg));
          };
          xhr.onerror = () =>
            reject(new Error("장비카드 업로드에 실패했습니다."));
          xhr.onabort = () => reject(new Error("업로드가 취소되었습니다."));
          xhr.ontimeout = () =>
            reject(new Error("업로드 시간이 초과되었습니다."));

          const form = new FormData();
          form.append("file", file);
          form.append("originalFileName", fileName);
          xhr.send(form);
        });
      };

      let uploadedCount = 0;
      const failedFiles: { name: string; message: string }[] = [];
      let lastSlotNo: any = null;

      try {
        for (const file of list) {
          if (!file) continue;
          const fileName = String(file.name || "").trim() || "(unknown)";
          try {
            const body = await uploadOne(file);
            const data = body?.data ?? body;
            lastSlotNo = data?.slotNo ?? lastSlotNo;
            uploadedCount += 1;
          } catch (e: any) {
            failedFiles.push({
              name: fileName,
              message: e?.message || "업로드 실패",
            });
          }
        }
      } finally {
        setTimeout(() => setProgressSafe(null), 800);
      }

      if (uploadedCount > 0) {
        toast({
          title: "업로드 완료",
          description:
            uploadedCount <= 1
              ? lastSlotNo
                ? `CNC 슬롯 O${lastSlotNo}에 업로드되었습니다.`
                : "업로드되었습니다."
              : `${uploadedCount}개 파일이 업로드되었습니다.`,
        });
      }

      if (failedFiles.length > 0) {
        const summary =
          failedFiles.length === 1
            ? `${failedFiles[0].name}: ${failedFiles[0].message}`
            : `${failedFiles.length}개 실패: ${failedFiles
                .slice(0, 3)
                .map((f) => f.name)
                .join(", ")}${failedFiles.length > 3 ? "…" : ""}`;
        toast({
          title: uploadedCount > 0 ? "일부 파일 업로드 실패" : "업로드 실패",
          description: summary,
          variant: "destructive",
        });
      }

      if (uploadedCount > 0) {
        const m = machines.find((x) => x?.uid === mid) || null;
        if (m) {
          await loadBridgeQueueForMachine(m, { silent: true });
        }
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

    const unsubscribeTick = onCncMachiningTick((data) => {
      const mid = String(data?.machineId || "").trim();
      if (!mid) return;
      const elapsed =
        typeof (data as any)?.elapsedSeconds === "number"
          ? Math.max(0, Math.floor((data as any).elapsedSeconds))
          : 0;
      setMachiningElapsedSecondsMap((prev) => {
        if (prev[mid] === elapsed) return prev;
        return { ...prev, [mid]: elapsed };
      });
    });

    return () => {
      unsubscribeTick();
    };
  }, [token]);

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

      const path =
        (nextJob as any)?.bridgePath || (nextJob as any)?.path || nextJob.name;
      if (!path) {
        toast({
          title: "가공 시작 불가",
          description: "업로드 경로를 찾을 수 없습니다.",
          variant: "destructive",
        });
        return;
      }

      const ok = await ensureCncWriteAllowed();
      if (!ok) return;

      // 알람 상태 확인
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
        const alarmData = alarmBody?.data != null ? alarmBody.data : alarmBody;
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

      setPlayingNextMap((prev) => ({ ...prev, [uid]: true }));

      try {
        // 1) 큐 교체 (Next Up 단건)
        const replaceRes = await apiFetch({
          path: `/api/cnc-machines/${encodeURIComponent(uid)}/smart/replace`,
          method: "POST",
          token,
          jsonBody: { headType: 1, paths: [path] },
        });
        const replaceBody: any = replaceRes.data ?? {};
        if (!replaceRes.ok || replaceBody?.success === false) {
          throw new Error(
            replaceBody?.message || replaceBody?.error || "큐 교체 실패",
          );
        }

        // 2) 워커 시작
        const startRes = await apiFetch({
          path: `/api/cnc-machines/${encodeURIComponent(uid)}/smart/start`,
          method: "POST",
          token,
        });
        const startBody: any = startRes.data ?? {};
        if (startRes.status === 409) {
          throw new Error("큐가 비어 있습니다.");
        }
        if (!startRes.ok || startBody?.success === false) {
          throw new Error(
            startBody?.message || startBody?.error || "가공 시작 실패",
          );
        }

        // 이중 응답 처리
        const playJobId = startBody?.jobId;
        if (startRes.status === 202 && playJobId) {
          let jobCompleted = false;
          for (let i = 0; i < 30; i += 1) {
            try {
              const jobRes = await apiFetch({
                path: `/api/cnc-machines/${encodeURIComponent(uid)}/jobs/${encodeURIComponent(playJobId)}`,
                method: "GET",
                token,
              });
              const jobBody: any = jobRes.data ?? {};
              if (jobRes.ok && jobBody?.status === "COMPLETED") {
                jobCompleted = true;
                break;
              }
              if (jobRes.ok && jobBody?.status === "FAILED") {
                throw new Error(jobBody?.result?.message || "가공 시작 실패");
              }
            } catch (e: any) {
              if (i === 29) throw e;
            }
            await new Promise((r) => setTimeout(r, 500));
          }
          if (!jobCompleted) {
            throw new Error("가공 시작 결과 확인 타임아웃");
          }
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

  const handlePlayNowPlaying = useCallback(
    async (machineId: string) => {
      const uid = String(machineId || "").trim();
      if (!uid) return;

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

      const path =
        (nowJob as any)?.bridgePath || (nowJob as any)?.path || nowJob.name;
      if (!path) {
        toast({
          title: "가공 시작 불가",
          description: "업로드 경로를 찾을 수 없습니다.",
          variant: "destructive",
        });
        return;
      }

      const ok = await ensureCncWriteAllowed();
      if (!ok) return;

      // 알람 체크
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
        const alarmData = alarmBody?.data != null ? alarmBody.data : alarmBody;
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

      setNowPlayingMap((prev) => ({ ...prev, [uid]: true }));

      try {
        // 1) smart/replace로 현재 파일 큐 설정
        const replaceRes = await apiFetch({
          path: `/api/cnc-machines/${encodeURIComponent(uid)}/smart/replace`,
          method: "POST",
          token,
          jsonBody: { headType: 1, paths: [path] },
        });
        const replaceBody: any = replaceRes.data ?? {};
        if (!replaceRes.ok || replaceBody?.success === false) {
          throw new Error(
            replaceBody?.message || replaceBody?.error || "큐 교체 실패",
          );
        }

        // 2) smart/start로 가공 시작
        const startRes = await apiFetch({
          path: `/api/cnc-machines/${encodeURIComponent(uid)}/smart/start`,
          method: "POST",
          token,
        });
        const startBody: any = startRes.data ?? {};
        if (startRes.status === 409) {
          throw new Error("큐가 비어 있습니다.");
        }
        if (!startRes.ok || startBody?.success === false) {
          throw new Error(
            startBody?.message || startBody?.error || "가공 시작 실패",
          );
        }

        toast({
          title: "가공 시작",
          description: `${nowJob.name || path} 가공을 시작합니다.`,
        });

        // 3) WebSocket으로 가공 완료 알림 대기
        const jobId = startBody?.jobId;
        if (jobId) {
          // 백엔드가 폴링하고 완료 시 WebSocket으로 알림
          subscribeCncMachining(uid, jobId);

          // 완료 이벤트 리스너
          const unsubscribeCompleted = onCncMachiningCompleted((data) => {
            if (data.machineId === uid && data.jobId === jobId) {
              handleMachiningCompleted(uid);
              setMachiningElapsedSecondsMap((prev) => {
                const next = { ...prev };
                delete next[uid];
                return next;
              });
              unsubscribeCompleted();
              unsubscribeTimeout();
              unsubscribeCncMachining(uid, jobId);
            }
          });

          // 타임아웃 이벤트 리스너
          const unsubscribeTimeout = onCncMachiningTimeout((data) => {
            if (data.machineId === uid && data.jobId === jobId) {
              toast({
                title: "폴링 타임아웃",
                description: "20분 내 가공 완료를 확인하지 못했습니다.",
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
              unsubscribeCompleted();
              unsubscribeTimeout();
              unsubscribeCncMachining(uid, jobId);
            }
          });
        }
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

      // 3) 상태 갱신
      void refreshStatusFor(uid);
      void fetchProgramList();
    },
    [refreshStatusFor, fetchProgramList],
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
    uploadProgress,
    machiningElapsedSecondsMap,
    refreshDbQueuesForAllMachines,

    setReservationJobsMap,
    setReservationSummaryMap,
    setReservationTotalQtyMap,

    onTogglePause,
    handlePlayNextUp,
    handlePlayNowPlaying,
    playingNextMap,
    nowPlayingMap,
  };
}
